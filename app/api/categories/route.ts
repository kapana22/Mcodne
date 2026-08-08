import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/categories — PUBLIC. Live categories only, in display order. Used by
// the apply flow's category picker and the discovery filters, so adding a
// category in the admin panel surfaces everywhere without a code change.
export async function GET() {
  try {
    // `expertCount` = publicly visible experts in that category, using the SAME
    // rule lib/tutorsQuery applies. Callers decide what to do with it: the
    // browse filter and the home tiles show only POPULATED categories (an empty
    // filter option just produces an empty result and reads as a dead end),
    // while the /apply picker must keep offering ALL of them — somebody has to
    // be the first expert in a category.
    const rows = await prisma.category.findMany({
      where: { isLive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: {
        id: true, slug: true, name: true,
        // Mirrors lib/tutorsQuery's visibility rule EXACTLY — including the
        // no-service exclusion. A count computed with a looser rule promises a
        // category has N experts and then shows fewer.
        _count: { select: { tutors: { where: { available: true, user: { is: { suspendedAt: null } }, consultations: { some: {} } } } } },
      },
    })
    return NextResponse.json(rows.map(({ _count, ...c }) => ({ ...c, expertCount: _count.tutors })))
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
