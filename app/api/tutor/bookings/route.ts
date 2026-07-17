import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET() {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return NextResponse.json({ profile: null, bookings: [], stats: null })

  const [bookings, upcoming, completed, revenueSum] = await Promise.all([
    prisma.booking.findMany({
      where: { tutorId: profile.id },
      orderBy: { startAt: 'desc' },
      take: 40,
      include: { student: { select: { id: true, fullName: true, avatarUrl: true } } },
    }),
    prisma.booking.count({ where: { tutorId: profile.id, status: { in: ['CONFIRMED', 'PREPARING'] } } }),
    prisma.booking.count({ where: { tutorId: profile.id, status: 'COMPLETED' } }),
    prisma.booking.aggregate({ _sum: { price: true }, where: { tutorId: profile.id, status: 'COMPLETED' } }),
  ])

  // rescheduleRequest is a dbBoot-added JSONB column Prisma can't select —
  // merge it via one raw query (same pattern as app/api/bookings/[id]/route.ts)
  // so the dashboard/bookings list can surface pending reschedule decisions.
  let reschedById = new Map<string, unknown>()
  if (bookings.length > 0) {
    try {
      const ids = bookings.map(b => b.id)
      const rows = await prisma.$queryRawUnsafe<{ id: string; rescheduleRequest: unknown }[]>(
        `SELECT id, "rescheduleRequest" FROM "Booking" WHERE id = ANY($1) AND "rescheduleRequest" IS NOT NULL`,
        ids,
      )
      reschedById = new Map(rows.map(r => [r.id, r.rescheduleRequest]))
    } catch { /* column may not exist yet on a fresh DB — omit silently */ }
  }

  return NextResponse.json({
    profile,
    bookings: bookings.map(b => ({ ...b, rescheduleRequest: reschedById.get(b.id) ?? null })),
    stats: {
      upcoming,
      completed,
      revenue: (revenueSum as any)._sum?.price ?? 0,
    },
  })
}
