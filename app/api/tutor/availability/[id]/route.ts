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

  // Guard: don't allow removing a slot that overlaps ANY live booking on this
  // tutor. Prisma can't compute `startAt + durationMin` in `where`, so pull the
  // candidate set (any live booking that starts before the slot ends) and check
  // per-row in JS. `findFirst` would have missed a later booking whose start is
  // before slot.endAt but whose end lands inside the slot.
  const candidates = await prisma.booking.findMany({
    where: {
      tutorId: slot.tutorId,
      status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
      startAt: { lt: slot.endAt },
    },
    select: { id: true, startAt: true, durationMin: true },
  })
  const conflict = candidates.find(b => {
    const bEnd = new Date(b.startAt.getTime() + b.durationMin * 60_000)
    return bEnd > slot.startAt
  })
  if (conflict) {
    return NextResponse.json({ ok: false, error: 'SLOT_BOOKED', bookingId: conflict.id }, { status: 409 })
  }

  await prisma.availabilitySlot.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
