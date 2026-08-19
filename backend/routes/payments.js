import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import Participant from '../model/Participant.js';
import { requireParticipantAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import {
  TRIP_TOTAL_NAIRA,
  MIN_INITIAL_DEPOSIT_NGN,
  paystackInitializeTransaction,
  paystackVerifyTransaction,
  applyConfirmedPayment,
  findParticipantByPaymentReference
} from '../utils/utils_payments.js';

const router = express.Router();

// Modest per-IP ceiling on transaction creation — prevents a participant (or
// anyone with a stolen token) from hammering Paystack's API / flooding the
// participant's payments array with pending transactions. The global /api
// limiter in server.js still applies on top of this.
const initiateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please try again in a while.' }
});

// Generous enough to cover the dashboard's own background poll (every 45s,
// so ~80/hour if a tab is left open continuously) plus manual clicks on the
// "Check for Updates" button, without opening this up to abuse — it can
// only ever re-verify the caller's own references against Paystack.
const resyncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many status checks. Please try again shortly.' }
});

function remainingBalance(participant) {
  const paid = Number(participant.checkout?.amountPaid || 0);
  return Math.max(0, Math.round((TRIP_TOTAL_NAIRA - paid) * 100) / 100);
}

// ─── 1. Initiate a payment ───
// POST /api/payments/initiate  { amount: <naira, number> }
router.post('/initiate', requireParticipantAuth, requireCsrf, initiateLimiter, async (req, res) => {
  try {
    const participant = await Participant.findOne({ emailAddress: req.participantEmail });
    if (!participant) return res.status(404).json({ error: 'Participant record not found.' });

    const remaining = remainingBalance(participant);
    if (remaining <= 0) {
      return res.status(400).json({ error: 'This account is already fully paid.' });
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'A valid payment amount is required.' });
    }
    if (amount < 100) {
      return res.status(400).json({ error: 'Minimum payment amount is ₦100.' });
    }
    // Cap to what's actually owed — the client shouldn't be able to create a
    // Paystack transaction for more than the remaining balance.
    if (amount > remaining) {
      return res.status(400).json({ error: `Amount exceeds the remaining balance of ₦${remaining.toLocaleString()}.` });
    }
    // First payment (nothing successfully paid yet) must clear the minimum
    // initial deposit; every payment after that can be any amount up to the
    // remaining balance. Cap the requirement to what's actually owed, so a
    // near-fully-paid account (e.g. organizer manually logged a partial
    // payment just under the total) can still pay off the small remainder.
    const isFirstPayment = Number(participant.checkout?.amountPaid || 0) <= 0;
    const requiredMinimum = Math.min(MIN_INITIAL_DEPOSIT_NGN, remaining);
    if (isFirstPayment && amount < requiredMinimum) {
      return res.status(400).json({
        error: `Your first payment must be at least ₦${requiredMinimum.toLocaleString()}.`
      });
    }

    const reference = `AKW-${crypto.randomBytes(12).toString('hex')}`;
    const callbackUrl = process.env.PAYMENT_CALLBACK_URL;

    // Reserve the reference as a 'pending' record before calling out to
    // Paystack, so the webhook/verify path always has something to match
    // against even if the participant closes the tab mid-flow.
    await Participant.updateOne(
      { emailAddress: participant.emailAddress },
      {
        $push: {
          'checkout.payments': {
            reference,
            amount,
            status: 'pending',
            initiatedAt: new Date()
          }
        }
      }
    );

    try {
      const paystackData = await paystackInitializeTransaction({
        email: participant.emailAddress,
        amountNaira: amount,
        reference,
        callbackUrl: `${callbackUrl}?reference=${encodeURIComponent(reference)}`,
        metadata: { participantEmail: participant.emailAddress, purpose: 'AKWABA 001 trip payment' }
      });

      return res.status(200).json({
        success: true,
        authorizationUrl: paystackData.authorization_url,
        // Lets the frontend resume this transaction inline (Paystack popup)
        // instead of a full-page redirect — used during registration, where
        // navigating away mid-wizard would lose the user's place.
        accessCode: paystackData.access_code,
        reference
      });
    } catch (paystackError) {
      // Initialization failed on Paystack's side — mark our reserved record
      // as failed rather than leaving a dangling 'pending' entry.
      await Participant.updateOne(
        { emailAddress: participant.emailAddress, 'checkout.payments.reference': reference },
        { $set: { 'checkout.payments.$.status': 'failed' } }
      );
      throw paystackError;
    }
  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(502).json({ error: 'Could not start payment.', ...(isDev && { details: error.message }) });
  }
});

// ─── 2. Client-side verify (called after Paystack redirects back) ───
// POST /api/payments/verify/:reference
// This exists purely for fast UI feedback. The webhook (below) is the
// authoritative confirmation path; this endpoint is safe to call redundantly
// because applyConfirmedPayment() is idempotent per-reference.
// POST + CSRF (not GET) because this call has a real side effect
// (applyConfirmedPayment) gated only by the participant's auth cookie — a
// bare GET would let a cross-site <img>/<script> tag trigger it using a
// logged-in victim's cookies with no way to prove the request came from our
// own frontend. The CSRF double-submit token closes that off.
router.post('/verify/:reference', requireParticipantAuth, requireCsrf, async (req, res) => {
  try {
    const { reference } = req.params;

    // Ownership check — a participant may only verify their own reference.
    const participant = await Participant.findOne({
      emailAddress: req.participantEmail,
      'checkout.payments.reference': reference
    });
    if (!participant) return res.status(404).json({ error: 'Payment reference not found on this account.' });

    const record = participant.checkout.payments.find((p) => p.reference === reference);
    if (record.status === 'success') {
      return res.status(200).json({ success: true, alreadyConfirmed: true, participant: summarizeForSelf(participant) });
    }

    const verification = await paystackVerifyTransaction(reference);
    if (verification.status !== 'success') {
      return res.status(200).json({ success: false, status: verification.status });
    }

    const updated = await applyConfirmedPayment({
      reference,
      amountNaira: koboToNairaSafe(verification.amount),
      channel: verification.channel
    });

    const finalDoc = updated || (await Participant.findOne({ emailAddress: req.participantEmail }));
    res.status(200).json({ success: true, participant: summarizeForSelf(finalDoc) });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(502).json({ error: 'Could not verify payment.', ...(isDev && { details: error.message }) });
  }
});

