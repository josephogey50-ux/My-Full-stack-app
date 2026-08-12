// ─── Shared cookie config for auth ───
// Frontend and backend are deployed on different domains (Vercel/whatever
// vs. Render), so these are cross-site cookies: that requires
// SameSite=None + Secure, which in turn requires HTTPS. In local dev the
// frontend and backend share the same site (localhost, just different
// ports), so SameSite=Lax + non-Secure works over plain http.
const isProd = process.env.NODE_ENV === 'production';

export const TOKEN_COOKIE = 'akwaba_token';   // participant JWT — httpOnly
export const ADMIN_COOKIE = 'akwaba_admin';   // admin session JWT — httpOnly
export const CSRF_COOKIE = 'akwaba_csrf';     // double-submit token — readable by JS on purpose

export function authCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs
  };
}

// Not httpOnly: the frontend has to read this value to echo it back as the
// x-csrf-token header (double-submit pattern) — that's what makes it work.
export function csrfCookieOptions(maxAgeMs) {
  return {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs
  };
}

// res.clearCookie() only actually clears the cookie if these attributes
// match the ones it was set with (maxAge/expires aside).
export function clearCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/'
  };
}
