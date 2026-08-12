import crypto from 'crypto';
import { CSRF_COOKIE } from '../utils/cookies.js';

export function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ─── Double-submit cookie CSRF check ───
// Now that auth lives in httpOnly cookies, a cross-site page can make the
// browser attach those cookies to a forged request automatically — that's
// exactly what CSRF is. The CSRF_COOKIE is deliberately NOT httpOnly, so
// only JS running on our own origin (same-origin policy) can read its value
// and put it in the x-csrf-token header. A forged cross-site request can
// make the browser send the cookie, but has no way to read it, so it can
// never produce a matching header.
export function requireCsrf(req, res, next) {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'Missing CSRF token.' });
  }

  const cookieBuf = Buffer.from(String(cookieToken));
  const headerBuf = Buffer.from(String(headerToken));
  const isMatch = cookieBuf.length === headerBuf.length && crypto.timingSafeEqual(cookieBuf, headerBuf);

  if (!isMatch) {
    return res.status(403).json({ error: 'Invalid CSRF token.' });
  }
  next();
}
