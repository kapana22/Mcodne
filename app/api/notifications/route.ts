import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

// GET /api/notifications?limit=20&onlyUnread=1
// Returns the caller's most-recent notifications + an unread count.
// The bell UI polls this on mount; the dropdown renders `items`, the badge
// renders `unreadCount`.

export async function GET(req: Request) {
  // API routes must 401, never requireUser() — its redirect() sends a 307 that
  // fetch silently follows to the /signin HTML, so client res.json() throws.
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '30', 10)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 30
  const onlyUnread = url.searchParams.get('onlyUnread') === '1'
    || url.searchParams.get('onlyUnread') === 'true'

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(onlyUnread ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ])

  return NextResponse.json({ items, unreadCount })
}
