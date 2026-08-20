import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { reviewNudgeEmail } from '@/lib/emailTemplates'
import { normalizePrefs } from '@/lib/notify'
// fmtWhenTz, not fmtKaDateTime: every user-facing time string must carry the
// „(თბილისის დროით)" label. A bare „28 ივლ · 11:00" reads as local time to
// someone abroad and silently misstates the hour by 4.
import { fmtWhenTz } from '@/lib/emailTemplates'
import { ensureDbReady } from '@/lib/dbBoot'
import { tbilisiParts } from '@/lib/tz'

// Post-session follow-up for the CLIENT: a few hours after a session the expert
// closed as COMPLETED, nudge the client to review it — and, in the SAME message,
// invite them to book that expert again. Rides the */15 cleanup cron like the
// other reminder sweeps.
//
// ONE message, not two. The review nudge and the rebook prompt share the exact
// audience (the client of a just-finished session) and the exact moment, so a
// second email hours later would be the same „that session went well, didn't
// it?" thought delivered twice — which reads as marketing, not service. The
// review CTA stays the single button; the rebook line is one soft sentence
// underneath, and it is omitted entirely when the client already has an upcoming
// booking with that expert (nothing to invite them to).
//
// DELAY = 3h after the session ENDS. Long enough that the client is out of the
// call and has had a moment to form an opinion (and, since most experts click
// „დასრულებულია" right after the call, the nudge still lands the same day);
// short enough that the conversation is fresh. Anchoring on the session end —
// not on the COMPLETED transition — keeps the rule immutable: there is no
// completedAt column, and `updatedAt` moves on any later edit.
//
// EXACTLY-ONCE WITHOUT A NEW COLUMN. The other sweeps stamp a dedicated column
// (Booking.sessionReminderSentAt, Message.reminderEmailSentAt) and use the
// guarded UPDATE … WHERE stamp IS NULL … RETURNING id as the atomic claim. Here
// the in-app notification IS the artifact we have to write anyway, so it doubles
// as the stamp: its id is DETERMINISTIC (`review-nudge:<bookingId>`), and the
// insert is `ON CONFLICT (id) DO NOTHING RETURNING id`. The primary key does the
// arbitration — of two overlapping cron runs exactly one gets the row back, and
// only that run emails. Same guarantee as a stamp column, no schema change, and
// strictly stronger than the deterministic-href dedupe the cleanup route already
// uses for BOOKING_REMINDER (that one is check-then-insert, this one is atomic).
// The 120-day notification prune can't resurrect a nudge: candidates are bounded
// to sessions that ended within the last 7 days.

// Client-side of the pref split: this is a booking-lifecycle message, so it
// honors the BOOKING_CREATED toggle — the same one notify() applies to
// BOOKING_COMPLETED and the same one sessionReminders gates its email on.
const PREF_KEY = 'BOOKING_CREATED' as const

export const REVIEW_NUDGE_DELAY_HOURS = 3
// Upper bound on how stale a session may be. The reviews API keeps the window
// open for 30 days, but a „how did it go?" about a session from three weeks ago
// is noise — and if the expert only marks it complete that late, the moment has
// passed. Also keeps the candidate scan small and far away from the 120-day
// notification prune.
export const REVIEW_NUDGE_MAX_AGE_DAYS = 7
// Quiet hours, Tbilisi wall clock (fixed UTC+4, no DST). A session that ends at
// 23:00 would otherwise be nudged at 02:00 — a push and an email in the middle
// of the night for something that can perfectly well wait until morning. The
// cron runs every 15 min, so "not now" simply means the next tick after 08:00
// picks it up; nothing is lost as long as it is still inside the 7-day window.
const QUIET_FROM_H = 22
const QUIET_TO_H = 8
/** Tbilisi hour (0-23) for an instant — deliberately not `getHours()`, which
 *  would read the SERVER's timezone. Exported so the tests can pin it.
 *  The +4 arithmetic lives in lib/tz → tbilisiParts, which several server
 *  surfaces now need; this stays as the named question it answers here. */
