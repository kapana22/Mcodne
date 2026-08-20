'use client'
// /experts — the filter model, its controls, and the rail that draws them.

import React from 'react'
import { Icon } from '@/components/Icon'
import { FilterGroup, FilterNest, FilterPanel, FilterRow } from '@/components/catalog/FilterPanel'
import { LANG_LABELS, PRIMARY_LANG_CODES } from '@/lib/languages'
import { primaryPrice } from '@/components/booking/slots'
import { type Capability } from '@/lib/capabilities'
import { tradeTopicIds, type CatalogItem } from '@/lib/catalogItems'
import { LIVE_SERVICE_GROUPS } from '@/lib/serviceProfile'
import { CITIES, ONE_CITY } from '@/lib/requestTopics'
import { LiveCat } from './_data'

// ⚠️ ONE STATE, ONE SURFACE (2026-08-19). Owner: „სერვისები და ექპერტები უნდა
// გაერთიანდეს და პატარა გადასართავი ექნება."
//
// Until tonight this page had TWO filter surfaces: a horizontal row of labeled
// dropdown boxes in the hero from `lg` up, and a `Sheet` drawer holding a second
// copy of the same refinements below it. Both wrote the same `filters` object,
// which is what kept them honest — but it was two renderings of one idea, and
// neither looked anything like /experts, the other half of the same product one
// tap away. The refinements now live in ONE place: the shared rail
// (components/catalog/FilterPanel), 240px and sticky from `lg`, folded into
// components/catalog/MobileCollapse below it. Same component at both
// breakpoints, so „the two surfaces disagree" is not a bug that can exist here
// any more. The search field and the sort select were never filters and moved
// to the results header (app/experts/_results.tsx).
//
// ⚠️ THE SET IS NOT FIXED — a refinement is offered only while it can actually
// change the result set. See usefulLangs / ratingUseless below: the language
// and rating controls hide themselves when their options would return everyone
// or nobody, and reappear on their own as the roster grows. Measured on
// 2026-08-12, ქართული matched 21 of 21 experts and no expert had a single
// review, so both were pure decoration. The availability filter was removed
// outright the same day (owner's call): it cut four of twenty-one results and
// led the page with „when are they free", which is not how anybody chooses.

// Price filter is now a BUDGET BAND (min + max), so budget-sensitive buyers
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

// Per-option result counts for the three facets that are NOT self-pruning.
//
// The sphere list has always hidden options with `expertCount === 0` — a
// category nobody works in is not a refinement. Rating, availability and Super
// were hardcoded and never checked against the roster, so all three shipped as
// guaranteed-zero facets: measured live 2026-08-02, `?minRating=4`, `?super=1`
// and `?avail=today` each returned 0 of 11 experts (nobody has a review yet,
// nobody is admin-featured, nobody has a slot left today). Tapping any of them
// emptied the page with no explanation. Now every option carries its own count
// and a zero one is disabled — the same honesty, one layer earlier.
// `langs` and `pool` were added 2026-08-12, and the reason is arithmetic on the
// live roster: ქართული is spoken by 21 of the 21 experts in browse. An option
// that returns EVERYONE is not a filter — it is a button that appears to do
// something and does nothing, which is the same trap as the zero-count option
// this block already guards against, seen from the other end. `pool` is the
// count that option would be measured against, so „matches all" is decidable.
// ⚠️ SINCE THE MERGE (2026-08-19) TWO OF THESE ARE ROSTER-WIDE, NOT
// FILTER-RELATIVE, and the split is deliberate rather than sloppy.
//   `types` / `trades` / `cities` — how many PEOPLE exist, full stop. A type row
//     that read „კონსულტაცია (0)" the moment somebody ticked a city would be
//     telling the reader the site has no experts. The same argument
//     app/experts/_masterData → filterCounts already writes down for the trades.
//   `rating` / `langs` / `superOnly` — measured against the loaded roster with
//     their OWN dimension excluded, which is what standard facet counts mean
//     and what this file has done since 2026-08-02.
export type Facets = {
  rating: Record<string, number>
  langs: Record<string, number>
  pool: number
  superOnly: number
  /** How many people offer each half. Roster-wide. */
  types: Record<Capability, number>
  /** By group id AND by topic id, straight from the server's one count query. */
  trades: Record<string, number>
  cities: Record<string, number>
}

