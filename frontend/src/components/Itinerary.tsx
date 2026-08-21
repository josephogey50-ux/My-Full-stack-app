import { useState } from 'react'
import itineraryBg from '../assets/images/itinerary-bg.jpg.png'

interface ScheduleStop {
  time?: string
  stop: string
  note?: string
  cost?: 'free' | 'budget' | 'moderate'
}

const COST_STYLES: Record<NonNullable<ScheduleStop['cost']>, { label: string; className: string }> = {
  free: { label: 'Free', className: 'text-emerald-400' },
  budget: { label: 'Budget', className: 'text-gold' },
  moderate: { label: 'Moderate', className: 'text-rust-light' },
}

interface ItineraryDay {
  day: number
  date: string
  location: string
  countryCode: string
  title: string
  description: string
  highlight?: string
  distanceKm: number | string
  overnightStay: string
  schedule?: ScheduleStop[]
}

const DAYS: ItineraryDay[] = [
  {
    day: 1,
    date: 'Wed, Nov 25 — Transit Day',
    location: 'Lagos → Accra',
    countryCode: 'NG → GH',
    title: 'Transit: Lagos → Accra',
    description:
      'Distance ~470 km · Expect 14–17 hrs on the road, crossing four countries — Nigeria, Benin, Togo, and Ghana — in a single push. Seme opens at 06:00 and is worst between 09:00–14:00.',
    highlight: 'Aflao border (Togo → Ghana) — the busiest and most chaotic crossing. Stay with the coach group.',
    distanceKm: 470,
    overnightStay: 'Accra (Osu or Adabraka)',
    schedule: [
      { stop: 'Assemble at terminal', note: 'Full head count before boarding' },
      { stop: 'Depart Lagos', note: 'Seme opens 06:00 and is worst 09:00–14:00' },
      { stop: 'Seme border (Nigeria → Benin)', note: 'Nigerian exit + Benin entry stamps. Change NGN→XOF here.' },
      { stop: 'Cotonou, Benin — brief comfort stop' },
      {
        stop: 'Hillacondji border (Benin → Togo)',
        note: 'Passport Stamp.',
      },
      { stop: 'Lomé, Togo — lunch stop', note: 'Coastal road, quick' },
      { stop: 'Aflao border (Togo → Ghana)', note: 'The busiest and most chaotic. Stay with the coach group. Change to GHS.' },
      { stop: 'Aflao → Accra', note: 'Final 4 hrs' },
      { stop: 'Arrive Accra', note: 'Check in, informal dinner near lodging, sleep' },
    ],
  },
  {
    day: 2,
    date: 'Thu, Nov 26 — City + Hills Day',
    location: 'Accra & Akuapem Hills',
    countryCode: 'GH',
    title: 'Accra & the Akuapem Hills: Heritage, Forts & Nightlife',
    description:
      'Long day by design (05:30–21:00+). A dawn loop into the hills for Aburi and Oboadaka Falls — a different direction from Friday\'s coastal route, so it runs first, before city traffic. Back in Accra, Osu Castle and the Du Bois Centre anchor early afternoon since both have hard closing times, then the old-town history cluster, ending with an evening (not sunset) Labadi Beach and Osu nightlife.',
    highlight: 'Osu Castle (Christiansborg) — former seat of government, guided tour + security check. Closes 16:30, so it\'s the one fixed deadline of the day.',
    distanceKm: 'Citywide + hills',
    overnightStay: 'Accra',
    schedule: [
      { time: '05:30', stop: 'Depart Accra', note: 'Early start for the hills' },
      { time: '06:15', stop: 'Aburi Botanical Gardens', note: '160-acre gardens, opened 1890', cost: 'budget' },
      { time: '07:45', stop: 'Oboadaka Falls', note: 'Short walk in from parking; no vehicle access to the falls', cost: 'budget' },
      { time: '09:00', stop: 'Drive back to Accra' },
      { time: '11:00', stop: 'Breakfast / brunch' },
      { time: '11:30', stop: 'Kwame Nkrumah Memorial Park & Mausoleum', note: "Ghana's independence story; compact, excellent museum", cost: 'budget' },
      { time: '12:30', stop: 'Independence Square / Black Star Gate', note: "Africa's third-largest public square", cost: 'free' },
      { time: '13:00', stop: 'Osu Castle (Christiansborg)', note: 'Guided tour + security check. Closes 16:30 — a fixed deadline.', cost: 'moderate' },
      { time: '14:15', stop: 'W.E.B. Du Bois Centre', note: 'His house + resting place, guided. Closes 16:00 Mon–Fri.', cost: 'budget' },
      { time: '15:00', stop: 'Lunch — chop bar', note: 'Quick bite before heading to the old town' },
      {
        time: '15:45',
        stop: 'Arts Centre (Centre for National Culture)',
        note: 'Kente, carvings, beads, drums. Bargain hard — start at 40% of ask. Go before vendors wind down.',
        cost: 'free',
      },
      { time: '16:30', stop: 'Ussher Fort and Museum', note: 'Former colonial fort/prison, slave-trade history. Right by Jamestown.', cost: 'budget' },
      {
        time: '17:10',
        stop: 'Jamestown',
        note: "Colonial lighthouse, boxing gyms, harbour, street murals. Hire a local guide — ~GHS 100–150 for the group. Don't wander it unguided. Keep it tight, light is fading.",
        cost: 'free',
      },
      { time: '18:20', stop: 'Labadi Beach', note: 'Evening visit — drumming, horse rides. Sunset window mostly gone by this point.', cost: 'budget' },
      { time: '19:30', stop: 'Dinner, Osu (Oxford Street)' },
      {
        time: '21:00',
        stop: 'Osu Night Market + nightlife',
        note: 'Sandbox Beach Club (dance/beachside), +233 Jazz Bar & Grill (live music, relaxed), Bloombar (Wednesday live drumming)',
        cost: 'free',
      },
    ],
  },
  {
    day: 3,
    date: 'Fri, Nov 27 — The Heaviest Day',
    location: 'Accra → Cape Coast',
    countryCode: 'GH',
    title: 'Central Region: Rainforest & The Castles',
    description:
      '~165 km west of Accra — the heaviest and best day of the trip. An early 05:30 departure beats Accra traffic and the Kakum school-group crush. Kakum and Cape Coast Castle stay together since they sit on the same road; Hans Cottage, Fort William, and the Arts Market balance the day with free/budget stops within minutes of the castle.',
    highlight: 'Kakum National Park Canopy Walkway — 7 suspension bridges, 350m long, up to 40m above the rainforest floor.',
    distanceKm: 165,
    overnightStay: 'Cape Coast / Elmina',
    schedule: [
      { time: '05:30', stop: 'Depart Accra', note: 'Early start beats Accra traffic and the Kakum school-group crush. The most important timing call of the trip.' },
      { time: '08:00', stop: 'Comfort/breakfast stop en route (N1 coastal highway)' },
      {
        time: '09:00',
        stop: 'Kakum National Park — Canopy Walkway',
        note: '7 suspension bridges, 350m long, up to 40m above the rainforest floor. Mandatory certified ranger guide. Steep 30-minute hike up — brief anyone with knee or heart issues.',
        cost: 'moderate',
      },
      { time: '11:30', stop: 'Hans Cottage Botel', note: 'Lunch on a deck over a live crocodile pond. 10 min from Kakum, on the way back to Cape Coast.', cost: 'free' },
      { time: '13:30', stop: 'Cape Coast Castle (UNESCO World Heritage)', note: 'Guided tour of the dungeons and the Door of No Return.', cost: 'moderate' },
      {
        time: '15:30',
        stop: 'Fort William Lighthouse',
        note: 'Exterior, cannons, panoramic views over Cape Coast town and harbour. A few blocks from the castle.',
        cost: 'budget',
      },
      { time: '16:15', stop: 'Cape Coast Arts Market / town walk', note: 'Decompression time — deliberately scheduled', cost: 'free' },
      { time: '18:00', stop: 'Check in Cape Coast or Elmina, dinner', note: 'Fresh grilled tilapia on the coast' },
    ],
  },
  {
    day: 4,
    date: 'Sat, Nov 28 — Coast & Departure',
    location: 'Elmina → Accra',
    countryCode: 'GH → NG',
    title: 'Elmina, Beach, and the Road Home',
    description:
      "~165 km back to Accra, then the overnight coach to Lagos. Elmina Castle is dropped from this plan (same fort experience as Cape Coast, the day before) — Fort Coenraadsburg fills that gap for a fraction of the cost, right above the harbour, before the fishing harbour, a beach stop, and the final shopping run.",
    highlight: 'Fort Coenraadsburg (Fort St. Jago) — hilltop fort with sweeping views over Elmina and the harbour, at a fraction of the castle entrance fees.',
    distanceKm: 165,
    overnightStay: 'Overnight coach → Lagos',
    schedule: [
      { time: '07:00', stop: 'Breakfast, check out' },
      {
        time: '08:00',
        stop: 'Fort Coenraadsburg (Fort St. Jago)',
        note: 'Hilltop fort overlooking Elmina and the harbour — good morning light. Far cheaper than the castles.',
        cost: 'budget',
      },
      { time: '09:00', stop: 'Elmina fishing harbour', note: 'Hundreds of painted canoes. One of the most photogenic scenes in Ghana.', cost: 'free' },
      { time: '10:00', stop: 'Brenu Akyinim Beach (~25 min west)', note: 'Clean, wide, uncrowded stretch. Swim, eat, decompress.', cost: 'free' },
      { time: '13:00', stop: 'Lunch at the beach, then depart for Accra' },
      {
        time: '17:00',
        stop: 'Accra — final shopping (Accra Mall or Makola) + dinner',
        note: 'Buy shea butter, kente, black soap, Ghanaian chocolate',
        cost: 'free',
      },
      { time: '20:00', stop: 'Board overnight coach to Lagos', note: 'Return booking confirmed on Day 2 — never left to Day 4' },
    ],
  },
  {
    day: 5,
    date: 'Sun, Nov 29 — Arrival',
    location: 'Lagos',
    countryCode: 'NG',
    title: 'Arrive Lagos',
    description:
      'The overnight coach rolls back into Lagos, closing the loop on four countries and four days on the road — twelve strangers who aren\'t strangers anymore.',
    distanceKm: 0,
    overnightStay: 'Trip Complete',
    schedule: [{ time: '10:00–13:00', stop: 'Arrive Lagos', note: 'Convoy disbands — until the next one.' }],
  },
]

