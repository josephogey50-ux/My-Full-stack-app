import { Link } from 'react-router-dom'
import logo from '../assets/images/logo.png'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <img src={logo} alt="AKWABA 001 logo" className="w-12 h-12 rounded-full object-cover mx-auto mb-6" />
        <div className="font-display text-6xl font-bold text-gold mb-4">404</div>
        <h1 className="font-display text-2xl font-bold text-cream mb-3">Page Not Found</h1>
        <p className="text-cream-dark text-sm opacity-80 mb-8">
          The page you're looking for doesn't exist or may have moved. Let's get you back on the road.
        </p>
        <Link
          to="/"
          className="inline-block bg-rust hover:bg-rust-dark text-cream px-8 py-3.5 rounded-full text-base font-bold transition"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}
