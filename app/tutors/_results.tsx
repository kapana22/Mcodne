'use client'
// /tutors — the results chrome: sort bar, pagination, compare modal.

import React from 'react'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { Eyebrow } from '@/components/Eyebrow'
import { fmtRating } from '@/lib/fmt'
import { Tutor } from './_data'

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
// /tutors was an expert with no photo, a 74-character bio and no published time,
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
const SORT_OPTS = [
  { id: 'rating',   l: 'ჩვენი რჩევით' },
  { id: 'new',      l: 'ახლის მიხედვით' },
  { id: 'sessions', l: 'სესიებით, კლებადი' },
  { id: 'price-a',  l: 'ფასით, ზრდადი' },
  { id: 'price-d',  l: 'ფასით, კლებადი' },
] as const

// Derived from SORT_OPTS so the select option and the „დახარისხებული X“ line can
// never drift apart again (they read „ახალი ექსპერტები“ vs „ახლის მიხედვით“).
const SORT_LABEL: Record<string, string> = Object.fromEntries(SORT_OPTS.map(o => [o.id, o.l]))

export const ResultsBar = ({ total, loading, sort, setSort, activeFilters, removeFilter, onReset, onOpenFilters, activeCount }: { total: number; loading?: boolean; sort: string; setSort: (v: string) => void; activeFilters: { k: string; v: string; raw?: string }[]; removeFilter: (k: string, v: string) => void; onReset: () => void; onOpenFilters: () => void; activeCount: number }) => (
  <div className="mb-5">
    {/* No count here either. It was removed in 2026-07 because the h1 already
        stated the same number twice on one screen; the h1 has since dropped it
        too, deliberately — a roster of ten should not lead with „ten". The line
        keeps the thing neither heading can say: how the list is ordered. */}
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 lg:gap-3 mb-3">
      <p className="text-meta text-ink-500 min-w-0 truncate">
        {loading ? 'იტვირთება…' : <>დახარისხებული <span className="text-ink-700 font-display font-semibold">{SORT_LABEL[sort]}</span></>}
      </p>
      {/* THE CONTROLS GET THEIR OWN ROW BELOW lg (2026-08-02). They used to sit
          beside the „დახარისხებული X" line under a `max-w-[68%]` cap, which at
          390px left the select 99px wide: with 50px of chrome (pl-3.5 pr-9) the
          value rendered as „ჩვე…" and the line beside it as „დახარისხებუ…" —
          neither the active sort nor its label was readable, on the one control
          that says how the list is ordered. The cap was there to stop
          `flex-wrap` dropping the SELECT below the FILTER BUTTON (two rows of
          controls); stacking the label instead keeps the two controls paired on
          one row and costs ~22px once. From lg up nothing changes. */}
      <div className="flex items-center gap-2 lg:shrink-0 lg:max-w-[68%]">
        {/* Filter button — BELOW lg only. From lg up the hero renders the inline
            dropdown row, so a drawer trigger next to it was a second door to the
            same state (and the one people kept missing). */}
        <button
          type="button"
          onClick={onOpenFilters}
          className="lg:hidden h-11 pl-3 pr-3.5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 font-display text-small font-semibold text-ink-800 inline-flex items-center gap-1.5 transition-colors duration-fast shrink-0"
        >
          <Icon.sliders className="w-3.5 h-3.5" />
          ფილტრები
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white font-display text-meta font-bold tabular-nums">
              {activeCount}
            </span>
          )}
        </button>
        <div className="relative min-w-0 flex-1 group">
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            aria-label="სორტირება"
            className="appearance-none w-full h-11 pl-3.5 pr-9 rounded-btn bg-white border border-ink-200 hover:border-ink-300 focus:border-brand-400 font-display text-small font-medium text-ink-800 focus:outline-none cursor-pointer truncate"
          >
            {SORT_OPTS.map(o => <option key={o.id} value={o.id}>{o.l}</option>)}
          </select>
          <Icon.chevD className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-500 pointer-events-none transition-transform duration-fast group-focus-within:rotate-180 group-focus-within:text-brand-600" />
        </div>
      </div>
    </div>

    {/* Active filter chips */}
    {activeFilters.length > 0 && (
      <div className="flex flex-wrap items-center gap-1.5 motion-safe:animate-fade-in-fast">
        {activeFilters.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1 pl-3 pr-1 h-8 rounded-pill bg-white border border-ink-200 hover:border-ink-300 text-ink-800 text-meta font-display font-medium tracking-wide transition-colors duration-fast">
            {f.v}
            <button
              type="button"
              onClick={() => removeFilter(f.k, f.raw ?? f.v)}
              aria-label={`წაშალე ფილტრი: ${f.v}`}
              className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-ink-100 hover:text-ink-800 text-ink-500 transition-colors duration-fast ml-0.5"
            >
              <Icon.x className="w-3 h-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={onReset}
          className="text-meta font-display font-semibold text-ink-500 hover:text-brand-700 h-8 px-2 transition-colors duration-fast"
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
export const CompareModal = ({ open, tutors, onClose, onBook }: { open: boolean; tutors: Tutor[]; onClose: () => void; onBook: (t: Tutor) => void }) => {
  // Escape / focus trap / scroll-lock come from the Sheet container.
  if (!open || tutors.length === 0) return null

  // Compute "best" per row for highlighting
  const best = {
    rating:   Math.max(...tutors.map(t => t.rating)),
    reviews:  Math.max(...tutors.map(t => t.reviews)),
    sessions: Math.max(...tutors.map(t => t.sessions)),
    price:    Math.min(...tutors.map(t => t.price)),
  }

  const Row = ({ label, value, isBest }: { label: string; value: React.ReactNode; isBest?: boolean }) => (
    <div className={`px-3 py-2.5 ${isBest ? 'bg-brand-50/60' : ''}`}>
      <Eyebrow tone="muted" className="mb-1">{label}</Eyebrow>
      <div className={`font-display text-body font-semibold tabular-nums ${isBest ? 'text-brand-800' : 'text-ink-900'}`}>{value}</div>
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      ariaLabel="ექსპერტების შედარება"
      eyebrow="სწრაფი შედარება"
      title={`${tutors.length} ექსპერტი გვერდიგვერდ`}
    >
        {/* Full-bleed, sideways-scrollable compare table inside the sheet body */}
        <div className="overflow-x-auto -mx-5 sm:-mx-6 -my-4">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${tutors.length}, minmax(220px, 1fr))` }}>
            {tutors.map(t => (
              <div key={t.id} className="border-r border-ink-100 last:border-r-0">
                {/* Header */}
                <div className="px-4 py-5 border-b border-ink-100 text-center">
                  <img src={t.avatarUrl || DEFAULT_AVATAR} alt={t.name} className="w-16 h-16 mx-auto rounded-full object-cover ring-2 ring-ink-200 mb-3" />
                  <div className="font-display text-body font-bold text-ink-900 tracking-tight truncate">{t.name}</div>
                  <div className="text-meta text-ink-500 mt-0.5 truncate">{t.cat}</div>
                  {t.superExpert && <span className="inline-flex items-center gap-1 mt-2 px-1.5 h-5 rounded-pill bg-ink-900 border border-transparent text-white font-display text-micro font-bold uppercase"><Icon.spark className="w-3 h-3" /> Super</span>}
                </div>
                <Row label="რეიტინგი" isBest={t.rating === best.rating} value={<span className="inline-flex items-center gap-1"><Icon.star className="w-3.5 h-3.5 text-warning-500" />{fmtRating(t.rating)} · {t.reviews}</span>} />
                <Row label="სესია" isBest={t.sessions === best.sessions} value={<>{t.sessions.toLocaleString()}</>} />
                <Row label="ფასი"          isBest={t.price === best.price}      value={<>₾{t.price}</>} />
                <Row label="ენები"          value={<span className="text-meta text-ink-700 font-normal">{t.langs.join(' · ')}</span>} />
                <div className="p-3 border-t border-ink-100">
                  <button type="button" onClick={() => { onClose(); onBook(t) }} className="w-full h-11 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center justify-center gap-1.5 transition-colors duration-fast">
                    დაჯავშნე
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
    </Sheet>
  )
}