import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { BROWSABLE_CATEGORY_SQL } from '@/lib/categoryTree'

// Public aggregate stats for the /experts hero.
export async function GET() {
  // Compute the four hero numbers in a single aggregate query instead of pulling
  // every live tutor row into JS.
  //
  // ⚠️ THE WHERE CLAUSE MUST MIRROR lib/tutorsQuery EXACTLY. This is a PUBLIC
  // COUNT of a list the visitor can then go and count themselves, so any gate
  // that file applies and this one doesn't becomes a visible lie. Measured on
  // production 2026-07-31: the home page said „10 ექსპერტი" while /experts said
  // „9 ექსპერტი შენთვის" — two numbers for one roster, from these two files
  // drifting apart on both of the gates below.
  //
  //   • EXISTS Consultation — an expert with ZERO services is hidden from browse
  //     (nothing to book, guaranteed dead end). This file counted them. THIS was
  //     the 10-vs-9.
  //   • LEFT JOIN, not INNER — a NULL category must never hide an approved
  //     expert (it did, twice; see the note in tutorsQuery). The inner join here
  //     silently dropped them, so the two errors were also pulling in OPPOSITE
  //     directions and could mask each other at some roster sizes.
  //   • BROWSABLE_CATEGORY_SQL — the one visibility rule, imported rather than
  //     retyped. That is precisely how these two files drifted apart before.
  //
  // `available = true` skips self-paused experts and the User join drops
  // admin-suspended accounts, as before.
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
    LEFT JOIN "Category" c ON c."id" = tp."categoryId"
    JOIN "User" u ON u."id" = tp."userId"
    WHERE tp."available" = true
      AND u."suspendedAt" IS NULL
      AND ${Prisma.raw(BROWSABLE_CATEGORY_SQL)}
      AND EXISTS (SELECT 1 FROM "Consultation" cs WHERE cs."tutorId" = tp."id")
  `

  // How many of THOSE experts have an open window in the next 7 days — the
  // hero's live line („ღია დრო აქვს ამ კვირაში N ექსპერტს"). Availability is
  // WINDOWS (lib/availability derives the actual start times), so "a window
  // that hasn't fully passed and begins inside the week" is the honest
  // definition of open. Same gates as above, same warning: this number is
  // checkable by hand on /experts, so it must never over-count.
  const [openRow] = await prisma.$queryRaw<{ openThisWeek: number }[]>`
    SELECT COUNT(DISTINCT tp."id")::int AS "openThisWeek"
    FROM "TutorProfile" tp
    LEFT JOIN "Category" c ON c."id" = tp."categoryId"
    JOIN "User" u ON u."id" = tp."userId"
    JOIN "AvailabilitySlot" a ON a."tutorId" = tp."id"
    WHERE tp."available" = true
      AND u."suspendedAt" IS NULL
      AND ${Prisma.raw(BROWSABLE_CATEGORY_SQL)}
      AND EXISTS (SELECT 1 FROM "Consultation" cs WHERE cs."tutorId" = tp."id")
      AND a."endAt" > NOW()
      AND a."startAt" < NOW() + INTERVAL '7 days'
  `

  const total = row?.total ?? 0
  const verifiedCount = row?.verifiedCount ?? 0
  const totalReviews = row?.totalReviews ?? 0
  // Weighted average by reviewsCount so a 5-review tutor doesn't skew the mean.
  const avgRating = totalReviews > 0 ? (row?.weightedSum ?? 0) / totalReviews : 0

  // What experts ACTUALLY charge, from live paid services only. This is a
  // fact, not a recommendation — see the note in components/PriceField.tsx:
  // the old „ჩვენი რჩევა ₾60–₾150" band was removed because it judged a new
  // expert for pricing low. A distribution judges nobody; it just lets someone
  // who wants to be the affordable option see where that is.
  const [priceRow] = await prisma.$queryRaw<{ p25: number; median: number; p75: number; n: number }[]>`
    SELECT
      COALESCE(percentile_disc(0.25) WITHIN GROUP (ORDER BY cs."price"), 0)::int AS "p25",
      COALESCE(percentile_disc(0.5)  WITHIN GROUP (ORDER BY cs."price"), 0)::int AS "median",
      COALESCE(percentile_disc(0.75) WITHIN GROUP (ORDER BY cs."price"), 0)::int AS "p75",
      COUNT(*)::int AS "n"
    FROM "Consultation" cs
    JOIN "TutorProfile" tp ON tp."id" = cs."tutorId"
    JOIN "User" u ON u."id" = tp."userId"
    LEFT JOIN "Category" c ON c."id" = tp."categoryId"
    WHERE cs."price" >= 10
      AND tp."available" = true
      AND u."suspendedAt" IS NULL
      AND ${Prisma.raw(BROWSABLE_CATEGORY_SQL)}
  `

  return NextResponse.json({
    total,
    priceP25: priceRow?.p25 ?? 0,
    priceMedian: priceRow?.median ?? 0,
    priceP75: priceRow?.p75 ?? 0,
    pricedServices: priceRow?.n ?? 0,
    verifiedCount,
    avgRating,
    totalReviews,
    openThisWeek: openRow?.openThisWeek ?? 0,
  })
}
