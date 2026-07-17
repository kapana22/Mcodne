import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { isBookingLive } from '@/lib/bookingLive'

export async function GET() {
  await requireRole('ADMIN')
  // Sessions that COULD be live now: CONFIRMED, starting within the last
  // 4h (>= max session length) so any still-running one is in range.
  const now = Date.now()
  const liveWindowStart = new Date(now - 240 * 60_000)
  const [users, tutors, students, bookings, pendingApps, completed, revenue, liveCandidates] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'TUTOR' } }),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.booking.count(),
    prisma.tutorApplication.count({ where: { status: 'SUBMITTED' } }),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.booking.aggregate({ _sum: { price: true }, where: { status: 'COMPLETED' } }),
    prisma.booking.findMany({
      where: { status: { in: ['CONFIRMED', 'LIVE'] }, startAt: { gte: liveWindowStart, lte: new Date(now) } },
      select: { status: true, startAt: true, durationMin: true },
    }),
  ])
  // Derived truth — the stored LIVE status is never written (see lib/bookingLive).
  const live = liveCandidates.filter(isBookingLive).length
  return NextResponse.json({
    users, tutors, students, bookings, pendingApps, completed, live,
    revenue: (revenue as any)._sum?.price ?? 0,
  })
}
