import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { avatarSrc } from '@/lib/avatarSrc'
import { parseLimit } from '@/lib/apiParams'

export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  // Optional `?status=` filter. The moderation queue only ever shows SUBMITTED
  // rows and used to filter them client-side out of a `take: 300` page — once
  // 300+ applications existed the newest 300 could be all decided ones and the
  // queue read EMPTY while the KPI (a server-side count) still showed a backlog.
  const { searchParams } = new URL(req.url)
  const rawStatus = searchParams.get('status')
  const VALID = ['SUBMITTED', 'APPROVED', 'REJECTED', 'NEEDS_REVISION'] as const
  const status = VALID.includes(rawStatus as any) ? (rawStatus as (typeof VALID)[number]) : null
  const limit = parseLimit(searchParams.get('limit'), { fallback: 50, max: 200 })
  const cursor = searchParams.get('cursor')?.trim() || undefined
  // Search, mirroring the users tab (`?q=`). Server-side on purpose: the queue
  // is cursor-paginated, so a browser-side filter would only ever search the
  // page that happens to be loaded and would quietly report „nothing found"
  // for an applicant sitting on page two.
  const q = searchParams.get('q')?.trim()
  const search = q
    ? {
      OR: [
        { fullName: { contains: q, mode: 'insensitive' as const } },
        { specialty: { contains: q, mode: 'insensitive' as const } },
        { city: { contains: q, mode: 'insensitive' as const } },
        { user: { is: { email: { contains: q, mode: 'insensitive' as const } } } },
      ],
    }
    : null
  // The list must NOT carry the verification-document blobs (idDoc / selfie /
  // certificate scans are base64 `data:` images) — they're only shown on the
  // selected application's detail panel, so the admin page lazy-loads them per
  // id from `[id]/route.ts`. Returning them for EVERY row made the whole panel
  // download several MB per resized doc × N applications.
  //
  // Cursor pagination (mirror of the users route): fetch one extra row to
  // detect "has more", then hand back the last id as the next cursor. This
  // replaces the old hard `take: 300` cliff, past which rows silently vanished.
  const where = { ...(status ? { status } : {}), ...(search ?? {}) }
  const rows = await prisma.tutorApplication.findMany({
    ...(Object.keys(where).length ? { where } : {}),
    // `createdAt` is NOT unique — an id tiebreaker keeps the cursor
    // deterministic across rows sharing a timestamp.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    // Also omit professionData (unbounded apply-flow JSON) — the detail panel
    // lazy-loads the full record per id.
    omit: { idDocUrl: true, selfieUrl: true, certificates: true, professionData: true },
    // avatarUrl IS selected — but never returned raw. It is a base64 `data:`
    // webp (9–16 KB each), which is why this used to omit it entirely and the
    // queue showed initials. `avatarSrc` swaps it for `/api/avatars/<id>?v=`
    // (~40 chars, browser-cached), so every row can show the real face at the
    // cost of a URL. Never pass `u.avatarUrl` through — see lib/avatarSrc.
    include: { user: { select: { email: true, avatarUrl: true } } },
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const items = page.map(r => {
    const u = (r as any).user as { email: string; avatarUrl: string | null } | null
    return { ...r, user: { email: u?.email ?? null, avatarUrl: avatarSrc(r.userId, u?.avatarUrl) } }
  })
  // Per-status counts for the moderation tabs. One grouped count is cheaper
  // than four HEAD requests and keeps the tab labels honest even when the
  // current page is filtered to a single status.
  const grouped = await prisma.tutorApplication.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => [])
  const counts = Object.fromEntries(grouped.map(g => [g.status, g._count._all]))
  return NextResponse.json({ items, counts, nextCursor: hasMore ? items[items.length - 1].id : null })
}
