// Unit tests for lib/expertEscalation.ts — which unanswered booking request
// escalates to the expert, and at which stage.
//
// Run: npx tsx tests/expert-escalation.test.ts
//
// Pure unit test (no browser, no dev server, no DB, no mail), in the style of
// tests/post-session.test.ts. `selectExpertEscalations` is the authority — the
// SQL in sendExpertRequestEscalations is only a looser prefilter — so these
// cases pin the rules that decide whether a real expert is emailed:
//
//   1. A live, unanswered request inside a stage threshold IS selected.
//   2. Answered / cancelled / reschedule-pending / past-start requests are NOT.
//   3. The deadline is min(createdAt + TTL, startAt) — a short-notice request
//      escalates against its OWN start time, not a nominal 24h window.
//   4. Exactly-once per stage: a stage already claimed is never re-sent.
//   5. Most-urgent-crossed-stage wins, and the passed-over stage never fires
//      later (nobody gets a „12 საათი დარჩა" mail after the „3 საათი" one).
//   6. Nothing goes out inside the first MIN_AGE_MIN of the request's life.
//
// Every fixture is a fixed instant — no Date.now(), no Math.random().

import {
  selectExpertEscalations,
  cancelDeadline,
  remainingText,
  escalationNotificationId,
  ESCALATION_STAGES,
  PREPARING_TTL_HOURS,
  MIN_AGE_MIN,
  type EscalationCandidate,
  type StageKey,
} from '../lib/expertEscalation'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ───── fixtures ───── */

const NOW = new Date(Date.UTC(2026, 6, 28, 10, 0))
const HOUR = 3600_000

// `hoursLeft` = how long until the auto-cancel deadline, expressed through
// createdAt (the common case: startAt is far away, so createdAt + TTL wins).
// `startInHours` overrides where the SESSION time is the binding deadline.
function candidate(
  over: Partial<EscalationCandidate> & { hoursLeft?: number; ageHours?: number; startInHours?: number } = {},
): EscalationCandidate {
  const { hoursLeft = 6, ageHours, startInHours = 240, ...rest } = over
  const age = ageHours ?? PREPARING_TTL_HOURS - hoursLeft
  return {
    id: 'bk_1',
    topic: 'ბიზნეს-გეგმა',
    startAt: new Date(NOW.getTime() + startInHours * HOUR),
    createdAt: new Date(NOW.getTime() - age * HOUR),
    status: 'PREPARING',
    hasReschedule: false,
    tutorUserId: 'u_expert',
    tutorEmail: 'expert@example.com',
    tutorName: 'გიორგი',
    tutorPrefs: null,
    studentName: 'ნინო',
    sentStages: [],
    ...rest,
  }
}

const pick = (over: Parameters<typeof candidate>[0] = {}): StageKey | null => {
  const r = selectExpertEscalations([candidate(over)], NOW)
  return r.length ? r[0].stage : null
}

/* ───── the happy path ───── */

check('12h left → the first escalation', pick({ hoursLeft: 11 }) === 'h12')
check('3h left → the final escalation', pick({ hoursLeft: 2 }) === 'h3')
check('a fresh request with 20h left is not chased yet', pick({ hoursLeft: 20 }) === null)

check('each row of a mixed batch is judged independently',
  selectExpertEscalations([
    candidate({ id: 'a', hoursLeft: 11 }),
    candidate({ id: 'b', hoursLeft: 20 }),
    candidate({ id: 'c', hoursLeft: 2 }),
  ], NOW).map(e => `${e.row.id}:${e.stage}`).join(',') === 'a:h12,c:h3')

/* ───── requests that must never be chased ───── */

for (const status of ['CONFIRMED', 'CANCELED', 'COMPLETED', 'LIVE', 'NO_SHOW']) {
  check(`status ${status} is skipped (already answered)`, pick({ hoursLeft: 2, status }) === null)
}

check('a reschedule negotiation is skipped (it was answered)',
  pick({ hoursLeft: 2, hasReschedule: true }) === null)

check('a request whose session time already passed is skipped',
  pick({ hoursLeft: 2, startInHours: -1 }) === null)

