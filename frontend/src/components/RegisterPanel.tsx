import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  login,
  submitRegistrationStep,
  forgotPin,
  getMyProfile,
  initiatePayment,
  verifyPayment,
  ApiError,
  type ParticipantProfile,
} from '../lib/api'
import { useToast } from './Toast'
import WhatsAppIcon from './WhatsAppIcon'
import PaymentProgress from './PaymentProgress'

const DRAFT_KEY = 'akwaba_registration_draft'

// ── Paystack Inline (popup) SDK ──
// Loaded on demand (only once Step 3 is reached) rather than unconditionally
// in index.html, so visitors who never get to checkout never fetch a
// third-party script. The registration deposit uses resumeTransaction()
// against a reference already initialized server-side (see
// /api/payments/initiate) rather than PaystackPop.setup(), so the popup
// can't be used to pay an amount our backend didn't validate first.
declare global {
  interface Window {
    PaystackPop?: new () => {
      resumeTransaction: (
        accessCode: string,
        opts: {
          onSuccess: (transaction: { reference: string }) => void
          onCancel: () => void
          onError?: (error: unknown) => void
        }
      ) => void
    }
  }
}

const PAYSTACK_SCRIPT_SRC = 'https://js.paystack.co/v2/inline.js'
let paystackScriptPromise: Promise<void> | null = null

function loadPaystackScript(): Promise<void> {
  if (window.PaystackPop) return Promise.resolve()
  if (paystackScriptPromise) return paystackScriptPromise
  paystackScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = PAYSTACK_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      paystackScriptPromise = null
      reject(new Error('Could not load the payment popup. Check your connection and try again.'))
    }
    document.head.appendChild(script)
  })
  return paystackScriptPromise
}

const DOC_TYPES = [
  { value: 'International Passport', icon: '📕', label: 'Int. Passport' },
  { value: 'ECOWAS Passport', icon: '📗', label: 'ECOWAS Slip' },
  { value: 'NIN', icon: '🆔', label: 'NIN Card' },
]

interface Draft {
  surname: string
  firstName: string
  emailAddress: string
  whatsAppNumber: string
  docType: string
  roomPreference: string
  roommateName: string
  emergencyContact: string
  plan: string
  step: number
}

const EMPTY_DRAFT: Draft = {
  surname: '',
  firstName: '',
  emailAddress: '',
  whatsAppNumber: '',
  docType: 'International Passport',
  roomPreference: 'match',
  roommateName: '',
  emergencyContact: '',
  plan: 'Full Payment',
  step: 1,
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return EMPTY_DRAFT
    return { ...EMPTY_DRAFT, ...JSON.parse(raw) }
  } catch {
    return EMPTY_DRAFT
  }
}

