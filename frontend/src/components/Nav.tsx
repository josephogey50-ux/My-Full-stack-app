import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import logo from '../assets/images/logo.png'
import { TRIP_DATES } from '../lib/constants'

const SECTIONS = [
  { label: 'Home', id: 'top' },
  { label: 'About', id: 'about' },
  { label: 'How It Works', id: 'how-it-works' },
  { label: 'Itinerary', id: 'itinerary' },
  { label: 'Community', id: 'community' },
  { label: 'Pricing', id: 'pricing' },
  { label: 'Register', id: 'register' },
]

export default function Nav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  function goToSection(id: string) {
    setOpen(false)
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 50)
      return
    }
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <nav className="bg-ink sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <button onClick={() => goToSection('top')} className="flex items-center gap-2.5">
          <img src={logo} alt="AKWABA 001 logo" className="w-9 h-9 rounded-full object-cover" />
          <span className="hidden sm:inline text-cream-dark text-xs font-semibold tracking-wide opacity-80">
            {TRIP_DATES}
          </span>
        </button>

        <div className="hidden md:flex gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => goToSection(s.id)}
              className="px-4 py-1.5 rounded-full text-sm font-medium text-cream-dark hover:text-cream hover:bg-white/5 transition"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/dashboard"
            className="px-4 py-1.5 rounded-full text-sm font-medium text-cream-dark hover:text-cream hover:bg-white/5 transition"
          >
            My Dashboard
          </Link>
          <button
            onClick={() => goToSection('register')}
            className="bg-rust hover:bg-rust-dark text-cream px-5 py-2 rounded-full text-sm font-semibold transition"
          >
            Begin Registration
          </button>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden text-cream text-2xl leading-none">
          {open ? '✕' : '☰'}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-ink border-t border-white/10 px-6 py-4 flex flex-col gap-3">
          <span className="text-gold text-xs font-semibold tracking-wide uppercase">{TRIP_DATES}</span>
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => goToSection(s.id)} className="text-left text-cream text-base font-medium py-1">
              {s.label}
            </button>
          ))}
          <Link to="/dashboard" onClick={() => setOpen(false)} className="text-left text-cream text-base font-medium py-1">
            My Dashboard
          </Link>
        </div>
      )}
    </nav>
  )
}