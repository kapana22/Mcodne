// Unit tests for the Georgian-aware expert search in lib/tutorsQuery.ts.
//
// Run: npx tsx tests/tutorSearch.test.ts
//
// Pure unit test (no browser, no dev server, no DB), in the style of
// tests/availability.test.ts. Georgian has no capitalisation but very heavy
// declension, so the browse search was rebuilt on Postgres trigram similarity
// instead of `contains`. The SQL itself can't be unit-tested without a
// database, so this file reimplements pg_trgm's EXACT algorithm in TypeScript
// (see `trigrams` / `wordSimilarity` below, both pinned against pg_trgm's own
// documented example `word_similarity('word','two words') = 0.8`) and then
// pins the invariants that make the feature correct:
//
//   1. normalizeSearchTerms puts the term the user TYPED first, at full weight,
//      dedupes the synonym expansion, and is bounded by MAX_SEARCH_TERMS.
//   2. Georgian declension clears the threshold: „კონსულტაციას" finds
//      „კონსულტაცია", „მარკეტინგის"/„მარკეტინგში" find „მარკეტინგი".
//   3. Unrelated Georgian words stay BELOW the threshold — the fuzziness must
//      not turn browse into "everything matches".
//   4. NON-REGRESSION: an exact substring hit always scores above the
//      threshold, in every field, at every term weight. That is what makes the
//      trigram predicate a strict superset of the old `contains` one.
//   5. The `contains` fallback (used when pg_trgm is unavailable) still emits
//      the pre-trigram predicate shape, over the same five columns.
//
// No Math.random() — every case is deterministic.

import {
  normalizeSearchTerms,
  buildContainsOr,
  pairScore,
  SEARCH_SIMILARITY_THRESHOLD,
  SEARCH_FIELD_WEIGHTS,
  SYNONYM_TERM_WEIGHT,
  MAX_SEARCH_TERMS,
  type SearchField,
} from '../lib/tutorsQuery'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

/* ═══════════ pg_trgm reference implementation ═══════════════════════════════
 * contrib/pg_trgm: each WORD is padded with two leading blanks and one
 * trailing blank, then cut into overlapping 3-character shingles. Extraction
 * is case-insensitive (pg_trgm lowercases), which is why the SQL needs no
 * `mode: 'insensitive'`.
 *
 * word_similarity(a, b) = max over every continuous extent of whole words in b
 * of  |T(a) ∩ T(extent)| / |T(a)| .
 */

function trigramsOfWord(word: string): string[] {
  const padded = `  ${word} `
  const out: string[] = []
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3))
  return out
}

/** Words = maximal runs of alphanumeric characters, lowercased. */
function words(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function trigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (const w of words(s)) for (const t of trigramsOfWord(w)) set.add(t)
  return set
}

function wordSimilarity(a: string, b: string): number {
  const ta = trigrams(a)
  if (ta.size === 0) return 0
  const bw = words(b)
  let best = 0
  // Every continuous extent of whole words in b.
  for (let i = 0; i < bw.length; i++) {
    for (let j = i; j < bw.length; j++) {
      const extent = trigrams(bw.slice(i, j + 1).join(' '))
      let shared = 0
      for (const t of ta) if (extent.has(t)) shared++
      const score = shared / ta.size
      if (score > best) best = score
    }
  }
  return best
}

/** Mirrors the SQL: GREATEST(word_similarity, ILIKE-hit) × Wfield × Wterm. */
function score(field: SearchField, termWeight: number, term: string, value: string) {
  return pairScore(field, termWeight, wordSimilarity(term, value), value.toLowerCase().includes(term.toLowerCase()))
}

/* ═══════════ 0. the reference implementation itself ════════════════════════ */

// pg_trgm's own documentation: SELECT word_similarity('word', 'two words') → 0.8
check('reference: word_similarity(\'word\',\'two words\') = 0.8', near(wordSimilarity('word', 'two words'), 0.8),
  String(wordSimilarity('word', 'two words')))
// Identical strings are a perfect match.
check('reference: identical strings score 1', near(wordSimilarity('კონსულტაცია', 'კონსულტაცია'), 1))
// A query fully contained as a whole word scores 1.
check('reference: contained whole word scores 1',
  near(wordSimilarity('მარკეტინგი', 'ციფრული მარკეტინგი და ბრენდი'), 1))
