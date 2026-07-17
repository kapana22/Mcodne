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
    isLive: z.boolean().optional(),
    defaultServiceType: z.enum(['CONSULTATION', 'RECURRING']).optional(),
  })
  .refine(v => v.isLive !== undefined || v.defaultServiceType !== undefined, {
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
