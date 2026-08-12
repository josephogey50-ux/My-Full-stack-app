// Visual progress bar for a participant's trip payment. Purely presentational —
// it re-renders (and the fill width transitions) whenever `amountPaid` changes,
// which happens automatically after Dashboard's post-Paystack-redirect verify
// call refreshes the profile. No polling needed here.
export default function PaymentProgress({
  amountPaid,
  tripTotal,
}: {
  amountPaid: number
  tripTotal: number
}) {
  const safeTotal = tripTotal > 0 ? tripTotal : 0
  const percent = safeTotal > 0 ? Math.min(100, Math.max(0, (amountPaid / safeTotal) * 100)) : 0
  const isPaidInFull = safeTotal > 0 && amountPaid >= safeTotal

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-ink-mid text-xs font-semibold uppercase tracking-wide opacity-70">
          Payment Progress
        </span>
        <span className="text-ink text-sm font-bold">{percent.toFixed(0)}%</span>
      </div>

      <div
        className="h-3 w-full rounded-full bg-ink/10 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Trip payment progress"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            isPaidInFull ? 'bg-forest' : 'bg-gradient-to-r from-gold to-rust'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-ink-mid opacity-70">
        <span>₦{amountPaid.toLocaleString()} paid</span>
        <span>₦{safeTotal.toLocaleString()} total</span>
      </div>
    </div>
  )
}
