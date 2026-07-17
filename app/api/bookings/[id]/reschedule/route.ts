import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { fmtKaDateTime } from '@/lib/kaDate'

// Party proposes a new session time. Only students or tutors of the booking
// may propose. The counter-party then accepts/rejects via /respond.
//
// The proposal is stored in the booking's `rescheduleRequest` JSONB column
// (added via lib/dbBoot.ts). Prisma's typed client doesn't know about that
// column, so writes go through $executeRawUnsafe.

const Body = z.object({
  newStartAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
})

// Minimum lead time — no last-minute reschedule bombs.
const MIN_LEAD_MS = 60 * 60 * 1000 // 1 hour

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const { id } = await ctx.params
  const newStart = new Date(parsed.data.newStartAt)
  if (Number.isNaN(newStart.getTime())) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  if (newStart.getTime() < Date.now() + MIN_LEAD_MS) {
    return NextResponse.json({ ok: false, error: 'TOO_SOON' }, { status: 400 })
  }

  const booking = await prisma.booking.findFirst({
    where: {
      id,
      OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
    },
    include: { tutor: { select: { userId: true } } },
  })
  if (!booking) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (booking.status !== 'PREPARING' && booking.status !== 'CONFIRMED') {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
  }

  const proposedBy: 'STUDENT' | 'TUTOR' = booking.studentId === user.id ? 'STUDENT' : 'TUTOR'

  // Verify the tutor has an availability slot covering the requested window.
  // Skipped for CONSULTATION bookings — they don't consume the recurring
  // availability grid (live/on-demand model).
  const newEnd = new Date(newStart.getTime() + booking.durationMin * 60_000)
  if (booking.serviceType !== 'CONSULTATION') {
    const slot = await prisma.availabilitySlot.findFirst({
      where: {
        tutorId: booking.tutorId,
        startAt: { lte: newStart },
        endAt: { gte: newEnd },
        booked: false,
      },
      select: { id: true },
    })
    if (!slot) {
      return NextResponse.json({ ok: false, error: 'NO_SLOT' }, { status: 400 })
    }
  }

  const payload = {
    proposedBy,
    newStartAt: newStart.toISOString(),
    reason: parsed.data.reason?.trim() || null,
    proposedAt: new Date().toISOString(),
  }

  // Write JSONB + reset status to PREPARING so the "confirmed" UI doesn't
  // flash until the other party responds. If the booking was already
  // PREPARING, this is a no-op status-wise.
  await prisma.$executeRawUnsafe(
    `UPDATE "Booking" SET "rescheduleRequest" = $1::jsonb, "status" = 'PREPARING', "updatedAt" = NOW() WHERE id = $2`,
    JSON.stringify(payload),
    booking.id,
  )

  const otherPartyUserId = proposedBy === 'STUDENT' ? booking.tutor.userId : booking.studentId
  await notify(otherPartyUserId, {
    type: 'RESCHEDULE_REQUEST',
    title: proposedBy === 'STUDENT' ? 'მოსწავლემ ითხოვა გადადება' : 'ექსპერტმა ითხოვა გადადება',
    body: `ახალი დრო: ${fmtKaDateTime(newStart, { year: true })}`,
    href: proposedBy === 'STUDENT'
      ? `/tutor/bookings/${booking.id}`
      : `/student/bookings/${booking.id}`,
  })

  return NextResponse.json({ ok: true, rescheduleRequest: payload })
}
