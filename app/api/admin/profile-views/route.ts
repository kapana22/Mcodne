import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { avatarSrc } from '@/lib/avatarSrc'
import { parseIntParam } from '@/lib/apiParams'
import { futureWindowWhere } from '@/lib/bookability'
import { EVENTS, EVENT_RETENTION_DAYS } from '@/lib/events'

/**
 * WHO LOOKED, AND DID THEY BOOK.
 *
 * The `profile_view` event has been collected since 2026-07-27 and nothing ever
 * read it back. 220 rows sat in the table while the admin panel could show a
 * booking funnel but not the step BEFORE it — so „nobody sees this expert" and
 * „people see them and don't book" were indistinguishable, and those two have
 * opposite fixes (recruit traffic vs. fix the profile/price/availability).
 *
 * Two shapes, one route:
 *   GET ?days=7|30              → one row per expert: views, unique viewers,
 *                                 bookings, conversion, and whether they are
 *                                 even bookable right now.
 *   GET ?days=7&tutorId=<id>    → the named viewers of ONE expert, each with
 *                                 how many times they looked and whether they
 *                                 ended up booking.
 *
 * ── WHAT „VIEWS" MEANS, EXACTLY ─────────────────────────────────────────────
 * A view is already de-duplicated at write time (lib/events `firstViewInWindow`)
 * so one human reading one profile counts once, not once per fetch the page and
 * booking sheet happen to make. Excluded at write time: bots, ADMIN, and the
 * expert viewing themselves.
 *
 * `uniqueViewers` counts DISTINCT userId and therefore counts only SIGNED-IN
 * people — an anonymous visitor has no identity to de-duplicate by, and the
 * Event row deliberately stores nothing but `userId` (no ip, no fingerprint).
 * So `anonViews` is a view count, not a people count, and the UI must not add
 * the two into a „visitors" number. That is a real limit, not an oversight:
 * inventing an identity for anonymous visitors is exactly what we chose not to
 * store.
 *
 * ── NAMES ───────────────────────────────────────────────────────────────────
 * The drill-down returns real names and emails. That is consistent with what
 * this panel already does for abandoned applications (/api/admin/insights) and
 * is limited to ADMIN. It is deliberately NOT exposed to the expert whose
 * profile was viewed: „these 9 people looked at you" changes how a client
 * browses, and browsing has to feel unobserved.
 */

const ALLOWED_DAYS = [7, 30] as const

