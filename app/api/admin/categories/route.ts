import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// GET /api/admin/categories
// Returns every category (live + hidden) with attached tutor counts so admin
// can toggle visibility + service-type default without a second round-trip.
export async function GET() {
  await requireRole('ADMIN')
  const rows = await prisma.category.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      defaultServiceType: true,
      isLive: true,
      _count: { select: { tutors: true } },
    },
  })
  const out = rows.map(r => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    defaultServiceType: r.defaultServiceType,
    isLive: r.isLive,
    tutorCount: r._count.tutors,
  }))
  return NextResponse.json(out)
}
