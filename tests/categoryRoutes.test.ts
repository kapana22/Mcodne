/*
 * Where a category's URL points — lib/categoryRoutes.ts.
 *
 * Run: npx tsx --test tests/categoryRoutes.test.ts
 *
 * A 301 is a promise about a URL forever, so the thing worth pinning is not the
 * strings but the PROPERTY: whatever a category's state, `categoryPath` returns
 * a URL that some route actually answers with a 200 — never another redirect,
 * never a page that does not exist. Two of the three ways to get that wrong are
 * silent (a nested path under a sphere that has no such child; a nested path
 * for a category with no copy, which the nested route then bounces again), and
 * both only show up as a redirect chain in a crawl weeks later.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { categoryPath, keepsOwnPage } from '../lib/categoryRoutes'
import { categorySeo } from '../lib/categorySeo'

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

test('a sphere answers at its own flat URL, visible or hidden', () => {
  assert.equal(categoryPath({ slug: 'business', status: 'VISIBLE', parent: null }), '/categories/business')
  // HIDDEN keeps its page — it is unadvertised, not deleted.
  assert.equal(categoryPath({ slug: 'career', status: 'HIDDEN', parent: null }), '/categories/career')
})

test('an absorbed category with its own copy gets a page under its sphere', () => {
  assert.equal(
    categoryPath({ slug: 'finance', status: 'REDIRECTED', parent: { slug: 'business' } }),
    '/categories/business/finance',
  )
})

test('an absorbed category with NO copy goes straight to the sphere', () => {
  // „advokati" has no entry in lib/categorySeo. A nested page for it would hold
  // a heading and nothing else, which is worse than no page at all.
  assert.equal(keepsOwnPage('advokati'), false)
  assert.equal(
    categoryPath({ slug: 'advokati', status: 'REDIRECTED', parent: { slug: 'law' } }),
    '/categories/law',
  )
})

test('a REDIRECTED row with no parent still resolves somewhere real', () => {
  // lib/categoryTree refuses to save this and the migration refuses to commit
  // it, so it should not exist — but a redirect helper that can return
  // `/categories/undefined` is one bad row away from a crawl of 404s.
  const path = categoryPath({ slug: 'orphan', status: 'REDIRECTED', parent: null })
  assert.equal(path, '/categories/orphan')
  assert.ok(!path.includes('undefined'))
})

test('every absorbed category in the migration lands on a page that exists', () => {
  for (const [child, parent] of Object.entries(REDIRECTED_TO)) {
    const path = categoryPath({ slug: child, status: 'REDIRECTED', parent: { slug: parent } })
    const parts = path.split('/').filter(Boolean)
    assert.equal(parts[0], 'categories')
    if (parts.length === 3) {
      // A nested page is only answered when the copy is there AND the parent in
      // the URL is the real one — the nested route re-checks both and would
      // bounce otherwise, which is the chain this asserts away.
      assert.ok(keepsOwnPage(child), `${child} has a nested path but no copy`)
      assert.equal(parts[1], parent)
      assert.equal(parts[2], child)
    } else {
      assert.equal(parts.length, 2, `${path} is neither a sphere URL nor a nested one`)
      assert.equal(parts[1], parent)
      assert.ok(!keepsOwnPage(child), `${child} has copy but was sent to its parent anyway`)
    }
  }
})

test('a nested page never points at a parent that is itself absorbed', () => {
  // One level, restated at the routing layer: if a sphere in the map were also
  // a child, its own URL would be a redirect and every nested path under it
  // would be a chain.
  for (const parent of Object.values(REDIRECTED_TO)) {
    assert.ok(!(parent in REDIRECTED_TO), `„${parent}" is both a sphere and an absorbed category`)
  }
})

test('the copy the nested pages exist to keep is actually there', () => {
  // The whole reason a nested page beats a plain 301: this copy is the only
  // thing on the site targeting that search. If an entry is ever deleted, the
  // page silently falls back to fallbackSeo and the words are gone — this fails
  // first and says so.
  for (const child of Object.keys(REDIRECTED_TO)) {
    if (!keepsOwnPage(child)) continue
    const seo = categorySeo[child]
    assert.ok(seo.intro.length > 40, `${child}: the intro is too thin to keep a page for`)
    assert.ok(seo.faq.length > 0, `${child}: no FAQ, so the FAQPage markup would be empty`)
  }
})
