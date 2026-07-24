import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/categories — PUBLIC. Live categories only, in display order. Used by
// the apply flow's category picker and the discovery filters, so adding a
// category in the admin panel surfaces everywhere without a code change.
export async function GET() {
  try {
    const rows = await prisma.category.findMany({
      where: { isLive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true },
    })
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
