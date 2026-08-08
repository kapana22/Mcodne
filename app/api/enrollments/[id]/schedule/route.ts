import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { computeOpenStarts, isStartOpen } from '@/lib/availability'
import { packagesFeatureExists, lessonsLeft, enrollmentMinutes } from '@/lib/packages'
import { tbilisiParts } from '@/lib/tz'

// Schedule a WHOLE package from a weekly pattern — „ორშ + ხუთ, 18:00", eight
// lessons, one action.
//
// WHY THIS IS THE FEATURE. Booking eight lessons one at a time is eight
// decisions about the same decision, and the credits that never get booked are
// the ones that expire. A parent does not want „a lesson", they want „Tuesdays
// and Thursdays at six" — that is the actual product, and it is what the
// directories (repetitorebi.ge, classroom.ge) cannot do at all.
//
// THE PATTERN IS EXPANDED SERVER-SIDE. The client sends weekdays + a time, not
// a list of datetimes: availability derivation lives in lib/availability and
// must have exactly one implementation. A client that computed its own candidate
// starts would be a second, quietly diverging copy of that rule.
//
// ALL-OR-NOTHING. Every lesson is created inside ONE Serializable transaction:
// six of eight booked, with the other two silently missing, is worse than a
// clean refusal — the client believes their month is planned when it is not.

const MAX_TX_ATTEMPTS = 3
const CLOCK_SKEW_MS = 60 * 1000

class NoCredit extends Error {}
class Conflict extends Error { constructor(public when: Date) { super('conflict') } }

async function runSerializable<T>(attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try { return await attempt() } catch (e: any) {
      if (e?.code !== 'P2034' || n >= MAX_TX_ATTEMPTS) throw e
      await new Promise(r => setTimeout(r, 40 * n + Math.floor(Math.random() * 40)))
    }
  }
}

