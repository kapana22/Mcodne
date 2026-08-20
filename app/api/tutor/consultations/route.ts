import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { firstGeorgianMessage, georgianRefine } from '@/lib/georgianText'
import { ROLE } from '@/lib/roles'


// ⚠️ TWO SHAPES, ONE TABLE (2026-08-20) — see Consultation.bookable in
// schema.prisma. A BOOKABLE row is bought by picking a time and must carry a
// real duration; a SERVICE row is a job arranged in the thread and has no clock
// at all. The zod schema below refuses to let the two blur: `minutes` is
// required and bounded when bookable, and forced to 0 when it is not, so a
// service can never reach a calendar and a booking can never lose its length.
const Offering = z.object({
  tier: z.enum(['QUICK', 'STANDARD', 'DEEP']),
  title: z.string().min(2).max(80).superRefine(georgianRefine('სერვისის სახელი')),
  description: z.string().min(2).max(400).superRefine(georgianRefine('აღწერა')),
  minutes: z.number().int().min(0).max(240),
  price: z.number().int().min(0).max(10000),
  // Absent means BOOKABLE, so every existing client keeps working unchanged.
  bookable: z.boolean().default(true),
})
  .refine(v => !v.bookable || v.minutes >= 5, {
    path: ['minutes'], message: 'ჯავშნად სერვისს ხანგრძლივობა სჭირდება',
  })
  .transform(v => (v.bookable ? v : { ...v, minutes: 0 }))

const CreateBody = Offering

// Public read is fine (tutor detail already exposes services), but write requires
// tutor owner (or admin). Currently only listing the caller's own consultations.
export async function GET() {
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
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
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
  if (auth.response) return auth.response
  const user = auth.user
  const tutor = await prisma.tutorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!tutor) return NextResponse.json({ ok: false, error: 'NO_TUTOR_PROFILE' }, { status: 400 })

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // Surface OUR validation copy (e.g. the Georgian-language gate); zod's
    // own English messages stay behind the generic code.
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

  const c = await prisma.consultation.create({
    data: { ...parsed.data, tutorId: tutor.id },
  })
  return NextResponse.json({ ok: true, item: c })
}
