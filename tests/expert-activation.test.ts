/* Activation-nudge rules (lib/expertActivation).
 *
 * WHY THIS FILE EXISTS. A production audit on 2026-07-29 found 7 of 10 visible
 * experts unbookable — 6 with no availability, 1 with no service. The nudge is
 * the fix, but a nudge that misfires is worse than none: it either spams people
 * who did nothing wrong or stays silent about the ones who need it. These are
 * the rules that decide, pinned on pure values so they can be checked without a
 * database.
 */
import { selectActivationNudges, dueStage, activationNotificationId, lapseBucket, LAPSE_BUCKET_DAYS, STAGE_DAYS, type ActivationCandidate } from '../lib/expertActivation'

let passed = 0, failed = 0
const check = (name: string, ok: boolean, why = '') => {
  if (ok) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${why ? ` — ${why}` : ''}`) }
}

const DAY = 86_400_000
// 12:00 Tbilisi (= 08:00 UTC) — comfortably outside quiet hours, so the quiet
// gate never accidentally makes an assertion pass by returning [].
const NOW = new Date('2026-07-29T08:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY)

const base: ActivationCandidate = {
  tutorProfileId: 'tp1',
  userId: 'u1',
  email: 'e@x.ge',
  fullName: 'ანა',
  prefs: null,
  createdAt: daysAgo(30),
  futureSlotCount: 0,
  serviceCount: 1,
  available: true,
  suspended: false,
}
const one = (over: Partial<ActivationCandidate> = {}) => selectActivationNudges([{ ...base, ...over }], NOW)

// ── who gets nudged ─────────────────────────────────────────────────────────
check('A1: no availability → a „slots" nudge',
  one().length === 1 && one()[0].blocker === 'slots')

check('A2: no service → a „service" nudge, and never a slots one',
  one({ serviceCount: 0 }).length === 1 && one({ serviceCount: 0 })[0].blocker === 'service')

check('A3: missing BOTH → only the service nudge (times are worthless with nothing to sell)',
  one({ serviceCount: 0, futureSlotCount: 0 }).length === 1 && one({ serviceCount: 0, futureSlotCount: 0 })[0].blocker === 'service',
  'two emails for one broken setup is the definition of spam')

check('A4: a fully set-up expert is never nudged',
  one({ futureSlotCount: 5, serviceCount: 2 }).length === 0)

// ── who is left alone ───────────────────────────────────────────────────────
check('A5: a SELF-paused expert is not chased',
  one({ available: false }).length === 0,
  'they turned their listing off on purpose — „add your times" is nagging')

check('A6: a suspended account is never emailed',
  one({ suspended: true }).length === 0,
  'suspension is an admin decision; the product must not talk over it')

check('A7: opting out of APPLICATION_STATUS silences it',
  one({ prefs: { APPLICATION_STATUS: false } }).length === 0)

check('A8: an unrelated opt-out does NOT silence it',
  one({ prefs: { MESSAGE_NEW: false } }).length === 1)

// ── timing ──────────────────────────────────────────────────────────────────
check('A9: nothing before the first stage comes due',
  one({ createdAt: daysAgo(STAGE_DAYS[0] - 0.5) }).length === 0)

check('A10: exactly ONE nudge per tick, never a burst',
  one({ createdAt: daysAgo(365) }).length === 1,
  'an expert approved long ago must not receive all three stages at once')

check('A11: the stage sent is the LATEST one due',
  dueStage(daysAgo(365), NOW)?.stage === STAGE_DAYS[STAGE_DAYS.length - 1] &&
  dueStage(daysAgo(2), NOW)?.stage === STAGE_DAYS[0])

check('A12: the last SERVICE stage is marked final (the copy stops and says so)',
  one({ serviceCount: 0, createdAt: daysAgo(365) })[0].isFinal === true &&
  one({ serviceCount: 0, createdAt: daysAgo(2) })[0].isFinal === false)

// ── quiet hours ─────────────────────────────────────────────────────────────
// 03:00 Tbilisi = 23:00 UTC the day before.
check('A13: nothing goes out during quiet hours',
  selectActivationNudges([base], new Date('2026-07-28T23:00:00.000Z')).length === 0)

// ── the dedupe key ──────────────────────────────────────────────────────────
check('A14: the notification id separates blocker AND key',
  activationNotificationId('slots', 1, 'tp1') !== activationNotificationId('slots', 4, 'tp1') &&
  activationNotificationId('slots', 1, 'tp1') !== activationNotificationId('service', 1, 'tp1') &&
  activationNotificationId('slots', 1, 'tp1') === activationNotificationId('slots', 1, 'tp1'),
  'the id IS the exactly-once stamp — a collision silently drops a nudge, a mismatch re-sends it forever')

check('A15: there are exactly three SERVICE stages, ascending',
  STAGE_DAYS.length === 3 && STAGE_DAYS.every((d, i) => i === 0 || d > STAGE_DAYS[i - 1]),
  'the schedule is a promise made in the final email („no more messages") — changing it silently breaks that')

/* ── the 2026-08-03 lapse fix ───────────────────────────────────────────────
 * Production had 6 listed experts with nothing bookable and 2 of them were
 * invisible to this module, because the candidate query counted ALL-TIME
 * availability rows. One of the two was the most-viewed profile on the site:
 * 42 windows published, every one of them in the past. These pin both halves of
 * the fix — the count is upcoming-only, and „empty calendar" recurs. */

check('B1: an expert whose windows have ALL EXPIRED is nudged',
  one({ futureSlotCount: 0, serviceCount: 2 }).length === 1 &&
  one({ futureSlotCount: 0, serviceCount: 2 })[0].blocker === 'slots',
  'the exact production case: 42 windows published, 0 upcoming, silently written off')

check('B2: the slots nudge NEVER claims to be final',
  one({ createdAt: daysAgo(365) })[0].isFinal === false &&
  one({ createdAt: daysAgo(2) })[0].isFinal === false,
  'it recurs — promising „no more messages" and then sending more is a lie')

check('B3: an expert who lapses long after every stage is still reachable',
  one({ createdAt: daysAgo(400) }).length === 1,
  'the whole point: windows expire by nature, so this state is entered AFTER setup ends')

check('B4: the slots key is the expert\'s own fortnight, and advances exactly one per 14 days',
  // NB: „same bucket for the next 13 days" is NOT a property and asserting it
  // is a mistake — `now` sits at an arbitrary point INSIDE a bucket, so the
  // next boundary can be tomorrow. What is guaranteed is the step size; the
  // spacing guarantee is B4b's job.
  one({ createdAt: daysAgo(30) })[0].key === lapseBucket(daysAgo(30), NOW) &&
  [0, 5, 30, 400].every(age =>
    lapseBucket(daysAgo(age), new Date(NOW.getTime() + LAPSE_BUCKET_DAYS * DAY))
      === lapseBucket(daysAgo(age), NOW) + 1),
  'the key must be derived from the expert, not from a shared calendar grid')

check('B4b: NO expert can be nudged twice inside 14 days, whatever their approval date',
  [0.1, 1, 3, 7, 13.9, 30, 200, 400].every(age => {
    const created = daysAgo(age)
    // Walk a fortnight in 6h steps; the bucket must change at most once.
    let changes = 0, prev = lapseBucket(created, NOW)
    for (let h = 6; h <= LAPSE_BUCKET_DAYS * 24; h += 6) {
      const b = lapseBucket(created, new Date(NOW.getTime() + h * 3_600_000))
      if (b !== prev) { changes++; prev = b }
    }
    return changes <= 1
  }),
  'this is the property the per-expert anchor buys — a global grid failed it')

check('B5: a bucket id can never collide with a stage id',
  activationNotificationId('slots', 1, 'tp1') !== 'expert-setup:slots:1:tp1' &&
  activationNotificationId('service', 1, 'tp1') === 'expert-setup:service:1:tp1',
  'production already holds expert-setup:slots:1:… rows — a collision would silently swallow the new nudge')

check('B6: still ONE message per expert per tick',
  one({ serviceCount: 0, futureSlotCount: 0 }).length === 1,
  'missing both blockers must not send two emails')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
