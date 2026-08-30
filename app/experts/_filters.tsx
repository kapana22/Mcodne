'use client'
// /experts — the filter model, its controls, and the rail that draws them.
//
// ⚠️ ONE ROSTER SINCE 2026-08-24, AND THE FILTER OBJECT SHRANK WITH IT. This
// file used to hold `types: Capability[]` and two predicates — `passesConsult`
// over a TutorProfile row and `passesWork` over a ServiceProfile row — plus the
// rule that a refinement belonging to one half EXCLUDES the other, and the empty
// state that explained the contradiction that rule created. The consultation
// product is gone; there is one kind of row, so there is one predicate, no
// cross-kind dead end, and no type axis. (The type axis was already written down
// as a thing that must not come back: „a consultation is one KIND of service,
// never a second axis." It is now not expressible.)
//
// ⚠️ ONE STATE, ONE SURFACE (2026-08-19). The refinements live in ONE place: the
// shared rail (components/catalog/FilterPanel), 240px and sticky from `lg`,
// folded into components/catalog/MobileCollapse below it. Same component at both
// breakpoints, so „the two surfaces disagree" is not a bug that can exist here.
// The search field and the sort select were never filters and live in the
// results header (app/experts/_results.tsx).
//
// ⚠️ THE SET IS NOT FIXED — a refinement is offered only while it can actually
// change the result set. See usefulLangs / ratingUseless below: the language and
// rating controls hide themselves when their options would return everyone or
// nobody, and reappear on their own as the roster grows.

import React from 'react'
import { Icon } from '@/components/Icon'
import { FilterGroup, FilterNest, FilterPanel, FilterRow } from '@/components/catalog/FilterPanel'
import { LANG_LABELS, PRIMARY_LANG_CODES } from '@/lib/languages'
import { tradeTopicIds } from '@/lib/catalogItems'
import { LIVE_OFFER_GROUPS } from '@/lib/serviceProfile'
import { CITIES, ONE_CITY } from '@/lib/requestTopics'
import type { ProviderRow } from './_providers'
import { LiveCat } from './_cats'

// Price filter is a BUDGET BAND (min + max), so budget-sensitive buyers
// (law / therapy / finance) can cap spend, not just set a floor. NO_CAP is the
// "no upper bound" sentinel; the apply logic honors both bounds.
export const NO_CAP = 99999
const PRICE_OPTS: { min: number; max: number; l: string }[] = [
  { min: 0, max: NO_CAP, l: 'ნებისმიერი ფასი' },
  { min: 0, max: 50, l: '₾50-მდე' },
  { min: 50, max: 100, l: '₾50–100' },
  { min: 100, max: NO_CAP, l: '₾100+' },
]
export const priceBandActive = (lo: number, hi: number) => lo > 0 || hi < NO_CAP
export function priceBandLabel(lo: number, hi: number): string {
  if (!priceBandActive(lo, hi)) return 'ნებისმიერი'
  const match = PRICE_OPTS.find(o => o.min === lo && o.max === hi)
  if (match) return match.l
  if (hi >= NO_CAP) return `₾${lo}+`
  if (lo === 0) return `₾${hi}-მდე`
  return `₾${lo}–${hi}`
}

// Draggable dual-handle budget slider. Prices sit ~₾60–150 today, so 0–300 with
// a ₾10 step covers the range with headroom; the top handle at PRICE_MAX means
// "no upper bound" (NO_CAP). The apply logic already honours arbitrary [lo,hi],
// so nothing downstream changes — this just replaces the preset radio/pills.
const PRICE_MIN = 0
const PRICE_MAX = 300
const PRICE_STEP = 10

