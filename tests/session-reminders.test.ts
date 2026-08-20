// Unit tests for the notification-gap work: the imminent („starting soon")
// session reminder, the deterministic claim key it dedupes on, and the rule that
// every time string leaving the server carries an explicit Tbilisi label.
//
// Run: npx tsx tests/session-reminders.test.ts
//
// Pure unit test (no browser, no dev server, no DB, no mail), in the style of
// tests/availability.test.ts and tests/post-session.test.ts. What it pins:
//
//   1. WINDOW ARITHMETIC. With a sweep every N minutes and a window of W, the
//      delivered lead is always in (W−N, W] — and EVERY session gets exactly one
//      delivery, none fall between two ticks. Simulated over a whole day at
//      one-minute resolution, so a change to IMMINENT_WINDOW_MIN that opens a
//      gap (or that makes the imminent mail collide with the ~1h one) fails here.
//   2. DEDUPE-KEY SHAPE. The claim id is deterministic in (recipient, booking,
//      startAt epoch) — same inputs collide (no double send), a different
//      recipient/booking does not, and a MOVED startAt does not, which is what
//      makes a rescheduled booking re-arm itself with no reset step.
//   3. PREF GATE. The raw INSERT bypasses notify(), so imminentTargets must do
//      the opt-out filtering itself, per recipient.
//   4. TIMEZONE LABEL. Every template renders its time WITH the zone, and no
//      file that emits a time string still calls fmtKaDateTime directly.
//   5. ESCAPING + honesty. Hostile names/topics/reasons come out escaped, CTAs
//      are absolute, subjects carry no CR/LF, and the imminent message never
//      states a number of minutes.
//
// Every fixture is a fixed instant — no Date.now(), no Math.random().

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  IMMINENT_WINDOW_MIN,
  imminentNotificationId,
  imminentTargets,
} from '../lib/sessionReminders'
import {
  TZ_LABEL,
  fmtWhenTz,
  bookingChangedEmail,
  sessionImminentEmail,
  sessionReminderEmail,
  type BookingChangeKind,
} from '../lib/emailTemplates'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ───── 1. window arithmetic ────────────────────────────────────────────────── */

// The live cron cadence. The 1h window is the constant in lib/sessionReminders'
// SQL; kept here as the number the imminent window must not collide with.
const SWEEP_MIN = 15
const HOUR_WINDOW_MIN = 65

/** First tick (multiple of SWEEP_MIN, within the simulated day) at which a
 *  session starting at `startMin` falls inside a `window`-minute selection.
 *  Returns the delivered lead time, or null if no tick ever picks it up. */
function firstDeliveryLead(startMin: number, windowMin: number): number | null {
  for (let tick = 0; tick <= startMin; tick += SWEEP_MIN) {
    if (startMin > tick && startMin - tick <= windowMin) return startMin - tick
  }
  return null
}

{
  const W = IMMINENT_WINDOW_MIN
  let missed = 0
  let outOfBand = 0
  let minGap = Infinity
  // Every start minute of a day, far enough in that both windows have had ticks.
  for (let startMin = 120; startMin < 24 * 60; startMin++) {
    const lead = firstDeliveryLead(startMin, W)
    if (lead === null) { missed++; continue }
    if (!(lead > W - SWEEP_MIN && lead <= W)) outOfBand++
    const hourLead = firstDeliveryLead(startMin, HOUR_WINDOW_MIN)
    if (hourLead !== null) minGap = Math.min(minGap, hourLead - lead)
  }
  check('imminent: every session is picked up (no gap between ticks)', missed === 0, `${missed} missed`)
  check(`imminent: delivered lead always in (${W - SWEEP_MIN}, ${W}]`, outOfBand === 0, `${outOfBand} out of band`)
  check('imminent: window is 20 min → 5–20 min lead on the */15 sweep', W === 20)
  // The two reminders must not read as a duplicate send. Subjects differ (below);
  // this pins that they are also far apart in TIME.
  check('imminent: never lands within 30 min of the ~1h reminder', minGap >= 30, `min gap ${minGap} min`)
}

{
  // A session already past its start is never selected — the sweep's SQL bounds
  // `startAt > NOW()`, and the pure helper agrees.
  check('imminent: a session in the past is never delivered', firstDeliveryLead(0, IMMINENT_WINDOW_MIN) === null)
}

/* ───── 2. dedupe-key shape ─────────────────────────────────────────────────── */

