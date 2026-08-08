// Unit tests for lib/postSession.ts — the post-session review-nudge selection.
//
// Run: npx tsx tests/post-session.test.ts
//
// Pure unit test (no browser, no dev server, no DB, no mail), in the style of
// tests/availability.test.ts. `selectReviewNudges` is the authority on who gets
// nudged — the SQL in sendPostSessionNudges is only a looser prefilter — so
// these cases pin the rules that decide whether a real client is emailed:
//
//   1. A completed, unreviewed session past the delay IS selected.
//   2. A session that already has a review is NOT (nothing left to ask for).
//   3. Cancelled / no-show / still-open / disputed / auto-completed are NOT
//      (auto-completed can't be reviewed at all — /api/reviews rejects it).
//   4. An already-stamped booking is NOT — the claim is the deterministic
//      Notification id, so a second cron tick must find nothing to do.
//   5. The delay window is respected on BOTH ends: too fresh is skipped, and so
//      is too stale.
//   6. A client who already has an upcoming booking with that expert gets the
//      review nudge WITHOUT the rebook line.
//
// Every fixture is a fixed instant — no Date.now(), no Math.random().

import {
  selectReviewNudges,
  shouldPromptRebook,
  nudgeNotificationId,
  REVIEW_NUDGE_DELAY_HOURS,
  REVIEW_NUDGE_MAX_AGE_DAYS,
  isQuietHour,
  tbilisiHour,
  type NudgeCandidate,
} from '../lib/postSession'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ───── fixtures ───── */

// 10:00Z = 14:00 Tbilisi — deliberately mid-afternoon, because selection now
// returns [] during quiet hours (22:00–08:00 Tbilisi). The previous 18:00Z pin
// was 22:00 Tbilisi, i.e. exactly the first quiet minute.
const NOW = new Date(Date.UTC(2026, 6, 28, 10, 0))
const HOUR = 3600_000
const DAY = 24 * HOUR

// `endedHoursAgo` is measured from the session END, which is what the rule uses.
function candidate(over: Partial<NudgeCandidate> & { endedHoursAgo?: number } = {}): NudgeCandidate {
  const { endedHoursAgo = REVIEW_NUDGE_DELAY_HOURS + 1, ...rest } = over
  const durationMin = rest.durationMin ?? 60
  const startAt = new Date(NOW.getTime() - endedHoursAgo * HOUR - durationMin * 60_000)
  return {
    id: 'bk_1',
    topic: 'ბიზნეს-გეგმა',
    startAt,
    durationMin,
    status: 'COMPLETED',
    autoCompleted: false,
    reviewId: null,
    disputeId: null,
    alreadyNudged: false,
    hasUpcomingWithTutor: false,
    studentId: 'u_student',
    studentEmail: 'client@example.com',
    studentName: 'ნინო',
    studentPrefs: null,
    tutorProfileId: 'tp_1',
    tutorName: 'გიორგი',
    ...rest,
  }
}

const selects = (over: Parameters<typeof candidate>[0] = {}) =>
  selectReviewNudges([candidate(over)], NOW).length === 1

/* ───── the happy path ───── */

check('completed + unreviewed + past the delay → selected', selects())

check('all three candidates of a mixed batch are filtered independently',
  selectReviewNudges([
    candidate({ id: 'a' }),
    candidate({ id: 'b', reviewId: 'rv_1' }),
    candidate({ id: 'c' }),
  ], NOW).map(r => r.id).join(',') === 'a,c')

/* ───── already reviewed / already nudged ───── */

check('a booking that already has a review is skipped', !selects({ reviewId: 'rv_1' }))

check('an already-stamped booking is skipped (exactly-once)', !selects({ alreadyNudged: true }))

check('the claim id is deterministic per booking',
  nudgeNotificationId('bk_1') === nudgeNotificationId('bk_1') &&
  nudgeNotificationId('bk_1') !== nudgeNotificationId('bk_2'))

/* ───── statuses that must never be nudged ───── */

for (const status of ['CANCELED', 'NO_SHOW', 'CONFIRMED', 'LIVE', 'PREPARING']) {
  check(`status ${status} is skipped`, !selects({ status }))
}

check('an auto-completed session is skipped (reviews API rejects it)',
  !selects({ autoCompleted: true }))

