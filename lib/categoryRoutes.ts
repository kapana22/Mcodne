/**
 * WHERE A CATEGORY LIVES — the one function that answers it, for the sitemap,
 * the breadcrumbs and every internal link.
 *
 * STAGE 8 (2026-08-19, restructuring v2 §8.7): /categories/* was RETIRED. The
 * sphere landing pages (a hub, one page per sphere, a nested page per absorbed
 * category that carried copy) are gone, and the middleware 308s every one of
 * those addresses to the catalogue filtered to the slug — /experts?category=<x>
 * — which is where the experts of a sphere were always listed anyway. The
 * copy in lib/categorySeo stays as data (the profession landings still print
 * a sphere's keyword from it); only the route usage went.
 *
 * So the answer is now ONE shape for every state: a VISIBLE sphere, a HIDDEN
 * one, and an absorbed (REDIRECTED) category all resolve to the catalogue with
 * their OWN slug — `lib/categoryTree → categorySlugFilter` accepts an absorbed
 * slug and lists its experts through the sphere that took it, so a bookmark to
 * „finance" keeps returning people. Never a redirecting URL, never
 * `/categories/undefined` from a bad row.
 */
import type { CategoryStatus } from './categoryTree'

export type RoutedCategory = {
  slug: string
  status: CategoryStatus
  parent?: { slug: string } | null
}

/** The catalogue, filtered to this category. */
export const CATEGORY_BROWSE_PATH = '/experts'

/** The canonical, site-relative URL of a category. Never a redirecting one.
 *  Takes the full row shape so every caller keeps compiling; only `slug`
 *  decides now (see the header for why status no longer changes the answer). */
export function categoryPath(cat: RoutedCategory): string {
  return `${CATEGORY_BROWSE_PATH}?category=${encodeURIComponent(cat.slug)}`
}
