/**
 * Two production data fixes, neither of which needs a deploy.
 *
 *   npx tsx -r dotenv/config scripts/fix-ga-and-categories.ts          (dry run)
 *   npx tsx -r dotenv/config scripts/fix-ga-and-categories.ts --apply
 *
 * ⚠️ WRITES TO PRODUCTION. There is no sandbox database.
 *
 * ── 1. GOOGLE ANALYTICS WAS COUNTING EVERYTHING TWICE ──────────────────────
 * `integration.gaId` holds G-4WFNGD5WNX and <Analytics> loads gtag from it.
 * `integration.headerHtml` ALSO held a full gtag snippet for the same property,
 * injected by <CodeInjector> — so every page loaded the library twice and fired
 * two `config` calls, i.e. two pageviews per visit.
 *
 * That is worse than having no analytics: sessions, users and the whole booking
 * funnel were inflated by roughly 2×, and every number anyone reasoned from —
 * including the „68 booking-window opens → 1 booking" in the development plan —
 * came out of this. Deleting the row leaves the ONE supported path (`gaId`)
 * doing the job it was built for.
 *
 * The row is deleted, not blanked: an empty string in the header-injection slot
 * is indistinguishable from „someone cleared it on purpose", and the CMS
 * treats a missing row as „use the default" (which is nothing).
 *
 * ── 2. SEVEN LIVE CATEGORIES WITH NOBODY IN THEM ───────────────────────────
 * Each one is a tile a visitor can tap that leads to an empty page. On a
 * catalog this small that is the most expensive kind of dead end: it happens
 * at the exact moment someone has decided what they want.
 *
 * HIDDEN is the existing, reversible mechanism — the category keeps
 * its row, its slug and any future experts; it simply stops being offered.
 * Flip it back in ადმინი → კატეგორიები the day someone is in it.
 *
 * ⚠️ „კარიერა" is among them, and it is the development plan's own next push
 * (5–8 real HRs and senior developers). Hiding it now is not a decision about
 * the plan — an empty tile helps nobody — but it MUST be turned back on the
 * moment the first career expert is approved, or the plan's own landing
 * category stays invisible.
 *
 * The script refuses to hide a category that has any experts in it.
 */
import { prisma } from '../lib/prisma'

const APPLY = process.argv.includes('--apply')

/** Slugs to hide. Explicit, so a category that gains an expert tomorrow cannot
 *  be swept up by a rule that ran a week later. */
const HIDE = ['product', 'design', 'real-estate', 'relocation', 'crypto', 'career', 'hr']

async function main() {
  console.log(APPLY ? '⚠️  APPLY\n' : '👀 DRY RUN — არაფერი იცვლება (--apply გასაშვებად)\n')

  /* ── 1. the duplicate GA snippet ── */
  console.log('── Google Analytics ──')
  const header = await prisma.siteText.findUnique({ where: { key: 'integration.headerHtml' } })
  const gaId = await prisma.siteText.findUnique({ where: { key: 'integration.gaId' } })
  if (!header) {
    console.log('   უკვე წაშლილია')
  } else {
    const idsInHeader = header.value.match(/G-[A-Z0-9]{6,}/g) ?? []
    const other = header.value.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').trim()
    // Only delete when the row is NOTHING BUT the gtag snippet. If someone has
    // since added a Meta pixel or a verification tag in there, deleting it
    // would take that with it — refuse and let a human split them.
    if (other.length > 0) {
      throw new Error(`ABORT — integration.headerHtml has content besides the gtag snippet:\n${other.slice(0, 300)}`)
    }
    console.log(`   gaId:      ${gaId?.value ?? '(none)'}`)
    console.log(`   headerHtml: ${idsInHeader.length} gtag ID — ${idsInHeader.join(', ')}  → წასაშლელი`)
    if (APPLY) {
      await prisma.siteText.delete({ where: { key: 'integration.headerHtml' } })
      console.log('   🗑  წაიშალა — GA ერთხელ ითვლის')
    }
  }

  /* ── 2. empty categories ── */
  console.log('\n── ცარიელი კატეგორიები ──')
  const cats = await prisma.category.findMany({
    where: { slug: { in: HIDE } },
    select: { id: true, slug: true, name: true, status: true, _count: { select: { tutors: true } } },
    orderBy: { order: 'asc' },
  })
  for (const c of cats) {
    if (c._count.tutors > 0) {
      throw new Error(`ABORT — „${c.name}" now has ${c._count.tutors} expert(s). Remove it from HIDE.`)
    }
    console.log(`   ${c.status === 'VISIBLE' ? (APPLY ? '🙈' : '·') : '—'}  ${c.slug.padEnd(12)} ${c.name}${c.status === 'VISIBLE' ? '' : '  (უკვე დამალული)'}`)
  }
  const toHide = cats.filter(c => c.status === 'VISIBLE')
  if (APPLY && toHide.length) {
    await prisma.category.updateMany({ where: { id: { in: toHide.map(c => c.id) } }, data: { isLive: false, status: 'HIDDEN' } })
    console.log(`   ✅ დაიმალა ${toHide.length}`)
  }

  /* ── after ── */
  const live = await prisma.category.findMany({
    where: { status: 'VISIBLE' },
    select: { name: true, _count: { select: { tutors: true } } },
    orderBy: { order: 'asc' },
  })
  console.log(`\nცოცხალი კატეგორია: ${live.length}`)
  for (const c of live) console.log(`   ${String(c._count.tutors).padStart(2)} ექსპერტი — ${c.name}`)
  const stillEmpty = live.filter(c => c._count.tutors === 0)
  console.log(stillEmpty.length ? `⚠️ ისევ ცარიელი: ${stillEmpty.map(c => c.name).join(', ')}` : '✅ ცოცხალ კატეგორიაში ცარიელი აღარაა')
}

main()
  .catch(e => { console.error('\n❌', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
