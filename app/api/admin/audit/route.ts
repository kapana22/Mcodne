import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// Recent audit log entries. Includes actor's name/email so the UI doesn't need
// a second lookup per row.
export async function GET(req: Request) {
  await requireRole('ADMIN')

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')?.trim()
  const actorId = searchParams.get('actorId')?.trim()
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)

  const where: any = {}
  if (action) where.action = { contains: action }
  if (actorId) where.actorId = actorId

  const items = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // Batch-fetch actor names so table rows show "დათო ბერიძე" not raw cuid.
  const actorIds = Array.from(new Set(items.map(i => i.actorId).filter(a => a && a !== 'system')))
  const actors = actorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true, email: true },
      })
    : []
  const actorMap = new Map(actors.map(a => [a.id, a]))

  return NextResponse.json(items.map(i => ({
    ...i,
    actor: actorMap.get(i.actorId) ?? (i.actorId === 'system' ? { id: 'system', fullName: 'system', email: '' } : null),
  })))
}
