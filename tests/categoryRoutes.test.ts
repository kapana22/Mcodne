/*
 * Where a category's URL points — lib/categoryRoutes.ts.
 *
 * Run: npx tsx --test tests/categoryRoutes.test.ts
 *
 * STAGE 8 (2026-08-19, §8.7): /categories/* was retired. The property worth
 * pinning is still the same one — whatever a category's state, `categoryPath`
 * returns a URL some route answers with a 200, never another redirect and
 * never `/categories/undefined` — but the answer is now ONE shape: the
 * catalogue filtered to the category's own slug. The middleware 308s every old
 * /categories address to exactly that (tests/taxonomy.test.ts), so a link
 * built here and a redirect from the old world land on the same page.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { categoryPath, CATEGORY_BROWSE_PATH } from '../lib/categoryRoutes'

/** The 2026-08-10 structure, as the migration writes it. */
const REDIRECTED_TO = {
  finance: 'business',
  sales: 'marketing',
  product: 'it',
  design: 'it',
  crypto: 'tax',
  hr: 'career',
  advokati: 'law',
} as const

test('a sphere resolves to the catalogue filtered to itself, visible or hidden', () => {
  assert.equal(categoryPath({ slug: 'business', status: 'VISIBLE', parent: null }), '/experts?category=business')
  assert.equal(categoryPath({ slug: 'career', status: 'HIDDEN', parent: null }), '/experts?category=career')
  assert.equal(CATEGORY_BROWSE_PATH, '/experts')
})

test('an absorbed category keeps its OWN slug — the filter accepts it through its sphere', () => {
  // lib/categoryTree → categorySlugFilter lists a REDIRECTED slug's experts via
  // the VISIBLE parent, so „finance" keeps returning people. Sending it to the
  // parent would silently widen a bookmark to the whole sphere.
  for (const [child, parent] of Object.entries(REDIRECTED_TO)) {
    assert.equal(
      categoryPath({ slug: child, status: 'REDIRECTED', parent: { slug: parent } }),
      `/experts?category=${child}`,
    )
  }
})

test('never /categories, never undefined, never a redirecting address', () => {
  const path = categoryPath({ slug: 'orphan', status: 'REDIRECTED', parent: null })
  assert.equal(path, '/experts?category=orphan')
  assert.ok(!path.includes('undefined'))
  assert.ok(!path.startsWith('/categories'))
  // The slug is URL-encoded — a hand-typed slug with a space cannot break the query.
  assert.equal(categoryPath({ slug: 'a b', status: 'VISIBLE', parent: null }), '/experts?category=a%20b')
})

test('a nested page never points at a parent that is itself absorbed', () => {
  // One level, restated: if a sphere in the map were also a child, the
  // migration's structure would be a chain.
  for (const parent of Object.values(REDIRECTED_TO)) {
    assert.ok(!(parent in REDIRECTED_TO), `„${parent}" is both a sphere and an absorbed category`)
  }
})
