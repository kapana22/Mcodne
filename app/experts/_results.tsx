'use client'
// /experts — the results chrome: the header row (search · sort · layout), the
// active-filter chips, pagination, the compare modal.

import React from 'react'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Icon } from '@/components/Icon'
import { FilterChip } from '@/components/FilterChip'
import { Sheet } from '@/components/Sheet'
import { ViewToggle } from '@/components/catalog/ViewToggle'
import type { CatalogView } from '@/components/catalog/useCatalogView'
import { Eyebrow } from '@/components/Eyebrow'
import { fmtRating } from '@/lib/fmt'

/* Quick-Book popup DELETED (DESIGN_FIX_PROMPT 1.1) — the listing's
   booking CTA opens the shared components/booking/BookingFlow with the
   expert preloaded (it fetches /api/tutors/{id} itself). The ~680-line
   diverging copy (own tz labels, own slot math, no tier support) is gone;
   every former "MUST stay in sync" comment is now an import. */

/* Service-type toggle removed — unified experience shows all tutors, sorted
   by live-now first (server-side). */

/* ───── Sort + view ───── */
// Worded sort labels — no ASCII arrows (they read as noise to screen readers
// and mean nothing in Georgian).
//
// DEFAULT CHANGED 'new' → 'rating' (2026-07-31). The old default put whoever
// signed up most recently at the top of the shop window, and on a 9-person
// roster the newest signup is reliably the LEAST finished one: the first card on
// /experts was an expert with no photo, a 74-character bio and no published time,
// while five complete, bookable profiles sat below her. „Don't bury a new expert"
// was the right instinct, but sorting by signup date is the wrong tool for it —
// it optimises for the expert's feelings at the direct cost of the visitor's
// first impression, which is the one thing a marketplace with 9 experts cannot
// afford to spend.
//
// 'rating' is NOT „highest rating first" — it keeps queryTutors' curated order:
// bookable experts bubbled above unbookable ones, then verified→rating. That is
// exactly „our recommendation", and it surfaces a brand-new expert the moment
// they are bookable, which is the outcome the old default was reaching for.
// „ახლის მიხედვით" stays available as an explicit choice.
// ⚠️ „სესიებით, კლებადი" WAS THE THIRD OPTION AND IS GONE (2026-08-25). It
// sorted on `TutorProfile.sessionsCount` — how many consultations somebody had
// delivered — and that column went with the table on 2026-08-24. The option
// stayed in this list and the switch in client.tsx had no `case 'sessions'`, so
// choosing it fell through and returned the list UNCHANGED: a control that
// looks like it works, changes the „დახარისხებული X" line to say it worked, and
// does nothing. Every option here must have an arm in that switch.
const SORT_OPTS = [
  { id: 'rating',   l: 'ჩვენი რჩევით' },
  { id: 'new',      l: 'ახლის მიხედვით' },
  { id: 'price-a',  l: 'ფასით, ზრდადი' },
  { id: 'price-d',  l: 'ფასით, კლებადი' },
] as const

// Derived from SORT_OPTS so the select option and the „დახარისხებული X“ line can
// never drift apart again (they read „ახალი ექსპერტები“ vs „ახლის მიხედვით“).
const SORT_LABEL: Record<string, string> = Object.fromEntries(SORT_OPTS.map(o => [o.id, o.l]))

