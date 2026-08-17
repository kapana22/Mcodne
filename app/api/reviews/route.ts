import { NextResponse } from 'next/server'
import { z } from 'zod'
import { firstGeorgianMessage, georgianRefine } from '@/lib/georgianText'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'

const Body = z.object({
  bookingId: z.string(),
  rating: z.number().int().min(1).max(5),
  // Public on the expert's profile, so it carries the same language gate as
  // every other public text. The SHARE rule (lib/georgianText), not the strict
  // name one — a review legitimately names „Google Ads" or „1C".
  body: z.string().min(3).max(2000).superRefine(georgianRefine('შეფასება')),
  // Hide the reviewer's identity on the public tutor profile (the tutor still
  // sees the review content; /api/tutors/[id] nulls `student` when set).
  anonymous: z.boolean().optional(),
})

// Reviews only allowed within 30 days of session end.
const REVIEW_WINDOW_DAYS = 30

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // Our own copy (the Georgian-language gate) reaches the field; zod's
    // English stays behind the generic code.
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

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
  // Upsert the review AND recompute the tutor's aggregate in one transaction
  // (matching the admin delete path) so a mid-write failure can't leave the
  // review saved while the profile's rating/reviewsCount stay stale — the public
  // listing sorts by that rating.
  const review = await prisma.$transaction(async tx => {
    const r = await tx.review.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        studentId: user.id,
        tutorId: booking.tutorId,
        rating: parsed.data.rating,
        body,
        anonymous: parsed.data.anonymous ?? false,
      },
      update: {
        rating: parsed.data.rating,
        body,
        // Only touch the flag when the client sent it — a re-submit without the
        // field keeps the original choice instead of silently de-anonymizing.
        ...(parsed.data.anonymous === undefined ? {} : { anonymous: parsed.data.anonymous }),
      },
    })
    const agg = await tx.review.aggregate({
      where: { tutorId: booking.tutorId },
      _avg: { rating: true },
      _count: { rating: true },
    })
    await tx.tutorProfile.update({
      where: { id: booking.tutorId },
      data: {
        rating: agg._avg.rating ?? 0,
        reviewsCount: agg._count.rating ?? 0,
      },
    })
    return r
  })

  await notify(booking.tutor.userId, {
    type: 'REVIEW_NEW',
    title: `ახალი შეფასება · ${parsed.data.rating}/5`,
    body: body.slice(0, 80),
    href: `/tutor/bookings/${booking.id}`,
  })

  return NextResponse.json({ ok: true, id: review.id })
}
