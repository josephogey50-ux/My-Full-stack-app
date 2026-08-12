import { useEffect, useState } from 'react'
import { getConvoyStatus, type ConvoyStatus } from '../lib/api'
import convoyBg from '../assets/images/convoy background.jpg'

const REFRESH_MS = 45_000

const STATUS_STYLE = {
  confirmed: { bg: 'bg-forest', border: '', label: 'Confirmed', sub: '(Paid in full)' },
  deposit: { bg: 'bg-gold', border: '', label: 'Deposit Paid', sub: '(Pending balance)' },
  pending: { bg: 'bg-cream', border: 'border border-ink/15', label: 'Registered', sub: '(Payment pending)' },
} as const

function Seat({ status }: { status: keyof typeof STATUS_STYLE }) {
  const style = STATUS_STYLE[status]
  return (
    <div
      title={style.label}
      className={`w-6 h-7 rounded-md ${style.bg} ${style.border} relative shrink-0`}
    >
      <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-3 h-1.5 rounded-t-sm bg-inherit" />
    </div>
  )
}

export default function Convoy() {
  const [data, setData] = useState<ConvoyStatus | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await getConvoyStatus()
        if (!cancelled) {
          setData(result)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <section id="community" className="relative bg-cream py-20 md:py-24 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${convoyBg})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(245,237,216,0.93) 0%, rgba(245,237,216,0.88) 40%, rgba(245,237,216,0.95) 100%)',
        }}
      />
      <div className="relative max-w-6xl mx-auto px-6">
        <div className="flex flex-wrap items-start justify-between gap-8 mb-10">
          <div>
            <p className="font-mono-custom text-xs text-rust tracking-widest uppercase mb-4">Our People</p>
            <h2 className="font-display font-bold text-ink leading-tight tracking-tight mb-4 text-[clamp(30px,4.5vw,46px)]">
              The Convoy
            </h2>
            <p className="text-ink-mid text-[16px] leading-relaxed max-w-md opacity-80">
              This grows automatically as people register — every seat below is a real traveller. Colour updates the
              moment a deposit or payment is confirmed.
            </p>
          </div>

          {data && data.total > 0 && (
            <div className="flex gap-3">
              <div className="bg-forest rounded-xl px-5 py-4 text-center min-w-[92px]">
                <div className="font-display text-3xl font-bold text-cream">{data.confirmed}</div>
                <div className="text-cream-dark text-xs opacity-80 mt-1">Confirmed</div>
              </div>
              <div className="bg-gold rounded-xl px-5 py-4 text-center min-w-[92px]">
                <div className="font-display text-3xl font-bold text-ink">{data.deposit}</div>
                <div className="text-ink text-xs opacity-70 mt-1">Deposit Paid</div>
              </div>
              <div className="bg-cream-dark rounded-xl px-5 py-4 text-center min-w-[92px] border border-ink/10">
                <div className="font-display text-3xl font-bold text-ink">{data.pending}</div>
                <div className="text-ink-mid text-xs opacity-70 mt-1">Registered</div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-cream-dark rounded-2xl border border-ink/5 p-8">
          {error && (
            <p className="text-center text-ink-mid text-sm opacity-70 py-10">
              Couldn't load the convoy right now — refresh to try again.
            </p>
          )}

          {!error && data && data.total === 0 && (
            <p className="text-center text-ink-mid text-sm opacity-70 py-10">
              No one's registered yet — be the first to claim a seat.
            </p>
          )}

          {!error && data && data.total > 0 && (
            <>
              <div className="flex flex-wrap gap-2.5 justify-center mb-8">
                {data.seats.map((status, i) => (
                  <Seat key={i} status={status} />
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6 pt-6 border-t border-ink/10">
                {(Object.keys(STATUS_STYLE) as (keyof typeof STATUS_STYLE)[]).map((status) => (
                  <div key={status} className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded ${STATUS_STYLE[status].bg} ${STATUS_STYLE[status].border}`} />
                    <span className="text-ink text-sm font-medium">{STATUS_STYLE[status].label}</span>
                    <span className="text-ink-mid text-xs opacity-60">{STATUS_STYLE[status].sub}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!error && !data && <p className="text-center text-ink-mid text-sm opacity-60 py-10">Loading convoy…</p>}
        </div>

        <p className="text-center text-ink-mid text-xs opacity-60 mt-6">
          🛡️ Your seat here reflects the status on your dashboard automatically — nothing to update manually.
        </p>
      </div>
    </section>
  )
}
