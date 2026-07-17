'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { ConfirmModal } from '@/components/ConfirmModal'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { StatusPill } from '@/components/StatusPill'
import { useToast } from '@/components/ToastProvider'
import { PageHeader } from '@/components/tutor/PageHeader'
import { fmtKaDate, fmtKaTime } from '@/lib/kaDate'
import { isBookingLive } from '@/lib/bookingLive'
import { refreshNavBadges } from '@/components/tutor/useNavBadges'
import {
  type DashBooking as Booking,
  toneOf,
  awaitsClosure,
  awaitsRescheduleAnswer,
} from '../_components/types'

type TabId = 'attention' | 'upcoming' | 'history'

const TABS: { id: TabId; label: string }[] = [
  { id: 'attention', label: 'საჭიროებს ყურადღებას' },
  { id: 'upcoming', label: 'მოახლოებული' },
  { id: 'history', label: 'ისტორია' },
]

// Legacy links (?tab=PREPARING from old dashboard/notifications/bookmarks)
// map onto the new buckets instead of being ignored.
const LEGACY_TAB: Record<string, TabId> = {
  PREPARING: 'attention',
  LIVE: 'upcoming',
  CONFIRMED: 'upcoming',
  COMPLETED: 'history',
  CANCELED: 'history',
  ALL: 'attention',
}

const dayLabel = (d: Date, now: Date) => {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(d) - startOf(now)) / 86_400_000)
  if (diff === 0) return 'დღეს'
  if (diff === 1) return 'ხვალ'
  return fmtKaDate(d, { weekday: true })
}

