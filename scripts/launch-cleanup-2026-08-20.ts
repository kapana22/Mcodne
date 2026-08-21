// S1 — the three corrections the launch set needs on the live table. 2026-08-20
//
//   npx tsx scripts/launch-cleanup-2026-08-20.ts
//
// Idempotent, additive-safe, and every destructive step is guarded on „nobody
// is filed here". Run AFTER scripts/launch-wave1-2026-08-20.ts.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const TEST_ACCOUNT = 'mcodne.ge@gmail.com'

async function main() {
  // ── 1. „დალაგება და გადაზიდვა" leaves the table ───────────────────────────
  // Created earlier today from the owner's own launch list, then refused by the
  // owner the same afternoon („saqofacxovrebo არ გვინდა"). It is a real row, so
  // it is DELETED rather than hidden: a HIDDEN sphere still appears in the
  // /join picker (lib/categoryTree → ASSIGNABLE_CATEGORY covers HIDDEN with no
  // parent), which would keep inviting people to register into the one bucket
  // that was turned down.
  // Guarded: only while empty. The FK is ON DELETE RESTRICT, so Postgres would
  // refuse anyway — this fails first and says why.
  const held = await prisma.tutorProfile.count({ where: { category: { slug: 'dalageba' } } })
  if (held > 0) throw new Error(`dalageba holds ${held} expert(s) — re-file them first`)
  const gone = await prisma.category.deleteMany({ where: { slug: 'dalageba' } })
  console.log(gone.count ? '✓ dalageba deleted' : '· dalageba was not there')

  // ── 2 + 3, ONE TRANSACTION ───────────────────────────────────────────────
  // They must not be able to half-apply: hiding the sphere while its profile
  // stays listed lets the next approval re-reveal it (lib/categoryReveal), and
  // the two statements would silently undo each other over a week.
  await prisma.$transaction(async tx => {
    // `health` back to HIDDEN. It was opened HIDDEN on 2026-08-11 and turned
    // VISIBLE by the auto-reveal — correctly, by its own rule, because an expert
    // was approved into it. That expert is the SITE'S OWN account, whose card
    // carries the registration form's hint text as its bio. Zero real experts.
    // HIDDEN is not deletion: the row, its URL and its assignability survive,
    // and the first genuine dietician re-publishes it automatically.
    const h = await tx.category.updateMany({ where: { slug: 'health' }, data: { status: 'HIDDEN', isLive: false } })
    console.log(`✓ health → HIDDEN (${h.count})`)

    // The test profile leaves the browse list. `available: false` is the
    // SELF-PAUSE flag — not a suspension, not a delete: /experts/<slug> still
    // resolves so any shared link or booking keeps working, the account keeps
    // its role, and one UPDATE puts it back.
    const t = await tx.tutorProfile.updateMany({
      where: { user: { is: { email: { equals: TEST_ACCOUNT, mode: 'insensitive' } } } },
      data: { available: false },
    })
    console.log(`✓ test expert profile unlisted (${t.count})`)
  })

  // ── guard: no VISIBLE sphere left showing an empty room ──────────────────
  // Two queries, never one per sphere: counting inside a loop over sixteen
  // categories blew Prisma's 5s interactive-transaction budget on the first
  // attempt and rolled the whole thing back on the GUARD rather than on
  // anything being wrong. The set is small — fetch it once, count in memory.
  const visible = await prisma.category.findMany({
    where: { status: 'VISIBLE', parentId: null },
    select: { slug: true, id: true, children: { select: { id: true } } },
  })
  const listed = await prisma.tutorProfile.findMany({
    where: { available: true, user: { is: { suspendedAt: null } } },
    select: { categoryId: true },
  })
  const held2 = new Set(listed.map(t => t.categoryId).filter(Boolean) as string[])
  const empties = visible
    .filter(c => ![c.id, ...c.children.map(x => x.id)].some(id => held2.has(id)))
    .map(c => c.slug)
  if (empties.length) throw new Error(`VISIBLE spheres with no listed expert: ${empties.join(', ')}`)
  console.log(`✓ guard: ${visible.length} VISIBLE spheres, all staffed`)
}

main().then(() => console.log('\ndone')).catch(e => { console.error('FAILED:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
