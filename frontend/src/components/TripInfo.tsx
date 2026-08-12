function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </svg>
  )
}

function LogisticsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M4 13h16" />
    </svg>
  )
}

function PaymentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 14.5h4" />
    </svg>
  )
}

const STEPS = [
  { icon: <ProfileIcon />, title: 'Create Your Profile', desc: 'Name, email, WhatsApp number and a 4-digit account PIN.' },
  { icon: <LogisticsIcon />, title: 'Travel Logistics', desc: 'Document type, room preference, and an emergency contact.' },
  { icon: <PaymentIcon />, title: 'Checkout', desc: 'Choose a payment plan, pay by bank transfer, and upload your receipt.' },
]

const DOC_TYPES = [
  { icon: '📕', label: 'International Passport' },
  { icon: '📗', label: 'ECOWAS Passport' },
  { icon: '🆔', label: 'NIN' },
]

export default function TripInfo() {
  return (
    <section id="how-it-works" className="bg-cream py-20 md:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <p className="font-mono-custom text-xs text-rust tracking-widest uppercase mb-4">Registration</p>
        <h2 className="font-display font-bold text-ink leading-tight tracking-tight mb-4 text-[clamp(30px,4.5vw,46px)]">
          How It Works
        </h2>
        <p className="text-ink-mid text-[16px] leading-relaxed max-w-xl mb-14 opacity-80">
          Three short steps — your progress is saved automatically so you can pick up right where you left off.
        </p>

        <div className="grid gap-6 md:grid-cols-3 mb-16">
          {STEPS.map((step, i) => (
            <div key={step.title} className="bg-cream-dark rounded-2xl p-7 border border-ink/5">
              <div className="w-11 h-11 rounded-full bg-forest flex items-center justify-center text-cream mb-5">
                {step.icon}
              </div>
              <div className="font-mono-custom text-xs text-rust uppercase tracking-widest mb-2">Step {i + 1}</div>
              <h3 className="font-display text-xl font-semibold text-ink mb-2">{step.title}</h3>
              <p className="text-ink-mid text-sm leading-relaxed opacity-80">{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-ink rounded-2xl p-8">
            <div className="font-mono-custom text-xs text-gold uppercase tracking-widest mb-4">Accepted Documents</div>
            <div className="flex flex-wrap gap-3">
              {DOC_TYPES.map((d) => (
                <div key={d.label} className="flex items-center gap-2 bg-white/5 rounded-full px-4 py-2">
                  <span>{d.icon}</span>
                  <span className="text-cream text-sm">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-ink rounded-2xl p-8">
            <div className="font-mono-custom text-xs text-gold uppercase tracking-widest mb-4">Bank Transfer Details</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-cream-dark">
                <span className="opacity-70">Bank</span>
                <span className="text-cream font-semibold">MONIEPOINT</span>
              </div>
              <div className="flex justify-between text-cream-dark">
                <span className="opacity-70">Account Number</span>
                <span className="text-cream font-semibold">6166119553</span>
              </div>
              <div className="flex justify-between text-cream-dark">
                <span className="opacity-70">Account Name</span>
                <span className="text-cream font-semibold">TrootServices</span>
              </div>
            </div>
            <p className="text-gold-light text-xs mt-4 leading-relaxed opacity-90">
              ⚠️ After payment, send your receipt via WhatsApp to{' '}
              <a href="https://wa.me/2348064749255" target="_blank" rel="noopener" className="underline">
                +234 806 474 9255
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