export default function Itinerary() {
  const [activeDay, setActiveDay] = useState(1)
  const day = DAYS.find((d) => d.day === activeDay) ?? DAYS[0]

  return (
    <section id="itinerary" className="relative bg-ink py-20 md:py-24 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${itineraryBg})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(28,20,16,0.94) 0%, rgba(28,20,16,0.90) 40%, rgba(28,20,16,0.97) 100%)',
        }}
      />
      <div className="relative max-w-6xl mx-auto px-6">
        <p className="font-mono-custom text-xs text-gold tracking-widest uppercase mb-4">Day-By-Day</p>
        <h2 className="font-display font-bold text-cream leading-tight tracking-tight mb-8 text-[clamp(30px,4.5vw,46px)]">
          The Route
        </h2>

        <div className="flex flex-wrap gap-2 mb-8">
          {DAYS.map((d) => (
            <button
              key={d.day}
              onClick={() => setActiveDay(d.day)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                d.day === activeDay
                  ? 'bg-rust text-cream'
                  : 'border border-cream/25 text-cream-dark hover:border-cream/50'
              }`}
            >
              Day {d.day}
            </button>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-[1.6fr_1fr]">
          <div className="bg-forest rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-5">
              {day.countryCode && (
                <span className="font-mono-custom text-xs text-cream-dark opacity-70 border border-cream/20 rounded px-1.5 py-0.5">
                  {day.countryCode}
                </span>
              )}
              <div>
                <div className="font-mono-custom text-xs text-gold uppercase tracking-widest">{day.date}</div>
                <div className="text-cream font-semibold">{day.location}</div>
              </div>
            </div>

            <h3 className="font-display text-2xl font-bold text-cream mb-3">{day.title}</h3>
            <p className="text-cream-dark text-[15px] leading-relaxed opacity-85 mb-6">{day.description}</p>

            {day.schedule && day.schedule.length > 0 && (
              <div className="flex flex-col gap-3.5 mb-6 border-t border-cream/10 pt-6">
                {day.schedule.map((s, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    {s.time && (
                      <span className="font-mono-custom text-xs text-gold shrink-0 w-[74px] pt-0.5">{s.time}</span>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-cream text-sm font-semibold">{s.stop}</span>
                        {s.cost && (
                          <span className={`font-mono-custom text-[10px] uppercase tracking-widest ${COST_STYLES[s.cost].className}`}>
                            {COST_STYLES[s.cost].label}
                          </span>
                        )}
                      </div>
                      {s.note && <div className="text-cream-dark text-xs leading-relaxed opacity-65 mt-0.5">{s.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {day.highlight && (
              <div className="bg-forest-mid rounded-xl px-5 py-4">
                <div className="font-mono-custom text-[11px] text-gold uppercase tracking-widest mb-1.5">
                  Highlight Stop
                </div>
                <div className="text-gold-light font-semibold flex items-center gap-2">⭐ {day.highlight}</div>
              </div>
            )}
          </div>

          <div className="grid gap-5">
            <div className="bg-forest rounded-2xl p-6">
              <div className="font-mono-custom text-[11px] text-gold uppercase tracking-widest mb-2">Distance</div>
              <div className="font-display text-3xl font-bold text-cream">
                {typeof day.distanceKm === 'number' ? `${day.distanceKm} km` : day.distanceKm}
              </div>
            </div>

            <div className="bg-forest rounded-2xl p-6">
              <div className="font-mono-custom text-[11px] text-gold uppercase tracking-widest mb-2">
                Overnight Stay
              </div>
              <div className="font-display text-xl font-bold text-cream">{day.overnightStay}</div>
            </div>

            <div className="bg-forest rounded-2xl p-6">
              <div className="font-mono-custom text-[11px] text-gold uppercase tracking-widest mb-3">Full Route</div>
              <div className="flex flex-col gap-1">
                {DAYS.map((d) => (
                  <button
                    key={d.day}
                    onClick={() => setActiveDay(d.day)}
                    className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                      d.day === activeDay ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          d.day === activeDay ? 'bg-rust text-cream' : 'bg-white/10 text-cream-dark'
                        }`}
                      >
                        {d.day}
                      </span>
                      <span className={`text-sm font-medium ${d.day === activeDay ? 'text-cream' : 'text-cream-dark opacity-80'}`}>
                        {d.location}
                      </span>
                    </span>
                    {d.countryCode && <span className="text-[11px] text-cream-dark opacity-50">{d.countryCode}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
