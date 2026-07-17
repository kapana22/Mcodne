'use client'
import { useEffect, useMemo, useState } from 'react'
import { CountUp } from '@/components/CountUp'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { fmtKaDate, KA_MONTHS_LONG } from '@/lib/kaDate'

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
const fmtDate = (iso: string) => {
  try {
    return fmtKaDate(new Date(iso), { year: true })
  } catch { return iso }
}

const payoutLabel = (s: Tx['payoutStatus']) =>
  s === 'PENDING' ? { l: 'მოლოდინში', cls: 'bg-warning-50 text-warning-700 border-warning-200' }
  : s === 'RELEASED' ? { l: 'გადარიცხულია', cls: 'bg-success-50 text-success-700 border-success-200' }
  : { l: 'დაბრუნდა', cls: 'bg-ink-100 text-ink-700 border-ink-200' }

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

  // Group transactions by Tbilisi-ish local year-month with per-group subtotals.
  const groups = useMemo(() => {
    if (!data) return []
    const out: { key: string; label: string; net: number; items: Tx[] }[] = []
    for (const tx of data.transactions) {
      const d = new Date(tx.startAt)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: `${KA_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`, net: 0, items: [] }
        out.push(g)
      }
      g.items.push(tx)
      g.net += tx.net
    }
    return out
  }, [data])

  const hasRefunded = useMemo(() => (data?.transactions ?? []).some(t => t.payoutStatus === 'REFUNDED'), [data])
  const avgPerSession = data && data.completedCount > 0 ? Math.round(data.totalEarned / data.completedCount) : 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-[24px] sm:text-[26px] font-bold tracking-tight text-ink-900">შემოსავალი</h1>
        <p className="text-[13px] text-ink-500 mt-1">დამუშავებული ჯავშნები და ტრანზაქციები · შენი წილი 85%</p>
      </div>

      {err && (
        <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-[13px] flex items-center justify-between gap-3">
          <span className="min-w-0">{err}</span>
          <Btn variant="secondary" size="sm" onClick={() => { setErr(null); setData(null); load() }}>თავიდან</Btn>
        </div>
      )}

      {data === null ? (
        <div aria-busy="true">
          <div className="rounded-card bg-ink-100 animate-pulse h-[140px] mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[0, 1, 2].map(i => <div key={i} className="rounded-card bg-ink-100 animate-pulse h-[96px]" />)}
          </div>
          <div className="rounded-card border border-ink-200 bg-white p-5 space-y-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded-btn bg-ink-100 animate-pulse" />)}
          </div>
        </div>
      ) : (
        <>
          {/* Balance hero — the number the expert is waiting on leads. */}
          <article className="relative overflow-hidden rounded-card bg-gradient-dark text-white mb-4">
            <div className="p-6 sm:p-7 grid sm:grid-cols-[1fr_auto] gap-5 items-end">
              <div>
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/50 mb-2">
                  გადარიცხვის მოლოდინში
                </div>
                <div className="font-display text-[40px] sm:text-[48px] font-bold leading-none tabular-nums tracking-[-0.03em]">
                  <CountUp value={data.pendingPayout} prefix="₾" />
                </div>
                <p className="mt-3 text-[12px] text-white/60 leading-snug max-w-[420px]">
                  გადარიცხვები მალე ამოქმედდება — ამჟამად ჯავშნები ტარდება უფასოდ.
                </p>
              </div>
              <div className="flex sm:flex-col gap-4 sm:gap-2 sm:text-right">
                <div>
                  <div className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">სულ გამომუშავებული</div>
                  <div className="font-display text-[18px] font-bold tabular-nums">{fmtGel(data.totalEarned)}</div>
                </div>
                <div>
                  <div className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">ამ თვეში</div>
                  <div className="font-display text-[18px] font-bold tabular-nums">{fmtGel(data.thisMonth?.earned ?? 0)}</div>
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
                <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">ამ თვეში</span>
              </div>
              <div className="font-display text-[24px] font-bold text-ink-900 tabular-nums">{fmtGel(data.thisMonth?.earned ?? 0)}</div>
              <div className="text-[11.5px] text-ink-500 mt-1">{data.thisMonth?.count ?? 0} სესია</div>
            </div>
            <div className="p-5 rounded-card border border-ink-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-btn bg-success-50 text-success-700 inline-flex items-center justify-center">
                  <Icon.check className="w-4 h-4" />
                </span>
                <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">დასრულებული სესიები</span>
              </div>
              <div className="font-display text-[24px] font-bold text-ink-900 tabular-nums">{data.completedCount}</div>
              <div className="text-[11.5px] text-ink-500 mt-1">მთელი პერიოდი</div>
            </div>
            <div className="p-5 rounded-card border border-ink-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-btn bg-info-50 text-info-700 inline-flex items-center justify-center">
                  <Icon.trend className="w-4 h-4" />
                </span>
                <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">საშუალო სესიაზე</span>
              </div>
              <div className="font-display text-[24px] font-bold text-ink-900 tabular-nums">{fmtGel(avgPerSession)}</div>
              <div className="text-[11.5px] text-ink-500 mt-1">ნეტო, 85% წილით</div>
            </div>
          </div>

          {/* Transactions, month-grouped */}
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between">
              <div className="font-display text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-700">ტრანზაქციები</div>
              <div className="text-[11.5px] text-ink-400 font-mono">{data.transactions.length}</div>
            </div>

            {data.transactions.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={<Icon.wallet className="w-6 h-6" />}
                  title="ჯერ არაფერია"
                  description="დაასრულე პირველი სესია, რომ აქ ტრანზაქცია გამოჩნდეს."
                  cta={{ label: 'გრაფიკის შევსება', href: '/tutor/schedule' }}
                />
              </div>
            ) : (
              <>
                {hasRefunded && (
                  <div className="px-5 py-2 border-b border-ink-100 text-[11.5px] text-ink-500 bg-ink-50/40">
                    „დაბრუნდა" — გაუქმებული ან no-show სესია, თანხა კლიენტს დაუბრუნდა.
                  </div>
                )}
                {/* Mobile: card rows under month headers */}
                <div className="lg:hidden">
                  {groups.map(g => (
                    <div key={g.key}>
                      <div className="px-5 py-2 bg-ink-50/60 border-y border-ink-100 first:border-t-0 flex items-center justify-between">
                        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">{g.label}</span>
                        <span className="font-display text-[11.5px] font-bold text-ink-700 tabular-nums">{fmtGel(g.net)} · {g.items.length}</span>
                      </div>
                      <div className="divide-y divide-ink-100">
                        {g.items.map(tx => {
                          const s = payoutLabel(tx.payoutStatus)
                          return (
                            <div key={tx.id} className="px-5 py-3.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-display text-[13.5px] font-bold text-ink-900 truncate">{tx.student?.fullName ?? '—'}</div>
                                <div className="font-display text-[15px] font-bold text-ink-900 tabular-nums shrink-0">{fmtGel(tx.net)}</div>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between gap-3 text-[12px] text-ink-500">
                                <span className="truncate">{tx.topic}</span>
                                <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-[10px] font-bold uppercase tracking-[0.12em] shrink-0 ${s.cls}`}>{s.l}</span>
                              </div>
                              <div className="mt-1 text-[11.5px] text-ink-400 tabular-nums">{fmtDate(tx.startAt)} · {tx.durationMin} წთ · ბრუტო {fmtGel(tx.gross)}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table with month separator rows + subtotals */}
                <div className="overflow-x-auto -mx-px hidden lg:block">
                  <table className="w-full text-[13px] min-w-[720px]">
                    <thead className="bg-ink-50 text-ink-500 font-display font-semibold uppercase text-[10.5px] tracking-[0.14em]">
                      <tr>
                        <th className="text-left px-5 py-3 whitespace-nowrap">თარიღი</th>
                        <th className="text-left px-5 py-3 whitespace-nowrap">კლიენტი</th>
                        <th className="text-left px-5 py-3">თემა</th>
                        <th className="text-right px-5 py-3 whitespace-nowrap">ხანგრძლივობა</th>
                        <th className="text-right px-5 py-3 whitespace-nowrap">ბრუტო</th>
                        <th className="text-right px-5 py-3 whitespace-nowrap">ნეტო</th>
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
                <div className="px-5 py-3 border-t border-ink-100 text-center text-[11.5px] text-ink-400">
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
        <td colSpan={5} className="px-5 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          {group.label}
        </td>
        <td className="px-5 py-2 text-right font-display text-[12px] font-bold text-ink-700 tabular-nums">₾{group.net.toLocaleString('en-US')}</td>
        <td className="px-5 py-2 text-right text-[11px] text-ink-400 tabular-nums">{group.items.length} სესია</td>
      </tr>
      {group.items.map(tx => {
        const s = payoutLabel(tx.payoutStatus)
        return (
          <tr key={tx.id} className="border-t border-ink-100 hover:bg-ink-50/60">
            <td className="px-5 py-3 text-ink-700 tabular-nums">{fmtDate(tx.startAt)}</td>
            <td className="px-5 py-3 text-ink-800 font-medium truncate max-w-[180px]">{tx.student?.fullName ?? '—'}</td>
            <td className="px-5 py-3 text-ink-600 truncate max-w-[240px]">{tx.topic}</td>
            <td className="px-5 py-3 text-right text-ink-600 tabular-nums">{tx.durationMin} წთ</td>
            <td className="px-5 py-3 text-right text-ink-600 tabular-nums">₾{tx.gross.toLocaleString('en-US')}</td>
            <td className="px-5 py-3 text-right font-display font-bold text-ink-900 tabular-nums">₾{tx.net.toLocaleString('en-US')}</td>
            <td className="px-5 py-3 text-right">
              <span className={`inline-flex items-center h-6 px-2 rounded-pill border font-display text-[10.5px] font-bold uppercase tracking-[0.14em] ${s.cls}`}>{s.l}</span>
            </td>
          </tr>
        )
      })}
    </>
  )
}