export function tbilisiHour(d: Date): number {
  return tbilisiParts(d).hour
}
export function isQuietHour(d: Date): boolean {
  const h = tbilisiHour(d)
  return h >= QUIET_FROM_H || h < QUIET_TO_H
}
// Longest session we allow, mirrored from the cleanup route: `startAt + duration`
// can't be indexed, so the SQL bounds on startAt with this slack and the exact
// end-time arithmetic happens per row in selectReviewNudges.
const MAX_DURATION_MIN = 240

// One prefix, used by both the id builder and the SQL join below — they must
// never drift, or the dedupe silently stops deduping.
const NUDGE_ID_PREFIX = 'review-nudge:'
export const nudgeNotificationId = (bookingId: string) => `${NUDGE_ID_PREFIX}${bookingId}`

export type NudgeCandidate = {
  id: string
  topic: string
  startAt: Date
  durationMin: number
  status: string
  // Cron-closed sessions (nobody confirmed they happened) are NOT reviewable —
  // /api/reviews rejects them with AUTO_COMPLETED — so nudging would send the
  // client to a form that refuses them.
  autoCompleted: boolean
  reviewId: string | null
  disputeId: string | null
  alreadyNudged: boolean
  hasUpcomingWithTutor: boolean
  studentId: string
  studentEmail: string | null
  studentName: string | null
  studentPrefs: unknown
  tutorProfileId: string
  tutorName: string | null
}

// Pure selection rules — the authority on who gets nudged. The SQL below is a
// (deliberately looser) prefilter that keeps the scan indexable; every rule is
// re-checked here on real values, which is also what tests/post-session.test.ts
// pins.
export function selectReviewNudges(rows: NudgeCandidate[], now: Date): NudgeCandidate[] {
  const nowMs = now.getTime()
  const delayMs = REVIEW_NUDGE_DELAY_HOURS * 3600_000
  const maxAgeMs = REVIEW_NUDGE_MAX_AGE_DAYS * 24 * 3600_000
  // Nothing goes out at night — see QUIET_FROM_H. Checked once for the whole
  // batch (not per row): the send time is what matters, not the session time.
  if (isQuietHour(now)) return []
  return rows.filter(r => {
    // Only a genuinely finished session: CANCELED / NO_SHOW / still-open ones
    // never qualify, and a disputed one must not be asked for a rating while
    // an admin is still deciding what happened.
    if (r.status !== 'COMPLETED') return false
    if (r.autoCompleted) return false
    if (r.reviewId) return false
    if (r.disputeId) return false
    if (r.alreadyNudged) return false
    if (!normalizePrefs(r.studentPrefs)[PREF_KEY]) return false
    const end = new Date(r.startAt).getTime() + r.durationMin * 60_000
    if (!Number.isFinite(end)) return false
    if (end > nowMs - delayMs) return false   // still inside the quiet delay
    if (end < nowMs - maxAgeMs) return false  // too stale to be worth asking
    return true
  })
}

// The rebook line is folded into the review email, but only when there is
// nothing already on the books with that expert.
export function shouldPromptRebook(r: NudgeCandidate): boolean {
  return !r.hasUpcomingWithTutor
}

