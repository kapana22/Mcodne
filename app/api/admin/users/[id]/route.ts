import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// Full admin drilldown for a single user: profile + tutor row (if any) +
// all bookings (as student and as tutor) + reviews written + reviews received
// + recent notifications. Kept in one endpoint so the modal makes a single call.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireRole('ADMIN')
  const { id } = await ctx.params

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      tutor: {
        include: { category: { select: { id: true, slug: true, name: true } } },
        // featured + videoUrl are new fields — Prisma default is `include: true`
        // which returns all scalar columns, so no explicit select needed.
      },
      _count: {
        select: {
          bookingsAsStudent: true,
          reviewsGiven: true,
          sentMessages: true,
          notifications: true,
          favorites: true,
        },
      },
    },
  })
  if (!user) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const [bookingsAsStudent, bookingsAsTutor, reviewsWritten, reviewsReceived, recentNotifications] =
    await Promise.all([
      prisma.booking.findMany({
        where: { studentId: id },
        orderBy: { startAt: 'desc' },
        take: 30,
        include: {
          tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        },
      }),
      user.tutor
        ? prisma.booking.findMany({
            where: { tutorId: user.tutor.id },
            orderBy: { startAt: 'desc' },
            take: 30,
            include: {
              student: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          })
        : Promise.resolve([]),
      prisma.review.findMany({
        where: { studentId: id },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        },
      }),
      user.tutor
        ? prisma.review.findMany({
            where: { tutorId: user.tutor.id },
            orderBy: { createdAt: 'desc' },
            take: 15,
            include: { student: { select: { id: true, fullName: true, avatarUrl: true } } },
          })
        : Promise.resolve([]),
      prisma.notification.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

  // Never leak passwordHash to admin UI either.
  const { passwordHash: _ph, ...safeUser } = user as any

  return NextResponse.json({
    user: safeUser,
    bookingsAsStudent,
    bookingsAsTutor,
    reviewsWritten,
    reviewsReceived,
    recentNotifications,
  })
}
