import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PaymentProgress from '../PaymentProgress'

describe('PaymentProgress', () => {
  it('renders 0% when nothing has been paid', () => {
    render(<PaymentProgress amountPaid={0} tripTotal={385000} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('renders a rounded percentage for a partial payment', () => {
    render(<PaymentProgress amountPaid={100000} tripTotal={385000} />)
    // 100000 / 385000 = 25.97...% -> rounds to 26%
    expect(screen.getByText('26%')).toBeInTheDocument()
  })

  it('clamps at 100% even if amountPaid exceeds the trip total', () => {
    render(<PaymentProgress amountPaid={999999} tripTotal={385000} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('does not divide by zero when tripTotal is 0', () => {
    render(<PaymentProgress amountPaid={0} tripTotal={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
