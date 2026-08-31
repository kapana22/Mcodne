'use client'
// THE CATEGORIES, AS THE CATALOGUE SEES THEM — the shape GET /api/categories
// returns and the one lookup every surface does over it.
//
// Split out of `_data.tsx` on 2026-08-24, when that file (the consultation row
// mapper) was deleted with the product it mapped. Nothing here changed; it is
// the same type and the same resolver, in a file that is only about categories.

// Category identity is DB-driven (GET /api/categories → live categories only).
// The rail's checkboxes toggle `filters.cats`, which holds category SLUGS — so
// filtering is robust to renames and a category that stops being a sphere simply
// stops appearing (no dead chip). The filter matches a provider's `catSlug`,
// never a display string. Since 2026-08-10 that field is the SPHERE they are
// browsed under — their own category, or the one it was absorbed into.
// `expertCount` drives which categories are OFFERED as a filter: an option that
// can only ever return zero results is a dead end, not a filter.
export type LiveCat = {
  id: string
  slug: string
  name: string
  expertCount?: number
  /** False for a sphere that has nobody yet and is not advertised. Browse MUST
   *  drop these — the application offers them so somebody can be first. */
  browsable?: boolean
  /** Sub-fields folded into this sphere. NOT rendered as browse chips — a
   *  client picks a sphere, and its count already includes these. They exist
   *  for the screens where a provider describes themselves. */
  children?: { id: string; slug: string; name: string }[]
}

// Resolve a slug → its display name from the live list; falls back to the slug
// itself so a not-yet-loaded / unknown category never renders as blank.
export const catNameOf = (cats: LiveCat[], slug: string) => cats.find(c => c.slug === slug)?.name ?? slug
