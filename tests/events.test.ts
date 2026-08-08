// Unit tests for lib/events.ts — the product-instrumentation primitives.
//
// Run: npx tsx tests/events.test.ts
//
// Pure unit test (no browser, no dev server, no DB), in the style of
// tests/availability.test.ts. The DB write itself can't be unit-tested here
// (and must not be — the live DB is production), so this pins everything that
// happens BEFORE the insert, which is where every rule that matters lives:
//
//   1. BOUNDED — a search string, a prop string, the prop count and the total
//      serialised payload all have hard ceilings. An analytics table is the
//      easiest place in a codebase to accidentally store an unbounded blob.
//   2. NO PII — normalizeQuery() must strip the two shapes that can smuggle an
//      identity into a free-text search box: e-mail-like tokens and long digit
//      runs. Neither may survive truncation, so both are removed first.
//   3. SKIP JUNK — a single keystroke, whitespace, or pure punctuation is not a
//      query and must never become a row. Zero-result COUNTS are the product
//      signal; padding them with noise makes the number a lie.
//   4. NAME CONTRACT — the event-name constants are read by other surfaces
//      (the admin panel queries `Event.name` by these exact strings), so the
//      literal values are pinned here. Changing one is a breaking change.
//   5. NEVER THROWS — the argument-validation half of that contract is
//      testable without a database and is asserted below.
//
// No Math.random(), no Date.now() in an assertion — every case is deterministic.

import {
  EVENTS,
  NAME_MAX,
  PROPS_JSON_MAX,
  PROPS_MAX_KEYS,
  PROPS_KEY_MAX,
  PROPS_STRING_MAX,
  PROPS_ARRAY_MAX,
  QUERY_MAX,
  QUERY_MIN,
  EVENT_RETENTION_DAYS,
  EVENT_PRUNE_SQL,
  normalizeEventName,
  normalizeQuery,
  boundProps,
  track,
} from '../lib/events'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ───── 4. event-name contract (other surfaces read these literals) ───── */

check('EVENTS.SEARCH is exactly "search"', EVENTS.SEARCH === 'search', EVENTS.SEARCH)
check('EVENTS.SEARCH_ZERO is exactly "search_zero"', EVENTS.SEARCH_ZERO === 'search_zero', EVENTS.SEARCH_ZERO)
check('the two search events are distinct (the zero-rate needs a denominator)',
  // Widened to string on purpose: the constants are literal types, so tsc would
  // otherwise reject the comparison as provably-unequal — which is the point.
  (EVENTS.SEARCH as string) !== (EVENTS.SEARCH_ZERO as string))

/* ───── normalizeEventName ───── */

check('name: plain constant passes through', normalizeEventName('search_zero') === 'search_zero')
check('name: trimmed', normalizeEventName('  search  ') === 'search')
check('name: capped at NAME_MAX', normalizeEventName('x'.repeat(500))?.length === NAME_MAX)
check('name: empty → null', normalizeEventName('') === null)
check('name: whitespace-only → null', normalizeEventName('   ') === null)
check('name: non-string → null',
  normalizeEventName(undefined) === null &&
  normalizeEventName(null) === null &&
  normalizeEventName(42) === null &&
  normalizeEventName({}) === null)

/* ───── 3. normalizeQuery: skip junk ───── */

check('query: empty → null', normalizeQuery('') === null)
check('query: whitespace-only → null', normalizeQuery('   \t  ') === null)
check('query: single character → null (a keystroke is not a query)', normalizeQuery('მ') === null)
check('query: single latin character → null', normalizeQuery('a') === null)
check('query: QUERY_MIN is the boundary — 2 chars survive',
  QUERY_MIN === 2 && normalizeQuery('ai') === 'ai')
check('query: punctuation-only → null', normalizeQuery('???') === null)
check('query: punctuation + spaces → null', normalizeQuery(' -- ... !! ') === null)
check('query: non-string → null',
  normalizeQuery(undefined) === null && normalizeQuery(null) === null && normalizeQuery(7) === null)
check('query: a digits-only query still counts as meaningful', normalizeQuery('2026') === '2026')

/* ───── normalizeQuery: normalisation ───── */

