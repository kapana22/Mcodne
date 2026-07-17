import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

const Body = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
})

export async function GET() {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return NextResponse.json({ slots: [] })
  const slots = await prisma.availabilitySlot.findMany({
    where: { tutorId: profile.id },
    orderBy: { startAt: 'asc' },
    take: 200,
  })
  return NextResponse.json({ slots })
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

  // Reject overlap with any existing slot for this tutor.
  // Two intervals [a,b] and [c,d] overlap iff a < d AND c < b.
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
  return NextResponse.json({ ok: true, slot })
}
