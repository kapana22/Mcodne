'use client'
import { useEffect, useState } from 'react'
import { TutorAppBar } from '@/components/TutorAppBar'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { fmtKaDate } from '@/lib/kaDate'

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
  transactions: Tx[]
}

type Me = { fullName: string; avatarUrl?: string | null } | null

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
  const [me, setMe] = useState<Me>(null)
  const [data, setData] = useState<Earnings | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [meRes, eRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()),
          fetch('/api/tutor/earnings'),
        ])
        if (cancelled) return
        // Expired session / wrong role → bounce to signin instead of crashing
        // on `data.transactions.length` with an error body.
        if (eRes.status === 401 || eRes.status === 403) {
          window.location.href = '/signin?redirect=/tutor/earnings'
          return
        }
        if (!eRes.ok) throw new Error('load failed')
        const e = await eRes.json()
        setMe(meRes?.user ?? null)
        // Never trust the shape blindly — default the list so .map/.length are safe.
        setData({ ...e, transactions: Array.isArray(e?.transactions) ? e.transactions : [] })
      } catch {
        if (!cancelled) setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <TutorAppBar user={me ? { name: me.fullName, avatar: me.avatarUrl ?? undefined } : undefined} />

      <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink-900">შემოსავალი</h1>
          <p className="text-[13px] text-ink-500 mt-1">დამუშავებული ჯავშნები და ტრანზაქციები</p>
        </div>

        {err && (
          <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>
        )}

        {data === null ? (
          <div className="p-12 rounded-card border border-ink-200 bg-white flex items-center justify-center text-ink-400">
            <span className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-[13px]">იტვირთება…</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-5 rounded-card border border-ink-200 bg-white shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 rounded-btn bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                    <Icon.wallet className="w-4 h-4" />
                  </span>
                  <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">სულ შემოსავალი</span>
                </div>
                <div className="font-display text-[28px] font-bold text-ink-900 tabular-nums">{fmtGel(data.totalEarned)}</div>
                <div className="text-[11.5px] text-ink-500 mt-1">85% წილი დასრულებული ჯავშნებიდან</div>
              </div>
              <div className="p-5 rounded-card border border-ink-200 bg-white shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 rounded-btn bg-warning-50 text-warning-700 inline-flex items-center justify-center">
                    <Icon.clock className="w-4 h-4" />
                  </span>
                  <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">გადარიცხვის მოლოდინში</span>
                </div>
                <div className="font-display text-[28px] font-bold text-ink-900 tabular-nums">{fmtGel(data.pendingPayout)}</div>
                <div className="text-[11.5px] text-ink-500 mt-1">1-2 სამუშაო დღეში ჩამოვა</div>
              </div>
              <div className="p-5 rounded-card border border-ink-200 bg-white shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 rounded-btn bg-success-50 text-success-700 inline-flex items-center justify-center">
                    <Icon.check className="w-4 h-4" />
                  </span>
                  <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">დასრულებული სესიები</span>
                </div>
                <div className="font-display text-[28px] font-bold text-ink-900 tabular-nums">{data.completedCount}</div>
                <div className="text-[11.5px] text-ink-500 mt-1">ბოლო 50 ტრანზაქცია</div>
              </div>
            </div>

            <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-ink-200 flex items-center justify-between">
                <div className="font-display text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-700">უახლესი ტრანზაქციები</div>
                <div className="text-[11.5px] text-ink-400 font-mono">{data.transactions.length}</div>
              </div>

              {data.transactions.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center mb-3">
                    <Icon.wallet className="w-6 h-6" />
                  </div>
                  <div className="font-display text-[15px] font-semibold text-ink-800">ჯერ არაფერია</div>
                  <div className="text-[13px] text-ink-500 mt-1">დაასრულე პირველი სესია, რომ აქ ტრანზაქცია გამოჩნდეს.</div>
                </div>
              ) : (
                <>
                {/* Mobile: card rows instead of a 720px sideways-scrolling
                    table — date/client/net at a glance, no horizontal pan. */}
                <div className="lg:hidden divide-y divide-ink-100">
                  {data.transactions.map(tx => {
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
                      {data.transactions.map(tx => {
                        const s = payoutLabel(tx.payoutStatus)
                        return (
                          <tr key={tx.id} className="border-t border-ink-100 hover:bg-ink-50/60">
                            <td className="px-5 py-3 text-ink-700 tabular-nums">{fmtDate(tx.startAt)}</td>
                            <td className="px-5 py-3 text-ink-800 font-medium truncate max-w-[180px]">{tx.student?.fullName ?? '—'}</td>
                            <td className="px-5 py-3 text-ink-600 truncate max-w-[240px]">{tx.topic}</td>
                            <td className="px-5 py-3 text-right text-ink-600 tabular-nums">{tx.durationMin} წთ</td>
                            <td className="px-5 py-3 text-right text-ink-600 tabular-nums">{fmtGel(tx.gross)}</td>
                            <td className="px-5 py-3 text-right font-display font-bold text-ink-900 tabular-nums">{fmtGel(tx.net)}</td>
                            <td className="px-5 py-3 text-right">
                              <span className={`inline-flex items-center h-6 px-2 rounded-pill border font-display text-[10.5px] font-bold uppercase tracking-[0.14em] ${s.cls}`}>{s.l}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
