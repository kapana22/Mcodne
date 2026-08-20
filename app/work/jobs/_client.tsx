'use client'
// The one list, rendered. The ROW MODEL is lib/jobRows (pure, tested); this
// file is the screen around it — the three buckets, the day headers, the
// undated tail, and the actions a BOOKING still carries.
//
// ⚠️ THE ACTIONS ARE THE ONE PLACE THE TWO KINDS DIVERGE, and they should be.
// A booking has a lifecycle the provider drives from the list (accept, decline,
// cancel, complete, no-show) and a room to enter; an accepted quote has none —
// the „დასრულდა" button belongs to the client, and the provider's copy of it
// lives on /work/offers beside the message thread. So a quote row opens, it
// does not act.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { ConfirmModal } from '@/components/ConfirmModal'
import { EmptyState } from '@/components/EmptyState'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { StatusPill } from '@/components/StatusPill'
import { useToast } from '@/components/ToastProvider'
import { TzNote } from '@/components/workspace/TzNote'
import { sessionDate, sessionTime } from '@/components/workspace/sessionTime'
import { useScrollIntoResults } from '@/lib/useScrollIntoResults'
import { dayKeyInTz } from '@/lib/bookings'
import { isBookingLive } from '@/lib/bookingLive'
import { refreshNavBadges } from '@/components/tutor/useNavBadges'
import {
  buildJobRows, splitDated, UNDATED_LABEL,
  type JobBucket, type JobRow, type QuoteJobInput,
} from '@/lib/jobRows'
import {
  type DashBooking as Booking,
  toneOf,
  awaitsClosure,
  awaitsRescheduleAnswer,
  type BookingStatus,
} from '../_components/types'

const TABS: { id: JobBucket; label: string }[] = [
  { id: 'attention', label: 'ყურადღება' },
  { id: 'active', label: 'მიმდინარე' },
  { id: 'history', label: 'ისტორია' },
]

// Old links keep their intent: ?tab=PREPARING came from the dashboard and the
// notifications, ?tab=upcoming from the bookings list this page replaced.
const LEGACY_TAB: Record<string, JobBucket> = {
  upcoming: 'active',
  PREPARING: 'attention',
  LIVE: 'active',
  CONFIRMED: 'active',
  COMPLETED: 'history',
  CANCELED: 'history',
  ALL: 'attention',
}

// Grouped by the TBILISI day, because the row times are Tbilisi wall-clock —
// grouping on the viewer's midnight would file a 00:30 Tbilisi session under
// „ხვალ" and then print „00:30" next to it.
const dayLabel = (when: Date, now: Date) => {
  const days = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86_400_000
  const diff = days(dayKeyInTz(when)) - days(dayKeyInTz(now))
  if (diff === 0) return 'დღეს'
  if (diff === 1) return 'ხვალ'
  return sessionDate(when.toISOString(), { weekday: true })
}

type Props = { quotes: QuoteJobInput[]; showBookings: boolean; hasProvider: boolean }

