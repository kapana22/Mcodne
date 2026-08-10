'use client'
import { useEffect, useMemo, useState } from 'react'
import { CountUp } from '@/components/CountUp'
import { EmptyState } from '@/components/EmptyState'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { PageHeader } from '@/components/tutor/PageHeader'
import { sessionDate } from '@/components/workspace/sessionTime'
import { dayKeyInTz } from '@/lib/bookings'
import { KA_MONTHS_LONG } from '@/lib/kaDate'
import { PAYMENTS_LIVE, TUTOR_PAYOUT_PCT, COMMISSION_PCT } from '@/lib/flags'

type Tx = {
  id: string
  ref: string
  topic: string
  startAt: string
  durationMin: number
  gross: number
  net: number
  payoutStatus: 'PENDING' | 'RELEASED' | 'REFUNDED'
  student: { id: string; fullName: string; avatarUrl?: string | null } | null
}

type Earnings = {
  totalEarned: number
  pendingPayout: number
  completedCount: number
  thisMonth?: { earned: number; count: number }
  transactions: Tx[]
}

const fmtGel = (n: number) => `₾${n.toLocaleString('en-US')}`
// Session date in TBILISI — a 00:30 session must not file itself under the
// previous day for an expert reading from another zone.
const fmtDate = (iso: string) => {
  try {
    return sessionDate(iso, { year: true })
  } catch { return iso }
}

// Badges: hairline border + colored text, NO pastel fill (design canon) — the
// PENDING case was already correct; RELEASED/REFUNDED carried `bg-success-50` /
// `bg-ink-100`. Wording is gated on PAYMENTS_LIVE because „გადარიცხულია“ /
// „დაბრუნდა“ assert that money moved, which is false while bookings are free.
const payoutLabel = (s: Tx['payoutStatus']) =>
  s === 'PENDING' ? { l: 'მოლოდინში', cls: 'bg-transparent text-ink-500 border-ink-200' }
  : s === 'RELEASED' ? { l: PAYMENTS_LIVE ? 'გადარიცხულია' : 'დასრულდა', cls: 'bg-transparent text-success-700 border-success-200' }
  : { l: PAYMENTS_LIVE ? 'დაბრუნდა' : 'ანულირდა', cls: 'bg-transparent text-ink-600 border-ink-200' }

// The gross/net split only means something once a commission is actually
// withheld. Until then the two columns would print identical numbers.
const SHOW_GROSS = PAYMENTS_LIVE

