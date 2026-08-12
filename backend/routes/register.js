import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import Participant from '../model/Participant.js';
import { requireParticipantAuth } from '../middleware/auth.js';
import { generateCsrfToken, requireCsrf } from '../middleware/csrf.js';
import { TOKEN_COOKIE, CSRF_COOKIE, authCookieOptions, csrfCookieOptions, clearCookieOptions } from '../utils/cookies.js';
import { sendResetPinEmail } from '../utils/mailer.js';
import {
  ALLOWED_DOC_TYPES,
  ALLOWED_ROOM_PREFS,
  ALLOWED_PLANS,
  isValidEmail,
  isValidPhone,
  isValidPin,
  isNonEmptyString,
  oneOf,
  safeContentDisposition,
  normalizePhone
} from '../utils/validators.js';
import { TRIP_TOTAL_NAIRA, MIN_INITIAL_DEPOSIT_NGN } from '../utils/utils_payments.js';

const router = express.Router();

const JWT_EXPIRY = '12h';
const JWT_EXPIRY_MS = 12 * 60 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

function issueToken(email) {
  return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function setAuthCookies(res, token, csrfToken) {
  res.cookie(TOKEN_COOKIE, token, authCookieOptions(JWT_EXPIRY_MS));
  res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(JWT_EXPIRY_MS));
}

function publicParticipant(p) {
  const amountPaid = p.checkout?.amountPaid || 0;
  const remainingBalance = Math.max(0, Math.round((TRIP_TOTAL_NAIRA - amountPaid) * 100) / 100);
  return {
    surname: p.surname,
    firstName: p.firstName,
    emailAddress: p.emailAddress,
    whatsAppNumber: p.whatsAppNumber,
    currentStep: p.currentStep,
    logistics: p.logistics,
    checkout: {
      plan: p.checkout?.plan,
      paymentStatus: p.checkout?.paymentStatus,
      amountPaid,
      tripTotal: TRIP_TOTAL_NAIRA,
      remainingBalance,
      // Mirrors the rule enforced server-side in /api/payments/initiate —
      // only relevant before any payment has landed. See utils_payments.js.
      minNextPayment: amountPaid <= 0 ? Math.min(MIN_INITIAL_DEPOSIT_NGN, remainingBalance) : 100,
      hasReceipt: !!p.checkout?.receipt?.contentType,
      receiptUploadedAt: p.checkout?.receipt?.uploadedAt || null
    }
  };
}

// ─── Login: rate-limited at the IP level, lockout at the account level ───
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // generic anti-abuse ceiling per IP; account lockout below is the real defense
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please try again shortly.' }
});

// ─── Bot protection for account creation (step 1 only) ───
// Two lightweight, no-external-service heuristics layered on top of the rate
// limiter below. Neither is a hard security boundary on its own — a
// determined attacker can fake both — but together they price out the
// unsophisticated scripted-signup bots that are the realistic threat here.
//
// 1. Honeypot: `company_website` is a text input the frontend positions
//    off-screen and marks aria-hidden/tabIndex=-1. Real users never see or
//    fill it; simple bots that blindly fill every field in a scraped form do.
// 2. Timing: `elapsedMs` is computed entirely client-side (Date.now() at
//    submit minus Date.now() at form mount) so there's no client/server
//    clock-skew concern — a submission claiming a human filled out four
//    fields and a PIN in under a second is almost certainly scripted.
const MIN_FORM_FILL_MS = 2000;

function looksLikeBot(incomingData) {
  if (isNonEmptyString(incomingData.company_website)) return true;
  const elapsed = Number(incomingData.elapsedMs);
  if (Number.isFinite(elapsed) && elapsed < MIN_FORM_FILL_MS) return true;
  return false;
}

// Tighter than the global /api ceiling (300/15min) — account creation
// specifically is the expensive-to-clean-up action, so it gets its own
// stricter per-IP limit on top.
const registerStepLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts from this network. Please try again later.' }
});