// ─── 3. Resync — reconcile every still-pending payment against Paystack ───
// POST /api/payments/resync
// The webhook is the normal confirmation path, but it can fail silently (a
// transient error after Paystack's retry window, the endpoint being
// misconfigured on Paystack's side, etc.) — and a participant who paid via
// a redirect-away channel (bank transfer, USSD) may never land back on
// /dashboard?reference=... at all if they close the tab first. This gives
// every "pending" payment on the account a second, independent chance to be
// confirmed straight from Paystack's own record of it, not from a webhook
// or a specific redirect actually arriving. Safe to call as often as the
// rate limit allows — applyConfirmedPayment() is idempotent per-reference.
router.post('/resync', requireParticipantAuth, requireCsrf, resyncLimiter, async (req, res) => {
  try {
    const participant = await Participant.findOne({ emailAddress: req.participantEmail });
    if (!participant) return res.status(404).json({ error: 'Participant record not found.' });

    const pending = (participant.checkout?.payments || []).filter((p) => p.status === 'pending');
    let confirmedCount = 0;

    for (const p of pending) {
      try {
        const verification = await paystackVerifyTransaction(p.reference);
        if (verification.status === 'success') {
          await applyConfirmedPayment({
            reference: p.reference,
            amountNaira: koboToNairaSafe(verification.amount),
            channel: verification.channel
          });
          confirmedCount += 1;
        } else if (verification.status === 'failed' || verification.status === 'abandoned' || verification.status === 'reversed') {
          // Terminal, non-success outcome — stop re-checking it every poll.
          // Anything else (pending/ongoing/processing/queued) is left alone
          // to be picked up on a later resync.
          await Participant.updateOne(
            { emailAddress: participant.emailAddress, 'checkout.payments.reference': p.reference, 'checkout.payments.status': 'pending' },
            { $set: { 'checkout.payments.$.status': 'failed' } }
          );
        }
      } catch {
        // One reference failing to verify (e.g. a transient Paystack API
        // error) shouldn't stop the rest of the account's pending payments
        // from being checked.
      }
    }

    const finalDoc = await Participant.findOne({ emailAddress: req.participantEmail });
    res.status(200).json({ success: true, confirmedCount, participant: summarizeForSelf(finalDoc) });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(502).json({ error: 'Could not check payment status.', ...(isDev && { details: error.message }) });
  }
});

function koboToNairaSafe(kobo) {
  return Math.round(Number(kobo)) / 100;
}

function summarizeForSelf(participant) {
  const remaining = remainingBalance(participant);
  const amountPaid = participant.checkout?.amountPaid || 0;
  return {
    plan: participant.checkout?.plan,
    paymentStatus: participant.checkout?.paymentStatus,
    amountPaid,
    tripTotal: TRIP_TOTAL_NAIRA,
    remainingBalance: remaining,
    // Only relevant while nothing has been paid yet — frontend uses this to
    // set the minimum on the "amount to pay" field and explain the rule.
    minNextPayment: amountPaid <= 0 ? Math.min(MIN_INITIAL_DEPOSIT_NGN, remaining) : 100
  };
}

export default router;

// ─── 3. Paystack webhook ───
// Mounted directly in server.js on express.raw() BEFORE express.json(), so
// req.body here is the raw Buffer needed to verify the HMAC signature.
export async function paystackWebhook(req, res) {
  try {
    const signature = req.headers['x-paystack-signature'];
    if (!signature || !process.env.PAYSTACK_SECRET_KEY) {
      return res.status(401).end();
    }

    const expected = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(req.body) // raw Buffer
      .digest('hex');

    const signatureBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
      return res.status(401).end();
    }

    // Signature proves this came from Paystack. Acknowledge immediately —
    // Paystack retries aggressively on non-2xx/slow responses.
    res.status(200).end();

    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event !== 'charge.success') return;

    const reference = event.data?.reference;
    if (!reference) return;

    // Re-verify with Paystack's API rather than trusting the webhook payload
    // directly — confirms the transaction is genuinely settled and gives us
    // the authoritative amount/channel, not just what this event claims.
    const verification = await paystackVerifyTransaction(reference);
    if (verification.status !== 'success') return;

    const owner = await findParticipantByPaymentReference(reference);
    if (!owner) {
      req.log.error({ reference }, 'Paystack webhook: no participant found for reference');
      return;
    }

    await applyConfirmedPayment({
      reference,
      amountNaira: koboToNairaSafe(verification.amount),
      channel: verification.channel
    });
  } catch (error) {
    req.log.error({ err: error }, 'Paystack webhook processing error');
    // Response was already sent above; nothing further to do.
  }
}
