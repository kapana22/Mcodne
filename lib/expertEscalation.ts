import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { expertRequestEscalationEmail, fmtWhenTz } from '@/lib/emailTemplates'
import { normalizePrefs } from '@/lib/notify'
import { ensureDbReady } from '@/lib/dbBoot'

// Escalating reminders to the EXPERT while a booking request is still alive.
//
// THE LEAK THIS CLOSES. A request sits in PREPARING until the expert answers.
// If nobody answers it auto-cancels (app/api/internal/cleanup/route.ts) — and
// until now the expert was pinged exactly ONCE, at creation (bookingRequestEmail
// from the booking route). One missed email = one client who tried, got no
// reply, and left. In-app alone reaches nobody: there is no push, and the
// notification poll only runs in an already-open tab.
//
// THE DEADLINE IS NOT ALWAYS 24h. cleanup cancels a PREPARING booking when
// EITHER deadline passes, whichever is first: `createdAt + PREPARING_TTL_HOURS`
// or `startAt` itself (a request never answered before its own session time is
// dead regardless of age). So every schedule decision below is expressed as time
// remaining until `min(createdAt + TTL, startAt)` — never as "hours since
// creation", which would silently mis-time every short-notice request.
//
// THE SCHEDULE — two stages, no more.
//   · 12h left — the midpoint of a normal 24h window. Still a full half-day to
//     answer, so it is a nudge, not an alarm.
//   · 3h left — the last moment where answering still changes the outcome.
// Two is a deliberate ceiling: with the creation email that is at most THREE
// emails per request. A third escalation would buy minutes of extra notice and
// cost the expert's trust in every future notification.
//
// MIN_AGE_MIN guards short-notice requests. A client can book a session two
// hours out, which means the request is born with less than 3h of life — both
// thresholds are already crossed at creation and the expert would get the
// creation email plus an escalation within the same minute. Nothing may go out
// until the request is at least an hour old.
//
// ONE STAGE PER TICK, MOST URGENT WINS. `remaining` only ever decreases, so the
// crossed stage only ever advances. We send the MOST urgent crossed stage that
// hasn't been sent and never look back — a request that was born with 2h left
// gets the „3h" message and never the (by then nonsensical) „12h" one.
//
// NO QUIET HOURS — deliberately unlike lib/postSession. A review nudge held
// until morning costs nothing; this deadline is hard, and a request with 3h left
// at 01:00 is simply gone by 08:00. Silence is the expensive option here.
//
// EXACTLY-ONCE WITHOUT A SCHEMA COLUMN. Same claim as lib/postSession: the
// in-app notification is an artifact we must write anyway, its id is
// DETERMINISTIC (`expert-nudge:<stage>:<bookingId>`), and the insert is
// `ON CONFLICT (id) DO NOTHING RETURNING id`. The primary key arbitrates — of
// two overlapping sweeps exactly one gets the row back, and only that one
// emails. Candidates are bounded to requests created in the last 48h, so the
// 120-day notification prune can never resurrect a stage.

/** Mirrors the PREPARING auto-cancel TTL. The cleanup route imports THIS
 *  constant rather than keeping its own copy — if the two ever drifted, the
 *  escalations would be timed against a deadline that no longer exists. */
export const PREPARING_TTL_HOURS = 24

/** Nothing goes out until the request is this old — see MIN_AGE note above. */
export const MIN_AGE_MIN = 60

export type StageKey = 'h12' | 'h3'

/** Ordered least → most urgent. `hoursLeft` is the threshold on time remaining
 *  before the auto-cancel deadline. */
export const ESCALATION_STAGES: { key: StageKey; hoursLeft: number }[] = [
  { key: 'h12', hoursLeft: 12 },
  { key: 'h3', hoursLeft: 3 },
]

// One prefix shared by the id builder and the SQL join below — if they drift,
// the dedupe silently stops deduping and experts get the same nudge every 15 min.
const NUDGE_ID_PREFIX = 'expert-nudge:'
export const escalationNotificationId = (stage: StageKey, bookingId: string) =>
  `${NUDGE_ID_PREFIX}${stage}:${bookingId}`

// A booking request is a booking-lifecycle event, so it honours the same
// BOOKING_CREATED toggle the creation notification does.
const PREF_KEY = 'BOOKING_CREATED' as const

