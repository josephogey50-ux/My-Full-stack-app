import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Countdown from '../Countdown'

describe('Countdown', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down days/hours/minutes/seconds to the trip start date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T00:00:00+01:00'))

    render(<Countdown />)

    expect(screen.getByText('05')).toBeInTheDocument()
    expect(screen.getByText('Days')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })

  it('renders nothing once the trip start date has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-01T00:00:00+01:00'))

    render(<Countdown />)

    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })
})