/**
 * The language options worth SHOWING, given what the current search loaded.
 *
 * Two ways an option is useless, and both were live on 2026-08-12:
 *   count === 0     it returns nothing — the dead-end the file already guards
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

/** True when every rating option would return nothing — nobody has a review
 *  yet. The section is then a row of disabled chips explaining an absence,
 *  which is a sentence, not a control. */
export const ratingUseless = (facets: Facets) =>
  FILTER_RATINGS.every(r => (facets.rating[String(r)] ?? 0) === 0)

/* ───── Filters sidebar ───── */
/**
 * ⚠️ ONE FILTER OBJECT FOR THE WHOLE MERGED CATALOGUE (2026-08-19). Owner:
 * „ვიღაცას კონსულტაცია აქვს, ვიღაცას სერვისი, და ფილტრაცია დამატებოდა."
 *
 * `types` is the first and only refinement that speaks about BOTH halves; every
 * other field belongs to exactly one of them — `cats`/`langs`/`minRating`/
 * `superOnly`/`price` are questions about a consultation, `trades`/`cities` are
 * questions about a job. Which is precisely what `consultRefined` /
 * `workRefined` below are for.
 */
export type Filters = {
  /** Which halves of the offering are on screen. NEVER empty — see
   *  lib/catalogItems → resolveTypes / toggleType. */
  types: Capability[]
  cats: string[]
  minRate: number
  langs: string[]
  minRating: number
  superOnly: boolean
  price: [number, number]
  /** Job-side vocabulary: group ids and topic ids in one list, exactly as
   *  `?trade=` has always carried them. */
  trades: string[]
  cities: string[]
}

/** Is anything narrowing the CONSULTATION half? */
export const consultRefined = (f: Filters) =>
  f.cats.length > 0 || f.langs.length > 0 || f.minRating > 0 || f.superOnly ||
  priceBandActive(f.price[0], f.price[1])

/** Is anything narrowing the JOB half? */
export const workRefined = (f: Filters) => f.trades.length > 0 || f.cities.length > 0

// Category options are no longer hardcoded — they come from the live,
// admin-managed categories (GET /api/categories), passed down as `liveCats` and
// keyed by slug. See LiveCat / catNameOf near the top of the file.

// No counts here on purpose — the old hardcoded numbers (142/98/…) were
// fabricated and rendered as if real. If per-language counts ever return,
// they must be computed from the loaded result set.
// Labels come from lib/languages so the chips ALWAYS match what a card renders
// (they are compared as strings — a divergent spelling silently yields 0 hits).
// The SAME three the profile picker offers (lib/languages → PRIMARY_LANG_CODES),
// and for the same measured reason. „თურქული" was dropped 2026-07-31: not one
// expert speaks it, so the option could only ever return zero — the dead-end
// filter option is the same trap as a category chip pointing at an empty sphere.
export const FILTER_LANGS = PRIMARY_LANG_CODES.map(c => ({ l: LANG_LABELS[c] }))

