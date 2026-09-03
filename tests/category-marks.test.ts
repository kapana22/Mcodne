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
/* ⚠️ THE MAP HOLDS A KEY NOW, NOT AN ELEMENT (2026-09-02). It was
   `icon: CatIcon.law` — a ready-rendered hand-drawn glyph — and the whole set
   moved to Phosphor duotone that day (components/CategoryMarks; the owner
   rejected the hand-drawn one on sight, and the size measurements behind that
   are in its header). So a row now reads `icon: 'law'` and this pattern reads
   the quoted key.

   Everything C1 and C2 assert is unchanged, and that is the point of writing
   it this way: „every slug has a mark" and „no two share a drawing" are
   properties of the TABLE, not of what the table happens to store. The old
   note about `-` still applies — `real-estate` is a quoted key on both sides
   of the colon. */
const entries = [...src.matchAll(/^\s+'?([\w-]+)'?:\s+\{ icon: '([\w-]+)',\s+description: '([^']*)',\s+photo: '([^']*)'/gm)]
const MARKED_SLUGS = entries.map(m => m[1])
const iconOf = (slug: string) => entries.find(m => m[1] === slug)?.[2]
const blurbOf = (slug: string) => entries.find(m => m[1] === slug)?.[3] ?? ''
const photoOf = (slug: string) => entries.find(m => m[1] === slug)?.[4] ?? ''

check('C1: every live category slug has a mark',
  ['business', 'tax', 'finance', 'law', 'marketing', 'sales', 'it', 'product',
   'design', 'career', 'hr', 'psychology', 'real-estate', 'relocation', 'crypto']
    .every(s => MARKED_SLUGS.includes(s) && !!iconOf(s)),
  `missing: ${['business','tax','finance','law','marketing','sales','it','product','design','career','hr','psychology','real-estate','relocation','crypto'].filter(s => !MARKED_SLUGS.includes(s)).join(', ')}`)

// The map is `slug: { icon: 'x' }` — two slugs pointing at the same mark is
// exactly the duplication this file exists to stop.
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

/* ── THE PHOTOGRAPH (2026-08-31) ───────────────────────────────────────────────
 * The home tile's plate is a picture now (app/_home/categories → Plate), and
 * both ways it can fail are silent. A path with no file behind it renders a
 * blank band on the busiest page on the site — next/image does not throw, it
 * just draws nothing — and two spheres sharing a picture is the C2 bug one
 * layer up: the eye reads two tiles as one thing whatever their glyphs say.
 * These read the DISK, so a file deleted or renamed fails here rather than in
 * production. */
const publicFile = (path: string) => new URL(`../public${path}`, import.meta.url)

check('C8: every category names a photograph',
  MARKED_SLUGS.every(s => /^\/category-photos\/[\w-]+\.webp$/.test(photoOf(s))),
  MARKED_SLUGS.filter(s => !/^\/category-photos\/[\w-]+\.webp$/.test(photoOf(s))).join(', '))

check('C9: every photograph is a file that exists',
  MARKED_SLUGS.every(s => existsSync(publicFile(photoOf(s)))),
  `missing from public/: ${MARKED_SLUGS.filter(s => !existsSync(publicFile(photoOf(s)))).map(photoOf).join(', ')}`)

const pics = MARKED_SLUGS.map(photoOf)
const picDupes = pics.filter((v, i) => pics.indexOf(v) !== i)
check('C10: no two categories share a photograph', picDupes.length === 0,
  `repeated: ${[...new Set(picDupes)].join(', ')}`)

// The two home tiles that are not spheres — „ყველა სერვისი" and „მოთხოვნის
// გაგზავნა" — have no row in MARKS, so C9 cannot see their plates.
const namedPhoto = (k: string) => src.match(new RegExp(`export const ${k} = '([^']*)'`))?.[1] ?? ''
for (const [n, k, what] of [
  ['C11', 'ALL_CATEGORIES_PHOTO', '„ყველა სერვისი"'],
  ['C12', 'REQUEST_TILE_PHOTO', '„მოთხოვნის გაგზავნა"'],
] as const) {
  const photo = namedPhoto(k)
  check(`${n}: the ${what} tile has a photograph too`,
    !!photo && existsSync(publicFile(photo)) && !pics.includes(photo),
    photo ? `${photo} is missing, or is a sphere's picture reused` : `${k} is gone`)
}
check('C13: the two door tiles do not share one picture',
  namedPhoto('ALL_CATEGORIES_PHOTO') !== namedPhoto('REQUEST_TILE_PHOTO'),
  'both doors draw the same photograph — on one row the eye reads them as one thing')

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
