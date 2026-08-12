import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import logo from '../assets/images/logo.png'
import {
  ApiError,
  changeMyPin,
  fetchMyReceiptBlobUrl,
  getMyProfile,
  initiatePayment,
  logout as apiLogout,
  updateMyLogistics,
  verifyPayment,
  type ParticipantProfile,
} from '../lib/api'
import { useToast } from '../components/Toast'
import PaymentProgress from '../components/PaymentProgress'

const DOC_TYPES = ['International Passport', 'ECOWAS Passport', 'NIN']

export default function Dashboard() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [profile, setProfile] = useState<ParticipantProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [payAmount, setPayAmount] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [receiptLoading, setReceiptLoading] = useState(false)

  // ── Self-service logistics editing ──
  const [editingLogistics, setEditingLogistics] = useState(false)
  const [logisticsForm, setLogisticsForm] = useState({
    docType: 'International Passport',
    roomPreference: 'match',
    roommateName: '',
    emergencyContact: '',
  })
  const [savingLogistics, setSavingLogistics] = useState(false)

  // ── Self-service PIN change ──
  const [showPinForm, setShowPinForm] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmNewPin, setConfirmNewPin] = useState('')
  const [changingPin, setChangingPin] = useState(false)

  async function refreshProfile() {
    setLoading(true)
    try {
      const p = await getMyProfile()
      setProfile(p)
      setLogisticsForm({
        docType: p.logistics?.docType || 'International Passport',
        roomPreference: p.logistics?.roomPreference || 'match',
        roommateName: p.logistics?.roommateName || '',
        emergencyContact: p.logistics?.emergencyContact || '',
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast('Please log in to view your dashboard.', 'error')
        setTimeout(() => navigate('/'), 1500)
        return
      }
      toast(err instanceof ApiError ? err.message : 'Error loading your dashboard.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handlePaymentRedirect() {
    const reference = params.get('reference')
    if (!reference) return
    try {
      const result = await verifyPayment(reference)
      if (result.ok && result.success) {
        toast('Payment confirmed — thank you!', 'success')
      } else if (result.ok && result.status) {
        toast(`Payment ${result.status}. If you were charged, contact us and we'll confirm it manually.`, 'error')
      } else {
        toast(result.error || 'Could not confirm payment status.', 'error')
      }
    } catch {
      // non-fatal; webhook remains the source of truth
    } finally {
      params.delete('reference')
      setParams(params, { replace: true })
    }
  }

  async function load() {
    await handlePaymentRedirect()
    await refreshProfile()
  }

  useEffect(() => {
    // load()'s setState calls only run after the awaited requests resolve,
    // not synchronously in this effect body — standard fetch-on-mount.
    void load() // eslint-disable-line react-hooks/set-state-in-effect
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePay() {
    if (!profile) return
    const amount = Number(payAmount)
    const minAllowed = profile.checkout?.minNextPayment ?? 100
    if (!amount || amount <= 0) {
      toast('Enter an amount greater than ₦0.', 'error')
      return
    }
    // Mirrors the backend rule (see /api/payments/initiate): before any
    // payment lands, the first one must clear the initial-deposit floor.
    // The server re-checks this regardless — this is just faster feedback.
    if (amount < minAllowed) {
      toast(`Your first payment must be at least ₦${minAllowed.toLocaleString()}.`, 'error')
      return
    }
    setPayBusy(true)
    try {
      const result = await initiatePayment(amount)
      window.location.href = result.authorizationUrl
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not start payment.', 'error')
      setPayBusy(false)
    }
  }

  async function handleViewReceipt() {
    setReceiptLoading(true)
    try {
      const url = await fetchMyReceiptBlobUrl()
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load your receipt.', 'error')
    } finally {
      setReceiptLoading(false)
    }
  }

  async function saveLogistics(e: React.FormEvent) {
    e.preventDefault()
    if (logisticsForm.roomPreference === 'paired' && !logisticsForm.roommateName.trim()) {
      toast("Roommate's full name is required for paired rooming.", 'error')
      return
    }
    setSavingLogistics(true)
    try {
      const updated = await updateMyLogistics(logisticsForm)
      setProfile(updated)
      toast('Your details have been updated.', 'success')
      setEditingLogistics(false)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your changes.', 'error')
    } finally {
      setSavingLogistics(false)
    }
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault()
    if (newPin !== confirmNewPin) {
      toast('New PINs do not match.', 'error')
      return
    }
    setChangingPin(true)
    try {
      await changeMyPin(currentPin, newPin)
      toast('Your PIN has been updated.', 'success')
      setShowPinForm(false)
      setCurrentPin('')
      setNewPin('')
      setConfirmNewPin('')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not change your PIN.', 'error')
    } finally {
      setChangingPin(false)
    }
  }

  function logout() {
    void apiLogout()
    navigate('/')
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-ink-mid font-body">Loading your dashboard…</p>
      </div>
    )
  }

  const remaining = profile.checkout?.remainingBalance ?? 0
  const amountPaid = profile.checkout?.amountPaid ?? 0
  const tripTotal = profile.checkout?.tripTotal ?? 0
  const minNextPayment = profile.checkout?.minNextPayment ?? 100
  const isFirstPayment = amountPaid <= 0

  return (
    <div className="min-h-screen bg-cream">
      <nav className="bg-ink sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
  <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
    <img src={logo} alt="AKWABA 001 logo" className="w-8 h-8 rounded-full object-cover" />
    <span className="font-display text-xl font-semibold text-cream">AKWABA 001</span>
  </button>
          <button onClick={logout} className="text-cream-dark text-sm font-medium hover:text-cream transition">
            Log Out
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-ink/10 p-8 md:p-10 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">
                👋 Welcome, {profile.firstName} {profile.surname}
              </h1>
            </div>
            <span className="bg-forest text-cream text-xs font-semibold px-3 py-1.5 rounded-full">
              {profile.currentStep >= 4 ? 'Registration Complete' : `Step ${profile.currentStep} of 3`}
            </span>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-ink">Your Profile</h2>
              {!editingLogistics && (
                <button
                  onClick={() => setEditingLogistics(true)}
                  className="text-rust text-xs font-semibold hover:underline"
                >
                  Edit Logistics
                </button>
              )}
            </div>

            {!editingLogistics ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <Item label="Email" value={profile.emailAddress} />
                <Item label="WhatsApp Number" value={profile.whatsAppNumber} />
                <Item label="Travel Document" value={profile.logistics?.docType || '—'} />
                <Item label="Room Preference" value={profile.logistics?.roomPreference === 'paired' ? 'Paired' : 'Solo (matched)'} />
                <Item label="Emergency Contact" value={profile.logistics?.emergencyContact || '—'} />
              </div>
            ) : (
              <form onSubmit={saveLogistics} className="bg-cream-dark rounded-xl p-6 flex flex-col gap-4">
                <p className="text-ink-mid text-xs opacity-70">
                  Your name, email, and WhatsApp number can't be changed here — contact us on WhatsApp if those need
                  to be corrected.
                </p>
                <label className="block">
                  <span className="block text-ink-mid text-xs font-semibold mb-1.5">Travel Document</span>
                  <select
                    value={logisticsForm.docType}
                    onChange={(e) => setLogisticsForm({ ...logisticsForm, docType: e.target.value })}
                    className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2.5 text-sm text-ink"
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-ink-mid text-xs font-semibold mb-1.5">Room Preference</span>
                  <select
                    value={logisticsForm.roomPreference}
                    onChange={(e) => setLogisticsForm({ ...logisticsForm, roomPreference: e.target.value })}
                    className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2.5 text-sm text-ink"
                  >
                    <option value="match">Solo (Match me with a same-sex roommate)</option>
                    <option value="paired">Paired (Traveling with a designated partner)</option>
                  </select>
                </label>
                {logisticsForm.roomPreference === 'paired' && (
                  <label className="block">
                    <span className="block text-ink-mid text-xs font-semibold mb-1.5">Roommate's Full Name</span>
                    <input
                      required
                      value={logisticsForm.roommateName}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, roommateName: e.target.value })}
                      className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2.5 text-sm text-ink"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="block text-ink-mid text-xs font-semibold mb-1.5">Emergency Contact (Next of Kin)</span>
                  <input
                    required
                    value={logisticsForm.emergencyContact}
                    onChange={(e) => setLogisticsForm({ ...logisticsForm, emergencyContact: e.target.value })}
                    className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2.5 text-sm text-ink"
                  />
                </label>
                <div className="flex gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingLogistics(false)
                      setLogisticsForm({
                        docType: profile.logistics?.docType || 'International Passport',
                        roomPreference: profile.logistics?.roomPreference || 'match',
                        roommateName: profile.logistics?.roommateName || '',
                        emergencyContact: profile.logistics?.emergencyContact || '',
                      })
                    }}
                    className="flex-1 bg-white border border-ink/15 text-ink-mid py-2.5 rounded-lg text-sm font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingLogistics}
                    className="flex-1 bg-forest hover:bg-forest-mid disabled:opacity-60 text-cream py-2.5 rounded-lg text-sm font-semibold transition"
                  >
                    {savingLogistics ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <Section title="💳 Payment">
            <Item label="Plan" value={profile.checkout?.plan || '—'} />
            <Item label="Status" value={profile.checkout?.paymentStatus || 'Pending'} />
            <Item label="Amount Paid" value={`₦${amountPaid.toLocaleString()}`} />
            <Item label="Balance Remaining" value={`₦${remaining.toLocaleString()}`} />
          </Section>

          <div className="mb-2">
            <PaymentProgress amountPaid={amountPaid} tripTotal={tripTotal} />
          </div>

          {remaining > 0 && (
            <div className="bg-cream-dark rounded-xl p-6 mt-6">
              <label className="block text-ink-mid text-sm font-semibold mb-2">Make a payment</label>
              <div className="flex gap-3">
                <div className="flex items-center bg-white border border-ink/15 rounded-lg px-3 flex-1">
                  <span className="text-ink-mid mr-1">₦</span>
                  <input
                    type="number"
                    min={minNextPayment}
                    max={remaining}
                    step={1}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder={isFirstPayment ? `Minimum ₦${minNextPayment.toLocaleString()}` : 'Amount to pay'}
                    className="w-full py-3 outline-none bg-transparent text-ink"
                  />
                </div>
                <button
                  onClick={handlePay}
                  disabled={payBusy}
                  className="bg-forest hover:bg-forest-mid disabled:opacity-60 text-cream px-6 rounded-lg font-semibold transition"
                >
                  {payBusy ? 'Redirecting…' : 'Pay with Paystack'}
                </button>
              </div>
              <p className="text-ink-mid text-xs mt-2 opacity-70">
                {isFirstPayment
                  ? `Your first payment must be at least ₦${minNextPayment.toLocaleString()}. `
                  : 'Pay any amount toward your balance — no minimum. '}
                Remaining balance: ₦{remaining.toLocaleString()}. You'll be redirected to Paystack to complete
                payment, and your progress above will update automatically once it's confirmed.
              </p>
            </div>
          )}

          {profile.checkout?.hasReceipt && (
            <button
              onClick={handleViewReceipt}
              disabled={receiptLoading}
              className="mt-6 bg-forest hover:bg-forest-mid disabled:opacity-60 text-cream px-6 py-3 rounded-full text-sm font-semibold transition"
            >
              {receiptLoading ? 'Loading…' : 'View My Receipt'}
            </button>
          )}

          <div className="mt-10 pt-8 border-t border-ink/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-ink">🔒 Account Security</h2>
              {!showPinForm && (
                <button
                  onClick={() => setShowPinForm(true)}
                  className="text-rust text-xs font-semibold hover:underline"
                >
                  Change PIN
                </button>
              )}
            </div>

            {showPinForm && (
              <form onSubmit={handleChangePin} className="bg-cream-dark rounded-xl p-6 flex flex-col gap-4 max-w-sm">
                <label className="block">
                  <span className="block text-ink-mid text-xs font-semibold mb-1.5">Current PIN</span>
                  <input
                    required
                    type="password"
                    pattern="[0-9]{4}"
                    inputMode="numeric"
                    maxLength={4}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value)}
                    className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2.5 text-sm text-ink"
                  />
                </label>
                <label className="block">
                  <span className="block text-ink-mid text-xs font-semibold mb-1.5">New 4-Digit PIN</span>
                  <input
                    required
                    type="password"
                    pattern="[0-9]{4}"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2.5 text-sm text-ink"
                  />
                </label>
                <label className="block">
                  <span className="block text-ink-mid text-xs font-semibold mb-1.5">Confirm New PIN</span>
                  <input
                    required
                    type="password"
                    pattern="[0-9]{4}"
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value)}
                    className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2.5 text-sm text-ink"
                  />
                </label>
                <div className="flex gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPinForm(false)
                      setCurrentPin('')
                      setNewPin('')
                      setConfirmNewPin('')
                    }}
                    className="flex-1 bg-white border border-ink/15 text-ink-mid py-2.5 rounded-lg text-sm font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={changingPin}
                    className="flex-1 bg-forest hover:bg-forest-mid disabled:opacity-60 text-cream py-2.5 rounded-lg text-sm font-semibold transition"
                  >
                    {changingPin ? 'Saving…' : 'Update PIN'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-display text-lg font-semibold text-ink mb-4">{title}</h2>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-cream-dark rounded-lg px-4 py-3">
      <div className="text-xs text-ink-mid opacity-60 mb-1">{label}</div>
      <div className="text-ink font-medium text-sm">{value}</div>
    </div>
  )
}
