'use client'
// /tutors — the filter model and its controls: price band, language,
// availability and rating, plus the drawer that hosts them.

import React, { useState, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { LANG_LABELS, PRIMARY_LANG_CODES } from '@/lib/languages'
import { LiveCat, Tutor } from './_data'

// Filtering is ONE state, TWO breakpoint-exclusive surfaces (2026-07-27):
//   • lg and up  → the hero's inline row of labeled dropdowns (სფერო / ფასი /
//     ენა / ხელმისაწვდომობა / შეფასება + the Super toggle). Every refinement is
//     one click away, so the „ფილტრები" drawer trigger is `lg:hidden`.
//   • below lg   → the search field + the one-tap category rail, with the full
//     set in the „ფილტრები" drawer (FiltersPanel) — five stacked h-12 boxes
//     would push the first result off a phone screen.
// They are never both on screen, and both write the SAME `filters` object, so
// the page can no longer show two contradicting „active" states. The earlier
// inline row was dropped partly because it lacked the rating filter; the box is
// there now, so desktop reaches all six.

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

// Labeled filter dropdown: a box that shows „label / current value" and opens a
// popover of options. Restored 2026-07-27 — this inline row IS the desktop
// filter UI (the user asked for the redundant „ფილტრები" drawer trigger to go,
// not this). Closes on outside mousedown.
export const FilterBox = ({ label, value, active, children }: { label: string; value: string; active: boolean; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    // Escape hands focus back to the trigger — otherwise a keyboard user is
    // left focused on an option inside a popover that no longer exists.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button ref={triggerRef} type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className={`h-12 min-w-[132px] w-full lg:w-auto px-3.5 rounded-card border text-left flex items-center justify-between gap-2 transition-all duration-fast ${active ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-200' : 'border-ink-200 hover:border-ink-300 bg-white'}`}>
        <span className="min-w-0">
          <span className="block text-micro font-display font-semibold uppercase text-ink-500">{label}</span>
          <span className={`block font-display text-small font-bold truncate ${active ? 'text-brand-800' : 'text-ink-900'}`}>{value}</span>
        </span>
        <Icon.chevD className={`w-4 h-4 text-ink-400 shrink-0 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        // Narrow screens never render this row (it's lg-only), but keep the
        // inset-x-0 fallback so the panel can't poke past a 1024px viewport.
        <div className="absolute z-40 top-full inset-x-0 lg:inset-x-auto lg:left-0 mt-2 lg:w-[248px] rounded-card border border-ink-200 bg-white shadow-float p-2 max-h-[340px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  )
}

// `count` = how many of the LOADED experts this option would actually return
// (see the `facets` memo in the page component). A zero-count option is not a
// filter, it's a dead end — so
// it renders disabled with its 0 on show rather than silently emptying the page.
// It stays clickable while ACTIVE, otherwise a filter that ended up at zero
// could never be switched off again.
export const CheckOpt = ({ label, on, onToggle, count }: { label: React.ReactNode; on: boolean; onToggle: () => void; count?: number }) => {
  const dead = typeof count === 'number' && count === 0 && !on
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={dead}
      title={dead ? 'ამ პარამეტრით ექსპერტი ჯერ არ არის' : undefined}
      className={`w-full flex items-center gap-2.5 px-2 py-2.5 rounded-btn text-left transition-colors duration-fast ${dead ? 'opacity-45 cursor-not-allowed' : 'hover:bg-ink-50'}`}
    >
      <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 ${on ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-300'}`}>{on && <Icon.check className="w-3 h-3" />}</span>
      <span className="flex-1 min-w-0 text-small text-ink-800">{label}</span>
      {typeof count === 'number' && <span className="shrink-0 text-meta text-ink-500 tabular-nums">{count}</span>}
    </button>
  )
}

// The rating thresholds the drawer offers, shared so the inline „შეფასება" box
// and FiltersPanel can never diverge.
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
export type Facets = { rating: Record<string, number>; avail: Record<string, number>; superOnly: number }

/* ───── Filters sidebar ───── */
export type Filters = {
  cats: string[]
  minRate: number
  langs: string[]
  available: string[]
  minRating: number
  superOnly: boolean
  price: [number, number]
}

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

// Only expose availability windows we can actually evaluate from the list
// data (each tutor's soonest free slot, `nextSlotAt`). "Weekend/evening"
// needed per-slot data the list endpoint doesn't return, so they were dropped
// rather than shipped as no-op checkboxes.
export const FILTER_AVAIL = [
  { id: 'today', l: 'დღეს' },
  { id: 'week',  l: 'ამ კვირას' },
]

const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// Does this expert's soonest free slot fall inside the window `id`?
export const availMatches = (t: Tutor, id: string, now: Date): boolean => {
  const next = t.nextSlotAt ? new Date(t.nextSlotAt) : null
  if (!next) return false
  if (id === 'today') return isSameDay(next, now)
  if (id === 'week') return next.getTime() <= now.getTime() + 7 * 24 * 3600_000
  return false
}

// THE filter predicate — one function, two consumers: the visible list and the
// facet counts. `skip` drops exactly ONE dimension so a facet can count what its
// own options would yield against the OTHER active refinements (standard facet
// semantics). Sharing it is the point: a count computed by a second copy of this
// logic would promise „4.5+ (3)" and then hand back two cards.
export function passesFilters(t: Tutor, f: Filters, now: Date, skip?: 'rating' | 'avail' | 'super'): boolean {
  if (skip !== 'super' && f.superOnly && !t.superExpert) return false
  if (skip !== 'rating' && f.minRating > 0 && (t.rating ?? 0) < f.minRating) return false
  // Budget band — honor both the floor and the cap (NO_CAP = no ceiling).
  if (t.price < f.price[0] || t.price > f.price[1]) return false
  // Match by category SLUG (stable), not the display name — a rename or a
  // hidden category can never silently drop matching experts.
  if (f.cats.length > 0 && (!t.catSlug || !f.cats.includes(t.catSlug))) return false
  if (f.langs.length > 0 && !t.langs.some(l => f.langs.includes(l))) return false
  // Availability window — evaluated against the soonest free slot.
  if (skip !== 'avail' && f.available.length > 0 && !f.available.some(a => availMatches(t, a, now))) return false
  return true
}

const FilterSection = ({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full py-4 flex items-center justify-between text-left hover:text-ink-900 transition-colors duration-fast">
        <span className="font-display text-micro font-semibold uppercase text-ink-700">{title}</span>
        <Icon.chevD className={`w-3.5 h-3.5 text-ink-500 transition-transform duration-fast ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="pb-5">{children}</div>}
    </div>
  )
}

const CheckRow = ({ label, count, on, onToggle }: { label: string; count: number; on: boolean; onToggle: () => void }) => (
  <label className="flex items-center gap-2.5 cursor-pointer select-none py-2.5 hover:text-ink-900 transition-colors duration-fast">
    <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors duration-fast ${on ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
      {on && <Icon.check className="w-3 h-3 text-white" />}
    </span>
    <input type="checkbox" checked={on} onChange={onToggle} className="sr-only" />
    <span className="flex-1 text-small text-ink-800">{label}</span>
    {count > 0 && <span className="text-meta text-ink-500 tabular-nums">{count}</span>}
  </label>
)

// The BELOW-lg filter UI (from lg up the hero's inline dropdown row covers the
// same six refinements). Renders bare sections; the Sheet wrapper at the usage
// site supplies the pinned header (title + active count) and footer (reset /
// „ნახე N ექსპერტი"), plus scroll-lock, focus trap and Escape.
export const FiltersPanel = ({ filters, setFilters, liveCats, facets }: { filters: Filters; setFilters: (f: Filters) => void; liveCats: LiveCat[]; facets: Facets }) => {
  const toggleArr = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  // Same rule as the desktop popovers: a zero-count option is disabled, its
  // count stays on screen, and an ACTIVE one is always switchable off.
  const superDead = facets.superOnly === 0 && !filters.superOnly
  const ratingAllZero = FILTER_RATINGS.every(r => (facets.rating[String(r)] ?? 0) === 0)
  const availAllZero = FILTER_AVAIL.every(a => (facets.avail[a.id] ?? 0) === 0)

  return (
    <aside>
      {/* Prominent Super-expert switch */}
      <label className={`flex items-start gap-3 select-none py-4 border-b border-ink-100 ${superDead ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}>
        <button
          type="button"
          onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
          disabled={superDead}
          className={`mt-0.5 w-9 h-5 rounded-pill relative transition-colors duration-fast shrink-0 ${filters.superOnly ? 'bg-brand-500' : 'bg-ink-200'} ${superDead ? 'cursor-not-allowed' : ''}`}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-card transition-transform duration-fast ease-out-quart"
            style={{ transform: filters.superOnly ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-small font-bold text-ink-900 inline-flex items-center gap-1.5">
            <Icon.spark className="w-3 h-3 text-ink-400" />
            მხოლოდ Super-ექსპერტი
            <span className="text-meta font-medium text-ink-500 tabular-nums">{facets.superOnly}</span>
          </div>
          {/* Must describe the REAL predicate (see `superExpert` in the row
              mapper): verified AND rating ≥ 4.8 AND admin-featured. Omitting
              the rating made a featured, verified but unrated expert look
              like a match. */}
          <p className="text-meta text-ink-500 mt-0.5 leading-snug">გადამოწმებული · 4.8+ შეფასება · რედაქციის რჩეული</p>
          {superDead && <p className="text-meta text-ink-500 mt-1 leading-snug">ამ პირობებს ჯერ არავინ აკმაყოფილებს.</p>}
        </div>
      </label>

      {/* Hide the category section entirely when the live list is empty
          (fetch pending/failed) — never render dead, unmatched checkboxes. */}
      {liveCats.length > 0 && (
      <FilterSection title="კატეგორია">
        <div className="space-y-1">
          {liveCats.map(c => (
            <CheckRow
              key={c.slug}
              label={c.name}
              // Real, server-computed count (GET /api/categories mirrors
              // lib/tutorsQuery's visibility rule). The list is already pruned
              // to expertCount > 0, so this can only ever print a true number.
              count={c.expertCount ?? 0}
              on={filters.cats.includes(c.slug)}
              onToggle={() => setFilters({ ...filters, cats: toggleArr(filters.cats, c.slug) })}
            />
          ))}
        </div>
      </FilterSection>
      )}

      {/* Budget band (min + max) — buyers can cap spend, not just set a floor. */}
      <FilterSection title="ფასი" defaultOpen={false}>
        <PriceRange value={filters.price} onChange={p => setFilters({ ...filters, price: p })} />
      </FilterSection>

      <FilterSection title="ენა" defaultOpen={false}>
        <div className="space-y-1">
          {FILTER_LANGS.map(l => (
            <CheckRow
              key={l.l}
              label={l.l}
              count={0}
              on={filters.langs.includes(l.l)}
              onToggle={() => setFilters({ ...filters, langs: toggleArr(filters.langs, l.l) })}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection title="ხელმისაწვდომობა" defaultOpen={false}>
        {/* h-8 → h-11: these are tappable, and the drawer is the PHONE surface. */}
        <div className="flex flex-wrap gap-1.5">
          {FILTER_AVAIL.map(a => {
            const on = filters.available.includes(a.id)
            const n = facets.avail[a.id] ?? 0
            const dead = n === 0 && !on
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setFilters({ ...filters, available: toggleArr(filters.available, a.id) })}
                disabled={dead}
                className={`inline-flex items-center gap-1.5 px-3.5 h-11 rounded-pill text-small font-display font-medium tracking-wide transition-colors duration-fast ${on ? 'bg-brand-600 text-white' : dead ? 'bg-white text-ink-700 border border-ink-200 opacity-45 cursor-not-allowed' : 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50'}`}
              >
                {on && <Icon.check className="w-3 h-3" />}
                {a.l}
                <span className={`text-meta tabular-nums ${on ? 'text-white' : 'text-ink-500'}`}>{n}</span>
              </button>
            )
          })}
        </div>
        {availAllZero && <p className="mt-2 text-meta text-ink-500 leading-snug">ამ პერიოდში თავისუფალი დრო არავის აქვს.</p>}
      </FilterSection>

      <FilterSection title="მინ. რეიტინგი">
        <div className="grid grid-cols-2 gap-1.5">
          {FILTER_RATINGS.map(r => {
            const on = filters.minRating === r
            const n = facets.rating[String(r)] ?? 0
            const dead = n === 0 && !on
            return (
              <button
                key={r}
                type="button"
                onClick={() => setFilters({ ...filters, minRating: on ? 0 : r })}
                disabled={dead}
                className={`inline-flex items-center justify-center gap-1.5 px-3 h-11 rounded-btn text-small font-display font-medium tracking-wide transition-colors duration-fast ${on ? 'bg-warning-600 text-white' : dead ? 'bg-white text-ink-800 border border-ink-200 opacity-45 cursor-not-allowed' : 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50'}`}
              >
                <Icon.star className={`w-3 h-3 ${on ? 'text-white' : 'text-warning-500'}`} />
                <span className="tabular-nums font-bold">{r.toFixed(1)}+</span>
                <span className={`text-meta font-medium tabular-nums ${on ? 'text-white' : 'text-ink-500'}`}>{n}</span>
              </button>
            )
          })}
        </div>
        {ratingAllZero && <p className="mt-2 text-meta text-ink-500 leading-snug">შეფასება ჯერ არავის აქვს — პლატფორმა ახალია.</p>}
      </FilterSection>

    </aside>
  )
}