check('a request already past its own deadline is skipped (cleanup cancels it)',
  pick({ hoursLeft: -0.5 }) === null)

/* ───── notification prefs ───── */

check('an expert who opted out of booking notifications is skipped',
  pick({ hoursLeft: 2, tutorPrefs: { BOOKING_CREATED: false } }) === null)
check('an unrelated opt-out does not suppress the escalation',
  pick({ hoursLeft: 2, tutorPrefs: { MESSAGE_NEW: false } }) === 'h3')
check('junk prefs fall back to enabled', pick({ hoursLeft: 2, tutorPrefs: 'not-an-object' }) === 'h3')

/* ───── the min-age guard (short-notice requests) ───── */

// Booked 2h before the session: BOTH thresholds are already crossed the second
// the request is created. Nothing may go out on top of the creation email.
check('a minutes-old short-notice request is not escalated',
  pick({ startInHours: 2, ageHours: 5 / 60 }) === null)
check(`the same request escalates once it is ${MIN_AGE_MIN} min old`,
  pick({ startInHours: 1, ageHours: MIN_AGE_MIN / 60 + 0.01 }) === 'h3')

/* ───── the deadline is min(createdAt + TTL, startAt) ───── */

check('the session time can be the binding deadline, not the 24h TTL',
  // 2h old, so the TTL leaves 22h — but the session starts in 2h.
  pick({ ageHours: 2, startInHours: 2 }) === 'h3')

check('cancelDeadline picks whichever comes first',
  cancelDeadline({ createdAt: new Date(NOW.getTime() - HOUR), startAt: new Date(NOW.getTime() + 2 * HOUR) })
    === NOW.getTime() + 2 * HOUR &&
  cancelDeadline({ createdAt: new Date(NOW.getTime() - HOUR), startAt: new Date(NOW.getTime() + 500 * HOUR) })
    === NOW.getTime() - HOUR + PREPARING_TTL_HOURS * HOUR)

/* ───── exactly-once per stage ───── */

check('a stage already claimed is never re-sent',
  pick({ hoursLeft: 11, sentStages: ['h12'] }) === null)
check('the final stage still fires after the first one was sent',
  pick({ hoursLeft: 2, sentStages: ['h12'] }) === 'h3')
check('both stages sent → nothing left to do',
  pick({ hoursLeft: 2, sentStages: ['h12', 'h3'] }) === null)

// The passed-over stage must NEVER fire afterwards: a request that was born
// inside the 3h band gets the final message and no belated „12h left" mail.
check('a skipped earlier stage never fires later',
  pick({ startInHours: 1, ageHours: 2, sentStages: ['h3'] }) === null)

check('the claim id is deterministic per booking AND per stage',
  escalationNotificationId('h12', 'bk_1') === escalationNotificationId('h12', 'bk_1') &&
  escalationNotificationId('h12', 'bk_1') !== escalationNotificationId('h3', 'bk_1') &&
  escalationNotificationId('h3', 'bk_1') !== escalationNotificationId('h3', 'bk_2'))

/* ───── the copy's remaining-time string is real, not the stage constant ───── */

check('remaining time is reported from the real clock',
  selectExpertEscalations([candidate({ hoursLeft: 2 })], NOW)[0].remainingMs === 2 * HOUR)
check('remainingText: whole hours', remainingText(3 * HOUR + 5 * 60_000) === 'დაახლოებით 3 საათი')
check('remainingText: under an hour never claims „0 საათი“',
  remainingText(35 * 60_000) === 'ერთ საათზე ნაკლები')

/* ───── constants stay sane (a typo here mails experts at the wrong time) ───── */

check('stages are ordered least → most urgent',
  ESCALATION_STAGES.every((s, i) => i === 0 || s.hoursLeft < ESCALATION_STAGES[i - 1].hoursLeft))
check('every stage sits strictly inside the TTL window',
  ESCALATION_STAGES.every(s => s.hoursLeft > 0 && s.hoursLeft < PREPARING_TTL_HOURS))
check('at most two escalations — three emails total per request, including the creation ping',
  ESCALATION_STAGES.length === 2)
check('the min-age guard is at least half an hour', MIN_AGE_MIN >= 30)

/* ───── summary ───── */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
