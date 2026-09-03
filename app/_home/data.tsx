// Home — the ONE shape the page's sections take as props, plus the tile palette.
//
// ⚠️ IT IS A LEAF and it imports nothing from this folder — the rule every
// `_model`/`_data` file here follows. It is also not a client module: nothing
// in it renders, so `app/page.tsx` can import the type on the server without
// dragging a `'use client'` boundary along with it.
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
 * `expertCount` and `priceFrom` are both MEASURED (lib/categoryCounts), never
 * estimated, and they are measured through the SAME gate — see
 * `priceFloorsByCategory` for why one `where` clause for two numbers is not a
 * tidiness point but the thing that stops a tile quoting a floor from somebody
 * it did not count.
 *
 * Each is optional because a tile prints only what it has: a sphere where
 * nobody named a price (everyone quotes per job) shows the count alone rather
 * than a „0₾-დან" nobody said.
 */
export type HomeCat = {
  slug: string
  name: string
  expertCount?: number
  /** Lari, integer — the cheapest `priceFrom` anybody in the sphere names. */
  priceFrom?: number | null
}

/**
 * THE TILE PALETTE (2026-08-31, from the owner's design canvas „mcodne.ge
 * პროფილის რედიზაინი" → Home).
 *
 * ⚠️ THIS IS A DELIBERATE WIDENING OF „TWO COLOURS, NO BLUE"
 * (docs/design-system.md). The canon held while every coloured surface was a
 * CONTROL — a filled button, a badge, a state — where a second hue is a second
 * meaning nobody defined. These are not controls: they are eight neighbouring
 * doors, and the one job the plate has is to make „სამართალი" and „რემონტი"
 * distinguishable at a glance from across the page. Green cannot do that eight
 * times, and the alternative the tiles had before was eight identical grey
 * cards you had to READ to tell apart.
 *
 * ⚠️ CHROMA IS FIXED AT 0.045 AND ONLY THE HUE MOVES, which is the whole reason
 * these read as one family rather than as a crayon box: in OKLCH, equal
 * lightness and equal chroma means equal PERCEIVED weight, so no tile shouts
 * louder than its neighbour because of the hue it happened to get. The border
 * is the same hue one step down (L 0.88 / C 0.055).
 *
 * ⚠️ `ink` IS FOR THE ICON, NEVER FOR TEXT ON THE PLATE. Each is a dark,
 * desaturated relative of its hue and carries the glyph inside a white chip;
 * the label underneath is ink-900 on white, like every other card on the site.
 *
 * ⚠️ ASSIGNED BY POSITION, NOT BY SLUG. A hue that means „law" is a taxonomy
 * nobody maintains — the day a sphere is renamed or reordered it would be
 * wrong, silently. Position is honest about being arbitrary, and the eighth
 * entry is the neutral one on purpose: it is where „ყველა კატეგორია" lands.
 */
export type TileHue = { bg: string; border: string; ink: string }

export const TILE_HUES: readonly TileHue[] = [
  { bg: 'oklch(0.94 0.045 150)', border: 'oklch(0.88 0.055 150)', ink: '#1E6656' },
  { bg: 'oklch(0.94 0.045 75)',  border: 'oklch(0.88 0.055 75)',  ink: '#7A5A18' },
  { bg: 'oklch(0.94 0.045 250)', border: 'oklch(0.88 0.055 250)', ink: '#2C4B72' },
  { bg: 'oklch(0.94 0.045 320)', border: 'oklch(0.88 0.055 320)', ink: '#6A3A63' },
  { bg: 'oklch(0.94 0.045 30)',  border: 'oklch(0.88 0.055 30)',  ink: '#7C3A2C' },
  { bg: 'oklch(0.94 0.045 190)', border: 'oklch(0.88 0.055 190)', ink: '#1F5A63' },
  { bg: 'oklch(0.94 0.045 110)', border: 'oklch(0.88 0.055 110)', ink: '#4C5C1E' },
  { bg: '#F6F3EC',               border: '#E7E0D3',               ink: '#5A5347' },
]

/** The hue for the nth tile, wrapping — a sphere list longer than the palette
 *  repeats rather than running out of colour. */
export const tileHue = (i: number): TileHue => TILE_HUES[i % TILE_HUES.length]
