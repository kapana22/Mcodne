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
export type TreeChange = {
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

export type TreeErrorCode = keyof typeof TREE_ERROR

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
