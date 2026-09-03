/*
 * The category hierarchy rules — lib/categoryTree.ts.
 *
 * Run: npx tsx --test tests/categoryTree.test.ts
 *
 * These assertions are the redirect contract in test form. The migration
 * (2026-08-10-category-hierarchy) ends with two RAISE EXCEPTION blocks stating
 * the same two things — no REDIRECTED row without a parent, no parent that is
 * itself REDIRECTED — because a chained 301 is how an old URL loses the history
 * this whole change exists to keep. The migration guards the data once, at
 * migration time; this file guards the admin screen, which can re-create the
 * problem any day afterwards.
 *
 * If a future change makes the tree deeper than one level, these fail first and
 * name what else has to move: the redirect resolver and the aggregate count.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hierarchyError, canBeParent, foldCounts, strandedBy, BROWSABLE_CATEGORY_SQL, TREE_ERROR,
  isAssignable, resolveCategoryByName, ASSIGNABLE_CATEGORY_WHERE, CATEGORY_READ_ORDER, sphereToReveal,
} from '../lib/categoryTree'
import type { TreeNode, TreeTarget } from '../lib/categoryTree'

const node = (id: string, over: Partial<TreeNode> = {}): TreeNode =>
  ({ id, status: 'VISIBLE', parentId: null, ...over })
const target = (id: string, over: Partial<TreeTarget> = {}): TreeTarget =>
  ({ id, status: 'VISIBLE', parentId: null, childCount: 0, ...over })

test('the ordinary moves are allowed', () => {
  // hide a sphere
  assert.equal(hierarchyError(target('a'), { status: 'HIDDEN' }, null), null)
  // give it a parent
  assert.equal(hierarchyError(target('a'), { parentId: 'b' }, node('b')), null)
  // parent + redirect in one PATCH, which is how the admin screen sends it
  assert.equal(hierarchyError(target('a'), { status: 'REDIRECTED', parentId: 'b' }, node('b')), null)
  // clear the parent while going back to visible
  assert.equal(hierarchyError(target('a', { status: 'REDIRECTED', parentId: 'b' }), { status: 'VISIBLE', parentId: null }, null), null)
})

test('a category cannot be its own parent', () => {
  assert.equal(hierarchyError(target('a'), { parentId: 'a' }, node('a')), 'SELF_PARENT')
})

test('the parent has to exist and has to be the one asked for', () => {
  assert.equal(hierarchyError(target('a'), { parentId: 'b' }, null), 'PARENT_NOT_FOUND')
  assert.equal(hierarchyError(target('a'), { parentId: 'b' }, node('c')), 'PARENT_NOT_FOUND')
})

test('a redirect into a HIDDEN sphere is refused', () => {
  // The quiet failure, and the reason it is a rule rather than a warning:
  // nothing 404s and nothing errors — the child's experts are just browsable
  // from nowhere and counted under nothing. „კადრები" pointed at the hidden
  // „კარიერა" in the first draft of the migration; this is what caught it.
  assert.equal(
    hierarchyError(target('a'), { status: 'REDIRECTED', parentId: 'b' }, node('b', { status: 'HIDDEN' })),
    'PARENT_IS_HIDDEN',
  )
  assert.equal(hierarchyError(target('a'), { parentId: 'b' }, node('b', { status: 'HIDDEN' })), 'PARENT_IS_HIDDEN')
})

test('hiding a sphere names what it takes down with it', () => {
  const cats: TreeNode[] = [
    { id: 'sphere', status: 'VISIBLE', parentId: null },
    { id: 'absorbed', status: 'REDIRECTED', parentId: 'sphere' },
    { id: 'elsewhere', status: 'REDIRECTED', parentId: 'other' },
  ]
  assert.deepEqual(strandedBy(cats, { id: 'sphere' }, 'HIDDEN'), ['absorbed'])
  // Coming back into view strands nobody.
  assert.deepEqual(strandedBy(cats, { id: 'sphere' }, 'VISIBLE'), [])
})

test('no redirect chains — from either side', () => {
  // the parent is itself pointed elsewhere
  assert.equal(
    hierarchyError(target('a'), { parentId: 'b' }, node('b', { status: 'REDIRECTED', parentId: 'c' })),
    'PARENT_IS_REDIRECTED',
  )
  // the parent is somebody's child, so this would be a third level
  assert.equal(
    hierarchyError(target('a'), { parentId: 'b' }, node('b', { parentId: 'c' })),
    'PARENT_HAS_PARENT',
  )
})

test('a row with children can neither gain a parent nor start redirecting', () => {
  const withKids = target('a', { childCount: 2 })
  assert.equal(hierarchyError(withKids, { parentId: 'b' }, node('b')), 'HAS_CHILDREN')
  assert.equal(hierarchyError(withKids, { status: 'REDIRECTED', parentId: 'b' }, node('b')), 'HAS_CHILDREN')
})

test('REDIRECTED without a parent is a dead end and is refused', () => {
  assert.equal(hierarchyError(target('a'), { status: 'REDIRECTED' }, null), 'REDIRECT_NEEDS_PARENT')
  // …including the sideways version: keep the status, drop the parent
  assert.equal(
    hierarchyError(target('a', { status: 'REDIRECTED', parentId: 'b' }), { parentId: null }, null),
    'REDIRECT_NEEDS_PARENT',
  )
})

test('the parent picker offers exactly what the rules would accept', () => {
  const me = { id: 'a' }
  assert.equal(canBeParent(node('a'), me), false)                                   // self
  assert.equal(canBeParent(node('b'), me), true)                                    // a plain sphere
  // A HIDDEN sphere is NOT offered: a child under it is browsable from nowhere.
  assert.equal(canBeParent(node('b', { status: 'HIDDEN' }), me), false)
  assert.equal(canBeParent(node('b', { status: 'REDIRECTED', parentId: 'c' }), me), false)
  assert.equal(canBeParent(node('b', { parentId: 'c' }), me), false)                // already a child
})

/* ── counting ──────────────────────────────────────────────────────────
 * The real shape from the 2026-08-10 migration: „ბიზნესი და ფინანსები" is
 * VISIBLE, „ფინანსები" redirects into it, „კარიერა" is HIDDEN and „HR"
 * redirects into that hidden sphere. */
