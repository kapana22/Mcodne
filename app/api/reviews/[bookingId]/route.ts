import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'

// Expert reply to a student review. One reply per review (editing the existing
// reply is allowed — it overwrites). Shown publicly next to the review on the
// expert profile (tutorResponse/respondedAt already ship in /api/tutors/[id]).
const ReplyBody = z.object({
  response: z.string().min(2).max(600),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ bookingId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const { bookingId } = await ctx.params
  const parsed = ReplyBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const review = await prisma.review.findUnique({
    where: { bookingId },
    include: { tutor: { select: { userId: true } } },
  })
  if (!review) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  // Only the reviewed expert may reply — not admins, not the student.
  if (review.tutor.userId !== user.id) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const response = parsed.data.response.trim()
  if (response.length < 2) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const isFirstReply = review.respondedAt === null
  const updated = await prisma.review.update({
    where: { bookingId },
    data: { tutorResponse: response, respondedAt: new Date() },
  })

  // Tell the student — but only on the FIRST reply; silent on edits so a
  // typo-fix doesn't ping them twice.
  if (isFirstReply) {
    await notify(review.studentId, {
      type: 'REVIEW_NEW',
      title: 'ექსპერტმა უპასუხა შენს შეფასებას',
      body: response.slice(0, 80),
      href: `/student/bookings/${bookingId}`,
    })
  }

  return NextResponse.json({
    ok: true,
    tutorResponse: updated.tutorResponse,
    respondedAt: updated.respondedAt,
  })
}

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
  // Delete AND recompute the tutor's aggregate in one transaction (matching the
  // create path and the admin delete path) so a mid-write failure can't leave the
  // review gone while the profile's rating/reviewsCount keep counting it — the
  // public listing sorts by that rating.
  await prisma.$transaction(async tx => {
    await tx.review.delete({ where: { bookingId } })
    const agg = await tx.review.aggregate({
      where: { tutorId },
      _avg: { rating: true },
      _count: { rating: true },
    })
    await tx.tutorProfile.update({
      where: { id: tutorId },
      data: {
        rating: agg._avg.rating ?? 0,
        reviewsCount: agg._count.rating ?? 0,
      },
    })
  })

  return NextResponse.json({ ok: true })
}
