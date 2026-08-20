// ტალღა 1 — the owner's launch taxonomy, applied to the live category table.
//
//   npx tsx scripts/launch-wave1-2026-08-20.ts
//
// ⚠️ ADDITIVE AND IDEMPOTENT, AND IT DELETES NOTHING. Two service categories
// are created, two are renamed to the owner's words. Every other sphere stays
// exactly as it is — twenty-six experts are filed under them (lib/launchTaxonomy
// says at length why a launch set is not a deletion). Safe to run twice.
import { PrismaClient } from '@prisma/client'
import { LAUNCH_CATEGORIES } from '../lib/launchTaxonomy'
import { PROFESSIONS } from '../lib/professions'
const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async tx => {
    for (const [i, c] of LAUNCH_CATEGORIES.entries()) {
      const row = await tx.category.findUnique({ where: { slug: c.slug }, select: { id: true, name: true } })
      if (!row) {
        await tx.category.create({
          data: {
            slug: c.slug, name: c.name, order: i,
            // HIDDEN like every other new sphere: a category reveals itself
            // when its first provider is approved (lib/categoryReveal), so an
            // empty one never shows a visitor an empty list.
            status: 'HIDDEN', isLive: false, count: 0,
            // ⚠️ THE ENUM HAS NO „SERVICE" VALUE and must not gain one here.
            // `ServiceType` is CONSULTATION | RECURRING — it says how a
            // BOOKING repeats, not which half of the catalogue a sphere is in.
            // The service half is decided by the topic vocabulary
            // (lib/requestTopics → groupIsService), never by this column.
            defaultServiceType: 'CONSULTATION',
          },
        })
        console.log(`✓ ${c.slug} created (HIDDEN) — ${c.name}`)
        continue
      }
      if (row.name !== c.name) {
        await tx.category.update({ where: { slug: c.slug }, data: { name: c.name } })
        console.log(`✓ ${c.slug}: „${row.name}" → „${c.name}"`)
      } else {
        console.log(`· ${c.slug} already reads „${c.name}"`)
      }
    }

    // ── guards ──────────────────────────────────────────────────────────────
    for (const c of LAUNCH_CATEGORIES) {
      const jobs = PROFESSIONS[c.slug] ?? []
      if (jobs.length < 1) throw new Error(`${c.slug} is a launch category with no professions`)
    }
    const all = await tx.category.findMany({ where: { status: { not: 'REDIRECTED' } }, select: { slug: true } })
    const bare = all.filter(c => (PROFESSIONS[c.slug ?? ''] ?? []).length === 0)
    if (bare.length) throw new Error(`offered categories with no professions: ${bare.map(c => c.slug).join(', ')}`)
    console.log(`✓ guard: ${all.length} offered spheres, ${LAUNCH_CATEGORIES.length} of them ტალღა 1, none empty`)
  })
}

main().then(() => console.log('\ndone')).catch(e => { console.error('FAILED — rolled back:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
