import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { windowRangeError } from '@/lib/availabilityRules'

const Body = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
})

/**
 * PATCH — move or resize a published window.
 *
 * NEW 2026-08-07, and its absence was the whole complaint: there was no edit
 * anywhere in the product. The only way to change „ორშ 10:00–18:00" to
 * „11:00–18:00" was to DELETE it (through a confirm dialog warning about the
 * sessions inside) and retype both ends. So the schedule was write-once, and
 * every correction read as destructive.
 *
 * Bookings are deliberately NOT touched, and never block the edit — exactly as
 * in DELETE below. A `Booking` is an independent row under the windows model;
 * moving the window it happens to sit inside changes what is PUBLISHED, not
 * what was agreed. We only COUNT the sessions that end up outside the new range
 * so the UI can say so out loud instead of silently un-publishing them.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
  if (auth.response) return auth.response
  const user = auth.user
  const { id } = await ctx.params

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id },
    include: { tutor: { select: { userId: true } } },
  })
  if (!slot) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (slot.tutor.userId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const startAt = new Date(parsed.data.startAt)
  const endAt = new Date(parsed.data.endAt)
  // The same predicate POST uses — see lib/availabilityRules.ts for why it is
  // not restated here. `keepStart` is the one difference: a window that has
  // already begun stays shortenable, as long as its start is not moved.
  const rangeErr = windowRangeError(startAt, endAt, new Date(), { keepStart: slot.startAt })
  if (rangeErr) return NextResponse.json({ ok: false, error: rangeErr }, { status: 400 })

  // Overlap with any OTHER window of this tutor. `id: { not: id }` is the whole
  // difference from POST: without it every edit conflicts with itself and the
  // expert is told „this time is already published" about the row they are
  // editing.
  const conflict = await prisma.availabilitySlot.findFirst({
    where: { tutorId: slot.tutorId, id: { not: id }, startAt: { lt: endAt }, endAt: { gt: startAt } },
  })
  if (conflict) return NextResponse.json({ ok: false, error: 'OVERLAP' }, { status: 409 })

  // Prisma can't compute `startAt + durationMin` in `where`, so pull the
  // candidates and test the overlap per-row in JS (same as DELETE).
  const candidates = await prisma.booking.findMany({
    where: {
      tutorId: slot.tutorId,
      status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
      startAt: { lt: slot.endAt },
    },
    select: { startAt: true, durationMin: true },
  })
  const overlaps = (from: Date, to: Date) => (b: { startAt: Date; durationMin: number }) =>
    b.startAt.getTime() < to.getTime() && b.startAt.getTime() + b.durationMin * 60_000 > from.getTime()
  const wasInside = candidates.filter(overlaps(slot.startAt, slot.endAt))
  const outsideBookings = wasInside.filter(b => !overlaps(startAt, endAt)(b)).length

  const updated = await prisma.availabilitySlot.update({ where: { id }, data: { startAt, endAt } })
  return NextResponse.json({ ok: true, slot: updated, outsideBookings })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
  if (auth.response) return auth.response
  const user = auth.user
  const { id } = await ctx.params

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id },
    include: { tutor: { select: { userId: true } } },
  })
  if (!slot) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (slot.tutor.userId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  // NO refusal when a booking overlaps — bookings no longer live in slots.
  // Under the windows model a `Booking` is a fully independent row (`heldSlotId`
  // is legacy/null for new bookings) and its validity does not depend on the
  // availability window it happens to sit inside; bookable starts are DERIVED
  // from windows − bookings at request time (lib/availability.ts). So deleting a
  // window strands nothing: the session still happens, that time merely stops
  // being PUBLISHED. Refusing was far too blunt — one 11:00 booking pinned an
  // entire 10:00–13:00 window and the expert could not withdraw any of it.
  // We only COUNT the overlapping sessions so the UI can say what survives.
  // Bookings are never canceled, moved or otherwise touched here.
  // Prisma can't compute `startAt + durationMin` in `where`, so pull the
  // candidate set (any active booking that starts before the window ends) and
  // test the overlap per-row in JS.
  const candidates = await prisma.booking.findMany({
    where: {
      tutorId: slot.tutorId,
      status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
      startAt: { lt: slot.endAt },
    },
    select: { startAt: true, durationMin: true },
  })
  const keptBookings = candidates.filter(
    b => b.startAt.getTime() + b.durationMin * 60_000 > slot.startAt.getTime(),
  ).length

  await prisma.availabilitySlot.delete({ where: { id } })
  // `keptBookings` is honesty data for the confirm dialog / toast: sessions that
  // stay in force inside the window we just un-published.
  return NextResponse.json({ ok: true, keptBookings })
}
