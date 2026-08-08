import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { stripTutorBlobs, stripAvatar } from '@/lib/stripTutorBlobs'
import { parseLimit } from '@/lib/apiParams'

// List disputes with optional status filter. Includes booking + student +
// tutor names so the admin table doesn't need N+1 lookups.
export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const { searchParams } = new URL(req.url)
  const outcome = searchParams.get('outcome')
  const validOutcomes = ['PENDING', 'REFUND_FULL', 'REFUND_PARTIAL', 'REDO_FREE', 'DISMISSED']
  const limit = parseLimit(searchParams.get('limit'), { fallback: 50, max: 200 })
  const cursor = searchParams.get('cursor')?.trim() || undefined
  const where: any = {}
  if (outcome && validOutcomes.includes(outcome)) where.outcome = outcome

  // Cursor pagination (mirror of the users route) — replaces the old hard
  // `take: 200` cliff, past which disputes silently vanished from the panel.
  const rows = await prisma.dispute.findMany({
    where,
    // `createdAt` is NOT unique — an id tiebreaker keeps the cursor
    // deterministic across rows sharing a timestamp.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      booking: {
        select: {
          id: true, ref: true, topic: true, startAt: true, price: true, status: true,
          student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          tutor: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
        },
      },
    },
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return NextResponse.json({
    items: page.map(d => ({
      ...d,
      booking: d.booking
        ? { ...d.booking, tutor: stripTutorBlobs(d.booking.tutor), student: stripAvatar(d.booking.student) }
        : d.booking,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  })
}
