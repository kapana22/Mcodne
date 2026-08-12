/*
 * Which refinements /tutors is allowed to OFFER.
 *
 * Run with:  npx tsx tests/tutorFilters.test.ts
 *
 * WHY THIS FILE EXISTS. A filter that cannot change the result set is worse
 * than a missing one: the reader spends attention on it, taps it, and either
 * nothing happens or the page empties with no explanation. app/tutors/_filters
 * already carries a long note about this — three facets shipped as
 * guaranteed-zero on 2026-08-02 — and it was still true on 2026-08-12, measured
 * against the live roster:
 *
 *     21 experts in browse
 *     ქართული        21 of 21   ← an option that returns EVERYONE
 *     ინგლისური      12, რუსული 5
 *     reviews         0          ← every rating threshold returns nothing
 *     „ამ კვირას"    17 of 21   ← removed on the owner's call: it cut four
 *                                  results and implied a scheduling step that
 *                                  is not how anybody chooses an expert
 *
 * The rules below are what replaced „render it and disable the zero ones".
 * They are pure functions of the facet counts, so they SELF-HEAL: nothing has
 * to be remembered when reviews start arriving or the roster grows.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/* ⚠️ THE GLOBAL GOES FIRST, AND IT IS NOT OPTIONAL.
 * _filters imports components/Icon, and tsconfig sets jsx:"preserve" (Next
 * compiles the JSX itself), so tsx falls back to the CLASSIC runtime and every
 * component module expects a free `React` binding only Next's compiler would
 * inject. A static import would be hoisted above this line and throw
 * „React is not defined" before the first assertion. Same harness detail
 * tests/abroad.test.ts documents. This says nothing about how the app runs. */
;(globalThis as any).React = require('react')

type Facets = { rating: Record<string, number>; langs: Record<string, number>; pool: number; superOnly: number }
const {
  FILTER_LANGS, FILTER_RATINGS, ratingUseless, usefulLangs,
} = require('../app/tutors/_filters') as {
  FILTER_LANGS: { l: string }[]
  FILTER_RATINGS: number[]
  ratingUseless: (f: Facets) => boolean
  usefulLangs: (f: Facets) => { l: string }[]
}

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** The roster as it actually was on production, 2026-08-12. */
const LIVE: Facets = {
  pool: 21,
  langs: { 'ქართული': 21, 'ინგლისური': 12, 'რუსული': 5 },
  rating: {},
  superOnly: 0,
}

test('an option that returns EVERYONE is not offered', () => {
  // The one that prompted this: every expert in browse speaks Georgian, so the
  // chip looked like a refinement and could not refine. Tapping it „worked" and
  // changed nothing, which is harder to understand than a disabled control.
  const shown = usefulLangs(LIVE).map(l => l.l)
  assert.ok(!shown.includes('ქართული'), 'ქართული is offered while every expert speaks it')
  assert.deepEqual(shown, ['ინგლისური', 'რუსული'])
})

test('an option that returns NOBODY is not offered either', () => {
  const shown = usefulLangs({ ...LIVE, langs: { ...LIVE.langs, 'რუსული': 0 } }).map(l => l.l)
  assert.deepEqual(shown, ['ინგლისური'])
})

test('the language filter comes back by itself as the roster grows', () => {
  // The whole point of deriving this rather than deleting the option: nobody
  // has to remember to restore ქართული the day one expert does not speak it.
  const later: Facets = {
    pool: 40,
    langs: { 'ქართული': 38, 'ინგლისური': 20, 'რუსული': 9 },
    rating: {}, superOnly: 0,
  }
  assert.deepEqual(usefulLangs(later).map(l => l.l), ['ქართული', 'ინგლისური', 'რუსული'])
})

test('nothing is offered when the whole result set fits on one screen', () => {
  // Below three results there is nothing to narrow — offering to sort two cards
  // into one is a control that costs more attention than it saves.
  assert.deepEqual(usefulLangs({ ...LIVE, pool: 2, langs: { 'ინგლისური': 1 } }), [])
})

test('the rating filter is hidden while nobody has a review, and returns on its own', () => {
  assert.equal(ratingUseless(LIVE), true, 'ratings are offered while no expert has a review')
  const withReviews: Facets = { ...LIVE, rating: { '4.0': 12, '4.5': 7, '3.5': 15, '4.9': 2 } }
  assert.equal(ratingUseless(withReviews), false)
  // A single reachable threshold is still a real refinement — „4.9+ (2)" tells
  // a reader something true. Only ALL-zero hides the section.
  assert.equal(ratingUseless({ ...LIVE, rating: { '4.9': 1 } }), false)
})

test('the availability filter is gone from every surface', () => {
  // Removed 2026-08-12 on the owner's call. It cut 4 of 21 results, and it was
  // the first control on the page — leading with „when are they free" frames
  // the choice as scheduling when it is about who can help.
  //
  // Read as source across the whole route directory rather than a file list:
  // CLAUDE.md warns that a negative assertion aimed at one filename passes
  // vacuously the moment the code moves to a sibling.
  const dir = join(ROOT, 'app/tutors')
  const src = readdirSync(dir)
    .filter(f => f.endsWith('.tsx'))
    .map(f => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
  for (const ghost of ['FILTER_AVAIL', 'availMatches', 'ხელმისაწვდომობა', 'ნებისმიერ დროს']) {
    assert.ok(!src.includes(ghost), `app/tutors still references ${ghost}`)
  }
  // …and the Filters type no longer carries the field, so a stale `?avail=`
  // bookmark is simply ignored instead of half-applying.
  assert.doesNotMatch(read('app/tutors/_filters.tsx'), /^\s*available: string\[\]/m)
})

test('every offered option still carries its own count', () => {
  // The honesty this file inherits: a chip that says „(3)" and hands back two
  // cards is the failure the shared `passesFilters` predicate exists to stop.
  // Both surfaces — the desktop dropdowns and the phone drawer — must pass one.
  for (const f of ['app/tutors/_hero.tsx', 'app/tutors/_filters.tsx']) {
    assert.match(read(f), /count=\{facets\.langs\[l\.l\] \?\? 0\}/, `${f}: language options lost their counts`)
  }
  assert.ok(FILTER_LANGS.length >= 2 && FILTER_RATINGS.length >= 2)
})

/* ═══════════ the default order ═════════════════════════════════════════ */

test('the default sort is newest-first, and the URL says so by staying silent', () => {
  // Owner, 2026-08-12: new experts should lead. The two places that decide it
  // MUST agree — when they disagreed once before, the default was written into
  // every URL as if the visitor had chosen it, so every shared link carried a
  // `?sort=` the sender never picked.
  const src = read('app/tutors/client.tsx')
  assert.match(src, /params\?\.get\('sort'\) \?\? 'new'/, 'the default sort is not newest-first')
  assert.match(src, /if \(sort !== 'new'\) url\.set\('sort', sort\)/,
    'the URL-sync default disagrees with the useState default')
})

test('a free-text search still ranks by relevance, not by date', () => {
  // The guard that makes newest-first safe as a DEFAULT. The server has already
  // ordered a search by trigram relevance (lib/tutorsQuery) — Georgian declines
  // heavily, so that ranking is the whole reason the search works at all.
  // Re-sorting it by createdAt would push the best match onto page 3.
  // An EXPLICIT ?sort=new still wins; only the default defers.
  assert.match(
    read('app/tutors/client.tsx'),
    /case 'new':\s*if \(!rankedByRelevance\)/,
    'newest-first no longer defers to search relevance',
  )
})
