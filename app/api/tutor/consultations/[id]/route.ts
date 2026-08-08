import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'

const UpdateBody = z.object({
  title: z.string().min(2).max(80).optional(),
  description: z.string().min(2).max(400).optional(),
  minutes: z.number().int().min(5).max(240).optional(),
  price: z.number().int().min(0).max(10000).optional(),
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
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
  if (auth.response) return auth.response
  const user = auth.user
  const { id } = await ctx.params
  const { c, forbidden } = await loadOwned(id, user.id, user.role)
  if (!c) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (forbidden) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const updated = await prisma.consultation.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ ok: true, item: updated })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi(['TUTOR', 'ADMIN'])
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