export default function TutorEarningsPage() {
  const [data, setData] = useState<Earnings | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    try {
      const eRes = await fetch('/api/tutor/earnings')
      // Expired session / wrong role → bounce to signin instead of crashing
      // on `data.transactions.length` with an error body.
      if (eRes.status === 401 || eRes.status === 403) {
        window.location.href = '/signin?redirect=/tutor/earnings'
        return
      }
      if (!eRes.ok) throw new Error('load failed')
      const e = await eRes.json()
      // Never trust the shape blindly — default the list so .map/.length are safe.
      setData({ ...e, transactions: Array.isArray(e?.transactions) ? e.transactions : [] })
      setErr(null)
    } catch {
      setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
    }
  }
  useEffect(() => { load() }, [])

  // Group transactions by the TBILISI year-month (was the machine's, which put
  // a 00:30 session in the wrong month for anyone reading from another zone)
  // with per-group subtotals.
  const groups = useMemo(() => {
    if (!data) return []
    const out: { key: string; label: string; net: number; items: Tx[] }[] = []
    for (const tx of data.transactions) {
      const key = dayKeyInTz(new Date(tx.startAt)).slice(0, 7) // "2026-08"
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: `${KA_MONTHS_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`, net: 0, items: [] }
        out.push(g)
      }
      g.items.push(tx)
      g.net += tx.net
    }
    return out
  }, [data])

  const hasRefunded = useMemo(() => (data?.transactions ?? []).some(t => t.payoutStatus === 'REFUNDED'), [data])
  const avgPerSession = data && data.completedCount > 0 ? Math.round(data.totalEarned / data.completedCount) : 0
  /* NOTHING HAS EVER BEEN EARNED. A hero reading ₾0, three ₾0 tiles and a CSV
     button that downloads a header row are not information — they are four
     shells around the same zero, with the only real next step buried under
     them. So the page becomes exactly that next step. The moment a single
     session (or even a refunded one) exists, the full page is back. */
  const noHistory = !!data && data.completedCount === 0 && data.transactions.length === 0

  return (
    <div>
      {/* h1 kept for the document outline but visually redundant on lg+, where
          the sidebar's highlighted „შემოსავალი" pill sits ~40px away. */}
      <PageHeader
        className="mb-6 lg:sr-only"
        title="შემოსავალი"
        sub={PAYMENTS_LIVE ? `შენი წილი ${TUTOR_PAYOUT_PCT}%` : undefined}
      />

      {err && (
        <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-small flex items-center justify-between gap-3">
          <span className="min-w-0">{err}</span>
          <Btn variant="secondary" size="sm" onClick={() => { setErr(null); setData(null); load() }}>თავიდან</Btn>
        </div>
      )}

      {data === null ? (
        // Show the skeleton only while genuinely loading — when a fetch error is
        // showing above, an endless pulsing skeleton under it is a false signal.
        err ? null : (
        <div aria-busy="true">
          <div className="rounded-card bg-ink-100 motion-safe:animate-pulse h-[140px] mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[0, 1, 2].map(i => <div key={i} className="rounded-card bg-ink-100 motion-safe:animate-pulse h-[96px]" />)}
          </div>
          <div className="rounded-card border border-ink-200 bg-white p-5 space-y-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-11 rounded-btn bg-ink-100 motion-safe:animate-pulse" />)}
          </div>
        </div>
        )
      ) : noHistory ? (
        // The empty state ALONE — no ₾0 hero, no ₾0 tiles, no export button.
        <EmptyState
          icon={<Icon.wallet className="w-6 h-6" />}
          title="შემოსავალი ჯერ არ გაქვს"
          description="პირველი დასრულებული სესიის შემდეგ აქ გამოჩნდება თანხა, ტრანზაქციები და ექსპორტი."
          cta={{ label: 'გრაფიკის შევსება', href: '/tutor/schedule' }}
        />
      ) : (
        <>
          {/* Balance hero — the number the expert is waiting on leads. */}
          <article className="relative overflow-hidden rounded-card bg-gradient-dark text-white mb-4">
            <div className="p-6 sm:p-7 grid sm:grid-cols-[1fr_auto] gap-5 items-end">
              <div>
                <div className="font-display text-micro font-semibold uppercase text-white/50 mb-2">
                  სულ გამომუშავებული
                </div>
                <div className="font-display text-display-lg sm:text-display-xl font-bold leading-none tabular-nums tracking-[-0.03em]">
                  <CountUp value={data.totalEarned} prefix="₾" />
                </div>
                <p className="mt-3 text-meta text-white/60 leading-snug max-w-[420px]">
                  {/* The commission figure is BACK (owner, 2026-08-10). This
                      is the expert's own money screen — if the rule lives only
                      in /terms, the one person it applies to is the one who
                      never reads it. */}
                  {PAYMENTS_LIVE
                    ? 'გადარიცხვა სესიის დასრულების შემდეგ.'
                    : 'ონლაინ გადახდები მალე ამოქმედდება.'}
                </p>
              </div>
              <div className="flex sm:flex-col gap-4 sm:gap-2 sm:text-right">
                <div>
                  <div className="font-display text-micro font-semibold uppercase text-white/45">ამ თვეში</div>
                  <div className="font-display text-h3 font-bold tabular-nums">{fmtGel(data.thisMonth?.earned ?? 0)}</div>
                </div>
                {/* „გადარიცხვის მოლოდინში“ was structurally always ₾0 — every
                    completion path sets payoutStatus RELEASED, so no COMPLETED
                    booking is ever PENDING. Until a real payout queue exists it
                    would be a permanently-zero metric dressed as meaningful, so
                    the cell states the commission instead. It read „0%" until
                    2026-08-10, which was the same emptiness with a worse
                    consequence: a promise nobody meant to keep. */}
                <div>
                  <div className="font-display text-micro font-semibold uppercase text-white/45">
                    {PAYMENTS_LIVE ? 'გადარიცხვის მოლოდინში' : 'საკომისიო'}
                  </div>
                  <div className="font-display text-h3 font-bold tabular-nums">
                    {PAYMENTS_LIVE ? fmtGel(data.pendingPayout) : `${COMMISSION_PCT}%`}
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* Stat tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-5 rounded-card border border-ink-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-btn bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                  <Icon.wallet className="w-4 h-4" />
                </span>
                <Eyebrow as="span" tone="muted">ამ თვეში</Eyebrow>
              </div>
              <div className="font-display text-h1 font-bold text-ink-900 tabular-nums">{fmtGel(data.thisMonth?.earned ?? 0)}</div>
              <div className="text-meta text-ink-500 mt-1">{data.thisMonth?.count ?? 0} სესია</div>
            </div>
            <div className="p-5 rounded-card border border-ink-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-btn bg-success-50 text-success-700 inline-flex items-center justify-center">
                  <Icon.check className="w-4 h-4" />
                </span>
                <Eyebrow as="span" tone="muted">დასრულებული სესიები</Eyebrow>
              </div>
              <div className="font-display text-h1 font-bold text-ink-900 tabular-nums">{data.completedCount}</div>
              <div className="text-meta text-ink-500 mt-1">მთელი პერიოდი</div>
            </div>
            <div className="p-5 rounded-card border border-ink-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-btn bg-ink-100 text-ink-600 inline-flex items-center justify-center">
                  <Icon.trend className="w-4 h-4" />
                </span>
                <Eyebrow as="span" tone="muted">საშუალო სესიაზე</Eyebrow>
              </div>
              <div className="font-display text-h1 font-bold text-ink-900 tabular-nums">{fmtGel(avgPerSession)}</div>
              <div className="text-meta text-ink-500 mt-1">{`ნეტო, ${TUTOR_PAYOUT_PCT}% წილით`}</div>
            </div>
          </div>

          {/* Transactions, month-grouped */}
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between gap-3 flex-wrap">
              <div className="font-display text-small font-semibold uppercase text-ink-700">
                ტრანზაქციები <span className="font-mono text-meta text-ink-400 tabular-nums">{data.transactions.length}</span>
              </div>
              {data.transactions.length > 0 && (
                // A real action, not a <Link>: as an href this rendered a
                // next/link, so Next's prefetch fired the CSV-generating GET (a
                // 5000-row query) merely by opening the page. Content-Disposition:
                // attachment means the browser downloads without navigating away.
                // It lives HERE, next to the rows it exports — in the page header
                // it offered an empty file to every expert with nothing yet.
                <Btn
                  variant="secondary"
                  size="sm"
                  onClick={() => { window.location.href = '/api/tutor/earnings?format=csv' }}
                >
                  CSV ექსპორტი
                </Btn>
              )}
            </div>

            {data.transactions.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={<Icon.wallet className="w-6 h-6" />}
                  title="ჯერ არაფერია"
                  description="პირველი სესიის შემდეგ აქ გამოჩნდება."
                  cta={{ label: 'გრაფიკის შევსება', href: '/tutor/schedule' }}
                />
              </div>
            ) : (
              <>
                {hasRefunded && (
                  <div className="px-5 py-2 border-b border-ink-100 text-meta text-ink-500 bg-ink-50/40">
                    {PAYMENTS_LIVE
                      ? '„დაბრუნდა“ — თანხა სტუდენტს დაუბრუნდა.'
                      : '„ანულირდა“ — დავა სტუდენტის სასარგებლოდ გადაწყდა.'}
                  </div>
                )}
                {/* Mobile: card rows under month headers */}
                <div className="lg:hidden">
                  {groups.map(g => (
                    <div key={g.key}>
                      <div className="px-5 py-2 bg-ink-50/60 border-y border-ink-100 first:border-t-0 flex items-center justify-between">
                        <Eyebrow as="span" tone="muted">{g.label}</Eyebrow>
                        <span className="font-display text-meta font-bold text-ink-700 tabular-nums">{fmtGel(g.net)} · {g.items.length}</span>
                      </div>
                      <div className="divide-y divide-ink-100">
                        {g.items.map(tx => {
                          const s = payoutLabel(tx.payoutStatus)
                          return (
                            <div key={tx.id} className="px-5 py-3.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-display text-body font-bold text-ink-900 truncate">{tx.student?.fullName ?? '—'}</div>
                                <div className="font-display text-body-lg font-bold text-ink-900 tabular-nums shrink-0">{fmtGel(tx.net)}</div>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between gap-3 text-meta text-ink-500">
                                <span className="truncate">{tx.topic}</span>
                                <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase shrink-0 ${s.cls}`}>{s.l}</span>
                              </div>
                              <div className="mt-1 text-meta text-ink-400 tabular-nums">{fmtDate(tx.startAt)} · {tx.durationMin} წთ{SHOW_GROSS ? ` · ბრუტო ${fmtGel(tx.gross)}` : ''}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table with month separator rows + subtotals */}
                <div className="overflow-x-auto -mx-px hidden lg:block">
                  <table className="w-full text-small min-w-[720px]">
                    <thead className="bg-ink-50 text-ink-500 font-display font-semibold uppercase text-micro">
                      <tr>
                        <th className="text-left px-5 py-3 whitespace-nowrap">თარიღი</th>
                        <th className="text-left px-5 py-3 whitespace-nowrap">სტუდენტი</th>
                        <th className="text-left px-5 py-3">თემა</th>
                        <th className="text-right px-5 py-3 whitespace-nowrap">ხანგრძლივობა</th>
                        {SHOW_GROSS && <th className="text-right px-5 py-3 whitespace-nowrap">ბრუტო</th>}
                        <th className="text-right px-5 py-3 whitespace-nowrap">{SHOW_GROSS ? 'ნეტო' : 'თანხა'}</th>
                        <th className="text-right px-5 py-3 whitespace-nowrap">სტატუსი</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map(g => (
                        <FragmentRows key={g.key} group={g} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-ink-100 text-center text-meta text-ink-400">
                  ბოლო 50 ტრანზაქცია
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function FragmentRows({ group }: { group: { label: string; net: number; items: Tx[] } }) {
  return (
    <>
      <tr className="bg-ink-50/70 border-t border-ink-200">
        <td colSpan={SHOW_GROSS ? 5 : 4} className="px-5 py-2 font-display text-micro font-semibold uppercase text-ink-500">
          {group.label}
        </td>
        <td className="px-5 py-2 text-right font-display text-meta font-bold text-ink-700 tabular-nums">₾{group.net.toLocaleString('en-US')}</td>
        <td className="px-5 py-2 text-right text-meta text-ink-400 tabular-nums">{group.items.length} სესია</td>
      </tr>
      {group.items.map(tx => {
        const s = payoutLabel(tx.payoutStatus)
        return (
          <tr key={tx.id} className="border-t border-ink-100 hover:bg-ink-50/60">
            <td className="px-5 py-3 text-ink-700 tabular-nums">{fmtDate(tx.startAt)}</td>
            <td className="px-5 py-3 text-ink-800 font-medium truncate max-w-[180px]">{tx.student?.fullName ?? '—'}</td>
            <td className="px-5 py-3 text-ink-600 truncate max-w-[240px]">{tx.topic}</td>
            <td className="px-5 py-3 text-right text-ink-600 tabular-nums">{tx.durationMin} წთ</td>
            {SHOW_GROSS && <td className="px-5 py-3 text-right text-ink-600 tabular-nums">₾{tx.gross.toLocaleString('en-US')}</td>}
            <td className="px-5 py-3 text-right font-display font-bold text-ink-900 tabular-nums">₾{tx.net.toLocaleString('en-US')}</td>
            <td className="px-5 py-3 text-right">
              <span className={`inline-flex items-center h-6 px-2 rounded-pill border font-display text-micro font-bold uppercase ${s.cls}`}>{s.l}</span>
            </td>
          </tr>
        )
      })}
    </>
  )
}
