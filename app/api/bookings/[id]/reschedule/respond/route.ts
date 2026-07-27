import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { fmtKaDateTime } from '@/lib/kaDate'
import { markRelatedRead } from '@/lib/notifClear'
import { isStartOpen } from '@/lib/availability'

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

// Availability rows are pulled from a wide neighbourhood so a chain of LEGACY
// pre-sliced rows merges whole (see app/api/bookings/route.ts).
const WINDOW_LOOKAROUND_MS = 7 * 24 * 60 * 60 * 1000

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
    include: { tutor: { select: { userId: true, bufferMin: true } } },
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
    const bufferMin = booking.tutor.bufferMin ?? 0

    // Move atomically: re-verify the new time is genuinely open, then move
    // startAt. Serializable so a concurrent booking for the same new time can't
    // slip in between the check and the write. Nothing is claimed — availability
    // rows are WINDOWS and this booking's own [startAt, end) is the busy
    // interval, so the move needs no slot bookkeeping at all.
    class SlotConflict extends Error {}
    try {
      await prisma.$transaction(async tx => {
        // Overlap re-check against OTHER live bookings for this tutor. Same
        // single-query trick as create: the upper bound is end+buffer (so a
        // later session can block through its buffer) while the guard itself
        // re-applies the strict `startAt < newEnd` bound in JS.
        const others = await tx.booking.findMany({
          where: {
            tutorId: booking.tutorId,
            status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
            id: { not: booking.id },
            startAt: { lt: new Date(newEnd.getTime() + bufferMin * 60_000) },
          },
          select: { startAt: true, durationMin: true },
        })
        const overlaps = others.some(o =>
          o.startAt < newEnd && o.startAt.getTime() + o.durationMin * 60_000 > newStart.getTime())
        if (overlaps) throw new SlotConflict()

        // Also re-check the STUDENT's own calendar — create-time rejects a
        // student double-booking themselves (route.ts selfCandidates), but a
        // reschedule moving one booking onto another of the student's sessions
        // would otherwise slip past. Same overlap math, excluding this booking.
        // Union both hats: a dual-role student's expert-side teaching sessions
        // live under tutor.userId, not studentId (mirrors the create-time fix).
        const selfCandidates = await tx.booking.findMany({
          where: {
            OR: [{ studentId: booking.studentId }, { tutor: { userId: booking.studentId } }],
            status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
            id: { not: booking.id },
            startAt: { lt: newEnd },
          },
          select: { startAt: true, durationMin: true },
        })
        const selfOverlap = selfCandidates.some(c => c.startAt.getTime() + c.durationMin * 60_000 > newStart.getTime())
        if (selfOverlap) throw new SlotConflict()

        // Re-derive openness for the new time (the propose-time verdict can be
        // stale — someone may have booked into that window meanwhile, or the
        // expert may have withdrawn it). Same predicate the booking flow and the
        // picker use, so the three can never disagree.
        const windowRows = await tx.availabilitySlot.findMany({
          where: {
            tutorId: booking.tutorId,
            endAt: { gt: new Date(newStart.getTime() - WINDOW_LOOKAROUND_MS) },
            startAt: { lt: new Date(newEnd.getTime() + WINDOW_LOOKAROUND_MS) },
          },
          select: { startAt: true, endAt: true },
          orderBy: { startAt: 'asc' },
          take: 2000,
        })
        const open = isStartOpen(newStart, {
          windows: windowRows.map(w => ({ start: w.startAt, end: w.endAt })),
          busy: others.map(o => ({
            start: o.startAt,
            end: new Date(o.startAt.getTime() + o.durationMin * 60_000),
          })),
          serviceMin: booking.durationMin,
          bufferMin,
        })
        if (!open) throw new SlotConflict()

        // Legacy release: rows created before the windows model flipped a slot's
        // `booked`. Freeing it here keeps that inventory visible; a null
        // heldSlotId (every booking made since) is a no-op.
        if (oldHeldSlotId) {
          await tx.availabilitySlot.updateMany({ where: { id: oldHeldSlotId }, data: { booked: false } })
        }

        await tx.booking.update({
          where: { id: booking.id },
          data: { startAt: newStart, status: 'CONFIRMED', heldSlotId: null },
        })
        // Null the reminder dedupe stamp too — the session moved to a new time,
        // so it must earn a fresh ~1h reminder for the NEW startAt (otherwise a
        // booking already reminded for its old time would silently never remind
        // again). Raw SQL: sessionReminderSentAt is a dbBoot-added column.
        await tx.$executeRawUnsafe(
          `UPDATE "Booking" SET "rescheduleRequest" = NULL, "sessionReminderSentAt" = NULL, "updatedAt" = NOW() WHERE id = $1`,
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
  // The booking may already have been accepted (PREPARING → CONFIRMED via the
  // booking PATCH) while this proposal still sat pending. In that case the reject
  // must STILL clear the blob (otherwise a stale "pending reschedule" banner
  // survives forever), but must NOT downgrade the now-CONFIRMED booking. So:
  // clear the blob for both PREPARING and CONFIRMED, and only restore prevStatus
  // when the booking is still PREPARING.
  await prisma.$executeRawUnsafe(
    `UPDATE "Booking"
       SET "status" = CASE WHEN "status" = 'PREPARING' THEN $1::"BookingStatus" ELSE "status" END,
           "rescheduleRequest" = NULL,
           "updatedAt" = NOW()
     WHERE id = $2 AND "status" IN ('PREPARING', 'CONFIRMED')`,
    restoredStatus,
    booking.id,
  )
  // Reflect the real resulting status: an already-CONFIRMED booking stays
  // CONFIRMED; a still-PREPARING one takes the restored (prev) status.
  const resultingStatus = booking.status === 'CONFIRMED' ? 'CONFIRMED' : restoredStatus
  const otherPartyUserId = pending.proposedBy === 'STUDENT'
    ? booking.studentId
    : booking.tutor.userId
  // RESCHEDULE_REQUEST, not BOOKING_CANCELED — the booking is alive at its
  // original time, and the canceled type renders as a red „გაუქმება" chip,
  // which read as „the session was killed". Same pref group either way.
  await notify(otherPartyUserId, {
    type: 'RESCHEDULE_REQUEST',
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
  // Return the RESULTING status (PREPARING or CONFIRMED) so the client doesn't
  // wrongly assume CONFIRMED — a rejected reschedule on a not-yet-accepted
  // (PREPARING) booking must stay PREPARING and keep its accept/decline actions.
  return NextResponse.json({ ok: true, accepted: false, status: resultingStatus })
}
