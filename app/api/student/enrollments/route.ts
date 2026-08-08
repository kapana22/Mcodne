import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { computeOpenStarts } from '@/lib/availability'
import { packagesFeatureExists, lessonsLeft, enrollmentMinutes } from '@/lib/packages'

// The client's packages, with the times they can actually spend a credit on.
//
// Open starts are computed HERE rather than left to a second round-trip, for
// the reason the roster exists at all: the one thing that turns an unused
// credit into an expired one is friction between „I have lessons left" and
// „when can I take one". They are the same screen.

export async function GET() {
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const rows = await prisma.enrollment.findMany({
    where: { studentId: me.id, status: { in: ['REQUESTED', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, status: true, lessonsTotal: true, lessonsUsed: true,
      priceTotal: true, expiresAt: true, minutesPerLesson: true,
      package: { select: { title: true, minutesPerLesson: true } },
      tutor: {
        select: {
          id: true, slug: true, bufferMin: true,
          user: { select: { fullName: true } },
        },
      },
    },
    take: 20,
  })

  const now = new Date()
  const items = await Promise.all(rows.map(async e => {
    const left = lessonsLeft(e.lessonsTotal, e.lessonsUsed)
    // The length THIS client bought, not the package's current one — the times
    // offered below are computed from it, so a live read would offer slots the
    // booking route then refuses.
    const minutes = enrollmentMinutes(e)
    // Only ACTIVE enrollments with credit left need times; asking for the rest
    // would be three indexed reads per row for something nobody can act on.
    let starts: string[] = []
    if (e.status === 'ACTIVE' && left > 0) {
      const until = e.expiresAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
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
      starts = computeOpenStarts({
        windows: windows.map(w => ({ start: w.startAt, end: w.endAt })),
        busy: busy.map(b => ({ start: b.startAt, end: new Date(b.startAt.getTime() + b.durationMin * 60_000) })),
        serviceMin: minutes,
        bufferMin: e.tutor.bufferMin ?? 0,
        now,
        limit: 60,
      })
        // A start that ENDS past the expiry cannot be booked (the book route
        // refuses it), so offering it would be a dead end.
        .filter(d => new Date(d.getTime() + minutes * 60_000) <= until)
        .map(d => d.toISOString())
    }
    return {
      id: e.id,
      status: e.status,
      lessonsTotal: e.lessonsTotal,
      lessonsUsed: e.lessonsUsed,
      left,
      priceTotal: e.priceTotal,
      expiresAt: e.expiresAt,
      minutes,
      title: e.package?.title ?? 'პაკეტი',
      tutorName: e.tutor.user.fullName,
      tutorSlug: e.tutor.slug ?? e.tutor.id,
      starts,
    }
  }))

  return NextResponse.json({ items })
}
