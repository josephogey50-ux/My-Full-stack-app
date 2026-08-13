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
    : 'https://my-full-stack-app-cx43.onrender.com')

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

// Double-submit CSRF token. The backend also sets this as a non-httpOnly
// cookie, but frontend and backend are on different domains in production —
// cookies belong to the domain that set them, so document.cookie on this
// page can never see a cookie the backend issued. Instead, the backend hands
// the value back in the JSON body wherever it's (re)issued (login, /me,
// admin login, admin stats), and we cache it here in memory to echo back as
// a header on mutating requests.
let csrfToken: string | null = null

function csrfHeaders(): Record<string, string> {
  return csrfToken ? { 'x-csrf-token': csrfToken } : {}
}

// ── Registration (multi-step) ──────────────────────────────────────────
// step 1: surname, firstName, emailAddress, whatsAppNumber, accountPin
// step 2: emailAddress, accountPin, docType, roomPreference, roommateName?, emergencyContact
// step 3: emailAddress, accountPin, plan
// accountPin is required again on steps 2 & 3 — the backend uses it to prove
// the caller actually owns this registration, not just knows its email.
export async function submitRegistrationStep(step: 1 | 2 | 3, fields: Record<string, string>) {
  const response = await fetch(`${API_BASE}/api/register/step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, ...fields }),
  })
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
  csrfToken = result.csrfToken ?? csrfToken
  return result as { message: string; participant: ParticipantProfile }
}

export async function logout() {
  await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include', headers: csrfHeaders() })
  csrfToken = null
}

// No credentials/CSRF here — the participant isn't logged in yet at this point.
export async function forgotPin(emailAddress: string) {
  const response = await fetch(`${API_BASE}/api/forgot-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailAddress }),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || `Error ${response.status}`, response.status)
  return result as { message: string }
}

export async function resetPin(token: string, newPin: string) {
  const response = await fetch(`${API_BASE}/api/reset-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPin }),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || `Error ${response.status}`, response.status)
  return result as { message: string }
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
  csrfToken = result.csrfToken ?? csrfToken
  return result.participant as ParticipantProfile
}

export async function changeMyPin(currentPin: string, newPin: string) {
  const response = await fetch(`${API_BASE}/api/participant/me/change-pin`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify({ currentPin, newPin }),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || `Error ${response.status}`, response.status)
  return result as { message: string }
}

export async function updateMyLogistics(fields: {
  docType: string
  roomPreference: string
  roommateName: string
  emergencyContact: string
}) {
  const response = await fetch(`${API_BASE}/api/participant/me/logistics`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify(fields),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || `Error ${response.status}`, response.status)
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
    method: 'POST',
    credentials: 'include',
    headers: csrfHeaders(),
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
  csrfToken = result.csrfToken ?? csrfToken
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
// adminName rides along in the session JWT and is attached server-side to
// every audit-log entry, since every admin still shares the one key.
export async function adminLogin(adminKey: string, adminName: string) {
  const response = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminKey, adminName }),
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || 'Invalid admin key.', response.status)
  csrfToken = result.csrfToken ?? csrfToken
  return result as { success: true; adminName: string }
}

export async function adminLogout() {
  await fetch(`${API_BASE}/api/admin/logout`, { method: 'POST', credentials: 'include', headers: csrfHeaders() })
  csrfToken = null
}

// ── Admin: audit log ──
export interface AuditLogEntry {
  _id: string
  adminName: string
  action: string
  targetEmail: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  createdAt: string
}

export async function adminAuditLog(params: { page?: number; limit?: number }) {
  const search = new URLSearchParams()
  search.set('page', String(params.page ?? 1))
  search.set('limit', String(params.limit ?? 25))

  const response = await fetch(`${API_BASE}/api/admin/audit-log?${search.toString()}`, {
    credentials: 'include',
  })
  const result = await parseJson(response)
  if (!response.ok) throw new ApiError(result.error || 'Could not load the audit log.', response.status)
  return result as { total: number; page: number; pages: number; entries: AuditLogEntry[] }
}

// ── Admin: CSV export ──
// Fetched as a blob (not a plain <a href>) so the admin session cookie is
// attached the same way every other admin request attaches it.
export async function adminDownloadRegistrantsCsv(params: { q?: string; status?: string; step?: string }) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  if (params.step) search.set('step', params.step)

  const response = await fetch(`${API_BASE}/api/admin/registrants/export?${search.toString()}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new ApiError('Could not export registrants.', response.status)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `akwaba-registrants-${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
