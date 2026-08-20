/* One mark per category — and one place that decides it.
 *
 * WHAT WENT WRONG. The glyph was mapped twice: the home grid used the
 * hand-drawn CatIcon set (fourteen categories sharing seven drawings — „ბიზნესი"
 * and „გაყიდვები" were the same briefcase, and „ფსიქოლოგია" had no entry at all
 * because its slug is `psychology`, not `psych`), while /categories had its own
 * map onto the generic UI icons that covered seven slugs and dropped the rest
 * onto one fallback. Measured in production: fifteen cards, SIX distinct
 * drawings. Fixing either map left the other page wrong.
 *
 * Two identical stamps on one grid read as one thing, so a repeat is a bug.
 */
// SOURCE-LEVEL on purpose: importing lib/categoryMarks would pull in
// components/Icon (JSX + the `@/` alias), which this bare-node runner cannot
// resolve. The invariants here are all about the TEXT of the map anyway.
import { readFileSync, readdirSync, existsSync } from 'node:fs'

let passed = 0, failed = 0
const check = (name: string, ok: boolean, why = '') => {
  if (ok) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${why ? ` — ${why}` : ''}`) }
}

const src = readFileSync(new URL('../lib/categoryMarks.tsx', import.meta.url), 'utf8')
// `-` must be allowed inside the icon capture too: the real-estate entry is
// `CatIcon['real-estate']`, and without it that row silently failed to match —
// making C1 report a missing mark that was in fact right there.
const entries = [...src.matchAll(/^\s+'?([\w-]+)'?:\s+\{ icon: (CatIcon[.[][\w'\-\]]+),\s+description: '([^']*)'/gm)]
const MARKED_SLUGS = entries.map(m => m[1])
const iconOf = (slug: string) => entries.find(m => m[1] === slug)?.[2]
const blurbOf = (slug: string) => entries.find(m => m[1] === slug)?.[3] ?? ''

check('C1: every live category slug has a mark',
  ['business', 'tax', 'finance', 'law', 'marketing', 'sales', 'it', 'product',
   'design', 'career', 'hr', 'psychology', 'real-estate', 'relocation', 'crypto']
    .every(s => MARKED_SLUGS.includes(s) && !!iconOf(s)),
  `missing: ${['business','tax','finance','law','marketing','sales','it','product','design','career','hr','psychology','real-estate','relocation','crypto'].filter(s => !MARKED_SLUGS.includes(s)).join(', ')}`)

// The map is `slug: { icon: CatIcon.x }` — two slugs pointing at the same CatIcon
// key is exactly the duplication this file exists to stop.
const used = entries.map(m => m[2])
const dupes = used.filter((v, i) => used.indexOf(v) !== i)
check('C2: no two categories share a drawing', dupes.length === 0,
  `repeated: ${[...new Set(dupes)].join(', ')}`)

check('C3: there are as many marks as categories', used.length === MARKED_SLUGS.length,
  `${used.length} marks vs ${MARKED_SLUGS.length} slugs`)

check('C4: there is a fallback for an unknown slug', /const FALLBACK: CategoryMark/.test(src))

check('C5: every category carries a blurb',
  MARKED_SLUGS.every(s => blurbOf(s).trim().length > 3),
  MARKED_SLUGS.filter(s => blurbOf(s).trim().length <= 3).join(', '))

// The old duplicate maps must stay deleted.
/* Read the WHOLE home surface, not just the container. C6 is a negative check,
   and the home page was split into app/_home/ — pointed at HomeClient.tsx alone
   it would pass because the category code is no longer there, which is a test
   that cannot fail rather than a test that holds. */
const home = [
  readFileSync(new URL('../app/HomeClient.tsx', import.meta.url), 'utf8'),
  ...readdirSync(new URL('../app/_home/', import.meta.url))
    .filter(f => f.endsWith('.tsx'))
    .sort()
    .map(f => readFileSync(new URL(`../app/_home/${f}`, import.meta.url), 'utf8')),
].join('\n')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
check('C6: the home page no longer keeps its own map', !/CAT_META\s*:/.test(strip(home)))
// C7 used to read app/categories/page.tsx for a private ICON_MAP. That page was
// RETIRED in stage 8 (2026-08-19; /categories/* 308s to /tutors?category=), so
// the assertion is now that the directory stays gone — a resurrected page would
// have to be argued for, and would have to draw from lib/categoryMarks like
// everybody else (tests/taxonomy.test.ts pins the redirect).
check('C7: app/categories stays retired', !existsSync(new URL('../app/categories', import.meta.url)))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
