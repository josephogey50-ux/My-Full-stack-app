import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { TOKEN_COOKIE, ADMIN_COOKIE } from '../utils/cookies.js';

// ─── Participant auth: verifies the JWT set as an httpOnly cookie at login ───
// The token's `email` claim — never a client-supplied URL param — is
// what determines whose data a request can touch. Living in an httpOnly
// cookie (not localStorage/a bearer header) means a same-origin XSS can no
// longer just read it out of JS-accessible storage.
export function requireParticipantAuth(req, res, next) {
  const token = req.cookies?.[TOKEN_COOKIE];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.participantEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

// ─── Admin auth: verifies the short-lived session cookie issued by
// POST /api/admin/login, not the raw shared secret on every request ───
// Keeping the long-lived ADMIN_API_KEY out of the browser after that one
// login request limits what an XSS or a stolen cookie can do (a 12h session
// vs. the permanent shared secret itself).
export function requireAdmin(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE];

  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.scope !== 'admin') {
      return res.status(401).json({ error: 'Invalid admin session.' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your admin session has expired. Please log in again.' });
  }
}

// Used only by POST /api/admin/login itself, to check the raw shared secret
// before any admin session cookie exists yet.
export function verifyAdminSecret(providedKey) {
  const expected = process.env.ADMIN_API_KEY || '';
  // Fail closed: an unset secret must never mean "open to everyone".
  if (!expected) return false;

  const providedBuf = Buffer.from(String(providedKey || ''));
  const expectedBuf = Buffer.from(expected);

  return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
}
