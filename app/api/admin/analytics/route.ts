import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const sevenDaysAgo   = new Date(now.getTime() - 7 * dayMs)
  const thirtyDaysAgo  = new Date(now.getTime() - 30 * dayMs)

  const [
    totalUsers, totalStudents, totalTutors, totalBookings, totalReviews,
    newUsers7d, newBookings7d, newUsers30d,
    activatedStudents, reviewsAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.tutorProfile.count(),
    prisma.booking.count(),
    prisma.review.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.booking.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { role: 'STUDENT', bookingsAsStudent: { some: {} } } }),
    prisma.review.aggregate({ _avg: { rating: true } }),
  ])

  // Activation = share of students who created at least one booking. Prior
  // code divided student-with-bookings by ALL users (including tutors and
  // admins), which understated the metric.
  const activationPct = totalStudents > 0
    ? Math.round((activatedStudents / totalStudents) * 100)
    : 0

  return NextResponse.json({
    users: { total: totalUsers, students: totalStudents, new7d: newUsers7d, new30d: newUsers30d },
    tutors: { total: totalTutors },
    bookings: { total: totalBookings, new7d: newBookings7d },
    reviews: { total: totalReviews, avgRating: reviewsAgg._avg.rating ?? 0 },
    activationPct,
    activatedStudents,
  })
}
