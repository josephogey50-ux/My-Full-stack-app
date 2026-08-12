import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import logo from '../assets/images/logo.png'
import { resetPin, ApiError } from '../lib/api'
import { useToast } from '../components/Toast'

export default function ResetPin() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPin !== confirmPin) {
      toast('PINs do not match.', 'error')
      return
    }
    setBusy(true)
    try {
      await resetPin(token, newPin)
      setDone(true)
      toast('PIN reset! You can now log in.', 'success')
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reset your PIN. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-forest-mid rounded-2xl p-8 border border-white/5">
        <div className="flex items-center gap-2.5 mb-6">
          <img src={logo} alt="AKWABA 001 logo" className="w-9 h-9 rounded-full object-cover" />
          <span className="font-display text-xl font-semibold text-cream tracking-tight">AKWABA 001</span>
        </div>

        {!token ? (
          <p className="text-cream-dark text-sm">
            This reset link is missing its token. Please use the link from your email, or request a new one from
            the login tab on the homepage.
          </p>
        ) : done ? (
          <p className="text-cream-dark text-sm">Your PIN has been reset. Redirecting you to log in…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h1 className="font-display text-xl font-semibold text-cream mb-1">Set a New PIN</h1>
            <label className="block">
              <span className="block text-cream-dark text-[13px] font-semibold mb-1.5 tracking-wide">New 4-Digit PIN</span>
              <div className="flex gap-2">
                <input
                  required
                  type={pinVisible ? 'text' : 'password'}
                  pattern="[0-9]{4}"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
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
            </label>
            <label className="block">
              <span className="block text-cream-dark text-[13px] font-semibold mb-1.5 tracking-wide">Confirm PIN</span>
              <input
                required
                type={pinVisible ? 'text' : 'password'}
                pattern="[0-9]{4}"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="••••"
                className={inputClass}
              />
            </label>
            <button type="submit" disabled={busy} className={primaryBtnClass}>
              {busy ? 'Resetting…' : 'Reset PIN'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-white/5 border border-white/15 focus:border-gold rounded-lg px-4 py-3 text-cream text-[15px] placeholder:text-cream-dark/40 transition'
const primaryBtnClass =
  'bg-rust hover:bg-rust-dark disabled:opacity-60 text-cream py-3.5 rounded-full text-[15px] font-bold transition'