// ─── 1. REGISTRATION STEP ROUTE ───
router.post('/register/step', registerStepLimiter, async (req, res) => {
  const { step, emailAddress, ...incomingData } = req.body;

  const currentStepNum = parseInt(step, 10);
  if (!step || isNaN(currentStepNum) || currentStepNum < 1 || currentStepNum > 3) {
    return res.status(400).json({ error: 'Valid step number is required.' });
  }

  if (!isValidEmail(emailAddress)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  const normalizedEmail = emailAddress.toLowerCase().trim();

  try {
    // ── STEP 1 — Profile Creation ──
    if (currentStepNum === 1) {
      if (looksLikeBot(incomingData)) {
        // Generic validation-shaped error — doesn't tip off a bot that it
        // was specifically caught by the honeypot/timing check.
        return res.status(400).json({ error: 'Could not process this submission. Please try again.' });
      }
      if (!isNonEmptyString(incomingData.surname) || !isNonEmptyString(incomingData.firstName)) {
        return res.status(400).json({ error: 'Surname and first name are required.' });
      }
      if (!isValidPhone(incomingData.whatsAppNumber)) {
        return res.status(400).json({ error: 'A valid WhatsApp number is required.' });
      }
      if (!isValidPin(incomingData.accountPin)) {
        return res.status(400).json({ error: 'A 4-digit PIN is required.' });
      }

      const normalizedPhone = normalizePhone(incomingData.whatsAppNumber);

      const existingUser = await Participant.findOne({
        $or: [{ emailAddress: normalizedEmail }, { whatsAppNumber: normalizedPhone }]
      });
      if (existingUser) {
        const field = existingUser.emailAddress === normalizedEmail ? 'email address' : 'WhatsApp number';
        return res.status(409).json({ error: `An account with this ${field} already exists.` });
      }

      const hashedPin = await bcrypt.hash(incomingData.accountPin.trim(), 12);

      const newParticipant = new Participant({
        surname: incomingData.surname.trim(),
        firstName: incomingData.firstName.trim(),
        emailAddress: normalizedEmail,
        whatsAppNumber: normalizedPhone,
        accountPin: hashedPin,
        currentStep: 2
      });

      await newParticipant.save();
      return res.status(201).json({ message: 'Profile created!', nextStep: 2 });
    }

    // Steps 2 & 3 act on an existing participant
    const participant = await Participant.findOne({ emailAddress: normalizedEmail });
    if (!participant) {
      return res.status(404).json({ error: 'Session not found. Please restart from Step 1.' });
    }
    if (participant.currentStep < currentStepNum) {
      return res.status(400).json({ error: `Please complete Step ${participant.currentStep} first.` });
    }

    let updatePayload = {};

    // ── STEP 2 — Logistics ──
    if (currentStepNum === 2) {
      const docType = incomingData.docType || 'International Passport';
      const roomPreference = incomingData.roomPreference || 'match';

      if (!oneOf(docType, ALLOWED_DOC_TYPES)) {
        return res.status(400).json({ error: 'Invalid travel document type.' });
      }
      if (!oneOf(roomPreference, ALLOWED_ROOM_PREFS)) {
        return res.status(400).json({ error: 'Invalid room preference.' });
      }
      if (roomPreference === 'paired' && !isNonEmptyString(incomingData.roommateName)) {
        return res.status(400).json({ error: "Roommate's full name is required for paired rooming." });
      }
      if (!isNonEmptyString(incomingData.emergencyContact)) {
        return res.status(400).json({ error: 'An emergency contact is required.' });
      }

      updatePayload = {
        $set: {
          'logistics.docType': docType,
          'logistics.roomPreference': roomPreference,
          'logistics.roommateName': roomPreference === 'paired' ? incomingData.roommateName.trim() : '',
          'logistics.emergencyContact': incomingData.emergencyContact.trim(),
          currentStep: 3
        }
      };
    }

    // ── STEP 3 — Checkout ──
    // Payment itself happens later, through Paystack from the dashboard after
    // login — this step just records the chosen plan. No manual bank
    // transfer or receipt upload is collected here.
    else if (currentStepNum === 3) {
      const plan = incomingData.plan || 'Full Payment';
      if (!oneOf(plan, ALLOWED_PLANS)) {
        return res.status(400).json({ error: 'Invalid payment plan.' });
      }

      updatePayload = {
        $set: {
          'checkout.plan': plan,
          currentStep: 4
        }
      };
    }

    const updatedParticipant = await Participant.findOneAndUpdate(
      { emailAddress: normalizedEmail },
      updatePayload,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: `Step ${currentStepNum} saved.`,
      nextStep: updatedParticipant.currentStep
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An account with this email or WhatsApp number already exists.' });
    }
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal Server Error', ...(isDev && { details: error.message }) });
  }
});

// ─── 2. AUTHENTICATION / LOGIN ───
router.post('/login', loginLimiter, async (req, res) => {
  const { loginPhone, loginPin } = req.body;

  if (!isValidPhone(loginPhone) || !isValidPin(loginPin)) {
    return res.status(400).json({ error: 'A valid phone number and 4-digit PIN are required.' });
  }

  const normalizedLoginPhone = normalizePhone(loginPhone);

  try {
    const participant = await Participant.findOne({ whatsAppNumber: normalizedLoginPhone });

    // Same generic error whether the number doesn't exist or the PIN is wrong —
    // don't let the response shape reveal which one it was.
    const genericError = { error: 'Invalid phone number or PIN.' };
    if (!participant) return res.status(401).json(genericError);

    if (participant.isLocked()) {
      const minutesLeft = Math.ceil((participant.security.lockUntil - Date.now()) / 60000);
      return res.status(429).json({ error: `Too many attempts. Try again in ${minutesLeft} minute(s).` });
    }

    const isMatch = await bcrypt.compare(loginPin.trim(), participant.accountPin);

    if (!isMatch) {
      // ── Atomic increment via aggregation-pipeline update ──
      // The previous code read failedLoginAttempts into a JS variable,
      // incremented it in memory, and wrote the whole document back with
      // .save(). Two concurrent requests both read the same pre-increment
      // value and each independently wrote back current+1, so the counter
      // lost updates under any parallel traffic (effectively +1 per burst
      // instead of accumulating), making the 5-attempt lockout bypassable.
      //
      // A pipeline update is evaluated and applied by MongoDB as a single
      // atomic per-document operation — concurrent requests are serialized
      // by the database itself, so every failed attempt is counted exactly
      // once no matter how many requests arrive in parallel.
      await Participant.updateOne(
        { whatsAppNumber: normalizedLoginPhone },
        [
          {
            $set: {
              'security.failedLoginAttempts': {
                $cond: [
                  { $gte: [{ $add: ['$security.failedLoginAttempts', 1] }, LOCKOUT_THRESHOLD] },
                  0,
                  { $add: ['$security.failedLoginAttempts', 1] }
                ]
              },
              'security.lockUntil': {
                $cond: [
                  { $gte: [{ $add: ['$security.failedLoginAttempts', 1] }, LOCKOUT_THRESHOLD] },
                  new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
                  '$security.lockUntil'
                ]
              }
            }
          }
        ]
      );
      return res.status(401).json(genericError);
    }

    // Reset on success. A plain $set here is already a single atomic write,
    // so no read-modify-write race applies on this path.
    await Participant.updateOne(
      { whatsAppNumber: normalizedLoginPhone },
      { $set: { 'security.failedLoginAttempts': 0, 'security.lockUntil': null } }
    );

    const token = issueToken(participant.emailAddress);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, token, csrfToken);

    res.status(200).json({
      message: 'Login successful!',
      participant: publicParticipant(participant),
      csrfToken
    });

  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal Server Error', ...(isDev && { details: error.message }) });
  }
});

