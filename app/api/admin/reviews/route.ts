import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'

// List reviews with filters — flagged (rating < 2 by default), search body/authors.
export async function GET(req: Request) {
  await requireRole('ADMIN')
  const { searchParams } = new URL(req.url)
  const maxRating = Number(searchParams.get('maxRating') ?? '5')
  const q = searchParams.get('q')?.trim()
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 300)

  const where: any = {}
  if (maxRating < 5) where.rating = { lte: maxRating }
  if (q) {
    where.OR = [
      { body: { contains: q, mode: 'insensitive' } },
      { student: { fullName: { contains: q, mode: 'insensitive' } } },
      { tutor: { user: { fullName: { contains: q, mode: 'insensitive' } } } },
    ]
  }

  const reviews = await prisma.review.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      student: { select: { id: true, fullName: true, avatarUrl: true } },
      tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
      booking: { select: { id: true, topic: true, ref: true } },
    },
  })
  return NextResponse.json(reviews)
}

const DelBody = z.object({ reason: z.string().max(300).optional() })

// Delete a review. Also decrement TutorProfile.reviewsCount and recompute rating.
export async function DELETE(req: Request) {
  const admin = await requireRole('ADMIN')
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'MISSING_ID' }, { status: 400 })

  const parsed = DelBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const review = await prisma.review.findUnique({
    where: { id },
    select: { id: true, tutorId: true, rating: true, studentId: true, body: true },
  })
  if (!review) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // Recompute tutor rating/count in a transaction so we don't drift.
  await prisma.$transaction(async tx => {
    await tx.review.delete({ where: { id } })
    const stats = await tx.review.aggregate({
      where: { tutorId: review.tutorId },
      _count: { _all: true },
      _avg: { rating: true },
    })
    const count = stats._count._all
    const avg = stats._avg.rating ?? 0
    await tx.tutorProfile.update({
      where: { id: review.tutorId },
      data: { reviewsCount: count, rating: avg },
    })
  })

  await audit(admin.id, 'review.delete', {
    targetType: 'Review',
    targetId: id,
    meta: { reason: parsed.data.reason, tutorId: review.tutorId, studentId: review.studentId, prevRating: review.rating, prevBody: review.body.slice(0, 200) },
  })

  return NextResponse.json({ ok: true })
}