// Disjoint strings share nothing.
check('reference: disjoint strings score 0', near(wordSimilarity('xyz', 'abc'), 0))

/* ═══════════ 1. normalizeSearchTerms ══════════════════════════════════════ */

{
  const t = normalizeSearchTerms('  მარკეტინგი  ')
  check('normalize: trims + lowercases', t[0].term === 'მარკეტინგი', JSON.stringify(t[0]))
  check('normalize: typed term is first and full weight', t[0].weight === 1)
  check('normalize: synonyms carry the reduced weight',
    t.slice(1).every(x => x.weight === SYNONYM_TERM_WEIGHT), JSON.stringify(t))
  check('normalize: expands through the synonym map', t.length > 1, JSON.stringify(t.map(x => x.term)))
  check('normalize: no duplicate terms', new Set(t.map(x => x.term)).size === t.length)
  check('normalize: bounded by MAX_SEARCH_TERMS', t.length <= MAX_SEARCH_TERMS)
}
check('normalize: empty query yields no terms', normalizeSearchTerms('   ').length === 0)
{
  // An arbitrary phrase with no synonym-map entry still searches verbatim.
  const t = normalizeSearchTerms('კიბერუსაფრთხოებას')
  check('normalize: unknown query still yields the typed term',
    t.length >= 1 && t[0].term === 'კიბერუსაფრთხოებას' && t[0].weight === 1)
}
{
  // English input is lowercased so it can never miss on case alone.
  const t = normalizeSearchTerms('MARKETING')
  check('normalize: uppercase input is lowercased', t[0].term === 'marketing')
}

/* ═══════════ 2. Georgian declension clears the threshold ══════════════════ */

// These are the real cases from the live database: three experts carry the
// specialty „მარკეტინგი", one „ბიზნეს-სტრატეგია", one headline
// „კიბერუსაფრთხოების ბიურო", one specialty „გაყიდვები".
const DECLENSIONS: { q: string; value: string; field: SearchField }[] = [
  { q: 'კონსულტაციას',       value: 'კონსულტაცია',              field: 'specialty' },
  { q: 'კონსულტაციის',       value: 'ბიზნეს კონსულტაცია',       field: 'headline' },
  { q: 'კონსულტაციებისთვის', value: 'კონსულტაცია',              field: 'specialty' },
  { q: 'მარკეტინგის',        value: 'მარკეტინგი',               field: 'specialty' },
  { q: 'მარკეტინგში',        value: 'მარკეტინგი',               field: 'specialty' },
  { q: 'მარკეტინგს',         value: 'მარკეტინგი',               field: 'categoryName' },
  { q: 'ბიზნეს-სტრატეგიას',  value: 'ბიზნეს-სტრატეგია',         field: 'specialty' },
  { q: 'გაყიდვებს',          value: 'გაყიდვები',                field: 'specialty' },
  { q: 'კიბერუსაფრთხოებას',  value: 'კიბერუსაფრთხოების ბიურო',  field: 'headline' },
  { q: 'ფსიქოლოგს',          value: 'ფსიქოლოგი',                field: 'specialty' },
]
for (const c of DECLENSIONS) {
  const s = score(c.field, 1, c.q, c.value)
  check(`declension: „${c.q}" matches „${c.value}"`, s >= SEARCH_SIMILARITY_THRESHOLD, `score ${s.toFixed(3)}`)
}

// The documented worked examples in lib/tutorsQuery's header must stay true.
check('worked example: word_similarity(კონსულტაციას, კონსულტაცია) = 11/13',
  near(wordSimilarity('კონსულტაციას', 'კონსულტაცია'), 11 / 13),
  String(wordSimilarity('კონსულტაციას', 'კონსულტაცია')))
check('worked example: word_similarity(მარკეტინგის, მარკეტინგი) = 10/12',
  near(wordSimilarity('მარკეტინგის', 'მარკეტინგი'), 10 / 12),
  String(wordSimilarity('მარკეტინგის', 'მარკეტინგი')))
check('worked example: word_similarity(კონსულტაციებისთვის, კონსულტაცია) = 10/19',
  near(wordSimilarity('კონსულტაციებისთვის', 'კონსულტაცია'), 10 / 19),
  String(wordSimilarity('კონსულტაციებისთვის', 'კონსულტაცია')))