// THE filter predicate — one function, two consumers: the visible list and the
// facet counts. `skip` drops exactly ONE dimension so a facet can count what its
// own options would yield against the OTHER active refinements (standard facet
// semantics). Sharing it is the point: a count computed by a second copy of this
// logic would promise „4.5+ (3)" and then hand back two cards.
//
// ⚠️ IT TAKES A PERSON NOW, NOT A TUTOR ROW (2026-08-19). Owner: „ექსპერტები და
// სერვისები ხო ერთია — ექსპერტს აქვს სერვისი რეალურად და პარალელურად აკეთებს
// კონსულტაციასაც." So the question is not „is this person a consultant" but
// „does this person OFFER something that survives what has been ticked", and a
// person who holds both halves must survive BOTH single-type filters.
//
// ⚠️ AND A REFINEMENT THAT BELONGS TO ONE HALF EXCLUDES THE OTHER. Tick
// „ბიზნესი" (a consultation category) while both types are on and the list
// narrows to consultations in ბიზნესი — it does NOT keep every plumber
// alongside them. Two reasons, and the second is the decisive one:
//   1. That is what the reader means. They asked a question only one half can
//      answer.
//   2. THE COUNTS WOULD OTHERWISE LIE. „ბიზნესი (4)" next to a list of ten is
//      the exact failure this file has documented since 2026-08-02, and it is
//      the reason every option here carries a real number.
// The known cost, written down rather than discovered: ticking a consultation
// refinement AND a job refinement at the same time hides even somebody who
// holds both halves, because neither of their offerings answers the pair. That
// pair is a contradiction of intent, and the empty state says so in words
// („ამ ფილტრით არავინ არის — მოხსენი ფილტრი").
export function passesFilters(item: CatalogItem, f: Filters, skip?: 'rating' | 'super'): boolean {
  const viaConsult =
    f.types.includes('CONSULT') && item.consult !== null && !workRefined(f) &&
    passesConsult(item.consult, f, skip)
  if (viaConsult) return true
  const viaWork =
    f.types.includes('WORK') && item.work !== null && !consultRefined(f) &&
    passesWork(item.work, f)
  return viaWork
}

/** The consultation half's own predicate — unchanged, field for field. */
function passesConsult(t: NonNullable<CatalogItem['consult']>, f: Filters, skip?: 'rating' | 'super'): boolean {
  if (skip !== 'super' && f.superOnly && !t.superExpert) return false
  if (skip !== 'rating' && f.minRating > 0 && (t.rating ?? 0) < f.minRating) return false
  /* Budget band — honor both the floor and the cap (NO_CAP = no ceiling).
     Compared against `primaryPrice`, the SAME number the card prints, never the
     raw flat rate — see that function's docblock for the two live rows this
     got wrong. */
  const shown = primaryPrice(t.consultations ?? [], t.price)
  if (shown < f.price[0] || shown > f.price[1]) return false
  // Match by category SLUG (stable), not the display name — a rename or a
  // hidden category can never silently drop matching experts.
  if (f.cats.length > 0 && (!t.catSlug || !f.cats.includes(t.catSlug))) return false
  if (f.langs.length > 0 && !t.langs.some(l => f.langs.includes(l))) return false
  return true
}

/** The job half's, and it is the SAME test app/experts/_masterData ran as SQL. */
function passesWork(m: NonNullable<CatalogItem['work']>, f: Filters): boolean {
  const topics = tradeTopicIds(f.trades)
  if (topics && !m.serviceIds.some(id => topics.has(id))) return false
  // ⚠️ AN EMPTY `areas` IS „I HAVE NOT SAID", NOT „NOWHERE". The routing treats
  // it as matching everywhere (lib/serviceProfile → covers), the server query
  // spelled that as `OR areas isEmpty`, and the count agrees — so a city filter
  // must not hide a master who named no city.
  if (f.cities.length > 0 && m.areaIds.length > 0 && !m.areaIds.some(c => f.cities.includes(c))) return false
  return true
}

/* ───── The rail ───── */

