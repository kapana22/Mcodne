import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'

const Body = z.object({ featured: z.boolean() })

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireRole('ADMIN')
  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const updated = await prisma.tutorProfile.update({
    where: { id },
    data: { featured: parsed.data.featured },
    select: { id: true, featured: true },
  })

  await audit(admin.id, parsed.data.featured ? 'tutor.feature' : 'tutor.unfeature', {
    targetType: 'TutorProfile',
    targetId: id,
  })

  return NextResponse.json({ ok: true, tutor: updated })
}
