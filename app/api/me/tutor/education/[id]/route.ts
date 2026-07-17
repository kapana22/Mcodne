import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const { id } = await ctx.params
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })

  const item = await prisma.education.findUnique({ where: { id } })
  if (!item || item.tutorId !== profile.id) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }
  await prisma.education.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