check('a disputed session is skipped', !selects({ disputeId: 'dp_1' }))

/* ───── notification prefs ───── */

check('a client who opted out of booking notifications is skipped',
  !selects({ studentPrefs: { BOOKING_CREATED: false } }))

check('an unrelated opt-out does not suppress the nudge',
  selects({ studentPrefs: { MESSAGE_NEW: false } }))

check('junk prefs fall back to enabled', selects({ studentPrefs: 'not-an-object' }))

/* ───── the delay window, both ends ───── */

check('a session that ended 1 min ago is too fresh',
  !selects({ endedHoursAgo: 1 / 60 }))

check(`a session that ended just under ${REVIEW_NUDGE_DELAY_HOURS}h ago is too fresh`,
  !selects({ endedHoursAgo: REVIEW_NUDGE_DELAY_HOURS - 0.01 }))

check(`a session that ended just over ${REVIEW_NUDGE_DELAY_HOURS}h ago qualifies`,
  selects({ endedHoursAgo: REVIEW_NUDGE_DELAY_HOURS + 0.01 }))

check(`a session that ended ${REVIEW_NUDGE_MAX_AGE_DAYS} days + 1h ago is too stale`,
  !selects({ endedHoursAgo: REVIEW_NUDGE_MAX_AGE_DAYS * 24 + 1 }))

check('a session still inside the max-age window qualifies',
  selects({ endedHoursAgo: REVIEW_NUDGE_MAX_AGE_DAYS * 24 - 1 }))

// The delay is measured from the session END, not its start: a 4h session that
// STARTED 5h ago only ended 1h ago and must still wait.
check('the delay is measured from the session end, not its start',
  selectReviewNudges([{
    ...candidate(),
    durationMin: 240,
    startAt: new Date(NOW.getTime() - 5 * HOUR),
  }], NOW).length === 0)

check('a corrupt duration is dropped, not thrown',
  !selects({ durationMin: Number.NaN }))

/* ───── the folded-in rebook line ───── */

check('rebook line is offered when nothing is booked with that expert',
  shouldPromptRebook(candidate()) === true)

check('a client with an upcoming booking with that expert gets NO rebook line',
  shouldPromptRebook(candidate({ hasUpcomingWithTutor: true })) === false)

check('an upcoming booking does not suppress the review nudge itself',
  selects({ hasUpcomingWithTutor: true }))

/* ───── constants stay sane (a typo here emails people at the wrong time) ───── */

check('delay sits in the 2–24h band',
  REVIEW_NUDGE_DELAY_HOURS >= 2 && REVIEW_NUDGE_DELAY_HOURS <= 24)
check('max age stays well inside the 30-day review window and the 120-day notification prune',
  REVIEW_NUDGE_MAX_AGE_DAYS > 0 && REVIEW_NUDGE_MAX_AGE_DAYS < 30 &&
  REVIEW_NUDGE_MAX_AGE_DAYS * DAY < 120 * DAY)

/* ───── summary ───── */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

/* ── Quiet hours (Tbilisi UTC+4) ─────────────────────────────────────────────
   A session ending late must not produce a 02:00 email; the next cron tick
   after 08:00 picks it up instead. */
{
  const at = (iso: string) => new Date(iso)
  // 23:00 Tbilisi = 19:00 UTC
  check('quiet: 23:00 Tbilisi is quiet', isQuietHour(at('2026-07-27T19:00:00Z')), 'night sends must be suppressed')
  // 02:00 Tbilisi = 22:00 UTC previous day
  check('quiet: 02:00 Tbilisi is quiet', isQuietHour(at('2026-07-26T22:00:00Z')), 'night sends must be suppressed')
  // 09:00 Tbilisi = 05:00 UTC
  check('quiet: 09:00 Tbilisi is NOT quiet', !isQuietHour(at('2026-07-27T05:00:00Z')), 'morning must send')
  // 21:59 Tbilisi = 17:59 UTC
  check('quiet: 21:59 Tbilisi is NOT quiet', !isQuietHour(at('2026-07-27T17:59:00Z')), 'boundary before 22:00 still sends')
  check('quiet: tbilisiHour is UTC+4, not server-local', tbilisiHour(at('2026-07-27T05:00:00Z')) === 9, 'must not use getHours()')
}
