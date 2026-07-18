import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { markRelatedRead } from '@/lib/notifClear'

// Deterministic Jitsi room URL — same for both parties, derived from ref.
const meetingUrlFor = (ref: string) => `https://meet.jit.si/mcodne-${ref.slice(0, 16)}`

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const where = user.role === 'ADMIN'
    ? { id }
    : { id, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] }
  const booking = await prisma.booking.findFirst({
    where,
    include: {
      // Narrow selects — bookings are visible to both parties + admin, but
      // passwordHash / phone / email should never leave the server.
      tutor: {
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
          category: { select: { id: true, slug: true, name: true } },
        },
      },
      student: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
      consultation: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { from: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
      // Include the student's post-session review (if any) so both parties can
      // render "already reviewed" state without a second round-trip.
      review: {
        select: {
          id: true, rating: true, body: true, createdAt: true, studentId: true,
          // The expert's public reply (tutor detail renders + edits it) and the
          // anonymity flag (seeds the student's edit form).
          tutorResponse: true, respondedAt: true, anonymous: true,
        },
      },
    },
  })
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // Backfill: bookings that were accepted before the meetingUrl feature landed
  // have `meetingUrl: null`. Fill it in with the deterministic URL for any
  // non-terminal booking so the "video-room" button always renders.
  if (!booking.meetingUrl && (booking.status === 'CONFIRMED' || booking.status === 'LIVE')) {
    const url = meetingUrlFor(booking.ref)
    booking.meetingUrl = url
    // Fire-and-forget persist so we only do this once per booking. Not awaited
    // so it doesn't block the response.
    prisma.booking.update({ where: { id: booking.id }, data: { meetingUrl: url } }).catch(() => {})
  }

  // Join cutoff: a session that was never completed stops exposing its room
  // link 30 minutes after the scheduled end — a stale CONFIRMED booking must
  // not offer a joinable (deterministic, guessable-forever) meeting URL.
  // Response-only masking; the stored meetingUrl is untouched.
  if (
    booking.meetingUrl &&
    (booking.status === 'CONFIRMED' || booking.status === 'LIVE') &&
    Date.now() > booking.startAt.getTime() + (booking.durationMin + 30) * 60_000
  ) {
    booking.meetingUrl = null
  }

  // Merge in the reschedule-request JSONB (not part of the Prisma-typed model —
  // lives as a boot-time-added column, queried raw). Null when no proposal is
  // pending; small enough to keep with the booking response payload.
  let rescheduleRequest: unknown = null
  try {
    const rows = await prisma.$queryRawUnsafe<{ rescheduleRequest: unknown }[]>(
      `SELECT "rescheduleRequest" FROM "Booking" WHERE id = $1 LIMIT 1`,
      booking.id,
    )
    rescheduleRequest = rows?.[0]?.rescheduleRequest ?? null
  } catch { /* column missing during first-boot race — treat as null */ }

  return NextResponse.json({ ...booking, rescheduleRequest })
}

// Student-only "prep note" update — separate schema (no `action`) so it never
// conflicts with tutor lifecycle actions below.
const StudentPatchBody = z.object({
  studentNotes: z.string().max(500),
})

// Tutor post-session summary — a `{ tutorNotes }` PATCH without an `action` is
// treated as "tutor is editing their session summary". Only allowed when the
// booking is COMPLETED so it can't be used as a back-door around the lifecycle.
const TutorNotesBody = z.object({
  tutorNotes: z.string().max(1500),
})

