import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { avatarSrc } from '@/lib/avatarSrc'
import { hasFutureWindow, futureWindowWhere } from '@/lib/bookability'
import { EVENTS } from '@/lib/events'

/**
 * WHO exactly is unbookable — not how many.
 *
 * The სისტემა tab could already say „5 experts with no time" and then link to
 * the PUBLIC browse page, so the one thing an admin needs next — which five —
 * was not obtainable from the panel at all. This tab's own comment states the
 * principle it was failing to follow:
 *
 *   „a count tells you there is a leak, a NAME lets you close it with one
 *    message"
 *
 * The abandoned-application list already works that way. Experts did not.
 *
 * It also answers the second invisible thing: lib/expertActivation has been
 * emailing these people since 2026-07-30 and NOTHING showed it. Five nudges
 * went out on 2026-08-04 and the panel could not report that they had. So each
 * row carries its nudge history — how many, when the last one was — which is
 * what turns „chase them" into „they have had three, call them".
 *
 * `views` is the cost of the gap, and it is the number that decides the order:
 * an unbookable expert with 20 profile views this month is losing 20 people a
 * month, and is worth acting on before an unbookable expert nobody looks at.
 */

const NUDGE_PREFIX = 'expert-setup:'

export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const now = new Date()
  const days = 30

  const [profiles, nudges, views] = await Promise.all([
    // Publicly listed experts only. A paused or suspended profile is not dead
    // inventory — it is off the shelf on purpose — and must not be chased.
    prisma.tutorProfile.findMany({
      where: { available: true, user: { is: { suspendedAt: null } } },
      select: {
        id: true, slug: true, createdAt: true,
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        _count: { select: { consultations: true } },
        availability: { where: futureWindowWhere(now), select: { id: true }, take: 1 },
      },
      take: 300,
    }).catch(() => []),

    // Nudge history. The notification id is
    // `expert-setup:<blocker>:<key>:<tutorProfileId>` — four colon-separated
    // parts either way (`slots` keys carry a `b` prefix), so part 4 is the
    // profile id. This is the only record that the emails ever happened; there
    // is no separate log, by design (the notification IS the stamp).
    prisma.$queryRawUnsafe<{ tutorProfileId: string; blocker: string; n: number; lastAt: Date }[]>(
      `SELECT split_part(id, ':', 4) AS "tutorProfileId",
              split_part(id, ':', 2) AS "blocker",
              COUNT(*)::int          AS "n",
              MAX("createdAt")       AS "lastAt"
         FROM "Notification"
        WHERE id LIKE $1
        GROUP BY 1, 2`,
      `${NUDGE_PREFIX}%`,
    ).catch(() => []),

    // What the gap is costing, per expert.
    prisma.$queryRawUnsafe<{ tutorId: string; n: number }[]>(
      `SELECT "props"->>'tutorId' AS "tutorId", COUNT(*)::int AS "n"
         FROM "Event"
        WHERE "name" = $1 AND "at" > now() - ($2 * interval '1 day')
          AND "props"->>'tutorId' IS NOT NULL
        GROUP BY 1`,
      EVENTS.PROFILE_VIEW,
      days,
    ).catch(() => []),
  ])

  const viewsBy = new Map(views.map(v => [v.tutorId, v.n]))
  const nudgeBy = new Map<string, { n: number; lastAt: Date; blockers: Set<string> }>()
  for (const r of nudges) {
    const cur = nudgeBy.get(r.tutorProfileId)
    if (!cur) nudgeBy.set(r.tutorProfileId, { n: r.n, lastAt: r.lastAt, blockers: new Set([r.blocker]) })
    else {
      cur.n += r.n
      cur.blockers.add(r.blocker)
      if (r.lastAt > cur.lastAt) cur.lastAt = r.lastAt
    }
  }

  const items = profiles
    .map(p => {
      const hasService = p._count.consultations > 0
      const hasSlots = p.availability.length > 0
      // Same order lib/expertActivation uses: with no service, „add your times"
      // is the wrong ask — times are worthless until there is something to book.
      const blocker: 'service' | 'slots' | null = !hasService ? 'service' : !hasSlots ? 'slots' : null
      const nud = nudgeBy.get(p.id)
      return {
        tutorProfileId: p.id,
        userId: p.user?.id ?? null,
        slug: p.slug,
        fullName: p.user?.fullName ?? null,
        email: p.user?.email ?? null,
        avatarUrl: avatarSrc(p.user?.id, p.user?.avatarUrl),
        blocker,
        hasService,
        hasSlots,
        approvedAt: p.createdAt.toISOString(),
        views: viewsBy.get(p.id) ?? 0,
        nudgeCount: nud?.n ?? 0,
        lastNudgeAt: nud ? nud.lastAt.toISOString() : null,
      }
    })
    .filter(e => e.blocker !== null)
    // Most expensive gap first: views lost, then how long they have been broken.
    .sort((a, b) => b.views - a.views || a.approvedAt.localeCompare(b.approvedAt))

  return NextResponse.json({
    days,
    // Counted from the SAME rows the list is built from, so the headline number
    // and the list can never disagree — which is the whole point of this route.
    total: items.length,
    lostViews: items.reduce((n, e) => n + e.views, 0),
    neverNudged: items.filter(e => e.nudgeCount === 0).length,
    items,
    // Sanity denominator for the UI, using the shared predicate.
    liveExperts: await prisma.tutorProfile
      .count({ where: { available: true, user: { is: { suspendedAt: null } }, availability: hasFutureWindow(now) } })
      .catch(() => 0),
  })
}
