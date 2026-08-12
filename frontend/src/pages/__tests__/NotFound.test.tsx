import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotFound from '../NotFound'

describe('NotFound', () => {
  it('shows a 404 message with a way back home', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    )
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('Page Not Found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })
})
