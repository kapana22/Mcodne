// Shared booking-bucketing + dashboard-summary logic.
//
// Single source of truth for how BOTH the student dashboard
// (app/student/page.tsx) and the tutor dashboard (app/tutor/page.tsx) split
// bookings into upcoming/today/week/past/cancelled and count them. Previously
// the student page defined these module-locally (a prior task's file-scope
// constraint) and the tutor page rolled its own with a DIFFERENT timezone
// (viewer-local midnight vs Asia/Tbilisi) and a different "today" status set —
// so the same account showed different counts by role. This module removes
// that divergence.
//
// Pure + framework-agnostic. Covered by tests/student-dashboard.test.ts.

export const TBILISI_TZ = 'Asia/Tbilisi'
export const UPCOMING_STATUSES = ['CONFIRMED', 'PREPARING', 'LIVE'] as const

export type SummaryBooking = {
  status: string
  startAt: string | number | Date
  durationMin?: number | null
  tutor?: { id?: string | null } | null
}

const _dayKeyFmt = new Map<string, Intl.DateTimeFormat>()
/** Calendar day (YYYY-MM-DD) that an instant falls on in the given timezone. */
export function dayKeyInTz(d: Date, tz: string = TBILISI_TZ): string {
  let f = _dayKeyFmt.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    _dayKeyFmt.set(tz, f)
  }
  return f.format(d)
}

/** Split raw bookings into the exact buckets the UI shows. Upcoming excludes
 *  past-but-not-completed sessions (startAt > now) and is sorted soonest-first. */
export function bucketBookings<T extends SummaryBooking>(bookings: T[], now: number = Date.now()) {
  const statuses = UPCOMING_STATUSES as readonly string[]
  const upcoming = bookings
    .filter(b => statuses.includes(b.status) && new Date(b.startAt).getTime() > now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  const past = bookings.filter(b => b.status === 'COMPLETED')
  const cancelled = bookings.filter(b => b.status === 'CANCELED' || b.status === 'NO_SHOW')
  return { upcoming, past, cancelled }
}

/** Header summary counters — all derived from the same buckets as the lists,
 *  in Asia/Tbilisi (the platform's canonical zone) regardless of viewer tz. */
export function deriveSummary<T extends SummaryBooking>(
  bookings: T[],
  now: number = Date.now(),
  tz: string = TBILISI_TZ,
) {
  const { upcoming } = bucketBookings(bookings, now)
  const todayKey = dayKeyInTz(new Date(now), tz)
  const today = upcoming.filter(b => dayKeyInTz(new Date(b.startAt), tz) === todayKey)
  const weekEnd = now + 7 * 86400_000
  const week = upcoming.filter(b => new Date(b.startAt).getTime() <= weekEnd)
  // LIVE is a confirmed session that is already running — count it with
  // CONFIRMED so "დადასტ. · ელოდ." always sums to the weekly total.
  const weekConfirmed = week.filter(b => b.status === 'CONFIRMED' || b.status === 'LIVE').length
  const weekPending = week.filter(b => b.status === 'PREPARING').length
  const completed = bookings.filter(b => b.status === 'COMPLETED')
  const totalHours = completed.reduce((s, b) => s + (b.durationMin ?? 0), 0) / 60
  const uniqueTutors = new Set(completed.map(b => b.tutor?.id).filter(Boolean)).size
  return {
    upcoming, today, week,
    upcomingCount: upcoming.length,
    todayCount: today.length,
    weekCount: week.length,
    weekConfirmed, weekPending,
    completedCount: completed.length,
    totalHours, uniqueTutors,
  }
}
