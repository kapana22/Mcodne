import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// Recurring weekly-template availability. Tutor picks weekday+time blocks once,
// we materialize each block as ONE concrete AvailabilitySlot WINDOW per week for
// the next N weeks. Conflicts (overlaps with existing rows) are skipped silently
// — the tutor sees a count of created vs skipped in the response.
//
// Nothing is pre-split into session-length pieces here, and the earlier
// "trusts the client to pre-split" hardening gap is GONE by construction: the
// server derives bookable starts from windows at request time
// (lib/availability), so how the client chose to chop the week no longer
// changes what is sellable. A client that still posts many small adjacent
// blocks is harmless — exactly-touching rows merge back into one window.
//
// day: 0=Mon..6=Sun (matches the schedule grid's isoWeekday convention).
const BlockSchema = z.object({
  day: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  startMin: z.number().int().min(0).max(59).default(0),
  endHour: z.number().int().min(0).max(24),
  endMin: z.number().int().min(0).max(59).default(0),
})

const Body = z.object({
  // One row per posted block, so a week now needs only a handful of blocks.
  // The 700 cap is kept for backward compatibility: clients built against the
  // pre-slicing server still post up to 7 days × 96 fifteen-minute blocks, and
  // rejecting them as INVALID would break a schedule page mid-rollout. `weeks`
  // multiplies rows server-side, not this array.
  blocks: z.array(BlockSchema).min(1).max(700),
  weeks: z.number().int().min(1).max(12),
})

// Asia/Tbilisi is a fixed UTC+4 with no DST — the platform's canonical zone.
// Slot times must be materialized in Tbilisi wall-clock, NOT the server's local
// tz (a UTC container would otherwise shift every "10:00" slot to 14:00 Tbilisi).
const TB_OFFSET_MS = 4 * 60 * 60 * 1000

export async function POST(req: Request) {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // Validate each block's time range up front so we fail fast on bad input
  // before doing any DB work.
  for (const b of parsed.data.blocks) {
    const startMs = b.startHour * 60 + b.startMin
    const endMs = b.endHour * 60 + b.endMin
    if (endMs <= startMs) {
      return NextResponse.json({ ok: false, error: 'BAD_RANGE' }, { status: 400 })
    }
  }

  const now = new Date()

  // "Now" in Tbilisi wall-clock, read via UTC getters (shift the instant by the
  // fixed +4 offset, then interpret UTC fields as local fields).
  const nowTb = new Date(now.getTime() + TB_OFFSET_MS)
  // Midnight of the Tbilisi-Monday of the current week, held as UTC components.
  const mondayTb = new Date(Date.UTC(nowTb.getUTCFullYear(), nowTb.getUTCMonth(), nowTb.getUTCDate()))
  const dow = (mondayTb.getUTCDay() + 6) % 7 // Mon=0
  mondayTb.setUTCDate(mondayTb.getUTCDate() - dow)

  // Given a day-offset from Monday and a Tbilisi wall-clock h:m, return the real
  // UTC instant (subtract the +4 offset). endHour=24 rolls to next-day 00:00.
  const slotUtc = (dayOffset: number, h: number, m: number): Date => {
    const d = new Date(mondayTb)
    d.setUTCDate(d.getUTCDate() + dayOffset)
    const wall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m)
    return new Date(wall - TB_OFFSET_MS)
  }

  // Materialize every (block, week) pair into ONE window (start/end) — never
  // into session-length pieces.
  type Candidate = { startAt: Date; endAt: Date }
  const candidates: Candidate[] = []
  for (let w = 0; w < parsed.data.weeks; w++) {
    for (const b of parsed.data.blocks) {
      const dayOffset = w * 7 + b.day
      const startAt = slotUtc(dayOffset, b.startHour, b.startMin)
      const endAt = slotUtc(dayOffset, b.endHour, b.endMin)
      // Skip past slots — a "Monday 10:00" template applied on Wednesday
      // shouldn't create Monday-morning rows in week 0.
      if (endAt <= now) continue
      candidates.push({ startAt, endAt })
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, created: 0, skipped: 0 })
  }

  // Overlap check against existing slots. We pull all future slots for this
  // tutor once, then filter in memory — cheaper than N queries for a
  // ~50-slot batch.
  const existing = await prisma.availabilitySlot.findMany({
    where: {
      tutorId: profile.id,
      endAt: { gte: now },
    },
    select: { startAt: true, endAt: true },
  })

  const overlapsExisting = (c: Candidate) =>
    existing.some(e => e.startAt < c.endAt && e.endAt > c.startAt)

  const uniqueInBatch = (c: Candidate, batch: Candidate[]) =>
    !batch.some(b => b.startAt < c.endAt && b.endAt > c.startAt)

  const toCreate: Candidate[] = []
  let skipped = 0
  for (const c of candidates) {
    if (overlapsExisting(c) || !uniqueInBatch(c, toCreate)) {
      skipped++
      continue
    }
    toCreate.push(c)
  }

  if (toCreate.length === 0) {
    return NextResponse.json({ ok: true, created: 0, skipped })
  }

  const result = await prisma.availabilitySlot.createMany({
    data: toCreate.map(c => ({ tutorId: profile.id, startAt: c.startAt, endAt: c.endAt })),
    skipDuplicates: true,
  })

  return NextResponse.json({ ok: true, created: result.count, skipped })
}

