// Unit tests for the student-dashboard booking derivation.
//
// Run: npx tsx --test tests/student-dashboard.test.ts
//
// These lock in the bucketing rules that the dashboard header (Welcome) and the
// sessions list (SessionsPanel / NextSession) now share, so their numbers can
// never diverge again. A Next.js `page.tsx` may only export `default`, so the
// pure helpers below are kept byte-for-byte in sync with the module-local copy
// in app/me/page.tsx (a shared lib/ module is out of scope for this fix).

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Import the REAL shared helpers (previously mirrored byte-for-byte here). Both
// the student and tutor dashboards import these same functions, so this suite
// now guards the actual source, not a copy.
import { bucketBookings, deriveSummary, dayKeyInTz, type SummaryBooking } from '../lib/bookings'

/* ─── fixtures ─── */
const HOUR = 3600_000
const DAY = 86400_000
// Anchor "now" to a fixed instant so tests are deterministic regardless of the
// machine timezone: 2026-07-18T00:30:00Z == 04:30 on 2026-07-18 in Tbilisi (+4).
const NOW = Date.parse('2026-07-18T00:30:00Z')

/* ─── A booking bug: upcoming must exclude past-but-not-completed sessions ─── */
test('bucketBookings: upcoming excludes past sessions even if still CONFIRMED', () => {
  const bookings: SummaryBooking[] = [
    { status: 'CONFIRMED', startAt: new Date(NOW - 2 * HOUR).toISOString() }, // past, never marked complete
    { status: 'CONFIRMED', startAt: new Date(NOW + 2 * HOUR).toISOString() }, // future
    { status: 'PREPARING', startAt: new Date(NOW + 3 * DAY).toISOString() },  // future
  ]
  const { upcoming } = bucketBookings(bookings, NOW)
  assert.equal(upcoming.length, 2, 'the stale past CONFIRMED booking must not inflate upcoming')
  assert.ok(upcoming.every(b => new Date(b.startAt).getTime() > NOW))
})

test('bucketBookings: upcoming is sorted soonest-first', () => {
  const bookings: SummaryBooking[] = [
    { status: 'CONFIRMED', startAt: new Date(NOW + 5 * DAY).toISOString() },
    { status: 'LIVE', startAt: new Date(NOW + 1 * HOUR).toISOString() },
    { status: 'PREPARING', startAt: new Date(NOW + 2 * DAY).toISOString() },
  ]
  const { upcoming } = bucketBookings(bookings, NOW)
  const times = upcoming.map(b => new Date(b.startAt).getTime())
  assert.deepEqual(times, [...times].sort((a, b) => a - b))
})

/* ─── G2: weekly "დადასტ. · ელოდ." parts must sum to the total (LIVE counted) ─── */
test('deriveSummary: weekConfirmed + weekPending equals weekCount (LIVE has no orphan)', () => {
  const bookings: SummaryBooking[] = [
    { status: 'CONFIRMED', startAt: new Date(NOW + 1 * DAY).toISOString() },
    { status: 'PREPARING', startAt: new Date(NOW + 2 * DAY).toISOString() },
    { status: 'LIVE', startAt: new Date(NOW + 1 * HOUR).toISOString() }, // was excluded from both sub-labels
  ]
  const s = deriveSummary(bookings, NOW)
  assert.equal(s.weekCount, 3)
  assert.equal(s.weekConfirmed + s.weekPending, s.weekCount, 'LIVE must be bucketed so the parts sum')
  assert.equal(s.weekConfirmed, 2) // CONFIRMED + LIVE
  assert.equal(s.weekPending, 1)
})

/* ─── G3: "today" buckets in Asia/Tbilisi, not the viewer's local midnight ─── */
test('dayKeyInTz: an instant is bucketed by its Tbilisi calendar day', () => {
  // 22:30Z is already the next calendar day (02:30) in Tbilisi (+4).
  assert.equal(dayKeyInTz(new Date('2026-07-17T22:30:00Z')), '2026-07-18')
  assert.equal(dayKeyInTz(new Date('2026-07-18T00:30:00Z')), '2026-07-18')
})

test('deriveSummary: today respects the Tbilisi day boundary', () => {
  const bookings: SummaryBooking[] = [
    // Tbilisi 23:00 on 07-18 — same Tbilisi day as NOW → counts today.
    { status: 'CONFIRMED', startAt: '2026-07-18T19:00:00Z' },
    // Tbilisi 01:00 on 07-19 — next Tbilisi day → not today, but within the week.
    { status: 'CONFIRMED', startAt: '2026-07-18T21:00:00Z' },
  ]
  const s = deriveSummary(bookings, NOW)
  assert.equal(s.todayCount, 1, 'only the session on the current Tbilisi day counts as today')
  assert.equal(s.weekCount, 2)
})

/* ─── G (overall): header counters agree with the list buckets ─── */
test('deriveSummary counters stay consistent with bucketBookings lists', () => {
  const bookings: SummaryBooking[] = [
    { status: 'CONFIRMED', startAt: new Date(NOW + 2 * HOUR).toISOString() },
    { status: 'PREPARING', startAt: new Date(NOW + 4 * DAY).toISOString() },
    { status: 'CONFIRMED', startAt: new Date(NOW + 20 * DAY).toISOString() }, // future but outside the week
    { status: 'CONFIRMED', startAt: new Date(NOW - 5 * DAY).toISOString() },  // past, excluded
    { status: 'COMPLETED', startAt: new Date(NOW - 10 * DAY).toISOString(), durationMin: 90, tutor: { id: 't1' } },
    { status: 'COMPLETED', startAt: new Date(NOW - 12 * DAY).toISOString(), durationMin: 30, tutor: { id: 't1' } },
    { status: 'CANCELED', startAt: new Date(NOW - 1 * DAY).toISOString() },
  ]
  const buckets = bucketBookings(bookings, NOW)
  const s = deriveSummary(bookings, NOW)

  assert.equal(s.upcomingCount, buckets.upcoming.length, 'header upcoming == list upcoming badge')
  assert.equal(s.upcomingCount, 3)
  assert.equal(s.completedCount, buckets.past.length)
  assert.equal(s.completedCount, 2)
  // Nested windows: today ⊆ week ⊆ upcoming.
  assert.ok(s.todayCount <= s.weekCount)
  assert.ok(s.weekCount <= s.upcomingCount)
  // Lifetime aggregates.
  assert.equal(s.totalHours, 2) // (90 + 30) / 60
  assert.equal(s.uniqueTutors, 1)
})
