/**
 * „X ექსპერტი" next to a sphere — computed once, for everybody who shows it.
 *
 * Two things make this its own module rather than a `_count` at each call site:
 *
 *   1. THE GATES. A count is a promise the destination has to keep. It must
 *      apply exactly what lib/tutorsQuery applies, or the page says 10 over a
 *      list of 9 — which it did, in production, on 2026-07-31, because two
 *      files stated the same rule separately and then drifted.
 *   2. THE FOLD. Since 2026-08-10 a sphere also answers for the categories
 *      redirected into it, and Prisma's `_count` cannot reach through the
 *      parent link. So: one groupBy, folded by lib/categoryTree.
 *
 * Two queries total, whatever the number of categories.
 */
import { prisma } from '@/lib/prisma'
import { foldCounts } from '@/lib/categoryTree'
import type { TreeNode } from '@/lib/categoryTree'

/**
 * An expert who is actually reachable: not self-paused, not admin-suspended,
 * and with at least one service — a serviceless expert is hidden from browse,
 * so counting them promises a person the destination then withholds.
 */
export const COUNTABLE_EXPERT = {
  available: true,
  user: { is: { suspendedAt: null } },
  consultations: { some: {} },
} as const

/** categoryId → visible experts, folded up into the sphere each is browsed under. */
export async function expertCountsBySphere(cats: readonly TreeNode[]): Promise<Map<string, number>> {
  const grouped = await prisma.tutorProfile.groupBy({
    by: ['categoryId'],
    where: COUNTABLE_EXPERT,
    _count: { _all: true },
  })
  return foldCounts(cats, grouped.map(g => ({ categoryId: g.categoryId, count: g._count._all })))
}
