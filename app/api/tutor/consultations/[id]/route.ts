import { NextResponse } from 'next/server'
import { z } from 'zod'
import { tierOf } from '@/lib/consultationTier'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ROLE } from '@/lib/roles'

// ⚠️ `minutes` FLOOR IS 0 HERE, NOT 5 — see Consultation.bookable. A service
// row carries no clock, so an edit that keeps it a service must be allowed to
// send 0. The pairing rule (bookable ⇒ a real duration) is enforced below,
// against the row's CURRENT shape as well as the incoming one, because a PATCH
// may flip the flag without resending the minutes.
const UpdateBody = z.object({
  title: z.string().min(2).max(80).optional(),
  description: z.string().min(2).max(400).optional(),
  minutes: z.number().int().min(0).max(240).optional(),
  price: z.number().int().min(0).max(10000).optional(),
  bookable: z.boolean().optional(),
})

// Ownership check helper — returns the consultation only if it belongs to the
// caller (or caller is admin). Cheaper to inline the include than a second query.
async function loadOwned(id: string, userId: string, role: string) {
  const c = await prisma.consultation.findUnique({
    where: { id },
    include: { tutor: { select: { userId: true } } },
  })
  if (!c) return { c: null, forbidden: false }
  if (c.tutor.userId !== userId && role !== 'ADMIN') return { c, forbidden: true }
  return { c, forbidden: false }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
  if (auth.response) return auth.response
  const user = auth.user
  const { id } = await ctx.params
  const { c, forbidden } = await loadOwned(id, user.id, user.role)
  if (!c) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (forbidden) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // ⚠️ THE PAIRING RULE, CHECKED AGAINST THE MERGED ROW. A PATCH may send the
  // flag without the minutes („make this a service") or the minutes without the
  // flag („make it 45 minutes"), so neither half of the body can be judged
  // alone. Resolve what the row WILL be, then apply the one invariant:
  // bookable ⇒ a real duration, service ⇒ no clock at all.
  const willBook = parsed.data.bookable ?? c.bookable
  const willMins = parsed.data.minutes ?? c.minutes
  if (willBook && willMins < 5) {
    return NextResponse.json(
      { ok: false, error: 'INVALID', message: 'ჯავშნად სერვისს ხანგრძლივობა სჭირდება' },
      { status: 400 },
    )
  }
  // A service keeps no leftover duration from the shape it used to be — the
  // profile prints „60 წთ" from this column and would announce a session that
  // is not on offer.
  // The tier follows the minutes it is derived from — a row edited from 60 to 15
  // used to keep DEEP for ever, because the client sent the tier on CREATE and
  // never again. Nothing reads the value (see the POST route's note), so this
  // corrected nothing visible; it is here so the column cannot drift from the
  // one number that defines it.
  const base = willBook ? parsed.data : { ...parsed.data, minutes: 0 }
  const data = { ...base, tier: tierOf(willBook ? willMins : 0) }

  const updated = await prisma.consultation.update({ where: { id }, data })
  return NextResponse.json({ ok: true, item: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
  if (auth.response) return auth.response
  const user = auth.user
  const { id } = await ctx.params
  const { c, forbidden } = await loadOwned(id, user.id, user.role)
  if (!c) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (forbidden) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

  // Refuse delete if any live booking references it.
  const inUse = await prisma.booking.count({
    where: { consultationId: id, status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] } },
  })
  if (inUse > 0) {
    return NextResponse.json({ ok: false, error: 'IN_USE', count: inUse }, { status: 409 })
  }

  await prisma.consultation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
