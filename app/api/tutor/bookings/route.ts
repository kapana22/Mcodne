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

  return NextResponse.json({
    profile,
    bookings,
    stats: {
      upcoming,
      completed,
      revenue: (revenueSum as any)._sum?.price ?? 0,
    },
  })
}
