import { useEffect, useState } from 'react'
import { TRIP_START_DATE } from '../lib/constants'

function getTimeLeft(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now())
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

const UNITS: Array<{ key: keyof ReturnType<typeof getTimeLeft>; label: string }> = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hrs' },
  { key: 'minutes', label: 'Min' },
  { key: 'seconds', label: 'Sec' },
]

export default function Countdown() {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(TRIP_START_DATE))

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft(TRIP_START_DATE)), 1000)
    return () => clearInterval(interval)
  }, [])

  const hasLanded = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0

  if (hasLanded) return null

  return (
    <div className="flex flex-wrap gap-3" role="timer" aria-label="Time remaining until the trip">
      {UNITS.map((unit) => (
        <div
          key={unit.key}
          className="bg-white/10 border border-cream/20 rounded-xl px-4 py-2.5 min-w-[68px] text-center"
        >
          <div className="font-display text-2xl font-bold text-cream tabular-nums leading-none">
            {String(timeLeft[unit.key]).padStart(2, '0')}
          </div>
          <div className="text-cream-dark text-[11px] uppercase tracking-wide opacity-70 mt-1">{unit.label}</div>
        </div>
      ))}
    </div>
  )
}
