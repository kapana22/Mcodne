import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { expertCountsBySphere } from '@/lib/categoryCounts'
import { ABROAD_CATEGORY_SLUG } from '@/lib/abroad'

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
    // `children` = the sub-fields absorbed into this sphere. They are offered
    // where somebody DESCRIBES THEMSELVES (the application, the profile editor,
    // the approval screen) and ignored where somebody BROWSES — a client
    // choosing „ბიზნესი და ფინანსები" should not have to know the platform once
    // had a separate „ფინანსები", but an expert who IS a financier should not be
    // made to call themselves something else. The two audiences want opposite
    // things from the same taxonomy, so the payload carries both and each
    // caller takes the half it needs.
    // HIDDEN spheres are RETURNED, flagged `browsable: false`.
    //
    // They must be, or the catalogue deadlocks: „კარიერა" is hidden precisely
    // because it has no expert yet, and if the application cannot offer it,
    // nobody can ever be its first — it stays empty forever for the reason it
    // was hidden. Somebody has to be able to go first.
    //
    // So the flag decides, not the query: BROWSE consumers (the /tutors filter,
    // the home tiles) drop anything not browsable, while the screens where an
    // expert DESCRIBES THEMSELVES offer the whole list. Only the /abroad marker
    // is withheld outright — it is not a sphere anybody should be filed under
    // (lib/abroad.ts), and assigning an expert to it removes them from the site.
    const rows = all
      .filter(c => (c.status === 'VISIBLE' || c.status === 'HIDDEN') && c.slug !== ABROAD_CATEGORY_SLUG)
      .map(c => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        browsable: c.status === 'VISIBLE',
        expertCount: counts.get(c.id) ?? 0,
        children: all
          .filter(k => k.status === 'REDIRECTED' && k.parentId === c.id)
          .map(k => ({ id: k.id, slug: k.slug, name: k.name })),
      }))
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