export async function sendPostSessionNudges(): Promise<{ bookings: number; emails: number }> {
  // The dbBoot-added columns this query reads (autoCompleted, notificationPrefs)
  // must exist before the raw SQL references them — same guard as the sibling
  // sweeps, and cached after the first call.
  await ensureDbReady()

  const now = new Date()
  // Prefilter: COMPLETED bookings whose start is old enough to POSSIBLY have
  // ended more than the delay ago and young enough to still be in the max-age
  // window (widened by MAX_DURATION_MIN so the tighter per-row end-time check
  // can never lose a row the prefilter should have offered). Rows already
  // nudged are excluded by id, so a busy week can't fill the LIMIT with
  // bookings that were handled days ago (the starvation bug messageReminders
  // was fixed for). Opted-out clients are dropped here too — they'd never be
  // claimed, so they'd otherwise re-appear in every scan; the text comparison
  // (never a ::boolean cast) mirrors normalizePrefs and can't throw on junk.
  const rows = await prisma.$queryRawUnsafe<NudgeCandidate[]>(`
    SELECT b.id, b.topic, b."startAt", b."durationMin",
           b.status::text        AS "status",
           b."autoCompleted"     AS "autoCompleted",
           r.id                  AS "reviewId",
           d.id                  AS "disputeId",
           (n.id IS NOT NULL)    AS "alreadyNudged",
           b."studentId"         AS "studentId",
           su.email              AS "studentEmail",
           su."fullName"         AS "studentName",
           su."notificationPrefs" AS "studentPrefs",
           b."tutorId"           AS "tutorProfileId",
           tu."fullName"         AS "tutorName",
           EXISTS (
             SELECT 1 FROM "Booking" nb
              WHERE nb."studentId" = b."studentId"
                AND nb."tutorId" = b."tutorId"
                AND nb.status IN ('PREPARING', 'CONFIRMED', 'LIVE')
                AND nb."startAt" > NOW()
           ) AS "hasUpcomingWithTutor"
    FROM "Booking" b
    JOIN "TutorProfile" tp ON tp.id = b."tutorId"
    JOIN "User" su ON su.id = b."studentId"
    JOIN "User" tu ON tu.id = tp."userId"
    LEFT JOIN "Review" r ON r."bookingId" = b.id
    LEFT JOIN "Dispute" d ON d."bookingId" = b.id
    LEFT JOIN "Notification" n ON n.id = '${NUDGE_ID_PREFIX}' || b.id
    WHERE b.status = 'COMPLETED'
      AND b."autoCompleted" = false
      AND r.id IS NULL
      AND d.id IS NULL
      AND n.id IS NULL
      AND COALESCE(su."notificationPrefs"->>'${PREF_KEY}', 'true') <> 'false'
      AND b."startAt" < NOW() - interval '${REVIEW_NUDGE_DELAY_HOURS} hours'
      AND b."startAt" > NOW() - interval '${REVIEW_NUDGE_MAX_AGE_DAYS} days' - interval '${MAX_DURATION_MIN} minutes'
    LIMIT 200
  `)

  const eligible = selectReviewNudges(rows, now)
  if (eligible.length === 0) return { bookings: 0, emails: 0 }

  // Claim + deliver the in-app half in ONE statement (see the header note): the
  // deterministic id is the dedupe key, so a losing concurrent run gets nothing
  // back and stays silent. Written with raw SQL rather than notify() because
  // notify() generates a random id — there would be no key to conflict on. The
  // pref gate notify() would have applied is already enforced above.
  const hrefFor = (id: string) => `/me/bookings/${id}?review=1`
  const claimed = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "Notification" (id, "userId", "type", title, body, href)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
       AS t(id, "userId", "type", title, body, href)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    eligible.map(r => nudgeNotificationId(r.id)),
    eligible.map(r => r.studentId),
    eligible.map(() => 'BOOKING_COMPLETED'),
    eligible.map(() => 'როგორ ჩაიარა სესიამ?'),
    eligible.map(r => `${r.topic} · ${fmtWhenTz(new Date(r.startAt), { year: true })} — დატოვე შეფასება`),
    eligible.map(r => hrefFor(r.id)),
  )
  const claimedIds = new Set(claimed.map(c => c.id))
  const claimedRows = eligible.filter(r => claimedIds.has(nudgeNotificationId(r.id)))

  let emails = 0
  for (const r of claimedRows) {
    if (!r.studentEmail) continue
    const { subject, html } = reviewNudgeEmail({
      name: r.studentName || '',
      expertName: r.tutorName || 'ექსპერტი',
      topic: r.topic,
      whenText: fmtWhenTz(new Date(r.startAt), { year: false }),
      href: hrefFor(r.id),
      // Folded-in rebook invite — dropped when they already have time booked
      // with this expert. ?rebook=1 auto-opens the booking flow on the profile.
      rebookHref: shouldPromptRebook(r) ? `/experts/${r.tutorProfileId}?rebook=1` : undefined,
    })
    // Count only what actually went out — sendMail RESOLVES with { ok: false }
    // on a provider error, so a bare .then() would report failures as sent.
    await sendMail({ to: r.studentEmail, subject, html }).then(res => { if (res.ok) emails++ }).catch(() => {})
  }

  return { bookings: claimedRows.length, emails }
}
