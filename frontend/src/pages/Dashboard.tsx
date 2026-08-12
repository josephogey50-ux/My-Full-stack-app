import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import logo from '../assets/images/logo.png'
import {
  ApiError,
  fetchMyReceiptBlobUrl,
  getMyProfile,
  initiatePayment,
  logout as apiLogout,
  verifyPayment,
  type ParticipantProfile,
} from '../lib/api'
import { useToast } from '../components/Toast'
import PaymentProgress from '../components/PaymentProgress'

export default function Dashboard() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [profile, setProfile] = useState<ParticipantProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [payAmount, setPayAmount] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)

  useEffect(() => {
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    await handlePaymentRedirect()
    await refreshProfile()
  }

  async function refreshProfile() {
    setLoading(true)
    try {
      const p = await getMyProfile()
      setProfile(p)
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
      setReceiptUrl(url)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load your receipt.', 'error')
    } finally {
      setReceiptLoading(false)
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
  <span className="flex items-center gap-2.5">
    <img src={logo} alt="AKWABA 001 logo" className="w-8 h-8 rounded-full object-cover" />
    <span className="font-display text-xl font-semibold text-cream">AKWABA 001</span>
  </span>
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

          <Section title="Your Profile">
            <Item label="Email" value={profile.emailAddress} />
            <Item label="WhatsApp Number" value={profile.whatsAppNumber} />
            <Item label="Travel Document" value={profile.logistics?.docType || '—'} />
            <Item label="Room Preference" value={profile.logistics?.roomPreference === 'paired' ? 'Paired' : 'Solo (matched)'} />
            <Item label="Emergency Contact" value={profile.logistics?.emergencyContact || '—'} />
          </Section>

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
