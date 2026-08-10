import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { futureWindowWhere, hasFutureWindow } from '@/lib/bookability'
import { ensureDbReady } from '@/lib/dbBoot'
import { EVENTS, EVENT_RETENTION_DAYS } from '@/lib/events'
import { BOOKING_FUNNEL_EVENTS } from '@/components/booking/funnelEvents'
import { APPLY_FUNNEL_EVENTS } from '@/app/apply/applyFunnelEvents'
import { buildProfileChecks, profilePercent } from '@/lib/profileScore'

// Behavioural insights for the admin „ინსაითები" tab — the two questions GA
// cannot answer:
//
//   1. WHAT ARE PEOPLE LOOKING FOR AND NOT FINDING? Every zero-result search is
//      a client who arrived with money and intent and left with nothing. The
//      grouped list of those queries IS the expert-recruitment to-do list — it
//      is the single most actionable thing in this product.
//   2. WHERE DOES THE BOOKING FLOW LOSE PEOPLE, and is the loss our fault? An
//      attempt that hit a server error is a bug to fix; one that was simply
//      abandoned is a design problem. Averaging them together hides both.
//
// Event names are IMPORTED, never typed: lib/events (search) and
// components/booking/funnelEvents (the funnel contract shared with the client)
// are the single source, so a rename can't silently zero this dashboard.
//
// COST. Every query is bounded by `at > now() - N days` with N restricted to
// 7/30, which rides the (name, at DESC) index dbBoot creates, and the table is
// pruned at EVENT_RETENTION_DAYS. Grouped lists are LIMITed. This is a
// dashboard: it must stay cheap enough that an admin can hit refresh.
//
// DEGRADES, NEVER 500s. The Event table is created at boot by lib/dbBoot and may
// legitimately be empty (or, on a cold DB, momentarily absent) — every read
// falls back to an empty result rather than breaking the panel.
export const dynamic = 'force-dynamic'

const ALLOWED_DAYS = [1, 7, 30] as const
export type InsightsDays = (typeof ALLOWED_DAYS)[number]

/** Steps every attempt must pass, in order. `booking_service_chosen` is
 *  deliberately NOT part of the chain: the tier step doesn't exist for an expert
 *  with 0–1 services, so counting it as a stage would print a drop that is
 *  really just most experts having one offering. */
/**
 * Flows driven by an ADMIN account — the operator testing their own product.
 *
 * WHY THIS EXISTS (measured 2026-08-05). Of 132 booking flows on record, 55
 * came from the two admin accounts and 13 more from the owner's other logins:
 * at least half the funnel was the operator clicking through. Read without this
 * filter the panel said „132 attempts → 2 bookings", which is not a conversion
 * problem — it is a reflection. The give-away was that 44 of the 51 flows that
 * picked a time and stopped had lived under ten seconds, most of them exactly
 * four: nobody reads a service list and a calendar that fast.
 *
 * A whole FLOW is excluded when ANY of its events carries an admin userId —
 * attribution is opportunistic (the beacon fires before the session lookup
 * resolves), so a flow is usually part-attributed and part-anonymous. Filtering
 * event-by-event would keep exactly the half that failed to attribute.
 *
 * Anonymous flows are KEPT. They cannot be told apart from real visitors, and
 * silently dropping them would trade one distortion for another.
 */
const STAFF_FLOWS = `
  SELECT DISTINCT e2."props"->>'flowId'
    FROM "Event" e2
    JOIN "User" u2 ON u2."id" = e2."userId"
   WHERE u2."role" = 'ADMIN' AND e2."props" ? 'flowId'`

const FUNNEL_SPINE = [
  { key: 'opened', event: BOOKING_FUNNEL_EVENTS.opened },
  { key: 'time', event: BOOKING_FUNNEL_EVENTS.timeChosen },
  { key: 'details', event: BOOKING_FUNNEL_EVENTS.detailsSubmitted },
  { key: 'created', event: BOOKING_FUNNEL_EVENTS.created },
] as const

