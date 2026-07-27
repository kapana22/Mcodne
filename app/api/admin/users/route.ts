import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET(req: Request) {
  await requireRole('ADMIN')

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const rawRole = searchParams.get('role')
  const role = rawRole === 'STUDENT' || rawRole === 'TUTOR' || rawRole === 'ADMIN' ? rawRole : null
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const cursor = searchParams.get('cursor')?.trim() || undefined

  const where: any = {}
  if (role) where.role = role
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
    ]
  }

  // Cursor pagination (mirror of the bookings route): fetch one extra row to
  // detect "has more", then hand back the last id as the next cursor.
  const rows = await prisma.user.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    // `createdAt` is NOT unique — an id tiebreaker keeps the cursor deterministic,
    // otherwise accounts sharing a timestamp get dropped/repeated at page borders.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, email: true, fullName: true, role: true, emailVerified: true,
      createdAt: true, avatarUrl: true,
      _count: { select: { bookingsAsStudent: true, sentMessages: true } },
    },
  })

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  return NextResponse.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null })
}
