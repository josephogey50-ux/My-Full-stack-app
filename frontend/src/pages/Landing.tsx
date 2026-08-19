import { useEffect, useState } from 'react'
import Nav from '../components/Nav'
import Hero from '../components/Hero'
import About from '../components/About'
import TripInfo from '../components/TripInfo'
import Itinerary from '../components/Itinerary'
import Convoy from '../components/Convoy'
import Pricing from '../components/Pricing'
import RegisterPanel from '../components/RegisterPanel'
import Footer from '../components/Footer'
import { getMyProfile, type ParticipantProfile } from '../lib/api'

export default function Landing() {
  // Checked once here (not inside Nav/RegisterPanel separately) so both
  // components agree on the same session snapshot instead of racing two
  // independent /participant/me calls. `undefined` = still checking, `null`
  // = confirmed logged out — that distinction lets RegisterPanel render its
  // normal Step 1 form immediately for the (common) anonymous visitor rather
  // than waiting on this request, while still correcting itself for a
  // returning, already-registered participant once it resolves.
  const [session, setSession] = useState<ParticipantProfile | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getMyProfile()
      .then((p) => {
        if (!cancelled) setSession(p)
      })
      .catch(() => {
        if (!cancelled) setSession(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <Nav session={session} />
      <Hero />
      <About />
      <TripInfo />
      <Itinerary />
      <Convoy />
      <Pricing />
      <RegisterPanel session={session} />
      <Footer />
    </div>
  )
}
