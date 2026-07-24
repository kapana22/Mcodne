import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { fmtKaDateTime } from '@/lib/kaDate'
import { markRelatedRead } from '@/lib/notifClear'

// Counter-party accepts or rejects a pending reschedule proposal.
//
// Only the party who did NOT propose may respond. On accept we move
// `startAt` to the proposed time, set CONFIRMED, and clear the JSONB blob.
// On reject we clear the blob, leave the original time intact, and restore
// the status the booking had BEFORE the proposal force-set PREPARING
// (blob.prevStatus) — a never-accepted PREPARING booking must NOT be
// silently promoted to CONFIRMED by a rejected reschedule.

const Body = z.object({
  accept: z.boolean(),
})

type ReschedulePayload = {
  proposedBy: 'STUDENT' | 'TUTOR'
  newStartAt: string
  reason: string | null
  proposedAt: string
  // Absent on legacy blobs written before prevStatus was recorded.
  prevStatus?: 'PREPARING' | 'CONFIRMED'
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const { id } = await ctx.params
  const booking = await prisma.booking.findFirst({
    where: {
      id,
      OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
    },
    include: { tutor: { select: { userId: true } } },
  })
  if (!booking) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  // Guard against acting on a terminal booking. If it was canceled/completed
  // after the proposal was filed, accepting must NOT resurrect it.
  if (booking.status !== 'PREPARING' && booking.status !== 'CONFIRMED') {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
  }

  // Fetch the raw JSONB — Prisma-typed model doesn't know this column.
  const rows = await prisma.$queryRawUnsafe<{ rescheduleRequest: ReschedulePayload | null }[]>(
    `SELECT "rescheduleRequest" FROM "Booking" WHERE id = $1 LIMIT 1`,
    booking.id,
  )
  const pending = rows?.[0]?.rescheduleRequest ?? null
  if (!pending) {
    return NextResponse.json({ ok: false, error: 'NO_REQUEST' }, { status: 400 })
  }

  const isStudent = booking.studentId === user.id
  const responderRole: 'STUDENT' | 'TUTOR' = isStudent ? 'STUDENT' : 'TUTOR'
  if (pending.proposedBy === responderRole) {
    // The proposer cannot self-approve — only the other side responds.
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  if (parsed.data.accept) {
    const newStart = new Date(pending.newStartAt)
    if (Number.isNaN(newStart.getTime())) {
      return NextResponse.json({ ok: false, error: 'INVALID_STATE' }, { status: 400 })
    }
    // A proposal accepted late must still land in the future — otherwise a
    // stale proposal could set startAt in the past (propose only enforced
    // future AT proposal time, not at accept time).
    if (newStart.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: 'STALE_PROPOSAL' }, { status: 400 })
    }
    const newEnd = new Date(newStart.getTime() + booking.durationMin * 60_000)
    const oldHeldSlotId = booking.heldSlotId

    // Move atomically: re-verify the new window is free, release the old slot,
    // claim the new one, then move startAt. Serializable so a concurrent
    // booking for the same new time can't slip in between the check and claim.
    class SlotConflict extends Error {}
    try {
      await prisma.$transaction(async tx => {
        // Overlap re-check against OTHER live bookings for this tutor.
        const others = await tx.booking.findMany({
          where: {
            tutorId: booking.tutorId,
            status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
            id: { not: booking.id },
            startAt: { lt: newEnd },
          },
          select: { startAt: true, durationMin: true },
        })
        const overlaps = others.some(o => o.startAt.getTime() + o.durationMin * 60_000 > newStart.getTime())
        if (overlaps) throw new SlotConflict()

        // Also re-check the STUDENT's own calendar — create-time rejects a
        // student double-booking themselves (route.ts selfCandidates), but a
        // reschedule moving one booking onto another of the student's sessions
        // would otherwise slip past. Same overlap math, excluding this booking.
        const selfCandidates = await tx.booking.findMany({
          where: {
            studentId: booking.studentId,
            status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
            id: { not: booking.id },
            startAt: { lt: newEnd },
          },
          select: { startAt: true, durationMin: true },
        })
        const selfOverlap = selfCandidates.some(c => c.startAt.getTime() + c.durationMin * 60_000 > newStart.getTime())
        if (selfOverlap) throw new SlotConflict()

        // Find + claim a covering slot for the new window (may differ from
        // the one validated at propose time if it got booked meanwhile).
        // EVERY booking claims a slot at creation regardless of serviceType,
        // so every reschedule must claim one too — otherwise the move would
        // free the old slot and claim nothing, desyncing the grid.
        const slot = await tx.availabilitySlot.findFirst({
          where: {
            tutorId: booking.tutorId,
            startAt: { lte: newStart },
            endAt: { gte: newEnd },
            booked: false,
          },
          select: { id: true },
        })
        if (!slot) throw new SlotConflict()
        const claim = await tx.availabilitySlot.updateMany({
          where: { id: slot.id, booked: false },
          data: { booked: true },
        })
        if (claim.count !== 1) throw new SlotConflict()
        const newSlotId = slot.id

        // Release the slot the booking used to hold.
        if (oldHeldSlotId) {
          await tx.availabilitySlot.updateMany({ where: { id: oldHeldSlotId }, data: { booked: false } })
        }

        await tx.booking.update({
          where: { id: booking.id },
          data: { startAt: newStart, status: 'CONFIRMED', heldSlotId: newSlotId },
        })
        await tx.$executeRawUnsafe(
          `UPDATE "Booking" SET "rescheduleRequest" = NULL, "updatedAt" = NOW() WHERE id = $1`,
          booking.id,
        )
      }, { isolationLevel: 'Serializable' })
    } catch (e: any) {
      if (e instanceof SlotConflict || e?.code === 'P2034') {
        return NextResponse.json({ ok: false, error: 'NO_SLOT' }, { status: 409 })
      }
      throw e
    }
    const otherPartyUserId = pending.proposedBy === 'STUDENT'
      ? booking.studentId
      : booking.tutor.userId
    await notify(otherPartyUserId, {
      type: 'BOOKING_CREATED',
      title: 'გადადება დადასტურდა',
      body: `ახალი დრო: ${fmtKaDateTime(newStart, { year: true })}`,
      href: pending.proposedBy === 'STUDENT'
        ? `/student/bookings/${booking.id}`
        : `/tutor/bookings/${booking.id}`,
    })
    // The responder has now acted on the pending reschedule — clear their
    // RESCHEDULE_REQUEST notif so it doesn't sit unread.
    const responderHref = isStudent
      ? `/student/bookings/${booking.id}`
      : `/tutor/bookings/${booking.id}`
    await markRelatedRead(user.id, responderHref, 'RESCHEDULE_REQUEST')
    return NextResponse.json({ ok: true, accepted: true, status: 'CONFIRMED', newStartAt: newStart.toISOString() })
  }

  // Reject: keep original startAt, clear the proposal, and restore the status
  // the booking had before the proposal forced PREPARING. Legacy blobs
  // (written before prevStatus existed) fall back to CONFIRMED — the old
  // behavior. Never promote a never-accepted booking past its prior state.
  const restoredStatus: 'PREPARING' | 'CONFIRMED' =
    pending.prevStatus === 'PREPARING' || pending.prevStatus === 'CONFIRMED'
      ? pending.prevStatus
      : 'CONFIRMED'
  await prisma.$executeRawUnsafe(
    `UPDATE "Booking" SET "status" = $1::"BookingStatus", "rescheduleRequest" = NULL, "updatedAt" = NOW() WHERE id = $2 AND "status" = 'PREPARING'`,
    restoredStatus,
    booking.id,
  )
  const otherPartyUserId = pending.proposedBy === 'STUDENT'
    ? booking.studentId
    : booking.tutor.userId
  await notify(otherPartyUserId, {
    type: 'BOOKING_CANCELED',
    title: 'გადადება უარყოფილია',
    body: 'თარიღი უცვლელი დარჩა',
    href: pending.proposedBy === 'STUDENT'
      ? `/student/bookings/${booking.id}`
      : `/tutor/bookings/${booking.id}`,
  })
  // Responder acted — clear their own RESCHEDULE_REQUEST notif for this booking.
  const responderHrefR = isStudent
    ? `/student/bookings/${booking.id}`
    : `/tutor/bookings/${booking.id}`
  await markRelatedRead(user.id, responderHrefR, 'RESCHEDULE_REQUEST')
  // Return the RESTORED status (PREPARING or CONFIRMED) so the client doesn't
  // wrongly assume CONFIRMED — a rejected reschedule on a not-yet-accepted
  // (PREPARING) booking must stay PREPARING and keep its accept/decline actions.
  return NextResponse.json({ ok: true, accepted: false, status: restoredStatus })
}
