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
// shared rail (components/catalog/FilterPanel), 264px and sticky from `lg`,
// folded into components/catalog/MobileCollapse below it. Same component at both
// breakpoints, so „the two surfaces disagree" is not a bug that can exist here.
// The search field and the sort select were never filters and live in the
// results header (app/experts/_results.tsx).
//
// ⚠️ AND ONE THING IN THIS FILE IS NOT A REFINEMENT (2026-09-01). `VerticalSwitch`
// chooses which HALF of the site is being read — „პროფესიული" or „ყოველდღიური",
// the site's one pair of words (lib/requestTopics → VERTICAL_LABEL). It filters
// the roster like everything else here, but it is the axis rather than a
// narrowing: exactly one side is always on, `anyRefined` ignores it, „ფილტრის
// მოხსნა" keeps it, and it is drawn OUTSIDE the fold-away panel so a phone
// cannot hide it. Owner: „ორი მთავარი კატეგორია … მინდა იყოს გადამრთველი, რომ
// არევა არ მოხდეს ამათი და კომფორტულად იყოს."
//
// ⚠️ THE SET IS NOT FIXED — a refinement is offered only while it can actually
// change the result set. See usefulLangs / ratingUseless below: the language and
// rating controls hide themselves when their options would return everyone or
// nobody, and reappear on their own as the roster grows.

import React from 'react'
import { Icon } from '@/components/Icon'
import Link from 'next/link'
import {
  FilterGroup, FilterMore, FilterNest, FilterPanel, FilterRow, FilterSearch, FilterSwitch,
} from '@/components/catalog/FilterPanel'
import { tileHue } from '@/app/_home/data'
import { LANG_LABELS, PRIMARY_LANG_CODES } from '@/lib/languages'
import { tradeTopicIds } from '@/lib/catalogItems'
import { LIVE_OFFER_GROUPS } from '@/lib/serviceProfile'
import { LIVE_SERVICE_GROUP_IDS, VERTICAL_LABEL, verticalsOfTopics, type Vertical } from '@/lib/requestTopics'

/** The everyday half of the roster — the trades that arrive with daily demand.
 *  The professional half is drawn from the admin categories instead, and the two
 *  must not name the same thing twice. Which of them the rail draws is the
 *  switch's answer (`Filters.vertical`), never both at once. */
const EVERYDAY_OFFER_GROUPS = LIVE_OFFER_GROUPS.filter(g => LIVE_SERVICE_GROUP_IDS.includes(g.id))
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
      {/* ⚠️ THE BAND IS 22px NOW, AND THE „გასუფთავება" LEFT THIS BOX
          (2026-09-01, the owner's screenshots). It was a 13px line with the
          clear beside it: the one number the section exists to state, set in
          the same type as a checkbox label. The way out moved up to the
          heading, where every section's action now lives. */}
      <div className="mb-3 font-display text-h2 font-bold text-ink-900 tabular-nums">
        {active ? `₾${lo} – ${hiRaw >= NO_CAP ? `₾${PRICE_MAX}+` : `₾${hiRaw}`}` : 'ნებისმიერი'}
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
  /**
   * WHICH SIDE OF THE SITE IS BEING READ — and it is NOT a refinement, it is
   * the axis (lib/requestTopics → VERTICAL_LABEL). Exactly one of the two is
   * always on; `anyRefined` deliberately ignores it and „ფილტრის მოხსნა"
   * deliberately keeps it, because clearing your filters means „show me
   * everybody like this", never „send me to the other half of the site".
   */
  vertical: Vertical
  cats: string[]
  langs: string[]
  minRating: number
  price: [number, number]
  trades: string[]
  cities: string[]
}

