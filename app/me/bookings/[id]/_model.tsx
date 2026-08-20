'use client'
// /student/bookings/[id] — the booking payload shape, its status map and
// every derivation the screen needs (times, no-show grace, rebook link).

import { useState, useEffect } from 'react'
import { userTimezone, TBILISI } from '@/lib/tz'
import { KA_MONTHS_SHORT_DOT } from '@/lib/kaDate'

/* ───── Minimal icon set ───── */

/* ───── Types ───── */
export type ApiStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'
type MsgUser = { id: string; fullName: string; avatarUrl?: string | null }
type BookingMsg = { id: string; body: string; fromId: string; createdAt: string; from: MsgUser; fileUrl?: string | null; fileName?: string | null }
export type ExistingReview = { id: string; rating: number; body: string; createdAt: string; studentId: string; anonymous?: boolean }
type ReschedulePayload = {
  proposedBy: 'STUDENT' | 'TUTOR'
  newStartAt: string
  reason: string | null
  proposedAt: string
}
export type Booking = {
  id: string
  ref: string
  topic: string
  status: ApiStatus
  // Set by the 48h cleanup cron when nobody manually completed the session.
  // The reviews API rejects (AUTO_COMPLETED) these, so the UI must not offer
  // a review form for them.
  autoCompleted?: boolean
  startAt: string
  durationMin: number
  price: number
  meetingUrl?: string | null
  // A BOG/TBC link the expert or an admin pasted onto this booking. Display
  // only — there is no checkout here and PAYMENTS_LIVE is still false; this is
  // just the bank's own page, made reachable. Null on almost every booking.
  paymentLinkUrl?: string | null
  studentNotes?: string | null
  tutorNotes?: string | null
  createdAt: string
  // Money state. On a NO_SHOW booking this is also the only field that carries
  // WHICH side failed to appear — see `isExpertNoShow` below.
  payoutStatus?: 'PENDING' | 'RELEASED' | 'REFUNDED' | null
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
const KA_MONTHS_SHORT = KA_MONTHS_SHORT_DOT
const KA_WEEKDAY_SHORT = ['კვ.','ორშ.','სამშ.','ოთხ.','ხუთ.','პარ.','შაბ.']

export const fmtDate = (d: Date) => `${KA_WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${KA_MONTHS_SHORT[d.getMonth()]}`
export const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/* ───── Status badge ───── */
// Quiet header strip: a single neutral shade for every state, with the state
// conveyed by colored TEXT at the point of meaning (canon: no pastel status
// fills, no status dots). The label copy itself already carries the state.
export const STATUS_MAP: Record<ApiStatus, { l: string; cls: string }> = {
  PREPARING: { l: 'ელოდები დადასტურებას', cls: 'bg-ink-50/60 text-warning-800 border-ink-200' },
  CONFIRMED: { l: 'დადასტურდა — ვიდეოოთახი მზადაა', cls: 'bg-ink-50/60 text-brand-700 border-ink-200' },
  LIVE:      { l: 'სესია მიმდინარეობს', cls: 'bg-ink-50/60 text-danger-700 border-ink-200' },
  COMPLETED: { l: 'სესია დასრულდა', cls: 'bg-ink-50/60 text-brand-700 border-ink-200' },
  CANCELED:  { l: 'ჯავშანი გაუქმდა', cls: 'bg-ink-50/60 text-ink-600 border-ink-200' },
  NO_SHOW:   { l: 'სესია არ შედგა', cls: 'bg-ink-50/60 text-ink-600 border-ink-200' },
}

/* ───── No-show reporting ─────
   Grace before EITHER side may report a no-show. Mirrors NO_SHOW_GRACE_MS in
   app/api/bookings/[id]/route.ts — the server refuses anything earlier with
   TOO_EARLY, so this only decides whether the action is offered at all. The
   minute value is exported into the copy so the two can't drift. */
export const NO_SHOW_GRACE_MIN = 15
export const NO_SHOW_GRACE_MS = NO_SHOW_GRACE_MIN * 60_000

/* A NO_SHOW booking carries its DIRECTION in payoutStatus, and the two
   directions are opposite outcomes that must never share a sentence:
     RELEASED → the expert held the slot and showed up, the client didn't —
                the money stays with the expert (`no_show` action).
     REFUNDED → the expert never appeared — the client is not charged
                (`expert_no_show` action). */
export const isExpertNoShow = (b: Booking) => b.status === 'NO_SHOW' && b.payoutStatus === 'REFUNDED'

export const tabOf = (s: ApiStatus) =>
  s === 'COMPLETED' || s === 'NO_SHOW' ? 'დასრულებული'
  : s === 'CANCELED' ? 'გაუქმებული'
  : 'მომავალი'

/* ───── Countdown to a date ───── */
export const useCountdown = (target: Date | null) => {
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
export const useRemainingLabel = (startAt: Date, durationMin: number): string => {
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
export const rebookHref = (booking: Booking): string => {
  const params = new URLSearchParams({
    topic: booking.topic,
    duration: String(booking.durationMin),
    price: String(booking.price),
    rebook: '1',
  })
  return `/experts/${booking.tutor.id}?${params.toString()}`
}

/* Client-only hook: resolves the visitor's browser timezone after mount.
   Returns `TBILISI` during SSR/first paint so hydration stays stable. */
export const useUserTz = (): string => {
  const [tz, setTz] = useState<string>(TBILISI)
  useEffect(() => { setTz(userTimezone()) }, [])
  return tz
}

/* ───── Page ───── */
// Last-seen booking per id, cached at module scope (stale-while-revalidate, the
// same pattern as lib/me.ts). `/api/bookings/[id]` is the slowest endpoint
// (heavy DB), so re-opening a booking you already viewed renders instantly from
// cache while a fresh copy loads in the background — no more spinner wait.
export const bookingCache = new Map<string, Booking>()