// A one-letter typo must survive too (that was the other failure mode).
check('typo: „მარკეტინგო" still finds „მარკეტინგი"',
  score('specialty', 1, 'მარკეტინგო', 'მარკეტინგი') >= SEARCH_SIMILARITY_THRESHOLD,
  String(score('specialty', 1, 'მარკეტინგო', 'მარკეტინგი')))

/* ═══════════ 3. unrelated words stay below the threshold ══════════════════ */

const UNRELATED: [string, string][] = [
  ['მარკეტინგი', 'ფსიქოლოგია'],
  ['მარკეტინგი', 'იურისტი'],
  ['კონსულტაცია', 'გაყიდვები'],
  ['ბიზნესი', 'კიბერუსაფრთხოება'],
  ['ფსიქოლოგი', 'ბუღალტერი'],
  ['კარიერა', 'მარკეტინგი'],
]
for (const [q, value] of UNRELATED) {
  // Worst case for a false positive: the highest-weighted field + full weight.
  const s = score('specialty', 1, q, value)
  check(`precision: „${q}" does NOT match „${value}"`, s < SEARCH_SIMILARITY_THRESHOLD, `score ${s.toFixed(3)}`)
}

/* ═══════════ 4. non-regression: `contains` behavior is a strict subset ════ */

// An exact substring hit must clear the threshold in EVERY field at EVERY term
// weight — otherwise the rewrite would silently drop matches that used to work.
{
  let worst = Infinity
  let worstWhere = ''
  for (const field of Object.keys(SEARCH_FIELD_WEIGHTS) as SearchField[]) {
    for (const tw of [1, SYNONYM_TERM_WEIGHT]) {
      // wordSimilarity deliberately passed as 0: prove the ILIKE arm ALONE
      // carries the row, exactly as the SQL's GREATEST(...) does.
      const s = pairScore(field, tw, 0, true)
      if (s < worst) { worst = s; worstWhere = `${field}@${tw}` }
    }
  }
  check('non-regression: an exact substring hit always clears the threshold',
    worst >= SEARCH_SIMILARITY_THRESHOLD, `worst ${worst.toFixed(3)} at ${worstWhere}`)
}
// The real-world version of the same claim: a substring buried in a long bio.
check('non-regression: substring in a long bio still matches',
  score('bio', SYNONYM_TERM_WEIGHT, 'seo',
    'ვმუშაობ ციფრულ არხებზე: seo, კონტენტი და სარეკლამო კამპანიები. '.repeat(20)) >= SEARCH_SIMILARITY_THRESHOLD)

// The field weights must stay ordered specialty > headline > name > category >
// bio, and the synonym weight must stay below the typed term's.
{
  const w = SEARCH_FIELD_WEIGHTS
  check('weights: specialty ≥ headline ≥ fullName ≥ categoryName ≥ bio',
    w.specialty >= w.headline && w.headline >= w.fullName && w.fullName >= w.categoryName && w.categoryName >= w.bio)
  check('weights: synonyms rank below the typed term', SYNONYM_TERM_WEIGHT < 1 && SYNONYM_TERM_WEIGHT > 0)
  check('weights: a specialty hit outranks the same hit in a bio',
    pairScore('specialty', 1, 1, true) > pairScore('bio', 1, 1, true))
  check('weights: the typed term outranks its synonym on the same field',
    pairScore('specialty', 1, 1, true) > pairScore('specialty', SYNONYM_TERM_WEIGHT, 1, true))
}

/* ═══════════ 5. the pg_trgm-less fallback path ════════════════════════════ */

{
  const terms = normalizeSearchTerms('მარკეტინგი')
  const or = buildContainsOr(terms)
  check('fallback: five predicates per term (the five searched columns)',
    or.length === terms.length * 5, `${or.length} for ${terms.length} terms`)
  const keys = new Set(or.map(o => Object.keys(o)[0]))
  check('fallback: covers headline/specialty/bio/user/category',
    ['headline', 'specialty', 'bio', 'user', 'category'].every(k => keys.has(k)), [...keys].join(','))
  check('fallback: every predicate is case-insensitive contains',
    or.every(o => JSON.stringify(o).includes('"insensitive"') && JSON.stringify(o).includes('"contains"')))
  check('fallback: an empty query produces no predicates', buildContainsOr(normalizeSearchTerms('')).length === 0)
}

/* ───── summary ───── */
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