const CATS: TreeNode[] = [
  { id: 'business', status: 'VISIBLE', parentId: null },
  { id: 'finance', status: 'REDIRECTED', parentId: 'business' },
  { id: 'career', status: 'HIDDEN', parentId: null },
  { id: 'hr', status: 'REDIRECTED', parentId: 'career' },
]

test('a sphere counts its own experts plus the ones folded into it', () => {
  const counts = foldCounts(CATS, [
    { categoryId: 'business', count: 5 },
    { categoryId: 'finance', count: 2 },
  ])
  // 5 + 2, on the sphere. This is THE number that made the collapse safe: with
  // status alone, finance's 2 experts left the site the day the migration ran.
  assert.equal(counts.get('business'), 7)
  assert.equal(counts.get('finance'), undefined)
})

test('nothing is counted into a hidden sphere, from either side', () => {
  const counts = foldCounts(CATS, [
    { categoryId: 'career', count: 3 },
    { categoryId: 'hr', count: 4 },
  ])
  assert.equal(counts.get('career'), undefined)
  assert.equal(counts.get('hr'), undefined)
})

test('counts survive the rows a taxonomy gap produces', () => {
  const counts = foldCounts(CATS, [
    { categoryId: null, count: 9 },        // no category at all
    { categoryId: 'deleted-id', count: 6 }, // a row the list no longer holds
    { categoryId: 'business', count: 1 },
  ])
  assert.equal(counts.get('business'), 1)
  assert.equal(counts.size, 1)
})

test('the SQL rule says the same three things as the Prisma one', () => {
  // Not a string-equality test — a check that no clause silently went missing,
  // because a search that disagrees with the browse list is invisible until a
  // real expert is missing from one of them.
  assert.match(BROWSABLE_CATEGORY_SQL, /tp\."categoryId" IS NULL/)
  assert.match(BROWSABLE_CATEGORY_SQL, /c\."status" = 'VISIBLE'/)
  assert.match(BROWSABLE_CATEGORY_SQL, /c\."status" = 'REDIRECTED'[\s\S]*cp\."status" = 'VISIBLE'/)
  // It is spliced raw, so it must never carry anything interpolable.
  assert.ok(!BROWSABLE_CATEGORY_SQL.includes('${'), 'raw SQL must be a literal')
})

test('every code has a sentence', () => {
  for (const [code, sentence] of Object.entries(TREE_ERROR)) {
    assert.ok(sentence.length > 0, `${code} has no message`)
    assert.match(sentence, /[Ⴀ-ჿᲐ-Ჿ]/, `${code} is not in Georgian`)
  }
})

/* ═══════════ §A — where an expert may be FILED ═══════════════════════════
 *
 * Three screens ask this: approval, the admin's expert drawer and the expert's
 * own editor. Before 2026-08-11 they answered it three different ways, and one
 * of the answers („VISIBLE only", in PATCH /api/me/tutor) was narrower than the
 * <select> that fed it — so 7 of 15 categories 400'd and took the whole profile
 * save with them. These pin the shared rule so they cannot drift apart again. */

