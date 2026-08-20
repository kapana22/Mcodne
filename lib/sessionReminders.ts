import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { sessionReminderEmail, sessionImminentEmail, fmtWhenTz } from '@/lib/emailTemplates'
import { normalizePrefs } from '@/lib/notify'
import { ensureDbReady } from '@/lib/dbBoot'

// Emails BOTH parties ~1h before a CONFIRMED session and stamps
// `sessionReminderSentAt` so a booking is reminded exactly once. Called by the
// dedicated /api/internal/reminders endpoint AND piggybacked on the existing
// ∗/15 cleanup cron (so no separate cron has to be provisioned).
//
// `sessionReminderSentAt` is a dbBoot-added column Prisma can't select, so the
// query/update go through raw SQL (same pattern as rescheduleRequest).
//
// LEAD-TIME ARITHMETIC (the one rule both reminders obey). With a sweep every
// N minutes and a selection window of W minutes, a booking is picked up on the
// first tick after it enters the window, so the delivered lead time is always in
// `(W − N, W]`. At N=15: the ~1h reminder (W=65) lands 50–65 min out, and the
// imminent one below (W=20) lands 5–20 min out. That band is exactly why neither
// message may ever name a number of minutes — any number would be wrong for most
// recipients.

type Row = {
  id: string
  startAt: Date
  topic: string
  durationMin: number
  student_email: string | null
  student_name: string | null
  student_prefs: unknown
  tutor_email: string | null
  tutor_name: string | null
  tutor_prefs: unknown
}

