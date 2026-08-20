import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { siteUrl } from '@/lib/siteUrl'

// GET /api/bookings/[id]/ical
// Returns an RFC 5545 iCalendar file for the booking so users can add the
// session to Google Calendar / Apple Calendar / Outlook. Access-controlled:
// only the booking's student, its tutor, or an admin may download it.

const pad2 = (n: number) => String(n).padStart(2, '0')
// iCal wants UTC in the form YYYYMMDDTHHMMSSZ (basic-format)
const toICalDate = (d: Date) =>
  `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T` +
  `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`

// RFC 5545 §3.3.11 — escape commas, semicolons, backslashes, and newlines.
const escapeICS = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('unauthorized', { status: 401 })
  const { id } = await ctx.params

  const booking = await prisma.booking.findFirst({
    where: {
      id,
      OR: [
        { studentId: user.id },
        { tutor: { userId: user.id } },
        ...(user.role === 'ADMIN' ? [{}] : []),
      ],
    },
    include: {
      // NOTE: the expert's email is deliberately NOT selected — a student who
      // booked a free slot could otherwise harvest it from the ORGANIZER line.
      // This mirrors the guard on GET /api/bookings/[id]. ORGANIZER uses a
      // no-reply mailto below (calendars only need a valid address, not the
      // real one).
      tutor: { include: { user: { select: { fullName: true } } } },
      student: { select: { fullName: true, email: true } },
    },
  })
  if (!booking) {
    return new Response('Not found', { status: 404 })
  }

  const start = new Date(booking.startAt)
  const end = new Date(start.getTime() + booking.durationMin * 60_000)
  const now = new Date()
  const uid = `${booking.id}@mcodne.ge`
  const summary = escapeICS(`მცოდნე — ${booking.topic}`)
  const description = escapeICS(
    `ექსპერტი: ${booking.tutor.user.fullName}\n` +
    `კლიენტი: ${booking.student.fullName}\n` +
    `ხანგრძლივობა: ${booking.durationMin} წუთი\n` +
    (booking.meetingUrl ? `ვიდეოოთახი: ${booking.meetingUrl}\n` : '') +
    `\nდეტალები: ${siteUrl(req)}/student/bookings/${booking.id}`,
  )
  const location = booking.meetingUrl ?? `${siteUrl(req)}/session/${booking.id}`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//mcodne.ge//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICalDate(now)}`,
    `DTSTART:${toICalDate(start)}`,
    `DTEND:${toICalDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${escapeICS(location)}`,
    `URL:${escapeICS(location)}`,
    `STATUS:${booking.status === 'CANCELED' ? 'CANCELLED' : 'CONFIRMED'}`,
    `ORGANIZER;CN=${escapeICS(booking.tutor.user.fullName)}:mailto:noreply@mcodne.ge`,
    `ATTENDEE;CN=${escapeICS(booking.student.fullName)};RSVP=TRUE:mailto:${booking.student.email}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:სესია იწყება 15 წუთში',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  // iCal spec asks for CRLF line separators; folding is only needed for very
  // long lines (>75 octets) and none of ours run that long except SUMMARY/
  // DESCRIPTION with worst-case Georgian text. Keep it simple — modern
  // parsers (Google, Apple, Outlook) accept unfolded lines fine.
  const body = lines.join('\r\n') + '\r\n'

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="mcodne-${booking.ref.slice(0, 12)}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
