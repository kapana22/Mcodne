'use client'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/components/ToastProvider'
import { copyToClipboard } from '@/lib/clipboard'
import { fmtDateTime as fmtInTz, userTimezone, TBILISI } from '@/lib/tz'
import { fmtKaDate, fmtKaDateTime, fmtKaTime } from '@/lib/kaDate'
import { safeHttpUrl } from '@/lib/safeUrl'

/* ───── Minimal icon set ───── */
const Icon = {
  arrow:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>,
  chevL:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 6-6 6 6 6" /></svg>,
  chevR:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 6 6 6-6 6" /></svg>,
  check:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m4 12 5 5L20 6" /></svg>,
  star:     (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>,
  video:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="m15.5 10 6-3v10l-6-3" /></svg>,
  cal:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  clock:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  chat:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.6 8.6 0 0 1-3.5-.7L3 21l1.7-5.5A8.5 8.5 0 1 1 21 11.5Z" /></svg>,
  shield:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /></svg>,
  wallet:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7a2 2 0 0 1 2-2h11l4 4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>,
  x:        (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  refresh:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 0 1 15.5-6L21 4M21 4v6h-6M21 12a9 9 0 0 1-15.5 6L3 20M3 20v-6h6" /></svg>,
  flag:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 21V4M4 4h13l-2 5 2 5H4" /></svg>,
  download: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 4v12m0 0 5-5m-5 5-5-5M4 20h16" /></svg>,
}

/* ───── Types ───── */
type ApiStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'
type MsgUser = { id: string; fullName: string; avatarUrl?: string | null }
type BookingMsg = { id: string; body: string; fromId: string; createdAt: string; from: MsgUser; fileUrl?: string | null; fileName?: string | null }
type ExistingReview = { id: string; rating: number; body: string; createdAt: string; studentId: string }
type ReschedulePayload = {
  proposedBy: 'STUDENT' | 'TUTOR'
  newStartAt: string
  reason: string | null
  proposedAt: string
}
type Booking = {
  id: string
  ref: string
  topic: string
  status: ApiStatus
  startAt: string
  durationMin: number
  price: number
  meetingUrl?: string | null
  studentNotes?: string | null
  tutorNotes?: string | null
  createdAt: string
  cancelledBy?: 'STUDENT' | 'TUTOR' | 'ADMIN' | null
  cancelReason?: string | null
  student: { id: string; fullName: string; avatarUrl?: string | null }
  tutor: {
    id: string
    rating?: number | null
    reviewsCount?: number | null
    specialty?: string | null
    user: { id: string; fullName: string; avatarUrl?: string | null }
    category?: { name?: string | null } | null
  }
  messages: BookingMsg[]
  review?: ExistingReview | null
  rescheduleRequest?: ReschedulePayload | null
}

/* ───── Georgian date/time formatting ───── */
const KA_MONTHS_SHORT = ['იან.','თებ.','მარტ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექტ.','ოქტ.','ნოე.','დეკ.']
const KA_WEEKDAY_SHORT = ['კვ.','ორშ.','სამშ.','ოთხ.','ხუთ.','პარ.','შაბ.']

const fmtDate = (d: Date) => `${KA_WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${KA_MONTHS_SHORT[d.getMonth()]}`
const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/* ───── Status badge ───── */
const STATUS_MAP: Record<ApiStatus, { l: string; cls: string; dot?: string }> = {
  PREPARING: { l: 'ჯავშანი ელოდება ექსპერტის დადასტურებას', cls: 'bg-warning-50 text-warning-700 border-warning-200', dot: 'bg-warning-500' },
  CONFIRMED: { l: 'ექსპერტმა დაადასტურა — ვიდეო-ოთახი გამზადებულია', cls: 'bg-brand-50 text-brand-800 border-brand-200', dot: 'bg-brand-500' },
  LIVE:      { l: 'სესია მიმდინარეობს ცოცხალ ეთერში', cls: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500' },
  COMPLETED: { l: 'სესია დასრულდა', cls: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500' },
  CANCELED:  { l: 'ჯავშანი გაუქმდა', cls: 'bg-ink-100 text-ink-700 border-ink-200' },
  NO_SHOW:   { l: 'აღინიშნა no-show', cls: 'bg-iris-50 text-iris-700 border-iris-200' },
}

const tabOf = (s: ApiStatus) =>
  s === 'COMPLETED' || s === 'NO_SHOW' ? 'დასრულებული'
  : s === 'CANCELED' ? 'გაუქმებული'
  : 'მომავალი'

/* ───── Header ───── */
const TopBar = () => (
  <header className="sticky top-0 z-40 bg-ink-50/90 backdrop-blur-md border-b border-ink-100">
    <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
      <Link href="/student" className="inline-flex items-center" aria-label="მცოდნე">
        <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
      </Link>
      <nav className="flex items-center gap-4 lg:gap-3 overflow-x-auto scrollbar-hide whitespace-nowrap min-w-0 ml-4">
        <Link href="/student" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">დაშბორდი</Link>
        <Link href="/student/bookings" className="text-[13px] font-display font-semibold text-brand-700 hover:text-brand-800">ჩემი ჯავშნები</Link>
        <Link href="/student/messages" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">შეტყობინებები</Link>
        <Link href="/student/favorites" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">შენახული</Link>
        <Link href="/student/profile" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">პროფილი</Link>
      </nav>
    </div>
  </header>
)

/* ───── Breadcrumb ───── */
const Breadcrumb = ({ status, ref }: { status: ApiStatus; ref: string }) => (
  <div className="max-w-[1240px] mx-auto px-6 lg:px-8 pt-6 flex items-center gap-2 text-[12px] text-ink-500">
    <Link href={`/student/bookings?tab=${status === 'COMPLETED' || status === 'NO_SHOW' ? 'past' : status === 'CANCELED' ? 'canceled' : 'upcoming'}`}
          className="hover:text-ink-900 font-display font-semibold inline-flex items-center gap-1">
      <Icon.chevL className="w-3 h-3" /> ჩემი ჯავშნები
    </Link>
    <Icon.chevR className="w-3 h-3 text-ink-300" />
    <span className="font-display font-semibold text-ink-700">{tabOf(status)}</span>
    <Icon.chevR className="w-3 h-3 text-ink-300" />
    <span className="font-mono tabular-nums text-ink-500">#{ref.slice(0, 8)}</span>
  </div>
)

/* ───── Countdown to a date ───── */
const useCountdown = (target: Date | null) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!target) return null
  const diff = Math.max(0, target.getTime() - now)
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff / 3_600_000) % 24)
  const m = Math.floor((diff / 60_000) % 60)
  const s = Math.floor((diff / 1000) % 60)
  return { d, h, m, s, diff }
}

/* ───── Coarse countdown label — refreshes every 60s.
   Emits "დაწყებულია" while session is in-flight, "დასრულებულია" past end,
   and human-friendly units otherwise. Kept separate from `useCountdown`
   so we don't force a 1-second tick just for a pill. */
const useRemainingLabel = (startAt: Date, durationMin: number): string => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const start = startAt.getTime()
  const end = start + durationMin * 60_000
  if (now >= end) return 'დასრულებულია'
  if (now >= start) return 'დაწყებულია'
  const diff = start - now
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff / 3_600_000) % 24)
  const mins = Math.max(1, Math.floor((diff / 60_000) % 60))
  if (days > 0) return `${days} დღე · ${hours} სთ`
  if (hours > 0) return `${hours} სთ · ${mins} წთ`
  const totalMin = Math.max(1, Math.ceil(diff / 60_000))
  return `${totalMin} წუთი`
}

/* Rebook query — passes topic/duration/price back to the tutor's detail page
   so the booking modal opens pre-filled. Kept as a pure helper because both
   the Hero card and the sidebar action need identical semantics. */
