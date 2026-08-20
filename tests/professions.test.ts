/*
 * The profession taxonomy — lib/professions.ts.
 *
 * Run: npx tsx --test tests/professions.test.ts
 *
 * This is the owner's list (კატეგორიები.docx, 2026-08-11) and it is DATA, so
 * most of what can go wrong with it is structural rather than a matter of
 * taste: a job listed under two spheres, a slug that no category answers to, a
 * name that drifted out of the Georgian conventions the rest of the copy keeps.
 * Those are the things pinned here.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFESSIONS, ALL_PROFESSIONS, MAX_PROFESSIONS,
  sphereOfProfession, sphereOfProfessions,
} from '../lib/professions'

test('the shape of the list the owner supplied', () => {
  // ⚠️ 19 AND 93 SINCE 2026-08-20 (docs/TAXONOMY-AUDIT §P4, §P6). `design` and
  // `career` became spheres of their own — both were topic GROUPS with no
  // category, so a client could ask for them and the catalogue had nobody to
  // show — and three names that sell nothing left the list („მეწარმე",
  // „სტრატეგი", „ჟურნალისტი"). Net: +2 spheres, −3 professions.
  // ⚠️ 21 AND 99 SINCE ტალღა 1 (2026-08-20): `remonti` and `dalageba` are the
  // owner's own launch categories and the first SERVICE spheres this file has
  // ever held — until today every one of its 93 names was a consultant, which
  // is what „the taxonomy is still the old site" meant in CLAUDE.md.
  // 20, not 21: the household sphere („დალაგება და გადაზიდვა") was written and
  // removed the same afternoon — owner, 2026-08-20: „saqofacxovrebo არ გვინდა".
  // lib/launchTaxonomy carries the reasoning, including why the REQUESTS
  // vocabulary keeps `cleaning`/`moving`: a launch category and an intake
  // vocabulary are two different surfaces.
  assert.equal(Object.keys(PROFESSIONS).length, 20, '20 spheres')
  assert.equal(ALL_PROFESSIONS.length, 97, '97 professions')
  // ⚠️ AND THE THREE DO NOT COME BACK. „მეწარმე" is an identity, not something
  // anybody can buy — the exact fault that retired „ხელოსანი".
  for (const banned of ['მეწარმე', 'სტრატეგი', 'ჟურნალისტი']) {
    assert.ok(!ALL_PROFESSIONS.some(p => p.job === banned), `„${banned}" is on offer again — it sells nothing`)
  }
  // Every sphere has at least two — one profession is not a category, it is
  // the sphere under another name.
  for (const [slug, jobs] of Object.entries(PROFESSIONS)) {
    assert.ok(jobs.length >= 2, `${slug} has ${jobs.length} profession(s)`)
  }
})

test('a profession belongs to exactly ONE sphere', () => {
  // `sphereOfProfession` resolves by name, so a duplicate would silently file
  // people under whichever sphere happens to come first in the object.
  const seen = new Map<string, string>()
  for (const { job, slug } of ALL_PROFESSIONS) {
    const prev = seen.get(job)
    assert.equal(prev, undefined, `„${job}" is in both ${prev} and ${slug}`)
    seen.set(job, slug)
  }
})

test('every key is a category SLUG, not a name', () => {
  // Keyed by slug on purpose: a sphere's NAME is copy the admin renames
  // („ტექნოლოგია და პროდუქტი" → „IT და ტექნოლოგიები" on the day this landed).
  for (const slug of Object.keys(PROFESSIONS)) {
    assert.match(slug, /^[a-z][a-z0-9-]*$/, `${slug} is not a slug`)
  }
})

test('the sphere is read off the FIRST profession', () => {
  assert.equal(sphereOfProfession('მარკეტოლოგი'), 'marketing')
  assert.equal(sphereOfProfession('ბუღალტერი'), 'tax')
  assert.equal(sphereOfProfession('ადვოკატი'), 'law')
  // The owner's own example: one person, three professions, one sphere.
  assert.equal(
    sphereOfProfessions(['მარკეტოლოგი', 'გრაფიკული დიზაინერი', 'რეკლამის სპეციალისტი']),
    'marketing',
  )
  // Across spheres the FIRST wins — the answer they led with.
  assert.equal(sphereOfProfessions(['ბუღალტერი', 'მარკეტოლოგი']), 'tax')
  assert.equal(sphereOfProfessions(['მარკეტოლოგი', 'ბუღალტერი']), 'marketing')
})

test('an unknown profession resolves to nothing, never to a guess', () => {
  assert.equal(sphereOfProfession('ასტროლოგი'), undefined)
  assert.equal(sphereOfProfessions([]), undefined)
  assert.equal(sphereOfProfessions(['ასტროლოგი']), undefined)
  // …but a known one further down the list still answers.
  assert.equal(sphereOfProfessions(['ასტროლოგი', 'ადვოკატი']), 'law')
})

test('every profession is Georgian and short enough to render', () => {
  for (const { job } of ALL_PROFESSIONS) {
    assert.ok(job.trim() === job, `„${job}" has stray whitespace`)
    // Chips truncate; a job title longer than this is a sentence.
    assert.ok(job.length <= 44, `„${job}" is ${job.length} chars`)
    // Latin-only entries would be a transcription slip. „HR-მენეჯერი",
    // „SEO სპეციალისტი" and „UX/UI დიზაინერი" are legitimately mixed.
    assert.match(job, /[Ⴀ-ჿ]/, `„${job}" has no Georgian letters`)
  }
})

test('the cap is a number a profile can actually show', () => {
  assert.ok(MAX_PROFESSIONS >= 2 && MAX_PROFESSIONS <= 6)
})