const SLUGGED = (id: string, slug: string, over: Partial<TreeNode> = {}) =>
  ({ id, slug, status: 'VISIBLE' as const, parentId: null, ...over })

test('§A a VISIBLE sphere and a REDIRECTED sub-field are both assignable', () => {
  const business = SLUGGED('business', 'business')
  const finance = SLUGGED('finance', 'finance', { status: 'REDIRECTED', parentId: 'business' })
  const all = [business, finance]
  assert.equal(isAssignable(business, all), true)
  // THE REGRESSION THIS EXISTS FOR: the editor offers this row, so the API has
  // to accept it. Every sub-field in the picker is REDIRECTED by construction
  // (/api/categories builds `children` from exactly that status).
  assert.equal(isAssignable(finance, all), true)
})

test('§A a HIDDEN SPHERE is assignable — somebody has to go first', () => {
  // „კარიერა" is hidden because it has no expert yet. If nobody may be filed
  // there it stays empty for the reason it was hidden. Approval un-hides it.
  const career = SLUGGED('career', 'career', { status: 'HIDDEN' })
  assert.equal(isAssignable(career, [career]), true)
})

test('§A a sub-field under a sphere that went dark stays offerable', () => {
  // REVERSED 2026-08-11, deliberately. This asserted the opposite for half a
  // day: a sub-field of a hidden sphere was refused, on the reasoning that its
  // experts would be browsable from nowhere. The reasoning was right about
  // stranding and wrong about the remedy — refusing the ANSWER instead of
  // repairing the SPHERE made nine spheres' worth of sub-fields unreachable.
  // Filing somebody here now reveals the sphere in the same request, so the
  // stranded state the old rule feared cannot occur (see sphereToReveal).
  const career = SLUGGED('career', 'career', { status: 'HIDDEN' })
  const hr = SLUGGED('hr', 'hr', { status: 'REDIRECTED', parentId: 'career' })
  assert.equal(isAssignable(hr, [career, hr]), true)
  assert.equal(sphereToReveal(hr, [career, hr])?.id, 'career')
})

// ⚠️ „§A the /abroad marker can never be assigned" WAS HERE (deleted 2026-09-03).
// It pinned that `diaspora` sat in `NEVER_ASSIGNABLE_SLUGS`, which mattered
// while filing an expert into that hidden row would have deleted them from the
// catalogue. /abroad went on 2026-09-03 and the `diaspora` Category had never
// existed in the database, so the assertion pinned a slug against a row nobody
// could pick. The MECHANISM survives — `NEVER_ASSIGNABLE_SLUGS` is empty, not
// gone — and the day it has a member again, that member gets this test back.

test('§A the candidate read order can never tie', () => {
  // The resolver SCANS its candidate list, so an unordered findMany made the
  // same application resolve differently after a VACUUM. `slug` is unique.
  assert.deepEqual(CATEGORY_READ_ORDER.map(o => Object.keys(o)[0]), ['order', 'slug'])
})

/* ═══════════ §M — specialty → category ══════════════════════════════════
 *
 * `TutorApplication` has no categoryId: the answer arrives as the NAME the
 * applicant tapped. This resolution used to exist twice — once in the approve
 * route, once in the moderation panel — with different rules, so the dropdown
 * regularly disagreed with the button under it. */

const LIVE = [
  { id: 'business', slug: 'business', name: 'ბიზნესი და სტრატეგია' },
  { id: 'tax', slug: 'tax', name: 'ფინანსები და გადასახადები' },
  { id: 'finance', slug: 'finance', name: 'ფინანსები' },
  { id: 'law', slug: 'law', name: 'სამართალი' },
  { id: 'marketing', slug: 'marketing', name: 'მარკეტინგი და გაყიდვები' },
  { id: 'sales', slug: 'sales', name: 'გაყიდვები' },
  { id: 'it', slug: 'it', name: 'ტექნოლოგია და პროდუქტი' },
  { id: 'product', slug: 'product', name: 'პროდუქტი' },
  { id: 'psychology', slug: 'psychology', name: 'ფსიქოლოგია' },
]

test('§M the chip the applicant tapped resolves to itself', () => {
  assert.equal(resolveCategoryByName('ფსიქოლოგია', LIVE)?.id, 'psychology')
  // A sub-field beats the sphere that contains its name — answering precisely
  // must never be the answer that gets filed less precisely.
  assert.equal(resolveCategoryByName('ფინანსები', LIVE)?.id, 'finance')
  assert.equal(resolveCategoryByName('გაყიდვები', LIVE)?.id, 'sales')
})