const rebookHref = (booking: Booking): string => {
  const params = new URLSearchParams({
    topic: booking.topic,
    duration: String(booking.durationMin),
    price: String(booking.price),
    rebook: '1',
  })
  return `/tutors/${booking.tutor.id}?${params.toString()}`
}

/* Client-only hook: resolves the visitor's browser timezone after mount.
   Returns `TBILISI` during SSR/first paint so hydration stays stable. */
const useUserTz = (): string => {
  const [tz, setTz] = useState<string>(TBILISI)
  useEffect(() => { setTz(userTimezone()) }, [])
  return tz
}

/* ───── Hero ───── */
const Hero = ({ booking, onEnterRoom, onReview, onCopyRef }: { booking: Booking; onEnterRoom: () => void; onReview: () => void; onCopyRef: () => void }) => {
  const status = booking.status
  const m = STATUS_MAP[status]
  const start = new Date(booking.startAt)
  const end = new Date(start.getTime() + booking.durationMin * 60_000)
  const created = new Date(booking.createdAt)
  const tz = useUserTz()
  const showTzHint = tz !== TBILISI
  // Rendered wall-clock in Tbilisi — surfaced only when the visitor is
  // clearly in a different tz. Uses the shared helper so the string format
  // stays consistent with the tutor-side view.
  const tbilisiTime = showTzHint
    ? fmtInTz(booking.startAt, { weekday: 'short', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }, TBILISI).local
    : ''
  const cd = useCountdown(status === 'CONFIRMED' || status === 'PREPARING' || status === 'LIVE' ? start : null)
  const remainingLabel = useRemainingLabel(start, booking.durationMin)
  // Only show the "დაწყებამდე დარჩა" pill for non-terminal bookings — cancelled
  // and no-show sessions never start, so a countdown there is noise.
  const showRemainingPill = status !== 'CANCELED' && status !== 'NO_SHOW'
  const tutorFullName = booking.tutor.user.fullName
  const tutorSpecialty = booking.tutor.specialty ?? booking.tutor.category?.name ?? 'ექსპერტი'

  return (
    <section className="max-w-[1240px] mx-auto px-6 lg:px-8 pt-5">
      <div className="rounded-card overflow-hidden border border-ink-200 bg-white">
        {/* status banner */}
        <div className={`px-6 py-3 border-b ${m.cls} flex items-center justify-between gap-3 flex-wrap`}>
          <div className="flex items-center gap-2 min-w-0">
            {m.dot && <span className="relative inline-flex"><span className={`absolute inset-0 rounded-full ${m.dot} opacity-50 animate-ping`} /><span className={`relative w-2 h-2 rounded-full ${m.dot}`} /></span>}
            <span className="font-display text-[13px] font-bold tracking-tight">{m.l}</span>
          </div>
          <span className="font-mono text-[11px] tabular-nums opacity-65 inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCopyRef}
              aria-label="ჯავშნის ID-ის კოპირება"
              title="დააკოპირე ჯავშნის ID"
              className="inline-flex items-center gap-1 px-1.5 h-5 rounded-btn hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 transition-colors"
            >
              #{booking.ref.slice(0, 12)}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 opacity-70">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            </button>
            <span>· შექმნა: {fmtDate(created)} {fmtTime(created)}</span>
          </span>
        </div>

        <div className="p-6 lg:p-7 grid lg:grid-cols-[1fr_auto] gap-6 items-start">
          <div className="min-w-0">
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">სესია</div>
            <h1 className="font-display text-[26px] lg:text-[32px] font-bold text-ink-900 tracking-tight leading-[1.1]">
              {booking.topic}
            </h1>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <div className="w-12 h-12 rounded-full overflow-hidden ring-1 ring-ink-200 shrink-0 bg-brand-100 inline-flex items-center justify-center">
                {booking.tutor.user.avatarUrl ? (
                  <img src={booking.tutor.user.avatarUrl} alt={tutorFullName} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display font-bold text-brand-700 text-[15px]">{tutorFullName.slice(0, 1)}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-[15px] font-bold text-ink-900">{tutorFullName}</span>
                </div>
                <div className="text-[12px] text-ink-500">{tutorSpecialty}</div>
              </div>
              {typeof booking.tutor.rating === 'number' && booking.tutor.rating > 0 && (
                <span className="ml-auto sm:ml-3 inline-flex items-center gap-1 text-[12.5px] text-ink-700">
                  <Icon.star className="w-3.5 h-3.5 text-warning-500" />
                  <span className="font-display font-bold tabular-nums">{booking.tutor.rating.toFixed(2)}</span>
                  {booking.tutor.reviewsCount ? <span className="text-ink-500 tabular-nums">({booking.tutor.reviewsCount})</span> : null}
                </span>
              )}
            </div>

            <div className="mt-5 grid sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-card border border-ink-200 bg-ink-50/50">
                <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 inline-flex items-center gap-1.5"><Icon.cal className="w-3 h-3" /> თარიღი</div>
                <div className="mt-1 font-display text-[14.5px] font-bold text-ink-900 tabular-nums">{fmtDate(start)}</div>
                <div className="text-[11.5px] text-ink-500 tabular-nums">{start.getFullYear()} · თბილისი (GMT+4)</div>
              </div>
              <div className="p-3 rounded-card border border-ink-200 bg-ink-50/50">
                <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 inline-flex items-center gap-1.5"><Icon.clock className="w-3 h-3" /> დრო</div>
                <div className="mt-1 font-display text-[14.5px] font-bold text-ink-900 tabular-nums">{fmtTime(start)} — {fmtTime(end)}</div>
                <div className="text-[11.5px] text-ink-500 tabular-nums">{booking.durationMin} წუთი</div>
                {showTzHint && (
                  <div className="mt-1 text-[10.5px] text-ink-400">თბილისის დროით: {tbilisiTime}</div>
                )}
              </div>
              <div className="p-3 rounded-card border border-ink-200 bg-ink-50/50">
                <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 inline-flex items-center gap-1.5"><Icon.wallet className="w-3 h-3" /> ფასი</div>
                <div className="mt-1 font-display text-[14.5px] font-bold text-ink-900 tabular-nums">₾{booking.price}</div>
                <div className="text-[11.5px] text-ink-500 tabular-nums">escrow-ში</div>
              </div>
            </div>

            {showRemainingPill && (
              <div className="mt-3">
                <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-brand-50 border border-brand-200 text-[12px] font-display font-semibold text-brand-800">
                  <Icon.clock className="w-3 h-3" />
                  {remainingLabel === 'დაწყებულია' || remainingLabel === 'დასრულებულია'
                    ? remainingLabel
                    : <>დაწყებამდე დარჩა · <span className="tabular-nums">{remainingLabel}</span></>}
                </span>
              </div>
            )}
          </div>

          {/* Right rail — action */}
          <div className="shrink-0 w-full lg:w-[260px]">
            {(status === 'PREPARING' || status === 'CONFIRMED' || status === 'LIVE') && cd && (
              <div className="text-center p-4 rounded-card bg-accent-900 text-white">
                <div className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-300 mb-2">
                  {status === 'LIVE' ? 'ცოცხალია' : 'დარჩა'}
                </div>
                {status !== 'LIVE' && (
                  <div className="flex items-end justify-center gap-1">
                    {[{ l: 'დღე', v: cd.d }, { l: 'სთ', v: cd.h }, { l: 'წთ', v: cd.m }].map((u, i) => (
                      <React.Fragment key={u.l}>
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 rounded-card bg-white/8 border border-white/10 inline-flex items-center justify-center font-display text-[18px] font-bold tabular-nums">
                            {String(u.v).padStart(2, '0')}
                          </div>
                          <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/55">{u.l}</span>
                        </div>
                        {i < 2 && <span className="text-[14px] text-white/30 pb-4">:</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}
                <button type="button" onClick={onEnterRoom}
                        disabled={status === 'PREPARING'}
                        className="mt-4 w-full h-11 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-white/10 disabled:cursor-not-allowed text-white font-display font-semibold text-[13px] inline-flex items-center justify-center gap-2 transition-colors">
                  <Icon.video className="w-4 h-4" /> ვიდეო-ოთახში
                </button>
                <div className="mt-2 text-[10.5px] text-white/55">
                  {status === 'PREPARING' ? 'ჯერ არ დაადასტურა ექსპერტმა' : 'გაიხსნება 5 წუთით ადრე'}
                </div>
              </div>
            )}

            {status === 'COMPLETED' && (
              <div className="p-4 rounded-card bg-brand-50 border border-brand-200">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">სესია დასრულდა</div>
                <p className="text-[12.5px] text-ink-700 leading-[1.5]">
                  {booking.review ? 'შენ უკვე შეაფასე ეს სესია.' : 'დაჯავშნე იგივე ექსპერტთან ან დატოვე შეფასება.'}
                </p>
                <Link
                  href={rebookHref(booking)}
                  className="mt-3 w-full h-11 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Icon.refresh className="w-4 h-4" /> დაჯავშნე ისევ
                </Link>
                {!booking.review ? (
                  <a href="#leave-review" className="mt-2 w-full h-10 rounded-btn bg-white border border-brand-200 hover:bg-brand-50 text-brand-800 font-display font-semibold text-[12.5px] inline-flex items-center justify-center gap-2 transition-colors">
                    <Icon.star className="w-4 h-4" /> შეფასების დატოვება
                  </a>
                ) : (
                  <div className="mt-2 inline-flex items-center justify-center gap-1.5 w-full h-10 rounded-btn bg-warning-50 border border-warning-200 text-warning-800 font-display font-semibold text-[12.5px]">
                    <Icon.star className="w-3.5 h-3.5 text-warning-500" />
                    შეფასდა · {booking.review.rating}
                  </div>
                )}
              </div>
            )}

            {(status === 'CANCELED' || status === 'NO_SHOW') && (
              <div className="p-4 rounded-card bg-iris-50 border border-iris-200">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-iris-700 mb-2">
                  {status === 'NO_SHOW' ? 'აღინიშნა no-show' : 'ჯავშანი გაუქმდა'}
                </div>
                <p className="text-[12.5px] text-ink-700 leading-[1.5]">
                  {status === 'NO_SHOW'
                    ? 'ექსპერტმა აღნიშნა, რომ არ გამოცხადდი.'
                    : `${booking.cancelledBy === 'TUTOR' ? 'ექსპერტმა' : booking.cancelledBy === 'ADMIN' ? 'ადმინმა' : 'შენ'} გააუქმა ჯავშანი.`}
                  {' '}Escrow თანხა დაბრუნებულია.
                </p>
                <Link href="/tutors" className="mt-3 w-full h-10 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-900 font-display font-semibold text-[12.5px] inline-flex items-center justify-center transition-colors">
                  ხელახლა დაჯავშნა
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───── Chat pane (real messages) ─────
   Owns its message list locally: optimistic append on send (no full booking
   reload — that cost 2-5s on the remote DB and made sending feel broken) and
   a light 15s poll of GET /api/messages?bookingId= while the tab is visible,
   which also stamps read receipts server-side. */
const CHAT_POLL_MS = 15_000
const BookingMessages = ({ booking, meId }: { booking: Booking; meId: string | null }) => {
  const [msgs, setMsgs] = useState<BookingMsg[]>(booking.messages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const tutorName = booking.tutor.user.fullName

  // Parent reloads (status changes etc.) re-seed the local list — server wins.
  useEffect(() => { setMsgs(booking.messages) }, [booking.messages])

  // Keep the newest message in view — the pane used to open scrolled to the
  // OLDEST message and never followed new ones.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs.length])

  // Poll for the other side's messages + stamp read receipts. Runs once on
  // mount (marks existing incoming as read) then every 15s while visible.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`/api/messages?bookingId=${booking.id}`)
        if (!res.ok || cancelled) return
        const j = await res.json().catch(() => null)
        if (!cancelled && j?.ok && Array.isArray(j.messages)) setMsgs(j.messages)
      } catch {}
    }
    tick()
    const id = setInterval(tick, CHAT_POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [booking.id])

  const pickFile = () => fileInputRef.current?.click()

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 8 * 1024 * 1024) {
      setErr('ფაილი 8 MB-ზე დიდია')
      return
    }
    setUploading(true); setErr(null)
    try {
      const form = new FormData()
      form.append('file', f)
      form.append('kind', 'attachment')
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setErr(j?.error === 'TOO_LARGE' ? 'ფაილი დიდია' : j?.error === 'BAD_TYPE' ? 'ფაილის ტიპი დაუშვებელია (PDF/JPG/PNG)' : 'ატვირთვა ვერ მოხერხდა')
        return
      }
      setAttachment({ url: j.url, name: j.fileName ?? f.name, type: f.type, size: f.size })
    } catch {
      setErr('ქსელის შეცდომა ატვირთვის დროს')
    } finally { setUploading(false) }
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    // Allow send when EITHER text or attachment present.
    if ((!text.trim() && !attachment) || sending) return
    setSending(true); setErr(null)
    try {
      const body: any = {
        bookingId: booking.id,
        body: text.trim() || (attachment ? `📎 ${attachment.name}` : ''),
      }
      if (attachment) { body.fileUrl = attachment.url; body.fileName = attachment.name }
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) { setErr('შეცდომა გაგზავნაში'); return }
      // Optimistic append — the API returns the created row with `from`
      // populated, so the message shows instantly (no 2-5s booking reload).
      setMsgs(prev => [...prev, j.message])
      setText(''); setAttachment(null)
    } catch { setErr('ქსელის შეცდომა') }
    finally { setSending(false) }
  }

  return (
    <div id="chat" className="rounded-card bg-white border border-ink-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between">
        <div>
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-0.5">შეტყობინებები</div>
          <h3 className="font-display text-[16px] font-bold text-ink-900 tracking-tight">{tutorName}-სთან ჩატი</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-pill bg-brand-50 border border-brand-200 text-brand-700 font-display text-[10px] font-bold uppercase tracking-[0.16em]">
          <span className="w-1.5 h-1.5 rounded-full bg-success-500" /> ცოცხალი
        </span>
      </div>

      <div ref={scrollRef} className="px-6 py-5 max-h-[420px] overflow-y-auto space-y-3">
        {msgs.length === 0 ? (
          <div className="text-center py-6 text-[13px] text-ink-500">
            ჯერ არ არის შეტყობინებები — მიწერე პირველი კითხვა.
          </div>
        ) : (
          msgs.map((m, i) => {
            const mine = m.fromId === meId
            // Day separator when the calendar date changes — individual bubbles
            // then only need the time, not a full date-time stamp each.
            const d = new Date(m.createdAt)
            const prev = i > 0 ? new Date(msgs[i - 1].createdAt) : null
            const newDay = !prev || prev.toDateString() !== d.toDateString()
            // Defense-in-depth: even though the API now rejects unsafe schemes,
            // never render an attachment href that isn't a safe scheme (guards
            // against legacy rows written before the server-side check).
            const safeFile = safeHttpUrl(m.fileUrl)
            return (
              <React.Fragment key={m.id}>
              {newDay && (
                <div className="flex items-center gap-3 py-1" aria-hidden>
                  <span className="flex-1 h-px bg-ink-100" />
                  <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{fmtKaDate(d)}</span>
                  <span className="flex-1 h-px bg-ink-100" />
                </div>
              )}
              <div className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0 overflow-hidden">
                  {m.from.avatarUrl
                    ? <img src={m.from.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : m.from.fullName.slice(0, 1)}
                </div>
                <div className={`max-w-[78%] ${mine ? 'flex flex-col items-end' : ''}`}>
                  <div className={`px-3.5 py-2.5 rounded-card text-[13.5px] leading-[1.55] whitespace-pre-wrap ${mine ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-ink-50 border border-ink-200 rounded-tl-sm text-ink-900'}`}>
                    {m.body}
                    {safeFile && (
                      <div className={`mt-2 pt-2 border-t ${mine ? 'border-white/25' : 'border-ink-200'}`}>
                        {safeFile.startsWith('data:image/') ? (
                          <a href={safeFile} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={safeFile} alt={m.fileName ?? 'attachment'} className="max-h-[200px] rounded-md object-cover" />
                            {m.fileName && <div className={`mt-1 text-[11px] ${mine ? 'text-white/85' : 'text-ink-500'} font-mono truncate`}>{m.fileName}</div>}
                          </a>
                        ) : (
                          <a
                            href={safeFile}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={m.fileName ?? undefined}
                            className={`inline-flex items-center gap-2 text-[12.5px] ${mine ? 'text-white hover:text-white' : 'text-brand-700 hover:text-brand-800'} font-display font-semibold underline underline-offset-2 decoration-dotted`}
                          >
                            <Icon.download className="w-3.5 h-3.5" />
                            {m.fileName ?? 'ფაილი'}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-[10px] tabular-nums text-ink-400">
                    {fmtKaTime(d)}
                  </div>
                </div>
              </div>
              </React.Fragment>
            )
          })
        )}
      </div>

      <form onSubmit={send} className="px-6 py-4 border-t border-ink-100 bg-ink-50/40 flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={onFileChosen}
          className="sr-only"
        />
        {attachment && (
          <div className="flex items-center gap-2 rounded-btn border border-ink-200 bg-white px-3 py-2 text-[12.5px]">
            <Icon.download className="w-3.5 h-3.5 text-ink-500 rotate-180" />
            <span className="flex-1 truncate font-display font-semibold text-ink-800">{attachment.name}</span>
            <span className="font-mono text-[10.5px] text-ink-500 tabular-nums shrink-0">{(attachment.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => setAttachment(null)} aria-label="ფაილის მოხსნა" className="w-6 h-6 rounded-btn hover:bg-ink-100 text-ink-500 hover:text-danger-600 inline-flex items-center justify-center">
              <Icon.x className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={pickFile}
            disabled={uploading}
            aria-label="ფაილის მიბმა"
            title="ფაილის მიბმა (PDF/JPG/PNG · max 8 MB)"
            className="h-11 w-11 rounded-btn border border-ink-200 bg-white hover:border-ink-300 disabled:opacity-50 text-ink-600 hover:text-ink-900 inline-flex items-center justify-center transition-colors shrink-0"
          >
            {uploading ? (
              <span className="inline-block w-4 h-4 border-2 border-ink-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Icon.download className="w-4 h-4 rotate-180" />
            )}
          </button>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any) } }}
            rows={1}
            placeholder={attachment ? 'დაწერე შეტყობინება ან უბრალოდ გააგზავნე ფაილი…' : 'მიუწერე შეტყობინება…'}
            className="flex-1 h-11 px-3 py-2.5 rounded-btn border border-ink-200 bg-white text-[13.5px] resize-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          <button type="submit" disabled={sending || uploading || (!text.trim() && !attachment)} className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors">
            {sending ? '…' : 'გაგზავნა'}
          </button>
        </div>
      </form>
      {err && <div className="px-6 pb-3 text-[12px] text-danger-600">{err}</div>}
    </div>
  )
}

/* ───── Reschedule modal — POST /api/bookings/[id]/reschedule ───── */
const RescheduleModal = ({ open, onClose, onSent, booking }: { open: boolean; onClose: () => void; onSent: () => void; booking: Booking }) => {
  const [dateStr, setDateStr] = useState(() => {
    const t = new Date(Date.now() + 24 * 3600_000)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  })
  const [timeStr, setTimeStr] = useState('14:00')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSending(false); setErr(null); setNote('')
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  const send = async () => {
    if (sending) return
    setSending(true); setErr(null)
    const target = new Date(`${dateStr}T${timeStr}:00`)
    if (isNaN(target.getTime()) || target.getTime() < Date.now()) {
      setErr('აირჩიე მომავალი დრო.'); setSending(false); return
    }
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStartAt: target.toISOString(), reason: note.trim() || undefined }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setErr(
          j?.error === 'TOO_SOON' ? 'დრო ძალიან ახლოსაა — მინიმუმ 1 საათი წინ.' :
          j?.error === 'NO_SLOT' ? 'ექსპერტს ამ დროს ხელმისაწვდომობა არ აქვს.' :
          j?.error === 'BAD_STATE' ? 'ჯავშნის სტატუსი ამას აღარ უშვებს.' :
          'მოთხოვნის გაგზავნა ვერ მოხერხდა.'
        )
        return
      }
      onSent()
    } catch { setErr('ქსელის შეცდომა') }
    finally { setSending(false) }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="დახურვა" onClick={onClose} className="absolute inset-0 bg-accent-900/55 backdrop-blur-sm" />
      <div role="dialog" className="relative w-full sm:max-w-[520px] bg-white sm:rounded-card shadow-float overflow-hidden motion-safe:animate-scale-in">
        <div className="px-6 py-4 border-b border-ink-100 flex items-start justify-between gap-4">
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-1">გადადება — უფასოდ 24სთ-მდე</div>
            <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">აირჩიე ახალი დრო</h2>
            <div className="text-[12px] text-ink-500 mt-1">ამჟამინდელი: <span className="font-display font-semibold text-ink-900">{fmtDate(new Date(booking.startAt))} · {fmtTime(new Date(booking.startAt))} · {booking.tutor.user.fullName}</span></div>
          </div>
          <button type="button" onClick={onClose} aria-label="დახურვა" className="w-9 h-9 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center shrink-0">
            <Icon.x className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">თარიღი</label>
              <input type="date" value={dateStr} min={new Date().toISOString().slice(0, 10)} onChange={e => setDateStr(e.target.value)}
                     className="w-full h-11 px-3 rounded-field border border-ink-200 text-[13.5px] focus:border-brand-500 focus:outline-none tabular-nums" />
            </div>
            <div>
              <label className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">დრო</label>
              <input type="time" value={timeStr} onChange={e => setTimeStr(e.target.value)}
                     className="w-full h-11 px-3 rounded-field border border-ink-200 text-[13.5px] focus:border-brand-500 focus:outline-none tabular-nums" />
            </div>
          </div>
          <div>
            <label className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">დამატებით <span className="text-ink-400 font-normal normal-case tracking-normal">— სურვილისამებრ</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 600))} rows={3} placeholder="მიზეზი, დამატებითი კონტექსტი..."
                      className="w-full p-3 rounded-field border border-ink-200 text-[13px] focus:border-brand-500 focus:outline-none resize-none leading-relaxed" />
          </div>
          <p className="text-[11.5px] text-ink-500 leading-snug">მოთხოვნა გაიგზავნება ჩატში. ექსპერტის დადასტურების შემდეგ დრო შეიცვლება.</p>
          {err && <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12px] font-medium">{err}</div>}
        </div>

        <div className="px-6 py-4 bg-ink-50/40 border-t border-ink-100 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">გაუქმება</button>
          <button type="button" onClick={send} disabled={sending} className="h-10 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 disabled:opacity-60">
            {sending ? 'იგზავნება…' : <>მოთხოვნის გაგზავნა <Icon.arrow className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───── Dispute modal — sends real message ───── */
type DisputeReason = 'no-show' | 'quality' | 'wrong-topic' | 'unprofessional' | 'tech' | 'other'
const DisputeModal = ({ open, onClose, bookingId, onSent }: { open: boolean; onClose: () => void; bookingId: string; onSent: () => void }) => {
  const [reason, setReason] = useState<DisputeReason | null>(null)
  const [story, setStory] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReason(null); setStory(''); setSending(false); setErr(null)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  if (!open) return null
  const REASONS: { id: DisputeReason; l: string; sub: string }[] = [
    { id: 'no-show',        l: 'ექსპერტი არ მოვიდა',        sub: '100% დაბრუნება' },
    { id: 'quality',        l: 'დაბალი ხარისხი',           sub: 'ცოდნა/მომზადება' },
    { id: 'wrong-topic',    l: 'არასწორი თემა',            sub: 'სხვა რაზე ვისაუბრეთ' },
    { id: 'unprofessional', l: 'არაპროფესიული ქცევა',      sub: 'უპატივცემლობა · დაგვიანება' },
    { id: 'tech',           l: 'ტექნიკური პრობლემა',        sub: 'ვიდეო/აუდიო არ მუშაობდა' },
    { id: 'other',          l: 'სხვა',                     sub: 'ჩამეწერა თავად' },
  ]

  const send = async () => {
    if (!reason || sending) return
    setSending(true); setErr(null)
    // Map UI reason id → schema enum (screaming snake case).
    const REASON_ENUM: Record<DisputeReason, string> = {
      'no-show': 'NO_SHOW',
      'quality': 'QUALITY',
      'wrong-topic': 'WRONG_TOPIC',
      'unprofessional': 'UNPROFESSIONAL',
      'tech': 'TECHNICAL',
      'other': 'OTHER',
    }
    try {
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          reason: REASON_ENUM[reason],
          details: story.trim() || undefined,
        }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setErr(j.error === 'ALREADY_EXISTS' ? 'ამ ჯავშანზე უკვე გახსნილია საჩივარი.' : 'საჩივრის გაგზავნა ვერ მოხერხდა')
        return
      }
      onSent()
    } catch { setErr('ქსელის შეცდომა') }
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="დახურვა" onClick={onClose} className="absolute inset-0 bg-accent-900/55 backdrop-blur-sm" />
      <div role="dialog" className="relative w-full sm:max-w-[560px] bg-white sm:rounded-card shadow-float overflow-hidden flex flex-col max-h-[85vh] motion-safe:animate-scale-in">
        <div className="px-6 py-4 border-b border-ink-100 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-danger-700 mb-1 inline-flex items-center gap-1.5"><Icon.flag className="w-3 h-3" /> საჩივარი</div>
            <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">გვითხარი — რა მოხდა?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="დახურვა" className="w-9 h-9 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center shrink-0"><Icon.x className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">მთავარი მიზეზი</div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {REASONS.map(r => {
                const on = reason === r.id
                return (
                  <button key={r.id} type="button" onClick={() => setReason(r.id)} className={`p-3 rounded-card border text-left transition-all ${on ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white hover:border-ink-300'}`}>
                    <div className="font-display text-[12.5px] font-bold text-ink-900">{r.l}</div>
                    <div className="text-[10.5px] text-ink-500 mt-0.5">{r.sub}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {reason && (
            <div>
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">დეტალურად <span className="text-ink-400 font-normal normal-case tracking-normal">— სურვილისამებრ</span></div>
              <textarea value={story} onChange={e => setStory(e.target.value.slice(0, 1000))} rows={4} placeholder="რა მოხდა, რა იყო მოლოდინი, რა მიიღე..." className="w-full p-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:outline-none text-[13px] resize-none leading-relaxed" />
              <p className="mt-1 text-[11px] text-ink-500 text-right tabular-nums">{story.length} / 1000</p>
            </div>
          )}

          {err && <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12px] font-medium">{err}</div>}
        </div>

        <div className="px-6 py-4 bg-ink-50/40 border-t border-ink-100 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">გაუქმება</button>
          <button type="button" disabled={!reason || sending} onClick={send} className={`h-10 px-4 rounded-btn font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 ${!reason || sending ? 'bg-ink-100 text-ink-400 cursor-not-allowed' : 'bg-danger-500 hover:bg-danger-600 text-white'}`}>
            <Icon.flag className="w-3.5 h-3.5" /> {sending ? 'იგზავნება…' : 'გააგზავნე'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───── Review modal — real POST /api/reviews ───── */
const ReviewModal = ({ open, onClose, bookingId, tutorName, onSubmitted }: { open: boolean; onClose: () => void; bookingId: string; tutorName?: string; onSubmitted: () => void }) => {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setRating(0); setComment(''); setTags([]); setErrMsg(null); setDone(false); setSubmitting(false)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  const submit = async () => {
    if (rating === 0 || submitting) return
    setSubmitting(true); setErrMsg(null)
    const body = tags.length > 0 && comment.trim()
      ? `${comment.trim()}\n\n[${tags.join(', ')}]`
      : tags.length > 0
        ? `[${tags.join(', ')}]`
        : comment.trim() || 'შეფასება'
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, rating, body }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setErrMsg(
          data?.error === 'NOT_COMPLETED' ? 'სესია ჯერ არ არის დასრულებული.' :
          data?.error === 'WINDOW_CLOSED' ? 'შეფასების ვადა ამოიწურა (30 დღე).' :
          data?.error === 'FORBIDDEN' ? 'უფლება არ გაქვს ამ სესიის შესაფასებლად.' :
          data?.error === 'INVALID' ? 'რეცენზია მინიმუმ 3 სიმბოლო უნდა იყოს.' :
          'შეფასების გაგზავნა ვერ მოხერხდა.'
        )
        return
      }
      setDone(true)
      onSubmitted()
      setTimeout(onClose, 1400)
    } catch { setErrMsg('ქსელის შეცდომა.') }
    finally { setSubmitting(false) }
  }

  if (!open) return null
  const TAGS = ['მკაფიო ახსნა', 'პრაქტიკული რჩევა', 'მომზადებული', 'პუნქტუალური', 'მეგობრული', 'ღრმა გამოცდილება']
  const toggleTag = (t: string) => setTags(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t])

  return (
    // Bottom sheet on mobile, centered on sm+ — matches the reschedule and
    // dispute modals so all three booking dialogs share one ergonomic.
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="დახურვა" onClick={onClose} className="absolute inset-0 bg-accent-900/55 backdrop-blur-sm" />
      <div role="dialog" className="relative w-full max-w-[560px] bg-white rounded-t-card sm:rounded-card shadow-float overflow-hidden max-h-[92dvh] overflow-y-auto motion-safe:animate-slide-in-b sm:motion-safe:animate-scale-in safe-area-bottom">
        <div className="px-7 py-5 border-b border-ink-100 flex items-start justify-between gap-4">
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-1">შეფასება</div>
            <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">როგორი იყო შენი სესია{tutorName ? ` ${tutorName}-სთან` : ''}?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="დახურვა" className="w-9 h-9 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center transition-colors -mt-1 -mr-1">
            <Icon.x className="w-4 h-4" />
          </button>
        </div>
        {done ? (
          <div className="px-7 py-14 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-500 text-white mb-4"><Icon.check className="w-6 h-6" /></div>
            <div className="font-display text-[18px] font-bold text-ink-900">გმადლობთ შეფასებისთვის!</div>
          </div>
        ) : (<>
          <div className="px-7 py-6 space-y-5">
            <div>
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">საერთო შეფასება</div>
              <div className="flex items-center gap-1.5">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)} className={`w-10 h-10 rounded-btn inline-flex items-center justify-center transition-all ${rating >= n ? 'text-warning-500 hover:scale-110' : 'text-ink-200 hover:text-ink-400'}`}>
                    <Icon.star className="w-7 h-7" />
                  </button>
                ))}
                {rating > 0 && <span className="ml-2 font-display text-[12.5px] font-semibold text-ink-700 tabular-nums">{rating}.0 / 5</span>}
              </div>
            </div>
            <div>
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">რა მოგეწონა</div>
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map(t => (
                  <button key={t} type="button" onClick={() => toggleTag(t)} className={`h-8 px-3 rounded-pill border font-display text-[12px] font-medium transition-colors ${tags.includes(t) ? 'bg-brand-50 border-brand-300 text-brand-800' : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">დაწერე რეცენზია <span className="text-ink-400 font-normal normal-case tracking-normal">— სურვილისამებრ</span></div>
              <textarea value={comment} onChange={e => setComment(e.target.value.slice(0, 2000))} rows={4} placeholder="რა იყო ყველაზე სასარგებლო ნაწილი?" className="w-full px-3.5 py-2.5 rounded-field border border-ink-200 bg-white text-[13.5px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none leading-relaxed" />
              <div className="text-right mt-1 font-mono text-[10.5px] tabular-nums text-ink-400">{comment.length} / 2000</div>
            </div>
            {errMsg && (
              <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12.5px] font-medium">{errMsg}</div>
            )}
          </div>
          <div className="px-7 py-5 bg-ink-50/40 border-t border-ink-100 flex items-center justify-between gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-800 disabled:opacity-40">
              მოგვიანებით
            </button>
            <button type="button" disabled={rating === 0 || submitting} onClick={submit} aria-busy={submitting} className={`h-11 px-5 rounded-btn font-display font-semibold text-[13px] inline-flex items-center gap-1.5 ${rating === 0 || submitting ? 'bg-ink-100 text-ink-400 cursor-not-allowed' : 'bg-brand-500 hover:bg-brand-600 text-white'}`}>
              {submitting ? 'იგზავნება…' : 'გავუგზავნო შეფასება'} {!submitting && <Icon.arrow className="w-3.5 h-3.5" />}
            </button>
          </div>
        </>)}
      </div>
    </div>
  )
}

/* ───── Inline post-session review card — replaces the modal for
   discoverability. Shown below Hero on COMPLETED bookings. When a review
   already exists, renders read-only with an edit affordance. */
const InlineReviewCard = ({ booking, existing, onSaved }: { booking: Booking; existing?: ExistingReview | null; onSaved: () => void }) => {
  const { toast } = useToast()
  const [editing, setEditing] = useState(!existing)
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [body, setBody] = useState(existing?.body ?? '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setRating(existing?.rating ?? 0)
    setBody(existing?.body ?? '')
    setEditing(!existing)
  }, [existing?.id])

  const sessionEnd = new Date(new Date(booking.startAt).getTime() + booking.durationMin * 60_000)
  const windowClosesAt = sessionEnd.getTime() + 30 * 24 * 3600_000
  const windowClosed = Date.now() > windowClosesAt

  const submit = async () => {
    if (submitting || rating === 0) return
    if (body.trim().length < 3) { toast('რეცენზია მინიმუმ 3 სიმბოლო უნდა იყოს', 'error'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, rating, body: body.trim() }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || j?.ok === false) {
        toast(
          j?.error === 'WINDOW_CLOSED' ? 'შეფასების ვადა ამოიწურა' :
          j?.error === 'NOT_COMPLETED' ? 'სესია ჯერ არ დასრულებულა' :
          'შენახვა ვერ მოხერხდა',
          'error',
        )
        return
      }
      toast(existing ? 'შეფასება განახლდა' : 'შეფასება გაიგზავნა', 'success')
      setEditing(false)
      onSaved()
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally { setSubmitting(false) }
  }

  return (
    <section id="leave-review" className="max-w-[1240px] mx-auto px-6 lg:px-8 mt-4 scroll-mt-24">
      <div className="rounded-card border border-brand-200 bg-brand-50/50 p-5 lg:p-6">
        {existing && !editing ? (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 h-6 px-2.5 rounded-pill bg-warning-50 border border-warning-200 text-warning-800 font-display text-[11px] font-bold">
                შეფასდა · {existing.rating}
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-warning-500"><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>
              </div>
              <p className="mt-2 text-[13.5px] text-ink-800 leading-[1.6] whitespace-pre-wrap">{existing.body}</p>
              <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">
                {fmtKaDate(new Date(existing.createdAt), { year: true })}
              </div>
            </div>
            {!windowClosed && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-display text-[12.5px] font-semibold text-brand-700 hover:text-brand-900 underline underline-offset-2 decoration-dotted shrink-0"
              >
                შესწორება
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-1">დატოვე შეფასება</div>
            <h3 className="font-display text-[17px] font-bold text-ink-900 tracking-tight">როგორი იყო სესია {booking.tutor.user.fullName.split(' ')[0]}-სთან?</h3>
            <div className="mt-4 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} ვარსკვლავი`}
                  className={`w-10 h-10 rounded-btn inline-flex items-center justify-center transition-all ${rating >= n ? 'text-warning-500 hover:scale-110' : 'text-ink-300 hover:text-ink-400'}`}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>
                </button>
              ))}
              {rating > 0 && <span className="ml-2 font-display text-[13px] font-bold text-ink-900 tabular-nums">{rating}.0 / 5</span>}
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder="რა იყო ყველაზე სასარგებლო ნაწილი? მიეცი გამოხმაურება."
              className="mt-3 w-full px-3.5 py-2.5 rounded-field border border-ink-200 bg-white text-[13.5px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none leading-relaxed"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-ink-500">30 დღიანი ვადა შენახვისთვის</span>
              <span className="font-mono text-[10.5px] tabular-nums text-ink-400">{body.length} / 2000</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={submitting || rating === 0 || body.trim().length < 3}
                className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[13px]"
              >
                {submitting ? 'იგზავნება…' : existing ? 'შენახვა' : 'გაგზავნა'}
              </button>
              {existing && (
                <button
                  type="button"
                  onClick={() => { setEditing(false); setRating(existing.rating); setBody(existing.body) }}
                  className="font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-800"
                >
                  გაუქმება
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/* ───── Pending reschedule banner. Rendered on both sides when a proposal
   is in flight. The party who did NOT propose can accept or reject inline. */
const RescheduleBanner = ({
  booking,
  meRole,
  onResolved,
}: {
  booking: Booking
  meRole: 'STUDENT' | 'TUTOR'
  onResolved: () => void
}) => {
  const { toast } = useToast()
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const req = booking.rescheduleRequest
  if (!req) return null
  const proposedTime = new Date(req.newStartAt)
  const iProposed = req.proposedBy === meRole

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'reject')
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { toast('მოქმედება ვერ შესრულდა', 'error'); return }
      toast(accept ? 'გადადება დადასტურდა' : 'გადადება უარყოფილია', accept ? 'success' : 'info')
      onResolved()
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally { setBusy(null) }
  }

  return (
    <section className="max-w-[1240px] mx-auto px-6 lg:px-8 mt-4">
      <div className="rounded-card border border-warning-200 bg-warning-50 p-5 flex items-start gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-warning-800 mb-1">
            {iProposed ? 'გადადების მოთხოვნა გაგზავნილია' : 'გადადების მოთხოვნა'}
          </div>
          <div className="font-display text-[14.5px] font-bold text-ink-900">
            ახალი დრო: {fmtKaDateTime(proposedTime, { month: 'long', weekday: true })}
          </div>
          {req.reason && <p className="mt-1 text-[13px] text-ink-700 leading-[1.5] whitespace-pre-wrap">„{req.reason}"</p>}
          {iProposed && (
            <p className="mt-1 text-[12px] text-ink-500">ველოდებით მეორე მხარის დადასტურებას.</p>
          )}
        </div>
        {!iProposed && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => respond(false)}
              disabled={busy !== null}
              className="h-10 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px]"
            >
              {busy === 'reject' ? '…' : 'უარი'}
            </button>
            <button
              type="button"
              onClick={() => respond(true)}
              disabled={busy !== null}
              className="h-10 px-4 rounded-btn bg-success-600 hover:bg-success-700 disabled:opacity-60 text-white font-display font-semibold text-[12.5px]"
            >
              {busy === 'accept' ? '…' : 'დადასტურება'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

/* ───── Booking body ───── */
const BookingBody = ({
  booking,
  meId,
  onRefresh,
  onReschedule,
  onCancel,
  onDispute,
  onReview,
}: {
  booking: Booking
  meId: string | null
  onRefresh: () => void
  onReschedule: () => void
  onCancel: () => void
  onDispute: () => void
  onReview: () => void
}) => {
  const status = booking.status
  const canCancel = status === 'PREPARING' || status === 'CONFIRMED'
  // Suppress the "propose reschedule" button while a proposal is already
  // in flight — the banner drives the accept/reject decision instead.
  const canReschedule = (status === 'PREPARING' || status === 'CONFIRMED') && !booking.rescheduleRequest

  return (
    <section className="max-w-[1240px] mx-auto px-6 lg:px-8 mt-6 grid lg:grid-cols-[1fr_360px] gap-6 pb-12">
      {/* On mobile the action rail comes FIRST — cancel/reschedule/receipt
          are why people open this page; burying them under the whole chat
          thread made them near-undiscoverable at 390px. Desktop keeps
          content-left / rail-right. */}
      {/* Left — content */}
      <div className="space-y-4 min-w-0 order-2 lg:order-1">
        {/* Topic + notes */}
        <div className="rounded-card bg-white border border-ink-200 p-6">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-2">თემა და მიზანი</div>
          <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight mb-3">{booking.topic}</h2>
          {booking.studentNotes ? (
            <p className="text-[13.5px] text-ink-700 leading-[1.6] whitespace-pre-wrap">{booking.studentNotes}</p>
          ) : (
            <p className="text-[13px] text-ink-400 italic">— დამატებითი ჩანაწერი არ არის.</p>
          )}
        </div>

        {/* Tutor's post-session summary — read-only, shown when the tutor
            filled in `tutorNotes` after marking the session complete. */}
        {status === 'COMPLETED' && booking.tutorNotes && (
          <div className="rounded-card bg-brand-50/40 border border-brand-200 p-6">
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">ექსპერტისგან</div>
            <blockquote className="border-l-2 border-brand-300 pl-3 text-[13.5px] text-ink-800 leading-[1.6] whitespace-pre-wrap italic">
              {booking.tutorNotes}
            </blockquote>
          </div>
        )}

        {/* Status timeline */}
        <div className="rounded-card bg-white border border-ink-200 p-6">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-3">ისტორია</div>
          <StatusTimeline booking={booking} />
        </div>

        {/* Chat */}
        <BookingMessages booking={booking} meId={meId} />
      </div>

      {/* Right — actions + receipt */}
      <aside className="space-y-4 order-1 lg:order-2">
        <div className="rounded-card bg-white border border-ink-200 p-5">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-3">სწრაფი მოქმედებები</div>
          <div className="space-y-2">
            <a href="#chat" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
              <Icon.chat className="w-4 h-4 text-ink-500" />
              <span className="flex-1">ჩატი {booking.tutor.user.fullName.split(' ')[0]}-სთან</span>
              {booking.messages.length > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-ink-100 text-ink-600 font-display text-[10px] font-bold tabular-nums">{booking.messages.length}</span>}
            </a>

            {(status === 'CONFIRMED' || status === 'LIVE') && booking.meetingUrl && (
              <Link href={`/session/${booking.id}`} className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-brand-50 border border-brand-200 hover:bg-brand-100 text-brand-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.video className="w-4 h-4" />
                <span className="flex-1">ვიდეო-ოთახი</span>
              </Link>
            )}

            {canReschedule && (
              <button type="button" onClick={onReschedule} className="w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.refresh className="w-4 h-4 text-ink-500" />
                <span className="flex-1 text-left">გადადება</span>
                <span className="text-[10.5px] text-success-700 font-display font-bold">უფასოდ</span>
              </button>
            )}

            {canCancel && (
              <button type="button" onClick={onCancel} className="w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-danger-50 hover:border-danger-200 text-ink-600 hover:text-danger-700 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.x className="w-4 h-4" />
                <span className="flex-1 text-left">გაუქმება</span>
              </button>
            )}

            {status === 'COMPLETED' && (
              <>
                <Link
                  href={rebookHref(booking)}
                  className="w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] transition-colors"
                >
                  <Icon.refresh className="w-4 h-4" />
                  <span className="flex-1 text-left">დაჯავშნე ისევ</span>
                </Link>
                {!booking.review && (
                  <a href="#leave-review" className="w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-warning-50 border border-warning-200 hover:bg-warning-100 text-warning-800 font-display font-semibold text-[12.5px] transition-colors">
                    <Icon.star className="w-4 h-4" />
                    <span className="flex-1 text-left">დატოვე შეფასება</span>
                  </a>
                )}
              </>
            )}

            <button type="button" onClick={onDispute} className="w-full flex items-center gap-2.5 h-9 px-3 rounded-btn text-ink-500 hover:text-danger-700 hover:bg-danger-50 font-display font-semibold text-[11.5px] transition-colors">
              <Icon.flag className="w-3.5 h-3.5" />
              <span>საჩივარი</span>
            </button>
            <a href={`/api/bookings/${booking.id}/ical`} className="w-full flex items-center gap-2.5 h-9 px-3 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-50 font-display font-semibold text-[11.5px] transition-colors">
              <Icon.download className="w-3.5 h-3.5" />
              <span>კალენდარში დამატება</span>
            </a>
          </div>
        </div>

        {/* Receipt */}
        <div className="rounded-card bg-white border border-ink-200 p-5">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-3">ანგარიში</div>
          <div className="space-y-1.5 text-[12.5px] mb-4">
            <div className="flex justify-between">
              <span className="text-ink-600">{booking.topic}</span>
              <span className="font-display font-semibold text-ink-900 tabular-nums">₾{booking.price}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-600">ხანგრძლივობა</span>
              <span className="font-mono text-ink-500 tabular-nums">{booking.durationMin} წუთი</span>
            </div>
          </div>
          <div className="pt-3 border-t border-ink-200 flex items-baseline justify-between">
            <span className="font-display text-[12px] font-semibold text-ink-900">ჯამი</span>
            <span className="font-display text-[20px] font-bold text-ink-900 tabular-nums">₾{booking.price}</span>
          </div>
          <div className="mt-3 text-[11.5px] text-ink-600 flex items-center gap-1.5">
            <Icon.shield className="w-3 h-3 text-brand-700" />
            {status === 'CANCELED' || status === 'NO_SHOW' ? 'თანხა დაბრუნებულია' :
             status === 'COMPLETED' ? 'გათავისუფლდა ექსპერტზე' :
             'escrow-ში დაცული'}
          </div>
        </div>

        {/* Policy */}
        <div className="rounded-card bg-brand-50/40 border border-brand-200 p-5">
          <div className="flex items-start gap-2.5">
            <Icon.shield className="w-4 h-4 text-brand-700 mt-0.5 shrink-0" />
            <div>
              <div className="font-display text-[12.5px] font-bold text-ink-900 tracking-tight mb-1">100% ფულის უკან-დაბრუნების გარანტია</div>
              <p className="text-[11.5px] text-ink-700 leading-[1.5]">თუ ექსპერტი არ მოვა ან სესია ვერ შესრულდება — escrow მთლიანად დაგიბრუნდება.</p>
            </div>
          </div>
        </div>
      </aside>
    </section>
  )
}

/* ───── Real status timeline ───── */
const StatusTimeline = ({ booking }: { booking: Booking }) => {
  const items = useMemo(() => {
    const created = new Date(booking.createdAt)
    const start = new Date(booking.startAt)
    const end = new Date(start.getTime() + booking.durationMin * 60_000)
    const now = new Date()
    const s = booking.status

    const list: { at: Date; l: string; sub?: string; done: boolean }[] = []
    list.push({ at: created, l: 'ჯავშანი შეიქმნა', done: true, sub: `₾${booking.price} escrow-ში` })

    if (s === 'PREPARING') {
      list.push({ at: now, l: 'ველოდებით ექსპერტის დადასტურებას', done: false })
    } else {
      list.push({ at: created, l: 'ექსპერტმა დაადასტურა', done: true })
    }

    list.push({ at: start, l: 'სესია იწყება', done: now.getTime() >= start.getTime() && s !== 'CANCELED' && s !== 'PREPARING' })
    list.push({ at: end, l: 'სესია სრულდება', done: now.getTime() >= end.getTime() && (s === 'COMPLETED' || s === 'NO_SHOW') })

    if (s === 'CANCELED') {
      list.push({ at: now, l: `${booking.cancelledBy === 'TUTOR' ? 'ექსპერტმა' : booking.cancelledBy === 'ADMIN' ? 'ადმინმა' : 'შენ'} გააუქმა`, done: true, sub: 'escrow დაბრუნდა' })
    }
    if (s === 'NO_SHOW') {
      list.push({ at: end, l: 'აღინიშნა no-show', done: true, sub: 'escrow დაბრუნდა' })
    }
    if (s === 'COMPLETED') {
      list.push({ at: end, l: 'დასრულდა · escrow ექსპერტზე გათავისუფლდა', done: true })
    }
    return list
  }, [booking])

  return (
    <ol className="relative space-y-3">
      <span className="absolute top-3 bottom-3 left-[7px] w-px bg-ink-200" aria-hidden />
      {items.map((s, i) => (
        <li key={i} className="relative flex gap-3">
          <span className={`relative z-10 mt-0.5 w-[15px] h-[15px] shrink-0 rounded-full border-2 inline-flex items-center justify-center ${
            s.done ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-ink-300'
          }`}>
            {s.done && <Icon.check className="w-2 h-2" />}
          </span>
          <div className="min-w-0 flex-1">
            <span className="font-mono text-[10.5px] tabular-nums text-ink-500">{fmtDate(s.at)} {fmtTime(s.at)}</span>
            <div className={`mt-0.5 font-display text-[13px] font-semibold ${s.done ? 'text-ink-900' : 'text-ink-500'}`}>{s.l}</div>
            {s.sub && <div className="text-[11.5px] text-ink-500 mt-0.5">{s.sub}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ───── Page ───── */
export default function BookingDetail() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduledOk, setRescheduledOk] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeSent, setDisputeSent] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const { toast } = useToast()

  // Monotonic request token — guards against out-of-order responses when the
  // route id changes (tap booking A then B: A's late response must not overwrite B).
  const loadSeqRef = useRef(0)
  const load = async () => {
    if (!params?.id) return
    const seq = ++loadSeqRef.current
    const idAtCall = params.id
    try {
      const [meRes, bRes] = await Promise.all([
        fetch('/api/me').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/bookings/${idAtCall}`),
      ])
      // Drop stale responses.
      if (seq !== loadSeqRef.current) return
      setMeId(meRes?.user?.id ?? null)
      if (bRes.status === 404) { setNotFound(true); return }
      if (bRes.status === 401) { router.push('/signin'); return }
      if (!bRes.ok) return
      const b = await bRes.json()
      if (seq !== loadSeqRef.current) return
      setBooking(b)
    } catch {}
  }

  // Called after any mutation on this booking. In addition to refreshing the
  // local booking payload, we invalidate the server-component cache so the
  // parent list (`/student/bookings`) reflects the change on next navigation.
  const reload = async () => {
    await load()
    router.refresh()
  }

  useEffect(() => { load() }, [params?.id])

  // Auto-open ReviewModal ONCE when landing here with ?review=1 (from session-row
  // CTA). Guarded by a ref so the post-submit reload() (which mutates `booking`
  // and re-fires this effect) can't reopen the review the user just finished.
  const reviewAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined' || reviewAutoOpenedRef.current) return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('review') === '1' && booking && booking.status === 'COMPLETED') {
      reviewAutoOpenedRef.current = true
      setReviewOpen(true)
    }
  }, [booking])

  const cancelBooking = () => {
    if (!booking || cancelBusy) return
    setCancelConfirmOpen(true)
  }

  const confirmCancel = async () => {
    if (!booking || cancelBusy) return
    setCancelBusy(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, { method: 'POST' })
      if (!res.ok) { toast('გაუქმება ვერ მოხერხდა', 'error'); return }
      setCancelConfirmOpen(false)
      await load()
      // Invalidate the server-cached bookings list so navigating back
      // shows the freshly cancelled booking in the CANCELED tab, not the
      // stale UPCOMING snapshot.
      router.refresh()
      toast('ჯავშანი გაუქმდა', 'success')
    } finally {
      setCancelBusy(false)
    }
  }

  const copyRef = async () => {
    if (!booking) return
    const ok = await copyToClipboard(booking.ref)
    toast(ok ? 'დაკოპირდა' : 'ვერ დაკოპირდა', ok ? 'success' : 'error')
  }

  const enterRoom = () => {
    if (!booking) return
    router.push(`/session/${booking.id}`)
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-ink-50 flex flex-col">
        <TopBar />
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-[480px] w-full text-center">
            <h1 className="font-display text-[22px] font-bold text-ink-900">ჯავშანი ვერ მოიძებნა</h1>
            <p className="text-[13.5px] text-ink-500 mt-2">შესაძლოა წაიშალა, ან თქვენ არ ხართ მისი მონაწილე.</p>
            <Link href="/student/bookings" className="mt-6 inline-flex h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] items-center gap-2">
              ჩემი ჯავშნები
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center">
        <span className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="font-sans bg-ink-50/50 text-ink-900 antialiased min-h-screen">
      <TopBar />
      <Breadcrumb status={booking.status} ref={booking.ref} />
      <Hero booking={booking} onEnterRoom={enterRoom} onReview={() => setReviewOpen(true)} onCopyRef={copyRef} />
      {/* Inline review card — highest signal CTA post-session. Auto-collapses to
          a read-only summary once the student has submitted, with a small edit
          link (30-day window). */}
      {booking.status === 'COMPLETED' && (
        <InlineReviewCard
          booking={booking}
          existing={booking.review ?? null}
          onSaved={reload}
        />
      )}
      {/* Reschedule proposal banner — shown while a request is pending. */}
      {booking.rescheduleRequest && (
        <RescheduleBanner
          booking={booking}
          meRole="STUDENT"
          onResolved={reload}
        />
      )}
      <BookingBody
        booking={booking}
        meId={meId}
        onRefresh={reload}
        onReschedule={() => setRescheduleOpen(true)}
        onCancel={cancelBooking}
        onDispute={() => setDisputeOpen(true)}
        onReview={() => setReviewOpen(true)}
      />

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        bookingId={booking.id}
        tutorName={booking.tutor.user.fullName.split(' ')[0]}
        onSubmitted={reload}
      />
      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        onSent={() => { setRescheduleOpen(false); setRescheduledOk(true); setTimeout(() => setRescheduledOk(false), 3000); reload() }}
        booking={booking}
      />
      <DisputeModal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        bookingId={booking.id}
        onSent={() => { setDisputeOpen(false); setDisputeSent(true); setTimeout(() => setDisputeSent(false), 3000); reload() }}
      />
      {rescheduledOk && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] inline-flex items-center gap-2 px-4 py-2.5 rounded-pill bg-success-600 text-white font-display text-[12.5px] font-semibold shadow-float">
          <Icon.check className="w-3.5 h-3.5" /> გაიგზავნა — ექსპერტმა უნდა დაადასტუროს
        </div>
      )}
      {disputeSent && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] inline-flex items-center gap-2 px-4 py-2.5 rounded-pill bg-danger-600 text-white font-display text-[12.5px] font-semibold shadow-float">
          <Icon.check className="w-3.5 h-3.5" /> საჩივარი გაიგზავნა
        </div>
      )}
      <ConfirmModal
        open={cancelConfirmOpen}
        title="ჯავშნის გაუქმება?"
        body="თანხა დაბრუნდება escrow-ის შემდეგ"
        tone="danger"
        confirmLabel="გაუქმება"
        cancelLabel="უკან"
        onConfirm={confirmCancel}
        onCancel={() => setCancelConfirmOpen(false)}
        busy={cancelBusy}
      />
    </div>
  )
}
