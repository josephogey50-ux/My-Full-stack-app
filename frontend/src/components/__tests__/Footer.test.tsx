import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Footer from '../Footer'

describe('Footer', () => {
  it('links to the Privacy Policy page', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy')
  })

  it('links to WhatsApp for questions', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: /chat with us on whatsapp/i })).toHaveAttribute(
      'href',
      'https://wa.me/2348064749255'
    )
  })
})
