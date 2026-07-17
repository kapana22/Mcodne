import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'

const Body = z.object({
  bookingId: z.string(),
  rating: z.number().int().min(1).max(5),
  body: z.string().min(3).max(2000),
})

// Reviews only allowed within 30 days of session end.
const REVIEW_WINDOW_DAYS = 30

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const booking = await prisma.booking.findFirst({
    where: { id: parsed.data.bookingId, studentId: user.id },
    include: { tutor: { select: { userId: true } } },
  })
  if (!booking) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  if (booking.status !== 'COMPLETED') {
    return NextResponse.json({ ok: false, error: 'NOT_COMPLETED' }, { status: 400 })
  }
  // Refuse reviews on bookings the cleanup cron auto-completed on the
  // benefit-of-the-doubt fallback (≥48h past the session end, tutor never
  // clicked "mark complete"). The session may not have actually happened —
  // a rating from a possibly-absent participant would corrupt the tutor's
  // aggregate. Student can dispute via /api/disputes if this was wrong.
  if ((booking as any).autoCompleted === true) {
    return NextResponse.json({ ok: false, error: 'AUTO_COMPLETED' }, { status: 400 })
  }

  const sessionEnd = booking.startAt.getTime() + booking.durationMin * 60_000
  const windowClosesAt = sessionEnd + REVIEW_WINDOW_DAYS * 24 * 3600_000
  if (Date.now() > windowClosesAt) {
    return NextResponse.json({ ok: false, error: 'WINDOW_CLOSED' }, { status: 400 })
  }

  const body = parsed.data.body.trim()
  const review = await prisma.review.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      studentId: user.id,
      tutorId: booking.tutorId,
      rating: parsed.data.rating,
      body,
    },
    update: {
      rating: parsed.data.rating,
      body,
    },
  })

  const agg = await prisma.review.aggregate({
    where: { tutorId: booking.tutorId },
    _avg: { rating: true },
    _count: { rating: true },
  })
  await prisma.tutorProfile.update({
    where: { id: booking.tutorId },
    data: {
      rating: agg._avg.rating ?? 0,
      reviewsCount: agg._count.rating ?? 0,
    },
  })

  await notify(booking.tutor.userId, {
    type: 'REVIEW_NEW',
    title: `ახალი შეფასება · ${parsed.data.rating}/5`,
    body: body.slice(0, 80),
    href: `/tutor/bookings/${booking.id}`,
  })

  return NextResponse.json({ ok: true, id: review.id })
}