export const ResultsBar = ({ total, loading, sort, setSort, view, setView, activeFilters, removeFilter, onReset, filters }: {
  total: number
  loading?: boolean
  sort: string
  setSort: (v: string) => void
  view: CatalogView
  setView: (v: CatalogView) => void
  activeFilters: { k: string; v: string; raw?: string }[]
  removeFilter: (k: string, v: string) => void
  onReset: () => void
  /** ⚠️ THE PHONE'S FILTER TRIGGER (2026-09-01) — the panel itself is still the
   *  rail's, one instance, at both widths (components/catalog/MobileCollapse).
   *  This is the button that opens it, and it is here rather than above the
   *  rail because the three controls that describe a list — narrow it, order
   *  it, draw it — are one row on a phone instead of three stacked bars. */
  filters: { panelId: string; open: boolean; onToggle: () => void; count: number }
}) => (
  <div className="mb-5">
    {/* ⚠️ THE SEARCH FIELD LEFT THIS BAR ON 2026-08-31 and is in the header
        band now (app/experts/_hero), which is the owner's design canvas's
        placement and is the better argument. It sat here from 2026-08-19 on the
        reasoning that „neither search nor sort narrows a set — one replaces it
        and one reorders it, so both belong with the results". The half about
        SORT is untouched and it is still here. The half about SEARCH stopped
        being true when the home page's hero began handing a typed query to this
        page: the field that query lands in cannot be the fourth control down,
        below a filter rail, on a page the reader arrived at mid-search.
        What is left is the two controls that describe the list — how it is
        ordered and how it is drawn — plus the count and the undo chips. */}
    {/* ⚠️ THE SORT STRETCHES ON A PHONE (2026-08-31, second pass). With the
        search field gone from this row it was two small controls pinned to the
        right of an otherwise empty line — measured live at 500px, they read as
        a stray cluster floating in the margin. The select takes the room the
        field left; from `sm` the pair goes back to sitting right, where a
        control that describes the list belongs. */}
    <div className="mb-3 flex items-center gap-2 sm:justify-end">
      {/* ⚠️ `lg:hidden` — FROM `lg` THE RAIL IS SIMPLY THERE and a button that
          opens what is already open would be a control that lies. */}
      <button
        type="button"
        aria-expanded={filters.open}
        aria-controls={filters.panelId}
        onClick={filters.onToggle}
        className={`lg:hidden h-11 shrink-0 inline-flex items-center gap-2 rounded-btn border px-3 font-display text-small font-semibold
                    transition-[background-color,border-color] duration-fast ${
          filters.open || filters.count > 0
            ? 'border-brand-700 bg-brand-50 text-brand-900'
            : 'border-ink-200 bg-white text-ink-900 hover:border-ink-300 hover:bg-ink-50'
        }`}
      >
        <Icon.sliders aria-hidden className="w-4 h-4 shrink-0 text-brand-600" />
        <span>ფილტრი</span>
        {filters.count > 0 && <span className="tabular-nums text-brand-700">{filters.count}</span>}
      </button>
      <div className="group relative min-w-0 flex-1 sm:flex-none sm:w-[200px]">
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          aria-label="სორტირება"
          className="h-11 w-full cursor-pointer appearance-none truncate rounded-btn border border-ink-200 bg-white pl-3.5 pr-9 font-display text-small font-medium text-ink-800 hover:border-ink-300 focus:border-brand-400 focus:outline-none"
        >
          {SORT_OPTS.map(o => <option key={o.id} value={o.id}>{o.l}</option>)}
        </select>
        <Icon.chevD className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-500 transition-transform duration-fast group-focus-within:rotate-180 group-focus-within:text-brand-600" />
      </div>
      <ViewToggle view={view} onChange={setView} />
    </div>

    {/* ⚠️ THE COUNT IS BACK, AND IT BELONGS HERE (2026-08-19). It left the h1
        in 2026-07 for a good reason — „10 ექსპერტი შენთვის" put the smallest
        true thing about the marketplace in its largest type — and that reason
        is untouched. What changed is that there is ONE list now
        (lib/catalogItems): with two halves and a type filter above them, „how
        many are on screen" is the question the reader is actually asking, and
        it was the one fact the merged page could not state. „ნაჩვენებია", the
        word /experts already used, not „ნაპოვნია": this line describes the
        cards below it, not a total the page did not count.

        No noun after the number, deliberately. The list can hold consultations,
        jobs, or both, and picking one word („ექსპერტი") would be false half the
        time while „ექსპერტი და ხელოსანი" is a sentence, not a counter. The type
        rows in the rail carry their own counts, each with its own word. */}
    {/* ⚠️ AND SINCE 2026-09-02 IT ONLY APPEARS ONCE SOMETHING IS FILTERED.
        Owner, on the roster size: „არასად არ ეწეროს ეგ ინფო, არასაჭიროა."
        On first load this line held the whole roster — the same claim the
        catalogue's hero and the home page's tile were making, in a third place
        and (because the three counted with different rules) a third number.

        It is kept for the refined case because there it is not a claim about
        the platform at all: somebody who has just ticked a filter needs to be
        told what it did, and „ნაჩვენებია 4" is that answer. No filter, no
        answer needed, no line. */}
    {activeFilters.length > 0 && (
      <p className="text-meta text-ink-500 min-w-0 truncate">
        {/* ⚠️ THE SORT HALF IS `sm:` ONLY (2026-09-01). On a phone the select
            saying „ახლის მიხედვით" sits one row above this line, so „დახარისხებული
            ახლის მიხედვით" is the same words twice in the same glance; the count
            is the half that is not printed anywhere else. */}
        {loading ? 'იტვირთება…' : <>ნაჩვენებია <span className="text-ink-700 font-display font-semibold tabular-nums">{total}</span><span className="hidden sm:inline"> · დახარისხებული <span className="text-ink-700 font-display font-semibold">{SORT_LABEL[sort]}</span></span></>}
      </p>
    )}

    {/* Active filter chips — the rail folds on a phone, so this row is where a
        refinement stays VISIBLE and undoable at every width.

        ⚠️ THEY ARE `FilterChip`s NOW (2026-08-19), i.e. the catalogue's one chip
        primitive, and the whole 44px pill removes the refinement. They were
        hand-built h-8 pills with a 24px „×" inside: two nested targets, both
        under the canon's 40px tap floor, on the only control that undoes a
        filter. */}
    {activeFilters.length > 0 && (
      <div className="mt-3 flex flex-wrap items-center gap-1.5 motion-safe:animate-fade-in-fast">
        {activeFilters.map((f, i) => (
          <FilterChip
            key={i}
            on
            onClick={() => removeFilter(f.k, f.raw ?? f.v)}
            aria-label={`წაშალე ფილტრი: ${f.v}`}
          >
            {f.v}
            <Icon.x aria-hidden className="w-3 h-3 text-brand-700" />
          </FilterChip>
        ))}
        <button
          type="button"
          onClick={onReset}
          className="text-meta font-display font-semibold text-ink-500 hover:text-brand-700 h-11 px-2 transition-colors duration-fast"
        >
          გასუფთავება
        </button>
      </div>
    )}
  </div>
)

