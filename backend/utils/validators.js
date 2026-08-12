// ─── Shared validation helpers + allow-lists ───
// Single source of truth for both routes/register.js and routes/admin.js,
// and mirrors the option values used in the frontend HTML/JS so client
// and server never drift apart.

export const ALLOWED_DOC_TYPES = ['International Passport', 'ECOWAS Passport', 'NIN'];
export const ALLOWED_ROOM_PREFS = ['match', 'paired'];
export const ALLOWED_PLANS = ['Full Payment', 'Installment Plan'];
export const ALLOWED_RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5MB — matches frontend copy/validation

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts +234..., 0..., or plain digit strings of reasonable length.
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const PIN_RE = /^[0-9]{4}$/;

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

export function isValidPhone(value) {
  return typeof value === 'string' && PHONE_RE.test(value.trim());
}

// ─── Canonicalize phone numbers to E.164 before storing/matching ───
// Registrants type their number differently at registration vs. login
// ("+2348012345678" vs "08012345678"), which previously stored/matched the
// raw string and made login fail with a generic "invalid phone or PIN" for
// a perfectly correct number. Assumes Nigeria (+234) when no country code
// is present, since that's this app's only market (Naira pricing throughout).
const DEFAULT_COUNTRY_CODE = '234';

export function normalizePhone(value) {
  if (typeof value !== 'string') return '';
  const hasPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('0')) return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return `+${digits}`;
  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}

export function isValidPin(value) {
  return typeof value === 'string' && PIN_RE.test(value.trim());
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function oneOf(value, allowedList) {
  return allowedList.includes(value);
}

// ─── Safe substring search helper ───
// Escapes regex metacharacters so user input is always treated as a literal
// string, never as attacker-controlled regex syntax (ReDoS via catastrophic
// backtracking, e.g. `(a+)+`, is the concrete risk this closes off).
const REGEX_METACHAR_RE = /[.*+?^${}()|[\]\\]/g;
export const MAX_SEARCH_QUERY_LENGTH = 100;

export function escapeRegExp(value) {
  return String(value).replace(REGEX_METACHAR_RE, '\\$&');
}

// Builds a case-insensitive "contains" RegExp from raw user input, safe to
// use directly in a Mongo query. Returns null for empty/oversized input so
// callers can skip adding a filter clause instead of matching everything.
export function buildSafeSearchRegex(rawInput) {
  if (typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.length > MAX_SEARCH_QUERY_LENGTH) return null;
  return new RegExp(escapeRegExp(trimmed), 'i');
}

// ─── Safe Content-Disposition header for user-supplied filenames ───
// receipt.filename comes straight from the upload's original filename, which
// the browser/attacker fully controls. Building the header with a naive
// template string lets a `"` or CR/LF in that name break out of the quoted
// attribute (header injection / response splitting). RFC 6266 fixes this
// with two params: a quoted-string ASCII fallback (control chars, quotes,
// and backslashes stripped/escaped) plus an RFC 5987 filename* for full
// Unicode fidelity in browsers that support it.
export function safeContentDisposition(filename, disposition = 'inline') {
  const raw = typeof filename === 'string' && filename.trim() ? filename.trim() : 'file';
  // Strip CR/LF/control chars outright, escape backslash and quote for the
  // quoted-string form, and fall back to non-ASCII-safe placeholder chars.
  const asciiFallback = raw
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\\"]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_') || 'file';
  const encoded = encodeURIComponent(raw.replace(/[\x00-\x1F\x7F]/g, ''));
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
