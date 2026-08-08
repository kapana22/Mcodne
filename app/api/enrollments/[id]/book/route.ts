import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { isStartOpen } from '@/lib/availability'
import { enrollmentMinutes, packagesFeatureExists } from '@/lib/packages'

// Spend ONE package credit on a concrete lesson time.
//
// The lesson it creates is an ORDINARY Booking carrying `enrollmentId`. That is
// the whole packages design: reschedule, cancel, the video room, messages,
// reminders, no-show and disputes all keep working because there is nothing new
// for them to know about.
//
// GUARDS ARE THE SAME ONES /api/bookings USES, and deliberately so — a package
// lesson may not slip past a check an ordinary booking has to pass. What is
// ADDED here is the credit: it must be spent exactly once, which is why the
// whole thing runs Serializable.

const WINDOW_LOOKAROUND_MS = 24 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 60 * 1000
const MAX_TX_ATTEMPTS = 3

class NoCredit extends Error {}
class Expired extends Error {}
class SlotTaken extends Error {}
class NoAvailability extends Error {}
class StudentOverlap extends Error {}

/**
 * Retry ONLY P2034 — Postgres refusing to serialize. Copied deliberately from
 * app/api/bookings/route.ts, where production data showed this failure being
 * mis-reported as „that time is taken" and costing 9 of 11 people who reached
 * the final button. A serialization conflict means „try again", not „you lost".
 */
async function runSerializable<T>(attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt()
    } catch (e: any) {
      if (e?.code !== 'P2034' || n >= MAX_TX_ATTEMPTS) throw e
      await new Promise(r => setTimeout(r, 40 * n + Math.floor(Math.random() * 40)))
    }
  }
}

const Body = z.object({
  startAt: z.string().datetime(),
  topic: z.string().min(3).max(160).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const start = new Date(parsed.data.startAt)
  if (!Number.isFinite(start.getTime())) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: {
      package: { select: { minutesPerLesson: true, title: true } },
      tutor: { select: { id: true, userId: true, bufferMin: true, serviceType: true } },
    },
  })
  if (!enrollment) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (enrollment.studentId !== me.id) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

  const durationMin = enrollmentMinutes(enrollment)
  const end = new Date(start.getTime() + durationMin * 60_000)
  const tutorId = enrollment.tutor.id

  try {
    const created = await runSerializable(() =>
      prisma.$transaction(
        async tx => {
          // Re-read the enrollment INSIDE the transaction. Serializable is what
          // makes this read-then-write safe: two tabs clicking at once cannot
          // both see „7 used of 8" and both write 8.
          const e = await tx.enrollment.findUniqueOrThrow({
            where: { id },
            select: { status: true, lessonsTotal: true, lessonsUsed: true, expiresAt: true },
          })
          if (e.status !== 'ACTIVE') throw new NoCredit()
          if (e.lessonsUsed >= e.lessonsTotal) throw new NoCredit()
          // A lesson may not be scheduled past the window the client paid for —
          // otherwise the validity date means nothing.
          if (e.expiresAt && end > e.expiresAt) throw new Expired()

          const candidates = await tx.booking.findMany({
            where: {
              tutorId,
              status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
              startAt: { gt: new Date(start.getTime() - 6 * 60 * 60 * 1000), lt: new Date(end.getTime() + 6 * 60 * 60 * 1000) },
            },
            select: { startAt: true, durationMin: true },
          })
          const overlaps = candidates.some(c => {
            const cEnd = new Date(c.startAt.getTime() + c.durationMin * 60_000)
            return c.startAt < end && start < cEnd
          })
          if (overlaps) throw new SlotTaken()

          // The client must not double-book THEMSELVES either — same rule the
          // ordinary booking route applies.
          const selfCandidates = await tx.booking.findMany({
            where: {
              studentId: me.id,
              status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
              startAt: { gt: new Date(start.getTime() - 6 * 60 * 60 * 1000), lt: new Date(end.getTime() + 6 * 60 * 60 * 1000) },
            },
            select: { startAt: true, durationMin: true },
          })
          if (selfCandidates.some(c => {
            const cEnd = new Date(c.startAt.getTime() + c.durationMin * 60_000)
            return c.startAt < end && start < cEnd
          })) throw new StudentOverlap()

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
            busy: candidates.map(c => ({ start: c.startAt, end: new Date(c.startAt.getTime() + c.durationMin * 60_000) })),
            serviceMin: durationMin,
            bufferMin: enrollment.tutor.bufferMin ?? 0,
            now: new Date(Date.now() - CLOCK_SKEW_MS),
          }
          if (!isStartOpen(start, openOpts)) {
            // Same split verdict as the ordinary route, so the client keeps its
            // two distinct messages.
            if (!isStartOpen(start, { ...openOpts, busy: [] })) throw new NoAvailability()
            throw new SlotTaken()
          }

          const booking = await tx.booking.create({
            data: {
              studentId: me.id,
              tutorId,
              topic: parsed.data.topic || enrollment.package?.title || 'გაკვეთილი',
              startAt: start,
              durationMin,
              // The per-lesson share, so the teacher's screens never read ₾0.
              // ⚠️ This must NOT be summed as revenue — the Enrollment already
              // counted the money. Financial aggregates filter enrollmentId IS NULL.
              price: enrollment.perLessonPrice,
              status: 'PREPARING',
              serviceType: enrollment.tutor.serviceType,
              enrollmentId: id,
            },
            select: { id: true, ref: true, startAt: true, durationMin: true, status: true },
          })

          // Spend the credit. `lessonsUsed` counts lessons BOOKED, not lessons
          // delivered — a cancelled lesson gives the credit back (see the cancel
          // route), which is what makes that definition honest.
          await tx.enrollment.update({
            where: { id },
            data: { lessonsUsed: { increment: 1 } },
          })

          return booking
        },
        { isolationLevel: 'Serializable' },
      ),
    )

    return NextResponse.json({ ok: true, booking: created })
  } catch (e: any) {
    if (e instanceof NoCredit) return NextResponse.json({ ok: false, error: 'NO_CREDIT', message: 'კრედიტი აღარ გაქვს.' }, { status: 409 })
    if (e instanceof Expired) return NextResponse.json({ ok: false, error: 'EXPIRED', message: 'პაკეტის ვადა ამ დროისთვის ამოწურულია.' }, { status: 409 })
    if (e instanceof SlotTaken) return NextResponse.json({ ok: false, error: 'SLOT_TAKEN', message: 'ეს დრო დაიკავეს.' }, { status: 409 })
    if (e instanceof StudentOverlap) return NextResponse.json({ ok: false, error: 'STUDENT_OVERLAP', message: 'ამ დროს უკვე გაქვს სხვა შეხვედრა.' }, { status: 409 })
    if (e instanceof NoAvailability) return NextResponse.json({ ok: false, error: 'NO_AVAILABILITY', message: 'ეს დრო ხელმისაწვდომი არაა.' }, { status: 409 })
    throw e
  }
}
