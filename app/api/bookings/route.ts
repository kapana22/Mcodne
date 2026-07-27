import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify, normalizePrefs } from '@/lib/notify'
import { rateLimit } from '@/lib/rateLimit'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'
import { isStartOpen } from '@/lib/availability'
import { ensureDbReady } from '@/lib/dbBoot'
import { sendMail } from '@/lib/mailer'
import { bookingRequestEmail } from '@/lib/emailTemplates'
import { fmtKaDateTime } from '@/lib/kaDate'

const Body = z.object({
  tutorId: z.string(),
  consultationId: z.string().optional(),
  topic: z.string().min(3).max(160),
  // Required: the concrete slot start the client picked from the expert's calendar.
  startAt: z.string().datetime().optional(),
  // Required: session length. Server still re-derives price authoritatively.
  durationMin: z.number().int().min(15).max(240).optional(),
  // Ignored server-side (price is always the tutor's/consultation's rate) — kept
  // for backward-compatible client payloads.
  price: z.number().int().min(0).optional(),
  studentNotes: z.string().max(1000).optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const bookings = await prisma.booking.findMany({
    where: { studentId: user.id },
    orderBy: { startAt: 'desc' },
    take: 100,
    include: {
      // Narrow the tutor.user select — never send passwordHash to the browser.
      // omit heavy blobs at the DB level so professionData/base64 videoUrl don't
      // cross the wire per row; stripTutorBlobs still guards oversized avatars.
      tutor: {
        omit: { professionData: true, videoUrl: true },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
      consultation: true,
    },
  })
  return NextResponse.json(
    bookings.map(b => ({ ...b, tutor: stripTutorBlobs(b.tutor) })),
  )
}

// How far around the requested time we pull availability rows. Wide enough that
// a long chain of LEGACY pre-sliced rows merges whole (the start grid is
// anchored to the MERGED window's start, so a truncated chain could shift it),
// narrow enough that the read stays bounded.
const WINDOW_LOOKAROUND_MS = 7 * 24 * 60 * 60 * 1000
// The PAST_DATE guard below tolerates 5 minutes of client clock skew; the
// openness check must use the same floor or it would reject starts the guard
// just accepted.
const CLOCK_SKEW_MS = 5 * 60 * 1000

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  // This route reads TutorProfile.bufferMin, a dbBoot-added column — make sure
  // the boot DDL has run on this process before the first booking touches it.
  // Idempotent and already-resolved after the first call, so it costs nothing
  // on a warm process.
  await ensureDbReady()

  // Dual-role model (2026-07-23): a TUTOR may also act as a CLIENT and book
  // another expert. The /student/* surfaces + space switcher are now wired for
  // it, and the booking is reached via the client space. Booking is keyed off
  // User.id (studentId), independent of the tutor's TutorProfile, so a promoted
  // expert's client bookings never collide with their expert bookings. The only
  // thing refused is booking YOURSELF — enforced by the SELF_BOOKING check below
  // (tutor.userId === user.id). ADMIN has no client space, so keep it out.
  if (user.role === 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  // Email verification is intentionally NOT required to book — the confirmation
  // step was friction with no payoff at this stage (no payments yet, and the
  // in-app notifications reach the user regardless). Removed 2026-07-20.

  // Rate-limit per authenticated user: 10 bookings per hour is more than any
  // real student would create; higher rates are almost certainly abuse.
  const rl = rateLimit(`book:${user.id}`, 10, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMIT', retryInSec: rl.retryInSec },
      { status: 429 },
    )
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { tutorId, consultationId, topic, studentNotes } = parsed.data

  // Validate the date BEFORE any DB work — it's free, and a bad date must never
  // cost a remote round-trip.
  // Every booking is scheduled against the expert's published availability —
  // the client must send a concrete startAt (+ duration). There is no more
  // "instant / live-now" path.
  if (!parsed.data.startAt || parsed.data.durationMin == null) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const start = new Date(parsed.data.startAt)
  if (isNaN(start.getTime())) {
    return NextResponse.json({ ok: false, error: 'BAD_DATE' }, { status: 400 })
  }
  if (start.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: 'PAST_DATE' }, { status: 400 })
  }
  const reqDurationMin = parsed.data.durationMin

  // Independent pre-checks fan out CONCURRENTLY. Sequential awaits cost one
  // remote round-trip each (~300ms on the Railway proxy) and made the whole
  // POST feel hung; the checks don't depend on each other, only the verdicts do.
  // (There is no availability pre-probe any more: openness depends on the
  // AUTHORITATIVE duration, which the consultation row can override, and the
  // only check that counts runs inside the Serializable transaction below.)
  const [tutor, consultationRow] = await Promise.all([
    prisma.tutorProfile.findUnique({
      where: { id: tutorId },
      include: { user: { select: { suspendedAt: true } } },
    }),
    consultationId
      ? prisma.consultation.findFirst({
          where: { id: consultationId, tutorId },
          select: { id: true, price: true, minutes: true },
        })
      : Promise.resolve(null),
  ])

  if (!tutor) return NextResponse.json({ ok: false, error: 'TUTOR_NOT_FOUND' }, { status: 404 })

  // (Active-booking cap removed 2026-07-19 per owner — too much friction. The
  // per-tutor + per-student overlap checks below still prevent real conflicts;
  // no-show abuse is a policy/penalty concern to revisit when payments land.)

  if (tutor.userId === user.id) {
    return NextResponse.json({ ok: false, error: 'SELF_BOOKING' }, { status: 400 })
  }

  // Server-side guard for paused tutors. The /tutors/[id] client hides all
  // booking CTAs when available=false, but the API must independently refuse —
  // anyone can craft a direct POST /api/bookings from an old deep link or
  // scripted client. Existing bookings for this tutor are unaffected.
  if (tutor.available === false) {
    return NextResponse.json({ ok: false, error: 'TUTOR_UNAVAILABLE' }, { status: 409 })
  }

  // A suspended expert must not accept new bookings even via a stale deep link.
  // Mirrors the available guard — the profile is hidden from browse, but the API
  // has to refuse independently since anyone can craft a direct POST.
  if (tutor.user.suspendedAt) {
    return NextResponse.json({ ok: false, error: 'TUTOR_UNAVAILABLE' }, { status: 409 })
  }

  // If a consultation is referenced, it MUST belong to this tutor. Never trust
  // a client-supplied consultationId that could point at another tutor's row —
  // and use its authoritative price/minutes below instead of client values.
  const consultation = consultationRow
  if (consultationId && !consultation) {
    return NextResponse.json({ ok: false, error: 'CONSULTATION_NOT_FOUND' }, { status: 404 })
  }

  // Duration + price are authoritative from the server (consultation row, or
  // the tutor's published rate) — NEVER the client body. Previously `price`
  // was taken straight from the request, letting a student book at price 0.
  const durationMin = consultation ? consultation.minutes : reqDurationMin
  const price = consultation ? consultation.price : tutor.price

  const end = new Date(start.getTime() + durationMin * 60 * 1000)

  // Buffer around every session (0 = back-to-back allowed, the historical
  // behavior). lib/availability implements it by fattening each busy interval.
  const bufferMin = tutor.bufferMin ?? 0
  const bufferMs = bufferMin * 60 * 1000

  // Race-safe creation. Everything that must be consistent — the overlap
  // re-check, the openness check, and the insert — runs inside ONE Serializable
  // transaction. Two concurrent bookings for the same time can no longer both
  // pass: the loser sees the winner's row in the overlap re-check, or hits a
  // Postgres serialization failure, and is rejected with SLOT_TAKEN.
  //
  // Nothing is CLAIMED any more (no `booked = true`, no heldSlotId): an
  // availability row is a WINDOW, and this booking's own [startAt, end) is the
  // busy interval every later openness check subtracts. That is what lets a
  // 60-min service span two touching 30-min legacy rows, and stops a 15-min
  // service from destroying a whole 60-min row's remaining inventory.
  class SlotTaken extends Error {}
  class StudentOverlap extends Error {}
  class NoAvailability extends Error {}
  let booking: {
    id: string
    ref: string
    startAt: Date
    durationMin: number
    price: number
    status: string
  }
  try {
    booking = await prisma.$transaction(async tx => {
      // Re-check overlap INSIDE the tx. ONE query serves two jobs: this guard
      // (the real concurrency protection) and the `busy` set the openness check
      // below subtracts. The upper bound is end+buffer rather than end so a
      // session starting AFTER ours can still block us through its buffer; the
      // guard re-applies the strict `startAt < end` bound in JS so its behavior
      // is byte-for-byte what it was.
      const candidates = await tx.booking.findMany({
        where: {
          tutorId,
          status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
          startAt: { lt: new Date(end.getTime() + bufferMs) },
        },
        select: { startAt: true, durationMin: true },
      })
      const overlaps = candidates.some(c => {
        const cEnd = new Date(c.startAt.getTime() + c.durationMin * 60 * 1000)
        return c.startAt < end && cEnd > start
      })
      if (overlaps) throw new SlotTaken()

      // Reject the user double-booking THEMSELVES for an overlapping time —
      // two simultaneous sessions waste an expert's slot and guarantee a
      // no-show on one side. (The check above only covers the same tutor.)
      // A dual-role user's own EXPERT-side sessions live under tutor.userId, not
      // studentId, so both hats must be unioned — otherwise an expert who is due
      // to teach at 14:00 could book another expert as a client at 14:00.
      const selfCandidates = await tx.booking.findMany({
        where: {
          OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
          status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
          startAt: { lt: end },
        },
        select: { startAt: true, durationMin: true },
      })
      const selfOverlap = selfCandidates.some(c => {
        const cEnd = new Date(c.startAt.getTime() + c.durationMin * 60 * 1000)
        return cEnd > start
      })
      if (selfOverlap) throw new StudentOverlap()

      // The requested start must be genuinely bookable: inside one of the
      // expert's published WINDOWS, on that window's start grid, long enough for
      // THIS service, and clear of every active booking (+buffer). Legacy
      // pre-sliced rows fuse back into one window on the way in — that's how
      // this works with no data migration.
      const windowRows = await tx.availabilitySlot.findMany({
        where: {
          tutorId,
          endAt: { gt: new Date(start.getTime() - WINDOW_LOOKAROUND_MS) },
          startAt: { lt: new Date(end.getTime() + WINDOW_LOOKAROUND_MS) },
        },
        select: { startAt: true, endAt: true },
        orderBy: { startAt: 'asc' },
        take: 2000,
      })
      const openOpts = {
        windows: windowRows.map(w => ({ start: w.startAt, end: w.endAt })),
        busy: candidates.map(c => ({
          start: c.startAt,
          end: new Date(c.startAt.getTime() + c.durationMin * 60 * 1000),
        })),
        serviceMin: durationMin,
        bufferMin,
        now: new Date(Date.now() - CLOCK_SKEW_MS),
      }
      if (!isStartOpen(start, openOpts)) {
        // Split the verdict so the client keeps its two distinct messages:
        // re-running the same predicate with no bookings isolates "the expert
        // never published this time / it isn't a valid start" (NO_AVAILABILITY)
        // from "something is already booked there" (SLOT_TAKEN — including a
        // neighbouring session whose buffer reaches into this one).
        if (!isStartOpen(start, { ...openOpts, busy: [] })) throw new NoAvailability()
        throw new SlotTaken()
      }

      return tx.booking.create({
        data: {
          studentId: user.id,
          tutorId,
          consultationId: consultation?.id ?? undefined,
          topic,
          startAt: start,
          durationMin,
          price,
          studentNotes,
          status: 'PREPARING',
          // Snapshot the tutor's current type so past bookings never rewrite.
          serviceType: tutor.serviceType,
          // heldSlotId deliberately left null — nothing is claimed. The release
          // paths (cancel/decline/cleanup) treat null as a no-op and stay in
          // place only to free LEGACY rows that really were flipped booked.
        },
        select: { id: true, ref: true, startAt: true, durationMin: true, price: true, status: true },
      })
    }, { isolationLevel: 'Serializable' })
  } catch (e: any) {
    if (e instanceof SlotTaken) {
      return NextResponse.json({ ok: false, error: 'SLOT_TAKEN' }, { status: 409 })
    }
    if (e instanceof StudentOverlap) {
      return NextResponse.json({ ok: false, error: 'STUDENT_OVERLAP' }, { status: 409 })
    }
    if (e instanceof NoAvailability) {
      return NextResponse.json({ ok: false, error: 'NO_AVAILABILITY' }, { status: 409 })
    }
    // P2034 = serialization failure — a concurrent booking won the race.
    if (e?.code === 'P2034') {
      return NextResponse.json({ ok: false, error: 'SLOT_TAKEN' }, { status: 409 })
    }
    throw e
  }

  // Notify the tutor of the new booking request — AFTER the response is sent.
  // notify() costs two more remote round-trips; the student shouldn't stare at
  // a spinner for them. after() (Next 15) runs once the response has flushed.
  after(async () => {
    await notify(tutor.userId, {
      type: 'BOOKING_CREATED',
      title: 'ახალი ჯავშნის მოთხოვნა',
      body: topic,
      href: `/tutor/bookings/${booking.id}`,
    })
    // ALSO email the expert — a request they don't act on within 24h gets
    // auto-canceled by the cleanup cron, so the in-app bell alone isn't enough.
    // Gate on the tutor's BOOKING_CREATED pref (same as the in-app notify).
    try {
      const tutorUser = await prisma.user.findUnique({
        where: { id: tutor.userId },
        select: { email: true, notificationPrefs: true },
      })
      if (tutorUser?.email && normalizePrefs(tutorUser.notificationPrefs).BOOKING_CREATED) {
        const { subject, html } = bookingRequestEmail({
          studentName: user.fullName,
          topic,
          whenText: fmtKaDateTime(booking.startAt, { year: true }),
        })
        await sendMail({ to: tutorUser.email, subject, html })
      }
    } catch { /* email is best-effort */ }
  })

  // Echo the AUTHORITATIVE facts (server may have overridden client-sent
  // price/duration via the consultation row) so the confirmation screen
  // renders what was actually booked, not what the client asked for.
  return NextResponse.json({
    ok: true,
    id: booking.id,
    ref: booking.ref,
    startAt: booking.startAt,
    durationMin: booking.durationMin,
    price: booking.price,
    status: booking.status,
  })
}
