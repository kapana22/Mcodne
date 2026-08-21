/**
 * THE category hierarchy rules — one source, shared by the admin API and the
 * admin UI, and mirrored by the guard blocks at the end of the migration
 * (prisma/manual-migrations/2026-08-10-category-hierarchy/up.sql).
 *
 * The shape is deliberately ONE LEVEL DEEP. A category is either a sphere or a
 * child of a sphere; never a grandchild. Everything downstream depends on that:
 *
 *   - a REDIRECTED category 301s to its parent, so a REDIRECTED parent would
 *     chain 301s — search engines drop the second hop and the old URL loses its
 *     history, which is exactly what this whole change exists to avoid
 *   - the parent counts its children's experts, and a fixed depth means that
 *     count is one query, not a recursive walk
 *
 * So the rules below are not style: each one is the thing that keeps a redirect
 * resolvable in a single step. The database enforces the same invariants at
 * migration time; this file is what stops an admin re-creating the problem by
 * hand afterwards.
 *
 * Pinned by tests/categoryTree.test.ts.
 */
import { ABROAD_CATEGORY_SLUG } from './abroad'

export type CategoryStatus = 'VISIBLE' | 'HIDDEN' | 'REDIRECTED'

/** The minimum an invariant check needs to know about a row. */
export type TreeNode = {
  id: string
  status: CategoryStatus
  parentId: string | null
}

/** The row being edited, plus how many children currently hang off it. */
export type TreeTarget = TreeNode & { childCount: number }

/** What the PATCH is asking for. Absent = unchanged. */
type TreeChange = {
  status?: CategoryStatus
  /** `null` clears the parent; `undefined` leaves it alone. */
  parentId?: string | null
}

/**
 * Every refusal, as the sentence the admin reads. Codes stay stable across copy
 * rewrites so the API can send one and the UI can show it without a second
 * mapping table.
 */
export const TREE_ERROR = {
  SELF_PARENT: 'კატეგორია საკუთარი თავის ქვეშ ვერ იქნება.',
  PARENT_NOT_FOUND: 'მშობელი კატეგორია ვერ მოიძებნა.',
  PARENT_IS_REDIRECTED: 'მშობელი თვითონ გადამისამართებულია — აირჩიე სხვა.',
  PARENT_IS_HIDDEN: 'მშობელი დამალულია — მისი ექსპერტები ვერსად გამოჩნდება.',
  PARENT_HAS_PARENT: 'ეს კატეგორია სხვის ქვეშაა — მშობლად ვერ გამოდგება.',
  HAS_CHILDREN: 'ამ კატეგორიას ქვეკატეგორიები ჰყავს — ჯერ ისინი მოხსენი.',
  REDIRECT_NEEDS_PARENT: 'გადამისამართებას მშობელი კატეგორია სჭირდება.',
} as const

type TreeErrorCode = keyof typeof TREE_ERROR

/**
 * The one check. Returns a code, or null when the change is allowed.
 *
 * `parent` is the resolved row for the parent the change lands on — the caller
 * looks it up (the API from the database, the UI from the list it already
 * holds) and passes it in, so this function stays pure and testable.
 */
export function hierarchyError(
  target: TreeTarget,
  change: TreeChange,
  parent: TreeNode | null,
): TreeErrorCode | null {
  const nextParentId = change.parentId !== undefined ? change.parentId : target.parentId
  const nextStatus = change.status ?? target.status

  if (nextParentId) {
    if (nextParentId === target.id) return 'SELF_PARENT'
    if (!parent || parent.id !== nextParentId) return 'PARENT_NOT_FOUND'
    // Both of these are the same failure seen from two sides: a parent that is
    // itself pointed somewhere else cannot be the end of a redirect.
    if (parent.status === 'REDIRECTED') return 'PARENT_IS_REDIRECTED'
    if (parent.parentId) return 'PARENT_HAS_PARENT'
    // A hidden parent is the quiet version of the same failure. Nothing 404s,
    // nothing errors — the child's experts are simply browsable from nowhere
    // and counted under nothing. It is the one move in this panel that can
    // remove a real person from the site without saying so.
    if (parent.status !== 'VISIBLE') return 'PARENT_IS_HIDDEN'
    // Gaining a parent while having children would make this row a middle
    // level, which the depth rule does not allow.
    if (target.childCount > 0) return 'HAS_CHILDREN'
  }

  if (nextStatus === 'REDIRECTED') {
    if (!nextParentId) return 'REDIRECT_NEEDS_PARENT'
    // Its children would then redirect to a redirect.
    if (target.childCount > 0) return 'HAS_CHILDREN'
  }

  return null
}

