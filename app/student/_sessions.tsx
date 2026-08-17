'use client'
// /student — the sessions panel: one row per booking, grouped by tab.

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ConfirmModal } from '@/components/ConfirmModal'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { PAYMENTS_LIVE, CANCEL_CUTOFF_HOURS } from '@/lib/flags'
import { bucketBookings } from '@/lib/bookings'
import { TzNote } from '@/components/workspace/TzNote'
import { sessionDate, sessionTime, sessionWeekdayShort } from '@/components/workspace/sessionTime'
import { VerifiedMark } from '@/components/Avatar'
import { Session, SessionStatus, StatusBadge, Tab, groupUpcoming } from './_model'

const SessionRow = ({ s, onOpen, onCancel, cancelling }: { s: Session; onOpen: (s: Session) => void; onCancel?: (s: Session) => void; cancelling?: boolean }) => {
  // In-app confirm sheet instead of window.confirm — the native dialog is
  // jarring on mobile and inconsistent with the rest of the product.
  const [askCancel, setAskCancel] = useState(false)
  // Cancellation policy shown BEFORE confirming, derived from the canonical
  // CANCEL_CUTOFF_HOURS window and this row's actual time-to-start (the modal
  // only mounts on click, so Date.now() here never runs during hydration).
  const freeCancel = new Date(s.startAt).getTime() - Date.now() >= CANCEL_CUTOFF_HOURS * 3_600_000
  return (
  <>
  {/* Mobile: 2-col grid (avatar + text), actions wrap to their own full-width
      row below — buttons squeezing the text column made 390px unreadable. */}
  <article onClick={() => onOpen(s)} className="cursor-pointer grid grid-cols-[auto_1fr] sm:grid-cols-[64px_auto_minmax(0,1fr)_auto_auto] gap-x-4 gap-y-4 sm:gap-x-8 items-center py-4 sm:py-5 px-5 sm:px-6 hover:bg-ink-50/40 transition-colors duration-fast">
    {/* Date pill (desktop) — soft, borderless tile: a hairline-boxed white card
        read as heavy/„ugly“; a quiet ink-50 fill with a brand-tinted weekday
        and a well-proportioned day number scans cleaner. */}
    <div className="hidden sm:flex flex-col items-center justify-center w-16 h-[72px] rounded-2xl bg-ink-50">
      <span className="font-display text-micro font-bold uppercase text-brand-600/90">{s.day}</span>
      <span className="font-display text-h2 font-extrabold leading-none text-ink-900 tabular-nums mt-1.5">{s.date.split(' ')[0]}</span>
      <span className="font-display text-micro uppercase text-ink-400 mt-1.5">{s.date.split(' ')[1]?.slice(0, 3)}</span>
    </div>

    {/* Expert avatar */}
    <div className="relative shrink-0">
      <img src={s.expert.avatarUrl || DEFAULT_AVATAR} alt={s.expert.name} className="w-14 h-14 rounded-full object-cover" />
      <span className="absolute -bottom-0.5 -right-0.5"><VerifiedMark size={13} /></span>
    </div>

    {/* Topic + meta */}
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-display text-body-lg font-bold text-ink-900 tracking-tight truncate">{s.expert.name}</h3>
        <span className="font-display text-meta font-semibold text-brand-700">{s.expert.cat}</span>
        <StatusBadge s={s.status} />
        {s.status === 'completed' && !s.reviewed && (
          <span className="inline-flex items-center gap-1 px-2 h-5 rounded-pill bg-transparent border border-ink-200 text-micro font-display font-bold uppercase text-ink-500">
            <Icon.star aria-hidden className="w-3 h-3" />
            შეფასების მოლოდინში
          </span>
        )}
      </div>
      <p className="mt-1 text-small text-ink-700 leading-snug line-clamp-1">{s.topic}</p>
      {/* Mobile-only inline meta — on desktop time+price move to their own
          right-aligned column so the row's actions no longer float against a
          large empty gap. */}
      <div className="mt-1.5 inline-flex items-center gap-3 text-meta text-ink-500 sm:hidden">
        <span className="inline-flex items-center gap-1">
          <Icon.cal className="w-3 h-3" />
          {s.date}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon.clock className="w-3 h-3" />
          {s.time} · {s.duration} წთ
        </span>
        <span className="text-ink-700 font-display font-semibold tabular-nums">₾{s.price}</span>
      </div>
    </div>

    {/* Meta (desktop) — time + price, right-aligned, sitting next to the
        actions so the row reads as info-left / summary+actions-right. */}
    <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-right">
      <span className="inline-flex items-center gap-1.5 text-meta text-ink-600 tabular-nums">
        <Icon.clock className="w-3.5 h-3.5 text-ink-400" />
        {s.time} · {s.duration} წთ
      </span>
      <span className="font-display text-body font-semibold text-ink-800 tabular-nums inline-flex items-center gap-1">
        {PAYMENTS_LIVE && <Icon.shieldCheck className="w-3.5 h-3.5 text-success-600" />}
        ₾{s.price}
      </span>
    </div>

    {/* Action */}
    <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1.5 shrink-0 flex-wrap" onClick={e => e.stopPropagation()}>
      {s.status === 'confirmed' && (
        <>
          <Link href={`/student/messages/${s.id}`} aria-label="მიმოწერა" className="hidden md:inline-flex h-10 sm:h-9 w-9 rounded-btn border border-ink-200 hover:border-ink-300 text-ink-600 items-center justify-center transition-colors duration-fast">
            <Icon.chat className="w-4 h-4" />
          </Link>
          <Link href={`/session/${s.id}`} className="h-10 sm:h-9 px-3.5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-small tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast">
            <Icon.video className="w-3.5 h-3.5" />
            <span>ოთახი</span>
          </Link>
          {onCancel && (
            <button type="button" disabled={cancelling} onClick={() => setAskCancel(true)} className="h-10 sm:h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:text-danger-700 text-ink-700 font-display font-semibold text-meta tracking-wide transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed">
              {cancelling ? 'უუქმდება…' : 'გაუქმება'}
            </button>
          )}
        </>
      )}
      {s.status === 'pending' && (
        <>
          <button type="button" onClick={() => onOpen(s)} className="h-10 sm:h-9 px-3.5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-meta tracking-wide transition-colors duration-fast">
            დეტალები
          </button>
          {onCancel && (
            <button type="button" disabled={cancelling} onClick={() => setAskCancel(true)} className="h-10 sm:h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:text-danger-700 text-ink-700 font-display font-semibold text-meta tracking-wide transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed">
              {cancelling ? 'უუქმდება…' : 'გაუქმება'}
            </button>
          )}
        </>
      )}
      {s.status === 'completed' && (
        <>
          {!s.reviewed && (
            <Link href={`/student/bookings/${s.id}?review=1`} className="h-10 sm:h-9 px-3.5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-small tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast">
              <Icon.star aria-hidden className="w-3.5 h-3.5" />
              <span>შეაფასე</span>
            </Link>
          )}
          {/* Rebook mini-CTA — jumps back to the tutor profile with
              topic/duration/price prefilled, and auto-opens the booking modal. */}
          <Link
            href={
              s.tutorId
                ? `/tutors/${s.tutorId}?topic=${encodeURIComponent(s.topic)}&duration=${s.duration}&price=${s.price}&rebook=1`
                : '/tutors'
            }
            className="h-10 sm:h-9 px-3.5 rounded-btn bg-brand-50 border border-brand-200 hover:bg-brand-600 hover:text-white hover:border-brand-600 text-brand-800 font-display font-semibold text-meta tracking-wide transition-colors duration-fast inline-flex items-center gap-1.5"
          >
            <Icon.refresh className="w-3.5 h-3.5" />
            <span>დაჯავშნე ისევ</span>
          </Link>
        </>
      )}
      {s.status === 'cancelled' && (
        <Link href="/tutors" className="h-10 sm:h-9 px-3.5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-700 font-display font-medium text-meta tracking-wide transition-colors duration-fast inline-flex items-center">
          ხელახლა
        </Link>
      )}
      <button type="button" onClick={() => onOpen(s)} aria-label="მეტი" className="h-10 w-10 rounded-btn hover:bg-ink-100 text-ink-500 inline-flex items-center justify-center transition-colors duration-fast">
        <Icon.more className="w-4 h-4" />
      </button>
    </div>
  </article>
  <ConfirmModal
    open={askCancel}
    title="სესიის გაუქმება"
    body={<>
      უქმდება <span className="font-display font-semibold">{s.topic}</span> — {s.date}, {s.time}.{' '}
      {PAYMENTS_LIVE ? (
        freeCancel
          ? <>დაწყებამდე {CANCEL_CUTOFF_HOURS} საათზე მეტია — თანხა სრულად დაგიბრუნდება.</>
          : <>დაწყებამდე {CANCEL_CUTOFF_HOURS} საათზე ნაკლებია — სრული დაბრუნება აღარ არის გარანტირებული.</>
      ) : (
        <>გაუქმება უფასოა.</>
      )}
    </>}
    confirmLabel="გაუქმება"
    cancelLabel="დარჩეს"
    tone="danger"
    busy={cancelling}
    onConfirm={() => { setAskCancel(false); onCancel?.(s) }}
    onCancel={() => setAskCancel(false)}
  />
  </>
  )
}