function JobsInner({ quotes, showBookings, hasProvider }: Props) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [bookings, setBookings] = useState<Booking[] | null>(showBookings ? null : [])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ kind: 'cancel' | 'no_show' | 'decline'; b: Booking } | null>(null)

  const load = async () => {
    if (!showBookings) return
    try {
      const resp = await fetch('/api/tutor/bookings')
      // Expired session / wrong role → go to signin, not a misleading empty list.
      if (resp.status === 401 || resp.status === 403) {
        window.location.href = '/signin?redirect=/work/jobs'
        return
      }
      if (!resp.ok) throw new Error('load failed')
      const res = await resp.json().catch(() => null)
      setBookings(Array.isArray(res?.bookings) ? res.bookings : [])
      setErr(null)
    } catch {
      setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
      setBookings(prev => prev ?? [])
    }
  }
  useEffect(() => { load() }, [])

  const now = Date.now()
  const nowDate = new Date()

  // ONE call builds every bucket, so the tab counters and the rows under them
  // can never come from two different sorts (lib/jobRows → buildJobRows).
  const buckets = useMemo(
    () => buildJobRows({ bookings: bookings ?? [], quotes }, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, quotes],
  )
  const byId = useMemo(() => new Map((bookings ?? []).map(b => [b.id, b])), [bookings])

  const rawTab = searchParams?.get('tab') ?? null
  const tab: JobBucket =
    rawTab && (TABS.some(t => t.id === rawTab) || LEGACY_TAB[rawTab])
      ? ((TABS.some(t => t.id === rawTab) ? rawTab : LEGACY_TAB[rawTab]) as JobBucket)
      : buckets.attention.length > 0 ? 'attention' : 'active'

  // Shallow URL update — router.replace would re-render the force-dynamic
  // layout server-side (a full DB round-trip) just to switch a client tab.
  const setTab = (t: JobBucket) => window.history.replaceState(null, '', `/work/jobs?tab=${t}`)

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
      const j = await res.json().catch(() => ({} as Record<string, string>))
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
      const j = await res.json().catch(() => ({} as Record<string, string>))
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
  const total = buckets.attention.length + buckets.active.length + buckets.history.length
  const { dated, undated } = splitDated(list)

  // Day headers only where a day means something: work still ahead. History is
  // one reverse-chronological column.
  const grouped = useMemo(() => {
    if (tab !== 'active') return null
    const groups: { label: string; items: JobRow[] }[] = []
    for (const r of dated) {
      const label = dayLabel(r.when as Date, nowDate)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(r)
      else groups.push({ label, items: [r] })
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, list])

  const row = (r: JobRow) => (
    <JobRowItem
      key={`${r.kind}:${r.id}`}
      r={r}
      b={r.kind === 'BOOKING' ? byId.get(r.id) : undefined}
      now={now}
      busy={busy}
      onAct={act}
      onConfirm={setConfirming}
    />
  )

  return (
    <div>
      {/* Bucket tabs — underline pattern from the client side */}
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
        {/* Every dated row below is Tbilisi wall-clock — say so, once, and only
            to viewers whose browser is somewhere else. */}
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
        // TWO empty states, and the difference is the whole point: „you have no
        // work yet" is news about the account, „nothing in this filter" is news
        // about the tab. Showing the first inside a filter tells somebody with
        // eleven finished jobs that they have never worked here.
        total === 0 ? (
          <EmptyState
            illustration="bookings"
            title="ჯერ სამუშაო არ გაქვს"
            description="დადასტურებული ჯავშნები და მიღებული შეთავაზებები აქ ერთ სიაში ჩნდება."
            cta={
              showBookings ? { label: 'დროის გამოქვეყნება', href: '/work/schedule' }
              : hasProvider ? { label: 'მოთხოვნები', href: '/work/requests' }
              : undefined
            }
          />
        ) : (
          <EmptyState
            icon={<Icon.check className="w-6 h-6" />}
            title={tab === 'attention' ? 'ყველაფერი მოგვარებულია' : 'ამ ფილტრში არაფერია'}
            description={
              tab === 'attention' ? 'პასუხს არაფერი ელოდება.'
              : tab === 'active' ? 'მიმდინარე სამუშაო არ არის — ნახე ისტორია.'
              : 'დასრულებული სამუშაო ჯერ არ გაქვს.'
            }
          />
        )
      ) : (
        /* ⚠️ KEYED ON THE TAB. Switching a filter here is instant (the rows are
           already in memory), which is right — but instant with no transition
           reads as „did that work?". The key remounts the results so the site's
           own `fade-in-fast` (140ms, the same token every other state toggle
           uses) plays once per switch. Nothing moves; only the opacity does,
           so no control is delayed and nothing shifts under the cursor. */
        <div key={tab} className="space-y-6 motion-safe:animate-fade-in-fast">
          {grouped
            ? grouped.map(g => (
                <section key={g.label} aria-label={g.label}>
                  <Eyebrow tone="muted" className="mb-2.5">{g.label}</Eyebrow>
                  <ul className="space-y-3 motion-safe:stagger">{g.items.map(row)}</ul>
                </section>
              ))
            : dated.length > 0 && <ul className="space-y-3 motion-safe:stagger">{dated.map(row)}</ul>}

          {/* ⚠️ THE UNDATED TAIL. A quote has no slot; it sits under its own
              heading instead of borrowing one. */}
          {undated.length > 0 && (
            <section aria-label={UNDATED_LABEL}>
              <Eyebrow tone="muted" className="mb-2.5">{UNDATED_LABEL}</Eyebrow>
              <ul className="space-y-3 motion-safe:stagger">{undated.map(row)}</ul>
            </section>
          )}
        </div>
      )}

      {!loading && tab === 'history' && list.length >= 30 && (
        <p className="mt-4 text-center text-meta text-ink-400">ნაჩვენებია ბოლო სამუშაოები.</p>
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
            ? 'კლიენტს თანხა სრულად უბრუნდება.'
            : confirming?.kind === 'decline'
            ? `${confirming.b.student?.fullName ?? 'კლიენტის'} მოთხოვნა გაუქმდება.`
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

/* One job row. The identity block is the SHARED model — the same name, status,
   title, time and price shape for both kinds, so the list reads as one list.
   Only the action cluster knows which table the row came from. */
function JobRowItem({
  r,
  b,
  now,
  busy,
  onAct,
  onConfirm,
}: {
  r: JobRow
  b: Booking | undefined
  now: number
  busy: string | null
  onAct: (b: Booking, action: 'accept' | 'decline' | 'complete' | 'no_show') => void
  onConfirm: (c: { kind: 'cancel' | 'no_show' | 'decline'; b: Booking }) => void
}) {
  const live = b ? isBookingLive(b) : false
  const needsClosure = b ? awaitsClosure(b, now) : false
  const reschedPending = b ? awaitsRescheduleAnswer(b) : false
  const future = b ? new Date(b.startAt).getTime() > now : false
  const terminal = r.bucket === 'history'

  const actions = !b || terminal ? null : (
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
        <Btn variant="primary" size="sm" href={r.href}>პასუხი გადადებაზე</Btn>
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
          <Btn variant="ghost" size="sm" href={`/work/messages/${b.id}`}>
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
        <Link href={r.href} className="flex items-center gap-3 min-w-0 flex-1 group">
          <Avatar src={b?.student?.avatarUrl ?? undefined} name={r.peerName} size={44} />
          <span className="min-w-0 flex-1 block">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-display text-body font-bold text-ink-900 truncate group-hover:text-brand-800 transition-colors duration-fast">
                {r.peerName}
              </span>
              {/* The BOOKING keeps its own pill (colour carries LIVE); a QUOTE
                  has three words of its own and a neutral outline. */}
              {r.kind === 'BOOKING' ? (
                <StatusPill tone={live ? 'live' : toneOf(r.status as BookingStatus)} label={live ? undefined : r.statusLabel} />
              ) : (
                <span className="inline-flex items-center h-6 px-2.5 rounded-pill border bg-transparent font-display text-micro font-bold uppercase border-ink-200 text-ink-500">
                  {r.statusLabel}
                </span>
              )}
              {reschedPending && (
                <span className="inline-flex items-center h-6 px-2 rounded-pill bg-transparent border border-ink-200 text-ink-500 font-display text-micro font-bold uppercase">
                  გადადება ელოდება
                </span>
              )}
            </span>
            <span className="block text-small text-ink-600 truncate mt-0.5" title={r.title}>{r.title}</span>
            <span className="text-meta text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
              {r.when ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Icon.calendar className="w-3.5 h-3.5" />
                    {sessionDate(r.when.toISOString())} · {sessionTime(r.when.toISOString())}
                  </span>
                  {b && <span className="inline-flex items-center gap-1"><Icon.clock className="w-3.5 h-3.5" />{b.durationMin} წთ</span>}
                </>
              ) : (
                <span className="inline-flex items-center gap-1"><Icon.briefcase className="w-3.5 h-3.5" />შეთანხმებული სამუშაო</span>
              )}
              <span className="font-display font-bold text-ink-800 tabular-nums">{r.price}</span>
            </span>
          </span>
        </Link>
        {actions}
      </div>
    </li>
  )
}

// useSearchParams requires a Suspense boundary in Next 15.
export function JobsClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <JobsInner {...props} />
    </Suspense>
  )
}