/** Can this row be offered as a parent in a picker? Same rules, read forwards. */
export function canBeParent(candidate: TreeNode, target: { id: string }): boolean {
  return candidate.id !== target.id && candidate.status === 'VISIBLE' && !candidate.parentId
}

/**
 * Hiding a sphere takes its children's experts with it — they are browsable
 * only through it. The panel has to say so, with the real number, so this
 * returns the ids whose experts would go dark alongside the row being hidden.
 */
export function strandedBy(
  cats: readonly TreeNode[],
  target: { id: string },
  next: CategoryStatus,
): string[] {
  if (next === 'VISIBLE') return []
  return cats.filter(c => c.parentId === target.id && c.status === 'REDIRECTED').map(c => c.id)
}

/* ───────────────────── what the public may see ─────────────────────
 *
 * THE RULE, once: an expert is browsable when their category is VISIBLE, or
 * when it REDIRECTS into a VISIBLE sphere. The second half is not a nicety — it
 * is the whole reason the hierarchy exists. Collapsing „ფინანსები" into
 * „ბიზნესი და ფინანსები" by status alone would have taken its experts off the
 * site the moment the migration ran; they surface under the parent instead.
 *
 * HIDDEN still hides, in both directions — a hidden sphere and anything
 * redirecting into one. That is a deliberate admin action, confirmed in the
 * panel with the expert count it affects.
 *
 * Both forms below say the same thing, because the app asks the question in two
 * languages: Prisma for the browse list, raw SQL for the trigram search and the
 * stats aggregates. When they disagree, a search surfaces someone the list
 * hides — which is the bug lib/tutorsQuery already carries a comment about. */

/** Prisma: a category an expert may be browsed through. */
export const BROWSABLE_CATEGORY = {
  OR: [
    { status: 'VISIBLE' as const },
    { status: 'REDIRECTED' as const, parent: { is: { status: 'VISIBLE' as const } } },
  ],
}

/**
 * Prisma: `?category=<slug>` — the sphere itself plus everything folded into
 * it. Takes one slug or a set of them (the /abroad landing names four).
 */
export function categorySlugFilter(slug: string | readonly string[]) {
  const match = typeof slug === 'string' ? { slug } : { slug: { in: [...slug] } }
  return {
    is: {
      OR: [
        // the named category itself, when it is browsable in its own right —
        // which an absorbed one still is, through its sphere. That is what
        // makes /categories/<sphere>/<absorbed> able to list its own experts,
        // and what keeps an old ?category=finance bookmark returning people
        // instead of an empty page.
        { AND: [match, BROWSABLE_CATEGORY] },
        // …plus everything folded into it.
        { status: 'REDIRECTED' as const, parent: { is: { ...match, status: 'VISIBLE' as const } } },
      ],
    },
  }
}

/**
 * SQL twin of BROWSABLE_CATEGORY, including the „no category at all" case.
 *
 * Written for the aliases the two raw queries already use — `tp` for
 * TutorProfile and `c` for its LEFT JOINed category — and as an EXISTS rather
 * than a second JOIN so it drops straight into an existing WHERE clause.
 *
 * A missing category must never hide an approved, available expert: that
 * taxonomy gap made real people invisible twice.
 */
export const BROWSABLE_CATEGORY_SQL = `(
           tp."categoryId" IS NULL
        OR c."status" = 'VISIBLE'
        OR (c."status" = 'REDIRECTED' AND EXISTS (
              SELECT 1 FROM "Category" cp WHERE cp."id" = c."parentId" AND cp."status" = 'VISIBLE'))
      )`

/**
 * Per-category expert counts, folded up into the sphere each one is browsed
 * under. A number shown next to a sphere has to match what tapping it returns,
 * so the folding rule is the visibility rule read from the other end.
 */
export function foldCounts(
  cats: readonly TreeNode[],
  raw: readonly { categoryId: string | null; count: number }[],
): Map<string, number> {
  const byId = new Map(cats.map(c => [c.id, c]))
  const out = new Map<string, number>()
  for (const { categoryId, count } of raw) {
    if (!categoryId) continue
    const cat = byId.get(categoryId)
    if (!cat) continue
    // A redirected category contributes to its parent, never to itself.
    const sphere = cat.status === 'REDIRECTED'
      ? (cat.parentId ? byId.get(cat.parentId) : undefined)
      : cat
    if (!sphere || sphere.status !== 'VISIBLE') continue
    out.set(sphere.id, (out.get(sphere.id) ?? 0) + count)
  }
  return out
}

