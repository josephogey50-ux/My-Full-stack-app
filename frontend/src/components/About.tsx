import { TRIP_DATES } from '../lib/constants'

const HIGHLIGHTS = [
  {
    icon: '🧭',
    title: 'Guided, Not Rushed',
    desc: 'A planned route and a team on the ground handling logistics, so you can actually be present instead of stuck sorting out the next leg.',
  },
  {
    icon: '🤝',
    title: 'Travel With Your People',
    desc: 'Every seat in the convoy is filled by someone who signed up the same way you did — no strangers-only tour bus energy.',
  },
  {
    icon: '💬',
    title: 'A Community, Not Just a Trip',
    desc: 'Stay connected on WhatsApp before, during, and after — trip updates, questions answered, and a group that keeps in touch afterward.',
  },
]

export default function About() {
  return (
    <section id="about" className="bg-ink py-20 md:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid gap-14 md:grid-cols-2 items-start">
          <div>
            <div className="flex items-center flex-wrap gap-3 mb-4">
              <p className="font-mono-custom text-xs text-gold tracking-widest uppercase">About The Trip</p>
              <span className="text-cream-dark text-xs opacity-40">·</span>
              <span className="text-gold-light text-xs font-semibold tracking-wide">{TRIP_DATES}</span>
            </div>
            <h2 className="font-display font-bold text-cream leading-tight tracking-tight mb-6 text-[clamp(30px,4.5vw,46px)]">
              12 People, One Circle
            </h2>
            <p className="text-cream-dark text-[16px] leading-relaxed opacity-85 mb-5">
              Right now, you're twelve strangers scattered across the map. You've never met, never spoken, don't
              know each other's names. That's about to change.
            </p>
            <p className="text-cream-dark text-[16px] leading-relaxed opacity-85 mb-5">
              Akwaba is a road trip from Lagos to Accra, across four countries, over four unforgettable days. But
              that's just the surface of it. Underneath, it's an experiment in connection: what happens when twelve
              people who start out as strangers end up sharing borders, meals, stories, and one long road together?
            </p>
            <p className="text-cream-dark text-[16px] leading-relaxed opacity-85 mb-5">
              Every mile you cross, you cross as a group. Every border becomes a shared milestone. Every stop from
              the first city out of Lagos to the final arrival in Accra adds another chapter to a story that
              belongs to all twelve of you, not just one.
            </p>
            <p className="text-cream-dark text-[16px] leading-relaxed opacity-85 mb-5">
              By the time you reach Accra, you won't be twelve strangers anymore. You'll be eleven new friends, one
              shared journey, and a bond that doesn't end when the car stops.
            </p>
            <p className="text-cream-dark text-[16px] leading-relaxed opacity-85 mb-5">
              Akwaba means welcome in Twi. Consider this yours.
            </p>
            <p className="font-display text-gold-light text-lg font-semibold mb-5">
              12 seats; 1 story — and it's still looking for its cast.
            </p>
            <p className="text-cream-dark text-[16px] leading-relaxed opacity-85">
              Full day-by-day stops are laid out in{' '}
              <a href="#itinerary" className="text-gold underline underline-offset-2">
                The Route
              </a>
              , and you'll meet everyone else in{' '}
              <a href="#community" className="text-gold underline underline-offset-2">
                The Convoy
              </a>{' '}
              below.
            </p>
          </div>

          <div className="grid gap-5">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="bg-forest/40 border border-cream/10 rounded-2xl p-6 flex gap-4">
                <div className="w-11 h-11 rounded-full bg-forest flex items-center justify-center text-lg shrink-0">
                  {h.icon}
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-cream mb-1.5">{h.title}</h3>
                  <p className="text-cream-dark text-sm leading-relaxed opacity-75">{h.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
