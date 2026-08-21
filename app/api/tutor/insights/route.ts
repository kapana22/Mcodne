import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { EVENTS } from '@/lib/events'
import { ROLE } from '@/lib/roles'

// „PROFILE SIGNAL" — the expert-facing half of the insights the admin panel
// already has. It exists to answer ONE question an approved expert currently
// has no way to answer: is my profile working?
//
// Silence after publishing availability has two opposite causes — nobody has
// SEEN the profile (a visibility problem: no free time, no category, thin
// profile) or people see it and don't BOOK (a persuasion problem: headline,
// bio, price). Without views the two are indistinguishable, so the rational
// response to silence is to give up. Views + bookings over the same window is
// the smallest pair of numbers that tells them apart.
//
// ISOLATION. An expert may only ever see their OWN numbers. The tutorId is
// resolved from the SESSION, not from the query string: a `?tutorId=` from a
// TUTOR is ignored outright (not rejected — ignored, so there is no probing
// oracle either). Only ADMIN may aim it at someone else.
//
// COST. Two bounded reads. The Event count is `name = … AND at > now() - N days`,
// which rides the (name, at DESC) index lib/dbBoot creates, with N restricted
// to 7/30; the booking count is a plain indexed COUNT. Nothing is unbounded and
// nothing is grouped.
//
// DEGRADES, NEVER 500s. "Event" is boot-time DDL (not in schema.prisma) and may
// legitimately be empty or momentarily absent — a failed read falls back to 0,
// which the UI then presents honestly as „0 ნახვა" rather than as an error.
//
// ── Why there is no per-expert BOOKING-FUNNEL stage here ────────────────────
// The booking funnel (components/booking/funnelEvents.ts) stitches its steps by
// an anonymous per-attempt `flowId`, and its prop allow-list —
// BOOKING_FUNNEL_PROP_KEYS — carries NO tutor identifier. So a
// `booking_flow_opened` row cannot be attributed to the expert it was aimed at,
// and „attempts started for me" is not derivable today. Inventing it from a
// user-id/time-proximity join would exclude every anonymous attempt (most of
// them) and print a number smaller than the real bookings below — a lie in the
// expert's favour's opposite direction, but a lie. The one-line fix, when the
// funnel contract can be edited: add 'tutorId' to BOOKING_FUNNEL_PROP_KEYS and
// send it from BookingFlow's `opened` event; this route then adds one more
// COUNT with `props->>'tutorId' = $tutorId`.
export const dynamic = 'force-dynamic'

const ALLOWED_DAYS = [7, 30] as const
export type InsightsDays = (typeof ALLOWED_DAYS)[number]

/** Cuid-ish shape. Only used to reject junk before it reaches a bound param. */
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/

export async function GET(req: Request) {
  const auth = await requireRoleApi([ROLE.PROVIDER, ROLE.ADMIN])
  if (auth.response) return auth.response
  const user = auth.user

  const url = new URL(req.url)
  const asked = Number(url.searchParams.get('days'))
  const days: InsightsDays = (ALLOWED_DAYS as readonly number[]).includes(asked)
    ? (asked as InsightsDays)
    : 7

  // WHOSE numbers. A TUTOR always gets their own profile, whatever the query
  // string says — that is the invariant this whole route exists under.
  let tutorId: string | null = null
  if (user.role === 'ADMIN') {
    const wanted = url.searchParams.get('tutorId')
    if (wanted && ID_RE.test(wanted)) tutorId = wanted
  }
  if (!tutorId) {
    const own = await prisma.tutorProfile
      .findUnique({ where: { userId: user.id }, select: { id: true } })
      .catch(() => null)
    tutorId = own?.id ?? null
  }

  // No profile (an ADMIN without one, or an account mid-approval) — an honest
  // empty answer, never a 404 the dashboard has to special-case.
  if (!tutorId) {
    return NextResponse.json({ days, tutorId: null, views: 0, signedInViews: 0, bookings: 0, conversion: null })
  }

  await ensureDbReady().catch(() => {})

  const since = new Date(Date.now() - days * 86_400_000)

  const [viewRows, bookings] = await Promise.all([
    prisma
      .$queryRawUnsafe<{ views: number; signedIn: number }[]>(
        `SELECT COUNT(*)::int AS "views",
                COUNT(*) FILTER (WHERE "props"->>'signedIn' = 'true')::int AS "signedIn"
           FROM "Event"
          WHERE "name" = $1
            AND "at" > now() - ($2 * interval '1 day')
            AND "props"->>'tutorId' = $3`,
        EVENTS.PROFILE_VIEW,
        days,
        tutorId,
      )
      .catch(() => []),
    // Bookings CREATED in the window, whatever became of them afterwards — the
    // question is whether the profile converted, not whether the session
    // survived. Booking.tutorId is the TutorProfile id, the same id the
    // profile_view prop carries, so the two sides of the ratio agree.
    prisma.booking
      .count({ where: { tutorId, createdAt: { gte: since } } })
      .catch(() => 0),
  ])

  const views = viewRows[0]?.views ?? 0
  const signedInViews = viewRows[0]?.signedIn ?? 0

  return NextResponse.json({
    days,
    tutorId,
    views,
    signedInViews,
    bookings,
    // Null (not 0) when nobody looked: „0%" would read as „you convert nobody",
    // when the truth is „there was nothing to convert".
    conversion: views > 0 ? bookings / views : null,
  })
}
