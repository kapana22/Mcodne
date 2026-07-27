import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { fmtKaDateTime } from '@/lib/kaDate'
import { rateLimit } from '@/lib/rateLimit'
import { isStartOpen } from '@/lib/availability'

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
// Availability rows are pulled from a wide neighbourhood so a chain of LEGACY
// pre-sliced rows merges whole (see app/api/bookings/route.ts).
const WINDOW_LOOKAROUND_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  // Each proposal overwrites the pending one and force-demotes a CONFIRMED
  // booking to PREPARING (cleanup skips pending-reschedule rows), so an
  // unthrottled loop is a real griefing vector — cap proposals per user.
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
    include: { tutor: { select: { userId: true, bufferMin: true } } },
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

  // Verify the proposed time is genuinely bookable on the expert's published
  // availability. Rows are WINDOWS, not tickets: openness = windows − active
  // bookings − this service's length (+buffer), derived by lib/availability.
  // Nothing is claimed here, so an abandoned proposal can no longer brick
  // inventory — the booking's own [startAt, end) is the only busy interval.
  const bufferMin = booking.tutor.bufferMin ?? 0
  const newEnd = new Date(newStart.getTime() + booking.durationMin * 60_000)
  const [windowRows, activeBookings] = await Promise.all([
    prisma.availabilitySlot.findMany({
      where: {
        tutorId: booking.tutorId,
        endAt: { gt: new Date(newStart.getTime() - WINDOW_LOOKAROUND_MS) },
        startAt: { lt: new Date(newEnd.getTime() + WINDOW_LOOKAROUND_MS) },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
      take: 2000,
    }),
    // Everything live on this expert's calendar EXCEPT the booking being moved —
    // it must not block its own new time. Upper bound is end+buffer so a later
    // session can still block us through its buffer.
    prisma.booking.findMany({
      where: {
        tutorId: booking.tutorId,
        id: { not: booking.id },
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
        startAt: { lt: new Date(newEnd.getTime() + bufferMin * 60_000) },
      },
      select: { startAt: true, durationMin: true },
    }),
  ])
  const open = isStartOpen(newStart, {
    windows: windowRows.map(w => ({ start: w.startAt, end: w.endAt })),
    busy: activeBookings.map(b => ({
      start: b.startAt,
      end: new Date(b.startAt.getTime() + b.durationMin * 60_000),
    })),
    serviceMin: booking.durationMin,
    bufferMin,
  })
  if (!open) {
    // BOTH parties may only reschedule onto a real, free time the expert has
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
    `UPDATE "Booking" SET "rescheduleRequest" = $1::jsonb, "status" = 'PREPARING', "updatedAt" = NOW() WHERE id = $2 AND "status" IN ('PREPARING', 'CONFIRMED')`,
    JSON.stringify(payload),
    booking.id,
  )

  const otherPartyUserId = proposedBy === 'STUDENT' ? booking.tutor.userId : booking.studentId
  await notify(otherPartyUserId, {
    type: 'RESCHEDULE_REQUEST',
    title: proposedBy === 'STUDENT' ? 'სტუდენტმა გადადება ითხოვა' : 'ექსპერტმა გადადება ითხოვა',
    body: `ახალი დრო: ${fmtKaDateTime(newStart, { year: true })}`,
    href: proposedBy === 'STUDENT'
      ? `/tutor/bookings/${booking.id}`
      : `/student/bookings/${booking.id}`,
  })

  return NextResponse.json({ ok: true, rescheduleRequest: payload })
}
