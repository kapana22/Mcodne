import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { audit } from '@/lib/audit'
import { CANCEL_CUTOFF_HOURS } from '@/lib/flags'
import { fmtKaDateTime } from '@/lib/kaDate'

// Cancel body is optional — legacy clients POST empty. When present we accept a
// short reason chip label + optional freeform text (the "სხვა" case).
const CancelBody = z.object({
  reason: z.string().max(300).optional(),
}).partial()

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = CancelBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const reason = parsed.data.reason?.trim() || null

  // ADMIN cancels act on other people's bookings — a reason is mandatory (it is
  // shown to both parties and audited). Peer (student/tutor) cancels keep the
  // reason optional: legacy clients POST an empty body.
  if (user.role === 'ADMIN' && !reason) {
    return NextResponse.json(
      { ok: false, error: 'REASON_REQUIRED', message: 'გაუქმების მიზეზი სავალდებულოა' },
      { status: 400 },
    )
  }

  const { id } = await ctx.params
  const bookingWhere = user.role === 'ADMIN'
    ? { id }
    : { id, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] }
  const booking = await prisma.booking.findFirst({
    where: bookingWhere,
    include: { tutor: { select: { userId: true } } },
  })
  if (!booking) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  // Terminal statuses — includes NO_SHOW so a no-show booking can't be
  // "re-canceled", which would overwrite cancelledBy and flip payoutStatus.
  if (booking.status === 'COMPLETED' || booking.status === 'CANCELED' || booking.status === 'NO_SHOW') {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
  }

  const hoursTilStart = (booking.startAt.getTime() - Date.now()) / 3600000
  const fullRefund = hoursTilStart >= CANCEL_CUTOFF_HOURS

  // Un-flip the EXACT slot this booking claimed (recorded at booking time) so
  // the tutor can offer that time to someone else. Instant bookings have
  // no heldSlotId, so nothing is freed for them — previously a time-containment
  // scan could wrongly free an unrelated slot.
  const heldSlotId = booking.heldSlotId

  // Record cancellation source so tutor no-show / student flake rates can be
  // tracked in admin analytics.
  const cancelledBy: 'STUDENT' | 'TUTOR' | 'ADMIN' =
    user.role === 'ADMIN' ? 'ADMIN'
    : booking.studentId === user.id ? 'STUDENT'
    : 'TUTOR'

  // A tutor- or admin-initiated cancel is NOT the client's fault → the client is
  // refunded in full regardless of how close to start time it is. Only a
  // student's own cancel is bound by the time-based cutoff.
  const refundClient = cancelledBy !== 'STUDENT' || fullRefund

  await prisma.$transaction(async tx => {
    await tx.booking.update({
      where: { id },
      data: {
        status: 'CANCELED',
        payoutStatus: refundClient ? 'REFUNDED' : 'PENDING',
        cancelledBy,
        // Clear any pending reschedule proposal so an accept can't resurrect
        // this now-canceled booking (raw column — not in the Prisma model).
        heldSlotId: null,
      },
    })
    if (heldSlotId) {
      await tx.availabilitySlot.updateMany({ where: { id: heldSlotId }, data: { booked: false } })
    }
    await tx.$executeRawUnsafe(
      `UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`,
      id,
    )
  })

  // Audit — only for admin cancels; peer-cancel is expected UX, not admin action.
  if (cancelledBy === 'ADMIN') {
    await audit(user.id, 'booking.cancel', {
      targetType: 'Booking',
      targetId: id,
      meta: { reason, studentId: booking.studentId, tutorId: booking.tutorId, fullRefund, topic: booking.topic },
    })
  }

  // Notify: student/tutor cancel → notify the OTHER party.
  // Admin cancel → notify BOTH parties so neither is left in the dark.
  // Body always names WHICH session (topic + date/time) so the notified party
  // doesn't have to open the app to figure out what was canceled.
  const sessionRef = `${booking.topic} · ${fmtKaDateTime(booking.startAt, { year: true })}`
  const cancelBody = reason ? `${sessionRef} — ${reason}` : sessionRef
  if (cancelledBy === 'ADMIN') {
    await notify(booking.studentId, {
      type: 'BOOKING_CANCELED',
      title: 'ჯავშანი გაუქმდა · ადმინმა',
      body: cancelBody,
      href: `/student/bookings/${booking.id}`,
    })
    await notify(booking.tutor.userId, {
      type: 'BOOKING_CANCELED',
      title: 'ჯავშანი გაუქმდა · ადმინმა',
      body: cancelBody,
      href: `/tutor/bookings/${booking.id}`,
    })
  } else {
    const otherPartyId = cancelledBy === 'STUDENT' ? booking.tutor.userId : booking.studentId
    await notify(otherPartyId, {
      type: 'BOOKING_CANCELED',
      title: 'ჯავშანი გაუქმდა',
      body: cancelBody,
      href: cancelledBy === 'STUDENT'
        ? `/tutor/bookings/${booking.id}`
        : `/student/bookings/${booking.id}`,
    })
  }

  return NextResponse.json({ ok: true, fullRefund: refundClient })
}
