import { Link } from 'react-router-dom'
import WhatsAppIcon from './WhatsAppIcon'

export default function Footer() {
  return (
    <footer className="bg-forest py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-cream-dark text-sm text-center opacity-80 flex items-center gap-2">
          Questions? Call or WhatsApp us:{' '}
          <a href="https://wa.me/2348064749255" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
            <WhatsAppIcon className="w-6 h-6" />
          </a>
        </p>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="text-cream-dark text-xs opacity-70 hover:opacity-100 underline">
            Privacy Policy
          </Link>
          <span className="text-cream-dark text-xs opacity-50">© {new Date().getFullYear()} Nigerian Passport Travels</span>
        </div>
      </div>
    </footer>
  )
}
