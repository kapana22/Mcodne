import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { rateLimit } from '@/lib/rateLimit'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'

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
      tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
      consultation: true,
    },
  })
  return NextResponse.json(
    bookings.map(b => ({ ...b, tutor: stripTutorBlobs(b.tutor) })),
  )
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

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

  // Validate the date BEFORE any DB work — it's free and lets the slot query
  // below run in the same parallel batch as the tutor fetch.
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
  const reqEnd = new Date(start.getTime() + reqDurationMin * 60 * 1000)

  // Independent pre-checks fan out CONCURRENTLY. Sequential awaits cost one
  // remote round-trip each (~300ms on the Railway proxy) and made the whole
  // POST feel hung; the checks don't depend on each other, only the verdicts do.
  // NB: the covering-slot probe uses the CLIENT duration; when a consultation
  // overrides the duration below we re-derive `end` and re-verify coverage.
  const [tutor, consultationRow, probedSlot] = await Promise.all([
    prisma.tutorProfile.findUnique({ where: { id: tutorId } }),
    consultationId
      ? prisma.consultation.findFirst({
          where: { id: consultationId, tutorId },
          select: { id: true, price: true, minutes: true },
        })
      : Promise.resolve(null),
    prisma.availabilitySlot.findFirst({
      where: {
        tutorId,
        startAt: { lte: start },
        endAt: { gte: reqEnd },
        booked: false,
      },
    }),
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

  // Every booking must land on a free, published availability slot. The
  // parallel probe covered the client-sent duration; if the consultation
  // stretched the session past the probed window, re-verify with the real end.
  let coveringSlot = probedSlot
  if (coveringSlot && end.getTime() > coveringSlot.endAt.getTime()) {
    coveringSlot = await prisma.availabilitySlot.findFirst({
      where: {
        tutorId,
        startAt: { lte: start },
        endAt: { gte: end },
        booked: false,
      },
    })
  }
  if (!coveringSlot) {
    return NextResponse.json({ ok: false, error: 'NO_AVAILABILITY' }, { status: 409 })
  }
  const coveringSlotId: string = coveringSlot.id

  // Race-safe creation. Everything that must be consistent — the overlap
  // re-check, the conditional slot claim, and the insert — runs inside ONE
  // Serializable transaction. Two concurrent bookings for the same time can no
  // longer both pass: the loser hits a conditional-claim miss or a Postgres
  // serialization failure and is rejected with SLOT_TAKEN.
  class SlotTaken extends Error {}
  class StudentOverlap extends Error {}
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
      // Re-check overlap INSIDE the tx (covers instant with no slot).
      const candidates = await tx.booking.findMany({
        where: {
          tutorId,
          status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
          startAt: { lt: end },
        },
        select: { startAt: true, durationMin: true },
      })
      const overlaps = candidates.some(c => {
        const cEnd = new Date(c.startAt.getTime() + c.durationMin * 60 * 1000)
        return cEnd > start
      })
      if (overlaps) throw new SlotTaken()

      // Reject the student double-booking THEMSELVES for an overlapping time —
      // two simultaneous sessions waste an expert's slot and guarantee a
      // no-show on one side. (The check above only covers the same tutor.)
      const selfCandidates = await tx.booking.findMany({
        where: {
          studentId: user.id,
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

      // Conditionally claim the covering slot — only succeeds if it's still free.
      if (coveringSlotId) {
        const claim = await tx.availabilitySlot.updateMany({
          where: { id: coveringSlotId, booked: false },
          data: { booked: true },
        })
        if (claim.count !== 1) throw new SlotTaken()
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
          // Exact slot claimed, so cancel/reschedule free the right one.
          heldSlotId: coveringSlotId,
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
