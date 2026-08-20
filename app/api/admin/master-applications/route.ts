// THE MASTER QUEUE, LIGHT — names and trades, never the photos.
//
// ⚠️ THE `omit` IS THE WHOLE POINT OF THIS ROUTE EXISTING SEPARATELY. Every
// application row carries a face photo and up to six work photos as base64
// columns (there is no object storage — /api/uploads returns data URIs). At
// ~200KB each that is over a megabyte per applicant, so a list of twenty that
// selected `*` would ship twenty-odd megabytes to draw twenty names, and it
// would do it every time the tab is opened. The photos load per opened row from
// /api/master-applications/[id]. The tutor queue learned this first.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requireRoleApi } from '@/lib/auth'
import { providersOn } from '@/lib/requests'
import { serviceLabels, areaLabels } from '@/lib/serviceProfile'

export const dynamic = 'force-dynamic'

const STATUSES = ['SUBMITTED', 'NEEDS_REVISION', 'APPROVED', 'REJECTED'] as const

export async function GET(req: Request) {
  if (!providersOn()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  await ensureDbReady()
  const url = new URL(req.url)
  const raw = url.searchParams.get('status')
  const status = STATUSES.includes(raw as never) ? (raw as (typeof STATUSES)[number]) : 'SUBMITTED'

  const rows = await prisma.masterApplication.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: 60,
    omit: { photoUrl: true, workPhotos: true, about: true },
    include: { user: { select: { email: true } } },
  })

  // Counts for the tab strip, so „SUBMITTED (0)" is a fact and not an empty
  // screen the reviewer has to interpret.
  const grouped = await prisma.masterApplication.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  const counts = Object.fromEntries(STATUSES.map(s => [
    s, grouped.find(g => g.status === s)?._count._all ?? 0,
  ]))

  return NextResponse.json({
    ok: true,
    counts,
    rows: rows.map(r => ({
      id: r.id,
      kind: r.kind,
      fullName: r.fullName,
      companyName: r.companyName,
      phone: r.phone,
      email: r.user.email,
      // Labels, not ids — a reviewer should not be translating 'plumb-leak'.
      services: serviceLabels(r.services),
      areas: areaLabels(r.areas),
      yearsExp: r.yearsExp,
      status: r.status,
      createdAt: r.createdAt,
    })),
  })
}
