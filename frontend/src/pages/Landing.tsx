import Nav from '../components/Nav'
import Hero from '../components/Hero'
import About from '../components/About'
import TripInfo from '../components/TripInfo'
import Itinerary from '../components/Itinerary'
import Convoy from '../components/Convoy'
import Pricing from '../components/Pricing'
import RegisterPanel from '../components/RegisterPanel'
import Footer from '../components/Footer'

export default function Landing() {
  return (
    <div>
      <Nav />
      <Hero />
      <About />
      <TripInfo />
      <Itinerary />
      <Convoy />
      <Pricing />
      <RegisterPanel />
      <Footer />
    </div>
  )
}
