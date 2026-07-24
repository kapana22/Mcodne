import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { sessionReminderEmail } from '@/lib/emailTemplates'
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
  tutor_email: string | null
  tutor_name: string | null
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
           su.email AS student_email, su."fullName" AS student_name,
           tu.email AS tutor_email,   tu."fullName" AS tutor_name
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

  let emails = 0
  for (const r of rows) {
    const whenText = fmtKaDateTime(new Date(r.startAt), { year: false })
    if (r.student_email) {
      const { subject, html } = sessionReminderEmail({
        name: r.student_name || '', counterpartName: r.tutor_name || 'ექსპერტი',
        topic: r.topic, whenText, href: `/student/bookings/${r.id}`,
      })
      await sendMail({ to: r.student_email, subject, html }).then(() => { emails++ }).catch(() => {})
    }
    if (r.tutor_email) {
      const { subject, html } = sessionReminderEmail({
        name: r.tutor_name || '', counterpartName: r.student_name || 'კლიენტი',
        topic: r.topic, whenText, href: `/tutor/bookings/${r.id}`,
      })
      await sendMail({ to: r.tutor_email, subject, html }).then(() => { emails++ }).catch(() => {})
    }
  }

  // Stamp every processed booking so it's never reminded again — even if a send
  // failed (reminders are best-effort; retry storms are worse than a rare miss).
  if (rows.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Booking" SET "sessionReminderSentAt" = NOW() WHERE id = ANY($1::text[])`,
      rows.map(r => r.id),
    )
  }

  return { bookings: rows.length, emails }
}
