import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { TUTOR_PAYOUT_PCT } from '@/lib/flags'

// Single source of truth for the tutor's cut — derived from the canonical
// commission percentage in lib/flags.ts (was a hardcoded 0.85 that could drift).
const TUTOR_SHARE = TUTOR_PAYOUT_PCT / 100

export async function GET() {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) {
    return NextResponse.json({
      totalEarned: 0,
      pendingPayout: 0,
      completedCount: 0,
      transactions: [],
    })
  }

  const [completed, pending, lifetime] = await Promise.all([
    // Recent list for the transactions table (display only).
    prisma.booking.findMany({
      where: { tutorId: profile.id, status: 'COMPLETED' },
      orderBy: { startAt: 'desc' },
      take: 50,
      include: { student: { select: { id: true, fullName: true, avatarUrl: true } } },
    }),
    prisma.booking.aggregate({
      _sum: { price: true },
      where: { tutorId: profile.id, status: 'COMPLETED', payoutStatus: 'PENDING' },
    }),
    // Lifetime totals across ALL completed bookings — not just the recent 50,
    // which previously undercounted any tutor with more than 50 sessions.
    prisma.booking.aggregate({
      _sum: { price: true },
      _count: true,
      where: { tutorId: profile.id, status: 'COMPLETED' },
    }),
  ])

  const totalEarned = Math.round(((lifetime as any)._sum?.price ?? 0) * TUTOR_SHARE)
  const pendingPayout = Math.round(((pending as any)._sum?.price ?? 0) * TUTOR_SHARE)
  const completedCount = (lifetime as any)._count ?? 0

  const transactions = completed.map(b => ({
    id: b.id,
    ref: b.ref,
    topic: b.topic,
    startAt: b.startAt,
    durationMin: b.durationMin,
    gross: b.price,
    net: Math.round(b.price * TUTOR_SHARE),
    payoutStatus: b.payoutStatus,
    student: b.student,
  }))

  return NextResponse.json({
    totalEarned,
    pendingPayout,
    completedCount,
    transactions,
  })
}
