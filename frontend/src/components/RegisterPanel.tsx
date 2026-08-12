import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, submitRegistrationStep, ApiError } from '../lib/api'
import { useToast } from './Toast'
import WhatsAppIcon from './WhatsAppIcon'

const DRAFT_KEY = 'akwaba_registration_draft'

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
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [accountPin, setAccountPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [receipt, setReceipt] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // ── Login state ──
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [loginPinVisible, setLoginPinVisible] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)

  useEffect(() => {
    const restored = loadDraft()
    setDraft(restored)
    if (restored.step > 1) {
      setStep(restored.step)
      toast('Welcome back — your progress was restored.', 'info')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    try {
      await submitRegistrationStep(1, {
        surname: draft.surname,
        firstName: draft.firstName,
        emailAddress: draft.emailAddress,
        whatsAppNumber: draft.whatsAppNumber,
        accountPin,
      })
      const next = { ...draft, step: 2 }
      persistDraft(next)
      setStep(2)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
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

  function validateAndSetReceipt(file: File) {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf']
    if (!allowed.includes(file.type)) {
      toast('Invalid format. Upload JPG, PNG, or PDF only.', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('File exceeds 5MB limit.', 'error')
      return
    }
    setReceipt(file)
  }

  async function handleStep3(e: React.FormEvent) {
    e.preventDefault()
    if (!receipt) {
      toast('A payment receipt is required.', 'error')
      return
    }
    setBusy(true)
    try {
      await submitRegistrationStep(3, { emailAddress: draft.emailAddress, plan: draft.plan }, receipt)
      localStorage.removeItem(DRAFT_KEY)
      toast('Registration complete! Log in with your WhatsApp number and PIN to view your dashboard.', 'success')
      setTimeout(() => setTab('login'), 1200)
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
                    <button type="submit" disabled={busy} className={`${primaryBtnClass} w-full`}>
                      {busy ? 'Saving…' : 'Next: Travel Logistics →'}
                    </button>
                  </form>
                )}

                {step === 2 && (
                  <form ref={formRef} onSubmit={handleStep2} className="flex flex-col gap-4">
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
                    <div className="text-cream text-sm font-semibold mb-1">💳 Payment Plan</div>
                    <Field label="Select Plan">
                      <select value={draft.plan} onChange={(e) => updateField('plan', e.target.value)} className={inputClass}>
                        <option value="Full Payment">Full Payment — ₦385,000</option>
                        <option value="Installment Plan">Installment — Min. deposit ₦100,000</option>
                      </select>
                    </Field>

                    <div className="bg-ink/60 rounded-xl p-4 text-sm space-y-1.5">
                      <div className="flex justify-between text-cream-dark">
                        <span>Bank</span>
                        <span className="text-cream font-semibold">MONIEPOINT</span>
                      </div>
                      <div className="flex justify-between text-cream-dark">
                        <span>Account Number</span>
                        <span className="text-cream font-semibold">6166119553</span>
                      </div>
                      <div className="flex justify-between text-cream-dark">
                        <span>Account Name</span>
                        <span className="text-cream font-semibold">TrootServices</span>
                      </div>
                      <p className="text-gold-light text-xs pt-2 leading-relaxed">
                        ⚠️ After payment, send your receipt via WhatsApp to{' '}
                        <a href="https://wa.me/2348064749255" target="_blank" rel="noopener" className="underline">
                          +234 806 474 9255
                        </a>
                      </p>
                    </div>

                    <Field label="Upload Payment Receipt (Image or PDF)">
                      <label
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDragOver(true)
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setDragOver(false)
                          if (e.dataTransfer.files[0]) validateAndSetReceipt(e.dataTransfer.files[0])
                        }}
                        className={`flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed p-6 cursor-pointer transition ${
                          dragOver ? 'border-gold bg-gold/10' : 'border-white/15'
                        }`}
                      >
                        <input
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && validateAndSetReceipt(e.target.files[0])}
                        />
                        <span className="text-2xl mb-2">📁</span>
                        <p className="text-cream-dark text-sm">
                          {receipt ? `${receipt.name} (${(receipt.size / 1024 / 1024).toFixed(2)} MB)` : 'Click or drag & drop your payment receipt here'}
                        </p>
                        <p className="text-cream-dark/60 text-xs mt-1">Max 5MB · JPG, PNG, or PDF</p>
                      </label>
                    </Field>

                    <div className="flex gap-3 mt-2">
                      <button type="button" onClick={() => setStep(2)} className={secondaryBtnClass}>
                        ← Back
                      </button>
                      <button type="submit" disabled={busy} className={`${primaryBtnClass} !bg-forest hover:!bg-forest-mid`}>
                        {busy ? 'Submitting…' : 'Complete Registration'}
                      </button>
                    </div>
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
                    onClick={() => toast('Please contact us on WhatsApp to reset your PIN.', 'info')}
                    className="text-xs text-gold mt-2 underline"
                  >
                    Forgot PIN?
                  </button>
                </Field>
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