test('§M a Latin term resolves through the SLUG, as a whole word', () => {
  // Real live data: 2 approved experts carry `specialty` = „IT". The name that
  // used to catch them („IT და პროგრამირება") was renamed away on 2026-08-10,
  // and the failure mode is an approved expert filed under nothing.
  assert.equal(resolveCategoryByName('IT', LIVE)?.id, 'it')
  // …but never as a substring: `it` inside „digital" would file a marketer as
  // a programmer.
  assert.equal(resolveCategoryByName('digital', LIVE), undefined)
})

test('§M an answer given before a rename still lands', () => {
  // 9 of 22 live rows carry the pre-2026-08-10 names.
  assert.equal(resolveCategoryByName('მარკეტინგი', LIVE)?.id, 'marketing')
  assert.equal(resolveCategoryByName('გადასახადები', LIVE)?.id, 'tax')
  // Declined / compounded — the first-word arm, which is why it exists.
  assert.equal(resolveCategoryByName('ბიზნეს-სტრატეგია', LIVE)?.id, 'business')
})

test('§M the stem arm no longer files a producer under „პროდუქტი"', () => {
  // THE BUG: the old arm compared the category name's first FOUR characters
  // against the whole specialty. „პროდ" is the shared stem of „პროდუქტი" and
  // „პროდიუსერი", so a producer was filed as a product manager — silently,
  // and with the row chosen by Postgres' physical order when more than one hit.
  assert.equal(resolveCategoryByName('პროდიუსერი', LIVE), undefined)
  // A genuine niche resolves to NOTHING rather than to a guess: that puts the
  // decision in the moderator's dropdown, which is the only place it belongs.
  assert.equal(resolveCategoryByName('ბუღალტერია', LIVE), undefined)
  assert.equal(resolveCategoryByName('ინგლისური ენა', LIVE), undefined)
})

test('§M the answer never depends on the order of the candidate list', () => {
  // The whole point: the approve route reads its candidates from the database
  // and the panel reads them from an API. Same input, same row, either way.
  const shuffled = [...LIVE].reverse()
  for (const sp of ['ფინანსები', 'IT', 'ბიზნეს-სტრატეგია', 'მარკეტინგი', 'გადასახადები', 'ბუღალტერია']) {
    assert.equal(
      resolveCategoryByName(sp, LIVE)?.id ?? null,
      resolveCategoryByName(sp, shuffled)?.id ?? null,
      `„${sp}" resolved differently after reordering the candidates`,
    )
  }
})

test('§M nothing in, nothing out', () => {
  assert.equal(resolveCategoryByName('', LIVE), undefined)
  assert.equal(resolveCategoryByName('ა', LIVE), undefined)
  assert.equal(resolveCategoryByName('ფსიქოლოგია', []), undefined)
})

test('§A a sub-field of a HIDDEN sphere IS assignable — and reveals its sphere', () => {
  // The nine spheres opened on 2026-08-11 arrived HIDDEN with sub-fields under
  // them. Refusing those sub-fields (the first attempt) made every one of them
  // unreachable: a dietician searching „დიეტ" on /apply found nothing and had
  // to work out that the answer was „ჯანმრთელობა და კვება". Precision is the
  // thing this taxonomy exists to allow, so the rule moved instead.
  const health = SLUGGED('health', 'health', { status: 'HIDDEN' })
  const nutrition = SLUGGED('nutrition', 'nutrition', { status: 'REDIRECTED', parentId: 'health' })
  const all = [health, nutrition]
  assert.equal(isAssignable(health, all), true)
  assert.equal(isAssignable(nutrition, all), true)

  // Nobody is stranded, because filing here reveals the SPHERE — not the
  // sub-field, which is browsed through it.
  assert.equal(sphereToReveal(nutrition, all)?.id, 'health')
  assert.equal(sphereToReveal(health, all)?.id, 'health')
})

test('§A nothing is revealed when the sphere is already visible', () => {
  const marketing = SLUGGED('marketing', 'marketing')
  const sales = SLUGGED('sales', 'sales', { status: 'REDIRECTED', parentId: 'marketing' })
  assert.equal(sphereToReveal(sales, [marketing, sales]), undefined)
  assert.equal(sphereToReveal(marketing, [marketing, sales]), undefined)
  assert.equal(sphereToReveal(undefined, [marketing]), undefined)
})

test('§A a sub-field can never hang off another sub-field', () => {
  // One level only — a redirect must resolve in a single hop.
  const marketing = SLUGGED('marketing', 'marketing')
  const sales = SLUGGED('sales', 'sales', { status: 'REDIRECTED', parentId: 'marketing' })
  const deeper = SLUGGED('deeper', 'deeper', { status: 'REDIRECTED', parentId: 'sales' })
  assert.equal(isAssignable(deeper, [marketing, sales, deeper]), false)
})
