import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function DELETE(_req: Request, ctx: { params: Promise<{ bookingId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const { bookingId } = await ctx.params

  const review = await prisma.review.findUnique({ where: { bookingId } })
  if (!review) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (review.studentId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const tutorId = review.tutorId
  await prisma.review.delete({ where: { bookingId } })

  // Recompute tutor rating aggregate after removal.
  const agg = await prisma.review.aggregate({
    where: { tutorId },
    _avg: { rating: true },
    _count: { rating: true },
  })
  await prisma.tutorProfile.update({
    where: { id: tutorId },
    data: {
      rating: agg._avg.rating ?? 0,
      reviewsCount: agg._count.rating ?? 0,
    },
  })

  return NextResponse.json({ ok: true })
}
