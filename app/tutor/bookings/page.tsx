'use client'
import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { StatusPill } from '@/components/StatusPill'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { fmtKaDateTime } from '@/lib/kaDate'
import { useToast } from '@/components/ToastProvider'

type BookingStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'

type Booking = {
  id: string
  ref: string
  topic: string
  status: BookingStatus
  startAt: string
  durationMin: number
  price: number
  student: { id: string; fullName: string; avatarUrl?: string | null } | null
}

const TABS: { id: BookingStatus | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'ყველა' },
  { id: 'PREPARING', label: 'მზადდება' },
  { id: 'CONFIRMED', label: 'დადასტურდა' },
  { id: 'LIVE', label: 'ცოცხალია' },
  { id: 'COMPLETED', label: 'დასრულდა' },
  { id: 'CANCELED', label: 'გაუქმდა' },
]

const toneOf = (s: BookingStatus) =>
  s === 'PREPARING' ? 'preparing'
  : s === 'CONFIRMED' ? 'confirmed'
  : s === 'LIVE' ? 'live'
  : s === 'COMPLETED' ? 'completed'
  : s === 'CANCELED' ? 'canceled'
  : 'noshow' as const

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso)
    return fmtKaDateTime(d)
  } catch { return iso }
}

export default function TutorBookingsPage() {
  const { toast } = useToast()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [tab, setTab] = useState<BookingStatus | 'ALL'>('ALL')
  const [err, setErr] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bResp = await fetch('/api/tutor/bookings')
        if (cancelled) return
        // Expired session / wrong role → go to signin, not a misleading empty list.
        if (bResp.status === 401 || bResp.status === 403) {
          window.location.href = '/signin?redirect=/tutor/bookings'
          return
        }
        const bRes = await bResp.json().catch(() => null)
        setBookings(Array.isArray(bRes?.bookings) ? bRes.bookings : [])
      } catch (e: any) {
        if (!cancelled) setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!bookings) return []
    if (tab === 'ALL') return bookings
    return bookings.filter(b => b.status === tab)
  }, [bookings, tab])

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: bookings?.length ?? 0 }
    for (const b of bookings ?? []) map[b.status] = (map[b.status] ?? 0) + 1
    return map
  }, [bookings])

  const cancel = async (id: string) => {
    if (!confirm('დაადასტურე ჯავშნის გაუქმება')) return
    setCancelingId(id)
    setErr(null)
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any))
        setErr(j?.error ? `გაუქმება ვერ მოხერხდა (${j.error})` : 'გაუქმება ვერ მოხერხდა')
        return
      }
      setBookings(prev => prev?.map(b => b.id === id ? { ...b, status: 'CANCELED' } : b) ?? [])
      toast('ჯავშანი გაუქმდა', 'success')
    } catch {
      setErr('გაუქმება ვერ მოხერხდა — ქსელის შეცდომა')
    } finally {
      setCancelingId(null)
    }
  }

  return (
    <div>
        <div className="mb-6">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink-900">ჯავშნები</h1>
          <p className="text-[13px] text-ink-500 mt-1">მიმდინარე და წარსული ჯავშნების მართვა</p>
        </div>

        <div className="flex flex-wrap gap-1 mb-5 border-b border-ink-200">
          {TABS.map(t => {
            const active = tab === t.id
            const c = counts[t.id] ?? 0
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(t.id)}
                className={`h-10 px-4 -mb-px border-b-2 font-display text-[13px] font-semibold tracking-tight inline-flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-sm ${
                  active ? 'border-brand-500 text-brand-800' : 'border-transparent text-ink-500 hover:text-ink-800'
                }`}
              >
                {t.label}
                {c > 0 && (
                  <span className={`min-w-[20px] h-5 px-1.5 rounded-pill text-[10.5px] font-bold tabular-nums inline-flex items-center justify-center ${
                    active ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-600'
                  }`}>{c}</span>
                )}
              </button>
            )
          })}
        </div>

        {err && (
          <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-[13px] flex items-start justify-between gap-3">
            <span className="min-w-0">{err}</span>
            <button
              type="button"
              onClick={() => setErr(null)}
              aria-label="დახურვა"
              className="shrink-0 -mr-1 -mt-1 w-7 h-7 inline-flex items-center justify-center rounded-btn text-danger-700 hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-300"
            >
              <Icon.close className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {bookings === null ? (
          <div className="p-12 rounded-card border border-ink-200 bg-white flex items-center justify-center text-ink-400">
            <span className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-[13px]">იტვირთება…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 rounded-card border border-ink-200 bg-white text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center mb-3">
              <Icon.calendar className="w-6 h-6" />
            </div>
            <div className="font-display text-[15px] font-semibold text-ink-800">ჯავშნები არ მოიძებნა</div>
            <div className="text-[13px] text-ink-500 mt-1">ამ სტატუსში ჯერ არაფერია.</div>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map(b => {
              const future = new Date(b.startAt) > new Date()
              const canCancel = future && (b.status === 'CONFIRMED' || b.status === 'PREPARING')
              return (
                <li key={b.id} className="p-4 sm:p-5 rounded-card border border-ink-200 bg-white shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar src={b.student?.avatarUrl ?? undefined} name={b.student?.fullName} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display text-[14px] font-bold text-ink-900 truncate">
                            {b.student?.fullName ?? 'უცნობი კლიენტი'}
                          </span>
                          <StatusPill tone={toneOf(b.status)} />
                        </div>
                        <div className="text-[13px] text-ink-600 truncate mt-0.5" title={b.topic}>{b.topic}</div>
                        <div className="text-[12px] text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3.5 h-3.5" />{fmtDate(b.startAt)}</span>
                          <span className="inline-flex items-center gap-1"><Icon.clock className="w-3.5 h-3.5" />{b.durationMin} წთ</span>
                          <span className="font-display font-bold text-ink-800 tabular-nums">₾{b.price}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Btn variant="secondary" size="sm" href={`/tutor/bookings/${b.id}`}>დეტალები</Btn>
                      <Btn variant="ghost" size="sm" href={`/tutor/messages/${b.id}`}>
                        <Icon.chat className="w-4 h-4" /> მესიჯი
                      </Btn>
                      {canCancel && (
                        <Btn variant="danger" size="sm" onClick={() => cancel(b.id)} disabled={cancelingId === b.id}>
                          {cancelingId === b.id ? 'უქმდება…' : 'გაუქმება'}
                        </Btn>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}
