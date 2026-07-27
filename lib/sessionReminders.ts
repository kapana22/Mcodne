import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { sessionReminderEmail } from '@/lib/emailTemplates'
import { normalizePrefs } from '@/lib/notify'
import { fmtKaDateTime } from '@/lib/kaDate'
import { ensureDbReady } from '@/lib/dbBoot'

// Emails BOTH parties ~1h before a CONFIRMED session and stamps
// `sessionReminderSentAt` so a booking is reminded exactly once. Called by the
// dedicated /api/internal/reminders endpoint AND piggybacked on the existing
// */15 cleanup cron (so no separate cron has to be provisioned).
//
// `sessionReminderSentAt` is a dbBoot-added column Prisma can't select, so the
// query/update go through raw SQL (same pattern as rescheduleRequest).

type Row = {
  id: string
  startAt: Date
  topic: string
  student_email: string | null
  student_name: string | null
  student_prefs: unknown
  tutor_email: string | null
  tutor_name: string | null
  tutor_prefs: unknown
}

export async function sendSessionReminders(): Promise<{ bookings: number; emails: number }> {
  // The endpoint/cron may be the first hit after a deploy — make sure the
  // dbBoot-added column exists before the raw query references it.
  await ensureDbReady()

  // Confirmed sessions starting within the next ~65 min that haven't been
  // reminded yet. A 15-min cron gives every booking one reminder as it enters
  // the ~1h zone. LIMIT bounds a backlog after downtime.
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT b.id, b."startAt", b.topic,
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
  for (const r of claimedRows) {
    const whenText = fmtKaDateTime(new Date(r.startAt), { year: false })
    // Gate each recipient on their BOOKING_CREATED pref — the reminder is a
    // booking-lifecycle notification, so a user who opted that category out
    // shouldn't get the email (in-app reminders already honor prefs via notify).
    if (r.student_email && normalizePrefs(r.student_prefs).BOOKING_CREATED) {
      const { subject, html } = sessionReminderEmail({
        name: r.student_name || '', counterpartName: r.tutor_name || 'ექსპერტი',
        topic: r.topic, whenText, href: `/student/bookings/${r.id}`,
      })
      // Count only what actually went out — sendMail RESOLVES on a provider
      // error (it returns ok:false), so a bare .then() reported failures as sent.
      await sendMail({ to: r.student_email, subject, html }).then(res => { if (res.ok) emails++ }).catch(() => {})
    }
    if (r.tutor_email && normalizePrefs(r.tutor_prefs).BOOKING_CREATED) {
      const { subject, html } = sessionReminderEmail({
        name: r.tutor_name || '', counterpartName: r.student_name || 'სტუდენტი',
        topic: r.topic, whenText, href: `/tutor/bookings/${r.id}`,
      })
      await sendMail({ to: r.tutor_email, subject, html }).then(res => { if (res.ok) emails++ }).catch(() => {})
    }
  }

  return { bookings: claimedRows.length, emails }
}