/* ───── DELETE — withdraw ALL future availability in one call ─────
 * Powers „სრულად წაშლა“ on /tutor/schedule. It lives here rather than in a new
 * route because this file already owns the many-windows-at-once half of the
 * availability API: POST materializes them, DELETE withdraws them. (The
 * vacation flow still loops over /availability/[id]; it can move here unchanged
 * via the optional ?from/?to bounds below.)
 *
 * Scope — rows with any FUTURE part (`endAt > now`). A window that already
 * ended is history and is never touched, and neither is a single Booking:
 * under the windows model a booking is an independent row (see [id]/route.ts),
 * so un-publishing a window strands nothing — the session still happens, that
 * time merely stops being offered. We only COUNT the overlapping sessions so
 * the UI can say so out loud.
 *
 * Ownership guard: the sweep is scoped to the CALLER's own profile id and takes
 * no row ids at all, so it can never name someone else's availability.
 * Idempotent: a second call deletes 0 rows and still answers 200 { ok: true }.
 */
export async function DELETE(req: Request) {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 400 })

  const now = new Date()
  const url = new URL(req.url)
  const bound = (v: string | null) => {
    const d = v ? new Date(v) : null
    return d && !isNaN(d.getTime()) ? d : null
  }
  const from = bound(url.searchParams.get('from'))
  const to = bound(url.searchParams.get('to'))
  // `now` is a FLOOR, never a ceiling: a caller-supplied `from` can only narrow
  // the sweep forward, so no query string can ever reach into the past.
  const floor = from && from > now ? from : now

  const where = {
    tutorId: profile.id,
    endAt: { gt: floor },
    ...(to ? { startAt: { lt: to } } : {}),
  }

  const doomed = await prisma.availabilitySlot.findMany({
    where,
    select: { startAt: true, endAt: true },
  })
  if (doomed.length === 0) return NextResponse.json({ ok: true, deleted: 0, keptBookings: 0 })

  // Sessions that stay in force inside the windows we are about to un-publish.
  // Prisma can't compute `startAt + durationMin` in `where`, so pull the
  // candidate set once (anything starting before the last window ends) and test
  // the overlap per-row in JS — same shape as the single-window DELETE.
  const spanEnd = doomed.reduce((m, s) => (s.endAt > m ? s.endAt : m), doomed[0].endAt)
  const candidates = await prisma.booking.findMany({
    where: {
      tutorId: profile.id,
      status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
      startAt: { lt: spanEnd },
    },
    select: { startAt: true, durationMin: true },
  })
  const keptBookings = candidates.filter(b => {
    const bs = b.startAt.getTime()
    const be = bs + b.durationMin * 60_000
    return doomed.some(s => bs < s.endAt.getTime() && be > s.startAt.getTime())
  }).length

  const res = await prisma.availabilitySlot.deleteMany({ where })
  return NextResponse.json({ ok: true, deleted: res.count, keptBookings })
}
