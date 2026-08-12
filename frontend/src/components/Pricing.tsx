const INCLUSIONS = [
  { icon: '🛏️', label: 'Room (shared accommodation)' },
  { icon: '🚐', label: 'Group convoy transport' },
  { icon: '🍳', label: 'Daily breakfast' },
  { icon: '💬', label: 'WhatsApp community access' },
  { icon: '🎉', label: 'Night out party' },
  { icon: '📍', label: 'Tour site visits' },
]

const PLANS = [
  {
    name: 'Full Payment',
    price: '₦385,000',
    desc: 'Pay the full trip cost up front — one transfer, nothing else to track.',
    featured: true,
  },
  {
    name: 'Installment Plan',
    price: '₦100,000',
    suffix: 'min. deposit',
    desc: 'Secure your spot with a deposit, then clear the balance from your dashboard before departure.',
    featured: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="bg-cream-dark py-20 md:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <p className="font-mono-custom text-xs text-rust tracking-widest uppercase mb-4 text-center">Packages</p>
        <h2 className="font-display font-bold text-ink leading-tight tracking-tight mb-4 text-center text-[clamp(30px,4.5vw,46px)]">
          Choose Your Plan
        </h2>
        <p className="text-ink-mid text-[16px] text-center max-w-lg mx-auto mb-14 opacity-75">
          Pay in full, or spread the cost with an installment plan. Both are managed from your dashboard.
        </p>

        <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-9 relative transition ${
                plan.featured ? 'bg-forest shadow-[0_24px_64px_rgba(26,58,46,0.3)]' : 'bg-ink'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gold text-ink text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
                  Most Popular
                </div>
              )}
              <div className="font-mono-custom text-xs text-gold uppercase tracking-widest mb-3">{plan.name}</div>
              <div className="font-display text-4xl font-bold text-cream mb-1">{plan.price}</div>
              {plan.suffix && <div className="text-cream-dark text-sm mb-4 opacity-70">{plan.suffix}</div>}
              {!plan.suffix && <div className="mb-4" />}
              <p className="text-cream-dark text-sm leading-relaxed mb-7 opacity-85">{plan.desc}</p>
              <button
                onClick={() => document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full py-3.5 rounded-full text-sm font-bold transition bg-rust hover:bg-rust-dark text-cream"
              >
                Select This Plan →
              </button>
            </div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto mt-10 bg-ink rounded-2xl p-8">
          <div className="font-mono-custom text-xs text-gold uppercase tracking-widest mb-5 text-center">
            Every Plan Includes
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            {INCLUSIONS.map((item) => (
              <div key={item.label} className="flex items-center gap-2.5">
                <span className="text-lg shrink-0">{item.icon}</span>
                <span className="text-cream-dark text-sm leading-snug opacity-90">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-ink-mid text-sm opacity-65 mt-10">
          💳 Payment receipts are reviewed by the organizing team · Balance can be settled anytime from your dashboard
        </p>
      </div>
    </section>
  )
}
