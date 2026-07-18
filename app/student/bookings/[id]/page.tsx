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
import { sanitizeMsgBody, MSG_MAX_LEN, sendErrorText } from '@/lib/msgText'
import { PAYMENTS_LIVE, CANCEL_CUTOFF_HOURS } from '@/lib/flags'
import { isBookingLive } from '@/lib/bookingLive'
import { StudentAppBar } from '@/components/StudentAppBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'
import { Sheet } from '@/components/Sheet'
import { Icon } from '@/components/Icon'

/* ───── Minimal icon set ───── */

/* ───── Types ───── */
type ApiStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'
type MsgUser = { id: string; fullName: string; avatarUrl?: string | null }
type BookingMsg = { id: string; body: string; fromId: string; createdAt: string; from: MsgUser; fileUrl?: string | null; fileName?: string | null }
type ExistingReview = { id: string; rating: number; body: string; createdAt: string; studentId: string; anonymous?: boolean }
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
  LIVE:      { l: 'სესია მიმდინარეობს', cls: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500' },
  COMPLETED: { l: 'სესია დასრულდა', cls: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500' },
  CANCELED:  { l: 'ჯავშანი გაუქმდა', cls: 'bg-ink-100 text-ink-700 border-ink-200' },
  // Neutral ink for terminal negative states — the violet iris accent sat
  // outside the green/blue/neutral color system (design canon).
  NO_SHOW:   { l: 'სესია არ შედგა', cls: 'bg-ink-100 text-ink-700 border-ink-200' },
}

const tabOf = (s: ApiStatus) =>
  s === 'COMPLETED' || s === 'NO_SHOW' ? 'დასრულებული'
  : s === 'CANCELED' ? 'გაუქმებული'
  : 'მომავალი'

/* ───── Breadcrumb ───── */
const Breadcrumb = ({ status, ref }: { status: ApiStatus; ref: string }) => (
  <div className="max-w-[1280px] mx-auto px-6 lg:px-8 pt-6 flex items-center gap-2 text-[12px] text-ink-500">
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
const Hero = ({ booking, onEnterRoom, onCopyRef }: { booking: Booking; onEnterRoom: () => void; onCopyRef: () => void }) => {
  // LIVE is never written to the DB — derive the in-progress state from the
  // clock. Hero re-renders every second via useCountdown, so this stays fresh.
  const live = isBookingLive(booking)
  const status: ApiStatus = live ? 'LIVE' : booking.status
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
    <section className="max-w-[1280px] mx-auto px-6 lg:px-8 pt-5">
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
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 opacity-70">
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
                  <Icon.star aria-hidden className="w-3.5 h-3.5 text-warning-500" />
                  <span role="img" aria-label={`${booking.tutor.rating.toFixed(2)} 5-დან`} className="font-display font-bold tabular-nums">{booking.tutor.rating.toFixed(2)}</span>
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
                <div className="text-[11.5px] text-ink-500 tabular-nums">{PAYMENTS_LIVE ? 'დაცულ გადახდაშია' : 'გადახდები მალე'}</div>
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
            {/* PREPARING: the old rail showed a DISABLED join button as the
                primary CTA — a dead end. The honest next step while waiting
                for confirmation is writing to the expert. */}
            {status === 'PREPARING' && (
              <div className="p-4 rounded-card bg-white border border-warning-200">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-warning-700 mb-2">ელოდება დადასტურებას</div>
                <p className="text-[12.5px] text-ink-700 leading-[1.5]">
                  ექსპერტი ჩვეულებრივ რამდენიმე საათში ადასტურებს — შეტყობინებას მიიღებ. სანამ ელოდები, შეგიძლია მისწერო.
                </p>
                <a href="#chat" className="mt-3 w-full h-11 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] inline-flex items-center justify-center gap-2 transition-colors">
                  <Icon.chat className="w-4 h-4" /> მიწერე ექსპერტს
                </a>
                {cd && (
                  <div className="mt-2 text-[11px] text-ink-500 tabular-nums text-center">
                    სესიამდე დარჩა {cd.d > 0 ? `${cd.d} დღე ` : ''}{cd.h} სთ {cd.m} წთ
                  </div>
                )}
              </div>
            )}

            {(status === 'CONFIRMED' || status === 'LIVE') && cd && (
              <div className="text-center p-4 rounded-card bg-ink-900 text-white">
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
                        className="mt-4 w-full h-11 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] inline-flex items-center justify-center gap-2 transition-colors">
                  <Icon.video className="w-4 h-4" /> ვიდეო-ოთახში
                </button>
                <div className="mt-2 text-[10.5px] text-white/55">
                  {status === 'LIVE' ? 'სესია ახლა მიმდინარეობს — შემოუერთდი' : 'გაიხსნება 5 წუთით ადრე'}
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
                  <a href="#leave-review" className="mt-2 w-full h-11 rounded-btn bg-white border border-brand-200 hover:bg-brand-50 text-brand-800 font-display font-semibold text-[12.5px] inline-flex items-center justify-center gap-2 transition-colors">
                    <Icon.star aria-hidden className="w-4 h-4" /> შეფასების დატოვება
                  </a>
                ) : (
                  <div className="mt-2 inline-flex items-center justify-center gap-1.5 w-full h-11 rounded-btn bg-warning-50 border border-warning-200 text-warning-800 font-display font-semibold text-[12.5px]">
                    <Icon.star aria-hidden className="w-3.5 h-3.5 text-warning-500" />
                    შეფასდა · {booking.review.rating}<span className="sr-only"> 5-დან</span>
                  </div>
                )}
              </div>
            )}

            {(status === 'CANCELED' || status === 'NO_SHOW') && (
              <div className="p-4 rounded-card bg-ink-50 border border-ink-200">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-600 mb-2">
                  {status === 'NO_SHOW' ? 'სესია არ შედგა' : 'ჯავშანი გაუქმდა'}
                </div>
                <p className="text-[12.5px] text-ink-700 leading-[1.5]">
                  {status === 'NO_SHOW'
                    ? 'ექსპერტმა აღნიშნა, რომ არ გამოცხადდი.'
                    : `${booking.cancelledBy === 'TUTOR' ? 'ექსპერტმა' : booking.cancelledBy === 'ADMIN' ? 'ადმინმა' : 'შენ'} გააუქმა ჯავშანი.`}
                  {' '}{PAYMENTS_LIVE ? 'Escrow თანხა დაბრუნებულია.' : 'გადასახდელი არაფერია — დაჯავშნა უფასოა.'}
                </p>
                <Link href="/tutors" className="mt-3 w-full h-11 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-900 font-display font-semibold text-[12.5px] inline-flex items-center justify-center transition-colors">
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
        // Keep any in-flight optimistic bubbles (tmp-*) — a poll landing
        // between append and the POST response must not wipe them.
        if (!cancelled && j?.ok && Array.isArray(j.messages)) {
          setMsgs(prev => [...j.messages, ...prev.filter(m => m.id.startsWith('tmp-'))])
        }
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
      // TRUE optimistic append — the bubble shows the instant you hit send
      // (the POST itself takes seconds on the remote-DB dev setup). The temp
      // row is replaced by the server row on success, rolled back on failure
      // with the draft restored so nothing the user typed is lost.
      const tempId = `tmp-${Date.now()}`
      const sentText = text
      const sentAttachment = attachment
      setMsgs(prev => [...prev, {
        id: tempId,
        body: body.body,
        fromId: meId ?? booking.student.id,
        createdAt: new Date().toISOString(),
        from: booking.student,
        fileUrl: sentAttachment?.url ?? null,
        fileName: sentAttachment?.name ?? null,
      }])
      setText(''); setAttachment(null)
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) {
        setMsgs(prev => prev.filter(m => m.id !== tempId))
        setText(sentText); setAttachment(sentAttachment)
        setErr(sendErrorText(j?.error, j?.retryInSec))
        return
      }
      setMsgs(prev => prev.map(m => (m.id === tempId ? j.message : m)))
    } catch { setErr('ქსელის შეცდომა — შეამოწმე კავშირი და სცადე თავიდან.') }
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

      <div ref={scrollRef} className="px-4 sm:px-6 py-5 max-h-[420px] overflow-y-auto">
        {msgs.length === 0 ? (
          <div className="text-center py-8">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-50 text-brand-700 mb-3">
              <Icon.chat className="w-5 h-5" />
            </span>
            <div className="font-display text-[13.5px] font-semibold text-ink-800">დაიწყე საუბარი {tutorName}-სთან</div>
            <p className="text-[12.5px] text-ink-500 mt-1 max-w-[340px] mx-auto">
              აღუწერე შენი საკითხი ან დასვი კითხვა კონსულტაციამდე — რაც უფრო კონკრეტულია, მით უკეთ მოემზადება ექსპერტი.
            </p>
          </div>
        ) : (
          msgs.map((m, i) => {
            const mine = m.fromId === meId
            // Day separator when the calendar date changes — individual bubbles
            // then only need the time, not a full date-time stamp each.
            const d = new Date(m.createdAt)
            const prev = i > 0 ? msgs[i - 1] : null
            const next = i < msgs.length - 1 ? msgs[i + 1] : null
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== d.toDateString()
            // Runs of messages from the same sender within 5 minutes collapse
            // into one visual group: avatar on the first, timestamp on the last.
            const GROUP_MS = 5 * 60_000
            const groupedWithPrev = !newDay && !!prev && prev.fromId === m.fromId &&
              d.getTime() - new Date(prev.createdAt).getTime() < GROUP_MS
            const groupedWithNext = !!next && next.fromId === m.fromId &&
              new Date(next.createdAt).getTime() - d.getTime() < GROUP_MS &&
              new Date(next.createdAt).toDateString() === d.toDateString()
            // Defense-in-depth: even though the API now rejects unsafe schemes,
            // never render an attachment href that isn't a safe scheme (guards
            // against legacy rows written before the server-side check).
            const safeFile = safeHttpUrl(m.fileUrl)
            return (
              <React.Fragment key={m.id}>
              {newDay && (
                <div className={`flex items-center gap-3 py-1 ${i > 0 ? 'mt-4' : ''}`} aria-hidden>
                  <span className="flex-1 h-px bg-ink-100" />
                  <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{fmtKaDate(d)}</span>
                  <span className="flex-1 h-px bg-ink-100" />
                </div>
              )}
              <div className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${groupedWithPrev ? 'mt-1' : 'mt-3'}`}>
                {groupedWithPrev ? (
                  <span className="w-8 shrink-0" aria-hidden />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0 overflow-hidden">
                    {m.from.avatarUrl
                      ? <img src={m.from.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : m.from.fullName.slice(0, 1)}
                  </div>
                )}
                <div className={`max-w-[85%] sm:max-w-[78%] ${mine ? 'flex flex-col items-end' : ''}`}>
                  <div className={`px-3.5 py-2.5 rounded-card text-[13.5px] leading-[1.55] whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${mine ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-ink-50 border border-ink-200 rounded-tl-sm text-ink-900'}`}>
                    {sanitizeMsgBody(m.body)}
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
                  {!groupedWithNext && (
                    <div className="mt-1 font-mono text-[10px] tabular-nums text-ink-400">
                      {fmtKaTime(d)}
                    </div>
                  )}
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
            <Icon.paperclip className="w-3.5 h-3.5 text-ink-500 shrink-0" />
            <span className="flex-1 truncate font-display font-semibold text-ink-800">{attachment.name}</span>
            <span className="font-mono text-[10.5px] text-ink-500 tabular-nums shrink-0">{(attachment.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => setAttachment(null)} aria-label="ფაილის მოხსნა" className="w-6 h-6 rounded-btn hover:bg-ink-100 text-ink-500 hover:text-danger-600 inline-flex items-center justify-center">
              <Icon.x className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
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
              <Icon.paperclip className="w-4 h-4" />
            )}
          </button>
          <textarea
            value={text}
            maxLength={MSG_MAX_LEN}
            onChange={e => {
              setText(e.target.value)
              // Autosize: grow with content up to ~5 lines, then scroll inside.
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 132)}px`
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); (e.currentTarget as HTMLTextAreaElement).style.height = 'auto' } }}
            rows={1}
            placeholder={attachment ? 'დაწერე შეტყობინება ან უბრალოდ გააგზავნე ფაილი…' : 'მიუწერე შეტყობინება…'}
            className="flex-1 min-h-[44px] max-h-[132px] px-3 py-2.5 rounded-btn border border-ink-200 bg-white text-[13.5px] resize-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          <button type="submit" aria-label="გაგზავნა" disabled={sending || uploading || (!text.trim() && !attachment)} className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors shrink-0">
            {sending ? '…' : (<><Icon.send className="w-4 h-4" /><span className="hidden sm:inline">გაგზავნა</span></>)}
          </button>
        </div>
        {text.length > MSG_MAX_LEN - 200 && (
          <div className={`text-right font-mono text-[10.5px] tabular-nums ${text.length >= MSG_MAX_LEN ? 'text-danger-600' : 'text-ink-400'}`}>
            {text.length} / {MSG_MAX_LEN}
          </div>
        )}
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

  // Escape/scroll-lock/focus now come from Sheet — only reset form state on open.
  useEffect(() => {
    if (!open) return
    setSending(false); setErr(null); setNote('')
  }, [open])

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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      busy={sending}
      eyebrow={`გადადება — უფასოდ ${CANCEL_CUTOFF_HOURS}სთ-მდე`}
      title="აირჩიე ახალი დრო"
      footer={
        <>
          <button type="button" onClick={onClose} className="font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">გაუქმება</button>
          <button type="button" onClick={send} disabled={sending} className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 disabled:opacity-60">
            {sending ? 'იგზავნება…' : <>მოთხოვნის გაგზავნა <Icon.arrow className="w-3.5 h-3.5" /></>}
          </button>
        </>
      }
    >
      <div className="space-y-4">
          <div className="text-[12px] text-ink-500">ამჟამინდელი: <span className="font-display font-semibold text-ink-900">{fmtDate(new Date(booking.startAt))} · {fmtTime(new Date(booking.startAt))} · {booking.tutor.user.fullName}</span></div>
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
    </Sheet>
  )
}

/* ───── Dispute modal — sends real message ───── */
type DisputeReason = 'no-show' | 'quality' | 'wrong-topic' | 'unprofessional' | 'tech' | 'other'
const DisputeModal = ({ open, onClose, bookingId, onSent }: { open: boolean; onClose: () => void; bookingId: string; onSent: () => void }) => {
  const [reason, setReason] = useState<DisputeReason | null>(null)
  const [story, setStory] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Escape/scroll-lock/focus now come from Sheet — only reset form state on open.
  useEffect(() => {
    if (!open) return
    setReason(null); setStory(''); setSending(false); setErr(null)
  }, [open])

  const REASONS: { id: DisputeReason; l: string; sub: string }[] = [
    { id: 'no-show',        l: 'ექსპერტი არ მოვიდა',        sub: PAYMENTS_LIVE ? '100% დაბრუნება' : 'პრიორიტეტული განხილვა' },
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
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      busy={sending}
      ariaLabel="საჩივარი"
      title={
        <>
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-danger-700 mb-1 inline-flex items-center gap-1.5"><Icon.flag className="w-3 h-3" /> საჩივარი</div>
          <div>გვითხარი — რა მოხდა?</div>
        </>
      }
      footer={
        <>
          <button type="button" onClick={onClose} className="font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">გაუქმება</button>
          <button type="button" disabled={!reason || sending} onClick={send} className={`h-11 px-4 rounded-btn font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 ${!reason || sending ? 'bg-ink-100 text-ink-400 cursor-not-allowed' : 'bg-danger-500 hover:bg-danger-600 text-white'}`}>
            <Icon.flag className="w-3.5 h-3.5" /> {sending ? 'იგზავნება…' : 'გააგზავნე'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
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
    </Sheet>
  )
}

/* ───── Client no-show report — quiet escape hatch for a CONFIRMED booking
   whose start passed 15+ minutes ago without the expert completing it.
   Opens a small Sheet with the free-replacement promise + optional details,
   then POST /api/disputes {reason:'NO_SHOW'}. 409 = already reported. */
const NoShowReport = ({ bookingId }: { bookingId: string }) => {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [reported, setReported] = useState(false)

  const submit = async () => {
    if (sending) return
    setSending(true)
    try {
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, reason: 'NO_SHOW', details: details.trim() || undefined }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (res.status === 409) {
        toast('უკვე გვაცნობე — ვამუშავებთ', 'info')
        setReported(true); setOpen(false)
        return
      }
      if (!res.ok || !j.ok) {
        toast('გაგზავნა ვერ მოხერხდა — სცადე თავიდან', 'error')
        return
      }
      toast('გვაცნობე — გუნდი მალე დაგიკავშირდება', 'success')
      setReported(true); setOpen(false)
    } catch { toast('ქსელის შეცდომა', 'error') }
    finally { setSending(false) }
  }

  if (reported) {
    return (
      <div className="flex items-center gap-2.5 h-9 px-3 rounded-btn bg-ink-50 border border-ink-200 text-ink-600 font-display font-semibold text-[11.5px]">
        <Icon.check className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span>მოხსენებულია — ვამუშავებთ</span>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 h-9 px-3 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-50 font-display font-semibold text-[11.5px] transition-colors"
      >
        <Icon.flag className="w-3.5 h-3.5" />
        <span>ექსპერტი არ გამოჩნდა?</span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        busy={sending}
        eyebrow="ექსპერტი არ გამოჩნდა"
        title="გვაცნობე — უფასოდ ჩავანაცვლებთ"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-800">დახურვა</button>
            <button type="button" onClick={submit} disabled={sending} className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-display font-semibold text-[12.5px]">
              {sending ? 'იგზავნება…' : 'გაგზავნა'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-ink-700 leading-[1.6]">
            თუ ექსპერტი სესიაზე არ გამოცხადდა, გვაცნობე — გუნდი განიხილავს და უფასოდ დაგეხმარებით შემცვლელი ექსპერტის ან ახალი დროის შერჩევაში.
          </p>
          <div>
            <label className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">
              დეტალები <span className="text-ink-400 font-normal normal-case tracking-normal">— სურვილისამებრ</span>
            </label>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="მაგ.: 15 წუთი ველოდე ოთახში, ექსპერტი არ შემოსულა…"
              className="w-full p-3 rounded-field border border-ink-200 text-[13px] focus:border-brand-500 focus:outline-none resize-none leading-relaxed"
            />
          </div>
        </div>
      </Sheet>
    </>
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
  const [anonymous, setAnonymous] = useState(existing?.anonymous ?? false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setRating(existing?.rating ?? 0)
    setBody(existing?.body ?? '')
    setAnonymous(existing?.anonymous ?? false)
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
        body: JSON.stringify({ bookingId: booking.id, rating, body: body.trim(), anonymous }),
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
    <section id="leave-review" className="max-w-[1280px] mx-auto px-6 lg:px-8 mt-4 scroll-mt-24">
      <div className="rounded-card border border-brand-200 bg-brand-50/50 p-5 lg:p-6">
        {existing && !editing ? (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 h-6 px-2.5 rounded-pill bg-warning-50 border border-warning-200 text-warning-800 font-display text-[11px] font-bold">
                შეფასდა · {existing.rating}<span className="sr-only"> 5-დან</span>
                <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-warning-500"><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>
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
            {/* Outcome-inviting hint (2.5): nudge toward concrete results — no new DB fields,
                the outcome lives in the same body text. */}
            <p className="mt-1 text-[12px] text-ink-500 leading-snug">რა შედეგი მიიღე? კონკრეტული შედეგი ყველაზე მეტად ეხმარება სხვებს არჩევანში.</p>
            <div className="mt-4 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} ვარსკვლავი`}
                  className={`w-10 h-10 rounded-btn inline-flex items-center justify-center transition-all ${rating >= n ? 'text-warning-500 hover:scale-110' : 'text-ink-300 hover:text-ink-400'}`}
                >
                  <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>
                </button>
              ))}
              {rating > 0 && <span className="ml-2 font-display text-[13px] font-bold text-ink-900 tabular-nums">{rating}.0 / 5</span>}
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder="მაგ.: ერთ სესიაში ამიხსნა, როგორ დავარეგისტრირო შპს — კონკრეტული ნაბიჯებით…"
              className="mt-3 w-full px-3.5 py-2.5 rounded-field border border-ink-200 bg-white text-[13.5px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none leading-relaxed"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-ink-500">30 დღიანი ვადა შენახვისთვის</span>
              <span className="font-mono text-[10.5px] tabular-nums text-ink-400">{body.length} / 2000</span>
            </div>
            <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={e => setAnonymous(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-ink-300 accent-brand-500 focus:ring-brand-400"
              />
              <span className="min-w-0">
                <span className="block font-display text-[12.5px] font-semibold text-ink-800">ანონიმურად გამოქვეყნება</span>
                <span className="block text-[11.5px] text-ink-500 mt-0.5">ექსპერტი შენს სახელს ვერ დაინახავს</span>
              </span>
            </label>
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
    <section className="max-w-[1280px] mx-auto px-6 lg:px-8 mt-4">
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
              className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px]"
            >
              {busy === 'reject' ? '…' : 'უარი'}
            </button>
            <button
              type="button"
              onClick={() => respond(true)}
              disabled={busy !== null}
              className="h-11 px-4 rounded-btn bg-success-600 hover:bg-success-700 disabled:opacity-60 text-white font-display font-semibold text-[12.5px]"
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
}: {
  booking: Booking
  meId: string | null
  onRefresh: () => void
  onReschedule: () => void
  onCancel: () => void
  onDispute: () => void
}) => {
  const status = booking.status
  const canCancel = status === 'PREPARING' || status === 'CONFIRMED'
  // Suppress the "propose reschedule" button while a proposal is already
  // in flight — the banner drives the accept/reject decision instead.
  const canReschedule = (status === 'PREPARING' || status === 'CONFIRMED') && !booking.rescheduleRequest

  return (
    <section className="max-w-[1280px] mx-auto px-6 lg:px-8 mt-6 grid lg:grid-cols-[1fr_360px] gap-6 pb-28 lg:pb-12">
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
                    <Icon.star aria-hidden className="w-4 h-4" />
                    <span className="flex-1 text-left">დატოვე შეფასება</span>
                  </a>
                )}
              </>
            )}

            {/* Dispute only makes sense once a session ran (or should have run);
                iCal only for sessions still ahead. State-blind actions read as
                noise and invite mistakes. */}
            {(status === 'LIVE' || status === 'COMPLETED' || status === 'NO_SHOW') && (
              <button type="button" onClick={onDispute} className="w-full flex items-center gap-2.5 h-9 px-3 rounded-btn text-ink-500 hover:text-danger-700 hover:bg-danger-50 font-display font-semibold text-[11.5px] transition-colors">
                <Icon.flag className="w-3.5 h-3.5" />
                <span>საჩივარი</span>
              </button>
            )}
            {(status === 'PREPARING' || status === 'CONFIRMED') && (
              <a href={`/api/bookings/${booking.id}/ical`} className="w-full flex items-center gap-2.5 h-9 px-3 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-50 font-display font-semibold text-[11.5px] transition-colors">
                <Icon.download className="w-3.5 h-3.5" />
                <span>კალენდარში დამატება</span>
              </a>
            )}

            {/* Expert no-show escape hatch — a CONFIRMED session whose start
                passed 15+ minutes ago and was never completed. Quiet on
                purpose: it must not compete with join/reschedule CTAs. */}
            {status === 'CONFIRMED' && Date.now() > new Date(booking.startAt).getTime() + 15 * 60_000 && (
              <NoShowReport bookingId={booking.id} />
            )}
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
            {PAYMENTS_LIVE
              ? (status === 'CANCELED' || status === 'NO_SHOW' ? 'თანხა დაბრუნებულია' :
                 status === 'COMPLETED' ? 'გათავისუფლდა ექსპერტზე' :
                 'დაცული გადახდით')
              : 'დაჯავშნა უფასოა — გადახდები მალე'}
          </div>
        </div>

        {/* Policy */}
        <div className="rounded-card bg-brand-50/40 border border-brand-200 p-5">
          <div className="flex items-start gap-2.5">
            <Icon.shield className="w-4 h-4 text-brand-700 mt-0.5 shrink-0" />
            <div>
              {PAYMENTS_LIVE ? (
                <>
                  <div className="font-display text-[12.5px] font-bold text-ink-900 tracking-tight mb-1">100% ფულის უკან-დაბრუნების გარანტია</div>
                  <p className="text-[11.5px] text-ink-700 leading-[1.5]">თუ ექსპერტი არ მოვა ან სესია ვერ შესრულდება — დაცული თანხა მთლიანად დაგიბრუნდება.</p>
                </>
              ) : (
                <>
                  <div className="font-display text-[12.5px] font-bold text-ink-900 tracking-tight mb-1">დაჯავშნა უფასოა</div>
                  <p className="text-[11.5px] text-ink-700 leading-[1.5]">ამ ეტაპზე არაფერს იხდი — გადახდები და დაცული გადახდის სისტემა მალე ჩაირთვება. თუ ექსპერტი არ მოვა, დაგეხმარებით ახალი დროის შერჩევაში.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>
    </section>
  )
}

