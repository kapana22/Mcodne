import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

const Body = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
})

// A window may now legitimately be many hours long (it is no longer sliced into
// one-session pieces), but a whole day in one row is almost always a fat-finger
// on the date field rather than a real 24h shift — cap it.
const MAX_WINDOW_MS = 12 * 60 * 60 * 1000

export async function GET(req: Request) {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return NextResponse.json({ slots: [], upcomingFreeCount: 0 })

  // Optional window filter. take raised 200 → 500: a 12-week weekly template
  // materializes ~480 rows, and the old cap silently hid the tail so the grid
  // lied about published availability.
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(to) : null

  const [slots, upcomingFreeCount] = await Promise.all([
    prisma.availabilitySlot.findMany({
      where: {
        tutorId: profile.id,
        ...(fromDate && !isNaN(fromDate.getTime()) ? { startAt: { gte: fromDate } } : {}),
        ...(toDate && !isNaN(toDate.getTime()) ? { endAt: { lte: toDate } } : {}),
      },
      orderBy: { startAt: 'asc' },
      take: 500,
    }),
    // Exact activation signal, independent of the list cap — the schedule
    // banner and dashboard alert key off this. No `booked` filter any more:
    // rows are WINDOWS, and a window overlapped by a booking is still published
    // availability (the free part of it remains bookable). `booked` is legacy.
    prisma.availabilitySlot.count({
      where: { tutorId: profile.id, startAt: { gt: new Date() } },
    }),
  ])
  return NextResponse.json({ slots, upcomingFreeCount })
}

export async function POST(req: Request) {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const startAt = new Date(parsed.data.startAt)
  const endAt = new Date(parsed.data.endAt)
  if (endAt <= startAt) {
    return NextResponse.json({ ok: false, error: 'BAD_RANGE' }, { status: 400 })
  }
  if (startAt < new Date()) {
    return NextResponse.json({ ok: false, error: 'PAST_DATE' }, { status: 400 })
  }

  // The range is stored as ONE window row — no slicing. Pre-slicing by the
  // profile's `consultationDurationMin` was the origin of the whole inventory
  // bug: a service longer than a piece consumed only the first one (the rest
  // still advertised as free but unbookable), a shorter one destroyed the
  // piece's remaining minutes. Bookable starts are now DERIVED from the window
  // at request time (lib/availability), so one row sells as many sessions as
  // actually fit, at whatever length each service needs.
  if (endAt.getTime() - startAt.getTime() > MAX_WINDOW_MS) {
    return NextResponse.json({ ok: false, error: 'TOO_LONG' }, { status: 400 })
  }

  // Reject overlap with any existing row for this tutor — publishing the same
  // hours twice would just duplicate a window (harmless to the math, confusing
  // on the schedule grid). Two intervals [a,b] and [c,d] overlap iff a < d AND c < b.
  const conflict = await prisma.availabilitySlot.findFirst({
    where: {
      tutorId: profile.id,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  })
  if (conflict) {
    return NextResponse.json({ ok: false, error: 'OVERLAP' }, { status: 409 })
  }

  const slot = await prisma.availabilitySlot.create({
    data: { tutorId: profile.id, startAt, endAt },
  })
  // `slots` kept alongside `slot` for wire compatibility — the schedule grid
  // appends whatever the server returns, and it used to be many rows.
  return NextResponse.json({ ok: true, slots: [slot], slot })
}
