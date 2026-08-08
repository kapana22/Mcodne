// Invariants for the search synonym map (lib/searchSynonyms.ts).
//
// Run: npx tsx tests/searchSynonyms.test.ts
//
// Pure unit test — no DB, no browser. The map is hand-maintained data, and the
// two ways it silently breaks are both invisible in review:
//
//   1. A bucket that omits its OWN key. expandQuery returns the bucket verbatim
//      on a direct hit, so a bucket missing its key drops the exact word the
//      user typed — the search then matches only the synonyms, which is worse
//      than having no entry at all.
//   2. Coverage drift. The catalogue grew 6 → 15 spheres and the map didn't
//      follow, so „დღგ", „შპს", „გაყიდვები" returned nothing. These pins fail
//      loudly if a live sphere loses its route back to an expert.
import { SEARCH_SYNONYMS, expandQuery } from '../lib/searchSynonyms'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ═══════════ 1. structural invariants ════════════════════════════════════ */

{
  const offenders = Object.entries(SEARCH_SYNONYMS).filter(([k, v]) => !v.includes(k)).map(([k]) => k)
  check('every bucket contains its own key', offenders.length === 0, offenders.join(', '))

  const lower = Object.keys(SEARCH_SYNONYMS).filter(k => k !== k.toLowerCase())
  check('every key is lowercase (expandQuery lowercases the query)', lower.length === 0, lower.join(', '))

  const empty = Object.entries(SEARCH_SYNONYMS).filter(([, v]) => v.length < 2).map(([k]) => k)
  check('every bucket expands to at least one OTHER term', empty.length === 0, empty.join(', '))
}

/* ═══════════ 2. concrete terms reach the right sphere ════════════════════ */

// What people actually type → a term that live expert profiles/categories use.
// Each pair is a search that returned ZERO results before 2026-07-28.
const ROUTES: [query: string, mustReach: string][] = [
  ['დღგ', 'საგადასახადო'],
  ['დეკლარაცია', 'ბუღალტერი'],
  ['შპს', 'იურისტი'],
  ['ინდმეწარმე', 'საგადასახადო'],
  ['ხელშეკრულება', 'სამართალი'],
  ['ბიზნეს გეგმა', 'ბიზნესი'],
  ['სტარტაპი', 'ბიზნესი'],
  ['გაყიდვები', 'sales'],
  ['მოლაპარაკება', 'გაყიდვები'],
  ['პროდაქტი', 'product'],
  ['გასაუბრება', 'კარიერა'],
  ['რეზიუმე', 'კარიერა'],
  ['რეკრუტინგი', 'hr'],
  ['უძრავი', 'ქონება'],
  ['იპოთეკა', 'ფინანსები'],
  ['რელოკაცია', 'ბინადრობა'],
  ['ვიზა', 'იურისტი'],
  ['კრიპტო', 'crypto'],
  ['ვებგვერდი', 'დეველოპერი'],
]

for (const [q, target] of ROUTES) {
  const got = expandQuery(q)
  check(`„${q}" reaches „${target}"`, got.includes(target), got.slice(0, 5).join(', ') || '(nothing)')
}

/* ═══════════ 3. expandQuery behaviour ════════════════════════════════════ */

{
  check('the typed term is always included', expandQuery('ბუღალტერი').includes('ბუღალტერი'))
  check('an unknown term still returns itself (contains-match fallback)',
    expandQuery('ზუზუნა').includes('ზუზუნა'))
  check('an empty query returns nothing', expandQuery('   ').length === 0)
  check('case is normalised', expandQuery('CV').includes('რეზიუმე'))
  check('a partial prefix still finds its bucket', expandQuery('იურის').includes('სამართალი'))
  check('results are deduped', (() => {
    const r = expandQuery('ბუღალტერი')
    return new Set(r).size === r.length
  })())
}

/* ───── summary ───── */
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
