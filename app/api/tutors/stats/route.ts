import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public aggregate stats for the /tutors hero.
export async function GET() {
  // Compute the four hero numbers in a single aggregate query instead of pulling
  // every live tutor row into JS. The INNER JOIN to Category reproduces the old
  // `category: { is: { isLive: true } }` relation filter (which also excluded
  // null-category tutors), `available = true` skips paused tutors, and the User
  // join drops admin-suspended accounts — the same three filters lib/tutorsQuery
  // applies, so the hero totals can't exceed the list they head.
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
    JOIN "User" u ON u."id" = tp."userId"
    WHERE tp."available" = true AND c."isLive" = true AND u."suspendedAt" IS NULL
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
