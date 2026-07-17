import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET() {
  await requireRole('ADMIN')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [completed, monthCompleted, prevMonthCompleted, pending] = await Promise.all([
    prisma.booking.aggregate({ where: { status: 'COMPLETED' }, _sum: { price: true }, _count: { _all: true } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', updatedAt: { gte: monthStart } }, _sum: { price: true }, _count: { _all: true } }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', updatedAt: { gte: prevMonthStart, lt: monthStart } }, _sum: { price: true } }),
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
