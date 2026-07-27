import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET() {
  await requireRole('ADMIN')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  // Month windows are scoped by `startAt` — when the session happened, i.e. when
  // the money was earned. `updatedAt` (the old scope) is bumped by ANY later
  // write, so resolving a May booking's dispute in July moved its whole price
  // into July's GMV and out of the baseline, corrupting growthPct both ways.
  // The Booking model has no completion timestamp, so startAt is the stable one.
  const [completed, monthCompleted, prevMonthCompleted, pending] = await Promise.all([
    prisma.booking.aggregate({ where: { status: 'COMPLETED' }, _sum: { price: true }, _count: { _all: true } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', startAt: { gte: monthStart } }, _sum: { price: true }, _count: { _all: true } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', startAt: { gte: prevMonthStart, lt: monthStart } }, _sum: { price: true } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', payoutStatus: 'PENDING' }, _sum: { price: true }, _count: { _all: true } }),
  ])

  const gmvTotal = completed._sum.price ?? 0
  const gmvMonth = monthCompleted._sum.price ?? 0
  const gmvPrev  = prevMonthCompleted._sum.price ?? 0
  const growth = gmvPrev > 0 ? Math.round(((gmvMonth - gmvPrev) / gmvPrev) * 100) : null

  return NextResponse.json({
    gmv: gmvTotal,
    gmvMonth,
    growthPct: growth,
    commission: Math.round(gmvTotal * 0.15),
    completedCount: completed._count._all,
    pendingPayout: Math.round((pending._sum.price ?? 0) * 0.85),
    pendingCount: pending._count._all,
  })
}
