// „Can this teacher actually deliver this package?" — the DB-touching half of
// the schedule gate. The arithmetic itself is pure and lives in lib/packages
// (scheduleCapacity / packageFits); this file only fetches what it needs.
//
// Split exactly like lib/abroad vs its callers: lib/packages stays importable
// from a client component, this one never is.

import { prisma } from '@/lib/prisma'
import { computeOpenStarts } from '@/lib/availability'
import { scheduleCapacity } from '@/lib/packages'

/**
 * The largest number of `minutesPerLesson` lessons that fit in this teacher's
 * PUBLISHED availability over the next `withinDays` days, after existing
 * bookings and their own buffer are taken out.
 *
 * Deliberately measured against real published windows and not against a
 * promise: an empty calendar returns 0, which is the whole point.
 */
export async function tutorScheduleCapacity(
  tutorId: string,
  minutesPerLesson: number,
  withinDays: number,
  now = new Date(),
): Promise<number> {
  const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000)

  const [tutor, windows, busy] = await Promise.all([
    prisma.tutorProfile.findUnique({ where: { id: tutorId }, select: { bufferMin: true } }),
    // Any window that OVERLAPS the horizon, not just ones starting inside it —
    // a window opened yesterday and running through next week still holds
    // lessons, and filtering on startAt alone would silently drop it.
    prisma.availabilitySlot.findMany({
      where: { tutorId, endAt: { gt: now }, startAt: { lt: until } },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        tutorId,
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
        startAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), lt: until },
      },
      select: { startAt: true, durationMin: true },
    }),
  ])

  const starts = computeOpenStarts({
    windows: windows.map(w => ({ start: w.startAt, end: w.endAt })),
    busy: busy.map(b => ({ start: b.startAt, end: new Date(b.startAt.getTime() + b.durationMin * 60_000) })),
    serviceMin: minutesPerLesson,
    bufferMin: tutor?.bufferMin ?? 0,
    now,
    // The horizon is the package's own validity window; nothing beyond it can
    // be used, so nothing beyond it should count.
    limit: 2000,
  }).filter(d => d < until)

  return scheduleCapacity(starts, minutesPerLesson, tutor?.bufferMin ?? 0)
}

/** Per-package verdict, in the shape both the editor and /swavleba render. */
type PackageFit = { capacity: number; fits: boolean }

/** Capacity for several packages at once, keyed by package id. */
export async function packageFits(
  tutorId: string,
  packages: { id: string; minutesPerLesson: number; validDays: number; lessonsCount: number }[],
  now = new Date(),
): Promise<Record<string, PackageFit>> {
  const out: Record<string, PackageFit> = {}
  // Sequential on purpose: this runs for at most three packages per teacher and
  // each call is three indexed reads. Fanning out would multiply DB round-trips
  // for a page that is not hot.
  for (const p of packages) {
    const capacity = await tutorScheduleCapacity(tutorId, p.minutesPerLesson, p.validDays, now)
    out[p.id] = { capacity, fits: capacity >= p.lessonsCount }
  }
  return out
}
