import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET(req: Request) {
  await requireRole('ADMIN')
  // Optional `?status=` filter. The moderation queue only ever shows SUBMITTED
  // rows and used to filter them client-side out of a `take: 300` page — once
  // 300+ applications existed the newest 300 could be all decided ones and the
  // queue read EMPTY while the KPI (a server-side count) still showed a backlog.
  const { searchParams } = new URL(req.url)
  const rawStatus = searchParams.get('status')
  const VALID = ['SUBMITTED', 'APPROVED', 'REJECTED', 'NEEDS_REVISION'] as const
  const status = VALID.includes(rawStatus as any) ? (rawStatus as (typeof VALID)[number]) : null
  // The list must NOT carry the verification-document blobs (idDoc / selfie /
  // certificate scans are base64 `data:` images) — they're only shown on the
  // selected application's detail panel, so the admin page lazy-loads them per
  // id from `[id]/route.ts`. Returning them for EVERY row made the whole panel
  // download several MB per resized doc × N applications.
  const apps = await prisma.tutorApplication.findMany({
    ...(status ? { where: { status } } : {}),
    orderBy: { createdAt: 'desc' },
    // Also omit professionData (unbounded apply-flow JSON) — the detail panel
    // lazy-loads the full record per id. Cap the list so it can't grow unbounded
    // as applications accumulate.
    take: 300,
    omit: { idDocUrl: true, selfieUrl: true, certificates: true, professionData: true },
    include: { user: { select: { email: true, avatarUrl: true } } },
  })
  return NextResponse.json(apps)
}
