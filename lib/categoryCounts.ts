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
import { foldCounts, foldMin } from '@/lib/categoryTree'
import type { TreeNode } from '@/lib/categoryTree'

/**
 * An expert who is actually reachable: not self-paused, not admin-suspended,
 * and with at least one service — a serviceless expert is hidden from browse,
 * so counting them promises a person the destination then withholds.
 */
const COUNTABLE_EXPERT = {
  available: true,
  published: true,
  user: { is: { suspendedAt: null } },
  // ⚠️ AT LEAST ONE SERVICE, AND IT WAS „at least one consultation" UNTIL
  // 2026-08-24. Same rule, one table: somebody who lists nothing is hidden from
  // browse, so counting them promises a person the destination then withholds.
  services: { isEmpty: false },
} as const

/** categoryId → visible experts, folded up into the sphere each is browsed under. */
export async function expertCountsByCategory(cats: readonly TreeNode[]): Promise<Map<string, number>> {
  const grouped = await prisma.serviceProfile.groupBy({
    by: ['categoryId'],
    where: COUNTABLE_EXPERT,
    _count: { _all: true },
  })
  return foldCounts(cats, grouped.map((g: { categoryId: string | null; _count: { _all: number } }) => ({ categoryId: g.categoryId, count: g._count._all })))
}

/**
 * categoryId → the CHEAPEST price anybody in that sphere names, in lari.
 *
 * ⚠️ THE SAME `COUNTABLE_EXPERT` GATE AS THE COUNT ABOVE, and that is the whole
 * point of it living here rather than at the call site. „24 ექსპერტი · 40₾-დან"
 * is one sentence about one set of people; resolved by two `where` clauses it
 * becomes a floor quoted by somebody the tile did not count and the visitor
 * cannot find.
 *
 * 🔒 NEVER INVENT A NUMBER. `priceFrom` is null for a provider who quotes per
 * job, and Postgres' MIN already ignores those — but a sphere where NOBODY
 * named a price comes back with `_min.priceFrom === null`, and that row is
 * dropped rather than folded as 0. The tile then prints the count alone.
 */
export async function priceFloorsByCategory(cats: readonly TreeNode[]): Promise<Map<string, number>> {
  const grouped = await prisma.serviceProfile.groupBy({
    by: ['categoryId'],
    where: COUNTABLE_EXPERT,
    _min: { priceFrom: true },
  })
  return foldMin(
    cats,
    grouped
      .map((g: { categoryId: string | null; _min: { priceFrom: number | null } }) =>
        ({ categoryId: g.categoryId, value: g._min.priceFrom }))
      // A sphere nobody priced has no floor — not a floor of zero.
      .filter((g): g is { categoryId: string | null; value: number } => g.value !== null && g.value > 0),
  )
}

/* ⚠️ `countVisibleExperts()` LIVED HERE AND IS DELETED (2026-09-02). It answered
 * „the whole visible roster, as ONE number", and on 2026-09-02 the site stopped
 * asking: the home page's catalogue tile, the home closing band, the catalogue
 * hero, the trade landing and /about all printed that number and all four
 * claims were removed at the owner's „არასად არ ეწეროს ეგ ინფო, არასაჭიროა."
 *
 * Deleted rather than left exported, which is this repo's own rule and its own
 * precedent — „stop exporting 126 symbols nobody imports" (2026-08-21). The
 * gate it wrapped (`COUNTABLE_EXPERT`) stays: the PER-CATEGORY counts still use
 * it, and they are read by the home page's populated-only filter, which is the
 * one reader of a count that never reaches a screen. */
