import { NextResponse } from 'next/server'
import { z } from 'zod'
import { firstGeorgianMessage, georgianRefine } from '@/lib/georgianText'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ROLE } from '@/lib/roles'

const Body = z.object({
  // `company` is NOT gated, for the same reason `school` is not: „Deloitte",
  // „TBC Bank" and „EPAM" are names, not sentences.
  company: z.string().min(2).max(200),
  role: z.string().min(2).max(200).superRefine(georgianRefine('პოზიცია')),
  startYear: z.number().int().min(1900).max(2100),
  endYear: z.number().int().min(1900).max(2100).optional().nullable(),
  description: z.string().max(2000).optional().nullable().superRefine(georgianRefine('აღწერა')),
})

async function tutorProfileForUser(userId: string) {
  return prisma.tutorProfile.findUnique({ where: { userId } })
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const profile = await tutorProfileForUser(user.id)
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })
  const items = await prisma.experience.findMany({
    where: { tutorId: profile.id },
    orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ ok: true, items })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  if (user.role !== ROLE.PROVIDER && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const profile = await tutorProfileForUser(user.id)
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // Our own copy (the Georgian-language gate) reaches the field; zod's
    // English stays behind the generic code.
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

  const { company, role, startYear, endYear, description } = parsed.data
  if (endYear != null && endYear < startYear) {
    return NextResponse.json({ ok: false, error: 'BAD_RANGE' }, { status: 400 })
  }
  const item = await prisma.experience.create({
    data: {
      tutorId: profile.id,
      company: company.trim(),
      role: role.trim(),
      startYear,
      endYear: endYear ?? null,
      description: description?.trim() || null,
    },
  })
  return NextResponse.json({ ok: true, item })
}
