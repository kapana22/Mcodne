/**
 * WHERE A CATEGORY LIVES — the one function that answers it, for redirects,
 * canonicals, the sitemap and every internal link.
 *
 * There are two kinds of absorbed category and they must not be treated alike:
 *
 *   • one that carried its own keyword copy („ფინანსური კონსულტაცია" — an
 *     intro, a FAQ, FAQPage structured data) keeps a page of its own, nested
 *     under the sphere that absorbed it. Folding that copy into a 301 would
 *     throw away the only thing on the site targeting that search.
 *   • one that never had any („advokati") has nothing to keep, so its URL goes
 *     straight to the sphere. A page whose entire content is a heading is worse
 *     than no page.
 *
 * THE TEST IS THE PRESENCE OF COPY IN lib/categorySeo, deliberately — a fact of
 * the codebase, not of the database. A redirect target that moved when an
 * expert joined or left would be a redirect target that cannot be trusted, and
 * a 301 is a promise about a URL forever.
 */
import { categorySeo } from './categorySeo'
import type { CategoryStatus } from './categoryTree'

export type RoutedCategory = {
  slug: string
  status: CategoryStatus
  parent?: { slug: string } | null
}

/** True when this absorbed category has copy worth keeping a page for. */
export function keepsOwnPage(slug: string): boolean {
  return Boolean(categorySeo[slug])
}

/** The canonical, site-relative URL of a category. Never a redirecting one. */
export function categoryPath(cat: RoutedCategory): string {
  // A sphere, visible or hidden, answers at its own URL.
  if (cat.status !== 'REDIRECTED' || !cat.parent) return `/categories/${cat.slug}`
  return keepsOwnPage(cat.slug)
    ? `/categories/${cat.parent.slug}/${cat.slug}`
    : `/categories/${cat.parent.slug}`
}