export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const url = new URL(req.url)
  const asked = parseIntParam(url.searchParams.get('days'), { fallback: 7, min: 1, max: EVENT_RETENTION_DAYS })
  // Snap to the two windows the UI offers so the SQL can't be handed anything
  // the panel has no button for.
  const days: number = ALLOWED_DAYS.includes(asked as (typeof ALLOWED_DAYS)[number])
    ? asked
    : (asked > 7 ? 30 : 7)
  const tutorId = url.searchParams.get('tutorId')?.trim() || null

  /* ═══════════ drill-down: who looked at ONE expert ═══════════════════════ */
  if (tutorId) {
    const [viewers, anon, booked] = await Promise.all([
      // Signed-in viewers, most-recent first. `views` is how many separate
      // visits they made — a repeat viewer who never books is the single
      // highest-intent row on this whole panel.
      prisma
        .$queryRawUnsafe<{ userId: string; fullName: string | null; email: string; views: number; lastAt: Date }[]>(
          `SELECT e."userId"        AS "userId",
                  u."fullName"      AS "fullName",
                  u."email"         AS "email",
                  COUNT(*)::int     AS "views",
                  MAX(e."at")       AS "lastAt"
             FROM "Event" e
             JOIN "User" u ON u."id" = e."userId"
            WHERE e."name" = $1
              AND e."props"->>'tutorId' = $2
              AND e."at" > now() - ($3 * interval '1 day')
              AND e."userId" IS NOT NULL
            GROUP BY 1, 2, 3
            ORDER BY MAX(e."at") DESC
            LIMIT 100`,
          EVENTS.PROFILE_VIEW,
          tutorId,
          days,
        )
        .catch(() => []),
      prisma
        .$queryRawUnsafe<{ n: number }[]>(
          `SELECT COUNT(*)::int AS "n"
             FROM "Event"
            WHERE "name" = $1 AND "props"->>'tutorId' = $2
              AND "at" > now() - ($3 * interval '1 day')
              AND "userId" IS NULL`,
          EVENTS.PROFILE_VIEW,
          tutorId,
          days,
        )
        .catch(() => [{ n: 0 }]),
      // Every client who has EVER booked this expert — not just inside the
      // window. „Looked, then booked" is the question; a booking made the day
      // after the window closes still answers it.
      prisma.booking
        .findMany({ where: { tutorId }, select: { studentId: true }, distinct: ['studentId'] })
        .catch(() => [] as { studentId: string }[]),
    ])

    const bookedIds = new Set(booked.map(b => b.studentId))
    return NextResponse.json({
      days,
      tutorId,
      anonViews: anon[0]?.n ?? 0,
      viewers: viewers.map(v => ({
        userId: v.userId,
        fullName: v.fullName,
        email: v.email,
        views: v.views,
        lastAt: new Date(v.lastAt).toISOString(),
        booked: bookedIds.has(v.userId),
      })),
    })
  }

  /* ═══════════ overview: one row per expert ══════════════════════════════ */
  const [rows, bookingRows, profiles] = await Promise.all([
    prisma
      .$queryRawUnsafe<{
        tutorId: string; views: number; uniqueViewers: number; anonViews: number; lastAt: Date
      }[]>(
        `SELECT "props"->>'tutorId'                                    AS "tutorId",
                COUNT(*)::int                                          AS "views",
                COUNT(DISTINCT "userId")::int                          AS "uniqueViewers",
                COUNT(*) FILTER (WHERE "userId" IS NULL)::int          AS "anonViews",
                MAX("at")                                              AS "lastAt"
           FROM "Event"
          WHERE "name" = $1
            AND "at" > now() - ($2 * interval '1 day')
            AND "props"->>'tutorId' IS NOT NULL
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 200`,
        EVENTS.PROFILE_VIEW,
        days,
      )
      .catch(() => []),
    // Bookings created inside the same window, so views and bookings describe
    // the same period and the conversion below is not comparing two eras.
    prisma
      .$queryRawUnsafe<{ tutorId: string; n: number }[]>(
        `SELECT "tutorId" AS "tutorId", COUNT(*)::int AS "n"
           FROM "Booking"
          WHERE "createdAt" > now() - ($1 * interval '1 day')
          GROUP BY 1`,
        days,
      )
      .catch(() => []),
    // Names, and — crucially — whether the expert can be booked AT ALL right
    // now. A high view count with zero upcoming windows is not a conversion
    // problem, it is a dead end, and the two must never be read the same way.
    prisma.tutorProfile
      .findMany({
        select: {
          id: true, slug: true, available: true,
          user: { select: { id: true, fullName: true, avatarUrl: true, suspendedAt: true } },
          _count: { select: { consultations: true } },
          availability: { where: futureWindowWhere(), select: { id: true }, take: 1 },
        },
        take: 500,
      })
      .catch(() => []),
  ])

  const bookingsBy = new Map(bookingRows.map(b => [b.tutorId, b.n]))
  const profileBy = new Map(profiles.map(p => [p.id, p]))

  const experts = rows.map(r => {
    const p = profileBy.get(r.tutorId)
    const bookings = bookingsBy.get(r.tutorId) ?? 0
    return {
      tutorId: r.tutorId,
      slug: p?.slug ?? null,
      fullName: p?.user?.fullName ?? null,
      avatarUrl: avatarSrc(p?.user?.id, p?.user?.avatarUrl),
      views: r.views,
      uniqueViewers: r.uniqueViewers,
      anonViews: r.anonViews,
      bookings,
      // Deliberately per VIEW, not per unique viewer: uniqueViewers counts only
      // signed-in people, so dividing by it would inflate the rate on every
      // expert whose audience is mostly anonymous — i.e. all of them.
      //
      // Sent as a RATIO, not a rounded percentage: 1 booking in 234 views is
      // 0.4%, and rounding that to 0 here would destroy the distinction between
      // „almost nobody booked" and „nobody booked" before the UI ever sees it.
      // The formatting decision belongs to the renderer (see ratePct).
      convertRate: r.views > 0 ? bookings / r.views : null,
      lastAt: new Date(r.lastAt).toISOString(),
      // Context that changes the meaning of every number on the row.
      bookable: !!p && p.available && !p.user?.suspendedAt && p.availability.length > 0 && p._count.consultations > 0,
      hasSlots: !!p && p.availability.length > 0,
      hasService: !!p && p._count.consultations > 0,
      listed: !!p && p.available && !p.user?.suspendedAt,
    }
  })

  const totals = experts.reduce(
    (a, e) => ({
      views: a.views + e.views,
      bookings: a.bookings + e.bookings,
      anonViews: a.anonViews + e.anonViews,
    }),
    { views: 0, bookings: 0, anonViews: 0 },
  )

  return NextResponse.json({
    days,
    retentionDays: EVENT_RETENTION_DAYS,
    totals: {
      ...totals,
      experts: experts.length,
      // How much of the traffic lands on a profile that cannot be booked. This
      // is the number that turns „our conversion is bad" into a to-do list.
      deadEndViews: experts.filter(e => !e.bookable).reduce((n, e) => n + e.views, 0),
    },
    experts,
  })
}