check('query: trimmed', normalizeQuery('  მარკეტინგი  ') === 'მარკეტინგი')
check('query: inner whitespace collapsed',
  normalizeQuery('ბიზნეს   გეგმა') === 'ბიზნეს გეგმა', String(normalizeQuery('ბიზნეს   გეგმა')))
check('query: newlines and tabs collapse to single spaces',
  normalizeQuery('ბიზნეს\n\tგეგმა') === 'ბიზნეს გეგმა', String(normalizeQuery('ბიზნეს\n\tგეგმა')))
check('query: lowercased so casing variants aggregate as ONE row',
  normalizeQuery('Marketing') === 'marketing' && normalizeQuery('MARKETING') === 'marketing')
check('query: Georgian is untouched by lowercasing (no case in the script)',
  normalizeQuery('იურისტი') === 'იურისტი')
check('query: control characters are stripped, not stored',
  normalizeQuery('მარკეტ\u0000\u0007ინგი') === 'მარკეტ ინგი', String(normalizeQuery('მარკეტ\u0000\u0007ინგი')))

/* ───── 1. normalizeQuery: bounded ───── */

{
  const long = normalizeQuery('ა'.repeat(500))
  check('query: capped at QUERY_MAX', long !== null && long.length === QUERY_MAX, `${long?.length}`)
}
check('query: cap does not leave a trailing space',
  normalizeQuery('ა'.repeat(QUERY_MAX - 1) + ' ბ')?.endsWith(' ') === false)
check('query: exactly QUERY_MAX survives whole',
  normalizeQuery('ა'.repeat(QUERY_MAX))?.length === QUERY_MAX)

/* ───── 2. normalizeQuery: PII redaction ───── */

{
  const out = normalizeQuery('იურისტი vaso@example.com')
  check('query: an e-mail is redacted', out === 'იურისტი', String(out))
}
check('query: an e-mail alone leaves nothing to store',
  normalizeQuery('someone@gmail.com') === null, String(normalizeQuery('someone@gmail.com')))
check('query: a long digit run (phone/ID) is redacted',
  normalizeQuery('იურისტი 555123456') === 'იურისტი', String(normalizeQuery('იურისტი 555123456')))
check('query: a short number is NOT redacted (it can be a real query)',
  normalizeQuery('2026 წელი') === '2026 წელი', String(normalizeQuery('2026 წელი')))
check('query: PII is stripped BEFORE the cap, so truncation cannot preserve it',
  normalizeQuery('a'.repeat(QUERY_MAX - 5) + ' vaso@example.com')?.includes('@') === false)
check('query: a redacted e-mail leaves no stray @ or dot fragment',
  normalizeQuery('ბუღალტერი  a.b@c.de  ') === 'ბუღალტერი', String(normalizeQuery('ბუღალტერი  a.b@c.de  ')))

/* ───── boundProps: shape ───── */

const parse = (s: string) => JSON.parse(s) as Record<string, unknown>

check('props: undefined → "{}"', boundProps(undefined) === '{}')
check('props: null → "{}"', boundProps(null) === '{}')
check('props: an array is not a props object → "{}"', boundProps([1, 2] as any) === '{}')
check('props: scalars survive',
  boundProps({ q: 'მარკეტინგი', n: 0, ok: true, none: null }) === '{"q":"მარკეტინგი","n":0,"ok":true,"none":null}',
  boundProps({ q: 'მარკეტინგი', n: 0, ok: true, none: null }))
check('props: undefined values are OMITTED (not written as a null that reads real)',
  boundProps({ q: 'x', category: undefined }) === '{"q":"x"}',
  boundProps({ q: 'x', category: undefined }))
check('props: functions and symbols are dropped',
  boundProps({ q: 'x', f: () => 1, s: Symbol('s') } as any) === '{"q":"x"}',
  boundProps({ q: 'x', f: () => 1, s: Symbol('s') } as any))
check('props: non-finite numbers become null, never NaN/Infinity in JSON',
  boundProps({ a: NaN, b: Infinity }) === '{"a":null,"b":null}',
  boundProps({ a: NaN, b: Infinity }))
check('props: a nested object is flattened to a bounded string, not stored as a blob',
  typeof parse(boundProps({ deep: { a: { b: 1 } } })).deep === 'string')

/* ───── 1. boundProps: bounded ───── */

