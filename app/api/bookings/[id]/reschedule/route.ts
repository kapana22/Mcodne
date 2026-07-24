import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { fmtKaDateTime } from '@/lib/kaDate'
import { rateLimit } from '@/lib/rateLimit'

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

  // Each proposal overwrites the pending one, force-demotes a CONFIRMED booking
  // to PREPARING and locks the held slot (cleanup skips pending-reschedule rows),
  // so an unthrottled loop is a real griefing vector — cap proposals per user.
  const rl = rateLimit(`resched:${user.id}`, 10, 60 * 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

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
  // Can't reschedule a session whose start has already passed — proposing
  // demotes CONFIRMED→PREPARING, which would let a no-show student dodge the
  // tutor's no_show flag by repeatedly proposing after the clock runs out.
  // Past-start sessions must resolve via complete / no_show / cancel.
  if (booking.startAt.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
  }

  const proposedBy: 'STUDENT' | 'TUTOR' = booking.studentId === user.id ? 'STUDENT' : 'TUTOR'

  // Verify the tutor has a free availability slot covering the requested
  // window. ALL bookings claim a slot at creation (regardless of serviceType),
  // so every reschedule must land on the availability grid too — otherwise
  // accepting would move startAt while claiming nothing and desync the grid.
  const newEnd = new Date(newStart.getTime() + booking.durationMin * 60_000)
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
    // BOTH parties may only reschedule onto a real, unbooked slot the expert has
    // ALREADY published on their schedule — we never invent availability the
    // expert didn't declare (the reschedule picker only offers real free times,
    // so this is the server-side guard behind it). A new time must be added to
    // the schedule first.
    return NextResponse.json({ ok: false, error: 'NO_SLOT' }, { status: 400 })
  }

  // Status BEFORE any proposal force-set PREPARING — a reject must restore
  // this, not blanket-promote a never-accepted booking to CONFIRMED. When a
  // new proposal overwrites a still-pending one, booking.status is already
  // the forced PREPARING, so carry the ORIGINAL prevStatus forward from the
  // existing blob (the original startAt/status only change on accept).
  const prevRows = await prisma.$queryRawUnsafe<{ rescheduleRequest: { prevStatus?: string } | null }[]>(
    `SELECT "rescheduleRequest" FROM "Booking" WHERE id = $1 LIMIT 1`,
    booking.id,
  )
  const existing = prevRows?.[0]?.rescheduleRequest ?? null
  const prevStatus: 'PREPARING' | 'CONFIRMED' =
    existing?.prevStatus === 'PREPARING' || existing?.prevStatus === 'CONFIRMED'
      ? existing.prevStatus
      : (booking.status as 'PREPARING' | 'CONFIRMED')

  const payload = {
    proposedBy,
    newStartAt: newStart.toISOString(),
    reason: parsed.data.reason?.trim() || null,
    proposedAt: new Date().toISOString(),
    prevStatus,
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
    title: proposedBy === 'STUDENT' ? 'კლიენტმა გადადება ითხოვა' : 'ექსპერტმა გადადება ითხოვა',
    body: `ახალი დრო: ${fmtKaDateTime(newStart, { year: true })}`,
    href: proposedBy === 'STUDENT'
      ? `/tutor/bookings/${booking.id}`
      : `/student/bookings/${booking.id}`,
  })

  return NextResponse.json({ ok: true, rescheduleRequest: payload })
}
