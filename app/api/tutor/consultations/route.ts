import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

const CreateBody = z.object({
  tier: z.enum(['QUICK', 'STANDARD', 'DEEP']),
  title: z.string().min(2).max(80),
  description: z.string().min(2).max(400),
  minutes: z.number().int().min(5).max(240),
  price: z.number().int().min(0).max(10000),
})

// Public read is fine (tutor detail already exposes services), but write requires
// tutor owner (or admin). Currently only listing the caller's own consultations.
export async function GET() {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const tutor = await prisma.tutorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!tutor) return NextResponse.json({ items: [] })
  const items = await prisma.consultation.findMany({
    where: { tutorId: tutor.id },
    orderBy: { minutes: 'asc' },
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const user = await requireRole(['TUTOR', 'ADMIN'])
  const tutor = await prisma.tutorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!tutor) return NextResponse.json({ ok: false, error: 'NO_TUTOR_PROFILE' }, { status: 400 })

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const c = await prisma.consultation.create({
    data: { ...parsed.data, tutorId: tutor.id },
  })
  return NextResponse.json({ ok: true, item: c })
}