const PatchBody = z.object({
  action: z.enum(['accept', 'decline', 'complete', 'no_show']),
  tutorNotes: z.string().max(1500).optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await ctx.params
  const rawBody = await req.json().catch(() => ({}))

  // Student prep-note branch: only the owning student may update
  // `studentNotes`. Runs before the tutor-action parser so a student can hit
  // the same endpoint without needing an `action` field.
  if (typeof rawBody?.studentNotes === 'string' && rawBody?.action === undefined) {
    const parsedS = StudentPatchBody.safeParse(rawBody)
    if (!parsedS.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
    const own = await prisma.booking.findFirst({ where: { id, studentId: user.id } })
    if (!own) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    if (own.status === 'COMPLETED' || own.status === 'CANCELED' || own.status === 'NO_SHOW') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    const updated = await prisma.booking.update({
      where: { id },
      data: { studentNotes: parsedS.data.studentNotes.trim() || null },
    })
    return NextResponse.json({ ok: true, studentNotes: updated.studentNotes })
  }

  // Tutor post-session summary branch: `{ tutorNotes }` without `action`. Only
  // the owning tutor may write, and only after the session is COMPLETED so a
  // tutor can't leak arbitrary text via this endpoint before finishing.
  if (typeof rawBody?.tutorNotes === 'string' && rawBody?.action === undefined) {
    const parsedT = TutorNotesBody.safeParse(rawBody)
    if (!parsedT.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
    const own = await prisma.booking.findFirst({ where: { id, tutor: { userId: user.id } } })
    if (!own) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    if (own.status !== 'COMPLETED') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    const updated = await prisma.booking.update({
      where: { id },
      data: { tutorNotes: parsedT.data.tutorNotes.trim() || null },
    })
    return NextResponse.json({ ok: true, tutorNotes: updated.tutorNotes })
  }

  const parsed = PatchBody.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const booking = await prisma.booking.findFirst({
    where: { id, tutor: { userId: user.id } },
  })
  if (!booking) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const { action, tutorNotes } = parsed.data

  if (action === 'accept') {
    if (booking.status !== 'PREPARING') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    // Provision a Jitsi Meet room per booking. Public Jitsi requires no API
    // key; room URL is deterministic from the booking ref so both sides get
    // the same room. Room name is namespaced to reduce collision odds.
    const meetingUrl = booking.meetingUrl ?? `https://meet.jit.si/mcodne-${booking.ref.slice(0, 16)}`
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED', meetingUrl, tutorNotes: tutorNotes ?? booking.tutorNotes },
    })
    // Tell the student their booking is confirmed.
    await notify(booking.studentId, {
      type: 'BOOKING_CREATED',
      title: 'ჯავშანი დადასტურდა',
      body: booking.topic,
      href: `/student/bookings/${booking.id}`,
    })
    // Tutor already acted — clear their "new request" bell entry so it doesn't
    // keep sitting as unread.
    await markRelatedRead(user.id, `/tutor/bookings/${booking.id}`, 'BOOKING_CREATED')
    return NextResponse.json({ ok: true, status: updated.status, meetingUrl: updated.meetingUrl })
  }

  if (action === 'decline') {
    if (booking.status === 'COMPLETED' || booking.status === 'CANCELED') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    // Free the EXACT slot this booking claimed (if any) so someone else can
    // book it. Instant bookings hold no slot → heldSlotId is null.
    const heldSlotId = booking.heldSlotId
    const updated = await prisma.$transaction(async tx => {
      const u = await tx.booking.update({
        where: { id },
        data: {
          status: 'CANCELED',
          payoutStatus: 'REFUNDED',
          cancelledBy: 'TUTOR',
          tutorNotes: tutorNotes ?? booking.tutorNotes,
          heldSlotId: null,
        },
      })
      if (heldSlotId) {
        await tx.availabilitySlot.updateMany({ where: { id: heldSlotId }, data: { booked: false } })
      }
      await tx.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)
      return u
    })
    await notify(booking.studentId, {
      type: 'BOOKING_CANCELED',
      title: 'ჯავშანი უარყოფილია',
      body: booking.topic,
      href: `/student/bookings/${booking.id}`,
    })
    // Clear the tutor's "new request" bell entry — they've already answered.
    await markRelatedRead(user.id, `/tutor/bookings/${booking.id}`, 'BOOKING_CREATED')
    return NextResponse.json({ ok: true, status: updated.status })
  }

  if (action === 'no_show') {
    // Tutor flags "student didn't turn up". Only allowed after the session's
    // scheduled start time to prevent premature flagging.
    if (booking.status !== 'CONFIRMED' && booking.status !== 'LIVE') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    if (booking.startAt.getTime() > Date.now()) {
      return NextResponse.json({ ok: false, error: 'TOO_EARLY' }, { status: 400 })
    }
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'NO_SHOW',
        payoutStatus: 'REFUNDED',
        tutorNotes: tutorNotes ?? booking.tutorNotes,
      },
    })
    await notify(booking.studentId, {
      type: 'BOOKING_CANCELED',
      title: 'აღინიშნა: no-show',
      body: `ექსპერტმა აღნიშნა, რომ არ გამოცხადდი — ${booking.topic}`,
      href: `/student/bookings/${booking.id}`,
    })
    return NextResponse.json({ ok: true, status: updated.status })
  }

  // action === 'complete'
  if (booking.status !== 'CONFIRMED' && booking.status !== 'LIVE') {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
  }
  // Can't complete a session before it has even started — that would release
  // the payout and lock out cancellation/refund for a session that never
  // happened. Require the scheduled start time to have passed.
  if (booking.startAt.getTime() > Date.now()) {
    return NextResponse.json({ ok: false, error: 'TOO_EARLY' }, { status: 400 })
  }
  const updated = await prisma.booking.update({
    where: { id },
    data: { status: 'COMPLETED', payoutStatus: 'RELEASED', tutorNotes: tutorNotes ?? booking.tutorNotes },
  })
  await notify(booking.studentId, {
    type: 'GENERIC',
    title: 'სესია დასრულდა',
    body: `${booking.topic} — დატოვე შეფასება`,
    href: `/student/bookings/${booking.id}`,
  })
  return NextResponse.json({ ok: true, status: updated.status })
}