const Body = z.object({
  // 1 = Monday … 7 = Sunday (ISO). A Georgian week starts on Monday and the UI
  // renders it that way, so the wire format matches what the user sees.
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  // TBILISI wall clock, always — the platform's one published zone. The picker
  // offers times formatted with components/workspace/sessionTime (Tbilisi) and
  // captions them with <TzNote>, so what the client sends is what the teacher
  // means, wherever either of them is sitting.
  time: z.string().regex(/^\d{2}:\d{2}$/),
  /** Preview only — compute the dates, create nothing. */
  dryRun: z.boolean().optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { weekdays, time, dryRun } = parsed.data
  const [hh, mm] = time.split(':').map(Number)
  if (hh > 23 || mm > 59) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const e = await prisma.enrollment.findUnique({
    where: { id },
    include: {
      package: { select: { minutesPerLesson: true, title: true } },
      tutor: { select: { id: true, bufferMin: true, serviceType: true } },
    },
  })
  if (!e) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (e.studentId !== me.id) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  if (e.status !== 'ACTIVE') return NextResponse.json({ ok: false, error: 'NOT_ACTIVE' }, { status: 409 })

  const need = lessonsLeft(e.lessonsTotal, e.lessonsUsed)
  if (need === 0) return NextResponse.json({ ok: false, error: 'NO_CREDIT', message: 'კრედიტი აღარ გაქვს.' }, { status: 409 })

  const minutes = enrollmentMinutes(e)
  const now = new Date()
  const until = e.expiresAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // ── Expand the pattern against REAL availability ──────────────────────────
  const [windows, busy] = await Promise.all([
    prisma.availabilitySlot.findMany({
      where: { tutorId: e.tutor.id, endAt: { gt: now }, startAt: { lt: until } },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        tutorId: e.tutor.id,
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
        startAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), lt: until },
      },
      select: { startAt: true, durationMin: true },
    }),
  ])
  const openOpts = {
    windows: windows.map(w => ({ start: w.startAt, end: w.endAt })),
    busy: busy.map(b => ({ start: b.startAt, end: new Date(b.startAt.getTime() + b.durationMin * 60_000) })),
    serviceMin: minutes,
    bufferMin: e.tutor.bufferMin ?? 0,
    now: new Date(Date.now() - CLOCK_SKEW_MS),
    // High enough to cover a month of windows; the filter below is what
    // actually narrows it.
    limit: 3000,
  }
  // Match the pattern in TBILISI wall clock, never the process's own zone.
  // `getDay()`/`getHours()` here read whatever TZ the container was started
  // with: production happens to set Asia/Tbilisi, local dev sets nothing, and
  // the difference does not surface as an error — it surfaces as „ამ დღეებსა
  // და საათზე თავისუფალი დრო არ არის" on a calendar that is in fact free.
  const picks = computeOpenStarts(openOpts)
    .filter(d => {
      const p = tbilisiParts(d)
      return (
        weekdays.includes(p.isoDow) &&
        p.hour === hh &&
        p.minute === mm &&
        new Date(d.getTime() + minutes * 60_000) <= until
      )
    })
    .slice(0, need)

  if (picks.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'NO_MATCH', message: 'ამ დღეებსა და საათზე თავისუფალი დრო არ არის.' },
      { status: 409 },
    )
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      preview: picks.map(d => d.toISOString()),
      // Honest about the shortfall rather than silently booking fewer: the
      // client should see „6 of 8" BEFORE committing, not after.
      need,
      short: need - picks.length,
    })
  }

  try {
    const created = await runSerializable(() =>
      prisma.$transaction(async tx => {
        // Re-read credits inside the transaction — same reason as the single
        // booking route: Serializable is what makes read-then-write safe.
        const fresh = await tx.enrollment.findUniqueOrThrow({
          where: { id },
          select: { status: true, lessonsTotal: true, lessonsUsed: true },
        })
        if (fresh.status !== 'ACTIVE') throw new NoCredit()
        const room = fresh.lessonsTotal - fresh.lessonsUsed
        if (room < picks.length) throw new NoCredit()

        for (const start of picks) {
          const end = new Date(start.getTime() + minutes * 60_000)
          // Re-check openness INSIDE the transaction against the bookings this
          // loop has already created — otherwise two lessons of the same
          // pattern could be written on top of each other.
          const liveBusy = await tx.booking.findMany({
            where: {
              tutorId: e.tutor.id,
              status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
              startAt: { gt: new Date(start.getTime() - 6 * 60 * 60 * 1000), lt: new Date(end.getTime() + 6 * 60 * 60 * 1000) },
            },
            select: { startAt: true, durationMin: true },
          })
          const opts = {
            ...openOpts,
            busy: liveBusy.map(b => ({ start: b.startAt, end: new Date(b.startAt.getTime() + b.durationMin * 60_000) })),
          }
          if (!isStartOpen(start, opts)) throw new Conflict(start)

          await tx.booking.create({
            data: {
              studentId: me.id,
              tutorId: e.tutor.id,
              topic: e.package?.title || 'გაკვეთილი',
              startAt: start,
              durationMin: minutes,
              price: e.perLessonPrice,
              status: 'PREPARING',
              serviceType: e.tutor.serviceType,
              enrollmentId: id,
            },
          })
        }

        await tx.enrollment.update({
          where: { id },
          data: { lessonsUsed: { increment: picks.length } },
        })
        return picks.length
      }, { isolationLevel: 'Serializable' }),
    )

    return NextResponse.json({ ok: true, created, short: need - picks.length })
  } catch (err: any) {
    if (err instanceof NoCredit) {
      return NextResponse.json({ ok: false, error: 'NO_CREDIT', message: 'კრედიტი აღარ გაქვს.' }, { status: 409 })
    }
    if (err instanceof Conflict) {
      return NextResponse.json(
        { ok: false, error: 'SLOT_TAKEN', message: 'ერთ-ერთი დრო ამასობაში დაიკავეს — არაფერი დაჯავშნილა, სცადე თავიდან.' },
        { status: 409 },
      )
    }
    throw err
  }
}