// ─── 3. LOGOUT ───
router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE, clearCookieOptions());
  res.clearCookie(CSRF_COOKIE, clearCookieOptions());
  res.status(200).json({ success: true });
});

// ─── Forgot / Reset PIN ───
// Reuses the trusted frontend origin already required for CORS (the first
// entry if several are configured) rather than introducing a second env var
// that could drift from it.
const FRONTEND_URL = (process.env.ALLOWED_ORIGINS || '').split(',')[0]?.trim();
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Loose per-IP ceiling — mainly to stop this endpoint being used to spam an
// arbitrary inbox with reset emails, not to defend the token itself (that's
// a 32-byte random value; guessing it isn't feasible at any request rate).
const forgotPinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset requests. Please try again later.' }
});

router.post('/forgot-pin', forgotPinLimiter, async (req, res) => {
  const { emailAddress } = req.body;
  if (!isValidEmail(emailAddress)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  // Always return the same generic response whether or not the email is on
  // file — otherwise this endpoint becomes a way to check which emails are
  // registered.
  const genericResponse = { message: 'If that email is registered, a reset link has been sent.' };

  try {
    const token = crypto.randomBytes(32).toString('hex');
    // Single atomic write, same as the login-lockout counter above — no
    // separate read-then-save() round trip for another request to race.
    const participant = await Participant.findOneAndUpdate(
      { emailAddress: emailAddress.toLowerCase().trim() },
      {
        $set: {
          'passwordReset.tokenHash': hashResetToken(token),
          'passwordReset.expiresAt': new Date(Date.now() + RESET_TOKEN_TTL_MS)
        }
      }
    );
    if (participant) {
      const resetUrl = `${FRONTEND_URL}/reset-pin?token=${token}`;
      try {
        await sendResetPinEmail(participant.emailAddress, resetUrl);
      } catch (mailError) {
        // Don't let a mail-provider failure change the response shape (that
        // would leak whether the email exists) — just log it so the
        // organizer can see delivery is broken.
        req.log.error({ err: mailError }, 'Failed to send reset-PIN email');
      }
    }
    res.status(200).json(genericResponse);
  } catch (error) {
    req.log.error({ err: error }, 'forgot-pin failed');
    res.status(200).json(genericResponse);
  }
});

router.post('/reset-pin', async (req, res) => {
  const { token, newPin } = req.body;
  if (!isNonEmptyString(token)) {
    return res.status(400).json({ error: 'Reset token is required.' });
  }
  if (!isValidPin(newPin)) {
    return res.status(400).json({ error: 'A 4-digit PIN is required.' });
  }

  try {
    const hashedPin = await bcrypt.hash(newPin.trim(), 12);

    // Single atomic find-and-update: the token match is the filter itself,
    // so a reused/already-consumed token (tokenHash just got nulled out by
    // this same query) can't match twice — no separate check-then-clear
    // race window.
    const participant = await Participant.findOneAndUpdate(
      {
        'passwordReset.tokenHash': hashResetToken(token),
        'passwordReset.expiresAt': { $gt: new Date() }
      },
      {
        $set: {
          accountPin: hashedPin,
          'passwordReset.tokenHash': null,
          'passwordReset.expiresAt': null,
          // A forgotten PIN often follows a string of failed login attempts —
          // clear the lockout too so the new PIN isn't immediately unusable.
          'security.failedLoginAttempts': 0,
          'security.lockUntil': null
        }
      }
    );
    if (!participant) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    res.status(200).json({ message: 'Your PIN has been reset. You can now log in.' });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal Server Error', ...(isDev && { details: error.message }) });
  }
});

// ─── 4. OWN PROFILE (auth required) ───
router.get('/participant/me', requireParticipantAuth, async (req, res) => {
  try {
    const participant = await Participant.findOne({ emailAddress: req.participantEmail });
    if (!participant) return res.status(404).json({ error: 'Participant record not found.' });

    // The CSRF cookie itself travels with this request automatically (it's
    // just not httpOnly), but cross-site frontend JS can't read it off
    // document.cookie — the cookie belongs to the backend's origin, not the
    // page's. Handing it back here lets the client cache it in memory instead.
    res.status(200).json({
      success: true,
      participant: publicParticipant(participant),
      csrfToken: req.cookies[CSRF_COOKIE]
    });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal Server Error', ...(isDev && { details: error.message }) });
  }
});

// ─── 5. OWN RECEIPT ───
router.get('/participant/me/receipt', requireParticipantAuth, async (req, res) => {
  try {
    const participant = await Participant.findOne({ emailAddress: req.participantEmail }).select('+checkout.receipt.data');
    const receipt = participant?.checkout?.receipt;
    if (!receipt || !receipt.data) return res.status(404).json({ error: 'No receipt on file.' });

    res.set('Content-Type', receipt.contentType);
    res.set('Content-Disposition', safeContentDisposition(receipt.filename));
    res.send(receipt.data);
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve receipt.' });
  }
});

// ─── 6. CHANGE OWN PIN (auth required) ───
// Separate from /forgot-pin: this is for a participant who's currently
// logged in and simply wants to set a new PIN, without going through email.
const changePinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many PIN change attempts. Please try again later.' }
});