/* ═══════════ where an expert may be FILED ════════════════════════════════
 *
 * BROWSABLE answers „can this expert be found through their category". This
 * answers a different question — „may an expert be PUT here" — and the two are
 * deliberately not the same set:
 *
 *   + a HIDDEN SPHERE is assignable. „კარიერა" is hidden precisely because it
 *     has no expert yet; if nobody may be filed there it stays empty for the
 *     reason it was hidden. Approval un-hides it the moment someone lands in
 *     it (see the approve route), so the hidden state is self-clearing.
 *   − the /abroad marker is NEVER assignable. lib/abroad.ts spells out why:
 *     it is a hidden marker row, and filing a real expert there deletes them
 *     from the catalogue instead of adding them to the diaspora page. The
 *     2026-08-10 migration protects it in SQL; before this constant the
 *     approve route's own candidate list („browsable OR hidden") let it back
 *     in through the one door nobody was watching.
 *   − a REDIRECTED category whose parent is not VISIBLE is not assignable
 *     either: its experts would be browsable from nowhere.
 *
 * Three surfaces ask this question — approval, the admin's expert drawer and
 * the expert's own profile editor — and before this they answered it three
 * different ways. The editor offered every REDIRECTED sub-field while
 * PATCH /api/me/tutor accepted only VISIBLE, so 7 of 15 categories returned
 * 400 and took the whole profile save down with them.
 */

/** The rows an expert may never be filed into. Read from lib/abroad rather than
 *  restated — a second copy of that slug is exactly how the marker would get
 *  protected in one place and left open in another. (No cycle: lib/abroad
 *  imports only lib/flags.) */
const NEVER_ASSIGNABLE_SLUGS = [ABROAD_CATEGORY_SLUG] as const

/** Prisma: every category an EXPERT may be filed into. Pair with
 *  `slug: { notIn: [...NEVER_ASSIGNABLE_SLUGS] }` — expressed separately so the
 *  caller can keep it in the same `where` without nesting another OR. */
export const ASSIGNABLE_CATEGORY = {
  OR: [
    { status: 'VISIBLE' as const },
    { status: 'HIDDEN' as const, parentId: null },
    // A sub-field of a sphere that is itself still waiting for its first
    // expert IS assignable (2026-08-11). The narrower rule — parent must
    // already be VISIBLE — was correct about stranding and wrong about people:
    // it made every sub-field of the nine newly-opened spheres unreachable, so
    // a dietician searching „დიეტ" on /apply found nothing and had to know to
    // answer „ჯანმრთელობა და კვება" instead. Being precise is the thing this
    // taxonomy exists to allow.
    //
    // It cannot strand anyone, because filing somebody here un-hides the PARENT
    // in the same request — the approve route and the admin re-file endpoint
    // both do it, exactly as they already did for a hidden sphere chosen
    // directly. The row is only ever under a hidden parent while it is empty.
    {
      status: 'REDIRECTED' as const,
      // Not `as const` on the array: Prisma's generated `in` filter wants a
      // mutable string[], and a readonly tuple is refused at the type level.
      parent: { is: { parentId: null, status: { in: ['VISIBLE', 'HIDDEN'] as ('VISIBLE' | 'HIDDEN')[] } } },
    },
  ],
}

/** Prisma: the whole rule, ready to drop into `category.findMany({ where })`. */
export const ASSIGNABLE_CATEGORY_WHERE = {
  ...ASSIGNABLE_CATEGORY,
  slug: { notIn: [...NEVER_ASSIGNABLE_SLUGS] },
}

/** Deterministic read order for any candidate list. `order` is the admin's own
 *  sequence and `slug` is unique, so this can never tie — which is the point:
 *  the resolver below scans the list, and an unordered `findMany` made the same
 *  application resolve differently after a VACUUM. */
export const CATEGORY_READ_ORDER = [{ order: 'asc' as const }, { slug: 'asc' as const }]

/** The client-side twin of ASSIGNABLE_CATEGORY_WHERE, for a list already
 *  fetched (the admin panel holds every row and filters in the browser). */
export function isAssignable(
  cat: TreeNode & { slug: string },
  all: readonly (TreeNode & { slug: string })[],
): boolean {
  if ((NEVER_ASSIGNABLE_SLUGS as readonly string[]).includes(cat.slug)) return false
  if (cat.status === 'VISIBLE') return true
  if (cat.status === 'HIDDEN') return !cat.parentId
  // A sub-field is assignable under any SPHERE, visible or still hidden — see
  // ASSIGNABLE_CATEGORY. What it may never hang off is another sub-field.
  return all.some(p => p.id === cat.parentId && !p.parentId && p.status !== 'REDIRECTED')
}

