import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { parseLimit } from '@/lib/apiParams'
import { avatarSrc } from '@/lib/avatarSrc'

export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const rawRole = searchParams.get('role')
  const role = rawRole === 'USER' || rawRole === 'PROVIDER' || rawRole === 'ADMIN' ? rawRole : null
  const limit = parseLimit(searchParams.get('limit'), { fallback: 50, max: 200 })
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
  const page = hasMore ? rows.slice(0, limit) : rows
  // `avatarUrl` is a base64 `data:` webp (~32 KB encoded), so shipping it raw
  // cost ~1.6 MB on a default page and ~6.4 MB at limit=200 — uncacheable, and
  // re-sent in full on every filter keystroke. `avatarSrc` swaps each one for
  // `/api/avatars/<id>?v=` (~40 chars, cached by the browser once per user).
  // The applications route next door has done this since 2026-08-01; this one
  // was simply missed. Never pass `u.avatarUrl` through — see lib/avatarSrc.
  const items = page.map(u => ({ ...u, avatarUrl: avatarSrc(u.id, u.avatarUrl) }))
  return NextResponse.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null })
}
