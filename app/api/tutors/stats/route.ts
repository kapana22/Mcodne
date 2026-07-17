import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public aggregate stats for the /tutors hero.
export async function GET() {
  // Only count tutors in live categories — matches the visibility rule the
  // main tutors list uses.
  const tutors = await prisma.tutorProfile.findMany({
    where: {
      // Skip paused tutors so hero stats match what the browse list actually
      // shows (a paused tutor isn't a "live tutor available on the platform").
      available: true,
      category: { is: { isLive: true } },
    },
    select: {
      verified: true, rating: true, reviewsCount: true,
    },
  })

  const total = tutors.length
  const verifiedCount = tutors.filter(t => t.verified).length
  // Weighted average by reviewsCount so a 5-review tutor doesn't skew the mean.
  const weightedSum = tutors.reduce((acc, t) => acc + (t.rating ?? 0) * (t.reviewsCount ?? 0), 0)
  const totalReviews = tutors.reduce((acc, t) => acc + (t.reviewsCount ?? 0), 0)
  const avgRating = totalReviews > 0 ? weightedSum / totalReviews : 0

  return NextResponse.json({
    total,
    verifiedCount,
    avgRating,
    totalReviews,
  })
}