export async function sendSessionReminders(): Promise<{
  bookings: number
  emails: number
  imminentNotified: number
  imminentEmails: number
}> {
  // The endpoint/cron may be the first hit after a deploy — make sure the
  // dbBoot-added column exists before the raw query references it.
  await ensureDbReady()

  // Confirmed sessions starting within the next ~65 min that haven't been
  // reminded yet. A 15-min cron gives every booking one reminder as it enters
  // the ~1h zone. LIMIT bounds a backlog after downtime — and ORDER BY startAt
  // makes the LIMIT keep the RIGHT 200: unordered, a backlog could hand Postgres
  // the 200 furthest-out sessions and drop precisely the ones about to start,
  // which is the only case where the cap matters at all.
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT b.id, b."startAt", b.topic, b."durationMin",
           su.email AS student_email, su."fullName" AS student_name, su."notificationPrefs" AS student_prefs,
           tu.email AS tutor_email,   tu."fullName" AS tutor_name,   tu."notificationPrefs" AS tutor_prefs
    FROM "Booking" b
    JOIN "TutorProfile" tp ON tp.id = b."tutorId"
    JOIN "User" su ON su.id = b."studentId"
    JOIN "User" tu ON tu.id = tp."userId"
    WHERE b.status = 'CONFIRMED'
      AND b."sessionReminderSentAt" IS NULL
      AND b."startAt" > NOW()
      AND b."startAt" <= NOW() + interval '65 minutes'
    ORDER BY b."startAt" ASC
    LIMIT 200
  `)

  // Stamp BEFORE sending (policy is already "stamp even on failure"). If the
  // cron request times out or the instance restarts mid-loop, the failure mode
  // is a rare missed reminder — never re-emailing every recipient on the next
  // tick, which stamping-after would cause.
  //
  // The stamp IS the atomic claim: the `AND sessionReminderSentAt IS NULL`
  // guard + RETURNING means only ONE of two overlapping cron runs wins each
  // booking, so no party gets emailed twice. We email only the rows this run
  // actually claimed.
  let claimedRows = rows
  if (rows.length) {
    const claimed = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE "Booking" SET "sessionReminderSentAt" = NOW() WHERE id = ANY($1::text[]) AND "sessionReminderSentAt" IS NULL RETURNING id`,
      rows.map(r => r.id),
    )
    const claimedIds = new Set(claimed.map(c => c.id))
    claimedRows = rows.filter(r => claimedIds.has(r.id))
  }

  let emails = 0
  // Bookings where we tried to mail SOMEONE and every attempt failed at the
  // provider. See the release below.
  const totalFailures: string[] = []
  for (const r of claimedRows) {
    const whenText = fmtWhenTz(new Date(r.startAt), { year: false })
    const durationText = `${r.durationMin} წუთი`
    let attempted = 0
    let delivered = 0
    // Gate each recipient on their BOOKING_CREATED pref — the reminder is a
    // booking-lifecycle notification, so a user who opted that category out
    // shouldn't get the email (in-app reminders already honor prefs via notify).
    if (r.student_email && normalizePrefs(r.student_prefs).BOOKING_CREATED) {
      const { subject, html } = sessionReminderEmail({
        name: r.student_name || '', counterpartName: r.tutor_name || 'ექსპერტი',
        topic: r.topic, whenText, durationText, href: `/me/bookings/${r.id}`,
      })
      attempted++
      // Count only what actually went out — sendMail RESOLVES on a provider
      // error (it returns ok:false), so a bare .then() reported failures as sent.
      await sendMail({ to: r.student_email, subject, html }).then(res => { if (res.ok) { emails++; delivered++ } }).catch(() => {})
    }
    if (r.tutor_email && normalizePrefs(r.tutor_prefs).BOOKING_CREATED) {
      const { subject, html } = sessionReminderEmail({
        name: r.tutor_name || '', counterpartName: r.student_name || 'კლიენტი',
        topic: r.topic, whenText, durationText, href: `/work/bookings/${r.id}`,
      })
      attempted++
      await sendMail({ to: r.tutor_email, subject, html }).then(res => { if (res.ok) { emails++; delivered++ } }).catch(() => {})
    }
    if (attempted > 0 && delivered === 0) totalFailures.push(r.id)
  }

  // RELEASE the stamp when the provider — not our logic — ate the reminder.
  // "Stamp before sending" protects against duplicates, but taken literally it
  // also means a single Resend outage permanently kills the reminder for every
  // booking in that tick: the stamp says „reminded", the row never comes back,
  // and nobody is ever told. So a booking whose every attempt returned
  // { ok:false } is un-stamped and retried on the next tick — but ONLY while
  // there is still real time to act on the message. Past that point a retry
  // would deliver a „your session is soon" mail minutes before (or after) the
  // session, which is worse than silence. Partial success is NOT released: the
  // recipient who did receive it must not get a second copy. The cutoff is the
  // imminent window — inside it the doorbell below is the right message anyway.
  if (totalFailures.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Booking" SET "sessionReminderSentAt" = NULL
        WHERE id = ANY($1::text[]) AND "startAt" > NOW() + interval '${IMMINENT_WINDOW_MIN} minutes'`,
      totalFailures,
    ).catch(() => {})
  }

  // The second, imminent reminder rides this same call rather than a new cron
  // entry: both scheduled callers (/api/internal/reminders and the ∗/15 cleanup
  // job) already invoke this function, so nothing has to be provisioned. Run
  // after the 1h pass and independently guarded — a failure here must not lose
  // the counts above.
  let imminent = { notified: 0, emails: 0 }
  try { imminent = await sendImminentReminders() } catch { /* best-effort */ }

  return { bookings: claimedRows.length, emails, imminentNotified: imminent.notified, imminentEmails: imminent.emails }
}

/* ── The imminent („სესია მალე იწყება") reminder ─────────────────────────────
 *
 * A second reminder for sessions that are minutes away. The ~1h one is the
 * ACTIONABLE message (still time to prepare, warn the other side, reschedule);
 * this one is a doorbell — its whole job is to catch the person who read the
 * first mail, went back to work, and lost track of the clock.
 *
 * WINDOW = 20 minutes, which on the existing 15-minute sweep delivers a 5–20
 * minute lead (see the lead-time note at the top of the file). Hence the copy
 * says „მალე იწყება" and never „5 წუთში": the number would be wrong for most
 * recipients, and a wrong number in a time-critical message is worse than none.
 */
export const IMMINENT_WINDOW_MIN = 20

/* NO SCHEMA COLUMN. `sessionReminderSentAt` is already spent on the 1h pass and
 * a second stamp column would need a migration, so the claim is the in-app
 * notification's own PRIMARY KEY — the same trick lib/postSession uses. The id
 * is deterministic in (recipient, booking, startAt-epoch) and inserted with
 * `ON CONFLICT (id) DO NOTHING RETURNING id`, so of two overlapping cron runs
 * exactly one gets the row back and only that one emails.
 *
 * Including the startAt EPOCH is what makes a rescheduled booking re-arm itself:
 * the moved session has a different startAt, hence a different id, hence no
 * conflict — no reset step anywhere. (The 1h pass needs an explicit
 * `sessionReminderSentAt = NULL` in the reschedule-accept path for the same
 * reason; this one is self-healing.)
 */
const IMMINENT_ID_PREFIX = 'session-soon:'
export function imminentNotificationId(userId: string, bookingId: string, startAt: Date): string {
  return `${IMMINENT_ID_PREFIX}${bookingId}:${Math.floor(new Date(startAt).getTime() / 1000)}:${userId}`
}

// The pref key every booking-lifecycle message honors (lib/notify groups
// BOOKING_REMINDER under it). Named once — the SQL prefilter and the per-
// recipient check below must never drift apart.
const PREF_KEY = 'BOOKING_CREATED' as const

type ImminentRow = {
  id: string
  startAt: Date
  topic: string
  student_id: string
  student_email: string | null
  student_name: string | null
  student_prefs: unknown
  tutor_user_id: string
  tutor_email: string | null
  tutor_name: string | null
  tutor_prefs: unknown
}

type ImminentTarget = {
  notifId: string
  userId: string
  bookingId: string
  topic: string
  startAt: Date
  email: string | null
  counterpartName: string
  href: string
}

/** Pure: turn candidate rows into the (recipient × booking) targets to claim.
 *  Exported so tests can pin the dedupe-key shape and the pref gate without a
 *  database. */
export function imminentTargets(rows: ImminentRow[]): ImminentTarget[] {
  const out: ImminentTarget[] = []
  for (const r of rows) {
    // Per-recipient pref gate. The raw INSERT below bypasses notify() entirely,
    // so notify()'s own pref check never runs — this IS that check, applied with
    // the same normalizePrefs the rest of the codebase uses. The SQL prefilter
    // only drops rows where BOTH parties opted out (it can't drop one side of a
    // row), so this per-recipient pass is the authority.
    if (normalizePrefs(r.student_prefs)[PREF_KEY]) {
      out.push({
        notifId: imminentNotificationId(r.student_id, r.id, r.startAt),
        userId: r.student_id,
        bookingId: r.id,
        topic: r.topic,
        startAt: r.startAt,
        email: r.student_email,
        counterpartName: r.tutor_name || 'ექსპერტი',
        href: `/me/bookings/${r.id}?reminder=soon`,
      })
    }
    if (normalizePrefs(r.tutor_prefs)[PREF_KEY]) {
      out.push({
        notifId: imminentNotificationId(r.tutor_user_id, r.id, r.startAt),
        userId: r.tutor_user_id,
        bookingId: r.id,
        topic: r.topic,
        startAt: r.startAt,
        email: r.tutor_email,
        counterpartName: r.student_name || 'კლიენტი',
        href: `/work/bookings/${r.id}?reminder=soon`,
      })
    }
  }
  return out
}

async function sendImminentReminders(): Promise<{ notified: number; emails: number }> {
  await ensureDbReady()

  // Opted-out users are dropped in SQL (mirroring lib/postSession's prefilter)
  // so a permanently-opted-out pair never re-appears in every single scan; the
  // text comparison — never a ::boolean cast — mirrors normalizePrefs and can't
  // throw on junk JSON. Already-claimed bookings are deliberately NOT excluded
  // here: the exclusion would have to rebuild the notification id in SQL, and a
  // drift between that string and the TS builder would silently stop the dedupe.
  // Correctness lives entirely in ON CONFLICT below; a re-scanned row simply
  // claims nothing. The cost is bounded — a booking can only reappear for the 20
  // minutes it spends in the window, i.e. at most a couple of ticks.
  const rows = await prisma.$queryRawUnsafe<ImminentRow[]>(`
    SELECT b.id, b."startAt", b.topic,
           su.id AS student_id, su.email AS student_email, su."fullName" AS student_name, su."notificationPrefs" AS student_prefs,
           tu.id AS tutor_user_id, tu.email AS tutor_email, tu."fullName" AS tutor_name, tu."notificationPrefs" AS tutor_prefs
    FROM "Booking" b
    JOIN "TutorProfile" tp ON tp.id = b."tutorId"
    JOIN "User" su ON su.id = b."studentId"
    JOIN "User" tu ON tu.id = tp."userId"
    WHERE b.status = 'CONFIRMED'
      AND b."startAt" > NOW()
      AND b."startAt" <= NOW() + interval '${IMMINENT_WINDOW_MIN} minutes'
      AND (COALESCE(su."notificationPrefs"->>'${PREF_KEY}', 'true') <> 'false'
        OR COALESCE(tu."notificationPrefs"->>'${PREF_KEY}', 'true') <> 'false')
    ORDER BY b."startAt" ASC
    LIMIT 200
  `)
  if (rows.length === 0) return { notified: 0, emails: 0 }

  const targets = imminentTargets(rows)
  if (targets.length === 0) return { notified: 0, emails: 0 }

  // Claim + deliver the in-app half in ONE statement — the primary key does the
  // arbitration (see the note above the id builder).
  const claimed = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "Notification" (id, "userId", "type", title, body, href)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
       AS t(id, "userId", "type", title, body, href)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    targets.map(t => t.notifId),
    targets.map(t => t.userId),
    targets.map(() => 'BOOKING_REMINDER'),
    // No number of minutes, anywhere — the delivered lead is a 5–20 min band.
    targets.map(() => 'სესია მალე იწყება'),
    targets.map(t => `${t.topic} · ${fmtWhenTz(new Date(t.startAt), { year: false })}`),
    targets.map(t => t.href),
  )
  const claimedIds = new Set(claimed.map(c => c.id))
  const claimedTargets = targets.filter(t => claimedIds.has(t.notifId))

  let emails = 0
  for (const t of claimedTargets) {
    if (!t.email) continue
    const { subject, html } = sessionImminentEmail({
      counterpartName: t.counterpartName,
      topic: t.topic,
      whenText: fmtWhenTz(new Date(t.startAt), { year: false }),
      href: t.href,
    })
    // sendMail RESOLVES { ok:false } on a provider error — only a true send
    // counts. Nothing is released here: by definition the session is minutes
    // away, so there is no window left in which a retry would still be useful.
    await sendMail({ to: t.email, subject, html }).then(res => { if (res.ok) emails++ }).catch(() => {})
  }

  return { notified: claimedTargets.length, emails }
}