export const EMPTY_FILTERS: Filters = {
  // ⚠️ THE PROFESSIONAL SIDE OPENS FIRST — the same order the rail's two blocks
  // held before the switch replaced them, for the same reason (owner: „უფრო
  // მაღალი დონის სერვისები და ინტელექტუალურიც იყოს"), and it is also where the
  // roster is: 23 of 23 public providers on 2026-09-01.
  vertical: 'EXPERT',
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
export function passesFilters(m: ProviderRow, f: Filters, skip?: 'rating' | 'lang' | 'vertical'): boolean {
  /* ⚠️ THE SIDE IS TESTED FIRST AND IT IS NOT OPTIONAL — this is the whole
     „რომ არევა არ მოხდეს ამათი". A provider who does BOTH (a designer who also
     fits kitchens) carries both and passes on either side, which is not mixing:
     it is one person, twice true. */
  if (skip !== 'vertical' && !m.verticals.includes(f.vertical)) return false
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

/**
 * THE SAME FILTERS, READ FOR THE OTHER SIDE.
 *
 * ⚠️ SWITCHING SIDES DROPS THE OTHER SIDE'S PICKS, and it has to. „სამართალი"
 * is a Category slug that only the professional list draws and only a
 * professional row carries; carried across the switch it survives as an
 * INVISIBLE filter — the everyday list has no row that could untick it — and
 * every everyday provider fails it, so the reader taps the switch and gets an
 * empty page refined by something they cannot see. The side-neutral
 * refinements (budget, language, rating, city) are questions about a person
 * rather than about a vocabulary, so they cross.
 *
 * ⚠️ AND THE COUNT ON THE SWITCH IS COMPUTED THROUGH THIS SAME FUNCTION, so
 * the number on a segment is what pressing that segment actually yields. Two
 * copies of this rule would be a switch that promises 4 and hands back 0.
 */
export function sideFilters(f: Filters, v: Vertical): Filters {
  return {
    ...f,
    vertical: v,
    cats: v === 'EXPERT' ? f.cats : [],
    trades: v === 'SERVICE' ? f.trades : [],
  }
}

/**
 * The side a `?trade=` link is asking for, or null when it asks for nothing.
 *
 * Every /experts?trade=… address ever sent predates the switch, so the switch
 * has to be able to read one: a link to „სანტექნიკა" must open on the everyday
 * side rather than land on the professional one with its own filter invisible.
 */
export function verticalOfTrades(trades: string[]): Vertical | null {
  const ids = tradeTopicIds(trades)
  if (!ids) return null
  return verticalsOfTopics([...ids]).includes('SERVICE') ? 'SERVICE' : 'EXPERT'
}

// Labels come from lib/languages so the chips ALWAYS match what a card renders
// (they are compared as strings — a divergent spelling silently yields 0 hits).
export const FILTER_LANGS = PRIMARY_LANG_CODES.map(c => ({ l: LANG_LABELS[c] }))

/* ───── The switch ───── */

/**
 * THE TWO SIDES OF THE SITE, ABOVE EVERYTHING ELSE THE RAIL DOES.
 *
 * ⚠️ IT IS RENDERED OUTSIDE `MobileCollapse`, NOT INSIDE THIS PANEL (see
 * app/experts/client). Below `lg` the rail folds behind a „ფილტრი" button, and
 * the axis of the whole catalogue cannot be something you open the filters to
 * find. One instance, one piece of state, drawn once at every width.
 *
 * ⚠️ THE COUNTS ARE MEASURED WITH THE SIDE ITSELF EXCLUDED — standard facet
 * semantics, the same rule `usefulLangs` and the rating rows follow. So a
 * search for „ელექტრიკოსი" that matches nobody professional and four everyday
 * providers says exactly that ON the switch, which is the one place it helps:
 * free-text search deliberately crosses the two sides (lib/requestTopics), so
 * the switch is where a reader learns which side their words landed on.
 */
export const VerticalSwitch = ({ value, onChange, counts }: {
  value: Vertical
  onChange: (v: Vertical) => void
  counts: Record<Vertical, number>
}) => (
  <FilterSwitch
    label="რომელი მხარე"
    value={value}
    onChange={onChange}
    options={[
      { id: 'EXPERT' as Vertical, label: VERTICAL_LABEL.EXPERT, count: counts.EXPERT },
      { id: 'SERVICE' as Vertical, label: VERTICAL_LABEL.SERVICE, count: counts.SERVICE },
    ]}
  />
)

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
export const CatalogFilters = ({ filters, setFilters, liveCats, facets, activeCount, onReset, requestHref }: {
  filters: Filters
  setFilters: (f: Filters) => void
  liveCats: LiveCat[]
  facets: Facets
  /** How many refinements are on. Drives the footer — the way out only exists
   *  when there is something to leave. */
  activeCount: number
  onReset: () => void
  /** The intake address, or null when FEATURE_REQUESTS is off — read ONCE in
   *  the server page. See `NotFoundCard` at the foot of this file. */
  requestHref?: string | null
}) => {
  const ratingDead = ratingUseless(facets)
  const langOpts = usefulLangs(facets)
  const priceOn = priceBandActive(filters.price[0], filters.price[1])

  /* ═══════════ THE ONE LIST THE CHOSEN SIDE OWNS ═════════════════════════
   *
   * ⚠️ IT WAS TWO BLOCKS, STACKED (2026-08-20 → 2026-09-01). „პროფესიული
   * სერვისები" drawn from the admin categories, „ყოველდღიური სერვისები" drawn
   * from the trade groups, one above the other, both on screen at once. The
   * owner's answer to that is the switch above this panel: the two lists are
   * the two sides of the site, so only one of them is a list at a time.
   *
   * WHAT DID NOT CHANGE, and must not: each side still draws its OWN
   * vocabulary, counted by its OWN query — `expertCount` on a Category row
   * against `categoryId`, `facets.trades` against `services[]` — and writes its
   * OWN state field. That is why they were never merged into one flat list, and
   * the switch is not a merge: it is the same two lists with one of them put
   * away. The overlap this file fixed on 2026-08-31 (thirteen slugs drawn in
   * both blocks with different numbers beside them) cannot recur, because the
   * two are never on screen together.
   */
  type OptionRow = {
    key: string
    label: string
    count: number
    on: boolean
    toggle: () => void
    topics?: { id: string; label: string }[]
  }

  const rows: OptionRow[] = React.useMemo(() => {
    if (filters.vertical === 'EXPERT') {
      return liveCats
        .map(c => ({
          key: `c:${c.slug}`,
          label: c.name,
          count: c.expertCount ?? 0,
          on: filters.cats.includes(c.slug),
          toggle: () => setFilters({ ...filters, cats: toggleIn(filters.cats, c.slug) }),
        }))
        // Inside the list, count IS the right order — it says where there is
        // somebody to answer.
        .sort((a, b) => b.count - a.count)
    }
    return EVERYDAY_OFFER_GROUPS
      .map(g => ({
        key: `t:${g.id}`,
        label: g.label,
        count: facets.trades[g.id] ?? 0,
        on: filters.trades.includes(g.id),
        toggle: () => setFilters({ ...filters, trades: toggleIn(filters.trades, g.id) }),
        topics: g.topics,
      }))
      // ⚠️ EMPTY GROUPS ARE NOT DRAWN. A group appears the moment somebody
      // registers a service inside it; until then the row would be a promise
      // with a (0) beside it.
      .filter(row => row.count > 0 || row.on)
      .sort((a, b) => b.count - a.count)
  }, [filters, setFilters, liveCats, facets])

  /* ⚠️ A FIELD AND A CAP OVER THE LIST (2026-09-01, the owner's screenshots).
     Twenty professional categories is a rail you scroll instead of results.
     Six, then „კიდევ N სერვისი", and a field for the person who already knows
     the word.

     ⚠️ THE TWO CONTROLS APPEAR ON DIFFERENT TESTS, and the difference is what
     each one can promise. „კიდევ N" is drawn only when something is actually
     hidden — a button offering „კიდევ 0" is a lie about the list. The FIELD is
     drawn from six rows on, hidden or not: the screenshots draw it, and at six
     rows it is already the difference between reading a column and typing three
     letters. It was `> CAP`, which meant that with exactly six live categories
     — what the roster had the day this shipped — the panel never drew the field
     at all and did not look like the design it was built from. */
  const CAP = 6
  const [listQuery, setListQuery] = React.useState('')
  const [expanded, setExpanded] = React.useState(false)
  // The list is a different list on the other side of the switch; a query typed
  // over one of them must not survive into the other, where it would silently
  // hide rows the reader never searched for.
  React.useEffect(() => { setListQuery(''); setExpanded(false) }, [filters.vertical])

  const q = listQuery.trim().toLowerCase()
  const matches = q
    ? rows.filter(r => r.label.toLowerCase().includes(q) || r.topics?.some(t => t.label.toLowerCase().includes(q)))
    : rows
  const shown = q || expanded ? matches : matches.slice(0, CAP)
  const rest = matches.length - shown.length
  const picked = filters.vertical === 'EXPERT' ? filters.cats.length : filters.trades.length

  return (
    <>
    <FilterPanel reset={activeCount > 0 ? { onClick: onReset } : undefined}>

      {/* ⚠️ THE BUDGET IS FIRST AND OPEN, as the owner's screenshots draw it.
          It was last and collapsed, on the argument that six open sections make
          a 1230px rail — which the cap on the list below now answers instead.
          A budget is the refinement somebody brings WITH them; it belongs where
          they look first. */}
      <FilterGroup
        title="ფასი"
        collapsible={false}
        action={priceOn && (
          <button
            type="button"
            onClick={() => setFilters({ ...filters, price: [0, NO_CAP] })}
            className="no-caps font-display font-semibold text-ink-500 hover:text-ink-800 transition-colors duration-fast"
          >
            გასუფთავება
          </button>
        )}
      >
        <PriceRange value={filters.price} onChange={p => setFilters({ ...filters, price: p })} />
      </FilterGroup>

      {/* ⚠️ NO SECTION AT ALL WHEN THIS SIDE HAS NOTHING TO OFFER. The everyday
          side had 0 of 23 providers on 2026-09-01, and the rail drew the
          heading „ყოველდღიური სერვისები" over an empty box — a section that
          looks broken rather than early. The results column says what is true
          („ჯერ არავინ არის სიაში") and offers the intake; a rail cannot say it
          twice. */}
      {rows.length > 0 && (
        <FilterGroup
          title="სერვისი"
          collapsible={false}
          action={picked > 0 && <span className="tabular-nums">{picked} არჩეული</span>}
        >
          {rows.length >= CAP && (
            <FilterSearch value={listQuery} onChange={setListQuery} placeholder="სერვისის ძებნა" />
          )}

          <div className="mt-1.5 flex flex-col gap-1.5">
            {shown.map(row => (
              <div key={row.key} className="flex flex-col gap-1.5">
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
          </div>

          {/* A typed query is its own „show everything that matches", so the
              cap steps out of the way while there is one. */}
          {!q && (rest > 0 || expanded) && (
            <FilterMore n={rest} more={!expanded} onClick={() => setExpanded(e => !e)} />
          )}
          {q && matches.length === 0 && (
            <p className="px-2.5 py-2 text-small text-ink-500">ვერ ვიპოვეთ — სცადე სხვა სიტყვა</p>
          )}
        </FilterGroup>
      )}

      {langOpts.length > 0 && (
        <FilterGroup
          title="ენა"
          defaultOpen={false}
          active={filters.langs.length > 0}
          action={filters.langs.length > 0 && <span className="tabular-nums">{filters.langs.length} არჩეული</span>}
        >
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
        <FilterGroup
          title="მინ. რეიტინგი"
          defaultOpen={false}
          active={filters.minRating > 0}
          action={filters.minRating > 0 && <span className="tabular-nums">{filters.minRating.toFixed(1)}+</span>}
        >
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
        <FilterGroup
          title="ქალაქი"
          defaultOpen={false}
          active={filters.cities.length > 0}
          action={filters.cities.length > 0 && <span className="tabular-nums">{filters.cities.length} არჩეული</span>}
        >
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

      {/* ⚠️ „ვერ იპოვე?" — THE INTAKE MOVED HERE FROM THE HEADER BAND
          (2026-08-31, from the owner's design canvas → Catalogue). It was a big
          green button beside the h1, i.e. an invitation to skip the list
          offered BEFORE anybody had looked at it. Under the filters is where
          the question „nothing here fits me" is actually asked, and the amber
          plate is the canvas's — the one warm tile on a page of white cards, so
          it reads as a different KIND of thing from the refinements above it.
          The catalogue's empty state keeps its own door (app/experts/client);
          this is the one for a list that returned results and still missed. */}
      {requestHref && (
        <div
          style={{ backgroundColor: tileHue(1).bg, borderColor: tileHue(1).border }}
          className="mt-4 hidden rounded-tile border p-4 lg:block"
        >
          <p className="font-display text-body font-bold text-ink-900">ვერ იპოვე?</p>
          <p className="mt-1.5 text-meta leading-[1.55] text-ink-600">
            დაწერე მოთხოვნა — ფასს თავად შემოგთავაზებენ.
          </p>
          <Link
            href={requestHref}
            className="mt-3 flex h-11 items-center justify-center rounded-field bg-ink-900 font-display text-body font-bold text-white
                       transition-colors duration-fast ease-out-quart hover:bg-ink-800
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            მიიღე შეთავაზება
          </Link>
        </div>
      )}
    </>
  )
}