export function PriceRange({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [lo, hiRaw] = value
  const hi = hiRaw >= NO_CAP ? PRICE_MAX : hiRaw
  const active = priceBandActive(lo, hiRaw)
  const setLo = (n: number) => onChange([Math.max(PRICE_MIN, Math.min(n, hi - PRICE_STEP)), hiRaw])
  const setHi = (n: number) => {
    const next = Math.max(n, lo + PRICE_STEP)
    onChange([lo, next >= PRICE_MAX ? NO_CAP : next])
  }
  return (
    <div className="px-1 pt-1 pb-1.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-small font-display font-bold text-ink-900 tabular-nums">
          {active ? `₾${lo} – ${hiRaw >= NO_CAP ? `₾${PRICE_MAX}+` : `₾${hiRaw}`}` : 'ნებისმიერი'}
        </span>
        {active && (
          <button type="button" onClick={() => onChange([0, NO_CAP])} className="text-meta font-display font-semibold text-ink-500 hover:text-ink-800 transition-colors duration-fast">
            გასუფთავება
          </button>
        )}
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-ink-200" />
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-brand-500" style={{ left: `${(lo / PRICE_MAX) * 100}%`, right: `${100 - (hi / PRICE_MAX) * 100}%` }} />
        <input
          aria-label="მინიმალური ფასი" type="range" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={lo}
          onChange={e => setLo(Number(e.target.value))}
          className="range-thumb absolute inset-x-0 top-0 w-full h-6"
          style={{ zIndex: lo >= PRICE_MAX - PRICE_STEP ? 5 : 3 }}
        />
        <input
          aria-label="მაქსიმალური ფასი" type="range" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={hi}
          onChange={e => setHi(Number(e.target.value))}
          className="range-thumb absolute inset-x-0 top-0 w-full h-6" style={{ zIndex: 4 }}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-meta text-ink-400 tabular-nums">
        <span>₾{PRICE_MIN}</span>
        <span>₾{PRICE_MAX}+</span>
      </div>
    </div>
  )
}

export const toggleIn = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

// The rating thresholds the rail offers.
export const FILTER_RATINGS = [4.0, 4.5, 4.8, 4.9]

// Per-option result counts. Rating and language were hardcoded once and never
// checked against the roster, so both shipped as guaranteed-zero facets:
// measured live 2026-08-02, `?minRating=4` returned 0 of 11. Tapping it emptied
// the page with no explanation. Now every option carries its own count and a
// zero one is disabled — the same honesty, one layer earlier.
//
// ⚠️ TWO OF THESE ARE ROSTER-WIDE, NOT FILTER-RELATIVE, and the split is
// deliberate rather than sloppy.
//   `trades` / `cities` — how many PEOPLE exist, full stop. A row that read
//     „სანტექნიკა (0)" the moment somebody ticked a city would be telling the
//     reader the site has nobody. The same argument app/experts/_providers →
//     filterCounts already writes down.
//   `rating` / `langs` — measured against the loaded roster with their OWN
//     dimension excluded, which is what standard facet counts mean.
export type Facets = {
  rating: Record<string, number>
  langs: Record<string, number>
  pool: number
  /** By group id AND by topic id, straight from the server's one count query. */
  trades: Record<string, number>
  cities: Record<string, number>
}

/**
 * The language options worth SHOWING, given what is loaded.
 *
 * Two ways an option is useless, and both were live on 2026-08-12:
 *   count === 0     it returns nothing — the dead end this file already guards
 *                   against for ratings.
 *   count === pool  it returns EVERYONE. ქართული was spoken by 21 of the 21
 *                   experts in browse: a control that appears to narrow and
 *                   cannot. That is worse than a dead option, because tapping
 *                   it looks like it worked.
 *
 * Below three results nothing is filtered at all — the whole list fits on one
 * screen — so the section hides entirely rather than offering to sort five
 * cards into four.
 */
export const usefulLangs = (facets: Facets) =>
  facets.pool < 3 ? [] : FILTER_LANGS.filter(l => {
    const n = facets.langs[l.l] ?? 0
    return n > 0 && n < facets.pool
  })

/** True when every rating option would return nothing — nobody has been rated
 *  yet. The section is then a row of disabled chips explaining an absence,
 *  which is a sentence, not a control. */
export const ratingUseless = (facets: Facets) =>
  FILTER_RATINGS.every(r => (facets.rating[String(r)] ?? 0) === 0)

/* ───── Filters ───── */

/**
 * ONE FILTER OBJECT, ONE ROSTER.
 *
 * `cats` are Category SLUGS (the sphere a provider is filed under); `trades` are
 * topic-group ids and topic ids in one list, exactly as `?trade=` has always
 * carried them. They filter different columns — `categoryId` and `services[]` —
 * and a reader cannot tell, which is correct: „ვინ ხარ" and „რას აკეთებ" are the
 * same question asked at two grains.
 */
export type Filters = {
  cats: string[]
  langs: string[]
  minRating: number
  price: [number, number]
  trades: string[]
  cities: string[]
}

export const EMPTY_FILTERS: Filters = {
  cats: [], langs: [], minRating: 0, price: [0, NO_CAP], trades: [], cities: [],
}

/** Is anything at all narrowing the list? */
export const anyRefined = (f: Filters) =>
  f.cats.length > 0 || f.langs.length > 0 || f.minRating > 0 ||
  priceBandActive(f.price[0], f.price[1]) || f.trades.length > 0 || f.cities.length > 0

// THE filter predicate — one function, two consumers: the visible list and the
// facet counts. `skip` drops exactly ONE dimension so a facet can count what its
// own options would yield against the OTHER active refinements (standard facet
// semantics). Sharing it is the point: a count computed by a second copy of this
// logic would promise „4.5+ (3)" and then hand back two cards.
export function passesFilters(m: ProviderRow, f: Filters, skip?: 'rating' | 'lang'): boolean {
  if (skip !== 'rating' && f.minRating > 0 && m.rating < f.minRating) return false
  /* Budget band — honour both the floor and the cap (NO_CAP = no ceiling),
     against the SAME number the card prints. Somebody who quotes per job has no
     number at all; they survive an untouched band and drop out of a narrowed
     one, because a band is a claim about price and they have made none. */
  if (priceBandActive(f.price[0], f.price[1])) {
    if (m.priceValue === null) return false
    if (m.priceValue < f.price[0] || m.priceValue > f.price[1]) return false
  }
  // Match by category SLUG (stable), not the display name — a rename or a
  // hidden category can never silently drop matching people.
  if (f.cats.length > 0 && (!m.catSlug || !f.cats.includes(m.catSlug))) return false
  if (skip !== 'lang' && f.langs.length > 0 && !m.langs.some(l => f.langs.includes(l))) return false
  const topics = tradeTopicIds(f.trades)
  if (topics && !m.serviceIds.some(id => topics.has(id))) return false
  // ⚠️ AN EMPTY `areas` IS „I HAVE NOT SAID", NOT „NOWHERE". The routing treats
  // it as matching everywhere (lib/serviceProfile → covers), the server query
  // spelled that as `OR areas isEmpty`, and the count agrees — so a city filter
  // must not hide somebody who named no city.
  if (f.cities.length > 0 && m.areaIds.length > 0 && !m.areaIds.some(c => f.cities.includes(c))) return false
  return true
}

// Labels come from lib/languages so the chips ALWAYS match what a card renders
// (they are compared as strings — a divergent spelling silently yields 0 hits).
export const FILTER_LANGS = PRIMARY_LANG_CODES.map(c => ({ l: LANG_LABELS[c] }))

/* ───── The rail ───── */

/**
 * EVERY REFINEMENT THE CATALOGUE OFFERS, in the shared panel.
 *
 * ⚠️ THE ROWS ARE BUTTONS, NOT LINKS. The list is filtered in the browser over
 * one loaded array, and the container writes the whole selection back into the
 * URL (`?cats=`, `?trade=`, `?city=` …), so every view is still an address
 * somebody can send and Back still walks through them — but a row is state, and
 * a link that reloads the page to reach state the page already holds is slower
 * and looks navigable when it is not.
 *
 * ⚠️ AND EVERY OPTION CARRIES ITS OWN COUNT. The honesty rule this file has
 * enforced since 2026-08-02: a row that says „(3)" and hands back two cards is
 * the failure `passesFilters` exists to stop. The budget slider is the one
 * control with no number — a range has no single count to print, and inventing
 * one would be exactly the fabrication the rest of this file removed.
 */
export const CatalogFilters = ({ filters, setFilters, liveCats, facets, activeCount, onReset }: {
  filters: Filters
  setFilters: (f: Filters) => void
  liveCats: LiveCat[]
  facets: Facets
  /** How many refinements are on. Drives the footer — the way out only exists
   *  when there is something to leave. */
  activeCount: number
  onReset: () => void
}) => {
  const ratingDead = ratingUseless(facets)
  const langOpts = usefulLangs(facets)

  return (
    <FilterPanel reset={activeCount > 0 ? { onClick: onReset } : undefined}>

      {/* ⚠️ TWO BLOCKS, IN THE SITE'S OWN ORDER (2026-08-20). It was one list
          sorted by COUNT, and count is not what this site is about: the everyday
          trades fell to the bottom with zeros beside them while six professional
          rows sat above, and a visitor read the ordering as a ranking of what
          mattered.

          The order is the PRODUCT's, and it does not move as the roster does.
          Owner: „უფრო მაღალი დონის სერვისები და ინტელექტუალურიც იყოს…
          პარალელურად სერვისებსაც, რაც ყოველდღიურად სჭირდება — დალაგება და
          ხელოსანი, ესეც." Professional first, because that is what the site
          leads with; everyday second, because it is half of what it sells.

          They keep separate state fields (`cats` are category slugs, `trades`
          are topic ids) because they filter different columns; a reader cannot
          tell, and should not have to. */}
      <FilterGroup title="პროფესიული სერვისები">
        {liveCats.length === 0
          ? <p className="text-small text-ink-500">იტვირთება…</p>
          : liveCats
              .map(c => ({
                key: `c:${c.slug}`,
                label: c.name,
                count: c.expertCount ?? 0,
                on: filters.cats.includes(c.slug),
                toggle: () => setFilters({ ...filters, cats: toggleIn(filters.cats, c.slug) }),
              }))
              // Inside a block, count IS the right order — it says where there
              // is somebody to answer, without claiming the block itself is
              // more important than the one below.
              .sort((a, b) => b.count - a.count)
              .map(row => (
                <FilterRow key={row.key} on={row.on} onClick={row.toggle} label={row.label} count={row.count} />
              ))}
      </FilterGroup>

      {/* OPEN, like the block above it. Collapsing it made the ordering into a
          hiding place: the professional block leads because it is drawn FIRST,
          which is enough — a second tap to reach half of what the site sells is
          a barrier, not a hierarchy. */}
      {LIVE_OFFER_GROUPS.length > 0 && (
        <FilterGroup title="სერვისი">
          {LIVE_OFFER_GROUPS
            .map(g => ({
              key: `t:${g.id}`,
              label: g.label,
              count: facets.trades[g.id] ?? 0,
              on: filters.trades.includes(g.id),
              toggle: () => setFilters({ ...filters, trades: toggleIn(filters.trades, g.id) }),
              topics: g.topics,
            }))
            // ⚠️ EMPTY GROUPS ARE NOT DRAWN. The roster is the whole vocabulary
            // since 2026-08-24 — 24 live groups — and a rail listing every one
            // of them would be twenty rows of „(0)" above the first card. A
            // group appears the moment somebody registers a service inside it.
            .filter(row => row.count > 0 || row.on)
            .sort((a, b) => b.count - a.count)
            .map(row => (
              <div key={row.key} className="flex flex-col gap-1">
                <FilterRow on={row.on} onClick={row.toggle} label={row.label} count={row.count} />
                {/* The narrower topics unfold only under a ticked group — all
                    of them at once is a hundred and seventy rows above the
                    first card, and the rail would be the page. */}
                {row.on && row.topics && (
                  <FilterNest>
                    {row.topics.map(t => (
                      <FilterRow
                        key={t.id}
                        on={filters.trades.includes(t.id)}
                        onClick={() => setFilters({ ...filters, trades: toggleIn(filters.trades, t.id) })}
                        label={t.label}
                        count={facets.trades[t.id] ?? 0}
                      />
                    ))}
                  </FilterNest>
                )}
              </div>
            ))}
        </FilterGroup>
      )}

      <FilterGroup title="ფასი" defaultOpen={false} active={priceBandActive(filters.price[0], filters.price[1])}>
        <PriceRange value={filters.price} onChange={p => setFilters({ ...filters, price: p })} />
      </FilterGroup>

      {langOpts.length > 0 && (
        <FilterGroup title="ენა" defaultOpen={false} active={filters.langs.length > 0}>
          {langOpts.map(l => (
            <FilterRow
              key={l.l}
              on={filters.langs.includes(l.l)}
              onClick={() => setFilters({ ...filters, langs: toggleIn(filters.langs, l.l) })}
              label={l.l}
              count={facets.langs[l.l] ?? 0}
            />
          ))}
        </FilterGroup>
      )}

      {!ratingDead && (
        <FilterGroup title="მინ. რეიტინგი" defaultOpen={false} active={filters.minRating > 0}>
          {FILTER_RATINGS.map(r => {
            const on = filters.minRating === r
            const n = facets.rating[String(r)] ?? 0
            // Single-select: tapping the active threshold clears it. A
            // zero-count option is disabled but stays visible with its 0 — and
            // an ACTIVE one is always switchable off, or a filter that ended at
            // zero could never be undone.
            return (
              <FilterRow
                key={r}
                on={on}
                disabled={n === 0 && !on}
                onClick={() => setFilters({ ...filters, minRating: on ? 0 : r })}
                count={n}
                label={<span className="inline-flex items-center gap-1"><Icon.star aria-hidden className="w-3 h-3 text-warning-500" /><span className="tabular-nums">{r.toFixed(1)}+</span></span>}
              />
            )
          })}
        </FilterGroup>
      )}

      {/* ⚠️ NO CITY GROUP WHILE THERE IS ONE CITY (2026-08-20). A filter whose
          every row matches everything narrows nothing; it is a control that
          teaches the visitor the rail is full of things that do not work. It
          returns by itself the day a second city is served — see CITIES. */}
      {!ONE_CITY && (
        <FilterGroup title="ქალაქი" defaultOpen={false} active={filters.cities.length > 0}>
          {CITIES.map(c => (
            <FilterRow
              key={c.id}
              on={filters.cities.includes(c.id)}
              onClick={() => setFilters({ ...filters, cities: toggleIn(filters.cities, c.id) })}
              label={c.label}
              count={facets.cities[c.id] ?? 0}
            />
          ))}
        </FilterGroup>
      )}
    </FilterPanel>
  )
}