export default function RegisterPanel() {
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'register' | 'login'>('register')

  // ── Registration state ──
  // Lazy initializers (rather than useState + a mount effect) so the draft
  // restored from localStorage is available on the very first render — no
  // synchronous setState-in-effect, no flash of empty fields.
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [step, setStep] = useState(() => (draft.step > 1 ? draft.step : 1))
  const [accountPin, setAccountPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // ── Bot-protection fields for Step 1 (see backend routes/register.js) ──
  // `honeypot` should stay empty — it's a text field hidden from real users
  // but visible to naive scripted bots that fill in every input they find.
  // `formMountedAt` timestamps when this component mounted, so we can send
  // the server how long the user actually spent on the form. Set from an
  // effect (not a useRef(Date.now()) initializer) — reading the clock is an
  // impure operation and isn't safe to run directly during render.
  const [honeypot, setHoneypot] = useState('')
  const formMountedAt = useRef<number | null>(null)

  // ── Login state ──
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [loginPinVisible, setLoginPinVisible] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)

  // ── Forgot-PIN state ──
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)

  // ── Step 3 deposit state ──
  // Step 1 auto-logs the participant in (see routes/register.js), so by the
  // time the wizard reaches Step 3 the same auth-cookie-gated
  // /api/payments/* and /api/participant/me endpoints the dashboard uses
  // already work here — no separate registration-only payment path needed.
  const [depositProfile, setDepositProfile] = useState<ParticipantProfile | null>(null)
  const [depositLoading, setDepositLoading] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositBusy, setDepositBusy] = useState(false)

  useEffect(() => {
    formMountedAt.current = Date.now()
    if (draft.step > 1) {
      toast('Welcome back — your progress was restored.', 'info')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 3) return
    let cancelled = false
    async function loadDeposit() {
      setDepositLoading(true)
      try {
        const p = await getMyProfile()
        if (cancelled) return
        setDepositProfile(p)
        setDepositAmount(String(p.checkout?.minNextPayment ?? 100000))
      } catch (err) {
        if (cancelled) return
        // No/expired session (e.g. Step 1 happened in a previous browser
        // session and the localStorage draft outlived the 12h auth cookie) —
        // there's no way to pay without one, so send them back to Step 1.
        toast(
          err instanceof ApiError && err.status === 401
            ? 'Your session expired. Please restart from Step 1.'
            : 'Could not load your deposit details. Please restart from Step 1.',
          'error'
        )
        setStep(1)
      } finally {
        if (!cancelled) setDepositLoading(false)
      }
    }
    void loadDeposit()
    return () => {
      cancelled = true
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDeposit() {
    if (!depositProfile) return
    const amount = Number(depositAmount)
    const minAllowed = depositProfile.checkout?.minNextPayment ?? 100000
    if (!amount || amount <= 0) {
      toast('Enter an amount greater than ₦0.', 'error')
      return
    }
    if (amount < minAllowed) {
      toast(`Your initial deposit must be at least ₦${minAllowed.toLocaleString()}.`, 'error')
      return
    }
    setDepositBusy(true)
    try {
      const result = await initiatePayment(amount)
      await loadPaystackScript()
      if (!window.PaystackPop) throw new Error('Payment popup failed to load. Please try again.')
      const popup = new window.PaystackPop()
      popup.resumeTransaction(result.accessCode, {
        onSuccess: async () => {
          try {
            const verify = await verifyPayment(result.reference)
            if (verify.ok && verify.success) {
              toast('Deposit received! You can now complete your registration.', 'success')
            } else {
              toast('Payment received — confirming with Paystack…', 'info')
            }
          } finally {
            const updated = await getMyProfile().catch(() => null)
            if (updated) setDepositProfile(updated)
            setDepositBusy(false)
          }
        },
        onCancel: () => {
          toast('Payment cancelled.', 'info')
          setDepositBusy(false)
        },
        onError: () => {
          toast('Payment could not be completed. Please try again.', 'error')
          setDepositBusy(false)
        },
      })
    } catch (err) {
      toast(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not start payment.', 'error')
      setDepositBusy(false)
    }
  }

  function persistDraft(next: Draft) {
    setDraft(next)
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
  }

  function updateField<K extends keyof Draft>(key: K, value: Draft[K]) {
    persistDraft({ ...draft, [key]: value })
  }

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity()
      return
    }
    setBusy(true)
    setAlreadyRegistered(false)
    try {
      await submitRegistrationStep(1, {
        surname: draft.surname,
        firstName: draft.firstName,
        emailAddress: draft.emailAddress,
        whatsAppNumber: draft.whatsAppNumber,
        accountPin,
        company_website: honeypot,
        elapsedMs: String(formMountedAt.current ? Date.now() - formMountedAt.current : Number.MAX_SAFE_INTEGER),
      })
      const next = { ...draft, step: 2 }
      persistDraft(next)
      setStep(2)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.', 'error')
      if (err instanceof ApiError && err.status === 409) {
        setAlreadyRegistered(true)
      }
    } finally {
      setBusy(false)
    }
  }

  function goToLogin() {
    setAlreadyRegistered(false)
    setTab('login')
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault()
    if (draft.roomPreference === 'paired' && !draft.roommateName.trim()) {
      toast("Roommate's full name is required for paired rooming.", 'error')
      return
    }
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity()
      return
    }
    setBusy(true)
    try {
      await submitRegistrationStep(2, {
        emailAddress: draft.emailAddress,
        accountPin,
        docType: draft.docType,
        roomPreference: draft.roomPreference,
        roommateName: draft.roomPreference === 'paired' ? draft.roommateName : '',
        emergencyContact: draft.emergencyContact,
      })
      const next = { ...draft, step: 3 }
      persistDraft(next)
      setStep(3)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleStep3(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await submitRegistrationStep(3, { emailAddress: draft.emailAddress, accountPin, plan: draft.plan })
      localStorage.removeItem(DRAFT_KEY)
      // Step 1 already established the session cookie (auto-login), so
      // there's no need to send them through the login form again — go
      // straight to the dashboard.
      toast('Registration complete! Taking you to your dashboard…', 'success')
      setTimeout(() => navigate('/dashboard'), 1000)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Submission failed. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginBusy(true)
    try {
      await login(loginPhone.trim(), loginPin.trim())
      toast('Login successful! Loading dashboard...', 'success')
      setTimeout(() => navigate('/dashboard'), 800)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Login failed. Check your details.', 'error')
    } finally {
      setLoginBusy(false)
    }
  }

  async function handleForgotPin() {
    setForgotBusy(true)
    try {
      const result = await forgotPin(forgotEmail.trim())
      toast(result.message, 'success')
      setForgotOpen(false)
      setForgotEmail('')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.', 'error')
    } finally {
      setForgotBusy(false)
    }
  }

  const stampState = (n: number) => (step === n ? 'active' : step > n ? 'done' : 'pending')
  const stampClasses: Record<string, string> = {
    active: 'bg-rust text-cream border-rust',
    done: 'bg-forest text-cream border-forest',
    pending: 'bg-transparent text-cream-dark/60 border-cream-dark/30',
  }

  return (
    <section id="register" className="bg-ink py-20 md:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-[0.85fr_1fr] gap-14 items-start">
          <div>
            <p className="font-mono-custom text-xs text-gold tracking-widest uppercase mb-4">Get Started</p>
            <h2 className="font-display font-bold text-cream leading-tight tracking-tight mb-6 text-[clamp(30px,4.5vw,46px)]">
              Register <span className="text-rust italic">Your Trip</span>
            </h2>
            <p className="text-cream-dark text-[16px] leading-relaxed opacity-80 mb-6">
              Already registered? Switch to the login tab to reach your dashboard, track your payment, and manage your
              details.
            </p>
            <p className="text-cream-dark text-sm opacity-60 flex items-center gap-2">
              Questions? WhatsApp us at{' '}
              <a href="https://wa.me/2348064749255" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
                <WhatsAppIcon className="w-6 h-6" />
              </a>
            </p>
          </div>

          <div className="bg-forest-mid rounded-2xl p-8 md:p-10 border border-white/5">
            <div className="flex gap-2 mb-8">
              <button
                onClick={() => setTab('register')}
                className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition ${
                  tab === 'register' ? 'bg-rust text-cream' : 'bg-white/5 text-cream-dark'
                }`}
              >
                New Registration
              </button>
              <button
                onClick={() => setTab('login')}
                className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition ${
                  tab === 'login' ? 'bg-rust text-cream' : 'bg-white/5 text-cream-dark'
                }`}
              >
                Participant Dashboard
              </button>
            </div>

            {tab === 'register' ? (
              <>
                <div className="flex gap-2 mb-8">
                  {[
                    [1, 'Profile'],
                    [2, 'Logistics'],
                    [3, 'Checkout'],
                  ].map(([n, label]) => (
                    <div key={n} className="flex-1 flex flex-col items-center gap-1.5">
                      <span
                        className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${
                          stampClasses[stampState(n as number)]
                        }`}
                      >
                        {step > (n as number) ? '✓' : n}
                      </span>
                      <span className="text-[11px] text-cream-dark opacity-70">{label}</span>
                    </div>
                  ))}
                </div>

                {step === 1 && (
                  <form ref={formRef} onSubmit={handleStep1} className="flex flex-col gap-4">
                    {/* Honeypot — invisible to real users, left for bots that
                        auto-fill every field. See handleStep1 + backend
                        routes/register.js (looksLikeBot). */}
                    <input
                      type="text"
                      name="company_website"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      className="absolute w-px h-px opacity-0 overflow-hidden -z-10"
                      style={{ left: '-9999px' }}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Surname">
                        <input
                          required
                          value={draft.surname}
                          onChange={(e) => updateField('surname', e.target.value)}
                          placeholder="As written on ID"
                          className={inputClass}
                        />
                      </Field>
                      <Field label="First Name">
                        <input
                          required
                          value={draft.firstName}
                          onChange={(e) => updateField('firstName', e.target.value)}
                          placeholder="As written on ID"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Email Address">
                        <input
                          required
                          type="email"
                          value={draft.emailAddress}
                          onChange={(e) => updateField('emailAddress', e.target.value)}
                          placeholder="name@example.com"
                          className={inputClass}
                        />
                      </Field>
                      <Field label="WhatsApp Number">
                        <input
                          required
                          type="tel"
                          value={draft.whatsAppNumber}
                          onChange={(e) => updateField('whatsAppNumber', e.target.value)}
                          placeholder="+234..."
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <Field label="4-Digit Account PIN">
                      <div className="flex gap-2">
                        <input
                          required
                          type={pinVisible ? 'text' : 'password'}
                          pattern="[0-9]{4}"
                          inputMode="numeric"
                          maxLength={4}
                          value={accountPin}
                          onChange={(e) => setAccountPin(e.target.value)}
                          placeholder="••••"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => setPinVisible((v) => !v)}
                          className="px-3 rounded-lg bg-white/5 text-cream-dark text-xs font-bold shrink-0"
                        >
                          {pinVisible ? 'HIDE' : 'PEEP'}
                        </button>
                      </div>
                      <span className="text-xs text-cream-dark opacity-60 mt-1 block">
                        Remember this PIN to log in to your dashboard.
                      </span>
                    </Field>
                    {alreadyRegistered && (
                      <div className="bg-gold/10 border border-gold/30 rounded-xl p-4 flex flex-col gap-2.5">
                        <p className="text-cream-dark text-xs leading-relaxed">
                          You already have an account with these details. Log in to reach your dashboard instead.
                        </p>
                        <button
                          type="button"
                          onClick={goToLogin}
                          className="bg-gold/90 hover:bg-gold text-ink py-2.5 rounded-full text-sm font-semibold transition"
                        >
                          Log In to Dashboard →
                        </button>
                      </div>
                    )}

                    <button type="submit" disabled={busy} className={`${primaryBtnClass} w-full`}>
                      {busy ? 'Saving…' : 'Next: Travel Logistics →'}
                    </button>
                  </form>
                )}

                {step === 2 && (
                  <form ref={formRef} onSubmit={handleStep2} className="flex flex-col gap-4">
                    <PinConfirmField accountPin={accountPin} setAccountPin={setAccountPin} pinVisible={pinVisible} setPinVisible={setPinVisible} />
                    <div className="text-cream text-sm font-semibold mb-1">🛂 Travel Document</div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {DOC_TYPES.map((d) => (
                        <button
                          type="button"
                          key={d.value}
                          onClick={() => updateField('docType', d.value)}
                          className={`rounded-xl p-3 text-center border transition ${
                            draft.docType === d.value
                              ? 'bg-rust/20 border-rust text-cream'
                              : 'bg-white/5 border-white/10 text-cream-dark'
                          }`}
                        >
                          <div className="text-xl mb-1">{d.icon}</div>
                          <div className="text-xs">{d.label}</div>
                        </button>
                      ))}
                    </div>

                    <div className="text-cream text-sm font-semibold mt-2 mb-1">🏨 Room Allocation</div>
                    <Field label="Room Preference">
                      <select
                        value={draft.roomPreference}
                        onChange={(e) => updateField('roomPreference', e.target.value)}
                        className={inputClass}
                      >
                        <option value="match">Solo (Match me with a same-sex roommate)</option>
                        <option value="paired">Paired (Traveling with a designated partner)</option>
                      </select>
                    </Field>

                    {draft.roomPreference === 'paired' && (
                      <Field label="Roommate's Full Name">
                        <input
                          required
                          value={draft.roommateName}
                          onChange={(e) => updateField('roommateName', e.target.value)}
                          placeholder="Enter your partner's exact name"
                          className={inputClass}
                        />
                      </Field>
                    )}

                    <Field label="Emergency Contact (Next of Kin)">
                      <input
                        required
                        value={draft.emergencyContact}
                        onChange={(e) => updateField('emergencyContact', e.target.value)}
                        placeholder="e.g. Jane Doe (+234 803...)"
                        className={inputClass}
                      />
                    </Field>

                    <div className="flex gap-3 mt-2">
                      <button type="button" onClick={() => setStep(1)} className={secondaryBtnClass}>
                        ← Back
                      </button>
                      <button type="submit" disabled={busy} className={primaryBtnClass}>
                        {busy ? 'Saving…' : 'Next: Checkout →'}
                      </button>
                    </div>
                  </form>
                )}

                {step === 3 && (
                  <form onSubmit={handleStep3} className="flex flex-col gap-4">
                    <PinConfirmField accountPin={accountPin} setAccountPin={setAccountPin} pinVisible={pinVisible} setPinVisible={setPinVisible} />
                    <div className="text-cream text-sm font-semibold mb-1">💳 Payment Plan</div>
                    <Field label="Select Plan">
                      <select value={draft.plan} onChange={(e) => updateField('plan', e.target.value)} className={inputClass}>
                        <option value="Full Payment">Full Payment — ₦385,000</option>
                        <option value="Installment Plan">Installment — Min. deposit ₦100,000</option>
                      </select>
                    </Field>

                    <div className="text-cream text-sm font-semibold mt-2 mb-1">🔒 Initial Deposit</div>
                    {depositLoading && !depositProfile ? (
                      <div className="bg-ink/60 rounded-xl p-4 text-sm text-cream-dark leading-relaxed">
                        Loading your deposit details…
                      </div>
                    ) : (depositProfile?.checkout?.amountPaid ?? 0) > 0 ? (
                      <div className="bg-forest/20 border border-forest/40 rounded-xl p-4 flex flex-col gap-3">
                        <p className="text-cream text-sm leading-relaxed">
                          ✅ Deposit received — ₦{(depositProfile?.checkout?.amountPaid ?? 0).toLocaleString()} paid.
                        </p>
                        <PaymentProgress
                          amountPaid={depositProfile?.checkout?.amountPaid ?? 0}
                          tripTotal={depositProfile?.checkout?.tripTotal ?? 0}
                        />
                        <p className="text-cream-dark text-xs opacity-70">
                          Any remaining balance can be settled anytime from your dashboard after you log in.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-ink/60 rounded-xl p-4 flex flex-col gap-3">
                        <p className="text-cream-dark text-xs leading-relaxed">
                          A minimum deposit of ₦{(depositProfile?.checkout?.minNextPayment ?? 100000).toLocaleString()} is
                          required to secure your spot and complete registration. Paid securely via Paystack — you never
                          leave this page.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={depositProfile?.checkout?.minNextPayment ?? 100000}
                            max={depositProfile?.checkout?.tripTotal}
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder="Amount in ₦"
                            className={inputClass}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleDeposit}
                          disabled={depositBusy || depositLoading}
                          className="bg-gold hover:bg-gold/90 disabled:opacity-60 text-ink py-3 rounded-full text-sm font-bold transition"
                        >
                          {depositBusy ? 'Processing…' : 'Pay Deposit with Paystack →'}
                        </button>
                      </div>
                    )}

                    <div className="flex gap-3 mt-2">
                      <button type="button" onClick={() => setStep(2)} className={secondaryBtnClass}>
                        ← Back
                      </button>
                      <button
                        type="submit"
                        disabled={busy || (depositProfile?.checkout?.amountPaid ?? 0) <= 0}
                        className={`${primaryBtnClass} !bg-forest hover:!bg-forest-mid`}
                        title={(depositProfile?.checkout?.amountPaid ?? 0) <= 0 ? 'Pay your initial deposit first' : undefined}
                      >
                        {busy ? 'Submitting…' : 'Complete Registration'}
                      </button>
                    </div>
                    {/* `title` tooltips never show on touch devices, so the
                        disabled reason above needs a visible fallback — most
                        of this app's traffic is mobile. */}
                    {!busy && (depositProfile?.checkout?.amountPaid ?? 0) <= 0 && (
                      <p className="text-xs text-gold/80 text-center -mt-1">
                        Pay your initial deposit above to unlock this button.
                      </p>
                    )}
                  </form>
                )}
              </>
            ) : (
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <Field label="Registered Phone Number">
                  <input
                    required
                    type="tel"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="+234..."
                    className={inputClass}
                  />
                </Field>
                <Field label="4-Digit PIN">
                  <div className="flex gap-2">
                    <input
                      required
                      type={loginPinVisible ? 'text' : 'password'}
                      pattern="[0-9]{4}"
                      inputMode="numeric"
                      maxLength={4}
                      value={loginPin}
                      onChange={(e) => setLoginPin(e.target.value)}
                      placeholder="••••"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setLoginPinVisible((v) => !v)}
                      className="px-3 rounded-lg bg-white/5 text-cream-dark text-xs font-bold shrink-0"
                    >
                      {loginPinVisible ? 'HIDE' : 'PEEP'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForgotOpen((v) => !v)}
                    className="text-xs text-gold mt-2 underline"
                  >
                    Forgot PIN?
                  </button>
                </Field>

                {forgotOpen && (
                  <div className="bg-ink/60 rounded-xl p-4 flex flex-col gap-2.5">
                    <p className="text-cream-dark text-xs leading-relaxed">
                      Enter your registered email and we'll send you a link to set a new PIN.
                    </p>
                    <input
                      required
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@example.com"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={handleForgotPin}
                      disabled={forgotBusy || !forgotEmail.trim()}
                      className="bg-white/10 hover:bg-white/15 disabled:opacity-60 text-cream py-2.5 rounded-full text-sm font-semibold transition"
                    >
                      {forgotBusy ? 'Sending…' : 'Send Reset Link'}
                    </button>
                  </div>
                )}

                <button type="submit" disabled={loginBusy} className={`${primaryBtnClass} w-full`}>
                  {loginBusy ? 'Checking…' : 'Access Dashboard →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

const inputClass =
  'w-full bg-white/5 border border-white/15 focus:border-gold rounded-lg px-4 py-3 text-cream text-[15px] placeholder:text-cream-dark/40 transition'
const primaryBtnClass =
  'flex-1 bg-rust hover:bg-rust-dark disabled:opacity-60 text-cream py-3.5 rounded-full text-[15px] font-bold transition'
const secondaryBtnClass =
  'flex-1 bg-white/5 hover:bg-white/10 text-cream-dark py-3.5 rounded-full text-[15px] font-semibold transition'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-cream-dark text-[13px] font-semibold mb-1.5 tracking-wide">{label}</span>
      {children}
    </label>
  )
}

// ── Re-proves ownership of this registration on Steps 2 & 3 ──
// The backend requires accountPin on these steps (see routes/register.js) so
// that knowing/guessing someone's email alone can't be used to tamper with
// their in-progress registration. Only rendered when we don't already have
// the PIN in memory from Step 1 — e.g. after a page reload restored the
// draft from localStorage (accountPin itself is deliberately never persisted
// there), the user has to type it again before continuing.
function PinConfirmField({
  accountPin,
  setAccountPin,
  pinVisible,
  setPinVisible,
}: {
  accountPin: string
  setAccountPin: (v: string) => void
  pinVisible: boolean
  setPinVisible: (fn: (v: boolean) => boolean) => void
}) {
  if (accountPin) return null
  return (
    <Field label="Confirm Your 4-Digit PIN">
      <div className="flex gap-2">
        <input
          required
          type={pinVisible ? 'text' : 'password'}
          pattern="[0-9]{4}"
          inputMode="numeric"
          maxLength={4}
          value={accountPin}
          onChange={(e) => setAccountPin(e.target.value)}
          placeholder="••••"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setPinVisible((v) => !v)}
          className="px-3 rounded-lg bg-white/5 text-cream-dark text-xs font-bold shrink-0"
        >
          {pinVisible ? 'HIDE' : 'PEEP'}
        </button>
      </div>
      <span className="text-xs text-cream-dark opacity-60 mt-1 block">
        We need this to confirm it's really you continuing this registration.
      </span>
    </Field>
  )
}
