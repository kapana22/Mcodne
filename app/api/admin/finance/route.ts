import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { BOOKING_REVENUE_ONLY } from '@/lib/packages'
import { COMMISSION_PCT, PAYMENTS_LIVE, TUTOR_PAYOUT_PCT } from '@/lib/flags'

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  // Month windows are scoped by `startAt` — when the session happened, i.e. when
  // the money was earned. `updatedAt` (the old scope) is bumped by ANY later
  // write, so resolving a May booking's dispute in July moved its whole price
  // into July's GMV and out of the baseline, corrupting growthPct both ways.
  // The Booking model has no completion timestamp, so startAt is the stable one.
  const [completed, monthCompleted, prevMonthCompleted, pending] = await Promise.all([
    prisma.booking.aggregate({ where: { status: 'COMPLETED', ...BOOKING_REVENUE_ONLY }, _sum: { price: true }, _count: { _all: true } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', ...BOOKING_REVENUE_ONLY, startAt: { gte: monthStart } }, _sum: { price: true }, _count: { _all: true } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', ...BOOKING_REVENUE_ONLY, startAt: { gte: prevMonthStart, lt: monthStart } }, _sum: { price: true } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', ...BOOKING_REVENUE_ONLY, payoutStatus: 'PENDING' }, _sum: { price: true }, _count: { _all: true } }),
  ])

  /* PACKAGE MONEY, ADDED BACK. The aggregates above exclude package lessons
     (BOOKING_REVENUE_ONLY) so a package is not counted twice — but excluding
     without adding does not fix a double count, it LOSES the money instead,
     and that is what this screen was doing: every lari a package brought in
     was missing from GMV and from the commission derived off it.
     /api/tutor/earnings has done it this way since 2026-08-05; the admin's own
     screen disagreed with the expert's. Recognised at `paidAt`, the moment the
     money changed hands — the same basis as `startAt` for a single session. */
  const [pkgTotal, pkgMonth, pkgPrev] = await Promise.all([
    prisma.enrollment.aggregate({ _sum: { priceTotal: true }, _count: { _all: true }, where: { paidAt: { not: null } } }),
    prisma.enrollment.aggregate({ _sum: { priceTotal: true }, where: { paidAt: { gte: monthStart } } }),
    prisma.enrollment.aggregate({ _sum: { priceTotal: true }, where: { paidAt: { gte: prevMonthStart, lt: monthStart } } }),
  ])

  const gmvTotal = (completed._sum.price ?? 0) + (pkgTotal._sum.priceTotal ?? 0)
  const gmvMonth = (monthCompleted._sum.price ?? 0) + (pkgMonth._sum.priceTotal ?? 0)
  const gmvPrev  = (prevMonthCompleted._sum.price ?? 0) + (pkgPrev._sum.priceTotal ?? 0)
  const growth = gmvPrev > 0 ? Math.round(((gmvMonth - gmvPrev) / gmvPrev) * 100) : null

  return NextResponse.json({
    gmv: gmvTotal,
    gmvMonth,
    growthPct: growth,
    /* THE CANONICAL CONSTANTS, not a literal — and gated on PAYMENTS_LIVE,
       exactly as /api/tutor/earnings does it.
       Two bugs in one line, both found 2026-08-13:
       · `0.15` is the hardcoded drift lib/flags.ts exists to prevent („Every
         copy string that mentions commission must read from here so the
         '15% here / 10% there' mismatch can never regress") — and
         /api/tutor/earnings even writes „never a hardcoded 0.85 that could
         drift" while this file did precisely that;
       · payments are NOT live, so the platform withholds nothing. The expert's
         own screen therefore reports the FULL amount, while this one reported a
         commission and a net payout that nobody is collecting or owed. */
    commission: PAYMENTS_LIVE ? Math.round(gmvTotal * (COMMISSION_PCT / 100)) : 0,
    completedCount: completed._count._all,
    // The caption under GMV counted sessions only, while the number above it
    // now also carries package money -- which is not those sessions. The
    // count of what the figure is actually made of has to ride along.
    packageCount: pkgTotal._count._all,
    pendingPayout: Math.round((pending._sum.price ?? 0) * (PAYMENTS_LIVE ? TUTOR_PAYOUT_PCT / 100 : 1)),
    pendingCount: pending._count._all,
  })
}