/* ───── Real status timeline ─────
   Timestamps are shown ONLY for events whose time we actually know:
   createdAt for creation, startAt/end for the session slot. Events the DB
   doesn't stamp (confirmation, cancellation) render without a time — a fake
   "now"/created timestamp is worse than none. */
const StatusTimeline = ({ booking }: { booking: Booking }) => {
  const items = useMemo(() => {
    const created = new Date(booking.createdAt)
    const start = new Date(booking.startAt)
    const end = new Date(start.getTime() + booking.durationMin * 60_000)
    const now = new Date()
    const s = booking.status

    const list: { at: Date | null; l: string; sub?: string; done: boolean }[] = []
    list.push({ at: created, l: 'ჯავშანი შეიქმნა', done: true, sub: PAYMENTS_LIVE ? `₾${booking.price} დაცულ გადახდაშია` : 'დაჯავშნა უფასოა — გადახდები მალე' })

    if (s === 'PREPARING') {
      list.push({ at: null, l: 'ველოდებით ექსპერტის დადასტურებას', done: false })
    } else if (s !== 'CANCELED') {
      list.push({ at: null, l: 'ექსპერტმა დაადასტურა', done: true })
    }

    if (s !== 'CANCELED' && s !== 'NO_SHOW') {
      list.push({ at: start, l: 'სესია იწყება', done: now.getTime() >= start.getTime() && s !== 'PREPARING' })
      list.push({ at: end, l: 'სესია სრულდება', done: now.getTime() >= end.getTime() && s === 'COMPLETED' })
    }

    if (s === 'CANCELED') {
      list.push({ at: null, l: `${booking.cancelledBy === 'TUTOR' ? 'ექსპერტმა' : booking.cancelledBy === 'ADMIN' ? 'ადმინმა' : 'შენ'} გააუქმა`, done: true, sub: PAYMENTS_LIVE ? 'დაცული თანხა დაბრუნდა' : undefined })
    }
    if (s === 'NO_SHOW') {
      list.push({ at: end, l: 'სესია არ შედგა', done: true, sub: PAYMENTS_LIVE ? 'დაცული თანხა დაბრუნდა' : undefined })
    }
    if (s === 'COMPLETED') {
      list.push({ at: end, l: PAYMENTS_LIVE ? 'დასრულდა · დაცული თანხა ექსპერტს გადაეცა' : 'დასრულდა', done: true })
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
            {s.at && <span className="font-mono text-[10.5px] tabular-nums text-ink-500">{fmtDate(s.at)} {fmtTime(s.at)}</span>}
            <div className={`${s.at ? 'mt-0.5 ' : ''}font-display text-[13px] font-semibold ${s.done ? 'text-ink-900' : 'text-ink-500'}`}>{s.l}</div>
            {s.sub && <div className="text-[11.5px] text-ink-500 mt-0.5">{s.sub}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ───── Mobile sticky action bar ─────
   Phones had no persistent CTA — the primary action lived far up in the Hero
   rail. Fixed to the viewport bottom (lg:hidden) and flags the body with
   data-mobile-cta so the cookie banner lifts above it (globals.css), same
   convention as the tutor-profile booking bar. Terminal statuses render
   nothing — the inline review card / rebook actions cover those. */
const MobileActionBar = ({ booking, onReschedule, onCancel }: { booking: Booking; onReschedule: () => void; onCancel: () => void }) => {
  const status = booking.status
  const start = new Date(booking.startAt)
  // 1s tick — keeps the countdown hint and the live/joinable switch fresh.
  const cd = useCountdown(status === 'PREPARING' || status === 'CONFIRMED' ? start : null)
  const live = isBookingLive(booking)
  const joinable = live || (status === 'CONFIRMED' && cd !== null && cd.diff <= 5 * 60_000)
  const show = status === 'PREPARING' || status === 'CONFIRMED'

  useEffect(() => {
    if (!show) return
    document.body.setAttribute('data-mobile-cta', '1')
    return () => document.body.removeAttribute('data-mobile-cta')
  }, [show])

  if (!show) return null

  const hint = cd
    ? cd.d > 0 ? `${cd.d} დღე ${cd.h} სთ` : cd.h > 0 ? `${cd.h} სთ ${cd.m} წთ` : `${Math.max(1, cd.m)} წთ`
    : ''

  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-[65] bg-white/95 backdrop-blur-md border-t border-ink-200 shadow-[0_-4px_20px_rgba(46,42,33,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="px-4 py-3 flex items-center gap-2.5">
        {status === 'PREPARING' ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[13px] font-bold text-ink-900 leading-tight truncate">ელოდება დადასტურებას</div>
              <div className="mt-0.5 text-[11px] text-ink-500 tabular-nums truncate">{fmtDate(start)} · {fmtTime(start)}</div>
            </div>
            <button type="button" onClick={onReschedule} className="shrink-0 h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
              გადადება
            </button>
            <button type="button" onClick={onCancel} className="shrink-0 h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-danger-50 hover:border-danger-200 text-ink-600 hover:text-danger-700 font-display font-semibold text-[12.5px] transition-colors">
              გაუქმება
            </button>
          </>
        ) : joinable ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[13px] font-bold text-brand-800 leading-tight truncate">{live ? 'სესია მიმდინარეობს' : 'იწყება ახლა'}</div>
              <div className="mt-0.5 text-[11px] text-ink-500 truncate">{booking.topic}</div>
            </div>
            <Link href={`/session/${booking.id}`} className="shrink-0 h-12 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] inline-flex items-center gap-2 transition-colors">
              <Icon.video className="w-4 h-4" /> ვიდეო-ოთახში
            </Link>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[13px] font-bold text-ink-900 leading-tight truncate">დაწყებამდე დარჩა <span className="tabular-nums">{hint}</span></div>
              <div className="mt-0.5 text-[11px] text-ink-500 truncate">გაიხსნება 5 წუთით ადრე</div>
            </div>
            <button type="button" disabled className="shrink-0 h-12 px-5 rounded-btn bg-ink-200 text-ink-500 font-display font-semibold text-[13.5px] inline-flex items-center gap-2 cursor-not-allowed">
              <Icon.video className="w-4 h-4" /> ვიდეო-ოთახში
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ───── Page ───── */
export default function BookingDetail() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  // Header identity for the shared StudentAppBar (avatar + user menu).
  const [me, setMe] = useState<{ name: string; avatar?: string | null } | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduledOk, setRescheduledOk] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeSent, setDisputeSent] = useState(false)
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
      setMe(meRes?.user ? { name: meRes.user.fullName, avatar: meRes.user.avatarUrl } : null)
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

  // ?review=1 (from session-row CTA) scrolls to the inline review card — the
  // one and only review surface; the old duplicate ReviewModal is gone.
  // Guarded by a ref so the post-submit reload() can't re-trigger the scroll.
  const reviewAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined' || reviewAutoOpenedRef.current) return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('review') === '1' && booking && booking.status === 'COMPLETED') {
      reviewAutoOpenedRef.current = true
      // Next frame: the inline card mounts in the same render pass.
      requestAnimationFrame(() => {
        document.getElementById('leave-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
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
      // Same error vocabulary as the dashboard's cancel flow — a BAD_STATE
      // response means the session already finished or was cancelled, which
      // deserves a specific message, not the generic one.
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        toast(data?.error === 'BAD_STATE' ? 'ეს სესია უკვე დასრულებული ან გაუქმებულია.' : 'გაუქმება ვერ მოხერხდა', 'error')
        return
      }
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
        <StudentAppBar user={me ?? undefined} />
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

  // Hours until the session starts — drives the honest cancellation-policy
  // sentence in the confirm dialog (CANCEL_CUTOFF_HOURS is the canonical
  // free-cancellation window shared with the server).
  const hoursToStart = (new Date(booking.startAt).getTime() - Date.now()) / 3_600_000

  return (
    <div className="font-sans bg-ink-50/50 text-ink-900 antialiased min-h-screen">
      <StudentAppBar user={me ?? undefined} />
      <Breadcrumb status={booking.status} ref={booking.ref} />
      <Hero booking={booking} onEnterRoom={enterRoom} onCopyRef={copyRef} />
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
      />

      <MobileActionBar
        booking={booking}
        onReschedule={() => setRescheduleOpen(true)}
        onCancel={cancelBooking}
      />

      <WorkspaceFooter />

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
        body={
          PAYMENTS_LIVE
            ? (hoursToStart >= CANCEL_CUTOFF_HOURS
                ? `სესიის დაწყებამდე ${CANCEL_CUTOFF_HOURS} საათზე მეტია დარჩენილი — დაცული თანხა სრულად დაგიბრუნდება.`
                : `სესიის დაწყებამდე ${CANCEL_CUTOFF_HOURS} საათზე ნაკლებია დარჩენილი — სრული დაბრუნება გარანტირებული აღარ არის.`)
            : 'გაუქმება უფასოა — ჯერ არაფერი გადაგიხდია. დრო გათავისუფლდება და ექსპერტს ეცნობება.'
        }
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
