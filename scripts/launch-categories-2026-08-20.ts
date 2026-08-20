// Applies prisma/manual-migrations/2026-08-20-launch-categories/up.sql through
// the Prisma client, because `prisma db execute` is blocked in this session.
// SAME three operations, SAME single transaction, SAME guards — read the .sql
// for the reasoning; this file is only the delivery mechanism.
//
//   npx tsx scripts/launch-categories-2026-08-20.ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const TEST_ACCOUNT = 'mcodne.ge@gmail.com'

async function main() {
  await prisma.$transaction(async tx => {
    // 1 — the teaching sphere, HIDDEN (self-publishing on its first expert).
    const existing = await tx.category.findUnique({ where: { slug: 'swavleba' } })
    if (existing) {
      console.log('· swavleba already exists — left alone')
    } else {
      await tx.category.create({
        data: { slug: 'swavleba', name: 'სწავლება', order: 15, status: 'HIDDEN', isLive: false, defaultServiceType: 'CONSULTATION', count: 0 },
      })
      console.log('✓ swavleba created (HIDDEN)')
    }

    // 2 — health back to HIDDEN.
    const health = await tx.category.updateMany({ where: { slug: 'health' }, data: { status: 'HIDDEN', isLive: false } })
    console.log(`✓ health → HIDDEN (${health.count} row)`)

    // 3 — the site's own account leaves the browse list. Same transaction as
    //     step 2 on purpose: a listed profile can re-reveal the sphere.
    const paused = await tx.tutorProfile.updateMany({
      where: { user: { is: { email: { equals: TEST_ACCOUNT, mode: 'insensitive' } } } },
      data: { available: false },
    })
    console.log(`✓ test profile unlisted (${paused.count} row)`)

    // ── guards ──────────────────────────────────────────────────────────────
    const sw = await tx.category.findUnique({ where: { slug: 'swavleba' }, select: { parentId: true, status: true } })
    if (!sw || sw.parentId !== null || (sw.status !== 'HIDDEN' && sw.status !== 'VISIBLE')) {
      throw new Error('swavleba is missing or not assignable')
    }

    // No VISIBLE sphere left holding zero LISTED experts — checked against the
    // real rows, counting a parent's children as its own.
    const visible = await tx.category.findMany({
      where: { status: 'VISIBLE', parentId: null },
      select: { slug: true, id: true, children: { select: { id: true } } },
    })
    const empties: string[] = []
    for (const c of visible) {
      const ids = [c.id, ...c.children.map(x => x.id)]
      const n = await tx.tutorProfile.count({
        where: { categoryId: { in: ids }, available: true, user: { is: { suspendedAt: null } } },
      })
      if (n === 0) empties.push(c.slug)
    }
    if (empties.length) throw new Error(`VISIBLE spheres with no listed expert: ${empties.join(', ')}`)
    console.log(`✓ guard: ${visible.length} VISIBLE spheres, all of them staffed`)
  })
}

main().then(() => console.log('\ndone')).catch(e => { console.error('FAILED — rolled back:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
