import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

// POST /api/notifications/read
// Mark specific notifications read, or all-of-mine if `all: true`.
// Body: { ids?: string[], all?: boolean }

const Body = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
})

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  const { ids, all } = parsed.data
  const now = new Date()

  if (all) {
    const r = await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: now },
    })
    return NextResponse.json({ ok: true, updated: r.count })
  }

  if (!ids || ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'NO_IDS' }, { status: 400 })
  }

  // Scope by user.id so a caller can only mark their own notifications read.
  const r = await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: user.id, readAt: null },
    data: { readAt: now },
  })
  return NextResponse.json({ ok: true, updated: r.count })
}
