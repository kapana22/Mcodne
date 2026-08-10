import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { expertCountsBySphere } from '@/lib/categoryCounts'

export const dynamic = 'force-dynamic'

// GET /api/categories — PUBLIC. The spheres, in display order. Used by the
// apply flow's category picker and the discovery filters, so adding a category
// in the admin panel surfaces everywhere without a code change.
export async function GET() {
  try {
    // Every row is read, not just the visible ones: the fold needs the whole
    // tree to know which sphere a redirected category's experts belong to. Only
    // spheres are returned.
    const all = await prisma.category.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, status: true, parentId: true },
    })
    // `expertCount` = publicly visible experts under that sphere, its own plus
    // everything folded into it, using the SAME rule lib/tutorsQuery applies.
    // Callers decide what to do with it: the browse filter and the home tiles
    // show only POPULATED spheres (an empty filter option just produces an
    // empty result and reads as a dead end), while the /apply picker must keep
    // offering all of them — somebody has to be the first expert in a sphere.
    const counts = await expertCountsBySphere(all)
    const rows = all
      .filter(c => c.status === 'VISIBLE')
      .map(c => ({ id: c.id, slug: c.slug, name: c.name, expertCount: counts.get(c.id) ?? 0 }))
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