/**
 * EVERY REFINEMENT THE MERGED CATALOGUE OFFERS, in the shared panel — the same
 * rows, counts and footer both halves have drawn since 2026-08-19
 * (components/catalog/FilterPanel).
 *
 * ⚠️ THE TYPE SECTION REPLACED A NAVIGATION CONTROL (2026-08-19). Until that
 * evening the two halves were two catalogues with a pill switch between them
 * (components/VerticalSwitch, since deleted): „ექსპერტები | ხელოსნები", a pair
 * of LINKS above the h1 that swapped the whole page. The owner asked twice for
 * the opposite — „მოვიფიქროთ რომ იდენტურია უბრალოდ და ფილტრაციასავით უნდა
 * იყოს" — so it is now what it always looked like: two rows of the rail,
 * tickable together, with a roster-wide count each. There is ONE catalogue at
 * ONE address (/experts) and the selection is in it (`?type=`).
 *
 * ⚠️ AND THE SECTIONS BELOW IT ARE CONTEXTUAL. A section is drawn only while
 * the half it narrows is on screen: „ენა" cannot say anything about a plumber
 * and „ქალაქი" cannot say anything about a video consultation. The measured
 * reason is in DESIGN_LOG — on sheniani.ge 68 of 213 offered filters returned
 * nobody, and a filter that can only empty the page is worse than no filter,
 * because tapping it looks like it worked. With both halves on, both sets are
 * drawn under their own heading and each carries one muted line naming which
 * half it narrows (FilterGroup → `note`).
 *
 * ⚠️ THE ROWS ARE BUTTONS, NOT LINKS. Both halves are now filtered in the
 * browser over one loaded array, and the container writes the whole selection
 * back into the URL (`?type=`, `?cats=`, `?trade=`, `?city=` …), so every view
 * is still an address somebody can send and Back still walks through them — but
 * a row is state, and a link that reloads the page to reach state the page
 * already holds is slower and looks navigable when it is not.
 *
 * ⚠️ AND EVERY OPTION STILL CARRIES ITS OWN COUNT. The honesty rule this file
 * has enforced since 2026-08-02: a row that says „(3)" and hands back two cards
 * is the failure `passesFilters` exists to stop. The budget slider is the one
 * control with no number — a range has no single count to print, and inventing
 * one would be exactly the fabrication the rest of this file removed.
 */
