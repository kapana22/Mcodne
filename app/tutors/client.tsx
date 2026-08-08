'use client'
import React, { useState, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
// next-view-transitions' Link is a drop-in for next/link that runs the
// navigation inside document.startViewTransition — this is what animates
// the card→profile morph. Unsupported browsers get plain navigation.
import { Link } from 'next-view-transitions'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { StudentAppBar } from '@/components/StudentAppBar'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { KA_MONTHS_SHORT } from '@/lib/kaDate'
import { LANG_LABELS, PRIMARY_LANG_CODES, langLabel, toLangCode } from '@/lib/languages'
import { Sheet } from '@/components/Sheet'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Illustration, hasIllustration } from '@/components/Illustration'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { frameQuestion } from '@/lib/askFraming'
import { fmtRating } from '@/lib/fmt'
import { displayHeadline } from '@/lib/headline'
import { useToast } from '@/components/ToastProvider'
import { responseTimeLabelKa } from '@/lib/responseTime'
import { useMe, type Me } from '@/lib/me'
import { registerSearchInput, focusSearchInput } from '@/lib/searchFocus'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
// ONE shared booking flow (DESIGN_FIX_PROMPT 1.1): the same component the
// expert profile renders. It self-fetches /api/tutors/{id} on open, supports
// consultation tiers (step 1) and the mandatory intake — QuickBookPopup's
// diverging copy of all this was deleted.
// Lazy: the booking flow (calendar + date picker + steps) only mounts after a
// "book" click, so it must not weigh down the initial browse-list JS. ssr:false
// because it's a click-triggered modal — nothing to server-render.
const BookingFlow = dynamic(
  () => import('@/components/booking/BookingFlow').then(m => m.BookingFlow),
  { ssr: false },
)
import { TUTOR_DEFAULTS, primaryPriceLabel, type ConsultationItem } from '@/components/booking/slots'


const Logo = () => (
  <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
  </Link>
)

