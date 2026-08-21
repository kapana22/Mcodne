import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ROLE } from '@/lib/roles'

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const sevenDaysAgo   = new Date(now.getTime() - 7 * dayMs)
  /* The 30-day window has to be THE SAME WINDOW the chart above it draws, or
     the dashboard contradicts itself in one glance — it read „ახალი ანგარიშები
     48" in the chart and „30 დღეში ახალი 49" in the list directly below.
     /api/admin/analytics/series charts 30 whole Tbilisi days (today back 29),
     so this counts from the START of that first day rather than from this
     instant minus 30×24h. */
  const thirtyDaysAgo = (() => {
    const todayTb = new Date(`${now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tbilisi' })}T00:00:00+04:00`)
    return new Date(todayTb.getTime() - 29 * dayMs)
  })()

  const [
    totalUsers, totalStudents, totalTutors, totalBookings, totalReviews,
    newUsers7d, newBookings7d, newUsers30d,
    activatedStudents, reviewsAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: ROLE.USER } }),
    /* AN EXPERT IS A PROFILE, NOT A ROLE — and the KPI card three rows up now
       counts the same thing, so the two agree.
       This was briefly the other way round (2026-08-12): both sides counted
       `User.role = TUTOR`, because the one profile attached to an ADMIN account
       looked like drift. It is not drift — the owner runs the platform AND
       consults on it, and the roles are deliberately independent: every expert
       surface (app/tutor/layout, /api/tutor/*, /api/me/tutor) already accepts
       `['PROVIDER', 'ADMIN']` and resolves the profile by userId.
       Counting by role would therefore report one fewer expert than /experts
       actually lists, which is the same disagreement pointing the other way. */
    prisma.tutorProfile.count(),
    prisma.booking.count(),
    prisma.review.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.booking.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { role: ROLE.USER, bookingsAsStudent: { some: {} } } }),
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
