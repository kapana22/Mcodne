'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useScrollIntoResults } from '@/lib/useScrollIntoResults'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { ConfirmModal } from '@/components/ConfirmModal'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { StatusPill } from '@/components/StatusPill'
import { useToast } from '@/components/ToastProvider'
import { PageHeader } from '@/components/tutor/PageHeader'
import { TzNote } from '@/components/workspace/TzNote'
import { sessionDate, sessionTime } from '@/components/workspace/sessionTime'
import { dayKeyInTz } from '@/lib/bookings'
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
  { id: 'attention', label: 'ყურადღება' },
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

// Grouped by the TBILISI day, because the row times below are Tbilisi
// wall-clock — grouping on the viewer's midnight would file a 00:30 Tbilisi
// session under „ხვალ" and then print „00:30" next to it.
const dayLabel = (iso: string, now: Date) => {
  const key = (x: Date) => dayKeyInTz(x)               // "2026-08-02" in Tbilisi
  const days = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86_400_000
  const diff = days(key(new Date(iso))) - days(key(now))
  if (diff === 0) return 'დღეს'
  if (diff === 1) return 'ხვალ'
  return sessionDate(iso, { weekday: true })
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

  // Switching bucket replaces the whole list; `replaceState` means no navigation
  // happens, so nothing would otherwise move the viewport.
  const tabsRef = useRef<HTMLDivElement | null>(null)
  useScrollIntoResults(tabsRef, [tab])

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
          j?.error === 'TOO_EARLY' ? 'გამოუცხადებლობა დაწყებიდან 15 წუთის შემდეგ მოინიშნება' :
          j?.error === 'BAD_STATE' ? 'სტატუსი ამას აღარ უშვებს' : 'მოქმედება ვერ შესრულდა',
          'error',
        )
        return
      }
      toast(
        action === 'accept' ? 'დადასტურდა'
        : action === 'decline' ? 'უარყოფილია'
        : action === 'no_show' ? 'აღინიშნა: გამოუცხადებლობა'
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
      const label = dayLabel(b.startAt, nowDate)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(b)
      else groups.push({ label, items: [b] })
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, list])

  return (
    <div>
      {/* The h1 stays in the document outline (skip-link + screen-reader
          landmark) but hides on lg+, where it was the literal text of the
          highlighted sidebar pill ~40px to its left. Below lg there is no
          sidebar, so it shows. */}
      <PageHeader
        className="mb-5 lg:sr-only"
        title="ჯავშნები"
      />

      {/* Bucket tabs — underline pattern from the student side */}
      <div className="flex items-end justify-between gap-4 border-b border-ink-200 mb-5">
        <div ref={tabsRef} className="flex min-w-0 overflow-x-auto scrollbar-hide rail-fade-end">
          {TABS.map(t => {
            const on = t.id === tab
            const c = loading ? 0 : buckets[t.id].length
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={on}
                // min-h-[40px] + pt-2: measured at 32px, below this project's own
                // 40px tap floor. The padding grows the hit area UPWARD so the
                // underline indicator keeps sitting on the border line.
                className={`relative inline-flex items-center gap-2 min-h-[40px] pt-2 pb-3 px-1 mr-5 font-display text-small font-semibold whitespace-nowrap transition-colors duration-fast ${
                  on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                {t.label}
                {c > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-meta font-bold tabular-nums ${
                    t.id === 'attention' && !on ? 'bg-brand-600 text-white' : on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600'
                  }`}>{c}</span>
                )}
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand-500 rounded-full" />}
              </button>
            )
          })}
        </div>
        {/* Every time in the rows below is Tbilisi wall-clock — say so, once,
            and only to viewers whose browser is somewhere else. */}
        <TzNote className="hidden sm:block text-meta text-ink-500 pb-3 shrink-0" />
      </div>

      {err && (
        <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-small flex items-center justify-between gap-3">
          <span className="min-w-0">{err}</span>
          <Btn variant="secondary" size="sm" onClick={() => { setErr(null); setBookings(null); load() }}>თავიდან</Btn>
        </div>
      )}

      {loading ? (
        <ul className="space-y-3" aria-busy="true">
          {[0, 1, 2].map(i => (
            <li key={i} className="p-5 rounded-card border border-ink-200 bg-white flex items-center gap-4">
              <span className="w-11 h-11 rounded-full bg-ink-100 motion-safe:animate-pulse shrink-0" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-1/3 rounded-pill bg-ink-100 motion-safe:animate-pulse" />
                <span className="block h-3 w-2/3 rounded-pill bg-ink-100 motion-safe:animate-pulse" />
              </span>
            </li>
          ))}
        </ul>
      ) : list.length === 0 ? (
        tab === 'attention' ? (
          <EmptyState
            icon={<Icon.check className="w-6 h-6" />}
            title="ყველაფერი მოგვარებულია"
            description="ახალი მოთხოვნა არ არის."
          />
        ) : tab === 'upcoming' ? (
          <EmptyState
            illustration="bookings"
            title="მოახლოებული სესია არ გაქვს"
            description="გამოაქვეყნე დრო, რომ დაგიჯავშნონ."
            cta={{ label: 'დროის გამოქვეყნება', href: '/tutor/schedule' }}
          />
        ) : (
          <EmptyState
            illustration="bookings"
            title="ისტორია ცარიელია"
            description="დასრულებული სესიები აქ გამოჩნდება."
          />
        )
      ) : grouped ? (
        <div className="space-y-6">
          {grouped.map(g => (
            <section key={g.label} aria-label={g.label}>
              <Eyebrow tone="muted" className="mb-2.5">{g.label}</Eyebrow>
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
        <p className="mt-4 text-center text-meta text-ink-400">ნაჩვენებია ბოლო ჯავშნები.</p>
      )}

      <ConfirmModal
        open={!!confirming}
        title={
          confirming?.kind === 'cancel' ? 'ჯავშნის გაუქმება?'
          : confirming?.kind === 'decline' ? 'უარი მოთხოვნაზე?'
          : 'სტუდენტი არ გამოცხადდა?'
        }
        body={
          confirming?.kind === 'cancel'
            ? 'სტუდენტს თანხა სრულად უბრუნდება.'
            : confirming?.kind === 'decline'
            ? `${confirming.b.student?.fullName ?? 'სტუდენტის'} მოთხოვნა გაუქმდება.`
            : 'აღინიშნება გამოუცხადებლობა, თანხა დაუბრუნდება.'
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
          <Icon.video className="w-4 h-4" /> ვიდეოოთახი
        </Btn>
      )}
      {needsClosure && !reschedPending && (
        <>
          <Btn variant="secondary" size="sm" onClick={() => onConfirm({ kind: 'no_show', b })} disabled={busy === b.id + 'no_show'}>
            არ გამოცხადდა
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => onAct(b, 'complete')} disabled={busy === b.id + 'complete'}>
            {busy === b.id + 'complete' ? '…' : 'დასრულება'}
          </Btn>
        </>
      )}
      {b.status === 'CONFIRMED' && future && !live && !reschedPending && (
        <>
          <Btn variant="ghost" size="sm" href={`/tutor/messages/${b.id}`}>
            <Icon.chat className="w-4 h-4" /> მიმოწერა
          </Btn>
          <Btn variant="secondary" size="sm" onClick={() => onConfirm({ kind: 'cancel', b })} disabled={busy === b.id + 'cancel'}>
            გაუქმება
          </Btn>
        </>
      )}
    </div>
  )

  return (
    <li className="rounded-card border border-ink-200 bg-white shadow-xs hover:border-ink-300 transition-colors duration-fast">
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href={`/tutor/bookings/${b.id}`} className="flex items-center gap-3 min-w-0 flex-1 group">
          <Avatar src={b.student?.avatarUrl ?? undefined} name={b.student?.fullName} size={44} />
          <span className="min-w-0 flex-1 block">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-display text-body font-bold text-ink-900 truncate group-hover:text-brand-800 transition-colors duration-fast">
                {b.student?.fullName ?? 'უცნობი სტუდენტი'}
              </span>
              <StatusPill tone={live ? 'live' : toneOf(b.status)} />
              {reschedPending && (
                <span className="inline-flex items-center h-6 px-2 rounded-pill bg-transparent border border-ink-200 text-ink-500 font-display text-micro font-bold uppercase">
                  გადადება ელოდება
                </span>
              )}
            </span>
            <span className="block text-small text-ink-600 truncate mt-0.5" title={b.topic}>{b.topic}</span>
            <span className="text-meta text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3.5 h-3.5" />{sessionDate(b.startAt)} · {sessionTime(b.startAt)}</span>
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
