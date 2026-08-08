import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { georgianRefine } from '@/lib/georgianText'

/** First human-readable custom message from a zod error, if any. */
function firstCustomMessage(err: { issues: { code: string; message: string }[] }): string | null {
  const hit = err.issues.find(i => i.code === 'custom' && /[Ⴀ-ჿᲐ-Ჿ]/.test(i.message))
  return hit?.message ?? null
}


const CreateBody = z.object({
  tier: z.enum(['QUICK', 'STANDARD', 'DEEP']),
  title: z.string().min(2).max(80).superRefine(georgianRefine('სერვისის სახელი')),
  description: z.string().min(2).max(400).superRefine(georgianRefine('აღწერა')),
  minutes: z.number().int().min(5).max(240),
  price: z.number().int().min(0).max(10000),
})

// Public read is fine (tutor detail already exposes services), but write requires
// tutor owner (or admin). Currently only listing the caller's own consultations.
export async function GET() {
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
  if (auth.response) return auth.response
  const user = auth.user
  const tutor = await prisma.tutorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!tutor) return NextResponse.json({ items: [] })
  const items = await prisma.consultation.findMany({
    where: { tutorId: tutor.id },
    orderBy: { minutes: 'asc' },
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
  if (auth.response) return auth.response
  const user = auth.user
  const tutor = await prisma.tutorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!tutor) return NextResponse.json({ ok: false, error: 'NO_TUTOR_PROFILE' }, { status: 400 })

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // Surface OUR validation copy (e.g. the Georgian-language gate); zod's
    // own English messages stay behind the generic code.
    const msg = firstCustomMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

  const c = await prisma.consultation.create({
    data: { ...parsed.data, tutorId: tutor.id },
  })
  return NextResponse.json({ ok: true, item: c })
}