const T0 = new Date('2026-07-28T09:00:00.000Z')
const T1 = new Date('2026-07-28T11:30:00.000Z') // the same booking, rescheduled

{
  const a = imminentNotificationId('user_1', 'bk_1', T0)
  const b = imminentNotificationId('user_1', 'bk_1', new Date(T0.getTime()))
  check('key: deterministic for the same (recipient, booking, startAt)', a === b, `${a} vs ${b}`)
  check('key: differs per recipient', a !== imminentNotificationId('user_2', 'bk_1', T0))
  check('key: differs per booking', a !== imminentNotificationId('user_1', 'bk_2', T0))
  check('key: a moved startAt re-arms the reminder', a !== imminentNotificationId('user_1', 'bk_1', T1))
  check('key: carries the startAt epoch in seconds', a.includes(String(Math.floor(T0.getTime() / 1000))), a)
  check('key: namespaced so it cannot collide with review-nudge ids', a.startsWith('session-soon:') && !a.startsWith('review-nudge:'), a)
  // Sub-second jitter must not produce two different keys for one session.
  check(
    'key: stable across sub-second precision',
    a === imminentNotificationId('user_1', 'bk_1', new Date(T0.getTime() + 400)),
  )
}

/* ───── 3. per-recipient pref gate ──────────────────────────────────────────── */

const baseRow = {
  id: 'bk_1',
  startAt: T0,
  topic: 'ბიზნესის სტრატეგია',
  student_id: 'u_student',
  student_email: 'student@example.com',
  student_name: 'ნინო',
  student_prefs: null as unknown,
  tutor_user_id: 'u_tutor',
  tutor_email: 'tutor@example.com',
  tutor_name: 'გიორგი',
  tutor_prefs: null as unknown,
}

{
  const both = imminentTargets([{ ...baseRow }])
  check('prefs: default (no prefs row) reminds both parties', both.length === 2, String(both.length))
  check('prefs: each side is deep-linked to its own space',
    both.some(t => t.href.startsWith('/me/bookings/')) && both.some(t => t.href.startsWith('/work/bookings/')))
  check('prefs: counterpart is the OTHER person for each recipient',
    both.find(t => t.userId === 'u_student')?.counterpartName === 'გიორგი' &&
    both.find(t => t.userId === 'u_tutor')?.counterpartName === 'ნინო')

  const studentOut = imminentTargets([{ ...baseRow, student_prefs: { BOOKING_CREATED: false } }])
  check('prefs: an opted-out client is dropped, the expert still gets it',
    studentOut.length === 1 && studentOut[0].userId === 'u_tutor', JSON.stringify(studentOut.map(t => t.userId)))

  const noneIn = imminentTargets([{
    ...baseRow,
    student_prefs: { BOOKING_CREATED: false },
    tutor_prefs: { BOOKING_CREATED: false },
  }])
  check('prefs: both opted out → nothing is claimed or sent', noneIn.length === 0)

  const junk = imminentTargets([{ ...baseRow, student_prefs: 'nonsense', tutor_prefs: ['x'] }])
  check('prefs: junk JSON falls back to enabled (never throws)', junk.length === 2)

  // A missing email must still claim the in-app notification — it is the
  // dedupe stamp; only the mail step is skipped.
  const noMail = imminentTargets([{ ...baseRow, student_email: null }])
  check('prefs: a party with no email still gets the in-app claim', noMail.length === 2 && noMail.some(t => t.email === null))
}

/* ───── 4. every emitted time string carries the timezone ───────────────────── */

const WHEN = fmtWhenTz(T0, { year: true })

