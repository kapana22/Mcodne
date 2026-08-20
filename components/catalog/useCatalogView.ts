// THE READER'S LAYOUT CHOICE — ONE PREFERENCE FOR THE WHOLE SITE (2026-08-19).
//
// ⚠️ WHY IT EXISTS. Owner: „მიეც საშვალება მომხარებელს ორი ვარიანტი ქონდეს
// განლაგებისთვის." Two views, and the visitor picks: `grid` is the two-up card
// grid both catalogues have always shipped, `list` is the same card as a
// full-width row (components/EntityCard switches its own geometry on the `view`
// prop the container passes down).
//
// ⚠️ ONE KEY, BOTH HALVES. Consultations and jobs are two halves of one list at
// one address since stage 10 (2026-08-19); a reader who chose rows with one
// type ticked and gets cards with the other has been told the halves are
// different sites. The preference is a property of the READER, not of the
// page, so it is stored once, under one constant nobody may re-type.
//
// ⚠️ HOW THE VALUE REACHES THE PAGE, AND WHAT THAT COSTS. localStorage does not
// exist on the server, so the first HTML is always the default — `useSyncExternalStore` renders `grid` from `getServerSnapshot`, then swaps to the stored
// value on hydration, in ONE re-render, before anything else on the page has
// moved. That is the deliberate trade: a reader whose preference is `list`
// sees the grid for the length of a hydration, and in exchange there is no
// hydration mismatch (a `useState` initialiser reading localStorage renders
// different HTML on the two sides and React resets the tree), no blocking
// inline script in the document head, and no theme-flash class on <html>.
// The alternative — a `<script>` that stamps an attribute before paint — buys
// those few frames at the price of a second styling mechanism for a preference
// that costs nothing to get wrong for one frame.

import { useSyncExternalStore } from 'react'

export type CatalogView = 'grid' | 'list'

/** The one key. Both catalogues read and write exactly this string. */
export const CATALOG_VIEW_KEY = 'mcodne:catalog-view'

/** What a first-time visitor gets, and what the server always renders. */
export const DEFAULT_CATALOG_VIEW: CatalogView = 'grid'

/**
 * The container the cards sit in, per view. THE CONTRACT with both card files:
 * the shell owns the container, the card owns itself and reads `view`.
 *   grid — today's look: one column on a phone, two from `sm`.
 *   list — one full-width row per result, tighter gap because a row is shorter
 *          than a card and the same 16px between them reads as a gap in the list.
 */
export const VIEW_CLASS: Record<CatalogView, string> = {
  grid: 'grid gap-4 sm:grid-cols-2',
  list: 'flex flex-col gap-3',
}

const isView = (v: unknown): v is CatalogView => v === 'grid' || v === 'list'

let current: CatalogView | null = null
const subscribers = new Set<() => void>()

function getSnapshot(): CatalogView {
  if (current === null) {
    let stored: string | null = null
    // Private mode / disabled storage throws on ACCESS, not on read — hence the
    // try around the getItem itself.
    try { stored = window.localStorage.getItem(CATALOG_VIEW_KEY) } catch {}
    current = isView(stored) ? stored : DEFAULT_CATALOG_VIEW
  }
  return current
}

const getServerSnapshot = (): CatalogView => DEFAULT_CATALOG_VIEW

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

export function setCatalogView(v: CatalogView): void {
  if (current === v) return
  current = v
  try { window.localStorage.setItem(CATALOG_VIEW_KEY, v) } catch {}
  subscribers.forEach(cb => cb())
}

/** `[view, setView]` — the same store for every consumer on the page, so the
 *  toggle and the results container can never disagree. */
export function useCatalogView(): [CatalogView, (v: CatalogView) => void] {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return [view, setCatalogView]
}
