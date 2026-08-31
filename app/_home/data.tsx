// Home — the ONE shape the page's sections take as props.
//
// ⚠️ IT IS A LEAF and it imports nothing from this folder — the rule every
// `_model`/`_data` file here follows (CLAUDE.md §2). It is also no longer a
// client module: nothing in it renders, so `app/page.tsx` can import the type
// on the server without dragging a `'use client'` boundary along with it.
//
// ⚠️ WHAT LEFT IT ON 2026-08-21, so nobody goes looking:
//   · `Expert` + `mapTutorToExpert` — the hero's rotating preview card, which
//     the redesign removed. The card's shape lives in
//     components/home/CatalogueGrid now, and the mapping in lib/homeCatalogue,
//     where it runs on the SERVER and covers both halves of the catalogue.
//   · `ROTATE_MS` + `shuffled` — the preview's rotation timer, gone with it.
//   · `VerifiedMark` — a local third copy of a mark that components/Avatar
//     already exports; the grid imports that one.
//   · `FALLBACK_CATS` — a hardcoded top-6 that existed because the tiles could
//     not know which spheres had anybody in them until a client fetch landed.
//     They are resolved server-side now, so a fallback list of names is not a
//     safety net, it is a second source of truth for the same six labels.

/**
 * A sphere, as the home tiles render it.
 *
 * `expertCount` is MEASURED (lib/categoryCounts → expertCountsByCategory: the
 * same fold the catalogue's own filter counts with), never estimated. It is
 * optional only because the type is also the shape a caller may hand over
 * before counting; a tile with no count simply omits the numeral rather than
 * printing a zero it did not verify.
 */
export type HomeCat = {
  slug: string
  name: string
  expertCount?: number
}
