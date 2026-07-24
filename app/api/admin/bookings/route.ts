import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { stripTutorBlobs, stripAvatar } from '@/lib/stripTutorBlobs'

// Admin-wide booking list with filters: status, date-range, tutor, student, q(topic).
// Cursor pagination via `?cursor=<lastId>&limit=<n>`.
export async function GET(req: Request) {
  await requireRole('ADMIN')

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const q = searchParams.get('q')?.trim()
  const from = searchParams.get('from') // YYYY-MM-DD
  const to = searchParams.get('to')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const cursor = searchParams.get('cursor')

  const where: any = {}
  const validStatuses = ['PREPARING', 'CONFIRMED', 'LIVE', 'COMPLETED', 'CANCELED', 'NO_SHOW']
  if (status && validStatuses.includes(status)) where.status = status
  if (q) {
    where.OR = [
      { topic: { contains: q, mode: 'insensitive' } },
      { ref: { contains: q, mode: 'insensitive' } },
      { student: { fullName: { contains: q, mode: 'insensitive' } } },
      { tutor: { user: { fullName: { contains: q, mode: 'insensitive' } } } },
    ]
  }
  if (from || to) {
    where.startAt = {}
    if (from) where.startAt.gte = new Date(from + 'T00:00:00Z')
    if (to)   where.startAt.lte = new Date(to   + 'T23:59:59Z')
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { startAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      tutor: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
    },
  })

  const hasMore = bookings.length > limit
  const items = hasMore ? bookings.slice(0, limit) : bookings
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return NextResponse.json({
    items: items.map(b => ({ ...b, tutor: stripTutorBlobs(b.tutor), student: stripAvatar(b.student) })),
    nextCursor,
  })
}
