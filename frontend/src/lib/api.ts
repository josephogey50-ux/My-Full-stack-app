// ─────────────────────────────────────────────────────────────────────────
// AKWABA 001 API client
//
// This is a 1:1 mapping to the existing Express backend (routes/register.js,
// routes/payments.js, routes/admin.js). Auth lives in httpOnly cookies set
// by the backend (participant JWT / admin session), not a bearer token this
// client holds — every call below sends `credentials: 'include'` so the
// browser attaches them, and mutating calls attach the CSRF header read
// from the (deliberately non-httpOnly) CSRF cookie.
// ─────────────────────────────────────────────────────────────────────────

// VITE_API_BASE lets each deploy target (staging, another Render instance, etc.)
// point at its own backend without editing source. Falls back to the
// historical localhost/production split when unset, so a plain checkout
// still works with zero config.
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : 'https://akwaba-back-end.onrender.com')

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function parseJson(response: Response) {
  return response.json().catch(() => ({ error: 'Invalid server response' }))
}

// Double-submit CSRF cookie set by the backend at login — readable by JS on
// purpose, so it can be echoed back as a header. A cross-site page can
// trigger a cookie-carrying request but can't read this value to forge the
// matching header.
function csrfHeaders(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)akwaba_csrf=([^;]*)/)
  return match ? { 'x-csrf-token': decodeURIComponent(match[1]) } : {}
}

// ── Registration (multi-step) ──────────────────────────────────────────
// step 1: surname, firstName, emailAddress, whatsAppNumber, accountPin
// step 2: emailAddress, docType, roomPreference, roommateName?, emergencyContact
// step 3: emailAddress, plan, receipt (File)
export async function submitRegistrationStep(step: 1 | 2 | 3, fields: Record<string, string>, receipt?: File) {
  const payload = new FormData()
  payload.append('step', String(step))
  Object.entries(fields).forEach(([key, value]) => payload.append(key, value))
  if (receipt) payload.append('receipt', receipt)

  const response = await fetch(`${API_BASE}/api/register/step`, { method: 'POST', body: payload })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || result.message || `Error ${response.status}`, response.status)
  return result as { message: string; nextStep: number }
}

// ── Auth ──────────────────────────────────────────────────────────────
export async function login(loginPhone: string, loginPin: string) {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginPhone, loginPin }),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || result.message || `Error ${response.status}`, response.status)
  return result as { message: string; participant: ParticipantProfile }
}

export async function logout() {
  await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include', headers: csrfHeaders() })
}

export interface ParticipantProfile {
  surname: string
  firstName: string
  emailAddress: string
  whatsAppNumber: string
  currentStep: number
  logistics?: {
    docType?: string
    roomPreference?: string
    roommateName?: string
    emergencyContact?: string
  }
  checkout?: {
    plan?: string
    paymentStatus?: string
    amountPaid?: number
    tripTotal?: number
    remainingBalance?: number
    // Minimum the next "Pay with Paystack" amount must be. Equal to the
    // ₦100,000 initial-deposit floor while amountPaid is 0, and ₦100
    // (the backend's general payment floor) after that — server-enforced,
    // this is purely for setting the input's min/helper text.
    minNextPayment?: number
    hasReceipt?: boolean
    receiptUploadedAt?: string | null
  }
}

export async function getMyProfile() {
  const response = await fetch(`${API_BASE}/api/participant/me`, { credentials: 'include' })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || 'Failed to load profile.', response.status)
  return result.participant as ParticipantProfile
}

// Fetches the receipt as an authenticated blob (the receipt route requires
// the participant's session cookie, so it cannot be linked to directly with
// a plain <a href> — a bare navigation wouldn't carry a cross-site cookie).
export async function fetchMyReceiptBlobUrl() {
  const response = await fetch(`${API_BASE}/api/participant/me/receipt`, { credentials: 'include' })
  if (!response.ok) throw new ApiError('Could not load your receipt.', response.status)
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

// ── Payments ──────────────────────────────────────────────────────────
export async function initiatePayment(amount: number) {
  const response = await fetch(`${API_BASE}/api/payments/initiate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify({ amount }),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || `Error ${response.status}`, response.status)
  return result as { success: true; authorizationUrl: string; reference: string }
}

export async function verifyPayment(reference: string) {
  const response = await fetch(`${API_BASE}/api/payments/verify/${encodeURIComponent(reference)}`, {
    credentials: 'include',
  })
  const result = await parseJson(response)
  return { ok: response.ok, ...result } as { ok: boolean; success?: boolean; status?: string; error?: string }
}

// ── Public ────────────────────────────────────────────────────────────
export interface ConvoyStatus {
  total: number
  confirmed: number
  deposit: number
  pending: number
  seats: ('confirmed' | 'deposit' | 'pending')[]
}

export async function getConvoyStatus() {
  const response = await fetch(`${API_BASE}/api/public/convoy`)
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || 'Could not load convoy status.', response.status)
  return result as ConvoyStatus
}

// ── Admin ─────────────────────────────────────────────────────────────
export interface RegistrantSummary {
  emailAddress: string
  surname: string
  firstName: string
  whatsAppNumber: string
  currentStep: number
  docType?: string
  roomPreference?: string
  roommateName?: string
  plan?: string
  paymentStatus?: string
  amountPaid?: number
  hasReceipt?: boolean
  registeredAt?: string
}

export async function adminListRegistrants(
  params: { q?: string; status?: string; step?: string; page?: number; limit?: number }
) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  if (params.step) search.set('step', params.step)
  search.set('page', String(params.page ?? 1))
  search.set('limit', String(params.limit ?? 25))

  const response = await fetch(`${API_BASE}/api/admin/registrants?${search.toString()}`, {
    credentials: 'include',
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || 'Could not load registrants.', response.status)
  return result as { total: number; page: number; pages: number; registrants: RegistrantSummary[] }
}

export async function adminStats() {
  const response = await fetch(`${API_BASE}/api/admin/stats`, { credentials: 'include' })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || 'Could not load stats.', response.status)
  return result as {
    total: number
    byStep: { _id: number; count: number }[]
    byStatus: { _id: string; count: number }[]
  }
}

export async function adminUpdatePayment(
  email: string,
  update: { paymentStatus?: string; amountPaid?: number }
) {
  const response = await fetch(`${API_BASE}/api/admin/registrants/${encodeURIComponent(email)}/payment`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify(update),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || 'Could not update payment.', response.status)
  return result.registrant as RegistrantSummary
}

export async function adminFetchReceiptBlobUrl(email: string) {
  const response = await fetch(`${API_BASE}/api/admin/registrants/${encodeURIComponent(email)}/receipt`, {
    credentials: 'include',
  })
  if (!response.ok) throw new ApiError('Could not load this receipt.', response.status)
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

// Exchanges the admin key for an httpOnly session cookie. The key itself is
// never stored client-side afterward — only this one request ever sends it.
export async function adminLogin(adminKey: string) {
  const response = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminKey }),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || 'Invalid admin key.', response.status)
}

export async function adminLogout() {
  await fetch(`${API_BASE}/api/admin/logout`, { method: 'POST', credentials: 'include' })
}
