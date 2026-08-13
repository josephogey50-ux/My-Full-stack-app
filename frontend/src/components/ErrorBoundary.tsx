import { Component, type ErrorInfo, type ReactNode } from 'react'
import logo from '../assets/images/logo.png'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// ─── Top-level render-error guard ───
// Without this, an uncaught error thrown during render anywhere in the tree
// unmounts the whole React app and leaves the visitor staring at a blank
// white page with no way back — worst possible failure mode for a
// registration/payment flow. This only catches render/lifecycle errors (per
// React's error boundary contract); it doesn't catch errors inside event
// handlers or async code, which are already handled locally via try/catch +
// toast throughout the app.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ink flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <img src={logo} alt="AKWABA 001 logo" className="w-12 h-12 rounded-full object-cover mx-auto mb-6" />
            <h1 className="font-display text-2xl font-bold text-cream mb-3">Something went wrong</h1>
            <p className="text-cream-dark text-sm opacity-80 mb-8">
              We hit an unexpected error. Reloading the page usually fixes it — if it keeps happening, reach out to us
              on WhatsApp.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-block bg-rust hover:bg-rust-dark text-cream px-8 py-3.5 rounded-full text-base font-bold transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