check('props: a long string value is clipped to PROPS_STRING_MAX',
  (parse(boundProps({ q: 'ა'.repeat(5000) })).q as string).length === PROPS_STRING_MAX)
check('props: key count is capped at PROPS_MAX_KEYS',
  Object.keys(parse(boundProps(
    Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, i])),
  ))).length === PROPS_MAX_KEYS)
check('props: array length is capped at PROPS_ARRAY_MAX',
  (parse(boundProps({ list: Array.from({ length: 500 }, (_, i) => i) })).list as unknown[]).length === PROPS_ARRAY_MAX)
check('props: array string ELEMENTS are clipped too',
  ((parse(boundProps({ list: ['ა'.repeat(5000)] })).list as string[])[0]).length === PROPS_STRING_MAX)
check('props: a long key is clipped (it can never blow up the row on its own)',
  Object.keys(parse(boundProps({ ['k'.repeat(500)]: 1 })))[0].length <= 40)

{
  // Every ceiling respected individually can still add up past the total cap.
  // When it does, the EVENT (the count) must survive — only the payload goes.
  const fat = Object.fromEntries(
    Array.from({ length: PROPS_MAX_KEYS }, (_, i) => [`k${i}`, 'ა'.repeat(PROPS_STRING_MAX)]),
  )
  const out = boundProps(fat)
  const parsed = parse(out)
  check('props: an oversized payload degrades to a truncation marker',
    parsed._truncated === true && typeof parsed._bytes === 'number',
    out.slice(0, 80))
  check('props: the truncation marker itself is far under PROPS_JSON_MAX',
    out.length < PROPS_JSON_MAX)
}
check('props: a payload under the total cap is stored verbatim',
  boundProps({ q: 'მარკეტინგი', n: 0 }).length <= PROPS_JSON_MAX &&
  parse(boundProps({ q: 'მარკეტინგი', n: 0 })).q === 'მარკეტინგი')
check('props: output is ALWAYS valid JSON, whatever went in',
  (() => {
    const nasty: any = { a: 'x' }
    nasty.self = nasty // circular — JSON.stringify would throw on it directly
    try { JSON.parse(boundProps(nasty)); return true } catch { return false }
  })())

/* ───── the exact row the zero-result producer writes ───── */

{
  // The shape app/api/tutors/route.ts emits for an unfiltered miss. Pinned
  // because the admin reader groups on these key names.
  const props = parse(boundProps({ q: normalizeQuery('  მარკეტინგში  ')!, n: 0, category: undefined, type: undefined, featured: undefined }))
  check('search_zero row: exactly { q, n } for an unfiltered search',
    JSON.stringify(props) === '{"q":"მარკეტინგში","n":0}', JSON.stringify(props))
}
{
  const props = parse(boundProps({ q: 'იურისტი', n: 0, category: 'legal', type: undefined, featured: undefined }))
  check('search_zero row: a category filter rides along when present',
    props.category === 'legal' && props.n === 0)
}

/* ───── retention ───── */

check('retention: EVENT_RETENTION_DAYS is a positive whole number of days',
  Number.isInteger(EVENT_RETENTION_DAYS) && EVENT_RETENTION_DAYS > 0)
check('retention: the prune statement targets Event by age and nothing else',
  EVENT_PRUNE_SQL.startsWith('DELETE FROM "Event" WHERE "at" < now() - interval') &&
  EVENT_PRUNE_SQL.includes(`'${EVENT_RETENTION_DAYS} days'`),
  EVENT_PRUNE_SQL)

/* ───── 5. never throws + summary ─────────────────────────────────────────
 * The only async section, so it owns the summary. Wrapped in an IIFE rather
 * than using top-level await: package.json is `"type": "commonjs"`, so tsx
 * runs this file as CJS and a top-level await would be a syntax error.
 */
void (async () => {
  // A bad name is dropped BEFORE any DB call, so these resolve without a
  // connection — which is also why this test file never touches the database.
  const results = await Promise.allSettled([
    track(''),
    track('   '),
    track(undefined as any),
    track(null as any, { q: 'x' }),
    track(123 as any),
  ])
  check('track: an invalid name resolves quietly instead of throwing',
    results.every(r => r.status === 'fulfilled'),
    JSON.stringify(results.map(r => r.status)))
  check('track: resolves to void', results.every(r => r.status === 'fulfilled' && r.value === undefined))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
})()