router.post('/participant/me/change-pin', requireParticipantAuth, requireCsrf, changePinLimiter, async (req, res) => {
  const { currentPin, newPin } = req.body;
  if (!isValidPin(currentPin) || !isValidPin(newPin)) {
    return res.status(400).json({ error: 'Both your current PIN and a new 4-digit PIN are required.' });
  }

  try {
    const participant = await Participant.findOne({ emailAddress: req.participantEmail });
    if (!participant) return res.status(404).json({ error: 'Participant record not found.' });

    const isMatch = await bcrypt.compare(currentPin.trim(), participant.accountPin);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current PIN is incorrect.' });
    }

    participant.accountPin = await bcrypt.hash(newPin.trim(), 12);
    await participant.save();

    res.status(200).json({ message: 'Your PIN has been updated.' });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal Server Error', ...(isDev && { details: error.message }) });
  }
});

// ─── 7. EDIT OWN LOGISTICS (auth required) ───
// Lets a registered participant self-service-correct their travel logistics
// (document type, room preference/roommate, emergency contact) after
// completing Step 2, instead of needing the organizer to edit it for them.
// Identity fields (name/email/WhatsApp) are intentionally not editable here.
router.patch('/participant/me/logistics', requireParticipantAuth, requireCsrf, async (req, res) => {
  const { docType, roomPreference, roommateName, emergencyContact } = req.body;

  if (!oneOf(docType, ALLOWED_DOC_TYPES)) {
    return res.status(400).json({ error: 'Invalid travel document type.' });
  }
  if (!oneOf(roomPreference, ALLOWED_ROOM_PREFS)) {
    return res.status(400).json({ error: 'Invalid room preference.' });
  }
  if (roomPreference === 'paired' && !isNonEmptyString(roommateName)) {
    return res.status(400).json({ error: "Roommate's full name is required for paired rooming." });
  }
  if (!isNonEmptyString(emergencyContact)) {
    return res.status(400).json({ error: 'An emergency contact is required.' });
  }

  try {
    const participant = await Participant.findOneAndUpdate(
      { emailAddress: req.participantEmail },
      {
        $set: {
          'logistics.docType': docType,
          'logistics.roomPreference': roomPreference,
          'logistics.roommateName': roomPreference === 'paired' ? roommateName.trim() : '',
          'logistics.emergencyContact': emergencyContact.trim()
        }
      },
      { new: true, runValidators: true }
    );
    if (!participant) return res.status(404).json({ error: 'Participant record not found.' });

    res.status(200).json({ message: 'Your details have been updated.', participant: publicParticipant(participant) });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal Server Error', ...(isDev && { details: error.message }) });
  }
});

export default router;