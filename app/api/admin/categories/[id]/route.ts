import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// PATCH /api/admin/categories/[id]
// Partial update — either or both of `isLive` (browse visibility) and
// `defaultServiceType` (inherited by new tutors in this category). Zod refuses
// empty bodies so no-op PATCHes fail loud instead of silently returning 200.
const Body = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    isLive: z.boolean().optional(),
    defaultServiceType: z.enum(['CONSULTATION', 'RECURRING']).optional(),
  })
  .refine(v => v.name !== undefined || v.isLive !== undefined || v.defaultServiceType !== undefined, {
    message: 'EMPTY_BODY',
  })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireRole('ADMIN')
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  try {
    const updated = await prisma.category.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        slug: true,
        name: true,
        defaultServiceType: true,
        isLive: true,
        _count: { select: { tutors: true } },
      },
    })
    return NextResponse.json({
      ok: true,
      category: {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        defaultServiceType: updated.defaultServiceType,
        isLive: updated.isLive,
        tutorCount: updated._count.tutors,
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }
}

// DELETE /api/admin/categories/[id] — only when no experts are attached (a
// category with tutors can be hidden via isLive instead, never orphaned).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole('ADMIN')
  const { id } = await params
  const cat = await prisma.category.findUnique({ where: { id }, select: { _count: { select: { tutors: true } } } })
  if (!cat) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  if (cat._count.tutors > 0) {
    return NextResponse.json({ ok: false, error: 'HAS_TUTORS' }, { status: 409 })
  }
  await prisma.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