export const SessionsPanel = ({ bookings, loading, loadError, reload, onOpenSession }: { bookings: any[]; loading: boolean; loadError: string | null; reload: () => Promise<void> | void; onOpenSession: (s: Session) => void }) => {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const mapSession = (b: any): Session => {
    const statusMap: Record<string, SessionStatus> = { CONFIRMED: 'confirmed', PREPARING: 'pending', LIVE: 'confirmed', COMPLETED: 'completed', CANCELED: 'cancelled', NO_SHOW: 'cancelled' }
    return {
      id: b.id,
      tutorId: b.tutor?.id,
      // Guard every tutor dereference — a booking whose tutor was deleted has
      // `tutor: null`, which previously threw inside data.map and dumped the
      // user into the fake-fixture fallback below.
      // `cat` = the CATEGORY (the API already selects it), `specialty` only as
      // the fallback. `specialty` is a frozen copy of the category name from
      // approval day, so it contradicted the same expert's card after a rename.
      expert: { name: b.tutor?.user?.fullName ?? 'ექსპერტი', avatarUrl: b.tutor?.user?.avatarUrl ?? null, cat: b.tutor?.category?.name ?? b.tutor?.specialty ?? '', headline: b.tutor?.headline ?? '' },
      topic: b.topic,
      startAt: b.startAt,
      // Tbilisi wall-clock, always — these strings feed the date pill, the row
      // meta AND the cancel dialog, so a viewer abroad used to be shown their
      // own local hour while every reminder e-mail said „თბილისის დროით".
      date: sessionDate(b.startAt, { month: 'long' }),
      day: sessionWeekdayShort(b.startAt),
      time: sessionTime(b.startAt),
      duration: b.durationMin,
      price: b.price,
      status: statusMap[b.status] ?? 'pending',
      // A booking with a persisted review (or reviewedAt timestamp) is done —
      // stop showing the "awaiting review" badge / CTA for it.
      reviewed: b.review != null || b.reviewedAt != null,
    }
  }

  const handleCancel = async (s: Session) => {
    if (cancellingId) return
    setCancellingId(s.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/bookings/${s.id}/cancel`, { method: 'POST' })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setFlash(data?.error === 'BAD_STATE' ? 'ეს სესია უკვე დასრულებული ან გაუქმებულია.' : 'გაუქმება ვერ მოხერხდა.')
        return
      }
      // Refund wording only once payments are live — free-era bookings never
      // held money, so "სრული დაბრუნება" would assert a refund that never was.
      setFlash(PAYMENTS_LIVE && data?.fullRefund ? 'სესია გაუქმდა · სრული დაბრუნება.' : 'სესია გაუქმდა.')
      await reload()
    } catch {
      setFlash('ქსელის შეცდომა.')
    } finally {
      setCancellingId(null)
    }
  }

  // Derived from the SAME bucketBookings() the header uses, so the "მომავალი"
  // badge (upcoming = future confirmed/pending/live) always matches the header's
  // upcoming count. On an API failure the parent passes [] + loadError, so we
  // show the error banner + true empty state — never fabricated demo sessions.
  const data: Record<Tab, Session[]> = useMemo(() => {
    const { upcoming, past, cancelled } = bucketBookings(bookings)
    return {
      upcoming: upcoming.map(mapSession),
      past: past.map(mapSession),
      cancelled: cancelled.map(mapSession),
    }
  }, [bookings])
  const tabs: { id: Tab; l: string; c: number }[] = [
    { id: 'upcoming', l: 'მომავალი', c: data.upcoming.length },
    { id: 'past',     l: 'დასრულებული', c: data.past.length },
    { id: 'cancelled', l: 'გაუქმებული', c: data.cancelled.length },
  ]
  const rows = data[tab]
  return (
    <section className="rounded-card border border-ink-200 bg-white overflow-hidden">
      {/* Header with tabs */}
      <div className="px-5 sm:px-6 pt-5 border-b border-ink-100">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <Eyebrow className="mb-1">აქტივობა</Eyebrow>
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">ჩემი სესიები</h2>
            <p className="text-meta text-ink-500 mt-0.5">
              {PAYMENTS_LIVE ? 'ყველა ჯავშანი · დაცული გადახდით' : 'ყველა ჯავშანი · დაჯავშნა უფასოა'}
              {/* The separator rides the note itself, so nothing dangles for
                  Tbilisi viewers (TzNote renders nothing for them). */}
              <TzNote className="text-meta text-ink-500 before:content-['·'] before:mx-1" />
            </p>
          </div>
          <Link href="/student/bookings" className="font-display text-meta font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1 min-h-[40px] sm:min-h-0">
            მთლიანი ისტორია
          </Link>
        </div>

        <div className="mt-5 -mb-px flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map(t => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                // min-h-[40px] + pt-2 — the underline tab pattern measured 32px, under
                // the 40px floor. Padding grows the hit area UPWARD so the indicator
                // stays on the border line (same fix as /tutor/bookings).
                className={`relative inline-flex items-center gap-2 min-h-[40px] pt-2 pb-3 px-1 mr-4 font-display text-small font-semibold tracking-wide transition-colors duration-fast ${on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'}`}
              >
                {t.l}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-meta font-bold tabular-nums ${on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600'}`}>{t.c}</span>
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink-900 rounded-full" />}
              </button>
            )
          })}
        </div>
      </div>

      {(flash || loadError) && (
        <div role="alert" className={`px-5 sm:px-6 py-2.5 text-small font-medium ${loadError ? 'bg-danger-50 text-danger-800 border-b border-danger-200' : 'bg-success-50 text-success-800 border-b border-success-200'}`}>
          {loadError ? (
            <span className="inline-flex items-center gap-3 flex-wrap">
              <span>{loadError}</span>
              {/* A failed load must never dead-end — retry re-runs the parent fetch. */}
              <button type="button" onClick={() => reload()} className="font-display font-semibold underline underline-offset-2 hover:text-danger-900 transition-colors duration-fast">
                სცადე თავიდან
              </button>
            </span>
          ) : flash}
        </div>
      )}

      {/* Body */}
      <div className="divide-y divide-ink-100">
        {loading ? (
          // Skeleton rows mirroring the real SessionRow grid — the layout is
          // known, so no spinner and no jump when data lands.
          <div aria-busy="true" className="divide-y divide-ink-100">
            {[0, 1, 2].map(i => (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[64px_auto_1fr_auto] gap-4 sm:gap-5 items-center py-4 px-5 motion-safe:animate-pulse">
                <div className="hidden sm:block w-16 h-16 rounded-card bg-ink-100" />
                <div className="w-11 h-11 rounded-full bg-ink-100" />
                <div className="min-w-0 space-y-2">
                  <div className="h-3.5 w-2/5 bg-ink-100 rounded" />
                  <div className="h-3 w-3/5 bg-ink-100 rounded" />
                </div>
                <div className="h-10 sm:h-9 w-24 bg-ink-100 rounded-btn" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          // Per-tab empty copy: what's (not) here, why, and — where an action
          // exists — where to go next. Never a dead end.
          <EmptyState
            variant="inline"
            illustration="bookings"
            title={tab === 'past' ? 'დასრულებული სესია ჯერ არ გაქვს' : tab === 'cancelled' ? 'გაუქმებული ჯავშანი არ არის' : 'მომავალი სესია არ გაქვს'}
            description={
              tab === 'past'
                ? 'დასრულებული სესიები აქ გამოჩნდება.'
                : tab === 'cancelled'
                  ? 'არცერთი ჯავშანი არ გაგიუქმებია.'
                  : 'აირჩიე ექსპერტი და დაჯავშნე.'
            }
            cta={tab === 'upcoming' ? { label: 'იპოვე ექსპერტი', href: '/tutors' } : undefined}
          />
        ) : tab === 'upcoming' ? (
          // Day-grouped: „დღეს / ხვალ / ამ კვირაში / მოგვიანებით" headers make
          // a long upcoming list scannable. Past/cancelled stay flat (order is
          // recency, not schedule).
          groupUpcoming(rows).map(g => (
            <div key={g.key}>
              <div className="px-5 sm:px-6 py-2 bg-ink-50/50 flex items-center gap-2">
                <Eyebrow as="span" tone="muted">{g.label}</Eyebrow>
                <span className="text-meta text-ink-400 tabular-nums">· {g.items.length}</span>
              </div>
              <div className="divide-y divide-ink-100">
                {g.items.map(s => <SessionRow key={s.id} s={s} onOpen={onOpenSession} onCancel={handleCancel} cancelling={cancellingId === s.id} />)}
              </div>
            </div>
          ))
        ) : (
          rows.map(s => <SessionRow key={s.id} s={s} onOpen={onOpenSession} onCancel={handleCancel} cancelling={cancellingId === s.id} />)
        )}
      </div>

      {rows.length > 0 && (
        <div className="px-5 sm:px-6 py-3.5 bg-ink-50/40 border-t border-ink-100 flex items-center justify-between">
          <span className="text-meta text-ink-500"><span className="font-display font-semibold text-ink-700 tabular-nums">{rows.length}</span> სესია</span>
          <Link href="/student/bookings" className="font-display text-meta font-semibold text-ink-700 hover:text-ink-900 inline-flex items-center gap-1">
            სრული სიის ნახვა
            <Icon.chevR className="w-3 h-3" />
          </Link>
        </div>
      )}
    </section>
  )
}