export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const url = new URL(req.url)
  const asked = Number(url.searchParams.get('days'))
  const days: InsightsDays = (ALLOWED_DAYS as readonly number[]).includes(asked)
    ? (asked as InsightsDays)
    : 7

  // The Event table is boot-time DDL (not in schema.prisma), so make sure it
  // exists before reading it. Memoised — costs nothing after the first call.
  await ensureDbReady().catch(() => {})

  const [zeroQueries, searchTotals, funnel, failureCodes, applyFunnel, applyDropoffs, expertRows, catSearches, catExperts, catBookings, liveCats, clientBookings, prevFunnel, profileViews, bookingsByTutor, tutorAges, demandHours, supplyHours, cancels] = await Promise.all([
    // ── 1. Zero-result searches, grouped. The list that names the experts the
    // platform is missing. Ordered by frequency, then recency.
    prisma
      .$queryRawUnsafe<{ q: string; n: number; lastAt: Date }[]>(
        `SELECT "props"->>'q' AS "q",
                COUNT(*)::int  AS "n",
                MAX("at")      AS "lastAt"
           FROM "Event"
          WHERE "name" = $1
            AND "at" > now() - ($2 * interval '1 day')
            AND "props"->>'q' IS NOT NULL
            AND "props"->>'q' <> ''
          GROUP BY 1
          ORDER BY "n" DESC, "lastAt" DESC
          LIMIT 40`,
        EVENTS.SEARCH_ZERO,
        days,
      )
      .catch(() => []),

    // ── 2. Search health. api/tutors writes EXACTLY ONE row per search — SEARCH
    // when it returned experts, SEARCH_ZERO when it didn't — so the two sum to
    // every search performed and the ratio is a true rate, not an estimate.
    prisma
      .$queryRawUnsafe<{ searches: number; zero: number }[]>(
        `SELECT COUNT(*) FILTER (WHERE "name" = $1)::int AS "searches",
                COUNT(*) FILTER (WHERE "name" = $2)::int AS "zero"
           FROM "Event"
          WHERE "name" IN ($1, $2)
            AND "at" > now() - ($3 * interval '1 day')`,
        EVENTS.SEARCH,
        EVENTS.SEARCH_ZERO,
        days,
      )
      .catch(() => []),

    // ── 3. The booking funnel, stitched per ATTEMPT by the anonymous flowId.
    //
    // Reach is CUMULATIVE (GREATEST over this step and every later one): an
    // attempt that reached „დეტალები" obviously passed „დრო", even if a step
    // event was lost in flight (the browser fires these with keepalive, over a
    // network we don't control). Without that, a dropped beacon would print as
    // a drop-off that never happened.
    //
    // The three outcomes of a non-completed attempt are counted separately and
    // are mutually exclusive: a server FAILURE (our bug), a dead end where the
    // expert had nothing bookable (NO SLOTS — the user didn't choose to leave),
    // and everything else (ABANDONED — a design problem, not an error).
    prisma
      .$queryRawUnsafe<{
        attempts: number; opened: number; time: number; details: number; created: number
        failed: number; noSlots: number; abandoned: number
      }[]>(
        `WITH f AS (
           SELECT "props"->>'flowId' AS flow,
                  MAX(CASE WHEN "name" = $1 THEN 1 ELSE 0 END) AS s_open,
                  MAX(CASE WHEN "name" = $2 THEN 1 ELSE 0 END) AS s_time,
                  MAX(CASE WHEN "name" = $3 THEN 1 ELSE 0 END) AS s_details,
                  MAX(CASE WHEN "name" = $4 THEN 1 ELSE 0 END) AS s_created,
                  MAX(CASE WHEN "name" = $5 THEN 1 ELSE 0 END) AS s_failed,
                  MAX(CASE WHEN "name" = $6 THEN 1 ELSE 0 END) AS s_noslots
             FROM "Event"
            WHERE "name" IN ($1, $2, $3, $4, $5, $6)
              AND "at" >  now() - ($7 * interval '1 day')
              AND "at" <= now() - ($8 * interval '1 day')
              AND "props"->>'flowId' IS NOT NULL
              AND "props"->>'flowId' NOT IN (${STAFF_FLOWS})
            GROUP BY 1
         )
         SELECT COUNT(*)::int AS "attempts",
                COALESCE(SUM(GREATEST(s_open, s_time, s_details, s_created)), 0)::int AS "opened",
                COALESCE(SUM(GREATEST(s_time, s_details, s_created)), 0)::int         AS "time",
                COALESCE(SUM(GREATEST(s_details, s_created)), 0)::int                 AS "details",
                COALESCE(SUM(s_created), 0)::int                                      AS "created",
                COALESCE(SUM(CASE WHEN s_created = 0 AND s_failed = 1 THEN 1 ELSE 0 END), 0)::int AS "failed",
                COALESCE(SUM(CASE WHEN s_created = 0 AND s_failed = 0 AND s_noslots = 1 THEN 1 ELSE 0 END), 0)::int AS "noSlots",
                COALESCE(SUM(CASE WHEN s_created = 0 AND s_failed = 0 AND s_noslots = 0 THEN 1 ELSE 0 END), 0)::int AS "abandoned"
           FROM f`,
        FUNNEL_SPINE[0].event,
        FUNNEL_SPINE[1].event,
        FUNNEL_SPINE[2].event,
        FUNNEL_SPINE[3].event,
        BOOKING_FUNNEL_EVENTS.failed,
        BOOKING_FUNNEL_EVENTS.noSlots,
        days,
        0,
      )
      .catch(() => []),

    // ── 4. WHY the failures failed. The server's own error code, per attempt —
    // this is what turns „12 დაიკარგა" into a fixable ticket.
    prisma
      .$queryRawUnsafe<{ code: string; n: number }[]>(
        `SELECT "props"->>'code'                     AS "code",
                COUNT(DISTINCT "props"->>'flowId')::int AS "n"
           FROM "Event"
          WHERE "name" = $1
            AND "at" > now() - ($2 * interval '1 day')
            AND "props"->>'code' IS NOT NULL
            AND "props"->>'flowId' NOT IN (${STAFF_FLOWS})
          GROUP BY 1
          ORDER BY "n" DESC
          LIMIT 12`,
        BOOKING_FUNNEL_EVENTS.failed,
        days,
      )
      .catch(() => []),

    // ── 5. The EXPERT-APPLICATION funnel. Same stitching as the booking one.
    prisma
      .$queryRawUnsafe<{
        attempts: number; opened: number; profile: number; pricing: number
        submitted: number; failed: number; abandoned: number
      }[]>(
        `WITH f AS (
           SELECT "props"->>'flowId' AS flow,
                  MAX(CASE WHEN "name" = $1 THEN 1 ELSE 0 END) AS s_open,
                  MAX(CASE WHEN "name" = $2 THEN 1 ELSE 0 END) AS s_profile,
                  MAX(CASE WHEN "name" = $3 THEN 1 ELSE 0 END) AS s_pricing,
                  MAX(CASE WHEN "name" = $4 THEN 1 ELSE 0 END) AS s_sent,
                  MAX(CASE WHEN "name" = $5 THEN 1 ELSE 0 END) AS s_failed
             FROM "Event"
            WHERE "name" IN ($1, $2, $3, $4, $5)
              AND "at" > now() - ($6 * interval '1 day')
              AND "props"->>'flowId' IS NOT NULL
              -- Same operator-traffic exclusion as the booking funnel above.
              AND "props"->>'flowId' NOT IN (${STAFF_FLOWS})
            GROUP BY 1
         )
         SELECT COUNT(*)::int AS "attempts",
                COALESCE(SUM(GREATEST(s_open, s_profile, s_pricing, s_sent)), 0)::int AS "opened",
                COALESCE(SUM(GREATEST(s_profile, s_pricing, s_sent)), 0)::int         AS "profile",
                COALESCE(SUM(GREATEST(s_pricing, s_sent)), 0)::int                    AS "pricing",
                COALESCE(SUM(s_sent), 0)::int                                         AS "submitted",
                COALESCE(SUM(CASE WHEN s_sent = 0 AND s_failed = 1 THEN 1 ELSE 0 END), 0)::int AS "failed",
                COALESCE(SUM(CASE WHEN s_sent = 0 AND s_failed = 0 THEN 1 ELSE 0 END), 0)::int AS "abandoned"
           FROM f`,
        APPLY_FUNNEL_EVENTS.opened,
        APPLY_FUNNEL_EVENTS.profileDone,
        APPLY_FUNNEL_EVENTS.pricingDone,
        APPLY_FUNNEL_EVENTS.submitted,
        APPLY_FUNNEL_EVENTS.failed,
        days,
      )
      .catch(() => []),

    // ── 6. WHO abandoned an application — the actionable half.
    //
    // This is the whole reason the apply funnel is worth building: a count tells
    // you there is a leak, a NAME lets you close it with one message. /apply
    // requires a session, so every row already carries the real userId and the
    // contact details come from the User row — this query never touches anything
    // the applicant typed.
    //
    // „Abandoned" = they emitted a funnel event, never submitted, and STILL have
    // no application on file (so someone who came back later and finished, or
    // was already approved, correctly drops out).
    prisma
      .$queryRawUnsafe<{
        userId: string; fullName: string | null; email: string; phone: string | null
        lastStep: number; lastAt: Date; catCount: number | null; blockCode: string | null
      }[]>(
        `WITH f AS (
           SELECT e."userId",
                  MAX(COALESCE((e."props"->>'step')::int, 1)) AS last_step,
                  MAX(e."at")                                 AS last_at,
                  MAX((e."props"->>'catCount')::int)          AS cat_count,
                  MAX(CASE WHEN e."name" = $4 THEN 1 ELSE 0 END) AS sent
             FROM "Event" e
            WHERE e."name" IN ($1, $2, $3, $4, $6)
              AND e."at" > now() - ($5 * interval '1 day')
              AND e."userId" IS NOT NULL
            GROUP BY 1
         ),
         -- The LAST wall they hit, if any. Kept out of the f CTE on purpose:
         -- it must be the most RECENT block, and MAX() over a text column
         -- would return the alphabetically largest code instead —
         -- PRICE_REQUIRED beating a later PHOTO_REQUIRED, reporting the wrong field.
         b AS (
           SELECT DISTINCT ON (e."userId")
                  e."userId",
                  e."props"->>'code' AS code
             FROM "Event" e
            WHERE e."name" = $6
              AND e."at" > now() - ($5 * interval '1 day')
              AND e."userId" IS NOT NULL
            ORDER BY e."userId", e."at" DESC
         )
         SELECT f."userId"        AS "userId",
                u."fullName"     AS "fullName",
                u."email"        AS "email",
                u."phone"        AS "phone",
                f.last_step      AS "lastStep",
                f.last_at        AS "lastAt",
                f.cat_count      AS "catCount",
                b.code           AS "blockCode"
           FROM f
           JOIN "User" u ON u."id" = f."userId"
      LEFT JOIN b ON b."userId" = f."userId"
      LEFT JOIN "TutorApplication" a ON a."userId" = f."userId"
          WHERE f.sent = 0
            AND a."id" IS NULL
            AND u."role" = 'STUDENT'
          ORDER BY f.last_at DESC
          LIMIT 40`,
        APPLY_FUNNEL_EVENTS.opened,
        APPLY_FUNNEL_EVENTS.profileDone,
        APPLY_FUNNEL_EVENTS.pricingDone,
        APPLY_FUNNEL_EVENTS.submitted,
        days,
        APPLY_FUNNEL_EVENTS.blocked,
      )
      .catch(() => []),

    // ── 7. Which EXPERTS have an incomplete profile.
    //
    // Reuses lib/profileScore — the exact same 10 weighted checks the expert
    // sees on their own dashboard and the sidebar badge counts. Deliberately
    // NOT a second admin-only definition of „complete": two scores that disagree
    // would make the nudge unactionable („it says 70% here and 85% there").
    //
    // `availability` carries the highest weight there for a reason, and it is
    // the one the admin must act on first: booking is slot-gated, so an expert
    // with no published time is UNBOOKABLE however polished the rest is.
    prisma.tutorProfile
      .findMany({
        // Same public-visibility rule as every other public read.
        where: { available: true, user: { is: { suspendedAt: null } } },
        select: {
          id: true, slug: true, headline: true, bio: true, specialty: true,
          responseMedianMin: true, responseSampleN: true,
          price: true, languages: true, videoUrl: true,
          user: { select: { fullName: true, email: true, avatarUrl: true } },
          _count: {
            // Document-less certificates don't render on the public profile, so
            // they must not score as a completed check either — otherwise this
            // panel reports an expert as more complete than a visitor can see.
            // Same filter as /api/tutor/nav-badges; the two MUST agree, since the
            // expert reads one number and the admin reads the other.
            select: {
              certificates: { where: { fileUrl: { not: null } } },
              education: true,
              experience: true,
            },
          },
          // Only FUTURE slots count — a profile whose only windows are in the
          // past is exactly as unbookable as one with none.
          availability: { where: futureWindowWhere(), select: { id: true }, take: 1 },
        },
        take: 200,
      })
      .catch(() => []),

    // ── 8. DEMAND per category. Which spheres people actually search for.
    // /api/tutors records the chosen category on every search row, so this is
    // the same events the zero-result list above reads, grouped differently.
    prisma
      .$queryRawUnsafe<{ slug: string; n: number }[]>(
        `SELECT "props"->>'category' AS "slug", COUNT(*)::int AS "n"
           FROM "Event"
          WHERE "name" IN ($1, $2)
            AND "at" > now() - ($3 * interval '1 day')
            AND "props"->>'category' IS NOT NULL
            AND "props"->>'category' <> ''
          GROUP BY 1`,
        EVENTS.SEARCH,
        EVENTS.SEARCH_ZERO,
        days,
      )
      .catch(() => []),

    // ── 9. SUPPLY per category — experts a visitor could actually book right
    // now. Same three gates the browse list applies (published, not suspended,
    // has an open window), and the window test is lib/bookability's, so this
    // cannot disagree with the სისტემა tab.
    prisma.tutorProfile
      .findMany({
        where: { available: true, user: { is: { suspendedAt: null } }, availability: hasFutureWindow() },
        select: { category: { select: { slug: true } } },
      })
      .catch(() => []),

    // ── 10. OUTCOME per category — bookings actually created in the window.
    prisma.booking
      .findMany({
        where: { createdAt: { gt: new Date(Date.now() - days * 86_400_000) } },
        select: { tutor: { select: { category: { select: { slug: true } } } } },
      })
      .catch(() => []),

    // ── 11. Every LIVE category, so a sphere with zero of everything still gets
    // a row. Those are the rows worth reading — an empty category is invisible
    // in any list built from the events alone.
    prisma.category
      .findMany({ where: { status: 'VISIBLE' }, select: { slug: true, name: true }, orderBy: { name: 'asc' } })
      .catch(() => []),

    // ── 12. Do clients come BACK. One booking is curiosity; the second one is
    // the first evidence the product worked. Counted over all time on purpose —
    // a repeat inside a 7-day window would mostly measure how busy the week was.
    prisma.booking
      .groupBy({ by: ['studentId'], _count: { _all: true } })
      .catch(() => [] as { studentId: string; _count: { _all: number } }[]),

    // ── 13. The SAME funnel window, one period earlier. Only the two numbers a
    // rate is made of — a conversion figure on its own says nothing; „12%,
    // was 9%" is a decision. Staff flows excluded here too, or the comparison
    // would be against a period the operator was clicking through.
    prisma
      .$queryRawUnsafe<{ attempts: number; created: number }[]>(
        `WITH f AS (
           SELECT "props"->>'flowId' AS flow,
                  MAX(CASE WHEN "name" = $1 THEN 1 ELSE 0 END) AS s_created
             FROM "Event"
            WHERE "name" IN ($1, $2)
              AND "at" >  now() - ($3 * interval '1 day')
              AND "at" <= now() - ($4 * interval '1 day')
              AND "props"->>'flowId' IS NOT NULL
              AND "props"->>'flowId' NOT IN (${STAFF_FLOWS})
            GROUP BY 1
         )
         SELECT COUNT(*)::int AS "attempts", COALESCE(SUM(s_created), 0)::int AS "created" FROM f`,
        FUNNEL_SPINE[3].event,
        FUNNEL_SPINE[0].event,
        days * 2,
        days,
      )
      .catch(() => []),

    // 14. Profile views, so browse can be read as a funnel. The booking funnel
    // starts at "the sheet opened" — everything before it was invisible, and in
    // a marketplace that is where most people leave: they searched, they read
    // the cards, they opened nobody.
    prisma
      .$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS "n" FROM "Event"
          WHERE "name" = $1 AND "at" > now() - ($2 * interval '1 day')`,
        EVENTS.PROFILE_VIEW,
        days,
      )
      .catch(() => []),

    // 15. Who the bookings go to. ALL TIME, not the window: concentration over
    // seven days with a handful of bookings is noise. If a few experts take
    // everything, the rest see nothing happen and quietly leave.
    prisma.booking
      .groupBy({ by: ['tutorId'], _count: { _all: true } })
      .catch(() => [] as { tutorId: string; _count: { _all: number } }[]),

    // 16. Approval -> first booking. TutorProfile.createdAt IS the approval
    // moment (the row is written when an application is approved). An expert
    // who waits a month does not come back.
    prisma.tutorProfile
      .findMany({
        where: { user: { is: { suspendedAt: null } } },
        select: { id: true, slug: true, createdAt: true, user: { select: { fullName: true } } },
      })
      .catch(() => []),

    // 17. WHEN people look, against WHEN anyone is free. Hours are Tbilisi's,
    // computed in SQL — lib/tz's rule is that the process timezone must never
    // decide this. A window counts in every hour it covers, not just the one it
    // starts in. (A window crossing midnight counts only to 23; the schedule
    // editor cannot create one.)
    prisma
      .$queryRawUnsafe<{ h: number; n: number }[]>(
        `SELECT EXTRACT(HOUR FROM "at" AT TIME ZONE 'Asia/Tbilisi')::int AS "h",
                COUNT(*)::int AS "n"
           FROM "Event"
          WHERE "name" IN ($1, $2) AND "at" > now() - ($3 * interval '1 day')
          GROUP BY 1`,
        EVENTS.SEARCH,
        EVENTS.SEARCH_ZERO,
        days,
      )
      .catch(() => []),

    prisma
      .$queryRawUnsafe<{ h: number; n: number }[]>(
        `SELECT h::int AS "h", COUNT(*)::int AS "n"
           FROM "AvailabilitySlot" s,
                LATERAL generate_series(
                  EXTRACT(HOUR FROM s."startAt" AT TIME ZONE 'Asia/Tbilisi')::int,
                  GREATEST(EXTRACT(HOUR FROM s."endAt" AT TIME ZONE 'Asia/Tbilisi')::int - 1,
                           EXTRACT(HOUR FROM s."startAt" AT TIME ZONE 'Asia/Tbilisi')::int)
                ) AS h
          WHERE s."endAt" > now()
          GROUP BY 1`,
      )
      .catch(() => []),

    // 18. Who cancels. `cancelledBy` is stamped on the row; a cancel rate that
    // does not say WHICH side did it cannot be acted on.
    prisma.booking
      .groupBy({ by: ['cancelledBy'], where: { status: 'CANCELED' }, _count: { _all: true } })
      .catch(() => [] as { cancelledBy: string | null; _count: { _all: number } }[]),
  ])

  const totals = searchTotals[0] ?? { searches: 0, zero: 0 }
  const searchAll = totals.searches + totals.zero
  const f = funnel[0] ?? {
    attempts: 0, opened: 0, time: 0, details: 0, created: 0, failed: 0, noSlots: 0, abandoned: 0,
  }
  const af = applyFunnel[0] ?? {
    attempts: 0, opened: 0, profile: 0, pricing: 0, submitted: 0, failed: 0, abandoned: 0,
  }

  // Score every visible expert with the SHARED checks, keep only the imperfect
  // ones, and sort by what matters: unbookable first, then least complete.
  const experts = expertRows
    .map(t => {
      const checks = buildProfileChecks(
        { headline: t.headline, bio: t.bio, specialty: t.specialty, price: t.price, languages: t.languages },
        t._count.certificates,
        t._count.education,
        t._count.experience,
        t.user?.avatarUrl,
        t.availability.length,
      )
      const undone = checks.filter(c => !c.done)
      return {
        slug: t.slug,
        fullName: t.user?.fullName ?? null,
        email: t.user?.email ?? '',
        percent: profilePercent(checks),
        // The one gap that makes a profile unbookable rather than merely thin.
        unbookable: t.availability.length === 0,
        hasVideo: !!t.videoUrl,
        bioLen: (t.bio ?? '').trim().length,
        missing: undone.map(c => c.id),
      }
    })
    .filter(e => e.percent < 100)
    .sort((a, b) => Number(b.unbookable) - Number(a.unbookable) || a.percent - b.percent)

  // Demand ↔ supply, one row per live sphere. Sorted so the rows that need a
  // decision come first: most searched, and among equals the one with fewest
  // bookable experts. „People look here and there is nobody" is the whole point
  // of the table — a category with demand and no supply is a recruiting target,
  // and it is invisible in the zero-result query above (that one only sees
  // free-text searches, not a category filter that returned an empty page).
  const tally = <T,>(rows: T[], slug: (r: T) => string | null | undefined) => {
    const m: Record<string, number> = {}
    for (const r of rows) { const s = slug(r); if (s) m[s] = (m[s] ?? 0) + 1 }
    return m
  }
  const searchBySlug: Record<string, number> = {}
  for (const r of catSearches) searchBySlug[r.slug] = r.n
  const expertBySlug = tally(catExperts, r => r.category?.slug)
  const bookingBySlug = tally(catBookings, r => r.tutor?.category?.slug)

  // Clients with two or more bookings, over the clients who have any.
  const repeatTotal = clientBookings.length
  const repeatReturning = clientBookings.filter(r => r._count._all > 1).length

  // Slowest to reply, among experts with enough messages for a median to mean
  // anything. Sorted worst-first — this list is a nudge list, not a leaderboard.
  const slowResponders = expertRows
    .filter(t => (t.responseSampleN ?? 0) >= 3 && t.responseMedianMin != null)
    .map(t => ({
      slug: t.slug,
      fullName: t.user?.fullName ?? null,
      medianMin: t.responseMedianMin as number,
      sampleN: t.responseSampleN as number,
    }))
    .sort((a, b) => b.medianMin - a.medianMin)
    .slice(0, 8)

  // ── Browse read as a funnel. Not stitched per visitor (profile views carry no
  // flowId), so these are three MAGNITUDES side by side, not a chain — enough
  // to say whether the cards or the profile is where people stop.
  const browse = {
    searches: searchAll,
    profileViews: profileViews[0]?.n ?? 0,
    bookingOpens: f.opened,
  }

  // ── Concentration. `topShare` is the share of all bookings held by the three
  // busiest experts; with few bookings it is noisy, which is why the raw counts
  // travel with it.
  let bookedTotal = 0
  for (const r of bookingsByTutor) bookedTotal += r._count._all
  const topThree = [...bookingsByTutor].sort((a, b) => b._count._all - a._count._all).slice(0, 3)
  let topThreeTotal = 0
  for (const r of topThree) topThreeTotal += r._count._all
  const concentration = {
    bookings: bookedTotal,
    experts: bookingsByTutor.length,
    topShare: bookedTotal > 0 ? topThreeTotal / bookedTotal : null,
  }

  // ── How long each expert has been waiting for their first booking. The ones
  // still waiting are the list worth reading; a median over people who already
  // booked says nothing about them.
  const firstBookingAt = new Map<string, Date>()
  const waitingRows = await prisma.booking
    .groupBy({ by: ['tutorId'], _min: { createdAt: true } })
    .catch(() => [] as { tutorId: string; _min: { createdAt: Date | null } }[])
  for (const r of waitingRows) if (r._min.createdAt) firstBookingAt.set(r.tutorId, r._min.createdAt)
  const DAY = 86_400_000
  const waiting = tutorAges
    .filter(tp => !firstBookingAt.has(tp.id))
    .map(tp => ({
      slug: tp.slug,
      fullName: tp.user?.fullName ?? null,
      days: Math.floor((Date.now() - new Date(tp.createdAt).getTime()) / DAY),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 10)

  // ── Demand vs supply by hour of the Tbilisi day, normalised to their own
  // peaks so two different units can share one row of bars. What matters is the
  // SHAPE: an hour people search and nobody is free is a fixable mismatch.
  const dh: number[] = Array(24).fill(0)
  for (const r of demandHours) dh[r.h] = r.n
  const sh: number[] = Array(24).fill(0)
  for (const r of supplyHours) sh[r.h] = r.n
  const hours = { demand: dh, supply: sh }

  // ── Who cancels.
  const cancelBy = { STUDENT: 0, TUTOR: 0, ADMIN: 0, unknown: 0 }
  for (const r of cancels) {
    const k = (r.cancelledBy ?? 'unknown') as keyof typeof cancelBy
    cancelBy[k in cancelBy ? k : 'unknown'] += r._count._all
  }

  const categories = liveCats
    .map(c => ({
      slug: c.slug,
      name: c.name,
      searches: searchBySlug[c.slug] ?? 0,
      experts: expertBySlug[c.slug] ?? 0,
      bookings: bookingBySlug[c.slug] ?? 0,
    }))
    .sort((a, b) => b.searches - a.searches || a.experts - b.experts || a.name.localeCompare(b.name, 'ka'))

  return NextResponse.json({
    days,
    retentionDays: EVENT_RETENTION_DAYS,
    categories,
    repeat: { clients: repeatTotal, returning: repeatReturning },
    prev: { attempts: prevFunnel[0]?.attempts ?? 0, created: prevFunnel[0]?.created ?? 0 },
    slowResponders,
    browse,
    concentration,
    waiting,
    hours,
    cancelBy,
    search: {
      total: searchAll,
      zero: totals.zero,
      // Share of searches that found nothing. Null (not 0) when there were no
      // searches at all — „0%" would read as „everything is fine".
      zeroShare: searchAll > 0 ? totals.zero / searchAll : null,
    },
    zeroQueries: zeroQueries.map(r => ({
      q: r.q,
      n: r.n,
      lastAt: new Date(r.lastAt).toISOString(),
    })),
    funnel: {
      attempts: f.attempts,
      steps: FUNNEL_SPINE.map(s => ({ key: s.key, n: f[s.key] })),
      outcomes: { failed: f.failed, noSlots: f.noSlots, abandoned: f.abandoned },
    },
    failureCodes,
    apply: {
      attempts: af.attempts,
      steps: [
        { key: 'opened', n: af.opened },
        { key: 'profile', n: af.profile },
        { key: 'pricing', n: af.pricing },
        { key: 'submitted', n: af.submitted },
      ],
      outcomes: { failed: af.failed, abandoned: af.abandoned },
      // Contact details come from the User row, never from the half-filled form.
      dropoffs: applyDropoffs.map(r => ({
        userId: r.userId,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        lastStep: r.lastStep,
        catCount: r.catCount,
        lastAt: new Date(r.lastAt).toISOString(),
        // The field that refused them, or null when they simply left. „Stopped"
        // and „was refused" are opposite problems and used to look identical.
        blockCode: r.blockCode ?? null,
      })),
    },
    experts,
  })
}
