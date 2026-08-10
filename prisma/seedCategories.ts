// Categories-only seed — safe to run against production.
//
//   npx tsx prisma/seedCategories.ts
//
// Idempotent: upserts the canonical business/professional spheres by slug
// (existing slugs keep their id + tutor assignments, only name/order refresh),
// adds the new ones, and merges the legacy duplicate `biznesi` → `business`.
// It NEVER touches tutors/users beyond re-pointing biznesi's tutors, and it does
// NOT delete `psychology` (real experts may sit there) — it just isn't featured.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Canonical spheres. `order` drives display order in the filter + apply picker.
// Names are the single source of truth — the filter (app/tutors/client.tsx) and
// the apply profession-groups match by these exact NAMES, so keep them in sync.
const CATEGORIES: { slug: string; name: string; order: number }[] = [
  { slug: 'business',    name: 'ბიზნესი',        order: 1 },
  { slug: 'tax',         name: 'გადასახადები',    order: 2 },
  { slug: 'finance',     name: 'ფინანსები',       order: 3 },
  { slug: 'law',         name: 'სამართალი',       order: 4 },
  { slug: 'marketing',   name: 'მარკეტინგი',      order: 5 },
  { slug: 'sales',       name: 'გაყიდვები',       order: 6 },
  { slug: 'it',          name: 'IT და პროგრამირება', order: 7 },
  { slug: 'product',     name: 'პროდუქტი',        order: 8 },
  { slug: 'design',      name: 'დიზაინი',         order: 9 },
  { slug: 'career',      name: 'კარიერა',         order: 10 },
  { slug: 'hr',          name: 'კადრები',         order: 11 },
  { slug: 'real-estate', name: 'უძრავი ქონება',   order: 12 },
  { slug: 'relocation',  name: 'რელოკაცია',       order: 13 },
  { slug: 'crypto',      name: 'კრიპტო',          order: 14 },
]

async function main() {
  // 1) Upsert the canonical set. CREATE carries the full row; UPDATE touches
  //    ONLY `order`.
  //
  //    Since 2026-08-10 the name and the status of a category are DATA the
  //    admin owns — renames („ბიზნესი" → „ბიზნესი და ფინანსები"), hiding, and
  //    the parent hierarchy are all set from the panel and by the migration.
  //    An update that rewrote `name` and forced `isLive: true` would undo every
  //    one of them the next time anybody ran this file, silently, on
  //    production. The seed exists to make a FRESH database usable, not to hold
  //    an opinion about a live one.
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name, order: c.order, defaultServiceType: 'CONSULTATION', isLive: true, status: 'VISIBLE' },
      update: { order: c.order },
    })
  }

  // 2) Merge the legacy duplicate `biznesi` (dupes „ბიზნესი") into `business`.
  const legacy = await prisma.category.findUnique({ where: { slug: 'biznesi' } })
  if (legacy) {
    const business = await prisma.category.findUnique({ where: { slug: 'business' } })
    if (business) {
      const moved = await prisma.tutorProfile.updateMany({
        where: { categoryId: legacy.id },
        data: { categoryId: business.id },
      })
      await prisma.category.delete({ where: { id: legacy.id } })
      console.log(`merged biznesi → business (${moved.count} tutors re-pointed), deleted duplicate`)
    }
  }

  const live = await prisma.category.findMany({ where: { status: 'VISIBLE' }, orderBy: { order: 'asc' }, select: { slug: true, name: true, order: true } })
  console.log(`\n${live.length} visible categories:`)
  for (const c of live) console.log(`  ${c.order} ${c.slug} — ${c.name}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