function BookingsPageInner() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ kind: 'cancel' | 'no_show' | 'decline'; b: Booking } | null>(null)

  const load = async () => {
    try {
      const bResp = await fetch('/api/tutor/bookings')
      // Expired session / wrong role → go to signin, not a misleading empty list.
      if (bResp.status === 401 || bResp.status === 403) {
        window.location.href = '/signin?redirect=/tutor/bookings'
        return
      }
      if (!bResp.ok) throw new Error('load failed')
      const bRes = await bResp.json().catch(() => null)
      setBookings(Array.isArray(bRes?.bookings) ? bRes.bookings : [])
      setErr(null)
    } catch {
      setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
      setBookings(prev => prev ?? [])
    }
  }
  useEffect(() => { load() }, [])

  const now = Date.now()
  const nowDate = new Date()

  const buckets = useMemo(() => {
    const all = bookings ?? []
    const attention = all
      .filter(b => b.status === 'PREPARING' || awaitsRescheduleAnswer(b) || awaitsClosure(b, now))
      .sort((a, z) => new Date(a.startAt).getTime() - new Date(z.startAt).getTime()) // stalest first
    const upcoming = all
      .filter(b => (b.status === 'CONFIRMED' || b.status === 'LIVE') && !awaitsClosure(b, now) &&
        (isBookingLive(b) || new Date(b.startAt).getTime() >= now))
      .sort((a, z) => new Date(a.startAt).getTime() - new Date(z.startAt).getTime())
    const history = all
      .filter(b => b.status === 'COMPLETED' || b.status === 'CANCELED' || b.status === 'NO_SHOW')
      .sort((a, z) => new Date(z.startAt).getTime() - new Date(a.startAt).getTime())
    return { attention, upcoming, history }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings])

  // URL-driven tab (fixes the long-standing bug where ?tab=PREPARING was
  // ignored). No explicit param → attention if non-empty, else upcoming.
  const rawTab = searchParams?.get('tab') ?? null
  const tab: TabId =
    rawTab && (TABS.some(t => t.id === rawTab) || LEGACY_TAB[rawTab])
      ? ((TABS.some(t => t.id === rawTab) ? rawTab : LEGACY_TAB[rawTab]) as TabId)
      : buckets.attention.length > 0 ? 'attention' : 'upcoming'

  // Shallow URL update — router.replace would re-render the force-dynamic
  // layout server-side (a full DB round-trip) just to switch a client tab.
  // Next syncs useSearchParams from native history.replaceState.
  const setTab = (t: TabId) => window.history.replaceState(null, '', `/tutor/bookings?tab=${t}`)

  const act = async (b: Booking, action: 'accept' | 'decline' | 'complete' | 'no_show') => {
    setBusy(b.id + action)
    try {
      const res = await fetch(`/api/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        toast(
          j?.error === 'TOO_EARLY' ? 'სესია ჯერ არ დაწყებულა' :
          j?.error === 'BAD_STATE' ? 'სტატუსი ამას აღარ უშვებს' : 'მოქმედება ვერ შესრულდა',
          'error',
        )
        return
      }
      toast(
        action === 'accept' ? 'დადასტურდა'
        : action === 'decline' ? 'უარყოფილია'
        : action === 'no_show' ? 'აღინიშნა: no-show'
        : 'დასრულებულია',
        'success',
      )
      refreshNavBadges()
      await load()
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally {
      setBusy(null)
    }
  }

  const cancel = async (b: Booking) => {
    setBusy(b.id + 'cancel')
    try {
      const res = await fetch(`/api/bookings/${b.id}/cancel`, { method: 'POST' })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { toast('გაუქმება ვერ მოხერხდა', 'error'); return }
      toast('ჯავშანი გაუქმდა', 'success')
      refreshNavBadges()
      await load()
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally {
      setBusy(null)
    }
  }

  const loading = bookings === null
  const list = buckets[tab]

  // Upcoming groups under day headers; other tabs render flat.
  const grouped = useMemo(() => {
    if (tab !== 'upcoming') return null
    const groups: { label: string; items: Booking[] }[] = []
    for (const b of list) {
      const label = dayLabel(new Date(b.startAt), nowDate)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(b)
      else groups.push({ label, items: [b] })
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, list])

  return (
    <div>
      <PageHeader
        className="mb-5"
        title="ჯავშნები"
        sub="ერთ ადგილას: გადასაწყვეტი, მოახლოებული და წარსული სესიები"
      />

      {/* Bucket tabs — underline pattern from the student side */}
      <div className="flex border-b border-ink-200 mb-5 overflow-x-auto scrollbar-hide">
        {TABS.map(t => {
          const on = t.id === tab
          const c = loading ? 0 : buckets[t.id].length
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={on}
              className={`relative inline-flex items-center gap-2 pb-3 px-1 mr-5 font-display text-[13px] font-semibold whitespace-nowrap transition-colors ${
                on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              {t.label}
              {c > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-[10.5px] font-bold tabular-nums ${
                  t.id === 'attention' && !on ? 'bg-brand-500 text-white' : on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600'
                }`}>{c}</span>
              )}
              {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand-500 rounded-full" />}
            </button>
          )
        })}
      </div>

      {err && (
        <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-[13px] flex items-center justify-between gap-3">
          <span className="min-w-0">{err}</span>
          <Btn variant="secondary" size="sm" onClick={() => { setErr(null); setBookings(null); load() }}>თავიდან</Btn>
        </div>
      )}

      {loading ? (
        <ul className="space-y-3" aria-busy="true">
          {[0, 1, 2].map(i => (
            <li key={i} className="p-5 rounded-card border border-ink-200 bg-white flex items-center gap-4">
              <span className="w-11 h-11 rounded-full bg-ink-100 animate-pulse shrink-0" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-1/3 rounded-pill bg-ink-100 animate-pulse" />
                <span className="block h-3 w-2/3 rounded-pill bg-ink-100 animate-pulse" />
              </span>
            </li>
          ))}
        </ul>
      ) : list.length === 0 ? (
        tab === 'attention' ? (
          <EmptyState
            icon={<Icon.check className="w-6 h-6" />}
            title="ყველაფერი დამუშავებულია"
            description="ახალი მოთხოვნა ან გადასაწყვეტი საკითხი არ არის."
          />
        ) : tab === 'upcoming' ? (
          <EmptyState
            icon={<Icon.calendar className="w-6 h-6" />}
            title="მოახლოებული სესია არ გაქვს"
            description="გამოაქვეყნე თავისუფალი დროები, რომ კლიენტებმა დაგიჯავშნონ."
            cta={{ label: 'დროების გამოქვეყნება', href: '/tutor/schedule' }}
          />
        ) : (
          <EmptyState
            icon={<Icon.clock className="w-6 h-6" />}
            title="ისტორია ცარიელია"
            description="დასრულებული და გაუქმებული სესიები აქ გამოჩნდება."
          />
        )
      ) : grouped ? (
        <div className="space-y-6">
          {grouped.map(g => (
            <section key={g.label} aria-label={g.label}>
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2.5">{g.label}</div>
              <ul className="space-y-3">
                {g.items.map(b => (
                  <BookingRow key={b.id} b={b} now={now} busy={busy} onAct={act} onConfirm={setConfirming} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map(b => (
            <BookingRow key={b.id} b={b} now={now} busy={busy} onAct={act} onConfirm={setConfirming} />
          ))}
        </ul>
      )}

      {!loading && tab === 'history' && list.length >= 30 && (
        <p className="mt-4 text-center text-[11.5px] text-ink-400">ნაჩვენებია ბოლო ჯავშნები.</p>
      )}

      <ConfirmModal
        open={!!confirming}
        title={
          confirming?.kind === 'cancel' ? 'ჯავშნის გაუქმება?'
          : confirming?.kind === 'decline' ? 'უარი მოთხოვნაზე?'
          : 'კლიენტი არ გამოცხადდა?'
        }
        body={
          confirming?.kind === 'cancel'
            ? 'სესიის დაწყებამდე 12 საათზე გვიან გაუქმება კლიენტისთვის სრულად ბრუნდება. კლიენტი მიიღებს შეტყობინებას.'
            : confirming?.kind === 'decline'
            ? `${confirming.b.student?.fullName ?? 'კლიენტის'} მოთხოვნა გაუქმდება. კლიენტი მიიღებს შეტყობინებას.`
            : 'ჯავშანი აღინიშნება როგორც no-show და თანხა კლიენტს დაუბრუნდება.'
        }
        tone={confirming?.kind === 'decline' ? 'warning' : 'danger'}
        confirmLabel={
          confirming?.kind === 'cancel' ? 'გაუქმება'
          : confirming?.kind === 'decline' ? 'უარყოფა'
          : 'დადასტურება'
        }
        busy={!!confirming && busy === confirming.b.id + (confirming.kind === 'cancel' ? 'cancel' : confirming.kind)}
        onConfirm={async () => {
          if (!confirming) return
          if (confirming.kind === 'cancel') await cancel(confirming.b)
          else await act(confirming.b, confirming.kind)
          setConfirming(null)
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}

/* One booking row: identity + meta on the left, ONE status-appropriate
   primary action (plus quiet secondaries) on the right. */
function BookingRow({
  b,
  now,
  busy,
  onAct,
  onConfirm,
}: {
  b: Booking
  now: number
  busy: string | null
  onAct: (b: Booking, action: 'accept' | 'decline' | 'complete' | 'no_show') => void
  onConfirm: (c: { kind: 'cancel' | 'no_show' | 'decline'; b: Booking }) => void
}) {
  const live = isBookingLive(b)
  const needsClosure = awaitsClosure(b, now)
  const reschedPending = awaitsRescheduleAnswer(b)
  const future = new Date(b.startAt).getTime() > now
  const terminal = b.status === 'COMPLETED' || b.status === 'CANCELED' || b.status === 'NO_SHOW'
  const d = new Date(b.startAt)

  const actions = terminal ? null : (
    <div className="flex items-center gap-2 flex-wrap shrink-0">
      {b.status === 'PREPARING' && !reschedPending && (
        <>
          <Btn variant="secondary" size="sm" onClick={() => onConfirm({ kind: 'decline', b })} disabled={busy === b.id + 'decline'}>
            {busy === b.id + 'decline' ? '…' : 'უარი'}
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => onAct(b, 'accept')} disabled={busy === b.id + 'accept'}>
            {busy === b.id + 'accept' ? '…' : 'დადასტურება'}
          </Btn>
        </>
      )}
      {reschedPending && (
        <Btn variant="primary" size="sm" href={`/tutor/bookings/${b.id}`}>პასუხი გადადებაზე</Btn>
      )}
      {live && (
        <Btn variant="primary" size="sm" href={`/session/${b.id}`}>
          <Icon.video className="w-4 h-4" /> ვიდეო-ოთახში შესვლა
        </Btn>
      )}
      {needsClosure && !reschedPending && (
        <>
          <Btn variant="secondary" size="sm" onClick={() => onConfirm({ kind: 'no_show', b })} disabled={busy === b.id + 'no_show'}>
            არ გამოცხადდა
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => onAct(b, 'complete')} disabled={busy === b.id + 'complete'}>
            {busy === b.id + 'complete' ? '…' : 'დასრულებულად მონიშვნა'}
          </Btn>
        </>
      )}
      {b.status === 'CONFIRMED' && future && !live && !reschedPending && (
        <>
          <Btn variant="ghost" size="sm" href={`/tutor/messages/${b.id}`}>
            <Icon.chat className="w-4 h-4" /> მესიჯი
          </Btn>
          <Btn variant="secondary" size="sm" onClick={() => onConfirm({ kind: 'cancel', b })} disabled={busy === b.id + 'cancel'}>
            გაუქმება
          </Btn>
        </>
      )}
    </div>
  )

  return (
    <li className="rounded-card border border-ink-200 bg-white shadow-xs hover:border-ink-300 transition-colors">
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href={`/tutor/bookings/${b.id}`} className="flex items-center gap-3 min-w-0 flex-1 group">
          <Avatar src={b.student?.avatarUrl ?? undefined} name={b.student?.fullName} size={44} />
          <span className="min-w-0 flex-1 block">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-display text-[14px] font-bold text-ink-900 truncate group-hover:text-brand-800 transition-colors">
                {b.student?.fullName ?? 'უცნობი კლიენტი'}
              </span>
              <StatusPill tone={live ? 'live' : toneOf(b.status)} />
              {reschedPending && (
                <span className="inline-flex items-center h-6 px-2 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 font-display text-[10.5px] font-bold uppercase tracking-[0.1em]">
                  გადადება ელოდება
                </span>
              )}
            </span>
            <span className="block text-[13px] text-ink-600 truncate mt-0.5" title={b.topic}>{b.topic}</span>
            <span className="text-[12px] text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3.5 h-3.5" />{fmtKaDate(d)} · {fmtKaTime(d)}</span>
              <span className="inline-flex items-center gap-1"><Icon.clock className="w-3.5 h-3.5" />{b.durationMin} წთ</span>
              <span className="font-display font-bold text-ink-800 tabular-nums">₾{b.price}</span>
            </span>
          </span>
        </Link>
        {actions}
      </div>
    </li>
  )
}

// useSearchParams requires a Suspense boundary in Next 15.
export default function TutorBookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsPageInner />
    </Suspense>
  )
}
