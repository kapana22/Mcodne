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
  return candidate.id !== target.id && candidate.status !== 'REDIRECTED' && !candidate.parentId
}