export type EscalationCandidate = {
  id: string
  topic: string
  startAt: Date
  createdAt: Date
  status: string
  /** A pending reschedule proposal also forces PREPARING. That booking WAS
   *  answered — it's a negotiation, and the party who must act may be the
   *  client. „Answer or it disappears" would be plainly wrong copy. */
  hasReschedule: boolean
  tutorUserId: string
  tutorEmail: string | null
  tutorName: string | null
  tutorPrefs: unknown
  studentName: string | null
  /** Stages already claimed for this booking. */
  sentStages: StageKey[]
}

export type Escalation = {
  row: EscalationCandidate
  stage: StageKey
  /** Milliseconds left before the auto-cancel deadline, at send time. */
  remainingMs: number
}

/** The auto-cancel deadline cleanup will enforce: whichever comes first. */
export function cancelDeadline(r: Pick<EscalationCandidate, 'createdAt' | 'startAt'>): number {
  return Math.min(
    new Date(r.createdAt).getTime() + PREPARING_TTL_HOURS * 3600_000,
    new Date(r.startAt).getTime(),
  )
}

/** „დაახლოებით 3 საათი" · „ერთ საათზე ნაკლები". Always computed from the real
 *  remaining time — the copy states how long is left, so it must never be a
 *  hard-coded number that the stage threshold only approximates. */
export function remainingText(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 60) return 'ერთ საათზე ნაკლები'
  return `დაახლოებით ${Math.floor(min / 60)} საათი`
}

/**
 * Pure selection rules — the authority on which expert gets nudged, at which
 * stage. The SQL in sendExpertRequestEscalations is a deliberately looser
 * prefilter; every rule is re-checked here on real values, and this is what
 * tests/expert-escalation.test.ts pins.
 */
export function selectExpertEscalations(rows: EscalationCandidate[], now: Date): Escalation[] {
  const nowMs = now.getTime()
  const minAgeMs = MIN_AGE_MIN * 60_000
  const out: Escalation[] = []
  for (const r of rows) {
    // Already answered (CONFIRMED/CANCELED/anything else) → nothing to chase.
    if (r.status !== 'PREPARING') continue
    if (r.hasReschedule) continue
    // Past its own start time the request is dead; cleanup cancels it this tick.
    if (new Date(r.startAt).getTime() <= nowMs) continue
    if (!normalizePrefs(r.tutorPrefs)[PREF_KEY]) continue

    const deadline = cancelDeadline(r)
    if (!Number.isFinite(deadline)) continue
    const remainingMs = deadline - nowMs
    if (remainingMs <= 0) continue // already expired — cleanup's job, not ours
    if (nowMs - new Date(r.createdAt).getTime() < minAgeMs) continue

    // Most urgent crossed stage (the list is ordered least → most urgent).
    let stage: StageKey | null = null
    for (const s of ESCALATION_STAGES) {
      if (remainingMs <= s.hoursLeft * 3600_000) stage = s.key
    }
    if (!stage) continue
    if (r.sentStages.includes(stage)) continue

    out.push({ row: r, stage, remainingMs })
  }
  return out
}

