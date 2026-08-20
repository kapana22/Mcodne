import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ROLE } from '@/lib/roles'

const Segment = z.enum(['all', 'students', 'tutors', 'recent'])
const Body = z.object({ segment: Segment })

function whereForSegment(segment: z.infer<typeof Segment>) {
  switch (segment) {
    case 'all': return {}
    case 'students': return { role: ROLE.CLIENT }
    case 'tutors': return { role: ROLE.EXPERT }
    case 'recent': {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
      return { createdAt: { gte: since } }
    }
  }
}

// POST /api/admin/broadcast/preview → { count }
// Returns how many users would receive the broadcast for the chosen segment.
// Zero write side-effects — just a Prisma count.
export async function POST(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const count = await prisma.user.count({ where: whereForSegment(parsed.data.segment) })
  return NextResponse.json({ ok: true, count })
}
