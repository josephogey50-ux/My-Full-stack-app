import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import Participant from '../model/Participant.js';
import { requireAdmin, verifyAdminSecret } from '../middleware/auth.js';
import { generateCsrfToken, requireCsrf } from '../middleware/csrf.js';
import { ADMIN_COOKIE, CSRF_COOKIE, authCookieOptions, csrfCookieOptions, clearCookieOptions } from '../utils/cookies.js';
import { oneOf, buildSafeSearchRegex, MAX_SEARCH_QUERY_LENGTH, safeContentDisposition } from '../utils/validators.js';

const router = express.Router();

const ADMIN_SESSION_EXPIRY = '12h';
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

// Guessing the shared secret is now a POST here instead of a header on every
// request — rate-limit attempts the same way participant login is limited.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts. Please try again shortly.' }
});

// ─── Admin login: exchanges the long-lived shared secret for a short-lived,
// httpOnly session cookie ───
// The raw ADMIN_API_KEY now only ever touches the browser for this one
// request — every subsequent admin request re-uses the 12h session instead
// of resending (or storing client-side) the permanent secret itself.
router.post('/login', adminLoginLimiter, (req, res) => {
  const { adminKey } = req.body;
  if (!verifyAdminSecret(adminKey)) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }
  const session = jwt.sign({ scope: 'admin' }, process.env.JWT_SECRET, { expiresIn: ADMIN_SESSION_EXPIRY });
  res.cookie(ADMIN_COOKIE, session, authCookieOptions(ADMIN_SESSION_MS));
  res.cookie(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(ADMIN_SESSION_MS));
  res.status(200).json({ success: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE, clearCookieOptions());
  res.clearCookie(CSRF_COOKIE, clearCookieOptions());
  res.status(200).json({ success: true });
});

router.use(requireAdmin);

const PAYMENT_STATUSES = ['Pending', 'Paid', 'Partial', 'Refunded'];

function summarize(p) {
  return {
    emailAddress: p.emailAddress,
    surname: p.surname,
    firstName: p.firstName,
    whatsAppNumber: p.whatsAppNumber,
    currentStep: p.currentStep,
    docType: p.logistics?.docType,
    roomPreference: p.logistics?.roomPreference,
    roommateName: p.logistics?.roommateName,
    plan: p.checkout?.plan,
    paymentStatus: p.checkout?.paymentStatus,
    amountPaid: p.checkout?.amountPaid,
    hasReceipt: !!p.checkout?.receipt?.contentType,
    registeredAt: p.createdAt
  };
}

// ─── List registrants — search + filter + paginate ───
// GET /api/admin/registrants?q=&status=&step=&page=1&limit=25
router.get('/registrants', async (req, res) => {
  try {
    const { q, status, step, page = 1, limit = 25 } = req.query;
    const filter = {};

    if (status) filter['checkout.paymentStatus'] = status;
    if (step) filter.currentStep = parseInt(step, 10);
    if (q) {
      if (String(q).trim().length > MAX_SEARCH_QUERY_LENGTH) {
        return res.status(400).json({ error: `Search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer.` });
      }
      // Input is escaped before it ever reaches RegExp — user-supplied regex
      // metacharacters are treated as literal text, never as regex syntax.
      // This closes both the ReDoS vector (catastrophic backtracking from an
      // attacker-crafted pattern) and prevents the query from behaving
      // differently than a plain substring search.
      const re = buildSafeSearchRegex(q);
      if (re) {
        filter.$or = [{ surname: re }, { firstName: re }, { emailAddress: re }, { whatsAppNumber: re }];
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const [total, participants] = await Promise.all([
      Participant.countDocuments(filter),
      Participant.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
    ]);

    res.status(200).json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      registrants: participants.map(summarize)
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not load registrants.' });
  }
});

// ─── Trip-wide stats for the organizer dashboard ───
router.get('/stats', async (req, res) => {
  try {
    const [total, byStep, byStatus] = await Promise.all([
      Participant.countDocuments({}),
      Participant.aggregate([{ $group: { _id: '$currentStep', count: { $sum: 1 } } }]),
      Participant.aggregate([{ $group: { _id: '$checkout.paymentStatus', count: { $sum: 1 } } }])
    ]);
    res.status(200).json({ success: true, total, byStep, byStatus });
  } catch (error) {
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// ─── Single registrant, full detail ───
router.get('/registrants/:email', async (req, res) => {
  try {
    const participant = await Participant.findOne({ emailAddress: req.params.email.toLowerCase().trim() });
    if (!participant) return res.status(404).json({ error: 'Registrant not found.' });
    res.status(200).json({ success: true, registrant: summarize(participant) });
  } catch (error) {
    res.status(500).json({ error: 'Could not load registrant.' });
  }
});

// ─── Stream a registrant's uploaded receipt ───
router.get('/registrants/:email/receipt', async (req, res) => {
  try {
    const participant = await Participant.findOne({ emailAddress: req.params.email.toLowerCase().trim() })
      .select('+checkout.receipt.data');
    const receipt = participant?.checkout?.receipt;
    if (!receipt || !receipt.data) return res.status(404).json({ error: 'No receipt on file.' });

    res.set('Content-Type', receipt.contentType);
    res.set('Content-Disposition', safeContentDisposition(receipt.filename));
    res.send(receipt.data);
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve receipt.' });
  }
});

// ─── Organizer confirms/updates a payment ───
router.patch('/registrants/:email/payment', requireCsrf, async (req, res) => {
  try {
    const { paymentStatus, amountPaid } = req.body;

    if (paymentStatus !== undefined && !oneOf(paymentStatus, PAYMENT_STATUSES)) {
      return res.status(400).json({ error: `paymentStatus must be one of: ${PAYMENT_STATUSES.join(', ')}` });
    }
    if (amountPaid !== undefined && (isNaN(Number(amountPaid)) || Number(amountPaid) < 0)) {
      return res.status(400).json({ error: 'amountPaid must be a non-negative number.' });
    }

    const update = {};
    if (paymentStatus !== undefined) update['checkout.paymentStatus'] = paymentStatus;
    if (amountPaid !== undefined) update['checkout.amountPaid'] = Number(amountPaid);

    const participant = await Participant.findOneAndUpdate(
      { emailAddress: req.params.email.toLowerCase().trim() },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!participant) return res.status(404).json({ error: 'Registrant not found.' });

    res.status(200).json({ success: true, registrant: summarize(participant) });
  } catch (error) {
    res.status(500).json({ error: 'Could not update payment.' });
  }
});

export default router;