export async function sendExpertRequestEscalations(): Promise<{ bookings: number; emails: number }> {
  // `notificationPrefs` and `rescheduleRequest` are dbBoot-added columns read by
  // raw SQL below — same guard as the sibling sweeps, cached after first call.
  await ensureDbReady()

  const now = new Date()
  // Prefilter: live requests only. A genuine PREPARING request is at most
  // PREPARING_TTL_HOURS old, so the 48h bound is pure slack that keeps the scan
  // on the (status, startAt) index and far from the notification prune.
  // Opted-out experts are dropped here (text comparison, never a ::boolean cast
  // — it mirrors normalizePrefs and can't throw on junk); they would never be
  // claimed and would otherwise re-appear in every scan.
  const rows = await prisma.$queryRawUnsafe<(Omit<EscalationCandidate, 'sentStages'> & { sentH12: boolean; sentH3: boolean })[]>(`
    SELECT b.id, b.topic, b."startAt", b."createdAt",
           b.status::text                     AS "status",
           (b."rescheduleRequest" IS NOT NULL) AS "hasReschedule",
           tp."userId"                        AS "tutorUserId",
           tu.email                           AS "tutorEmail",
           tu."fullName"                      AS "tutorName",
           tu."notificationPrefs"             AS "tutorPrefs",
           su."fullName"                      AS "studentName",
           (n12.id IS NOT NULL)               AS "sentH12",
           (n3.id IS NOT NULL)                AS "sentH3"
    FROM "Booking" b
    JOIN "TutorProfile" tp ON tp.id = b."tutorId"
    JOIN "User" tu ON tu.id = tp."userId"
    JOIN "User" su ON su.id = b."studentId"
    LEFT JOIN "Notification" n12 ON n12.id = '${NUDGE_ID_PREFIX}h12:' || b.id
    LEFT JOIN "Notification" n3  ON n3.id  = '${NUDGE_ID_PREFIX}h3:'  || b.id
    WHERE b.status = 'PREPARING'
      AND b."rescheduleRequest" IS NULL
      AND b."startAt" > NOW()
      AND b."createdAt" > NOW() - interval '48 hours'
      AND b."createdAt" < NOW() - interval '${MIN_AGE_MIN} minutes'
      AND COALESCE(tu."notificationPrefs"->>'${PREF_KEY}', 'true') <> 'false'
      AND NOT (n12.id IS NOT NULL AND n3.id IS NOT NULL)
    LIMIT 200
  `)

  const candidates: EscalationCandidate[] = rows.map(r => ({
    ...r,
    sentStages: [
      ...(r.sentH12 ? (['h12'] as StageKey[]) : []),
      ...(r.sentH3 ? (['h3'] as StageKey[]) : []),
    ],
  }))

  const due = selectExpertEscalations(candidates, now)
  if (due.length === 0) return { bookings: 0, emails: 0 }

  // Claim + deliver the in-app half in ONE statement. The deterministic id is
  // the dedupe key, so a losing concurrent sweep gets nothing back and stays
  // silent. Raw SQL rather than notify(), which generates a random id — there
  // would be no key to conflict on. The pref gate notify() applies is enforced
  // above (both in SQL and in selectExpertEscalations).
  const hrefFor = (id: string) => `/work/bookings/${id}`
  const titleFor = (stage: StageKey) =>
    stage === 'h3' ? 'ბოლო შეხსენება — მოთხოვნა მალე გაუქმდება' : 'ჯავშნის მოთხოვნა შენს პასუხს ელოდება'
  const bodyFor = (e: Escalation) =>
    `${e.row.topic} · ${fmtWhenTz(new Date(e.row.startAt), { year: true })} — დარჩა ${remainingText(e.remainingMs)}; პასუხის გარეშე ავტომატურად გაუქმდება`

  const claimed = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "Notification" (id, "userId", "type", title, body, href)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
       AS t(id, "userId", "type", title, body, href)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    due.map(e => escalationNotificationId(e.stage, e.row.id)),
    due.map(e => e.row.tutorUserId),
    due.map(() => 'BOOKING_CREATED'),
    due.map(e => titleFor(e.stage)),
    due.map(e => bodyFor(e)),
    due.map(e => hrefFor(e.row.id)),
  )
  const claimedIds = new Set(claimed.map(c => c.id))
  const claimedRows = due.filter(e => claimedIds.has(escalationNotificationId(e.stage, e.row.id)))

  let emails = 0
  for (const e of claimedRows) {
    if (!e.row.tutorEmail) continue
    const { subject, html } = expertRequestEscalationEmail({
      expertName: e.row.tutorName || '',
      studentName: e.row.studentName || 'კლიენტი',
      topic: e.row.topic,
      whenText: fmtWhenTz(new Date(e.row.startAt), { year: false }),
      leftText: remainingText(e.remainingMs),
      final: e.stage === 'h3',
      href: hrefFor(e.row.id),
    })
    // Count only what actually went out — sendMail RESOLVES with { ok: false }
    // on a provider error, so a bare .then() would report failures as sent.
    await sendMail({ to: e.row.tutorEmail, subject, html }).then(res => { if (res.ok) emails++ }).catch(() => {})
  }

  return { bookings: claimedRows.length, emails }
}