/* ───── Pagination ─────
 * Real pagination: page count is derived from the result total (passed in via
 * `totalPages`). The window shows at most 5 numbered pages around the current
 * one with ellipses, and prev/next clamp to the [1, totalPages] range. When
 * there is only a single page (or none), the control hides itself entirely. */
export const Pagination = ({ page, setPage, totalPages }: { page: number; setPage: (n: number) => void; totalPages: number }) => {
  if (totalPages <= 1) return null

  // Build a compact, gap-aware page list: 1 … (page-1, page, page+1) … last
  const pages: (number | '…')[] = []
  const push = (n: number) => { if (n >= 1 && n <= totalPages && !pages.includes(n)) pages.push(n) }
  push(1)
  if (page - 1 > 2) pages.push('…')
  for (let n = page - 1; n <= page + 1; n++) push(n)
  if (page + 1 < totalPages - 1) pages.push('…')
  push(totalPages)

  return (
    <div className="mt-10 flex items-center justify-between gap-4 flex-wrap">
      <div className="text-small text-ink-500">
        გვერდი <span className="font-display font-semibold text-ink-800 tabular-nums">{page}</span> / <span className="tabular-nums">{totalPages}</span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="წინა გვერდი" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="w-10 h-10 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-btn border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast">
          <Icon.chevL className="w-3.5 h-3.5" />
        </button>
        {pages.map((p, i) => (
          typeof p === 'number' ? (
            <button
              key={i}
              type="button"
              aria-current={page === p ? 'page' : undefined}
              onClick={() => setPage(p)}
              className={`min-w-[40px] sm:min-w-[36px] h-10 sm:h-9 px-2 rounded-btn font-display text-small font-semibold tabular-nums transition-colors duration-fast ${page === p ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-ink-50'}`}
            >
              {p}
            </button>
          ) : (
            <span key={i} className="px-1 text-ink-400 text-small">{p}</span>
          )
        ))}
        <button type="button" aria-label="შემდეგი გვერდი" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="w-10 h-10 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-btn border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast">
          <Icon.chevR className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}


/* ───── Page ───── */
/* ───── Quick-Compare modal ───── */
/* ⚠️ QUICK-COMPARE WAS HERE AND IS GONE (2026-08-24). It put three
   consultation profiles side by side on four fields — rating, session count,
   price and languages — three of which the one provider row does not carry a
   comparable value for. A table with one real column is not a comparison, and
   the strip that opened it went with it. */
