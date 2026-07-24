import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public aggregate stats for the /tutors hero.
export async function GET() {
  // Compute the four hero numbers in a single aggregate query instead of pulling
  // every live tutor row into JS. The INNER JOIN to Category reproduces the old
  // `category: { is: { isLive: true } }` relation filter (which also excluded
  // null-category tutors), and `available = true` skips paused tutors — so the
  // numbers are identical to the previous findMany+reduce, at O(1) rows returned.
  // weightedSum = Σ(rating·reviewsCount) can't be expressed via Prisma aggregate,
  // hence $queryRaw; the whole thing is one round-trip.
  const [row] = await prisma.$queryRaw<
    { total: number; verifiedCount: number; totalReviews: number; weightedSum: number }[]
  >`
    SELECT
      COUNT(*)::int                                        AS "total",
      COUNT(*) FILTER (WHERE tp."verified")::int           AS "verifiedCount",
      COALESCE(SUM(tp."reviewsCount"), 0)::int             AS "totalReviews",
      COALESCE(SUM(tp."rating" * tp."reviewsCount"), 0)::float AS "weightedSum"
    FROM "TutorProfile" tp
    JOIN "Category" c ON c."id" = tp."categoryId"
    WHERE tp."available" = true AND c."isLive" = true
  `

  const total = row?.total ?? 0
  const verifiedCount = row?.verifiedCount ?? 0
  const totalReviews = row?.totalReviews ?? 0
  // Weighted average by reviewsCount so a 5-review tutor doesn't skew the mean.
  const avgRating = totalReviews > 0 ? (row?.weightedSum ?? 0) / totalReviews : 0

  return NextResponse.json({
    total,
    verifiedCount,
    avgRating,
    totalReviews,
  })
}