const VerifiedMark = ({ size = 18 }: { size?: number }) => (
  <span title="გადამოწმებული" className="inline-flex items-center justify-center rounded-full bg-brand-600 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

/* ───── Search hero ───── */
// Category identity is DB-driven (GET /api/categories → live categories only).
// The hero chips and the sidebar checkboxes toggle the SAME `filters.cats`, and
// that array now holds category SLUGS — so filtering is robust to renames and a
// hidden (isLive:false) category simply stops appearing (no dead chip). The
// filter matches an expert's `catSlug` (category.slug), never a display string.
// `expertCount` drives which categories are OFFERED as a filter: an option that
// can only ever return zero results is a dead end, not a filter.
type LiveCat = { id: string; slug: string; name: string; expertCount?: number }
// Resolve a slug → its display name from the live list; falls back to the slug
// itself so a not-yet-loaded / unknown category never renders as blank.
const catNameOf = (cats: LiveCat[], slug: string) => cats.find(c => c.slug === slug)?.name ?? slug


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
const NO_CAP = 99999
const PRICE_OPTS: { min: number; max: number; l: string }[] = [
  { min: 0, max: NO_CAP, l: 'ნებისმიერი ფასი' },
  { min: 0, max: 50, l: '₾50-მდე' },
  { min: 50, max: 100, l: '₾50–100' },
  { min: 100, max: NO_CAP, l: '₾100+' },
]
const priceBandActive = (lo: number, hi: number) => lo > 0 || hi < NO_CAP
function priceBandLabel(lo: number, hi: number): string {
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

function PriceRange({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
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

const toggleIn = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

// Labeled filter dropdown: a box that shows „label / current value" and opens a
// popover of options. Restored 2026-07-27 — this inline row IS the desktop
// filter UI (the user asked for the redundant „ფილტრები" drawer trigger to go,
// not this). Closes on outside mousedown.
const FilterBox = ({ label, value, active, children }: { label: string; value: string; active: boolean; children: React.ReactNode }) => {
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
const CheckOpt = ({ label, on, onToggle, count }: { label: React.ReactNode; on: boolean; onToggle: () => void; count?: number }) => {
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
const FILTER_RATINGS = [4.0, 4.5, 4.8, 4.9]

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
type Facets = { rating: Record<string, number>; avail: Record<string, number>; superOnly: number }

const SearchHero = ({ filters, setFilters, search, setSearch, onSearch, total, loading, liveCats, facets }: { filters: Filters; setFilters: (f: Filters) => void; search: string; setSearch: (v: string) => void; onSearch: () => void; total: number; loading: boolean; liveCats: LiveCat[]; facets: Facets }) => {
  // Live result count as the page heading (DESIGN_FIX_PROMPT 1.9). The label
  // reflects the active refinement: one category → its name; several → the
  // count; a text query → the query itself. While loading show a neutral
  // heading — never a stale or invented number.
  const headingLabel =
    filters.cats.length === 1 ? catNameOf(liveCats, filters.cats[0])
    : filters.cats.length > 1 ? `${filters.cats.length} სფერო`
    : search.trim() ? `„${search.trim()}“`
    : null
  // Current value shown on each inline dropdown. Categories are stored as
  // SLUGS, so the label always goes through catNameOf — printing the raw slug
  // („real-estate") was exactly the bug the chip row had with availability ids.
  const catVal = filters.cats.length === 0 ? 'ყველა სფერო'
    : filters.cats.length === 1 ? catNameOf(liveCats, filters.cats[0])
    : `${filters.cats.length} სფერო`
  const priceVal = priceBandLabel(filters.price[0], filters.price[1])
  const langVal = filters.langs.length === 0 ? 'ნებისმიერი ენა' : filters.langs.length === 1 ? filters.langs[0] : `${filters.langs.length} ენა`
  const availVal = filters.available.length === 0 ? 'ნებისმიერ დროს' : filters.available.map(id => FILTER_AVAIL.find(a => a.id === id)?.l ?? id).join(', ')
  const ratingVal = filters.minRating > 0 ? `${filters.minRating.toFixed(1)}+` : 'ნებისმიერი'
  // When EVERY option in a facet is zero, the disabled rows alone read like a
  // bug. One line says why — and it is the true reason, not a shrug.
  const ratingAllZero = FILTER_RATINGS.every(r => (facets.rating[String(r)] ?? 0) === 0)
  const availAllZero = FILTER_AVAIL.every(a => (facets.avail[a.id] ?? 0) === 0)
  const superDead = facets.superOnly === 0 && !filters.superOnly
  return (
    <section className="bg-white border-b border-ink-200">
      <Container className="pt-8 pb-6">
        {/* Hidden below sm — the same rule /tutors/[id] already follows. On a
            phone this line cost a 17px tap target AND a band of vertical space
            on a page someone opened specifically to see results; the header logo
            and the browser's own Back both go home more reliably. It stays in
            the DOM (`hidden`, not unmounted) so crawlers and assistive tech keep
            the trail. */}
        <nav aria-label="ნავიგაცია" className="hidden sm:flex items-center gap-1.5 text-meta text-ink-500 mb-4">
          <Link href="/" className="hover:text-ink-800 transition-colors duration-fast">მთავარი</Link>
          <Icon.chevR className="w-3 h-3 text-ink-300" />
          <span className="font-display font-semibold text-ink-800">ექსპერტები</span>
        </nav>

        {/* THE COUNT IS NOT IN THE HEADING (2026-07-31). „10 ექსპერტი შენთვის"
            put the smallest true thing about the marketplace in its largest
            type — a number that reads as a boast at 1000 and as an apology at
            10, and that changes under the visitor every time they touch a
            filter. The heading now says what the page IS; the refinement, when
            there is one, is the subject.

            The count itself is not hidden — it still reaches screen readers
            through the live region below (which is what `aria-live` on the h1
            was actually for) and every card is on screen to be counted. */}
        <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
          {!loading && headingLabel ? headingLabel : 'იპოვე შენი ექსპერტი'}
        </h1>
        <span aria-live="polite" className="sr-only">
          {loading ? 'იტვირთება' : `ნაპოვნია ${total} ექსპერტი`}
        </span>
        {/* Honest by flag: only claim escrow once the payment gateway is live. */}
        <p className="text-body text-ink-500 mt-2">ხელით შერჩეული · გამჭვირვალე ფასი · {PAYMENTS_LIVE ? 'დაცული გადახდა' : 'დაჯავშნა უფასოა'}</p>

        {/* Filter bar — labeled dropdown boxes, visible from lg up. This IS the
            desktop filter UI: every refinement is one click away, no drawer to
            open (the „ფილტრები" trigger in the results bar is lg:hidden for
            exactly this reason). Below lg the five boxes would stack into ~1.5
            screens of controls BEFORE the first result, so small screens keep
            the search field + category rail and the drawer holds the rest.
            Both surfaces write the SAME `filters` object, so they can never show
            contradicting state. */}
        <div className="mt-5 flex flex-col lg:flex-row lg:flex-wrap items-stretch gap-2.5">
          <div className="hidden lg:contents">
            <FilterBox label="სფერო" value={catVal} active={filters.cats.length > 0}>
              {/* Categories are DB-driven and load after paint; show an honest
                  pending line rather than an empty popover or a dead chip. */}
              {liveCats.length === 0
                ? <div className="px-2 py-2 text-small text-ink-500">კატეგორიები იტვირთება…</div>
                : liveCats.map(c => <CheckOpt key={c.slug} label={c.name} on={filters.cats.includes(c.slug)} onToggle={() => setFilters({ ...filters, cats: toggleIn(filters.cats, c.slug) })} />)}
            </FilterBox>
            <FilterBox label="ფასი / სესია" value={priceVal} active={priceBandActive(filters.price[0], filters.price[1])}>
              <div className="w-[240px] max-w-[calc(100vw-3rem)]">
                <PriceRange value={filters.price} onChange={p => setFilters({ ...filters, price: p })} />
              </div>
            </FilterBox>
            <FilterBox label="ენა" value={langVal} active={filters.langs.length > 0}>
              {FILTER_LANGS.map(l => <CheckOpt key={l.l} label={l.l} on={filters.langs.includes(l.l)} onToggle={() => setFilters({ ...filters, langs: toggleIn(filters.langs, l.l) })} />)}
            </FilterBox>
            <FilterBox label="ხელმისაწვდომობა" value={availVal} active={filters.available.length > 0}>
              {FILTER_AVAIL.map(a => <CheckOpt key={a.id} label={a.l} count={facets.avail[a.id] ?? 0} on={filters.available.includes(a.id)} onToggle={() => setFilters({ ...filters, available: toggleIn(filters.available, a.id) })} />)}
              {availAllZero && <p className="px-2 pt-1 pb-0.5 text-meta text-ink-500 leading-snug">ამ პერიოდში თავისუფალი დრო არავის აქვს.</p>}
            </FilterBox>
            {/* Min-rating had no inline box before and was drawer-only, so a
                desktop visitor who never opened the drawer couldn't reach it.
                Single-select: tapping the active threshold clears it. */}
            <FilterBox label="შეფასება" value={ratingVal} active={filters.minRating > 0}>
              {FILTER_RATINGS.map(r => (
                <CheckOpt
                  key={r}
                  label={<span className="inline-flex items-center gap-1"><Icon.star className="w-3 h-3 text-warning-500" /><span className="tabular-nums">{r.toFixed(1)}+</span></span>}
                  count={facets.rating[String(r)] ?? 0}
                  on={filters.minRating === r}
                  onToggle={() => setFilters({ ...filters, minRating: filters.minRating === r ? 0 : r })}
                />
              ))}
              {ratingAllZero && <p className="px-2 pt-1 pb-0.5 text-meta text-ink-500 leading-snug">შეფასება ჯერ არავის აქვს — პლატფორმა ახალია.</p>}
            </FilterBox>
            <button
              type="button"
              onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
              disabled={superDead}
              title={superDead ? 'Super-ექსპერტი ჯერ არავინაა' : undefined}
              className={`h-12 px-4 rounded-card border font-display text-small font-bold inline-flex items-center gap-2 transition-all duration-fast ${filters.superOnly ? 'border-brand-500 bg-brand-50/40 text-brand-800 ring-1 ring-brand-200' : superDead ? 'border-ink-200 bg-white text-ink-800 opacity-45 cursor-not-allowed' : 'border-ink-200 hover:border-ink-300 bg-white text-ink-800'}`}
            >
              <Icon.spark className="w-4 h-4 text-ink-400" /> Super
              <span className="text-meta font-medium text-ink-500 tabular-nums">{facets.superOnly}</span>
            </button>
          </div>
          <div className="group flex-1 min-w-[220px] bg-white rounded-card border border-ink-200 flex items-stretch focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all duration-fast">
            <div className="relative flex-1 min-w-0">
              <Icon.search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              {/* Registers itself so the site-wide `/` and ⌘K land HERE — see
                  lib/searchFocus for why it's a registry and not a selector.
                  Escape clears and steps back out, so a mistyped query costs
                  one key rather than a select-all. */}
              <input
                ref={registerSearchInput}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSearch()
                  else if (e.key === 'Escape') {
                    e.preventDefault()
                    if (search) setSearch('')
                    else e.currentTarget.blur()
                  }
                }}
                aria-label="ექსპერტების ძებნა" placeholder="ძებნა სახელით ან თემით…"
                className="w-full h-12 pl-10 pr-3 bg-transparent text-body text-ink-900 placeholder:text-ink-400 focus:outline-none"
              />
            </div>
            {/* Shortcut affordance. A shortcut nobody can see is a shortcut
                nobody uses — this is the whole discoverability budget. Hidden
                below lg (no hardware keyboard) and while the field has focus
                (you're already there). */}
            <kbd
              aria-hidden
              className="hidden lg:inline-flex items-center justify-center self-center mr-3 w-6 h-6 rounded-btn border border-ink-200 bg-ink-50 font-display text-meta font-bold text-ink-400 group-focus-within:opacity-0 transition-opacity duration-fast"
            >
              /
            </kbd>
          </div>
        </div>

        {/* Category rail — one-tap refinement below lg, where the dropdown row
            is hidden. Not a competing filter UI: these chips write the SAME
            `filters.cats` the boxes and the drawer do, so all three always read
            the same state. Horizontal scroll, active chips in brand. */}
        <div className="lg:hidden mt-3 -mx-6 px-6 flex gap-2 overflow-x-auto scrollbar-hide rail-fade-end" role="group" aria-label="სფეროს ფილტრი">
          <button
            type="button"
            onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
            disabled={superDead}
            title={superDead ? 'Super-ექსპერტი ჯერ არავინაა' : undefined}
            className={`shrink-0 h-11 px-3.5 rounded-pill border font-display text-small font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast ${filters.superOnly ? 'border-brand-500 bg-brand-50 text-brand-800' : superDead ? 'border-ink-200 bg-white text-ink-700 opacity-45 cursor-not-allowed' : 'border-ink-200 bg-white text-ink-700'}`}
          >
            <Icon.spark className="w-3.5 h-3.5 text-ink-400" /> Super
            <span className="text-meta font-medium text-ink-500 tabular-nums">{facets.superOnly}</span>
          </button>
          {liveCats.map(c => {
            const on = filters.cats.includes(c.slug)
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setFilters({ ...filters, cats: toggleIn(filters.cats, c.slug) })}
                className={`shrink-0 h-11 px-3.5 rounded-pill border font-display text-small font-semibold transition-colors duration-fast ${on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-700'}`}
              >
                {c.name}
              </button>
            )
          })}
        </div>
      </Container>
    </section>
  )
}

/* ───── Filters sidebar ───── */
type Filters = {
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
const FILTER_LANGS = PRIMARY_LANG_CODES.map(c => ({ l: LANG_LABELS[c] }))

// The DB stores language CODES (ka/en/…); cards + the language filter work in
// human labels. Map codes → labels so a stored ["ka","en"] matches the filter
// chips (previously they never did → 0 results). `toLangCode` first, so legacy
// rows still holding NAMES („ქართული") land on the same label as a code row —
// otherwise the same expert reads differently depending on when they signed up.
const toLangLabel = (v: string): string => langLabel(toLangCode(v) ?? v)

// Only expose availability windows we can actually evaluate from the list
// data (each tutor's soonest free slot, `nextSlotAt`). "Weekend/evening"
// needed per-slot data the list endpoint doesn't return, so they were dropped
// rather than shipped as no-op checkboxes.
const FILTER_AVAIL = [
  { id: 'today', l: 'დღეს' },
  { id: 'week',  l: 'ამ კვირას' },
]

const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// Does this expert's soonest free slot fall inside the window `id`?
const availMatches = (t: Tutor, id: string, now: Date): boolean => {
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
function passesFilters(t: Tutor, f: Filters, now: Date, skip?: 'rating' | 'avail' | 'super'): boolean {
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
const FiltersPanel = ({ filters, setFilters, liveCats, facets }: { filters: Filters; setFilters: (f: Filters) => void; liveCats: LiveCat[]; facets: Facets }) => {
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

/* ───── Tutor data ───── */
type Tutor = {
  slug?: string | null
  id: string
  name: string
  photo: number
  // Real avatar URL from user.avatarUrl. When null, TutorCard renders an
  // initials placeholder (SVG data URI) instead of a random pravatar face.
  avatarUrl?: string | null
  // YouTube URL (canonical `youtu.be/{id}`) from tutorProfile.videoUrl.
  // `video` gates the play button on the card; the popup extracts the
  // 11-char ID at open time to render the nocookie iframe.
  videoUrl?: string | null
  cat: string
  // Category SLUG (category.slug) — the stable filter key. `cat` above stays the
  // display NAME the card shows; filtering matches on this slug so renames and
  // hidden categories never break the sidebar/hero filter.
  catSlug?: string | null
  headline: string
  bio: string
  langs: string[]
  rating: number
  reviews: number
  sessions: number
  price: number
  trial: number
  next: string
  video: boolean
  // ID-verified (admin-checked). Gates the VerifiedMark — rendering it for
  // everyone was a trust lie the detail page didn't repeat.
  verified: boolean
  superExpert: boolean
  // ISO time of the expert's soonest bookable slot, or null when they have no
  // upcoming availability (→ effectively unbookable; the card shows a muted
  // "availability soon" state instead of a next-slot chip).
  nextSlotAt?: string | null
  // ISO creation time of the expert profile (tutorProfile.createdAt). Powers the
  // „ახლის მიხედვით" sort — without it that sort had no key and was a no-op.
  createdAt?: string | null
  consultationDurationMin?: number
  // Tier SHAPE only (minutes/price/tier) — already selected by lib/tutorsQuery
  // for exactly this reason, so the card can resolve the FLAGSHIP service
  // instead of pricing the profile-level default duration. Never the title or
  // description; the card doesn't render them.
  consultations: ConsultationItem[]
  // MEASURED response time, already bucketed into a Georgian phrase
  // („პასუხობს ~2 საათში"). Derived from tutorProfile.responseMedianMin /
  // .responseSampleN — real medians over answered conversations, see
  // lib/responseTime. `null` when the expert has too few answered conversations
  // to say anything true, in which case the card shows NOTHING; it deliberately
// Response time removed from every public surface (2026-07-29, product
// decision). It was measured honestly but it is not something a first-time
// buyer weighs — and with zero experts qualifying it printed for nobody. The
// measurement in lib/responseTime keeps running so it can rank search results
// later, the way Preply uses it; it is simply never displayed.
  // does NOT fall back to the self-declared responseHours the expert types into
  // their own profile editor.
  // Years of professional experience (tutorProfile.yearsExp). A credibility
  // signal a brand-new expert (0 rating/sessions/reviews) still has — surfaced
  // on the card only when >0 so it never reads as "0 წელი".
  yearsExp?: number
}

// Extract the 11-char YouTube ID from any of the accepted URL forms. Returns
// null for legacy `data:video/…` blobs or non-YouTube URLs, in which case the
// preview popup falls back to a plain thumbnail (no video plays).
function tutorYouTubeId(t: { videoUrl?: string | null }): string | null {
  const v = t.videoUrl
  if (!v || v.startsWith('data:')) return null
  try {
    const url = v.startsWith('http') ? new URL(v) : new URL(`https://${v}`)
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0]
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const q = url.searchParams.get('v')
      if (q && /^[a-zA-Z0-9_-]{11}$/.test(q)) return q
      const parts = url.pathname.split('/').filter(Boolean)
      if (['shorts', 'embed', 'live'].includes(parts[0]) && parts[1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[1])) {
        return parts[1]
      }
    }
    return null
  } catch { return null }
}

// Human-friendly label for an expert's soonest bookable slot ("დღეს 14:00",
// "ხვალ 09:30", "5 ივლ"). Client-only — safe to use Date here.
// Georgian short months — spelled out manually because the runtime's Intl
// often lacks `ka-GE` data and `toLocaleDateString('ka-GE',…)` silently falls
// back to English ("Jul 24") in an otherwise-Georgian UI.

function fmtNextSlot(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay(d, now)) return `დღეს ${hm}`
  if (sameDay(d, tomorrow)) return `ხვალ ${hm}`
  return `${d.getDate()} ${KA_MONTHS_SHORT[d.getMonth()]}`
}

// Neutral initials-avatar SVG for tutors without an uploaded photo. Kept as a
// data URI so no external round-trip and no stock-photo tied to a real name.
function initialsAvatarSvg(_name: string): string {
  return DEFAULT_AVATAR
}

// The FIRST-PAINT list is now seeded by the server (app/tutors/page.tsx calls
// queryTutors() and passes the rows in as `initialTutors`), so real expert
// cards are in the initial HTML — no empty skeleton, no fake placeholder data.
// The old hardcoded 9-tutor array is gone; `mapRows` below turns the raw API/
// server rows into the card shape, shared by the seed and every refetch.

// One row → card mapper. Used by BOTH the SSR seed (initialTutors) and the
// client refetch (fetchTutors), so the two paths can never drift. Kept pure so
// the useState initializer can run it during SSR of the client component.
function mapTutorRow(t: any, i: number): Tutor {
  return {
    // The expert's own URL slug. Card links MUST use it when present: a
    // cuid href answers with a 308 to the slug URL, and that redirect turns
    // the client-side navigation into a full page load — which silently kills
    // the card→profile view-transition morph. Measured, not theoretical.
    slug: t.slug ?? null,
    id: t.id,
    name: t.user?.fullName ?? TUTOR_DEFAULTS.name,
    photo: 11 + i,
    avatarUrl: t.user?.avatarUrl ?? null,
    videoUrl: t.videoUrl ?? null,
    cat: t.category?.name ?? t.specialty ?? 'სფერო',
    catSlug: t.category?.slug ?? null,
    headline: t.headline ?? '',
    bio: t.bio ?? '',
    langs: Array.isArray(t.languages) && t.languages.length ? t.languages.map(toLangLabel) : ['ქართული'],
    // 0 = no reviews yet → the card renders "ახალი", same as the detail
    // page. NEVER invent a rating (this used to default to 4.9).
    rating: t.rating ?? 0,
    reviews: t.reviewsCount ?? 0,
    sessions: t.sessionsCount ?? 0,
    price: t.price ?? TUTOR_DEFAULTS.price,
    trial: 0,
    // Real next free slot — the compare modal shows this verbatim, so a
    // fabricated "დღეს/ხვალ" here lied to the user.
    next: t.nextSlotAt ? fmtNextSlot(t.nextSlotAt) : 'დრო ჯერ არ არის',
    // Only show the play button when we have a real video URL.
    video: Boolean(t.videoUrl),
    verified: t.verified ?? false,
    // Super is now admin-gated: an expert must be verified, top-rated AND
    // admin-featured — so the badge is a deliberate distinction (controlled via
    // the admin FeaturedToggle), not something that lands on everyone with a
    // high rating.
    superExpert: (t.verified ?? false) && (t.rating ?? 0) >= 4.8 && Boolean(t.featured),
    nextSlotAt: t.nextSlotAt ?? null,
    // Normalize to ISO — the API sends a string, the SSR seed a Date object.
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
    consultationDurationMin: typeof t.consultationDurationMin === 'number' ? t.consultationDurationMin : TUTOR_DEFAULTS.durationMin,
    // Defensive: an older cached payload (or a hand-built fixture) may predate
    // the tier select in lib/tutorsQuery. An empty list makes primaryPriceLabel
    // fall back to the flat price, which is the pre-tier behaviour — never a crash.
    consultations: Array.isArray(t.consultations) ? t.consultations : [],
    yearsExp: typeof t.yearsExp === 'number' ? t.yearsExp : undefined,
  }
}

function mapRows(rows: any[]): Tutor[] {
  return Array.isArray(rows) ? rows.map(mapTutorRow) : []
}

/* TUTOR_DEFAULTS + primaryPriceLabel are imported from components/booking/slots
   — the single source both this listing and the detail page resolve fallbacks
   from (the old "MUST stay identical" twin blocks are gone).
   Covered by tests/tutor-mapping.test.ts. */

// A card is bookable only when the expert has an upcoming free slot
// (`nextSlotAt`). Mirrors the detail page's StickyBookingCard gate
// (`uniqueDays.length === 0` → CTA disabled) so search never implies a
// bookability the profile will immediately deny. Covered by the test file.
function isTutorBookable(nextSlotAt?: string | null): boolean {
  return nextSlotAt != null
}

/*/* ───── "Available now" pill — instant-booking indicator ───── */
/* ───── Tutor card — mirrors landing.tsx ExpertCard ───── */
// The card's „ენები" line. `t.langs` already holds labels (see toLangLabel), but
// run it through again so a stray code can never render raw — a third private
// map here is exactly how the label vocabularies drifted apart before.
// Dedupe AFTER labelling: `languages` holds ISO codes, but legacy rows also
// hold bare Georgian NAMES, so „ka" and „ქართული" are two distinct strings that
// collapse to one only once mapped. Without this the card printed
// „ქართული, ქართული, ინგლისური" (seen live on a real profile).
// Measured at 390px: „ქართული, ინგლისური, რუსული" overflows the card and CSS
// truncation cut it mid-word — the third language became „რუს…", which reads
// as a rendering fault rather than as „there are more". Two names and a count
// says the same thing in less room and never breaks a word. `truncate` stays
// on the element as the backstop for one very long name.
// Order is FIXED (ka → en → ru → the rest, alphabetically), never the order the
// expert happened to tick the chips in: adjacent cards printed „ქართული,
// ინგლისური" and „ინგლისური, ქართული" for the same pair of languages, which
// reads as two different facts. It matches the picker's chip order, so what an
// expert selects is what a card shows.
const LANG_RANK = (label: string) => {
  const i = PRIMARY_LANG_CODES.findIndex(c => LANG_LABELS[c] === label)
  return i === -1 ? PRIMARY_LANG_CODES.length : i
}
const fmtLangs = (langs: string[], max = 3) => {
  const all = Array.from(new Set((langs ?? []).map(toLangLabel)))
    .sort((a, b) => LANG_RANK(a) - LANG_RANK(b) || a.localeCompare(b, 'ka'))
  if (all.length <= max) return all.join(', ')
  return `${all.slice(0, max).join(', ')} +${all.length - max}`
}

// Georgian alone is not a language SIGNAL on a Georgian marketplace — it is the
// assumption. Every one of the 9 production experts carried „🌐 ქართული", i.e. a
// row that consumed a line on every card and separated nobody from anybody. The
// line earns its place exactly when there is something extra to say: an expert
// who ALSO works in English or Russian is genuinely differentiated, and that is
// when the row appears. `fmtLangs` still prints the full list (including
// Georgian) once it does — the test is what to SHOW, not what to say.
const KA_LABEL = toLangLabel('ka')
const hasExtraLanguage = (langs: string[] | undefined) =>
  (langs ?? []).map(toLangLabel).some(l => l !== KA_LABEL)

// Trust signals for a brand-new expert (0 rating / 0 sessions / 0 reviews).
// Their card would otherwise be a lonely „ახალი" over empty space, so surface
// the credibility they DO have — ID-verification, years of experience, an intro
// video, a response promise. Real fields only; each chip renders solely when its
// value truly exists. Calm muted meta row (canon: hairline icons, no loud fills).
// No „ახალი ექსპერტი" lead tag here: the photo pill already says „ახალი", and
// on the unified card the two sat inches apart and read twice.
const NewExpertSignals = ({ t, className = '' }: { t: Tutor; className?: string }) => {
  const signals: { key: string; icon: React.ReactNode; label: React.ReactNode }[] = []
  if (t.verified) signals.push({ key: 'verified', icon: <Icon.shieldCheck className="w-3 h-3 text-brand-600" />, label: 'გადამოწმებული' })
  // `briefcase`, not `thumb`: a thumbs-up is the universal APPROVAL/like mark,
  // so „👍 5 წლის გამოცდილება" read as five endorsements rather than five years
  // — and on a card whose whole job is separating measured facts from claims,
  // borrowing the rating vocabulary for a self-declared number is the one
  // confusion to avoid. Professional experience is a briefcase.
  if (typeof t.yearsExp === 'number' && t.yearsExp > 0) signals.push({ key: 'years', icon: <Icon.briefcase className="w-3 h-3 text-ink-400" />, label: <><span className="font-display font-bold text-ink-900 tabular-nums">{t.yearsExp}</span> წლის გამოცდილება</> })
  if (t.video) signals.push({ key: 'video', icon: <Icon.video className="w-3 h-3 text-ink-400" />, label: 'ვიდეოგაცნობა' })
  if (signals.length === 0) return null
  return (
    <div className={`flex items-center gap-x-3.5 gap-y-1.5 text-meta text-ink-600 flex-wrap ${className}`}>
      {signals.map(s => (
        <span key={s.key} className="inline-flex items-center gap-1">{s.icon}{s.label}</span>
      ))}
    </div>
  )
}

/**
 * An expert portrait that falls back instead of breaking.
 *
 * `||` on `avatarUrl` only covers an ABSENT photo. Two live profiles carry a
 * Google-SSO URL (`lh3.googleusercontent.com/...`) that no longer resolves, and
 * those rendered the browser's broken-image glyph — with the expert's own name
 * as alt text — in the grid whose whole job is to prove the roster is hand-picked.
 *
 * ⚠️ The fallback MUST live in React state. The first version of this fix set
 * `e.currentTarget.src` directly from `onError`; React owns that attribute, so
 * the next render restored the dead URL, the image failed again, and the card
 * flickered back to broken. A DOM mutation cannot win against the renderer —
 * state is the only thing that survives a re-render. (Same reason CertThumb is
 * written this way.)
 *
 * Keyed on `src` by the caller-facing prop: a rotated/changed photo resets the
 * failed flag, so one bad URL never poisons a later good one.
 */
const ExpertPhoto = ({ src, name, eager = false }: { src: string; name: string; eager?: boolean }) => {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  return (
    <img
      src={failed ? DEFAULT_AVATAR : src}
      alt={name}
      /* The first cards' photos ARE the page's LCP element; lazy-loading them
         put the LCP fetch at the lowest priority behind everything (measured
         LCP 1.0–1.6s). First two rows load eager + high. */
      loading={eager ? 'eager' : 'lazy'}
      {...(eager ? { fetchPriority: 'high' as const } : {})}
      decoding="async"
      /* Intrinsic hint only (the element is `absolute inset-0`) — kept equal to
         the thumb's largest rendered size so the aspect ratio it reserves is
         square and the circle never gets a pre-layout oval. */
      width={144}
      height={144}
      onError={() => setFailed(true)}
      className="absolute inset-0 w-full h-full object-cover object-center motion-safe:animate-fade-in-fast"
    />
  )
}

const TutorCard = ({ t, idx, onPreviewEnter, onBook, saved, onToggleFav, needsSignIn, viewerCantBook = false, viewerCantFav = false }:{ t: Tutor; idx: number; onPreviewEnter: (t: Tutor, anchor: HTMLElement) => void; onBook: (t: Tutor) => void; saved: boolean; onToggleFav: (tutorId: string) => void; needsSignIn?: boolean; viewerCantBook?: boolean; viewerCantFav?: boolean }) => {
  // Prefer the tutor's real avatar; fall back to an initials placeholder so we
  // never render a random pravatar face over a real name (crawler-safe).
  const photoSrc = t.avatarUrl || initialsAvatarSvg(t.name)
  // Inline video-on-hover (Preply-style). Only the hovered card mounts an
  // (muted, looping) iframe, so we never autoplay every video at once.
  const [vhover, setVhover] = useState(false)
  // Advertise the FLAGSHIP service — the longest PAID tier — and nothing else.
  // This used to price `consultationDurationMin`, the profile-level DEFAULT,
  // which is not a service anyone can buy: the card read „₾80 · 30 წთ" for an
  // expert whose real offer is a 60-minute consultation at ₾80, while their
  // profile rail said „₾25-დან" (the cheapest tier). One expert, three prices.
  // `primaryPriceLabel` is the shared source the rail now reads too.
  const flagship = primaryPriceLabel(t.consultations, t.price, t.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin)
  // Gate the CTA on real availability — same rule the detail page's
  // StickyBookingCard uses — so the card never promises a booking the profile
  // will deny with "no published slots".
  const bookable = isTutorBookable(t.nextSlotAt)
  // Video plays INLINE inside the photo on hover (Preply-style) — no permanent
  // panel cluttering the list. Play button opens the full VideoPreview modal.
  const ytId = tutorYouTubeId(t)
  return (
    // COMPACT HORIZONTAL card (2026-07-27): square thumb left, content right,
    // price + actions on the bottom strip. ONE layout at every breakpoint —
    // 1-up on mobile, 2-up from sm. Replaces the photo-banner card, which was
    // both very tall (little fit on screen) and structurally unable to render a
    // sharp portrait — see the photo comment below.
    <article className="group relative rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift overflow-hidden flex flex-col h-full">
      {/* The WHOLE card opens the profile, at every breakpoint (overlay-link
          pattern from app/student/bookings). It is a SIBLING of the controls,
          never a parent — wrapping the card in an <a> would nest the buttons
          inside a link. Anything interactive opts out by sitting above it with
          `relative z-10`; miss that and the overlay silently eats the click. */}
      <Link
        href={`/tutors/${t.slug || t.id}`}
        aria-label={`${t.name} — პროფილი`}
        className="absolute inset-0 z-[1]"
      />

      {/* Save/favorite is a client-only feature (server 403s non-students).
          Pinned to the card corner rather than sitting in the photo/identity
          row: as a flex item it stole ~40px from the content column, which at
          390px is the difference between a readable bio and three words. It is
          NOT on the photo either — a 112px square has no spare corner. The name
          row reserves `pr-9` so the two can never collide. */}
      {!viewerCantFav && (
        <button
          type="button"
          onClick={() => onToggleFav(t.id)}
          aria-label={saved ? 'შენახული' : 'შენახვა'}
          className={`absolute top-2.5 right-2.5 z-10 w-10 h-10 inline-flex items-center justify-center rounded-full transition-colors duration-fast ${saved ? 'text-danger-600' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'}`}
        >
          {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
        </button>
      )}

      {/* Top row — photo + identity. flex-1 so every card in a row ends its
          footer on the same line even when one bio is shorter. */}
      <div className="flex-1 min-w-0 flex flex-col p-4">
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Portrait — a fixed CIRCLE, never a banner (round 2026-08-05: every
              other avatar on the site is a circle — home grid, profile header,
              „მსგავსი ექსპერტები", the SEO landings, chat — and this square was
              the last odd one out). Avatars are stored server-side as a 256×256
              image (app/api/uploads/route.ts resizes on upload, deliberately:
              one 9.4MB base64 avatar once made chat threads 7.5MB / 40s), so
              ~144px is the ceiling that still looks crisp on a 2× screen — the
              old 16/10 banner blew the same 256px source up ~3.7× (visibly
              blurry) AND had to crop a square portrait into a wide frame, which
              cut faces at eye level whatever the object-position. Do NOT turn
              this back into an aspect-ratio banner. Sized UP to 144 at `lg`
              when it became a circle: an inscribed circle shows ~78% of the
              same box's area, so keeping the old number would have SHRUNK the
              face — and the photo is the card's whole point.
              ⚠️ The bump is keyed to `lg`, NOT `sm`, and the base stays 112.
              This card is horizontal and the grid goes 2-up at `sm`, so between
              640 and 1023 the identity column is the narrowest it ever gets —
              measured at 640px it is 68px wide and Georgian surnames already
              break across FOUR lines there (a pre-existing bug, not this
              change's). 144px at `sm` took it to 52px / five lines; 112 there
              gives 84px back. At 390 the card is 1-up but the column is still
              only 146px, and 128 pushed „ლუკა ლორთქიფანიძე" to three lines with
              a single dangling letter. Measure the h3 before growing this.
              `object-center`: a centred square crop of a portrait keeps the face.
              Identical size for every expert, so the grid reads as one system.
              z-10 keeps the block ABOVE the card-wide overlay link — without it
              the overlay swallows mouseenter and the hover-video never plays. */}
          <div
            className="relative z-10 shrink-0 w-28 h-28 lg:w-36 lg:h-36 rounded-full bg-ink-100 overflow-hidden group/photo"
            /* Shared-element name: the profile page puts the SAME name on its
               avatar, so navigation morphs this photo into that one instead of
               blinking. Unique per tutor — duplicate names void the pair. */
            style={{ viewTransitionName: `vt-photo-${t.id}` }}
            onMouseEnter={() => { if (t.video && ytId) setVhover(true) }}
            onMouseLeave={() => setVhover(false)}
          >
            {/* tabIndex -1: same destination as the card overlay and the name
                link — three identical tab stops per card is keyboard noise. */}
            <Link href={`/tutors/${t.slug || t.id}`} tabIndex={-1} aria-label={`${t.name} — პროფილი`} className="absolute inset-0 block">
              <ExpertPhoto src={photoSrc} name={t.name} eager={idx < 2} />
            </Link>
            {/* Hover → the intro video plays right inside the photo. Only the
                hovered card mounts an iframe, so we never autoplay the whole list. */}
            {t.video && vhover && ytId && (
              <iframe
                className="absolute inset-0 w-full h-full z-10 pointer-events-none"
                src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&playsinline=1&rel=0`}
                allow="autoplay; encrypted-media"
                title={`${t.name} — ვიდეო`}
              />
            )}
            {/* Play badge — opens the full VideoPreview modal (stopPropagation
                so the card-wide overlay link doesn't navigate instead). The
                BUTTON is 40×40 (canon tap-target floor) but its visible circle
                is 28px, so it sits in the shoulder corner instead of covering
                the face. It is INSET (`bottom-2`/`sm:bottom-3`, badge centred in
                the button) rather than pinned to `bottom-0 right-0` as it was on
                the square: a corner of the bounding box is OUTSIDE a circular
                photo, so the old offsets left the badge floating in the gap.
                These land it tangent to the circle at the 4-o'clock edge —
                r(56/72) ≈ centre-distance(39.6/56.6) + badge radius(14). Keep
                the breakpoint on `lg`, matching the thumb's own. */}
            {t.video && (
              <button
                type="button"
                aria-label="ვიდეო"
                onClick={e => { e.stopPropagation(); onPreviewEnter(t, e.currentTarget) }}
                className="absolute bottom-2 right-2 lg:bottom-3 lg:right-3 z-20 w-10 h-10 inline-flex items-center justify-center"
              >
                <span className="w-7 h-7 rounded-full bg-white/95 backdrop-blur shadow-pop text-ink-900 inline-flex items-center justify-center group-hover/photo:scale-105 transition-transform duration-fast">
                  <Icon.play className="w-3 h-3 ml-0.5" />
                </span>
              </button>
            )}
          </div>

          {/* Identity column */}
          <div className="min-w-0 flex-1 flex flex-col">
            <div className={`flex items-center gap-x-1.5 gap-y-1 min-w-0 flex-wrap ${viewerCantFav ? '' : 'pr-9'}`}>
              {/* h2, not h3: the listing's only other heading is the page h1, so an h3
                  here left a level gap that a screen reader navigating by heading
                  reads as a missing section. Size is unchanged — the token is the
                  design, the tag is the outline. */}
              <h2 className="font-display text-body-lg sm:text-h3 font-bold text-ink-900 tracking-tight leading-[1.2] min-w-0 break-words">
                <Link href={`/tutors/${t.slug || t.id}`} className="tap-area relative z-10 hover:text-brand-700 transition-colors duration-fast">{t.name}</Link>
              </h2>
              {t.verified && <VerifiedMark size={14} />}
              {t.superExpert && (
                <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-pill bg-ink-900 border border-transparent text-white font-display text-micro font-bold uppercase">
                  <Icon.spark className="w-3 h-3" /> Super
                </span>
              )}
              {/* Rating moved OFF the photo: a 112px square has no room for an
                  overlay pill and it hid part of the face. Inline, hairline, no
                  pastel fill (canon). An unrated expert renders NOTHING here.
                  The „ახალი" pill that used to fill this slot is gone (2026-07-31):
                  a badge earns its place by DISTINGUISHING, and on production it
                  sat on 9 of 9 cards, so it distinguished nobody and instead told
                  every first-time visitor, once per card, that the marketplace is
                  empty. What an unrated expert genuinely has is rendered below by
                  <NewExpertSignals> — verified / years / intro video — which is
                  the same information without the apology. Do NOT reintroduce a
                  „new" badge until it applies to a minority of the roster. */}
              {t.rating > 0 && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Icon.star className="w-3 h-3 text-warning-500" />
                  <span className="font-display text-meta font-bold text-ink-900 tabular-nums leading-none">{fmtRating(t.rating)}</span>
                  <span className="text-meta text-ink-500 tabular-nums">({t.reviews})</span>
                </span>
              )}
            </div>
            {/* CATEGORY CHIP ONLY — the headline was removed from this card on
                2026-07-31, in two steps worth recording because the first one was
                not enough.
                Step 1 swapped the roles: the chip used to hold `headline` (free
                text the expert types) while the category — our own taxonomy — was
                the muted afterthought. That is backwards, because the chip is the
                loudest element on the card and it made an unvalidated string look
                like a platform-verified label. It also left both fields answering
                ONE question („what does this person do?") with no hierarchy, so
                when they AGREED it read as a duplicate („მარკეტერი" /
                „მარკეტინგი", 4 of 9 live rows) and when they DISAGREED the reader
                could not tell which to trust („ანალიტიკა და ქოუჩინგი" /
                „ფსიქოლოგია" — a real row).
                Step 2 dropped the headline outright: at full size it was obvious
                that `headline` is just the one-line version of `bio`, and `bio`
                renders directly beneath it — „გაყიდვების ექსპერტი" sat immediately
                above „გაყიდვების სფეროში მაქვს გამოცდილება…". The card was
                printing the same content twice at two lengths. Removing it takes a
                row off every card, leaves a clean vertical column of category
                chips to scan, and takes the whole duplicate-vs-contradiction
                problem out of the grid. Nothing is lost: all 9 live profiles have
                a bio.
                The headline KEEPS its place on the PROFILE, where it is the lead
                sentence under the name and has the room to be read.
                Deliberately NO stem-dedupe was ever added: any rule sharp enough
                to hide „მარკეტერი" under „მარკეტინგი" also hides
                „ბიზნეს-სტრატეგი" under „ბიზნესი", where the headline is the MORE
                specific of the two.
                `pr-2` on the row: at 390px a truncated label ended 17px from the
                card border and its ellipsis collided with the frame. */}
            <div className="mt-1.5 pr-2 flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-meta font-semibold tracking-tight max-w-full truncate">{t.cat}</span>
            </div>
            {hasExtraLanguage(t.langs) && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-meta text-ink-500 max-w-full">
                <Icon.globe className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                <span className="truncate">{fmtLangs(t.langs, 2)}</span>
              </div>
            )}
            {t.bio && <p className="mt-2 text-small text-ink-600 leading-[1.45] line-clamp-2 break-words">{t.bio}</p>}
          </div>
        </div>

        {/* Demand proof for established experts; for a brand-new expert
            (0 rating) surface the credibility signals they DO have — verified,
            experience, intro video, response — instead of a lonely „ახალი"
            over empty space. Real values only. */}
        {t.rating === 0 ? (
          <NewExpertSignals t={t} className="mt-3" />
        ) : t.sessions > 0 ? (
          <div className="mt-3 text-meta text-ink-600 tabular-nums">
            <span className="font-display font-bold text-ink-900">{t.sessions}</span> სესია
          </div>
        ) : null}
      </div>

      {/* Footer strip — the hairline divider, then price on its own line and two
          equal buttons. Keeping the price above the buttons (instead of beside
          them) is what stopped „· N წთ სესია" from wrapping on a narrow card. */}
      <div className="px-4 py-3 border-t border-ink-100 bg-ink-50/40">
        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="font-display text-h2 font-bold text-ink-900 tabular-nums tracking-tight leading-none">{flagship.label}</span>
          <span className="text-meta font-medium text-ink-500">· {flagship.minutes} წთ სესია</span>
        </div>
        {/* Two-button CTA: booking is the primary niche, messaging the
            secondary. A non-student (tutor/admin) can't book OR message, so
            they get a single neutral note instead of dead-end buttons.
            z-10: these sit above the card-wide overlay link, so „დაჯავშნე" and
            „მიწერე" keep their own actions instead of navigating. */}
        <div className="relative z-10">
          {/* ink-500, not ink-400, on the inert plate below: the muted step is
              documented as 4.75:1 on WHITE, but on a tinted ink-75 ground it
              drops to 4.40 and fails. ink-500 is 5.19 and still reads muted. */}
          {viewerCantBook ? (
            <div className="w-full h-11 rounded-btn bg-ink-75 border border-ink-200 text-ink-500 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center">
              ჯავშანი მხოლოდ სტუდენტს
            </div>
          ) : bookable ? (
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/tutors/${t.slug || t.id}?intent=message`}
                aria-label="მიწერე ექსპერტს"
                className="h-11 px-2 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors duration-fast"
              >
                <Icon.chat className="w-3.5 h-3.5 shrink-0" /> მიწერე
              </Link>
              <button type="button" onClick={() => onBook(t)} className="h-11 px-2 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors duration-fast shadow-xs">
                {needsSignIn ? 'შესვლა და ჯავშანი' : 'დაჯავშნე'}
              </button>
            </div>
          ) : (
            // No published time → ONE live primary, full width. The old layout
            // kept the two-button grid and greyed „დაჯავშნე" out, so 4 of the 9
            // production cards showed a dead half next to a live half — which
            // reads as a broken card, not as an unavailable expert. The message
            // path is how a slot-less expert actually gets booked, so it stops
            // being the secondary here and simply becomes the action.
            <Link
              href={`/tutors/${t.slug || t.id}?intent=message`}
              className="w-full h-11 px-2 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors duration-fast shadow-xs"
            >
              <Icon.chat className="w-3.5 h-3.5 shrink-0" /> მიწერე ექსპერტს
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

/* ───── Video preview — horizontal 16:9, anchored next to play button ───── */
const VideoPreview = ({ tutor, onClose, onBook }: { tutor: Tutor; onClose: () => void; onBook: (t: Tutor) => void }) => {
  // Real YouTube ID from the tutor's stored videoUrl. If the tutor has a
  // legacy `data:video/…` blob (from the deprecated upload path), ytId is null
  // and the modal falls back to a static thumbnail — the player is silent.
  const ytId = tutorYouTubeId(tutor)

  // Close on Escape — expected for a centered modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-sheet flex items-center justify-center p-4 sm:p-6 bg-ink-950/55 backdrop-blur-sm motion-safe:animate-fade-in-fast"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${tutor.name} — ვიდეო`}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[560px] rounded-card overflow-hidden bg-ink-900 shadow-float ring-1 ring-white/10 motion-safe:animate-scale-in"
      >
        {/* Horizontal 16:9 video — YouTube nocookie iframe. Autoplay muted so
            browsers actually let it play without user gesture (they block
            unmuted autoplay). Modest branding + rel=0 hide the YouTube logo
            and related-videos suggestion strip. */}
        <div className="relative aspect-video bg-accent-800 overflow-hidden">
          {ytId ? (
            <iframe
              key={tutor.id}
              src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1&controls=1`}
              title={`${tutor.name} — ვიდეო`}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          ) : (
            // Legacy: tutor has a data:video/ blob (or no video at all). Show
            // a static portrait — no autoplay, no stock MP4. This branch is
            // unreachable when `t.video` gates the play button correctly, but
            // rendered defensively.
            <img
              src={tutor.avatarUrl || DEFAULT_AVATAR}
              alt={tutor.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Bottom gradient for legibility */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-accent-950/85 to-transparent pointer-events-none" />

          {/* Close button (top-right). Mute is handled by the YouTube iframe's
              built-in controls, so no separate mute button here. */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="დახურვა"
              className="w-7 h-7 rounded-full bg-accent-900/65 hover:bg-accent-900 text-white inline-flex items-center justify-center transition-colors duration-fast backdrop-blur"
            >
              <Icon.x className="w-3 h-3" />
            </button>
          </div>

          {/* Tutor strip (over gradient) */}
          <div className="absolute left-3 right-3 bottom-2.5 flex items-center gap-2 pointer-events-none">
            <img src={tutor.avatarUrl || DEFAULT_AVATAR} alt={tutor.name} className="w-7 h-7 rounded-full ring-2 ring-white/30 object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-small font-bold text-white tracking-tight truncate">{tutor.name}</span>
                {tutor.verified && <VerifiedMark size={11} />}
              </div>
              {/* One expert fills this overlay, so the headline still earns its
                  place here (unlike on the grid card, where the bio sits right
                  under it). It goes through `displayHeadline` for the same reason
                  everywhere else does — no „- 7 წელი" tail — and the „·" only
                  renders when there is actually something after it, so an expert
                  with no headline doesn't end the line on a dangling separator. */}
              <div className="text-meta text-white/65 truncate">
                {tutor.cat}{displayHeadline(tutor.headline) && ` · ${displayHeadline(tutor.headline)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Compact action strip */}
        <div className="flex items-center gap-3 px-3.5 py-2.5 bg-accent-900 border-t border-white/8">
          <div className="flex items-center gap-2.5 text-meta text-white/65 min-w-0 flex-1">
            {/* Same zero-state treatment as the card: an unrated expert reads
                „ახალი“, never „0.0“. */}
            {tutor.rating > 0 && tutor.reviews > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Icon.star className="w-3 h-3 text-warning-400" />
                <span className="font-display font-bold text-white tabular-nums">{fmtRating(tutor.rating)}</span>
              </span>
            ) : (
              <span className="font-display font-semibold text-white/70">ახალი</span>
            )}
            <span className="text-white/25">·</span>
            <span className="font-display text-small font-bold text-white tabular-nums">
              ₾{tutor.price}<span className="text-meta font-medium text-white/55 ml-0.5">/ სესია</span>
            </span>
          </div>
          {/* h-11, not h-8: this is a primary CTA with a label, so it takes a
              canon control height rather than a tap-area patch — the bar has
              room and a 32px booking button was the smallest CTA in the flow. */}
          <button type="button" onClick={() => { onBook(tutor); onClose() }} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1 transition-colors duration-fast shrink-0">
            <Icon.cal className="w-3 h-3" />
            დაჯავშნე
          </button>
        </div>
      </div>
    </div>
  )
}

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

const ResultsBar = ({ total, loading, sort, setSort, activeFilters, removeFilter, onReset, onOpenFilters, activeCount }: { total: number; loading?: boolean; sort: string; setSort: (v: string) => void; activeFilters: { k: string; v: string; raw?: string }[]; removeFilter: (k: string, v: string) => void; onReset: () => void; onOpenFilters: () => void; activeCount: number }) => (
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
const Pagination = ({ page, setPage, totalPages }: { page: number; setPage: (n: number) => void; totalPages: number }) => {
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
const CompareModal = ({ open, tutors, onClose, onBook }: { open: boolean; tutors: Tutor[]; onClose: () => void; onBook: (t: Tutor) => void }) => {
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

// Wrapper — useSearchParams requires a Suspense boundary in Next 15. The
// server page (app/tutors/page.tsx) renders this with the SSR-seeded list.
export function TutorsClient({ initialTutors, initialUser }: { initialTutors: any[]; initialUser?: Me | null }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <Tutors initialTutors={initialTutors} initialUser={initialUser} />
    </Suspense>
  )
}

function Tutors({ initialTutors, initialUser }: { initialTutors: any[]; initialUser?: Me | null }) {
  const params = useSearchParams()
  const router = useRouter()
  // Hydrate from URL so /tutors?q=foo&category=business is shareable/refreshable.
  const [search, setSearch] = useState(() => params?.get('q') ?? '')
  // Curated order by default (bookable first, then verified→rating) — see the
  // note on SORT_OPTS for why this is no longer 'new'. An explicit ?sort= wins.
  const [sort, setSort] = useState<string>(() => params?.get('sort') ?? 'rating')
  const [page, setPage] = useState(1)
  // Seed the list from the server-rendered rows so the FIRST paint shows real
  // expert cards (in the initial HTML) instead of a skeleton. Category / price
  // / language filters are applied client-side on top of this list (see
  // visibleTutors), so a category deep-link needs no refetch — only a free-text
  // `q` does (handled on mount below).
  const [liveTutors, setLiveTutors] = useState<Tutor[]>(() => mapRows(initialTutors))
  // No skeleton on first paint — the seed already has data. Only a mount-time
  // `q` refetch (or a later search) flips this true.
  const [loading, setLoading] = useState(false)
  // A failed refetch must not masquerade as results — when set, the grid area
  // renders an inline error card with a retry instead of silently keeping the
  // stale list (same honesty rule as app/student/page.tsx's Discover).
  const [fetchFailed, setFetchFailed] = useState(false)
  // When a free-text search has no exact match, we show a category's experts as
  // a fallback; this holds that category's label for the "showing X instead" note.
  const [searchFallback, setSearchFallback] = useState<string | null>(null)
  // True while `liveTutors` is a RELEVANCE-ranked search result (lib/tutorsQuery
  // orders by trigram similarity whenever `q` is present). Tracks the LOADED
  // list, not the input box, so the order doesn't flip mid-keystroke.
  const [rankedByRelevance, setRankedByRelevance] = useState(false)
  const [favIds, setFavIds] = useState<Set<string>>(new Set())
  // Arriving from the site-wide `/` or ⌘K pressed on a page with no search box:
  // land here with the cursor already in the field, so the shortcut behaves the
  // same everywhere instead of dumping you on a page you must then click into.
  useEffect(() => {
    if (params?.get('focus') !== 'search') return
    // One frame: the input registers during this same commit.
    const t = window.setTimeout(() => focusSearchInput(), 0)
    return () => window.clearTimeout(t)
  }, [params])
  // Shared /api/me (lib/me) — deduped with the top bar + AppShell. `authKnown`
  // is the probe's `ready`: used to relabel the booking CTA ("შესვლა & ჯავშანი")
  // only for KNOWN-anonymous visitors, avoiding a sign-in flash for authed
  // users before the probe returns.
  const { me, ready: authKnown } = useMe()
  const signedIn = !!me
  // Dual-role model (2026-07-23): a TUTOR may act as a CLIENT and book another
  // expert, so only an ADMIN truly can't book — mirror the detail page's guard.
  // Favorites, however, remain STUDENT-only (the favorites API still 403s a
  // TUTOR), so the two affordances need SEPARATE flags. Uses initialUser too so
  // SSR doesn't flash the wrong control for a known role.
  const viewerRoleForBook = (me ?? initialUser)?.role
  const viewerCantBook = viewerRoleForBook === 'ADMIN'
  const viewerCantFav = !!(viewerRoleForBook && viewerRoleForBook !== 'STUDENT')
  // Feedback that reaches the user wherever they are on the page — see the note
  // in toggleFav for why the old scroll-to-top + top-of-page banner were not
  // feedback at all.
  const { toast } = useToast()
  useEffect(() => {
    // Only probe favorites once the shared /api/me has confirmed a signed-in
    // user — this avoids the console-spam 401 on /api/favorites for anon
    // visitors browsing the public tutor list.
    if (!me) return
    let cancelled = false
    ;(async () => {
      try {
        const favRes = await fetch('/api/favorites')
        if (!favRes.ok || cancelled) return
        const rows = await favRes.json()
        if (Array.isArray(rows)) setFavIds(new Set(rows.map((r: any) => r.tutorId)))
      } catch {}
    })()
    return () => { cancelled = true }
  }, [me])

  const toggleFav = React.useCallback(async (tutorId: string) => {
    if (!signedIn) {
      // A TOAST, and nothing else (2026-07-31). This used to do two things, both
      // of which moved the page and neither of which answered the user:
      //   1. `window.scrollTo(0)` — measured on a phone, tapping the heart on
      //      the 4th card flung the page 1033px to the top. The only visible
      //      result of "save" was losing your place.
      //   2. `setNeedsAuth(true)`, which rendered SignInPromptBanner ABOVE the
      //      results grid — i.e. ~1000px above the reader, where they cannot see
      //      it, while shifting every card down by its height (measured +119px)
      //      right under the finger that had just tapped.
      // An action whose only feedback is a thousand pixels away has no feedback,
      // which is precisely why this was reported as „the save function was
      // deleted". The toast is the one surface that appears wherever the reader
      // currently is, and it moves nothing. Sign-in stays one tap away in the
      // header, which is always on screen.
      toast('შესანახად შედი ანგარიშში', 'info')
      return
    }
    const wasFav = favIds.has(tutorId)
    setFavIds(prev => {
      const next = new Set(prev)
      if (wasFav) next.delete(tutorId); else next.add(tutorId)
      return next
    })
    try {
      const res = wasFav
        ? await fetch(`/api/favorites?tutorId=${tutorId}`, { method: 'DELETE' })
        : await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tutorId }),
          })
      if (!res.ok) throw new Error('http ' + res.status)
    } catch {
      // Revert optimistic update on failure — WITH a word about it: the heart
      // snapping back with no explanation reads as a bug, not a network error.
      setFavIds(prev => {
        const next = new Set(prev)
        if (wasFav) next.add(tutorId); else next.delete(tutorId)
        return next
      })
      toast('შენახვა ვერ მოხერხდა', 'error')
    }
  }, [favIds, signedIn, toast])

  // Category filtering is now entirely client-side (see visibleTutors), so the
  // fetch only carries the free-text query. This removes the old conflict where
  // the hero sent a server `category` slug while the sidebar filtered by label.
  const fetchTutors = React.useCallback(async (q: string) => {
    setLoading(true)
    setFetchFailed(false)
    try {
      const query = q.trim()
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      const res = await fetch(`/api/tutors${params.toString() ? `?${params}` : ''}`)
      // A 5xx used to `return` silently, leaving the STALE list on screen as if
      // it were the answer to the new query. Flag it so the grid can say so.
      if (!res.ok) { setFetchFailed(true); return }
      const data = await res.json()
      if (!Array.isArray(data)) { setFetchFailed(true); return }
      // Free-text query with ZERO substring matches would dead-end on the empty
      // state — but the placeholder actively invites natural-language phrasing
      // ("გადასახადი", "კარიერული ნაბიჯი"). Fall back to the same rule-based
      // category detection /ask uses and show that category's experts instead.
      if (query && data.length === 0) {
        const framing = frameQuestion(query)
        if (framing.categorySlug) {
          const catRes = await fetch(`/api/tutors?category=${encodeURIComponent(framing.categorySlug)}`)
          if (catRes.ok) {
            const catData = await catRes.json()
            if (Array.isArray(catData) && catData.length > 0) {
              setLiveTutors(mapRows(catData))
              setSearchFallback(framing.categoryLabel)
              // A category listing, not a ranked search result.
              setRankedByRelevance(false)
              return
            }
          }
        }
      }
      setLiveTutors(mapRows(data))
      setSearchFallback(null)
      setRankedByRelevance(!!query)
    } catch {
      // Offline / dropped connection — same honest state as a 5xx.
      setFetchFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // On mount the list is already seeded from the server (default unfiltered
  // list). So we DON'T refetch on mount unless there is an active free-text
  // query (`?q=…`) — the server seed can't reflect that. Every later `search`
  // change still debounces a refetch. This ref skips only the very first run.
  const didMountFetch = React.useRef(false)
  useEffect(() => {
    if (!didMountFetch.current) {
      didMountFetch.current = true
      // No text query → the SSR seed already IS the correct list; skip the
      // redundant initial fetch (and its skeleton flash) entirely.
      if (!search.trim()) return
    }
    const t = setTimeout(() => fetchTutors(search), 350)
    return () => clearTimeout(t)
  }, [search, fetchTutors])

  // WHEN THE RESULT SET CHANGES, TAKE THE READER TO IT.
  //
  // Reported and reproduced 2026-07-31: scrolled to the bottom of the list,
  // tapping a category chip swapped every card underneath while the viewport
  // stayed at y=1452 — the page simply „did nothing" from where the reader was
  // sitting. Sorting and searching looked like they scrolled, but that was only
  // the page getting shorter and the browser clamping; the number landed
  // somewhere different every time.
  //
  // Deliberately ONE-WAY: it only ever pulls the reader UP to the top of the
  // results. If they are already above them (still choosing filters in the
  // hero), nothing moves — being shoved down mid-decision is its own bug.
  const resultsRef = React.useRef<HTMLDivElement | null>(null)
  const skipFirstScroll = React.useRef(true)

  // …EXCEPT ON THE WAY BACK. Measured 2026-08-02: scroll /tutors to y=1600,
  // open a card, press Back → AppShell restores 1600 correctly and this effect
  // then dragged the reader to y=253, the top of the results. `skipFirstScroll`
  // guards only the very first effect run; the restore is still settling when a
  // later run fires (the filter state re-seeds from the URL, the router replaces
  // it, the 12-frame settle in AppShell is still going), so one guard was never
  // enough. Ask the browser what kind of navigation this is — the same question
  // components/AppShell.tsx asks, for the same reason, and it has to be asked
  // from the navigation TYPE as well as from `popstate`: a back that reloads the
  // document (bfcache miss, restored tab) fires popstate before React mounts.
  //
  // Stored as a TIMESTAMP, not a boolean: a boolean consumed by "the next effect
  // run" would swallow the first genuine filter change instead if the restore
  // never triggered one. This window expires on its own.
  const BACK_QUIET_MS = 1200
  const backAtRef = React.useRef<number | null>(null)
  if (backAtRef.current === null) {
    let popped = false
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      popped = nav?.type === 'back_forward'
    } catch { /* older browsers: the listener below still covers SPA backs */ }
    backAtRef.current = popped ? Date.now() : 0
  }
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPop = () => { backAtRef.current = Date.now() }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const runSearch = () => {
    fetchTutors(search)
    // A submitted search replaces the whole list, so it gets the same treatment
    // as a filter change — the effect above can't see it (the query lives in
    // `search`, which changes on every keystroke, and moving the page while
    // someone types would be worse than not moving at all).
    const el = resultsRef.current
    if (!el || typeof window === 'undefined') return
    const top = el.getBoundingClientRect().top + window.scrollY - 12
    if (window.scrollY > top + 4) window.scrollTo({ top, behavior: 'smooth' })
  }

  /* Click-to-open video preview — opens a centered modal (no anchoring) */
  const [preview, setPreview] = useState<Tutor | null>(null)
  const openPreview = (t: Tutor) => setPreview(t)
  const closeNow = () => setPreview(null)

  /* Shared booking flow — opens without leaving the page */
  const [quickBook, setQuickBook] = useState<Tutor | null>(null)
  const openBook = (t: Tutor) => {
    // A signed-in non-student (TUTOR/ADMIN) can't book — the server 403s. Never
    // open the flow for them (the cards also hide/relabel the CTA); guard here so
    // every entry point (card, video preview, compare) is safe.
    if (viewerCantBook) return
    if (!signedIn) {
      // Anonymous book-tap: previously this discarded the click, scrolled to
      // top and showed a banner far from the card. Instead carry the intent to
      // the profile — ?rebook=1 opens the auth prompt there and auto-opens the
      // booking modal after sign-in.
      router.push(`/tutors/${t.slug || t.id}?rebook=1`)
      return
    }
    setQuickBook(t)
  }
  const closeBook = () => setQuickBook(null)

  /* Quick-Compare modal */
  const [compareOpen, setCompareOpen] = useState(false)

  /* Mobile filters drawer */
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [filters, setFilters] = useState<Filters>(() => {
    const p = params
    const csv = (k: string) => (p?.get(k) ?? '').split(',').filter(Boolean)
    const num = (k: string, def: number) => {
      const raw = p?.get(k)
      if (raw == null || raw === '') return def
      const v = Number(raw)
      return Number.isFinite(v) ? v : def
    }
    // Backward-compat: external links (breadcrumbs, SimilarExperts, the home
    // grid) still point at /tutors?category=<slug>. `cats` now holds SLUGS too,
    // so the deep-link slug seeds straight in — no name lookup needed.
    const seedCats = csv('cats')
    const catParam = p?.get('category')
    if (catParam && catParam !== 'all' && !seedCats.includes(catParam)) {
      seedCats.push(catParam)
    }
    return {
      cats: seedCats,
      minRate: 0,
      langs: csv('langs'),
      available: csv('avail'),
      minRating: num('minRating', 0),
      superOnly: p?.get('super') === '1',
      price: [num('priceMin', 0), num('priceMax', NO_CAP)],
    }
  })

  // WHEN THE RESULT SET CHANGES, TAKE THE READER TO IT.
  //
  // Reported and reproduced 2026-07-31: scrolled to the bottom of the list,
  // tapping a category chip swapped every card underneath while the viewport
  // stayed at y=1452 — from where the reader was sitting, the page simply „did
  // nothing". Sorting and searching only LOOKED like they scrolled: that was the
  // page getting shorter and the browser clamping, which is why the landing
  // position was different every time.
  //
  // Deliberately ONE-WAY: it only ever pulls the reader UP to the top of the
  // results. If they are still above them (choosing filters in the hero),
  // nothing moves — being shoved down mid-decision is its own bug.
  //
  // …and NOT while a back/forward restore is landing — see `backAtRef` above.
  useEffect(() => {
    if (skipFirstScroll.current) { skipFirstScroll.current = false; return }
    if (Date.now() - (backAtRef.current ?? 0) < BACK_QUIET_MS) return
    const el = resultsRef.current
    if (!el || typeof window === 'undefined') return
    const top = el.getBoundingClientRect().top + window.scrollY - 12
    if (window.scrollY > top + 4) window.scrollTo({ top, behavior: 'smooth' })
  }, [filters, sort, page])

  const resetFilters = () => setFilters({
    cats: [], minRate: 0, langs: [], available: [], minRating: 0, superOnly: false, price: [0, NO_CAP],
  })

  // Live, admin-managed categories (GET /api/categories → isLive only). Drives
  // every category chip/checkbox; `filters.cats` stores the SLUGS these carry.
  // Starts empty → the sphere filter is hidden until this resolves (and stays
  // hidden if the fetch fails), so we never show a dead/unmatched chip.
  const [liveCats, setLiveCats] = useState<LiveCat[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        // Offer only categories that actually have a visible expert — an option
        // that can only return zero results is a dead end. A deep-linked
        // ?category= still works: the server query is independent of this list.
        setLiveCats(rows
          .filter(r => r && r.slug && r.name && (r.expertCount ?? 0) > 0)
          .map(r => ({ id: r.id, slug: r.slug, name: r.name, expertCount: r.expertCount })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Keep URL in sync with all filter state so refresh + share work.
  useEffect(() => {
    const url = new URLSearchParams()
    if (search.trim()) url.set('q', search.trim())
    // Only non-default sorts land in the URL — 'rating' (curated) IS the default.
    // This MUST track the useState initializer above; when the two disagreed the
    // default sort was written into every URL as if the user had chosen it.
    if (sort !== 'rating') url.set('sort', sort)
    // Categories live entirely in `cats` now (the hero chips write here too),
    // so there is no separate `category` param to keep in sync.
    if (filters.cats.length > 0) url.set('cats', filters.cats.join(','))
    if (filters.langs.length > 0) url.set('langs', filters.langs.join(','))
    if (filters.available.length > 0) url.set('avail', filters.available.join(','))
    if (filters.minRating > 0) url.set('minRating', String(filters.minRating))
    if (filters.superOnly) url.set('super', '1')
    if (filters.price[0] > 0) url.set('priceMin', String(filters.price[0]))
    if (filters.price[1] < NO_CAP) url.set('priceMax', String(filters.price[1]))
    const qs = url.toString()
    router.replace(qs ? `/tutors?${qs}` : '/tutors', { scroll: false })
  }, [search, sort, filters, router])

  const removeFilter = (k: string, v: string) => {
    if (k === 'cat')   setFilters({ ...filters, cats:    filters.cats.filter(x => x !== v) })
    if (k === 'lang')  setFilters({ ...filters, langs:   filters.langs.filter(x => x !== v) })
    if (k === 'avail') setFilters({ ...filters, available: filters.available.filter(x => x !== v) })
    if (k === 'rate')  setFilters({ ...filters, minRating: 0 })
    if (k === 'super') setFilters({ ...filters, superOnly: false })
    if (k === 'price') setFilters({ ...filters, price: [0, NO_CAP] })
  }

  // `raw` carries the value removeFilter needs (the SLUG for categories), while
  // `v` is the human label shown on the chip (the category NAME). For every other
  // filter the two coincide.
  const activeFilters: { k: string; v: string; raw?: string }[] = [
    ...filters.cats.map(slug  => ({ k: 'cat',   v: catNameOf(liveCats, slug), raw: slug })),
    ...filters.langs.map(l   => ({ k: 'lang',  v: l })),
    // `v` is what the chip PRINTS, so it must be the Georgian label — the raw
    // id („today“) leaked onto the chip while the hero dropdown showed „დღეს“.
    ...filters.available.map(a => ({ k: 'avail', v: FILTER_AVAIL.find(x => x.id === a)?.l ?? a, raw: a })),
    ...(filters.minRating > 0 ? [{ k: 'rate', v: `${filters.minRating}+ ★` }] : []),
    ...(filters.superOnly ? [{ k: 'super', v: 'Super-ექსპერტი' }] : []),
    ...(priceBandActive(filters.price[0], filters.price[1]) ? [{ k: 'price', v: priceBandLabel(filters.price[0], filters.price[1]) }] : []),
  ]

  // Apply sidebar filters + sort client-side on top of the API-loaded list.
  const visibleTutors = React.useMemo(() => {
    const now = new Date()
    // `passesFilters` (module scope) is the ONE predicate — the facet counts
    // below call the same function with a dimension skipped.
    let out = liveTutors.filter(t => passesFilters(t, filters, now))
    switch (sort) {
      // „ახლის მიხედვით" (DEFAULT): newest first. The server order is
      // verified→rating, which buries brand-new experts — so sort explicitly by
      // createdAt desc. Rows without a createdAt fall to the end (epoch 0).
      //
      // EXCEPT during a free-text search: the server has already ordered those
      // rows by trigram relevance (lib/tutorsQuery), and re-sorting by
      // createdAt would push the best Georgian-declension match onto page 3 of
      // an 8-per-page list — the same silent loss as re-filtering client-side.
      // The user can still pick any explicit sort; only the DEFAULT defers.
      case 'new':      if (!rankedByRelevance) out = [...out].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()); break
      // „ჩვენი რჩევით": KEEP the server's curated order (verified→rating with
      // bookable experts bubbled up, from queryTutors). Re-sorting purely by
      // rating here discarded that curation — a verified, bookable but brand-new
      // expert (rating 0) sank below a mediocre unverified one. Leaving the
      // seeded order intact IS „our recommendation".
      case 'rating':   /* keep the server's curated order */ break
      case 'sessions': out = [...out].sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0)); break
      case 'price-a':  out = [...out].sort((a, b) => a.price - b.price); break
      case 'price-d':  out = [...out].sort((a, b) => b.price - a.price); break
    }
    return out
  }, [liveTutors, filters, sort, rankedByRelevance])

  // Per-option counts for rating / availability / Super, computed against the
  // loaded roster with that option's OWN dimension excluded — so „4.0+ (0)"
  // and „ამ კვირას (2)" can be true at the same time. Feeds both filter
  // surfaces; see the `Facets` note near CheckOpt for why they exist at all.
  const facets = React.useMemo<Facets>(() => {
    const now = new Date()
    const ratingBase = liveTutors.filter(t => passesFilters(t, filters, now, 'rating'))
    const availBase = liveTutors.filter(t => passesFilters(t, filters, now, 'avail'))
    const superBase = liveTutors.filter(t => passesFilters(t, filters, now, 'super'))
    const rating: Record<string, number> = {}
    for (const r of FILTER_RATINGS) rating[String(r)] = ratingBase.filter(t => (t.rating ?? 0) >= r).length
    const avail: Record<string, number> = {}
    for (const a of FILTER_AVAIL) avail[a.id] = availBase.filter(t => availMatches(t, a.id, now)).length
    return { rating, avail, superOnly: superBase.filter(t => t.superExpert).length }
  }, [liveTutors, filters])

  const total = visibleTutors.length
  // 8 split a 9-expert roster into „გვერდი 1 / 2" with ONE person on page two —
  // pagination that exists only to announce how short the list is, and a second
  // click to see a card that would have fitted on the first screen. 24 is four
  // rows of the 2-up grid: it keeps the whole roster on one page at today's
  // size while still capping the DOM if the catalogue grows (the API already
  // caps its own fetch at 200). Revisit when a filtered view routinely exceeds
  // this — pagination is the right answer then, it just isn't yet.
  const PER_PAGE = 24
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  // Any change to the result set (filters, search, category, sort) sends the
  // user back to page 1 so they don't land mid-way through a different list.
  useEffect(() => { setPage(1) }, [filters, search, sort])
  // Keep the current page in range whenever the result set shrinks (new filter,
  // search, etc.) so we never sit on an empty page past the end.
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [totalPages, page])
  const pagedTutors = visibleTutors.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // A signed-in STUDENT browsing the catalog keeps THEIR workspace shell (with
  // „ექსპერტები" active + Logo→/student) instead of the public header — so they
  // never feel they left their account and always have a way back. Guests and
  // tutors/admins keep the public header. `initialUser` seeds SSR so the header
  // doesn't flip on hydration; `me` refreshes it after the /api/me probe.
  const viewer = me ?? initialUser ?? null
  const studentShell = viewer?.role === 'STUDENT'

  // The term the visitor actually searched for, used by the dead-end empty
  // state below. Echoed back (clipped, so a pasted paragraph can't blow up the
  // heading) and carried into /ask so the intent survives the miss.
  const searchQ = search.trim()
  const searchQEcho = searchQ.length > 40 ? `${searchQ.slice(0, 40)}…` : searchQ

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      {studentShell
        ? <StudentAppBar user={viewer ? { name: viewer.fullName, avatar: viewer.avatarUrl } : undefined} />
        : <PublicTopBar activeHref="/tutors" initialUser={initialUser} />}

      <SearchHero filters={filters} setFilters={setFilters} search={search} setSearch={setSearch} onSearch={runSearch} total={total} loading={loading} liveCats={liveCats} facets={facets} />

      {/* Browse is a standard public section, same as /categories and /blog. */}
      <Container as="main" id="main" className="py-12 lg:py-16">
        {/* SignInPromptBanner removed 2026-07-31. `toggleFav` was its ONLY
            trigger, and it rendered here — above the results, i.e. off-screen
            for the reader who had just tapped a heart 1000px further down —
            while pushing every card down by its own height. It could never be
            seen by the person it was written for. The toast in `toggleFav`
            replaces it; the header's „შესვლა" is the permanent path. */}
        {/* „ბოლოს ნანახი" strip removed 2026-07-27 — it pushed the actual
            results below the fold and repeated cards the visitor had just
            scrolled past. The component still serves the home page. */}
        {/* Full-width grid. Refinements live in the hero's inline dropdown row
            from lg up, and in the drawer below lg. */}
        <div>
          {/* Anchor for the „take me to the new results" scroll below. */}
          <div ref={resultsRef} className="min-w-0">
            <ResultsBar
              total={total}
              loading={loading}
              sort={sort}
              setSort={setSort}
              activeFilters={activeFilters}
              removeFilter={removeFilter}
              onReset={resetFilters}
              onOpenFilters={() => setFiltersOpen(true)}
              activeCount={activeFilters.length}
            />

            {/* Search fallback note — the query had no exact match, so we're
                showing a detected category's experts instead of a dead end. */}
            {searchFallback && !loading && (
              <div className="mb-4 flex items-start gap-2.5 rounded-card border border-ink-200 bg-ink-50/60 px-4 py-3 text-small text-ink-700">
                <Icon.search className="w-4 h-4 mt-0.5 text-ink-400 shrink-0" />
                <span>
                  {search.trim() && <>„<span className="font-display font-semibold text-ink-900">{search.trim()}</span>“ — ზუსტი დამთხვევა არ არის. </>}
                  ვაჩვენებთ <span className="font-display font-semibold text-ink-900">{searchFallback}</span>-ის ექსპერტებს.
                </span>
              </div>
            )}

            <div className={`relative motion-safe:transition-opacity motion-safe:duration-fast ${loading && liveTutors.length > 0 ? 'opacity-60' : ''}`}>
              {/* Refetch indicator — the first-paint skeleton below only covers
                  an empty list, so on re-search/refilter (when results already
                  exist) we dim the stale list and show an inline spinner. */}
              {loading && liveTutors.length > 0 && (
                <div className="pointer-events-none absolute inset-x-0 -top-2 z-10 flex justify-center" aria-live="polite">
                  <span className="inline-flex items-center gap-2 h-8 px-3 rounded-pill bg-white border border-ink-200 shadow-card text-meta font-display font-semibold text-ink-700">
                    <span aria-hidden className="w-3.5 h-3.5 rounded-full border-2 border-ink-200 border-t-brand-500 motion-safe:animate-spin" />
                    ახლდება…
                  </span>
                </div>
              )}
              {fetchFailed && !loading ? (
                // Failed refetch ≠ results. Whatever list is underneath is
                // STALE — say so and offer the same fetch again, instead of
                // letting a 5xx pose as an answer to the new query.
                <div className="py-10 px-6 text-center rounded-card border border-ink-200 bg-white" role="alert">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-100 text-ink-500 mb-3">
                    <Icon.warn className="w-5 h-5" />
                  </div>
                  <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">
                    ვერ ჩაიტვირთა — სცადე თავიდან
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchTutors(search)}
                    className="mt-4 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast"
                  >
                    <Icon.refresh className="w-3.5 h-3.5" />
                    სცადე თავიდან
                  </button>
                </div>
              ) : loading && liveTutors.length === 0 ? (
                // First-paint skeleton: three placeholder cards while /api/tutors
                // resolves. Prevents the "no experts found" empty-state from
                // flashing before real data arrives.
                // Same 1-up/2-up grid and the same horizontal shape as a real
                // card (ROUND thumb + content + footer strip), so the list
                // doesn't reflow when the data lands. Keep the thumb's shape and
                // size in lockstep with TutorCard's — a square placeholder that
                // resolves into a circle is a visible pop.
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-busy="true" aria-live="polite">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="rounded-card border border-ink-200 bg-white overflow-hidden motion-safe:animate-pulse">
                      <div className="p-4 flex items-start gap-3.5">
                        <div className="shrink-0 w-28 h-28 lg:w-36 lg:h-36 rounded-full bg-ink-100" />
                        <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                          <div className="h-4 w-2/5 bg-ink-100 rounded" />
                          <div className="h-3 w-3/5 bg-ink-100 rounded" />
                          <div className="h-3 w-4/5 bg-ink-100 rounded" />
                        </div>
                      </div>
                      <div className="px-4 py-3 border-t border-ink-100 bg-ink-50/40 space-y-2.5">
                        <div className="h-4 w-24 bg-ink-100 rounded" />
                        <div className="h-11 bg-ink-100 rounded-btn" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleTutors.length === 0 ? (
                // Compact canon empty state — icon + one line + one action.
                // THREE distinct dead ends, and they need different exits:
                //
                //   a) the SEARCH matched nothing (server returned zero rows).
                //      „ფილტრების გასუფთავება" is a no-op here — the filters
                //      never ran — so it would strand the visitor. This is also
                //      the most valuable moment on the site: they just named an
                //      expert we don't have. Carry the query to /ask (?q=, the
                //      param that page actually reads) so the intent is captured
                //      instead of lost. The API records the same miss as
                //      `search_zero` server-side (lib/events).
                //   b) a COLD marketplace (no experts at all, no query).
                //   c) the filters killed a non-empty result set → offer reset.
                liveTutors.length === 0 ? (
                  searchQ ? (
                    <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                      <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-100 text-ink-500 mb-3">
                        <Icon.search className="w-5 h-5" />
                      </div>
                      <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">
                        „{searchQEcho}“ — ექსპერტი ვერ ვიპოვეთ
                      </div>
                      {/* Honest: we promise a reply, NOT a match. */}
                      <p className="text-small text-ink-500 mt-1.5 max-w-[380px] mx-auto leading-snug">
                        დაწერე, რა გჭირდება — გავეცნობით და მოგწერთ.
                      </p>
                      <Link
                        href={`/ask?q=${encodeURIComponent(searchQ.slice(0, 200))}`}
                        className="mt-4 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast"
                      >
                        დასვი კითხვა
                      </Link>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => { setSearch(''); resetFilters() }}
                          className="font-display text-small font-semibold text-ink-500 hover:text-ink-900 transition-colors duration-fast"
                        >
                          ყველა ექსპერტი
                        </button>
                      </div>
                    </div>
                  ) : (
                  <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                    {/* The drawing replaces the grey icon disc once its PNG
                        ships; until then `hasIllustration` keeps the disc, so
                        this state never degrades to a bare heading. */}
                    {hasIllustration('expertSearch') ? (
                      <div className="flex justify-center mb-2">
                        <Illustration name="expertSearch" alt="" />
                      </div>
                    ) : (
                      <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-100 text-ink-500 mb-3">
                        <Icon.search className="w-5 h-5" />
                      </div>
                    )}
                    <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">
                      ამ პარამეტრებით ექსპერტი ვერ მოიძებნა
                    </div>
                    <p className="text-small text-ink-500 mt-1.5 max-w-[360px] mx-auto leading-snug">
                      სცადე ფილტრების შეცვლა ან დასვი კითხვა ექსპერტს.
                    </p>
                    <a href="/ask" className="mt-4 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast">
                      დასვი კითხვა
                    </a>
                  </div>
                  )
                ) : (
                  <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                    <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-brand-50 text-brand-600 mb-3">
                      <Icon.search className="w-5 h-5" />
                    </div>
                    <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">
                      ვერ ვიპოვეთ — სცადე სხვა ფილტრი
                    </div>
                    <button type="button" onClick={resetFilters} className="mt-4 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast">
                      ფილტრების გასუფთავება
                    </button>
                  </div>
                )
              ) : (
                // 1-up on mobile, 2-up from sm — the horizontal card is built
                // for both. Grid items stretch and the card is `h-full flex
                // flex-col` with the footer after a `flex-1` body, so a row's
                // cards share one height AND their button rows share a baseline.
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pagedTutors.map((t, i) => <TutorCard key={t.id} idx={i} t={t} onPreviewEnter={openPreview} onBook={openBook} saved={favIds.has(t.id)} onToggleFav={toggleFav} needsSignIn={authKnown && !signedIn} viewerCantBook={viewerCantBook} viewerCantFav={viewerCantFav} />)}
                </div>
              )}
            </div>

            {/* Helper strip — placed BEFORE pagination so it's actually seen */}
            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              {/* Subject was a percent-encoded „შემი მოთხოვნა" — a typo for
                  „ჩემი". Named for what the card actually offers instead. */}
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('ექსპერტის მოთხოვნა')}`} className="group text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-5 flex items-start gap-4">
                <span className="w-10 h-10 shrink-0 rounded-btn bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                  <Icon.spark className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-body font-bold text-ink-900 tracking-tight">ვერ იპოვე შესაფერისი?</div>
                  <p className="text-meta text-ink-600 mt-0.5 leading-snug">მოგვწერე — 24 საათში შემოგთავაზებთ 3 ვარიანტს.</p>
                </div>
              </a>
              {liveTutors.length >= 2 && (
                <button type="button" onClick={() => setCompareOpen(true)} className="group text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-5 flex items-start gap-4">
                  <span className="w-10 h-10 shrink-0 rounded-btn bg-ink-100 text-ink-700 inline-flex items-center justify-center">
                    <Icon.sliders className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-body font-bold text-ink-900 tracking-tight">შეადარე ტოპ 3</div>
                    <p className="text-meta text-ink-600 mt-0.5 leading-snug">რეიტინგი, ფასი, ენები — ერთ ცხრილში.</p>
                  </div>
                </button>
              )}
            </div>

            <Pagination page={page} setPage={setPage} totalPages={totalPages} />
          </div>
        </div>
      </Container>

      <Footer />

      {/* Tutor video preview — centered modal (16:9) */}
      {preview && <VideoPreview tutor={preview} onClose={closeNow} onBook={openBook} />}

      {/* Shared booking flow (same component as the profile) — tier step,
          slot picker, mandatory intake; the flow fetches the expert by id. */}
      {quickBook && <BookingFlow open onClose={closeBook} tutorId={quickBook.id} />}

      {/* Quick-Compare modal — top 3 side-by-side */}
      <CompareModal open={compareOpen} tutors={visibleTutors.slice(0, 3)} onClose={() => setCompareOpen(false)} onBook={openBook} />

      {/* Filters drawer — below lg only (its trigger is `lg:hidden`); right-side
          sheet, bottom sheet on mobile. */}
      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        variant="side"
        size="sm"
        ariaLabel="ფილტრები"
        title={
          <span className="inline-flex items-center gap-2">
            <Icon.sliders className="w-4 h-4 text-ink-700" />
            ფილტრები
            {activeFilters.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill bg-brand-600 text-white text-meta font-display font-bold tabular-nums">
                {activeFilters.length}
              </span>
            )}
          </span>
        }
        footer={
          <>
            {activeFilters.length > 0 && (
              <button type="button" onClick={resetFilters} className="mr-auto font-display text-small font-semibold text-ink-500 hover:text-ink-900 transition-colors duration-fast">გასუფთავება</button>
            )}
            {/* `flex-1` below sm — the Sheet footer is `flex justify-end`, and
                „გასუფთავება" only renders once a filter is ACTIVE. So in the
                state every visitor meets FIRST (sheet just opened, nothing set)
                this button was alone and right-aligned: measured 161px inside a
                390px footer, with 209px of dead space beside it and the primary
                action hugging one thumb's corner. On a phone the confirm action
                of a bottom sheet should own the row. From sm up it keeps its
                natural width — there the pair reads correctly. */}
            <button type="button" onClick={() => setFiltersOpen(false)} className="h-11 px-5 flex-1 sm:flex-none rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast">
              ნახე {total} ექსპერტი
            </button>
          </>
        }
      >
        <FiltersPanel filters={filters} setFilters={setFilters} liveCats={liveCats} facets={facets} />
      </Sheet>
    </div>
  )
}


