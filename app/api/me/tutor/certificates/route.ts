import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

const Body = z.object({
  title: z.string().min(2).max(200),
  issuer: z.string().min(2).max(200),
  year: z.number().int().min(1900).max(2100),
  fileUrl: z.string().url().max(500).optional().nullable(),
})

async function tutorProfileForUser(userId: string) {
  return prisma.tutorProfile.findUnique({ where: { userId } })
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const profile = await tutorProfileForUser(user.id)
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })
  const items = await prisma.certificate.findMany({
    where: { tutorId: profile.id },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
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

  const item = await prisma.certificate.create({
    data: {
      tutorId: profile.id,
      title: parsed.data.title.trim(),
      issuer: parsed.data.issuer.trim(),
      year: parsed.data.year,
      fileUrl: parsed.data.fileUrl?.trim() || null,
    },
  })
  return NextResponse.json({ ok: true, item })
}