export const TutorFilters = ({ filters, setFilters, liveCats, facets, activeCount, onReset }: {
  filters: Filters
  setFilters: (f: Filters) => void
  liveCats: LiveCat[]
  facets: Facets
  /** How many refinements are on. Drives the footer — the way out only exists
   *  when there is something to leave. */
  activeCount: number
  onReset: () => void
}) => {
  // ⚠️ EVERY SECTION IS ALWAYS DRAWN (2026-08-19). They used to appear and
  // disappear with the ticked type, so the rail rearranged itself under the
  // reader's hand — owner: „ფილტრაცია ძალიან დაბნეულია, არეულია". A filter
  // narrows; it does not restructure the page. Nothing here is dead either:
  // the list holds both kinds, so every section has matches.
  const showConsult = true
  const showWork = true
  // Both halves on screen → each section says which one it narrows. With a
  // single type ticked the whole list IS that type, and the line would be a
  // sentence repeating the heading above it.
  const mixed = showConsult && showWork
  const consultNote = undefined
  const workNote = undefined

  // Hidden, not dimmed, while nobody is Super (owner, 2026-08-10). A greyed-out
  // control with „0" next to it still asks to be read and still says the
  // platform has a tier it cannot fill. It comes back on its own the moment an
  // expert is featured — the switch is driven by the facet count, not a flag.
  const superDead = facets.superOnly === 0 && !filters.superOnly
  const ratingDead = ratingUseless(facets)
  const langOpts = usefulLangs(facets)

  return (
    <FilterPanel reset={activeCount > 0 ? { onClick: onReset } : undefined}>

      {showConsult && !superDead && (
        // Its own block with no heading: one row does not need a title
        // repeating it. The predicate it names is the real one (see
        // `superExpert` in the row mapper): verified AND 4.8+ AND featured.
        <FilterGroup>
          <FilterRow
            on={filters.superOnly}
            onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
            count={facets.superOnly}
            label={<span className="inline-flex items-center gap-1.5"><Icon.spark aria-hidden className="w-3 h-3 text-ink-400" />Super-ექსპერტი</span>}
          />
        </FilterGroup>
      )}

      {showConsult && (
        <>
          {/* ⚠️ TWO BLOCKS, IN THE SITE'S OWN ORDER (2026-08-20). It was one
              list sorted by COUNT, and count is not what this site is about:
              the everyday trades fell to the bottom with zeros beside them
              while six professional rows sat above, and a visitor read the
              ordering as a ranking of what mattered.

              The order is now the PRODUCT's, and it does not move as the
              roster does. Owner: „უფრო მაღალი დონის სერვისები და
              ინტელექტუალურიც იყოს… პარალელურად სერვისებსაც, რაც ყოველდღიურად
              სჭირდება — დალაგება და ხელოსანი, ესეც." Professional first,
              because that is what the site leads with; everyday second,
              because it is half of what it sells.

              Still ONE question — the two blocks are labelled sections of the
              same rail, not the two catalogues that were merged in stage 10.
              They keep separate state fields (`cats` are category slugs,
              `trades` are topic ids) because they filter different columns; a
              reader cannot tell, and should not have to. */}
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
                  // Inside a block, count IS the right order — it says where
                  // there is somebody to answer, without claiming the block
                  // itself is more important than the one below.
                  .sort((a, b) => b.count - a.count)
                  .map(row => (
                    <FilterRow key={row.key} on={row.on} onClick={row.toggle} label={row.label} count={row.count} />
                  ))}
          </FilterGroup>

          {/* OPEN, like the block above it. Collapsing it made the ordering into
              a hiding place: the professional block leads because it is drawn
              FIRST, which is enough — a second tap to reach half of what the
              site sells is a barrier, not a hierarchy. */}
          {LIVE_SERVICE_GROUPS.length > 0 && (
            <FilterGroup title="ყოველდღიური სერვისები">
              {LIVE_SERVICE_GROUPS
                .map(g => ({
                  key: `t:${g.id}`,
                  label: g.label,
                  count: facets.trades[g.id] ?? 0,
                  on: filters.trades.includes(g.id),
                  toggle: () => setFilters({ ...filters, trades: toggleIn(filters.trades, g.id) }),
                  topics: g.topics,
                }))
                .sort((a, b) => b.count - a.count)
                .map(row => (
                  <div key={row.key} className="flex flex-col gap-1">
                    <FilterRow on={row.on} onClick={row.toggle} label={row.label} count={row.count} />
                    {/* The narrower topics unfold only under a ticked trade —
                        all of them at once is thirty-nine rows above the first
                        card, and the rail would be the page. */}
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
        </>
      )}

      {showConsult && (
        <FilterGroup title="ფასი" note={consultNote} defaultOpen={false} active={priceBandActive(filters.price[0], filters.price[1])}>
          <PriceRange value={filters.price} onChange={p => setFilters({ ...filters, price: p })} />
        </FilterGroup>
      )}

      {showConsult && langOpts.length > 0 && (
        <FilterGroup title="ენა" note={consultNote} defaultOpen={false} active={filters.langs.length > 0}>
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

      {showConsult && !ratingDead && (
        <FilterGroup title="მინ. რეიტინგი" note={consultNote} defaultOpen={false} active={filters.minRating > 0}>
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

      {/* ⚠️ THE JOB HALF'S TWO SECTIONS, MOVED HERE VERBATIM from the retired
          app/masters/_filters.tsx — same vocabulary, same nesting, same
          roster-wide counts. The only change is the mechanism: a row was an
          address there and is state here, because there is one list now. */}
      
      {/* ⚠️ NO CITY GROUP WHILE THERE IS ONE CITY (2026-08-20). A filter whose
          every row matches everything narrows nothing; it is a control that
          teaches the visitor the rail is full of things that do not work. It
          returns by itself the day a second city is served — see CITIES. */}
      {showWork && !ONE_CITY && (
        <FilterGroup title="ქალაქი" note={workNote} defaultOpen={false} active={filters.cities.length > 0}>
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
      {/* ⚠️ THE TYPE SECTION IS GONE (2026-08-19), and this note is why nobody
          should add it back. It was first, then last, and neither was right: a
          category already answers it. „სანტექნიკა" IS a service; „ფსიქოლოგია"
          IS a consultation — asking again underneath was the same question
          twice, and the word „სერვისი" then appeared both as a group heading
          and as a checkbox meaning something else. The owner's rule stands:
          a consultation is one KIND of service, never a second axis.

          `filters.types` survives as MECHANISM — `?type=WORK` is still a
          linkable narrowing (the footer uses it) and lib/catalogItems still
          filters on it. It simply has no control of its own. */}
    </FilterPanel>
  )
}
