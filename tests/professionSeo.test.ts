// Invariants for the profession landing pages (lib/professionSeo.ts).
//
// Run: npx tsx tests/professionSeo.test.ts
//
// This data drives 15 indexable URLs (/experts/<slug> since stage 8, 2026-08-19;
// was /konsultacia/<slug>), and every way it breaks is silent:
// a categorySlug that doesn't exist renders a page listing nobody, a duplicate
// slug shadows a whole page, and a missing labelWith/labelPlural produces
// Georgian non-words in an H1 („ბუღალტერითან") because the language declines by
// stem change rather than suffixing. None of that fails a build.
import { professions, professionBySlug, professionsForCategory } from '../lib/professionSeo'
import { categorySeo } from '../lib/categorySeo'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// The live category slugs, as seeded by prisma/seedCategories.ts. `biznesi` is
// the legacy duplicate that seed merges into `business` — deliberately absent.
const LIVE_CATEGORIES = [
  'business', 'tax', 'finance', 'law', 'marketing', 'sales', 'it', 'product',
  'design', 'career', 'hr', 'real-estate', 'relocation', 'crypto', 'psychology',
]

/* ═══════════ 1. structural integrity ═════════════════════════════════════ */

{
  const slugs = professions.map(p => p.slug)
  check('slugs are unique', new Set(slugs).size === slugs.length,
    slugs.filter((s, i) => slugs.indexOf(s) !== i).join(', '))
  check('slugs are URL-safe (lowercase latin + dashes)',
    slugs.every(s => /^[a-z0-9-]+$/.test(s)), slugs.filter(s => !/^[a-z0-9-]+$/.test(s)).join(', '))
  check('professionBySlug indexes every entry',
    Object.keys(professionBySlug).length === professions.length)

  const badCat = professions.filter(p => !LIVE_CATEGORIES.includes(p.categorySlug))
  check('every categorySlug is a LIVE category', badCat.length === 0,
    badCat.map(p => `${p.slug}→${p.categorySlug}`).join(', '))

  const noSeo = professions.filter(p => !categorySeo[p.categorySlug])
  check('every target category has its own SEO copy (never the fallback)',
    noSeo.length === 0, noSeo.map(p => p.categorySlug).join(', '))
}

/* ═══════════ 2. Georgian declension — the silent-nonsense guard ══════════ */

{
  for (const p of professions) {
    const ok = !!p.labelWith && !!p.labelPlural && !!p.label
    if (!ok) { check(`${p.slug}: has label / labelWith / labelPlural`, false); continue }
  }
  check('every entry carries all three inflected forms',
    professions.every(p => p.label && p.labelWith && p.labelPlural))

  // The whole reason the fields exist: naive concatenation is wrong.
  const naive = professions.filter(p => p.labelWith === `${p.label}თან`)
  check('labelWith is never just label + „თან" (that is the bug it prevents)',
    naive.length === 0, naive.map(p => p.slug).join(', '))
  const naiveP = professions.filter(p => p.labelPlural === `${p.label}ები`)
  check('labelPlural is never just label + „ები"',
    naiveP.length === 0, naiveP.map(p => p.slug).join(', '))

  check('labelWith ends in the -თან postposition',
    professions.every(p => p.labelWith.endsWith('თან')),
    professions.filter(p => !p.labelWith.endsWith('თან')).map(p => p.slug).join(', '))
}

/* ═══════════ 3. content each page needs to stand up ══════════════════════ */

{
  // Google truncates a description around 160 chars; under ~70 wastes the slot.
  const tooLong = professions.filter(p => p.metaDescription.length > 165)
  check('metaDescription fits a SERP snippet (≤165)', tooLong.length === 0,
    tooLong.map(p => `${p.slug}:${p.metaDescription.length}`).join(', '))
  const tooShort = professions.filter(p => p.metaDescription.length < 70)
  check('metaDescription is not stunted (≥70)', tooShort.length === 0,
    tooShort.map(p => `${p.slug}:${p.metaDescription.length}`).join(', '))

  check('every page has an intro of real length',
    professions.every(p => p.intro.trim().length >= 150))
  check('every page has 3+ „when to go" lines',
    professions.every(p => p.when.length >= 3))
  check('every page has 3+ FAQ pairs (feeds FAQPage JSON-LD)',
    professions.every(p => p.faq.length >= 3 && p.faq.every(f => f.q && f.a)))

  // The keyword IS the H1 and the <title> stem — it must name the profession.
  const offTerm = professions.filter(p => !p.keyword.includes(p.labelWith))
  check('keyword contains the -თან form (it is the page H1)',
    offTerm.length === 0, offTerm.map(p => p.slug).join(', '))
  // „კონსულტანტთან კონსულტაცია" is a tautology nobody searches for.
  const tautology = professions.filter(p => p.keyword.includes('კონსულტანტთან კონსულტაცია'))
  check('no „კონსულტანტთან კონსულტაცია" tautology in a head term',
    tautology.length === 0, tautology.map(p => p.slug).join(', '))
}

/* ═══════════ 4. coverage — the gap this file keeps closed ════════════════ */

{
  const uncovered = LIVE_CATEGORIES.filter(c => professionsForCategory(c).length === 0)
  check('EVERY live category has at least one profession page',
    uncovered.length === 0,
    `no profession page points at: ${uncovered.join(', ')}`)

  check('professionsForCategory returns only that category',
    professionsForCategory('tax').every(p => p.categorySlug === 'tax'))
  check('an unknown category yields an empty array, not a throw',
    professionsForCategory('does-not-exist').length === 0)
}

/* ───── summary ───── */
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
