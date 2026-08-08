import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { parseIntParam } from '@/lib/apiParams'

// Lessons in a date window, for the teacher's month grid.
//
// Deliberately a separate route from /api/tutor/bookings: that one answers
// „what needs my attention" (pending, today, sorted by urgency) and is paginated
// for a list. This answers „what does my month look like" — a whole range, no
// pagination, and only the four fields a calendar cell can show. Reusing the
// list route would have meant fetching detail nobody draws.

export async function GET(req: Request) {
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
  if (auth.response) return auth.response

  const tutor = await prisma.tutorProfile.findUnique({
    where: { userId: auth.user.id },
    select: { id: true },
  })
  if (!tutor) return NextResponse.json({ items: [] })

  // Months back/forward from now. Clamped by the shared parser — an unbounded
  // range here would be an easy way to ask for every booking ever made.
  const url = new URL(req.url)
  const back = parseIntParam(url.searchParams.get('back'), { fallback: 1, min: 0, max: 12 })
  const fwd = parseIntParam(url.searchParams.get('fwd'), { fallback: 3, min: 1, max: 12 })

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - back, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + fwd + 1, 1)

  const rows = await prisma.booking.findMany({
    where: {
      tutorId: tutor.id,
      startAt: { gte: from, lt: to },
      // Cancelled lessons are not on the calendar — the slot is free again and
      // drawing them would misrepresent the month.
      status: { in: ['PREPARING', 'CONFIRMED', 'LIVE', 'COMPLETED', 'NO_SHOW'] },
    },
    orderBy: { startAt: 'asc' },
    select: {
      id: true, startAt: true, durationMin: true, status: true, enrollmentId: true,
      // No avatar blob — a calendar cell shows a name, and this can be hundreds
      // of rows.
      student: { select: { fullName: true } },
    },
    take: 500,
  })

  const items = rows.map(b => ({
    id: b.id,
    startAt: b.startAt,
    durationMin: b.durationMin,
    status: b.status,
    studentName: b.student?.fullName ?? '',
    fromPackage: !!b.enrollmentId,
  }))

  return NextResponse.json({ items })
}
