import { useEffect, useState } from 'react'
import heroBanner from '../assets/images/hero-banner.jpg'
import { TRIP_DATES } from '../lib/constants'

const TAGLINES = [
  'Step beyond your borders. Travel is the education no classroom can offer — discover new cultures, forge real connections, and journey alongside people who share your hunger for the world.',
  'Some trips change your passport. The best ones change your perspective. Join a community of like-minded travellers and experience life the way it was meant to be — without borders.',
  'Travel is the only thing you spend money on that makes you richer. Come explore, connect, and grow alongside people who see the world the way you do.',
  'There is a whole world outside your street. Come experience it — new cultures, new connections, and people who understand exactly why you had to go.',
]

export default function Hero() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((i) => (i + 1) % TAGLINES.length)
        setVisible(true)
      }, 500)
    }, 4500)
    return () => clearInterval(interval)
  }, [])

  return (
    <section id="top" className="relative min-h-[80vh] flex items-end overflow-hidden bg-forest">
      <div
  className="absolute inset-0 bg-cover bg-center"
  style={{ backgroundImage: `url(${heroBanner})` }}
/>
<div
  className="absolute inset-0"
  style={{
    background:
      'radial-gradient(circle at 30% 20%, rgba(212,146,10,0.28), transparent 45%), linear-gradient(160deg, rgba(26,58,46,0.88) 0%, rgba(38,77,59,0.82) 55%, rgba(28,20,16,0.94) 130%)',
  }}
/>
      
      <div className="relative max-w-6xl mx-auto px-6 pb-16 pt-32 w-full">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="inline-flex items-center gap-2 bg-rust/90 px-3.5 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-gold-light inline-block" style={{ animation: 'pulse-dot 2s infinite' }} />
            <span className="text-cream text-[13px] font-semibold tracking-wide uppercase">Registration Open</span>
          </div>
          <div className="inline-flex items-center gap-2 bg-white/10 border border-cream/20 px-3.5 py-1.5 rounded-full">
            <span className="text-cream text-[13px] font-semibold tracking-wide uppercase">{TRIP_DATES}</span>
          </div>
        </div>

        <h1 className="font-display font-bold text-cream leading-[0.98] mb-6 max-w-3xl tracking-tight text-[clamp(38px,7vw,84px)]">
          Nigerian Passport
          <br />
          Travels — <span className="text-gold italic">Akwaba 001</span>
        </h1>

        <p
          className="text-cream-dark max-w-xl leading-relaxed mb-9 text-[clamp(15px,2vw,18px)] opacity-90 transition-opacity duration-500"
          style={{ opacity: visible ? 0.9 : 0 }}
        >
          {TAGLINES[index]}
        </p>

        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={() => document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-rust hover:bg-rust-dark text-cream px-8 py-3.5 rounded-full text-base font-bold transition"
          >
            Begin Registration →
          </button>
          <button
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            className="border border-cream/40 hover:border-cream/80 text-cream px-8 py-3.5 rounded-full text-base font-semibold transition"
          >
            How It Works
          </button>
        </div>
      </div>
    </section>
  )
}