/**
 * The row whose visibility has to be repaired after filing an expert into
 * `cat` — or null when nothing needs repairing.
 *
 * A HIDDEN category is hidden because it has no expert yet. Putting one there
 * makes that false, so it comes back into view in the same request rather than
 * waiting for somebody to notice; leaving it hidden would publish an expert
 * nobody can find. For a sub-field the row to repair is its SPHERE, because
 * that is what the sub-field is browsed through.
 *
 * Shared by the approve route and the admin re-file endpoint so the two cannot
 * drift — they are the only two places an expert's category is ever set.
 */
export function sphereToReveal<T extends TreeNode>(
  cat: T | undefined,
  all: readonly T[],
): T | undefined {
  if (!cat) return undefined
  if (cat.status === 'HIDDEN' && !cat.parentId) return cat
  if (cat.status === 'REDIRECTED' && cat.parentId) {
    const parent = all.find(c => c.id === cat.parentId)
    if (parent?.status === 'HIDDEN') return parent
  }
  return undefined
}

/* ═══════════ specialty → category, ONCE ══════════════════════════════════
 *
 * `TutorApplication` has no categoryId — the applicant's answer arrives as the
 * NAME they tapped, in `specialty`, and approval has to turn that string back
 * into a row. That resolution existed in two places (the approve route and the
 * moderation panel's pre-selection) with two different rule sets, so the
 * dropdown regularly disagreed with what approval would actually do.
 *
 * It is one function now, and it is deterministic by construction: every arm
 * either matches exactly one row or returns nothing. „Nothing" is a legitimate
 * answer — it puts the choice in front of the moderator instead of guessing,
 * which is what the old 4-character-stem arm did when it filed a „პროდიუსერი"
 * under „პროდუქტი".
 *
 * Pinned by tests/categoryTree.test.ts §M.
 */

export type MatchableCategory = { id: string; slug: string; name: string }

const nrm = (s: string) => (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
/** First word, minus the punctuation Georgian compounds carry („ბიზნეს-"). */
const firstWord = (s: string) => nrm(s).split(/[\s,\/·—–-]+/)[0] ?? ''
const commonPrefix = (a: string, b: string) => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}
/** The slug as a WHOLE word, so `it` cannot match „digital". */
const slugHit = (slug: string, sp: string) =>
  new RegExp(`(^|[^a-z0-9])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(sp)

/** How many leading characters of two first words must agree for arm 4. Four
 *  was the old value and it is too loose in Georgian — „პროდ" is the whole of
 *  „პროდიუსერი"'s stem as well as „პროდუქტი"'s. */
const STEM_MIN = 5

export function resolveCategoryByName<T extends MatchableCategory>(
  specialty: string,
  cats: readonly T[],
): T | undefined {
  const sp = nrm(specialty)
  if (sp.length < 2 || cats.length === 0) return undefined

  // 1. the applicant tapped a chip and the name still reads the same.
  const exact = cats.filter(c => nrm(c.name) === sp)
  if (exact.length === 1) return exact[0]

  // 2. the Latin term they typed IS a slug („IT" → `it`). Whole word only.
  const bySlug = cats.filter(c => slugHit(c.slug, sp))
  if (bySlug.length === 1) return bySlug[0]

  // 3. one name contains the other — this is what carries an answer given
  //    before a rename („ბიზნესი" against „ბიზნესი და ფინანსები"). The LONGEST
  //    matching name wins, because it is the most specific reading of the same
  //    string; the slug breaks a tie so the result never depends on row order.
  const contains = cats
    .filter(c => { const n = nrm(c.name); return n.length >= 3 && (sp.includes(n) || n.includes(sp)) })
    .sort((a, b) => b.name.length - a.name.length || a.slug.localeCompare(b.slug))
  if (contains.length) return contains[0]

  // 4. same word, different ending — Georgian declines heavily and „ბიზნეს-
  //    სტრატეგია" has to reach „ბიზნესი". Compared on FIRST WORDS only, and
  //    only above STEM_MIN. An ambiguous result is refused, not guessed.
  const scored = cats
    .map(c => ({ c, n: commonPrefix(firstWord(c.name), firstWord(sp)) }))
    .filter(x => x.n >= STEM_MIN)
    .sort((a, b) => b.n - a.n || a.c.slug.localeCompare(b.c.slug))
  if (scored.length === 1) return scored[0].c
  if (scored.length > 1 && scored[0].n > scored[1].n) return scored[0].c

  return undefined
}
