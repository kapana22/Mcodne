// docs/TAXONOMY-AUDIT items 3, 4 and 5 — the ones the audit put in „ერთ დღეში"
// and that never reached the registration screen. Owner, looking at /join:
// „ათასჯერ ვთქვი ამის გამოსწორება და ისევ იგივეა."
//
//   npx tsx scripts/taxonomy-fix-2026-08-20.ts
//
// ⚠️ ADDITIVE AND IDEMPOTENT. Three categories are created if absent, three are
// renamed. No row is deleted and no expert is reassigned: an expert who already
// picked „მეწარმე" keeps it (§P6 — the name only stops being OFFERED), and a
// profile filed under `business` stays there. Safe to run twice.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

/** §P4 — a topic group that is not a category is a request nobody can answer. */
const CREATE = [
  { slug: 'design',   name: 'დიზაინი',        order: 16 },
  { slug: 'career',   name: 'კარიერა და HR',  order: 17 },
  // Created HIDDEN like the rest: a sphere reveals itself when its first
  // expert is approved (lib/categoryReveal), so an empty one never shows an
  // empty list to a visitor.
  { slug: 'swavleba', name: 'სწავლება',        order: 18 },
] as const

/** §P3 — the admin's name and the code's name for the SAME subject. */
const RENAME = [
  { slug: 'tourism',    to: 'ტურიზმი და ღონისძიებები' },
  { slug: 'grants',     to: 'გრანტები და ტენდერები' },
  { slug: 'relocation', to: 'ვიზა, მიგრაცია და რელოკაცია' },
] as const

async function main() {
  await prisma.$transaction(async tx => {
    for (const c of CREATE) {
      const has = await tx.category.findUnique({ where: { slug: c.slug }, select: { id: true } })
      if (has) { console.log(`· ${c.slug} already exists — left alone`); continue }
      await tx.category.create({
        data: { ...c, status: 'HIDDEN', isLive: false, defaultServiceType: 'CONSULTATION', count: 0 },
      })
      console.log(`✓ ${c.slug} created (HIDDEN) — ${c.name}`)
    }
    for (const r of RENAME) {
      const row = await tx.category.findUnique({ where: { slug: r.slug }, select: { name: true } })
      if (!row) { console.log(`· ${r.slug} is not in this database`); continue }
      if (row.name === r.to) { console.log(`· ${r.slug} already reads „${r.to}"`); continue }
      await tx.category.update({ where: { slug: r.slug }, data: { name: r.to } })
      console.log(`✓ ${r.slug}: „${row.name}" → „${r.to}"`)
    }

    // ── guard: every sphere the picker offers has professions to offer ───────
    const all = await tx.category.findMany({
      where: { status: { not: 'REDIRECTED' } },
      select: { slug: true, name: true },
    })
    const { PROFESSIONS } = await import('../lib/professions')
    const bare = all.filter(c => (PROFESSIONS[c.slug ?? ''] ?? []).length === 0)
    if (bare.length) throw new Error(`categories with no professions: ${bare.map(c => c.slug).join(', ')}`)
    console.log(`✓ guard: ${all.length} offered spheres, every one of them staffed with professions`)
  })
}

main().then(() => console.log('\ndone')).catch(e => { console.error('FAILED — rolled back:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
