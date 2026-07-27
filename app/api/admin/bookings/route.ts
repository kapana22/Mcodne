import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { isBookingLive } from '@/lib/bookingLive'
import { stripTutorBlobs, stripAvatar } from '@/lib/stripTutorBlobs'

// „ცოცხალი" is DERIVED, never stored: no code path ever writes status='LIVE'
// (see lib/bookingLive.ts), so filtering the list on it returned an empty tab
// forever while the overview KPI counted real in-progress sessions. The LIVE
// filter therefore uses the same window + oracle as /api/admin/stats: pull
// CONFIRMED/LIVE rows that started within the max session length and keep the
// ones the clock says are still running.
const MAX_SESSION_MIN = 240

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
  // Derived-live tab (see MAX_SESSION_MIN above) — a time window, not a status.
  const liveFilter = status === 'LIVE'
  const nowMs = Date.now()
  if (liveFilter) {
    where.status = { in: ['CONFIRMED', 'LIVE'] }
    where.startAt = { gte: new Date(nowMs - MAX_SESSION_MIN * 60_000), lte: new Date(nowMs) }
  } else if (status && validStatuses.includes(status)) {
    where.status = status
  }
  if (q) {
    where.OR = [
      { topic: { contains: q, mode: 'insensitive' } },
      { ref: { contains: q, mode: 'insensitive' } },
      { student: { fullName: { contains: q, mode: 'insensitive' } } },
      { tutor: { user: { fullName: { contains: q, mode: 'insensitive' } } } },
    ]
  }
  if (from || to) {
    // Explicit date bounds narrow (and, on the live tab, override) the window above.
    where.startAt = { ...(where.startAt ?? {}) }
    if (from) where.startAt.gte = new Date(from + 'T00:00:00Z')
    if (to)   where.startAt.lte = new Date(to   + 'T23:59:59Z')
  }

  const bookings = await prisma.booking.findMany({
    where,
    // `startAt` is NOT unique — an id tiebreaker keeps the cursor deterministic,
    // otherwise rows sharing a timestamp get dropped/repeated at page borders.
    orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    // The live set is tiny and post-filtered in Node (the oracle needs
    // startAt+duration), so it is returned in one uncursored page.
    take: liveFilter ? 200 : limit + 1,
    ...(cursor && !liveFilter ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      student: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      // omit heavy blobs at the DB level (admin bookings list never renders the
      // intro video / professionData); stripTutorBlobs still guards avatars.
      tutor: {
        omit: { professionData: true, videoUrl: true },
        include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
      },
    },
  })

  const rows = liveFilter ? bookings.filter(isBookingLive) : bookings
  const hasMore = !liveFilter && rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return NextResponse.json({
    items: items.map(b => ({ ...b, tutor: stripTutorBlobs(b.tutor), student: stripAvatar(b.student) })),
    nextCursor,
  })
}
