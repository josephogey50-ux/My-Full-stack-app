import { useEffect, useState } from 'react'
import {
  ApiError,
  adminAuditLog,
  adminDownloadRegistrantsCsv,
  adminFetchReceiptBlobUrl,
  adminListRegistrants,
  adminLogin,
  adminLogout,
  adminStats,
  adminUpdatePayment,
  type AuditLogEntry,
  type RegistrantSummary,
} from '../lib/api'
import { useToast } from '../components/Toast'

const PAYMENT_STATUSES = ['Pending', 'Paid', 'Partial', 'Refunded']

export default function Admin() {
  // Auth now lives in an httpOnly session cookie set by the backend, not
  // anything this component can read — so "am I logged in" is answered by
  // asking the server, not by checking client-side storage.
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    adminStats()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
  }, [])

  if (authed === null) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <p className="text-cream-dark text-sm">Loading…</p>
      </div>
    )
  }

  if (!authed) {
    return <AdminLogin onSuccess={() => setAuthed(true)} />
  }
  return <AdminDashboard onLogout={() => setAuthed(false)} />
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const toast = useToast()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await adminLogin(key.trim(), name.trim())
      onSuccess()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Invalid admin key.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-6">
      <form onSubmit={submit} className="bg-forest-mid rounded-2xl p-10 w-full max-w-sm border border-white/5">
        <h1 className="font-display text-2xl font-bold text-cream mb-2">Organizer Access</h1>
        <p className="text-cream-dark text-sm opacity-70 mb-6">
          Enter your name and the admin key. Your name is recorded against any changes you make, so we know who did
          what.
        </p>
        <input
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full bg-white/5 border border-white/15 focus:border-gold rounded-lg px-4 py-3 text-cream text-sm mb-3"
        />
        <input
          type="password"
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Admin key"
          className="w-full bg-white/5 border border-white/15 focus:border-gold rounded-lg px-4 py-3 text-cream text-sm mb-4"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-rust hover:bg-rust-dark disabled:opacity-60 text-cream py-3 rounded-full text-sm font-bold transition"
        >
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState<'registrants' | 'activity'>('registrants')
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminStats>> | null>(null)
  const [registrants, setRegistrants] = useState<RegistrantSummary[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<RegistrantSummary | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    void loadStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadRegistrants()
  }, [page, status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStats() {
    try {
      setStats(await adminStats())
    } catch (err) {
      handleAuthError(err)
    }
  }

  async function loadRegistrants() {
    setLoading(true)
    try {
      const result = await adminListRegistrants({ q, status: status || undefined, page, limit: 25 })
      setRegistrants(result.registrants)
      setTotal(result.total)
      setPages(result.pages)
    } catch (err) {
      handleAuthError(err)
    } finally {
      setLoading(false)
    }
  }

  function handleAuthError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      toast('Admin session invalid. Please re-enter the key.', 'error')
      onLogout()
      return
    }
    toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error')
  }

  function search(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    void loadRegistrants()
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await adminDownloadRegistrantsCsv({ q: q || undefined, status: status || undefined })
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not export registrants.', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <nav className="bg-ink sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-display text-xl font-semibold text-cream">AKWABA 001 · Organizer</span>
          <button
            onClick={() => {
              void adminLogout()
              onLogout()
            }}
            className="text-cream-dark text-sm font-medium hover:text-cream transition"
          >
            Log Out
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {stats && (
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            <StatCard label="Total Registrants" value={stats.total} />
            <StatCard
              label="Fully Registered"
              value={stats.byStep.find((s) => s._id >= 4)?.count ?? 0}
            />
            <StatCard label="Paid in Full" value={stats.byStatus.find((s) => s._id === 'Paid')?.count ?? 0} />
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('registrants')}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              tab === 'registrants' ? 'bg-forest text-cream' : 'bg-white border border-ink/15 text-ink-mid'
            }`}
          >
            Registrants
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              tab === 'activity' ? 'bg-forest text-cream' : 'bg-white border border-ink/15 text-ink-mid'
            }`}
          >
            Activity Log
          </button>
        </div>

        {tab === 'activity' ? (
          <ActivityLog />
        ) : (
        <>
        <form onSubmit={search} className="flex flex-wrap gap-3 mb-6">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, WhatsApp number…"
            className="flex-1 min-w-[220px] bg-white border border-ink/15 rounded-lg px-4 py-2.5 text-sm text-ink"
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="bg-white border border-ink/15 rounded-lg px-4 py-2.5 text-sm text-ink"
          >
            <option value="">All statuses</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="submit" className="bg-forest text-cream px-5 py-2.5 rounded-lg text-sm font-semibold">
            Search
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className="bg-white border border-ink/15 text-ink disabled:opacity-60 px-5 py-2.5 rounded-lg text-sm font-semibold"
          >
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-ink/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-dark text-ink-mid text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Step</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Paid</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-mid">
                    Loading…
                  </td>
                </tr>
              ) : registrants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-mid">
                    No registrants found.
                  </td>
                </tr>
              ) : (
                registrants.map((r) => (
                  <tr key={r.emailAddress} className="border-t border-ink/5 hover:bg-cream-dark/40">
                    <td className="px-4 py-3 text-ink font-medium">
                      {r.firstName} {r.surname}
                    </td>
                    <td className="px-4 py-3 text-ink-mid">
                      <div>{r.emailAddress}</div>
                      <div className="text-xs opacity-70">{r.whatsAppNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-mid">{r.currentStep >= 4 ? 'Complete' : r.currentStep}</td>
                    <td className="px-4 py-3 text-ink-mid">{r.plan || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.paymentStatus} />
                    </td>
                    <td className="px-4 py-3 text-ink-mid">₦{Number(r.amountPaid || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelected(r)} className="text-rust text-xs font-semibold hover:underline">
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-ink-mid">
          <span>
            {total} registrant{total === 1 ? '' : 's'} · page {page} of {Math.max(1, pages)}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-ink/15 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-ink/15 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
        </>
        )}
      </main>

      {selected && (
        <RegistrantDrawer
          registrant={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setRegistrants((prev) => prev.map((r) => (r.emailAddress === updated.emailAddress ? updated : r)))
            setSelected(updated)
          }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-ink/10 p-5">
      <div className="text-ink-mid text-xs opacity-60 mb-1">{label}</div>
      <div className="font-display text-3xl font-bold text-ink">{value}</div>
    </div>
  )
}

function ActivityLog() {
  const toast = useToast()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const result = await adminAuditLog({ page, limit: 25 })
      setEntries(result.entries)
      setTotal(result.total)
      setPages(result.pages)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load the activity log.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // load()'s setState calls only run after the awaited request resolves,
    // not synchronously in this effect body — standard fetch-on-page-change.
    void load() // eslint-disable-line react-hooks/set-state-in-effect
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  function describe(entry: AuditLogEntry) {
    if (entry.action === 'update_payment') {
      const before = entry.before as { paymentStatus?: string; amountPaid?: number }
      const after = entry.after as { paymentStatus?: string; amountPaid?: number }
      return `Payment ${before.paymentStatus ?? '—'} (₦${Number(before.amountPaid || 0).toLocaleString()}) → ${
        after.paymentStatus ?? '—'
      } (₦${Number(after.amountPaid || 0).toLocaleString()})`
    }
    return entry.action
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-ink/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-dark text-ink-mid text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Admin</th>
              <th className="px-4 py-3 font-semibold">Registrant</th>
              <th className="px-4 py-3 font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-mid">
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-mid">
                  No activity recorded yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry._id} className="border-t border-ink/5">
                  <td className="px-4 py-3 text-ink-mid whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-ink font-medium">{entry.adminName}</td>
                  <td className="px-4 py-3 text-ink-mid">{entry.targetEmail}</td>
                  <td className="px-4 py-3 text-ink-mid">{describe(entry)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-ink-mid">
        <span>
          {total} entr{total === 1 ? 'y' : 'ies'} · page {page} of {Math.max(1, pages)}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-ink/15 disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-ink/15 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const colors: Record<string, string> = {
    Paid: 'bg-forest text-cream',
    Partial: 'bg-gold text-ink',
    Pending: 'bg-cream-dark text-ink-mid',
    Refunded: 'bg-rust/15 text-rust',
  }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors[status || 'Pending'] || colors.Pending}`}>
      {status || 'Pending'}
    </span>
  )
}

function RegistrantDrawer({
  registrant,
  onClose,
  onUpdated,
}: {
  registrant: RegistrantSummary
  onClose: () => void
  onUpdated: (r: RegistrantSummary) => void
}) {
  const toast = useToast()
  const [status, setStatus] = useState(registrant.paymentStatus || 'Pending')
  const [amountPaid, setAmountPaid] = useState(String(registrant.amountPaid || 0))
  const [busy, setBusy] = useState(false)
  const [receiptLoading, setReceiptLoading] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const updated = await adminUpdatePayment(registrant.emailAddress, {
        paymentStatus: status,
        amountPaid: Number(amountPaid),
      })
      toast('Payment record updated.', 'success')
      onUpdated(updated)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update payment.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function viewReceipt() {
    setReceiptLoading(true)
    try {
      const url = await adminFetchReceiptBlobUrl(registrant.emailAddress)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load receipt.', 'error')
    } finally {
      setReceiptLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={onClose}>
      <div className="bg-white w-full max-w-md h-full p-8 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="text-ink-mid text-sm mb-6">
          ✕ Close
        </button>
        <h2 className="font-display text-xl font-bold text-ink mb-1">
          {registrant.firstName} {registrant.surname}
        </h2>
        <p className="text-ink-mid text-sm mb-6">{registrant.emailAddress}</p>

        <div className="space-y-3 text-sm mb-8">
          <Row label="WhatsApp" value={registrant.whatsAppNumber} />
          <Row label="Step" value={registrant.currentStep >= 4 ? 'Complete' : String(registrant.currentStep)} />
          <Row label="Document" value={registrant.docType || '—'} />
          <Row label="Room Preference" value={registrant.roomPreference === 'paired' ? 'Paired' : 'Solo (matched)'} />
          {registrant.roommateName && <Row label="Roommate" value={registrant.roommateName} />}
          <Row label="Plan" value={registrant.plan || '—'} />
        </div>

        {registrant.hasReceipt && (
          <button
            onClick={viewReceipt}
            disabled={receiptLoading}
            className="mb-8 bg-forest hover:bg-forest-mid disabled:opacity-60 text-cream px-5 py-2.5 rounded-full text-sm font-semibold transition"
          >
            {receiptLoading ? 'Loading…' : 'View Receipt'}
          </button>
        )}

        <div className="bg-cream-dark rounded-xl p-5">
          <h3 className="font-semibold text-ink text-sm mb-4">Update Payment</h3>
          <label className="block mb-3">
            <span className="block text-xs text-ink-mid mb-1">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2 text-sm">
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block mb-4">
            <span className="block text-xs text-ink-mid mb-1">Amount Paid (₦)</span>
            <input
              type="number"
              min={0}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full bg-white border border-ink/15 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={save}
            disabled={busy}
            className="w-full bg-rust hover:bg-rust-dark disabled:opacity-60 text-cream py-2.5 rounded-full text-sm font-bold transition"
          >
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink/5 pb-2">
      <span className="text-ink-mid opacity-70">{label}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  )
}
