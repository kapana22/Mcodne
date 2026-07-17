import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

const Body = z.object({
  school: z.string().min(2).max(200),
  degree: z.string().min(1).max(200),
  field: z.string().max(200).optional().nullable(),
  startYear: z.number().int().min(1900).max(2100),
  endYear: z.number().int().min(1900).max(2100).optional().nullable(),
})

async function tutorProfileForUser(userId: string) {
  return prisma.tutorProfile.findUnique({ where: { userId } })
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const profile = await tutorProfileForUser(user.id)
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })
  const items = await prisma.education.findMany({
    where: { tutorId: profile.id },
    orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ ok: true, items })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const profile = await tutorProfileForUser(user.id)
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const { school, degree, field, startYear, endYear } = parsed.data
  if (endYear != null && endYear < startYear) {
    return NextResponse.json({ ok: false, error: 'BAD_RANGE' }, { status: 400 })
  }
  const item = await prisma.education.create({
    data: {
      tutorId: profile.id,
      school: school.trim(),
      degree: degree.trim(),
      field: field?.trim() || null,
      startYear,
      endYear: endYear ?? null,
    },
  })
  return NextResponse.json({ ok: true, item })
}
