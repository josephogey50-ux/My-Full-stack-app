import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import Participant from '../model/Participant.js';
import AuditLog from '../model/AuditLog.js';
import { requireAdmin, verifyAdminSecret } from '../middleware/auth.js';
import { generateCsrfToken, requireCsrf } from '../middleware/csrf.js';
import { ADMIN_COOKIE, CSRF_COOKIE, authCookieOptions, csrfCookieOptions, clearCookieOptions } from '../utils/cookies.js';
import { oneOf, isNonEmptyString, buildSafeSearchRegex, MAX_SEARCH_QUERY_LENGTH, safeContentDisposition } from '../utils/validators.js';

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
//
// Every organizer still shares the one ADMIN_API_KEY (there's no per-admin
// account system), but login now also requires a display name. That name
// rides along in the session JWT and gets attached to every money-affecting
// action in the audit log below — so "who changed this payment" has an
// answer even though everyone authenticates with the same secret.
router.post('/login', adminLoginLimiter, (req, res) => {
  const { adminKey, adminName } = req.body;
  if (!verifyAdminSecret(adminKey)) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }
  if (!isNonEmptyString(adminName)) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  const name = adminName.trim().slice(0, 80);
  const session = jwt.sign({ scope: 'admin', name }, process.env.JWT_SECRET, { expiresIn: ADMIN_SESSION_EXPIRY });
  const csrfToken = generateCsrfToken();
  res.cookie(ADMIN_COOKIE, session, authCookieOptions(ADMIN_SESSION_MS));
  res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(ADMIN_SESSION_MS));
  res.status(200).json({ success: true, csrfToken, adminName: name });
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
    // Same cross-site rationale as participant/me: hand the CSRF cookie's
    // value back in the body so the frontend can cache it, since it can't
    // read the cookie itself off document.cookie on a different origin.
    res.status(200).json({ success: true, total, byStep, byStatus, csrfToken: req.cookies[CSRF_COOKIE] });
  } catch (error) {
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// ─── CSV export of registrants — honors the same filters as GET /registrants ───
// GET /api/admin/registrants/export?q=&status=&step=
// Registered BEFORE /registrants/:email below — Express matches routes in
// registration order, so "export" would otherwise be captured as an :email
// param and this route would never be reached.
// For the organizer's own logistics use (accommodation lists, manifests) —
// no pagination, capped at 5,000 rows as a sanity ceiling.
const CSV_EXPORT_MAX_ROWS = 5000;
const CSV_COLUMNS = [
  'firstName', 'surname', 'emailAddress', 'whatsAppNumber', 'currentStep',
  'docType', 'roomPreference', 'roommateName', 'plan', 'paymentStatus',
  'amountPaid', 'hasReceipt', 'registeredAt'
];

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

router.get('/registrants/export', async (req, res) => {
  try {
    const { q, status, step } = req.query;
    const filter = {};
    if (status) filter['checkout.paymentStatus'] = status;
    if (step) filter.currentStep = parseInt(step, 10);
    if (q) {
      if (String(q).trim().length > MAX_SEARCH_QUERY_LENGTH) {
        return res.status(400).json({ error: `Search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer.` });
      }
      const re = buildSafeSearchRegex(q);
      if (re) {
        filter.$or = [{ surname: re }, { firstName: re }, { emailAddress: re }, { whatsAppNumber: re }];
      }
    }

    const participants = await Participant.find(filter)
      .sort({ createdAt: -1 })
      .limit(CSV_EXPORT_MAX_ROWS)
      .lean();

    const rows = participants.map(summarize);
    const lines = [
      CSV_COLUMNS.join(','),
      ...rows.map((r) => CSV_COLUMNS.map((col) => csvEscape(r[col])).join(','))
    ];

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="akwaba-registrants-${Date.now()}.csv"`);
    res.send(lines.join('\r\n'));
  } catch (error) {
    res.status(500).json({ error: 'Could not export registrants.' });
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

    const targetEmail = req.params.email.toLowerCase().trim();
    const before = await Participant.findOne({ emailAddress: targetEmail });
    if (!before) return res.status(404).json({ error: 'Registrant not found.' });

    const update = {};
    if (paymentStatus !== undefined) update['checkout.paymentStatus'] = paymentStatus;
    if (amountPaid !== undefined) update['checkout.amountPaid'] = Number(amountPaid);

    const participant = await Participant.findOneAndUpdate(
      { emailAddress: targetEmail },
      { $set: update },
      { new: true, runValidators: true }
    );

    // Best-effort — a logging failure shouldn't roll back or block a payment
    // update the organizer already made.
    AuditLog.create({
      adminName: req.adminName,
      action: 'update_payment',
      targetEmail,
      before: { paymentStatus: before.checkout?.paymentStatus, amountPaid: before.checkout?.amountPaid },
      after: { paymentStatus: participant.checkout?.paymentStatus, amountPaid: participant.checkout?.amountPaid }
    }).catch((err) => req.log.error({ err }, 'Failed to write audit log entry'));

    res.status(200).json({ success: true, registrant: summarize(participant) });
  } catch (error) {
    res.status(500).json({ error: 'Could not update payment.' });
  }
});

// ─── Audit trail — recent admin actions, newest first ───
// GET /api/admin/audit-log?page=1&limit=25
router.get('/audit-log', async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const [total, entries] = await Promise.all([
      AuditLog.countDocuments({}),
      AuditLog.find({})
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean()
    ]);

    res.status(200).json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      entries
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not load audit log.' });
  }
});

export default router;