{
  check('tz: fmtWhenTz appends the Tbilisi label', WHEN.includes(TZ_LABEL), WHEN)
  check('tz: label is Georgian, not an abbreviation', TZ_LABEL === 'თბილისის დროით', TZ_LABEL)

  const imminent = sessionImminentEmail({ counterpartName: 'გიორგი', topic: 'თემა', whenText: WHEN, href: '/me/bookings/bk_1' })
  check('tz: imminent email prints the labelled time', imminent.html.includes(TZ_LABEL))

  const reminder = sessionReminderEmail({ name: 'ნინო', counterpartName: 'გიორგი', topic: 'თემა', whenText: WHEN, durationText: '60 წუთი', href: '/me/bookings/bk_1' })
  check('tz: ~1h reminder prints the labelled time', reminder.html.includes(TZ_LABEL))
  // The detail table gained the counterpart + the length (they were missing).
  check('reminder: detail table names the counterpart', reminder.html.includes('ვისთან') && reminder.html.includes('გიორგი'))
  check('reminder: detail table states the duration', reminder.html.includes('ხანგრძლივობა') && reminder.html.includes('60 წუთი'))

  const kinds: BookingChangeKind[] = [
    'request_sent', 'declined', 'canceled', 'no_show',
    'reschedule_proposed', 'reschedule_accepted', 'reschedule_rejected',
  ]
  const missingTz = kinds.filter(k => !bookingChangedEmail(k, {
    counterpartName: 'გიორგი', topic: 'თემა', whenText: WHEN, newWhenText: WHEN,
    href: '/me/bookings/bk_1',
  }).html.includes(TZ_LABEL))
  check('tz: every bookingChangedEmail kind prints the labelled time', missingTz.length === 0, missingTz.join(', '))
}

{
  // Source-level guard: a file that emits a time to a person must go through
  // fmtWhenTz. A bare fmtKaDateTime there is the silent 4-hour bug this pass
  // removed, and it would come back the next time someone copies a nearby line.
  const root = join(__dirname, '..')
  const owned = [
    'lib/sessionReminders.ts',
    'app/api/bookings/route.ts',
    'app/api/bookings/[id]/route.ts',
    'app/api/bookings/[id]/cancel/route.ts',
    'app/api/bookings/[id]/reschedule/route.ts',
    'app/api/bookings/[id]/reschedule/respond/route.ts',
  ]
  const offenders = owned.filter(p => /\bfmtKaDateTime\s*\(/.test(readFileSync(join(root, p), 'utf8')))
  check('tz: no outbound file calls fmtKaDateTime directly', offenders.length === 0, offenders.join(', '))
}

/* ───── 5. escaping, absolute links, honest copy ────────────────────────────── */

const XSS = '<script>alert(1)</script>'

{
  const evil = bookingChangedEmail('canceled', {
    counterpartName: XSS,
    topic: `"><img src=x onerror=alert(1)>`,
    whenText: WHEN,
    actorLabel: XSS,
    reason: XSS,
    note: XSS,
    href: '/me/bookings/bk_1',
  })
  check('esc: no raw <script> survives into the html', !evil.html.includes('<script'), evil.html.slice(0, 200))
  check('esc: hostile input is entity-encoded', evil.html.includes('&lt;script&gt;'))
  check('esc: no raw onerror attribute survives', !/onerror=/.test(evil.html.replace(/&#39;|&quot;/g, '')) || evil.html.includes('&lt;img'))

  const all: BookingChangeKind[] = [
    'request_sent', 'declined', 'canceled', 'no_show',
    'reschedule_proposed', 'reschedule_accepted', 'reschedule_rejected',
  ]
  const built = all.map(k => bookingChangedEmail(k, {
    counterpartName: 'გიორგი', topic: 'თემა', whenText: WHEN, newWhenText: WHEN, href: '/me/bookings/bk_1',
  }))
  check('cta: every link is absolute (BASE + href)',
    built.every(b => b.html.includes('https://mcodne.ge/me/bookings/bk_1')))
  check('subject: no CR/LF in any subject', built.every(b => !/[\r\n]/.test(b.subject)))
  check('subject: every kind has its own subject', new Set(built.map(b => b.subject)).size === all.length)
}

{
  const imminent = sessionImminentEmail({ counterpartName: 'გიორგი', topic: 'თემა', whenText: WHEN, href: '/me/bookings/bk_1' })
  const hour = sessionReminderEmail({ name: 'ნინო', counterpartName: 'გიორგი', topic: 'თემა', whenText: WHEN, href: '/me/bookings/bk_1' })
  check('subject: the imminent mail is not mistakable for the ~1h one', imminent.subject !== hour.subject, imminent.subject)
  check('subject: the imminent subject shares no leading words with the ~1h one',
    imminent.subject.split(' ')[0] !== hour.subject.split(' ')[0])
  // „5 წუთში" would be wrong for most recipients (the lead is a 5–20 min band).
  check('honesty: the imminent mail never states a number of minutes',
    !/წუთში/.test(imminent.html) && !/\d+\s*წუთ/.test(imminent.subject), imminent.subject)
  check('honesty: the imminent subject carries no digits at all', !/\d/.test(imminent.subject), imminent.subject)
}

/* ───── summary ─────────────────────────────────────────────────────────────── */

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
