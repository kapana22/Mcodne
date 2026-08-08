import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify, normalizePrefs } from '@/lib/notify'
import { audit } from '@/lib/audit'
import { CANCEL_CUTOFF_HOURS } from '@/lib/flags'
import { sendMail } from '@/lib/mailer'
import { bookingChangedEmail, fmtWhenTz } from '@/lib/emailTemplates'

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

  try {
    await prisma.$transaction(async tx => {
      // Re-read INSIDE the tx: a concurrent reschedule-accept swaps heldSlotId
      // (frees the old slot, claims a new one), and the cleanup cron / complete
      // can move status. Using the pre-read snapshot would free a stale slot and
      // leave the newly-claimed one booked forever, or overwrite a terminal
      // status. Bail if it's no longer ours to cancel.
      const fresh = await tx.booking.findUnique({ where: { id }, select: { status: true, heldSlotId: true, enrollmentId: true } })
      if (!fresh || fresh.status === 'COMPLETED' || fresh.status === 'CANCELED' || fresh.status === 'NO_SHOW') {
        throw new Error('BAD_STATE')
      }
      const claim = await tx.booking.updateMany({
        where: { id, status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] } },
        data: {
          status: 'CANCELED',
          payoutStatus: refundClient ? 'REFUNDED' : 'PENDING',
          cancelledBy,
          // Persist the reason so it shows to both parties (admin UI promises
          // „მიზეზი გამოჩნდება ორივე მხარისთვის"). null when none was given.
          cancelReason: reason,
          heldSlotId: null,
        },
      })
      if (claim.count !== 1) throw new Error('BAD_STATE')
      // Free the slot this booking currently holds (as of the in-tx read).
      if (fresh.heldSlotId) {
        await tx.availabilitySlot.updateMany({ where: { id: fresh.heldSlotId }, data: { booked: false } })
      }
      // Clear any pending reschedule proposal so an accept can't resurrect this
      // now-canceled booking (raw column — not in the Prisma model).
      await tx.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)

      // ── Package credit: give it back ────────────────────────────────────
      // `Enrollment.lessonsUsed` counts lessons BOOKED, so a cancelled lesson
      // must return its credit — otherwise cancelling once quietly costs the
      // client a lesson they paid for, and the count stops meaning anything.
      // Inside the same transaction as the cancel, so the two can never
      // disagree. Guarded at 0: a double-cancel is refused above by BAD_STATE,
      // but a negative balance is the kind of thing worth making impossible.
      if (fresh.enrollmentId) {
        await tx.enrollment.updateMany({
          where: { id: fresh.enrollmentId, lessonsUsed: { gt: 0 } },
          data: { lessonsUsed: { decrement: 1 } },
        })
        // When the EXPERT is at fault the client also loses a day of their
        // month through no doing of their own, so the window is extended —
        // see lib/packages → extendedExpiry for why a whole day, not a lesson.
        if (cancelledBy === 'TUTOR') {
          const e = await tx.enrollment.findUnique({ where: { id: fresh.enrollmentId }, select: { expiresAt: true } })
          if (e?.expiresAt) {
            await tx.enrollment.update({
              where: { id: fresh.enrollmentId },
              data: { expiresAt: new Date(e.expiresAt.getTime() + 24 * 60 * 60 * 1000) },
            })
          }
        }
      }
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'BAD_STATE') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
    }
    throw e
  }

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
  const sessionRef = `${booking.topic} · ${fmtWhenTz(booking.startAt, { year: true })}`
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

  // Email the same recipients the in-app notify() above just got. This is THE
  // gap that hurts: a cancellation removes the booking from the reminder sweep
  // (it selects status='CONFIRMED'), so after this point the app will never
  // speak about this session again — the other party's last signal stays the old
  // confirmation email and they turn up to an empty room. Runs in after(), each
  // send wrapped so a mail failure can never touch the cancellation itself.
  after(async () => {
    try {
      const [student, tutorUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: booking.studentId }, select: { email: true, fullName: true, notificationPrefs: true } }),
        prisma.user.findUnique({ where: { id: booking.tutor.userId }, select: { email: true, fullName: true, notificationPrefs: true } }),
      ])
      const whenText = fmtWhenTz(booking.startAt, { year: true })
      const actorLabel =
        cancelledBy === 'ADMIN' ? 'ადმინისტრატორმა'
        : cancelledBy === 'STUDENT' ? 'სტუდენტმა'
        : 'ექსპერტმა'
      // Same pref gate as the in-app notify(): BOOKING_CANCELED lives in the
      // BOOKING_CREATED group (lib/notify prefKeyForType).
      const mailStudent = cancelledBy !== 'STUDENT'
      const mailTutor = cancelledBy !== 'TUTOR'
      if (mailStudent && student?.email && normalizePrefs(student.notificationPrefs).BOOKING_CREATED) {
        const { subject, html } = bookingChangedEmail('canceled', {
          counterpartName: tutorUser?.fullName || 'ექსპერტი',
          topic: booking.topic,
          whenText,
          actorLabel,
          reason,
          note: 'სხვა დროს დაჯავშნა ნებისმიერ დროს შეგიძლია.',
          href: `/student/bookings/${booking.id}`,
        })
        await sendMail({ to: student.email, subject, html })
      }
      if (mailTutor && tutorUser?.email && normalizePrefs(tutorUser.notificationPrefs).BOOKING_CREATED) {
        const { subject, html } = bookingChangedEmail('canceled', {
          counterpartName: student?.fullName || 'სტუდენტი',
          topic: booking.topic,
          whenText,
          actorLabel,
          reason,
          note: 'ეს დრო შენს განრიგში ისევ თავისუფალია.',
          href: `/tutor/bookings/${booking.id}`,
        })
        await sendMail({ to: tutorUser.email, subject, html })
      }
    } catch { /* email is best-effort */ }
  })

  return NextResponse.json({ ok: true, fullRefund: refundClient })
}
