import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole(['TUTOR', 'ADMIN'])
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
