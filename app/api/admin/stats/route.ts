import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { BOOKING_REVENUE_ONLY } from '@/lib/packages'
import { isBookingLive } from '@/lib/bookingLive'
import { ensureDbReady } from '@/lib/dbBoot'
import { b2bFeatureExists } from '@/lib/b2b'
import { requestsFeatureExists, providersFeatureExists } from '@/lib/requests'
import { ROLE } from '@/lib/roles'

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  // Sessions that COULD be live now: CONFIRMED, starting within the last
  // 4h (>= max session length) so any still-running one is in range.
  const now = Date.now()
  const liveWindowStart = new Date(now - 240 * 60_000)
  await ensureDbReady().catch(() => {})
  const [users, tutors, students, bookings, pendingApps, completed, revenue, pkgRevenue, liveCandidates, helpOpen, b2bLeads, newRequests, pendingMasters, openDisputes] = await Promise.all([
    prisma.user.count(),
    // Profiles, not roles — see the note in /api/admin/analytics. An expert is
    // somebody with a TutorProfile; the role decides what else they may do.
    prisma.tutorProfile.count(),
    prisma.user.count({ where: { role: ROLE.CLIENT } }),
    prisma.booking.count(),
    prisma.tutorApplication.count({ where: { status: 'SUBMITTED' } }),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    // THE REVENUE RULE (lib/packages → BOOKING_REVENUE_ONLY). Without the
    // exclusion this summed a package lesson's per-lesson SHARE on top of the
    // lump already taken at the Enrollment — so the dashboard headline, and the
    // „კომისია ≈ 15%" derived from it, both over-reported. The package money is
    // added back below from the Enrollment, exactly as /api/admin/finance and
    // /api/tutor/earnings do it; all three now answer the same number.
    prisma.booking.aggregate({ _sum: { price: true }, where: { status: 'COMPLETED', ...BOOKING_REVENUE_ONLY } }),
    prisma.enrollment.aggregate({ _sum: { priceTotal: true }, where: { paidAt: { not: null } } }),
    prisma.booking.findMany({
      where: { status: { in: ['CONFIRMED', 'LIVE'] }, startAt: { gte: liveWindowStart, lte: new Date(now) } },
      select: { status: true, startAt: true, durationMin: true },
    }),
    // The help-chat badge rides along here rather than on its own request.
    // It used to be a separate `/api/admin/help?days=7` call fired from the
    // shell on EVERY admin page load — seven SQL queries including a 100-row
    // message scan, to render one small number. This is one COUNT on an
    // indexed column, on a request the shell already makes.
    prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "HelpMessage" WHERE "status" = 'new'`,
    ).then(r => Number(r[0]?.n ?? 0)).catch(() => 0),
    // Unanswered B2B enquiries, riding along for the same reason the help count
    // does: the shell already makes this request, and a queue with a person
    // waiting at the other end of it has to announce itself. Without this a
    // lead sat in a tab nobody opens until somebody thought to look.
    //
    // `.catch(() => 0)` because this table only exists once lib/dbBoot has run.
    // A B2B count is never worth 500-ing the whole admin shell over — every
    // other badge on the panel would go with it.
    b2bFeatureExists()
      ? prisma.businessLead.count({ where: { status: 'NEW' } }).catch(() => 0)
      : Promise.resolve(0),
    // Unverified requests — the same kind of number as the two above: a queue
    // with a person waiting for a PHONE CALL at the other end, and the whole
    // feature dies if it goes unopened for a day. Same .catch(() => 0)
    // contract: a badge is never worth 500-ing the shell over.
    requestsFeatureExists()
      ? prisma.serviceRequest.count({ where: { status: 'NEW' } }).catch(() => 0)
      : Promise.resolve(0),
    // Submitted tradesperson applications — the „ხელოსნები" badge. Follows the
    // SUPPLY-side switch exactly as the tab does (D6): with FEATURE_PROVIDERS
    // off the tab is not drawn, so the count is 0 without touching the table.
    // Same .catch(() => 0) contract as the three above.
    providersFeatureExists()
      ? prisma.masterApplication.count({ where: { status: 'SUBMITTED' } }).catch(() => 0)
      : Promise.resolve(0),
    // Unresolved disputes — the „დავები" badge. `resolvedAt` is the real
    // resolution marker on the Dispute model (the PATCH route claims it
    // atomically); `outcome` is what was decided, not whether.
    prisma.dispute.count({ where: { resolvedAt: null } }).catch(() => 0),
  ])
  // Derived truth — the stored LIVE status is never written (see lib/bookingLive).
  const live = liveCandidates.filter(isBookingLive).length
  return NextResponse.json({
    users, tutors, students, bookings, pendingApps, completed, live, helpOpen, b2bLeads, newRequests, pendingMasters, openDisputes,
    revenue: ((revenue as any)._sum?.price ?? 0) + ((pkgRevenue as any)._sum?.priceTotal ?? 0),
  })
}
