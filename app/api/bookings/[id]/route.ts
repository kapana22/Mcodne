import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify, normalizePrefs } from '@/lib/notify'
import { markRelatedRead } from '@/lib/notifClear'
import { newMeetingUrl, isStaleMeetingUrl } from '@/lib/meeting'
import { sendMail } from '@/lib/mailer'
import { bookingConfirmedEmail } from '@/lib/emailTemplates'
import { fmtKaDateTime } from '@/lib/kaDate'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const where = user.role === 'ADMIN'
    ? { id }
    : { id, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] }
  // Kick off the reschedule-request read BEFORE the main query so the two run
  // concurrently instead of as two sequential round-trips (each round-trip to
  // the DB is the dominant cost). Result is only used once the booking loads +
  // auth passes below, so fetching it for an inaccessible id leaks nothing.
  const reschedulePromise = prisma.$queryRawUnsafe<{ rescheduleRequest: unknown }[]>(
    `SELECT "rescheduleRequest" FROM "Booking" WHERE id = $1 LIMIT 1`,
    id,
  ).catch(() => [] as { rescheduleRequest: unknown }[])
  const booking = await prisma.booking.findFirst({
    where,
    include: {
      // Narrow selects — bookings are visible to both parties + admin, but
      // passwordHash / phone / email should never leave the server.
      tutor: {
        // Drop the heavy blobs at the DB level (this page renders neither the
        // intro video nor professionData) — same omit the sibling booking routes
        // already carry.
        omit: { professionData: true, videoUrl: true },
        include: {
          // Expert email is NOT selected: no UI renders it and returning it to
          // the (any-authenticated) requester who booked a free slot is an
          // email-harvesting vector. Student email below stays — the tutor's
          // booking-detail page renders it as their contact for the session.
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, slug: true, name: true } },
        },
      },
      student: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
      consultation: true,
      messages: {
        // Newest-first + take, then flipped back to ascending below — same
        // recent-200 cap /api/messages uses, so a long thread's whole history
        // no longer rides on every booking GET. (`take` with 'asc' would keep
        // the OLDEST 200 — the wrong end of the thread.)
        orderBy: { createdAt: 'desc' },
        take: 200,
        // Explicit `select`, and the base64 `fileUrl` attachment is NOT in it:
        // each stored data: URL is up to 3 MB, so a handful of image attachments
        // alone made this single GET multi-MB. These rows are only BookingChat's
        // initial seed — it full-loads the thread (attachments included) from
        // /api/messages the moment it mounts — so the rendered bubbles are
        // unchanged. `fileName` stays: it carries the attachment affordance and
        // the `__call__` invite sentinel.
        // Avatars are likewise NOT embedded per message — BookingChat renders
        // each sender's avatar from the 2 thread participants. Embedding a
        // (base64) avatar per message once made this payload multi-MB.
        select: {
          id: true, body: true, fromId: true, createdAt: true, fileName: true,
          from: { select: { id: true, fullName: true } },
        },
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

  // Backfill / migrate: a missing room, OR a legacy meet.jit.si room (which now
  // hits the moderator gate), gets a fresh current-provider room the first time
  // a non-terminal booking is opened — so the join button always works.
  if (isStaleMeetingUrl(booking.meetingUrl) && (booking.status === 'CONFIRMED' || booking.status === 'LIVE')) {
    const url = await newMeetingUrl()
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
  const rescheduleRows = await reschedulePromise
  const rescheduleRequest = rescheduleRows?.[0]?.rescheduleRequest ?? null

  // The capped thread came back newest-first; hand it to the client in the
  // ascending order the chat renders in.
  const messages = [...booking.messages].reverse()

  return NextResponse.json({ ...booking, messages, rescheduleRequest })
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
    const meetingUrl = booking.meetingUrl ?? (await newMeetingUrl())
    // Conditional claim (status-guarded), not a blind update: a concurrent
    // /cancel or the */15 cleanup cron may have flipped this to CANCELED between
    // our read and this write. updateMany + count===1 makes the transition
    // fail-safe instead of resurrecting a canceled booking.
    const claim = await prisma.booking.updateMany({
      where: { id, status: 'PREPARING' },
      data: { status: 'CONFIRMED', meetingUrl, tutorNotes: tutorNotes ?? booking.tutorNotes },
    })
    if (claim.count !== 1) {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
    }
    // If a reschedule proposal is still pending, its frozen `prevStatus` is the
    // pre-accept PREPARING. Bump it to CONFIRMED so a later REJECT restores the
    // now-confirmed booking instead of silently demoting it back to PREPARING
    // (where the cleanup cron would auto-cancel this confirmed session).
    await prisma.$executeRawUnsafe(
      `UPDATE "Booking" SET "rescheduleRequest" = jsonb_set("rescheduleRequest", '{prevStatus}', '"CONFIRMED"') WHERE id = $1 AND "rescheduleRequest" IS NOT NULL`,
      id,
    )
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
    // Confirmation email to the student — fire-and-forget (extra lookups for the
    // names/email run off the response path).
    after(async () => {
      try {
        const [student, profile] = await Promise.all([
          prisma.user.findUnique({ where: { id: booking.studentId }, select: { email: true, fullName: true, notificationPrefs: true } }),
          prisma.tutorProfile.findUnique({ where: { id: booking.tutorId }, select: { user: { select: { fullName: true } } } }),
        ])
        // Honor the student's notification prefs — the in-app notify() above
        // already checks them; the email must too (BOOKING_CREATED covers the
        // whole booking lifecycle, confirmations included).
        if (student?.email && normalizePrefs(student.notificationPrefs).BOOKING_CREATED) {
          const { subject, html } = bookingConfirmedEmail({
            studentName: student.fullName,
            expertName: profile?.user.fullName || 'ექსპერტი',
            topic: booking.topic,
            whenText: fmtKaDateTime(booking.startAt, { year: true }),
            bookingId: booking.id,
          })
          await sendMail({ to: student.email, subject, html })
        }
      } catch { /* email is best-effort */ }
    })
    return NextResponse.json({ ok: true, status: 'CONFIRMED', meetingUrl })
  }

  if (action === 'decline') {
    // Decline = rejecting a PENDING request only. Once CONFIRMED (or past), the
    // tutor must use cancel — declining a confirmed/already-happened session
    // would erase it (→ CANCELED) and dodge a review. The UI only ever offers
    // decline on PREPARING, so this just hardens the API against direct calls.
    if (booking.status !== 'PREPARING') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    // Free the EXACT slot this booking claimed (if any) so someone else can
    // book it. Instant bookings hold no slot → heldSlotId is null.
    const heldSlotId = booking.heldSlotId
    try {
      await prisma.$transaction(async tx => {
        // Status-guarded: bail if a concurrent write already moved this booking
        // out of PREPARING (e.g. cleanup cron canceled it), so we never free a
        // slot / overwrite a status that's no longer ours to change.
        const claim = await tx.booking.updateMany({
          where: { id, status: 'PREPARING' },
          data: {
            status: 'CANCELED',
            payoutStatus: 'REFUNDED',
            cancelledBy: 'TUTOR',
            tutorNotes: tutorNotes ?? booking.tutorNotes,
            heldSlotId: null,
          },
        })
        if (claim.count !== 1) throw new Error('BAD_STATE')
        if (heldSlotId) {
          await tx.availabilitySlot.updateMany({ where: { id: heldSlotId }, data: { booked: false } })
        }
        await tx.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'BAD_STATE') {
        return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
      }
      throw e
    }
    await notify(booking.studentId, {
      type: 'BOOKING_CANCELED',
      title: 'ჯავშანი უარყოფილია',
      body: booking.topic,
      href: `/student/bookings/${booking.id}`,
    })
    // Clear the tutor's "new request" bell entry — they've already answered.
    await markRelatedRead(user.id, `/tutor/bookings/${booking.id}`, 'BOOKING_CREATED')
    return NextResponse.json({ ok: true, status: 'CANCELED' })
  }

  if (action === 'no_show') {
    // Tutor flags "student didn't turn up". Only allowed once a GRACE window
    // past the scheduled start has elapsed — otherwise a tutor could flag the
    // instant the clock hits startAt, before the student could plausibly join.
    // Mirrors the 15-min grace on the student's own no-show report (disputes).
    const NO_SHOW_GRACE_MS = 15 * 60 * 1000
    if (booking.status !== 'CONFIRMED' && booking.status !== 'LIVE') {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
    }
    if (Date.now() < booking.startAt.getTime() + NO_SHOW_GRACE_MS) {
      return NextResponse.json({ ok: false, error: 'TOO_EARLY' }, { status: 400 })
    }
    // Payout policy: the STUDENT didn't turn up, so this is NOT a refund case —
    // the expert held the slot and showed up, so the money is RELEASED to them.
    // (REFUNDED is reserved for tutor-cancel / decline / unanswered auto-cancel,
    // where the student got nothing.)
    const claim = await prisma.booking.updateMany({
      where: { id, status: { in: ['CONFIRMED', 'LIVE'] } },
      data: {
        status: 'NO_SHOW',
        payoutStatus: 'RELEASED',
        tutorNotes: tutorNotes ?? booking.tutorNotes,
      },
    })
    if (claim.count !== 1) {
      return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
    }
    // Clear any leftover reschedule proposal so a terminal booking never renders
    // a stuck pending-reschedule banner with dead accept/reject buttons.
    await prisma.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)
    await notify(booking.studentId, {
      type: 'BOOKING_CANCELED',
      title: 'აღინიშნა: გამოუცხადებლობა',
      body: `ექსპერტმა აღნიშნა, რომ არ გამოცხადდი — ${booking.topic}`,
      href: `/student/bookings/${booking.id}`,
    })
    return NextResponse.json({ ok: true, status: 'NO_SHOW' })
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
  const claim = await prisma.booking.updateMany({
    where: { id, status: { in: ['CONFIRMED', 'LIVE'] } },
    data: { status: 'COMPLETED', payoutStatus: 'RELEASED', tutorNotes: tutorNotes ?? booking.tutorNotes },
  })
  if (claim.count !== 1) {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 409 })
  }
  // Clear any leftover reschedule proposal so a completed booking never renders
  // a stuck pending-reschedule banner.
  await prisma.$executeRawUnsafe(`UPDATE "Booking" SET "rescheduleRequest" = NULL WHERE id = $1`, id)
  // Bump the expert's public "N სესია ჩატარებული" stat. The status-guarded
  // claim above (where status ∈ CONFIRMED/LIVE, count === 1) proves THIS request
  // performed the transition — so a booking that was already COMPLETED (by the
  // cron or a duplicate click) can't reach here and double-count.
  await prisma.tutorProfile.update({
    where: { id: booking.tutorId },
    data: { sessionsCount: { increment: 1 } },
  })
  await notify(booking.studentId, {
    type: 'BOOKING_COMPLETED',
    title: 'სესია დასრულდა',
    body: `${booking.topic} — დატოვე შეფასება`,
    href: `/student/bookings/${booking.id}`,
  })
  return NextResponse.json({ ok: true, status: 'COMPLETED' })
}
