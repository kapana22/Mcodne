'use client'
import React, { useState, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { StudentAppBar } from '@/components/StudentAppBar'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { KA_MONTHS_SHORT } from '@/lib/kaDate'
import { RecentTutorsStrip } from '@/components/RecentTutorsStrip'
import { SignInPromptBanner } from '@/components/SignInPromptBanner'
import { Sheet } from '@/components/Sheet'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { frameQuestion } from '@/lib/askFraming'
import { fmtRating } from '@/lib/fmt'
import { useMe, type Me } from '@/lib/me'
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
import { TUTOR_DEFAULTS, priceForDuration } from '@/components/booking/slots'


const Logo = () => (
  <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
  </Link>
)

const VerifiedMark = ({ size = 18 }: { size?: number }) => (
  <span title="გადამოწმებული" className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

/* ───── Search hero ───── */
// Category identity is unified: the hero chips and the sidebar checkboxes both
// filter client-side by category NAME (label). `slug` is retained only to map
// legacy /tutors?category=<slug> deep links back to their label on load.
const QUICK_CATS: { slug: string; label: string }[] = [
  { slug: 'business',    label: 'ბიზნესი' },
  { slug: 'tax',         label: 'გადასახადები' },
  { slug: 'finance',     label: 'ფინანსები' },
  { slug: 'law',         label: 'სამართალი' },
  { slug: 'marketing',   label: 'მარკეტინგი' },
  { slug: 'sales',       label: 'გაყიდვები' },
  { slug: 'it',          label: 'IT' },
  { slug: 'product',     label: 'პროდაქტი' },
  { slug: 'design',      label: 'დიზაინი' },
  { slug: 'career',      label: 'კარიერა' },
  { slug: 'hr',          label: 'HR' },
  { slug: 'real-estate', label: 'უძრავი ქონება' },
  { slug: 'relocation',  label: 'რელოკაცია' },
  { slug: 'crypto',      label: 'კრიპტო' },
]


// Category identity is unified with the sidebar: both the hero chips and the
// sidebar checkboxes toggle the SAME `filters.cats` (category NAMES) and are
// applied by one client-side filter. Previously the chips sent a server `slug`
// while the sidebar filtered by label, so the two could silently contradict.
// Preply-style filter dropdown: a labeled box that opens a popover of options.
const FilterBox = ({ label, value, active, children }: { label: string; value: string; active: boolean; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className={`h-12 min-w-[140px] w-full sm:w-auto px-3.5 rounded-card border text-left flex items-center justify-between gap-2 transition-all ${active ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-200' : 'border-ink-200 hover:border-ink-300 bg-white'}`}>
        <span className="min-w-0">
          <span className="block text-[10px] font-display font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</span>
          <span className={`block font-display text-[13px] font-bold truncate ${active ? 'text-brand-800' : 'text-ink-900'}`}>{value}</span>
        </span>
        <Icon.chevD className={`w-4 h-4 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        // Mobile: the trigger is full-width, so the panel spans it (inset-x-0)
        // and can never poke past the viewport; sm+ gets the fixed 248px card.
        <div className="absolute z-40 top-full inset-x-0 sm:inset-x-auto sm:left-0 mt-2 sm:w-[248px] rounded-card border border-ink-200 bg-white shadow-float p-2 max-h-[340px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  )
}

const CheckOpt = ({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) => (
  <button type="button" onClick={onToggle} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-btn hover:bg-ink-50 text-left transition-colors">
    <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300'}`}>{on && <Icon.check className="w-3 h-3" />}</span>
    <span className="text-[13px] text-ink-800">{label}</span>
  </button>
)

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
        <span className="text-[13px] font-display font-bold text-ink-900 tabular-nums">
          {active ? `₾${lo} – ${hiRaw >= NO_CAP ? `₾${PRICE_MAX}+` : `₾${hiRaw}`}` : 'ნებისმიერი'}
        </span>
        {active && (
          <button type="button" onClick={() => onChange([0, NO_CAP])} className="text-[11.5px] font-display font-semibold text-ink-500 hover:text-ink-800 transition-colors">
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
      <div className="flex items-center justify-between mt-2 text-[11px] text-ink-400 tabular-nums">
        <span>₾{PRICE_MIN}</span>
        <span>₾{PRICE_MAX}+</span>
      </div>
    </div>
  )
}

const toggleIn = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

const SearchHero = ({ filters, setFilters, search, setSearch, onSearch, total, loading }: { filters: Filters; setFilters: (f: Filters) => void; search: string; setSearch: (v: string) => void; onSearch: () => void; total: number; loading: boolean }) => {
  const catVal = filters.cats.length === 0 ? 'ყველა სფერო' : filters.cats.length === 1 ? filters.cats[0] : `${filters.cats.length} სფერო`
  // Live result count as the page heading (DESIGN_FIX_PROMPT 1.9). The label
  // reflects the active refinement: one category → its name; several → the
  // count; a text query → the query itself. While loading show a neutral
  // heading — never a stale or invented number.
  const headingLabel =
    filters.cats.length === 1 ? filters.cats[0]
    : filters.cats.length > 1 ? `${filters.cats.length} სფერო`
    : search.trim() ? `„${search.trim()}“`
    : null
  const priceVal = priceBandLabel(filters.price[0], filters.price[1])
  const langVal = filters.langs.length === 0 ? 'ნებისმიერი ენა' : filters.langs.length === 1 ? filters.langs[0] : `${filters.langs.length} ენა`
  const availVal = filters.available.length === 0 ? 'ნებისმიერ დროს' : filters.available.map(id => FILTER_AVAIL.find(a => a.id === id)?.l ?? id).join(', ')
  return (
    <section className="bg-white border-b border-ink-200">
      <Container className="pt-8 pb-6">
        <nav aria-label="ნავიგაცია" className="flex items-center gap-1.5 text-[12px] text-ink-500 mb-4">
          <Link href="/" className="hover:text-ink-800 transition-colors">მთავარი</Link>
          <Icon.chevR className="w-3 h-3 text-ink-300" />
          <span className="font-display font-semibold text-ink-800">ექსპერტების ძიება</span>
        </nav>

        {/* aria-live: filter/search changes re-announce the fresh count. */}
        <h1 aria-live="polite" className="font-display text-[26px] sm:text-[34px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
          {loading
            ? 'იპოვე შენი ექსპერტი'
            : headingLabel
              ? <><span className="tabular-nums">{total}</span> ექსპერტი · {headingLabel}</>
              : <><span className="tabular-nums">{total}</span> ექსპერტი შენთვის</>}
        </h1>
        {/* Honest by flag: only claim escrow once the payment gateway is live. */}
        <p className="text-[13.5px] text-ink-500 mt-2">ხელით გადამოწმებული პროფესიონალები · გამჭვირვალე ფასი · {PAYMENTS_LIVE ? 'დაცული გადახდა' : 'დაჯავშნა უფასოა'}</p>

        {/* Preply-style filter bar — labeled dropdown boxes on desktop.
            Below lg the four dropdowns would stack into ~1.5 screens of
            controls BEFORE the first result — so on mobile we show only the
            search input plus a category chip rail; the full filter set lives
            in the drawer (ფილტრები button in the results bar). */}
        <div className="mt-5 flex flex-col lg:flex-row lg:flex-wrap items-stretch gap-2.5">
          <div className="hidden lg:contents">
          <FilterBox label="სფერო" value={catVal} active={filters.cats.length > 0}>
            {FILTER_CATS.map(c => <CheckOpt key={c.l} label={c.l} on={filters.cats.includes(c.l)} onToggle={() => setFilters({ ...filters, cats: toggleIn(filters.cats, c.l) })} />)}
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
            {FILTER_AVAIL.map(a => <CheckOpt key={a.id} label={a.l} on={filters.available.includes(a.id)} onToggle={() => setFilters({ ...filters, available: toggleIn(filters.available, a.id) })} />)}
          </FilterBox>
          <button type="button" onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })} className={`h-12 px-4 rounded-card border font-display text-[13px] font-bold inline-flex items-center gap-2 transition-all ${filters.superOnly ? 'border-brand-500 bg-brand-50/40 text-brand-800 ring-1 ring-brand-200' : 'border-ink-200 hover:border-ink-300 bg-white text-ink-800'}`}>
            <Icon.spark className="w-4 h-4 text-ink-400" /> Super
          </button>
          </div>
          <div className="flex-1 min-w-[220px] bg-white rounded-card border border-ink-200 flex items-stretch focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
            <div className="relative flex-1 min-w-0">
              <Icon.search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearch() }} placeholder="ძებნა სახელით ან თემით…" className="w-full h-12 pl-10 pr-3 bg-transparent text-[13.5px] text-ink-900 placeholder:text-ink-400 focus:outline-none" />
            </div>
          </div>
        </div>

        {/* Mobile category rail — one-tap refinement without opening the
            drawer. Horizontal scroll, active chips in brand. */}
        <div className="lg:hidden mt-3 -mx-6 px-6 flex gap-2 overflow-x-auto scrollbar-hide rail-fade-end" role="group" aria-label="სფეროს ფილტრი">
          <button
            type="button"
            onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
            className={`shrink-0 h-10 px-3.5 rounded-pill border font-display text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors ${filters.superOnly ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-700'}`}
          >
            <Icon.spark className="w-3.5 h-3.5 text-ink-400" /> Super
          </button>
          {FILTER_CATS.map(c => {
            const on = filters.cats.includes(c.l)
            return (
              <button
                key={c.l}
                type="button"
                onClick={() => setFilters({ ...filters, cats: toggleIn(filters.cats, c.l) })}
                className={`shrink-0 h-10 px-3.5 rounded-pill border font-display text-[12.5px] font-semibold transition-colors ${on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-700'}`}
              >
                {c.l}
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

// Category labels must exactly match `category.name` returned by /api/tutors,
// otherwise the client-side filter won't match anything.
const FILTER_CATS = [
  { l: 'ბიზნესი', c: 0 },
  { l: 'გადასახადები', c: 0 },
  { l: 'ფინანსები', c: 0 },
  { l: 'სამართალი', c: 0 },
  { l: 'მარკეტინგი', c: 0 },
  { l: 'გაყიდვები', c: 0 },
  { l: 'IT', c: 0 },
  { l: 'პროდაქტი', c: 0 },
  { l: 'დიზაინი', c: 0 },
  { l: 'კარიერა', c: 0 },
  { l: 'HR', c: 0 },
  { l: 'უძრავი ქონება', c: 0 },
  { l: 'რელოკაცია', c: 0 },
  { l: 'კრიპტო', c: 0 },
]

// No counts here on purpose — the old hardcoded numbers (142/98/…) were
// fabricated and rendered as if real. If per-language counts ever return,
// they must be computed from the loaded result set.
const FILTER_LANGS = [
  { l: 'ქართული' },
  { l: 'English' },
  { l: 'Русский' },
  { l: 'Türkçe' },
]

// The DB stores language CODES (ka/en/ru/tr); cards + the language filter work
// in human labels. Map codes → labels so a stored ["ka","en"] matches the
// "ქართული"/"English" filter chips (previously they never did → 0 results).
const LANG_LABEL: Record<string, string> = { ka: 'ქართული', en: 'English', ru: 'Русский', tr: 'Türkçe' }
const toLangLabel = (code: string): string => LANG_LABEL[code] ?? code

// Only expose availability windows we can actually evaluate from the list
// data (each tutor's soonest free slot, `nextSlotAt`). "Weekend/evening"
// needed per-slot data the list endpoint doesn't return, so they were dropped
// rather than shipped as no-op checkboxes.
const FILTER_AVAIL = [
  { id: 'today', l: 'დღეს' },
  { id: 'week',  l: 'ამ კვირას' },
]

const FilterSection = ({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full py-4 flex items-center justify-between text-left hover:text-ink-900 transition-colors">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-700">{title}</span>
        <Icon.chevD className={`w-3.5 h-3.5 text-ink-500 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="pb-5">{children}</div>}
    </div>
  )
}

const CheckRow = ({ label, count, on, onToggle }: { label: string; count: number; on: boolean; onToggle: () => void }) => (
  <label className="flex items-center gap-2.5 cursor-pointer select-none py-1.5 hover:text-ink-900 transition-colors">
    <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors ${on ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
      {on && <Icon.check className="w-3 h-3 text-white" />}
    </span>
    <input type="checkbox" checked={on} onChange={onToggle} className="sr-only" />
    <span className="flex-1 text-[13px] text-ink-800">{label}</span>
    {count > 0 && <span className="text-[11.5px] text-ink-500 tabular-nums">{count}</span>}
  </label>
)

const FiltersPanel = ({ filters, setFilters, total, onReset, variant = 'sidebar', onClose }: { filters: Filters; setFilters: (f: Filters) => void; total: number; onReset: () => void; variant?: 'sidebar' | 'drawer'; onClose?: () => void }) => {
  const toggleArr = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  const active =
    filters.cats.length + filters.langs.length + filters.available.length +
    (filters.minRating > 0 ? 1 : 0) +
    (filters.superOnly ? 1 : 0) +
    (priceBandActive(filters.price[0], filters.price[1]) ? 1 : 0)

  const isDrawer = variant === 'drawer'

  return (
    // Drawer mode renders bare filter sections — the Sheet wrapper at the
    // usage site supplies the pinned header (title + count) and footer
    // (reset/apply), plus scroll/trap/Escape.
    <aside className={isDrawer ? '' : 'hidden lg:block lg:sticky lg:top-[80px]'}>
      <div className={isDrawer ? '' : 'bg-white rounded-card border border-ink-200'}>
        {!isDrawer && (
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between shrink-0">
            <div className="inline-flex items-center gap-2">
              <Icon.sliders className="w-4 h-4 text-ink-700" />
              <span className="font-display text-[13px] font-bold text-ink-900 tracking-tight">ფილტრები</span>
              {active > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill bg-brand-500 text-white text-[10.5px] font-display font-bold tabular-nums">
                  {active}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {active > 0 && (
                <button type="button" onClick={onReset} className="font-display text-[11.5px] font-semibold text-ink-500 hover:text-ink-900 transition-colors">გასუფთავება</button>
              )}
            </div>
          </div>
        )}

        <div className={isDrawer ? '' : 'px-5'}>
          {/* Prominent Super-expert switch */}
          <label className="flex items-start gap-3 cursor-pointer select-none py-4 border-b border-ink-100">
            <button
              type="button"
              onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
              className={`mt-0.5 w-9 h-5 rounded-pill relative transition-colors duration-fast shrink-0 ${filters.superOnly ? 'bg-brand-500' : 'bg-ink-200'}`}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-card transition-transform duration-fast ease-out-quart"
                style={{ transform: filters.superOnly ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[12.5px] font-bold text-ink-900 inline-flex items-center gap-1.5">
                <Icon.spark className="w-3 h-3 text-ink-400" />
                მხოლოდ Super-ექსპერტი
              </div>
              <p className="text-[11.5px] text-ink-500 mt-0.5 leading-snug">100+ სესია · 4.9+ · გადამოწმებული</p>
            </div>
          </label>

          <FilterSection title="კატეგორია">
            <div className="space-y-0">
              {FILTER_CATS.map(c => (
                <CheckRow
                  key={c.l}
                  label={c.l}
                  count={c.c}
                  on={filters.cats.includes(c.l)}
                  onToggle={() => setFilters({ ...filters, cats: toggleArr(filters.cats, c.l) })}
                />
              ))}
            </div>
          </FilterSection>

          {/* Budget bands (min + max) — mirrors the desktop dropdown so mobile
              buyers can cap spend, not just set a floor. */}
          <FilterSection title="ფასი" defaultOpen={false}>
            <PriceRange value={filters.price} onChange={p => setFilters({ ...filters, price: p })} />
          </FilterSection>

          <FilterSection title="ენა" defaultOpen={false}>
            <div className="space-y-0">
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
            <div className="flex flex-wrap gap-1.5">
              {FILTER_AVAIL.map(a => {
                const on = filters.available.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setFilters({ ...filters, available: toggleArr(filters.available, a.id) })}
                    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-pill text-[12px] font-display font-medium tracking-wide transition-colors ${on ? 'bg-brand-500 text-white' : 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50'}`}
                  >
                    {on && <Icon.check className="w-3 h-3" />}
                    {a.l}
                  </button>
                )
              })}
            </div>
          </FilterSection>

          <FilterSection title="მინ. რეიტინგი">
            <div className="grid grid-cols-2 gap-1.5">
              {[4.0, 4.5, 4.8, 4.9].map(r => {
                const on = filters.minRating === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setFilters({ ...filters, minRating: on ? 0 : r })}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-btn text-[13px] font-display font-medium tracking-wide transition-colors ${on ? 'bg-warning-500 text-white' : 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50'}`}
                  >
                    <Icon.star className={`w-3 h-3 ${on ? 'text-white' : 'text-warning-500'}`} />
                    <span className="tabular-nums font-bold">{r.toFixed(1)}+</span>
                  </button>
                )
              })}
            </div>
          </FilterSection>

        </div>

      </div>
    </aside>
  )
}

/* ───── Tutor data ───── */
type Tutor = {
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
  consultationDurationMin?: number
  // Response-time promise, populated from tutorProfile.responseHours. Rendered
  // as a small badge on cards ("პასუხობს 12 საათში") so students can gauge
  // urgency before clicking through to the profile.
  responseHours?: number
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
    id: t.id,
    name: t.user?.fullName ?? TUTOR_DEFAULTS.name,
    photo: 11 + i,
    avatarUrl: t.user?.avatarUrl ?? null,
    videoUrl: t.videoUrl ?? null,
    cat: t.category?.name ?? t.specialty ?? 'სფერო',
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
    next: t.nextSlotAt ? fmtNextSlot(t.nextSlotAt) : 'გამოცხადდება მალე',
    // Only show the play button when we have a real video URL.
    video: Boolean(t.videoUrl),
    verified: t.verified ?? false,
    // Super is now admin-gated: an expert must be verified, top-rated AND
    // admin-featured — so the badge is a deliberate distinction (controlled via
    // the admin FeaturedToggle), not something that lands on everyone with a
    // high rating.
    superExpert: (t.verified ?? false) && (t.rating ?? 0) >= 4.8 && Boolean(t.featured),
    nextSlotAt: t.nextSlotAt ?? null,
    consultationDurationMin: typeof t.consultationDurationMin === 'number' ? t.consultationDurationMin : TUTOR_DEFAULTS.durationMin,
    responseHours: typeof t.responseHours === 'number' ? t.responseHours : undefined,
  }
}

function mapRows(rows: any[]): Tutor[] {
  return Array.isArray(rows) ? rows.map(mapTutorRow) : []
}

/* TUTOR_DEFAULTS + priceForDuration are imported from components/booking/slots
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
// Language code → Georgian display name for the card's „ენები" line.
const LANG_NAMES: Record<string, string> = {
  ka: 'ქართული', en: 'English', ru: 'რუსული', de: 'გერმანული', fr: 'ფრანგული',
  es: 'ესპანური', it: 'იტალიური', tr: 'თურქული', hy: 'სომხური', az: 'აზერბ.',
}
const fmtLangs = (langs: string[]) => (langs ?? []).map(l => LANG_NAMES[l] ?? l).join(', ')

const TutorCard = ({ t, idx, onPreviewEnter, onBook, saved, onToggleFav, needsSignIn, viewerCantBook = false, viewerCantFav = false }: { t: Tutor; idx: number; onPreviewEnter: (t: Tutor, anchor: HTMLElement) => void; onBook: (t: Tutor) => void; saved: boolean; onToggleFav: (tutorId: string) => void; needsSignIn?: boolean; viewerCantBook?: boolean; viewerCantFav?: boolean }) => {
  // Prefer the tutor's real avatar; fall back to an initials placeholder so we
  // never render a random pravatar face over a real name (crawler-safe).
  const photoSrc = t.avatarUrl || initialsAvatarSvg(t.name)
  // Inline video-on-hover (Preply-style). Only the hovered card mounts an
  // (muted, looping) iframe, so we never autoplay every video at once.
  const [vhover, setVhover] = useState(false)
  // Advertise the expert's real consultation length + their flat, self-set
  // price (t.price is exactly what the expert charges — see priceForDuration).
  const dur = t.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin
  // Gate the CTA on real availability — same rule the detail page's
  // StickyBookingCard uses — so the card never promises a booking the profile
  // will deny with "no published slots".
  const bookable = isTutorBookable(t.nextSlotAt)
  // Video plays INLINE inside the photo on hover (Preply-style) — no permanent
  // panel cluttering the list. Play button opens the full VideoPreview modal.
  const ytId = tutorYouTubeId(t)
  return (
    <article className="group relative rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift overflow-hidden flex flex-col">
      {/* Mobile: the whole card taps through to the profile (overlay-link
          pattern from app/student/bookings). Explicit buttons opt out by
          sitting above the overlay with relative z-10. */}
      <Link
        href={`/tutors/${t.id}`}
        aria-label={`${t.name} — პროფილი`}
        className="sm:hidden absolute inset-0 z-[1]"
      />
      {/* Mobile photo banner */}
      <div className="sm:hidden relative aspect-[16/10] w-full bg-gradient-to-br from-brand-50 to-ink-100 overflow-hidden">
        <img src={photoSrc} alt={t.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover motion-safe:animate-fade-in-fast" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/40 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-white/95 backdrop-blur rounded-pill h-7 px-2.5 shadow-xs">
          {t.rating > 0 ? (
            <>
              <Icon.star className="w-3 h-3 text-warning-500" />
              <span className="font-display text-[12px] font-bold text-ink-900 tabular-nums leading-none">{fmtRating(t.rating)}</span>
              <span className="text-[10px] text-ink-500 tabular-nums">({t.reviews})</span>
            </>
          ) : (
            <span className="font-display text-[11px] font-semibold text-ink-600">ახალი</span>
          )}
        </div>
        {t.video && (
          <button
            type="button"
            aria-label="ვიდეო"
            onClick={e => { e.stopPropagation(); onPreviewEnter(t, e.currentTarget) }}
            className="absolute bottom-3 right-3 z-10 w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-pop text-ink-900 flex items-center justify-center"
          >
            <Icon.play className="w-4 h-4 ml-0.5" />
          </button>
        )}
        {/* Save/favorite is a client-only feature (server 403s non-students). */}
        {!viewerCantFav && (
          <button
            type="button"
            onClick={() => onToggleFav(t.id)}
            aria-label={saved ? 'შენახული' : 'შენახვა'}
            className={`absolute bottom-3 left-3 z-10 w-10 h-10 inline-flex items-center justify-center rounded-full backdrop-blur transition-colors ${saved ? 'text-danger-600 bg-white/95' : 'text-ink-700 bg-white/80 hover:bg-white'}`}
          >
            {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Desktop — Preply-style horizontal card: photo │ content+stats │ price+CTA rail */}
      <div className="hidden sm:grid sm:grid-cols-[132px_1fr_216px] gap-5 p-5 sm:p-6">
        {/* Photo + video. The photo itself links to the profile — the
            highest-frequency action on a listing card. The video preview is a
            separate small stopPropagation target (the play circle only), so it
            no longer swallows every click on the face. */}
        <div className="shrink-0">
          <div
            className="relative w-[132px] h-[132px] rounded-card overflow-hidden bg-ink-100 group/photo ring-1 ring-inset ring-ink-900/[0.06] shadow-xs"
            onMouseEnter={() => { if (t.video && ytId) setVhover(true) }}
            onMouseLeave={() => setVhover(false)}
          >
            <Link href={`/tutors/${t.id}`} aria-label={`${t.name} — პროფილი`} className="absolute inset-0 block">
              <img src={photoSrc} alt={t.name} decoding="async" className="absolute inset-0 w-full h-full object-cover" />
            </Link>
            {t.video && (
              <>
                {/* Hover → the intro video plays right inside the photo. */}
                {vhover && ytId && (
                  <iframe
                    className="absolute inset-0 w-full h-full z-10 pointer-events-none"
                    src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&playsinline=1&rel=0`}
                    allow="autoplay; encrypted-media"
                    title={`${t.name} — ვიდეო`}
                  />
                )}
                {/* Play badge: hints a video exists; click opens the full modal. */}
                <button
                  type="button"
                  aria-label="ვიდეოგაცნობა"
                  onClick={e => { e.stopPropagation(); onPreviewEnter(t, e.currentTarget) }}
                  className="absolute bottom-1.5 right-1.5 z-20 w-8 h-8 rounded-full bg-brand-500 text-white shadow-brand-glow inline-flex items-center justify-center group-hover/photo:scale-105 transition-transform"
                >
                  <Icon.play className="w-3.5 h-3.5 ml-0.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="min-w-0 flex flex-col">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <h3 className="font-display text-[19px] font-bold text-ink-900 tracking-tight leading-[1.15]">
              <Link href={`/tutors/${t.id}`} className="hover:text-brand-700 transition-colors">{t.name}</Link>
            </h3>
            {t.verified && <VerifiedMark size={14} />}
            {t.superExpert && (
              <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-pill bg-ink-900 border border-transparent text-white font-display text-[9.5px] font-bold uppercase tracking-[0.12em]">
                <Icon.spark className="w-3 h-3" /> Super
              </span>
            )}
          </div>
          {/* Accomplishment headline reads FIRST (consultation scan pattern);
              the category label is secondary, muted. */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {t.headline && (
              <>
                <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">{t.headline}</span>
                <span className="text-ink-300">·</span>
              </>
            )}
            <span className="font-display text-[12px] font-medium text-ink-500">{t.cat}</span>
          </div>
          {t.langs && t.langs.length > 0 && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-ink-500 max-w-full">
              <Icon.globe className="w-3.5 h-3.5 text-ink-400 shrink-0" />
              <span className="truncate">{fmtLangs(t.langs)}</span>
            </div>
          )}
          {/* Real-data demand proof: ჩატარებული სესია + response promise.
              Each fragment renders only when the real value exists; rating
              moved to the price rail (the scan anchor). */}
          {(t.rating === 0 || t.sessions > 0 || typeof t.responseHours === 'number') && (
            <div className="mt-2.5 flex items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-600 flex-wrap">
              {t.rating === 0 && <span className="font-display font-semibold text-ink-500">ახალი ექსპერტი</span>}
              {t.sessions > 0 && <span className="tabular-nums"><span className="font-display font-bold text-ink-900">{t.sessions}</span> ჩატარებული სესია</span>}
              {typeof t.responseHours === 'number' && <span className="tabular-nums">პასუხი ~<span className="font-display font-bold text-ink-900">{t.responseHours} სთ</span></span>}
            </div>
          )}
          <p className="mt-2.5 text-[13px] text-ink-700 leading-[1.5] line-clamp-2">{t.bio}</p>
          {t.sessions >= 50 && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-brand-700 font-display font-semibold">
              <Icon.spark className="w-3 h-3" /> პოპულარული · {t.sessions} სესია ჩატარდა
            </div>
          )}
        </div>

        {/* Right rail — the scan anchor: price LARGE, session length small,
            rating + review count under it (hidden until real reviews exist),
            then the next-slot line and the booking CTA. */}
        <div className="flex flex-col justify-between border-l border-ink-100 pl-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display text-[24px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">₾{priceForDuration(t.price, dur)}</div>
              <div className="mt-1 text-[11px] text-ink-500">სესია · {dur} წთ</div>
              {t.rating > 0 && t.reviews > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 text-[12px]">
                  <span className="font-display font-bold text-ink-900 tabular-nums">{fmtRating(t.rating)}</span>
                  <Icon.star className="w-3.5 h-3.5 text-warning-500" />
                  <span className="text-ink-500 tabular-nums">· {t.reviews} შეფასება</span>
                </div>
              )}
            </div>
            {!viewerCantFav && (
              <button type="button" onClick={() => onToggleFav(t.id)} aria-label={saved ? 'შენახული' : 'შენახვა'} className={`h-8 w-8 rounded-btn inline-flex items-center justify-center transition-colors shrink-0 ${saved ? 'text-danger-600 bg-danger-50' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'}`}>
                {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
              </button>
            )}
          </div>
          {/* Two-button CTA: booking is the primary niche, messaging the
              secondary. A non-student (tutor/admin) can't book OR message, so
              they get a single neutral note instead of dead-end buttons. */}
          <div className="mt-3 space-y-2">
            {viewerCantBook ? (
              <div className="w-full h-11 rounded-btn bg-ink-75 border border-ink-200 text-ink-400 font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center">
                ჯავშანი მხოლოდ კლიენტს
              </div>
            ) : (
              <>
                {bookable ? (
                  <button type="button" onClick={() => onBook(t)} className="w-full h-11 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs">
                    {needsSignIn ? 'შესვლა და ჯავშანი' : 'დაჯავშნე'}
                  </button>
                ) : (
                  <button type="button" disabled title="ამ ექსპერტს ჯერ არ აქვს გამოქვეყნებული თავისუფალი დრო — მიწერე პირდაპირ" className="w-full h-11 rounded-btn bg-ink-75 text-ink-400 border border-ink-200 cursor-not-allowed font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center gap-1.5">
                    დაჯავშნე
                  </button>
                )}
                <Link href={`/tutors/${t.id}?intent=message`} className="w-full h-11 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors">
                  <Icon.chat className="w-4 h-4" /> მიწერე ექსპერტს
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile content block */}
      <div className="sm:hidden px-4 pt-4 pb-3 flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <h3 className="font-display text-[18px] font-bold text-ink-900 tracking-tight leading-[1.15] truncate">{t.name}</h3>
          {t.verified && <VerifiedMark size={14} />}
          {t.superExpert && (
            <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-pill bg-ink-900 border border-transparent text-white font-display text-[9.5px] font-bold uppercase tracking-[0.12em]">
              <Icon.spark className="w-3 h-3" />
              Super
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-display text-[12px] font-semibold text-ink-700">{t.cat}</span>
          {t.headline && (
            <>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">
                {t.headline}
              </span>
            </>
          )}
        </div>
        <p className="mt-3 text-[13px] text-ink-700 leading-[1.55] line-clamp-2">{t.bio}</p>
        <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-500 flex-wrap">
          <span className="tabular-nums"><span className="font-display font-semibold text-ink-800">{t.sessions}</span> სესია</span>
        </div>
      </div>

      {/* Bottom price strip — mobile only (desktop has the right-rail CTA) */}
      <div className="sm:hidden flex items-center justify-between gap-3 px-4 py-3.5 border-t border-ink-100 bg-ink-50/40">
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          {/* Flat expert-set price for the whole session — "/ N წთ" read like a
              per-minute rate; mirror the desktop rail's session phrasing. */}
          <span className="font-display text-[20px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">
            ₾{priceForDuration(t.price, dur)}<span className="text-[11.5px] font-medium text-ink-500 ml-1">· {dur}-წუთიანი სესია</span>
          </span>
        </div>
        {/* relative z-10: explicit actions stay above the mobile overlay link.
            Two buttons — message (secondary) always present, book (primary)
            disabled when the expert has no published slots. */}
        <div className="relative z-10 flex items-center gap-2 shrink-0">
          {viewerCantBook ? (
            <span className="h-11 px-3.5 rounded-btn bg-ink-75 border border-ink-200 text-ink-400 font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center">
              მხოლოდ კლიენტს
            </span>
          ) : (
            <>
              <Link
                href={`/tutors/${t.id}?intent=message`}
                aria-label="მიწერე ექსპერტს"
                className="h-11 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors"
              >
                <Icon.chat className="w-3.5 h-3.5" /> მიწერე
              </Link>
              {bookable ? (
                <button type="button" onClick={() => onBook(t)} className="h-11 px-3.5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-all duration-fast shadow-xs hover:shadow-sm">
                  {needsSignIn ? 'შესვლა და ჯავშანი' : 'დაჯავშნე'}
                </button>
              ) : (
                <button type="button" disabled aria-label="დაჯავშნა მიუწვდომელია — თავისუფალი დრო არ არის" className="h-11 px-3.5 rounded-btn bg-ink-75 text-ink-400 border border-ink-200 cursor-not-allowed font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5">
                  დაჯავშნე
                </button>
              )}
            </>
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
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-ink-950/55 backdrop-blur-sm motion-safe:animate-fade-in-fast"
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
              className="w-7 h-7 rounded-full bg-accent-900/65 hover:bg-accent-900 text-white inline-flex items-center justify-center transition-colors backdrop-blur"
            >
              <Icon.x className="w-3 h-3" />
            </button>
          </div>

          {/* Tutor strip (over gradient) */}
          <div className="absolute left-3 right-3 bottom-2.5 flex items-center gap-2 pointer-events-none">
            <img src={tutor.avatarUrl || DEFAULT_AVATAR} alt={tutor.name} className="w-7 h-7 rounded-full ring-2 ring-white/30 object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-[12.5px] font-bold text-white tracking-tight truncate">{tutor.name}</span>
                {tutor.verified && <VerifiedMark size={11} />}
              </div>
              <div className="text-[10.5px] text-white/65 truncate">{tutor.cat} · {tutor.headline}</div>
            </div>
          </div>
        </div>

        {/* Compact action strip */}
        <div className="flex items-center gap-3 px-3.5 py-2.5 bg-accent-900 border-t border-white/8">
          <div className="flex items-center gap-2.5 text-[11px] text-white/65 min-w-0 flex-1">
            <span className="inline-flex items-center gap-1">
              <Icon.star className="w-3 h-3 text-warning-400" />
              <span className="font-display font-bold text-white tabular-nums">{fmtRating(tutor.rating)}</span>
            </span>
            <span className="text-white/25">·</span>
            <span className="font-display text-[12.5px] font-bold text-white tabular-nums">
              ₾{tutor.price}<span className="text-[10px] font-medium text-white/55 ml-0.5">/ სესია</span>
            </span>
          </div>
          <button type="button" onClick={() => { onBook(tutor); onClose() }} className="h-8 px-3 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[11.5px] tracking-wide inline-flex items-center gap-1 transition-colors shrink-0">
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
// and mean nothing in Georgian). The default ('rating', highest first) is the
// platform's recommendation, so it's named as such.
const SORT_OPTS = [
  { id: 'rating',   l: 'ჩვენი რჩევით' },
  { id: 'sessions', l: 'სესიებით, კლებადი' },
  { id: 'price-a',  l: 'ფასით, ზრდადი' },
  { id: 'price-d',  l: 'ფასით, კლებადი' },
  { id: 'new',      l: 'ახალი ექსპერტები' },
] as const

const SORT_LABEL: Record<string, string> = {
  rating: 'ჩვენი რჩევით',
  sessions: 'სესიებით, კლებადი',
  'price-a': 'ფასით, ზრდადი',
  'price-d': 'ფასით, კლებადი',
  new: 'ახლის მიხედვით',
}

const ResultsBar = ({ total, loading, sort, setSort, activeFilters, removeFilter, onReset, onOpenFilters, activeCount }: { total: number; loading?: boolean; sort: string; setSort: (v: string) => void; activeFilters: { k: string; v: string }[]; removeFilter: (k: string, v: string) => void; onReset: () => void; onOpenFilters: () => void; activeCount: number }) => (
  <div className="mb-5">
    <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
      <div>
        <h2 className="font-display text-[22px] font-bold text-ink-900 tracking-tight">
          {loading ? 'იტვირთება…' : <><span className="tabular-nums">{total}</span> ექსპერტი</>}
        </h2>
        <p className="text-[12px] text-ink-500 mt-0.5">დახარისხებული <span className="text-ink-700 font-display font-semibold">{SORT_LABEL[sort]}</span></p>
      </div>
      <div className="flex items-center gap-2 flex-wrap max-w-full">
        {/* Filter button — Preply-style top filter access (all breakpoints) */}
        <button
          type="button"
          onClick={onOpenFilters}
          className="h-10 pl-3 pr-3.5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 font-display text-[12.5px] font-semibold text-ink-800 inline-flex items-center gap-1.5 transition-colors shrink-0"
        >
          <Icon.sliders className="w-3.5 h-3.5" />
          ფილტრები
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white font-display text-[10px] font-bold tabular-nums">
              {activeCount}
            </span>
          )}
        </button>
        <div className="relative max-w-full group">
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            aria-label="სორტირება"
            className="appearance-none max-w-full h-10 pl-3.5 pr-9 rounded-btn bg-white border border-ink-200 hover:border-ink-300 focus:border-brand-400 font-display text-[12.5px] font-medium text-ink-800 focus:outline-none cursor-pointer truncate"
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
          <span key={i} className="inline-flex items-center gap-1 pl-3 pr-1 h-8 rounded-pill bg-white border border-ink-200 hover:border-ink-300 text-ink-800 text-[11.5px] font-display font-medium tracking-wide transition-colors">
            {f.v}
            <button
              type="button"
              onClick={() => removeFilter(f.k, f.v)}
              aria-label={`წაშალე ფილტრი: ${f.v}`}
              className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-ink-100 hover:text-ink-800 text-ink-500 transition-colors ml-0.5"
            >
              <Icon.x className="w-3 h-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={onReset}
          className="text-[11.5px] font-display font-semibold text-ink-500 hover:text-brand-700 h-8 px-2 transition-colors"
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
      <div className="text-[12.5px] text-ink-500">
        გვერდი <span className="font-display font-semibold text-ink-800 tabular-nums">{page}</span> / <span className="tabular-nums">{totalPages}</span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="წინა გვერდი" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="w-9 h-9 inline-flex items-center justify-center rounded-btn border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Icon.chevL className="w-3.5 h-3.5" />
        </button>
        {pages.map((p, i) => (
          typeof p === 'number' ? (
            <button
              key={i}
              type="button"
              aria-current={page === p ? 'page' : undefined}
              onClick={() => setPage(p)}
              className={`min-w-[36px] h-9 px-2 rounded-btn font-display text-[12.5px] font-semibold tabular-nums transition-colors ${page === p ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-50'}`}
            >
              {p}
            </button>
          ) : (
            <span key={i} className="px-1 text-ink-400 text-[13px]">{p}</span>
          )
        ))}
        <button type="button" aria-label="შემდეგი გვერდი" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="w-9 h-9 inline-flex items-center justify-center rounded-btn border border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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
      <div className={`font-display text-[14px] font-semibold tabular-nums ${isBest ? 'text-brand-800' : 'text-ink-900'}`}>{value}</div>
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      ariaLabel="ექსპერტების შედარება"
      eyebrow="სწრაფი შედარება"
      title={`ექსპერტი გვერდიგვერდ — ${tutors.length} ვარიანტი`}
    >
        {/* Full-bleed, sideways-scrollable compare table inside the sheet body */}
        <div className="overflow-x-auto -mx-5 sm:-mx-6 -my-4">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${tutors.length}, minmax(220px, 1fr))` }}>
            {tutors.map(t => (
              <div key={t.id} className="border-r border-ink-100 last:border-r-0">
                {/* Header */}
                <div className="px-4 py-5 border-b border-ink-100 text-center">
                  <img src={t.avatarUrl || DEFAULT_AVATAR} alt={t.name} className="w-16 h-16 mx-auto rounded-full object-cover ring-2 ring-ink-200 mb-3" />
                  <div className="font-display text-[14px] font-bold text-ink-900 tracking-tight truncate">{t.name}</div>
                  <div className="text-[11px] text-ink-500 mt-0.5 truncate">{t.cat}</div>
                  {t.superExpert && <span className="inline-flex items-center gap-1 mt-2 px-1.5 h-5 rounded-pill bg-ink-900 border border-transparent text-white font-display text-[10px] font-bold uppercase tracking-[0.14em]"><Icon.spark className="w-3 h-3" /> Super</span>}
                </div>
                <Row label="რეიტინგი" isBest={t.rating === best.rating} value={<span className="inline-flex items-center gap-1"><Icon.star className="w-3.5 h-3.5 text-warning-500" />{fmtRating(t.rating)} · {t.reviews}</span>} />
                <Row label="ჩატარდა სესია" isBest={t.sessions === best.sessions} value={<>{t.sessions.toLocaleString()}</>} />
                <Row label="ფასი"          isBest={t.price === best.price}      value={<>₾{t.price}</>} />
                <Row label="ენები"          value={<span className="text-[12px] text-ink-700 font-normal">{t.langs.join(' · ')}</span>} />
                <div className="p-3 border-t border-ink-100">
                  <button type="button" onClick={() => { onClose(); onBook(t) }} className="w-full h-10 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center justify-center gap-1.5 transition-colors">
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
  // When a free-text search has no exact match, we show a category's experts as
  // a fallback; this holds that category's label for the "showing X instead" note.
  const [searchFallback, setSearchFallback] = useState<string | null>(null)
  const [favIds, setFavIds] = useState<Set<string>>(new Set())
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
  const [needsAuth, setNeedsAuth] = useState(false)
  const [authDismissed, setAuthDismissed] = useState(false)
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
      setNeedsAuth(true)
      setAuthDismissed(false)
      if (typeof window !== 'undefined') {
        try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch {}
      }
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
      // Revert optimistic update on failure
      setFavIds(prev => {
        const next = new Set(prev)
        if (wasFav) next.add(tutorId); else next.delete(tutorId)
        return next
      })
    }
  }, [favIds, signedIn])

  // Category filtering is now entirely client-side (see visibleTutors), so the
  // fetch only carries the free-text query. This removes the old conflict where
  // the hero sent a server `category` slug while the sidebar filtered by label.
  const fetchTutors = React.useCallback(async (q: string) => {
    setLoading(true)
    try {
      const query = q.trim()
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      const res = await fetch(`/api/tutors${params.toString() ? `?${params}` : ''}`)
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data)) return
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
              return
            }
          }
        }
      }
      setLiveTutors(mapRows(data))
      setSearchFallback(null)
    } catch {
      // keep whatever we had
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

  const runSearch = () => fetchTutors(search)

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
      router.push(`/tutors/${t.id}?rebook=1`)
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
    // Backward-compat: external links (breadcrumbs, SimilarExperts) still point
    // at /tutors?category=<slug>. Map that slug to its category NAME and seed it
    // into `cats` so the unified client-side category filter honours the link.
    const seedCats = csv('cats')
    const catParam = p?.get('category')
    if (catParam && catParam !== 'all') {
      const label = QUICK_CATS.find(c => c.slug === catParam)?.label
      if (label && !seedCats.includes(label)) seedCats.push(label)
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

  const resetFilters = () => setFilters({
    cats: [], minRate: 0, langs: [], available: [], minRating: 0, superOnly: false, price: [0, NO_CAP],
  })

  // Category chip handlers — shared by the hero chips and (implicitly) the
  // sidebar checkboxes, both writing to filters.cats (category NAMES).
  const toggleCat = (label: string) => setFilters(f => ({ ...f, cats: f.cats.includes(label) ? f.cats.filter(x => x !== label) : [...f.cats, label] }))
  const clearCats = () => setFilters(f => ({ ...f, cats: [] }))

  // Keep URL in sync with all filter state so refresh + share work.
  useEffect(() => {
    const url = new URLSearchParams()
    if (search.trim()) url.set('q', search.trim())
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

  const activeFilters: { k: string; v: string }[] = [
    ...filters.cats.map(c    => ({ k: 'cat',   v: c })),
    ...filters.langs.map(l   => ({ k: 'lang',  v: l })),
    ...filters.available.map(a => ({ k: 'avail', v: a })),
    ...(filters.minRating > 0 ? [{ k: 'rate', v: `${filters.minRating}+ ★` }] : []),
    ...(filters.superOnly ? [{ k: 'super', v: 'Super-ექსპერტი' }] : []),
    ...(priceBandActive(filters.price[0], filters.price[1]) ? [{ k: 'price', v: priceBandLabel(filters.price[0], filters.price[1]) }] : []),
  ]

  // Apply sidebar filters + sort client-side on top of the API-loaded list.
  const visibleTutors = React.useMemo(() => {
    const now = new Date()
    const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    let out = liveTutors.filter(t => {
      if (filters.superOnly && !t.superExpert) return false
      if (filters.minRating > 0 && (t.rating ?? 0) < filters.minRating) return false
      // Budget band — honor both the floor and the cap (NO_CAP = no ceiling).
      if (t.price < filters.price[0] || t.price > filters.price[1]) return false
      if (filters.cats.length > 0 && !filters.cats.includes(t.cat)) return false
      if (filters.langs.length > 0) {
        const hasLang = t.langs.some(l => filters.langs.includes(l))
        if (!hasLang) return false
      }
      // Availability window — evaluated against the soonest free slot.
      if (filters.available.length > 0) {
        const next = t.nextSlotAt ? new Date(t.nextSlotAt) : null
        const ok = filters.available.some(a => {
          if (!next) return false
          if (a === 'today') return isSameDay(next, now)
          if (a === 'week') return next.getTime() <= now.getTime() + 7 * 24 * 3600_000
          return false
        })
        if (!ok) return false
      }
      return true
    })
    switch (sort) {
      case 'rating':   out = [...out].sort((a, b) => b.rating - a.rating); break
      case 'sessions': out = [...out].sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0)); break
      case 'price-a':  out = [...out].sort((a, b) => a.price - b.price); break
      case 'price-d':  out = [...out].sort((a, b) => b.price - a.price); break
      case 'new':      /* keep API order (verified→rating) */ break
    }
    return out
  }, [liveTutors, filters, sort])

  const total = visibleTutors.length
  const PER_PAGE = 8
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

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      {studentShell
        ? <StudentAppBar user={viewer ? { name: viewer.fullName, avatar: viewer.avatarUrl } : undefined} />
        : <PublicTopBar activeHref="/tutors" initialUser={initialUser} />}

      <SearchHero filters={filters} setFilters={setFilters} search={search} setSearch={setSearch} onSearch={runSearch} total={total} loading={loading} />

      <Container as="main" id="main" className="py-8 sm:py-10 lg:py-14">
        {needsAuth && !authDismissed && !signedIn && (
          <SignInPromptBanner
            onDismiss={() => setAuthDismissed(true)}
            className="mb-6"
          />
        )}
        <RecentTutorsStrip className="mb-6" />
        {/* Preply-style: full-width list, filters open in a top-triggered drawer. */}
        <div>
          <div className="min-w-0">
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
              <div className="mb-4 flex items-start gap-2.5 rounded-card border border-ink-200 bg-ink-50/60 px-4 py-3 text-[12.5px] text-ink-700">
                <Icon.search className="w-4 h-4 mt-0.5 text-ink-400 shrink-0" />
                <span>
                  {search.trim() && <>„<span className="font-display font-semibold text-ink-900">{search.trim()}</span>“ — ზუსტი დამთხვევა არ არის. </>}
                  ვაჩვენებთ <span className="font-display font-semibold text-ink-900">{searchFallback}</span>-ის ექსპერტებს.
                </span>
              </div>
            )}

            <div className={`relative space-y-3 motion-safe:transition-opacity ${loading && liveTutors.length > 0 ? 'opacity-60' : ''}`}>
              {/* Refetch indicator — the first-paint skeleton below only covers
                  an empty list, so on re-search/refilter (when results already
                  exist) we dim the stale list and show an inline spinner. */}
              {loading && liveTutors.length > 0 && (
                <div className="pointer-events-none absolute inset-x-0 -top-2 z-10 flex justify-center" aria-live="polite">
                  <span className="inline-flex items-center gap-2 h-8 px-3 rounded-pill bg-white border border-ink-200 shadow-card text-[12px] font-display font-semibold text-ink-700">
                    <span aria-hidden className="w-3.5 h-3.5 rounded-full border-2 border-ink-200 border-t-brand-500 motion-safe:animate-spin" />
                    ახლდება…
                  </span>
                </div>
              )}
              {loading && liveTutors.length === 0 ? (
                // First-paint skeleton: three placeholder cards while /api/tutors
                // resolves. Prevents the "no experts found" empty-state from
                // flashing before real data arrives.
                <div className="space-y-3" aria-busy="true" aria-live="polite">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="rounded-card border border-ink-200 bg-white p-5 flex items-start gap-4 animate-pulse">
                      <div className="w-16 h-16 rounded-full bg-ink-100 shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-4 w-2/5 bg-ink-100 rounded" />
                        <div className="h-3 w-3/5 bg-ink-100 rounded" />
                        <div className="h-3 w-4/5 bg-ink-100 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleTutors.length === 0 ? (
                // Compact canon empty state — icon + one line + one action. Two
                // distinct cases: a COLD marketplace (no experts exist at all →
                // "clear filters" would be a dead no-op) vs a filter/search that
                // matched nothing (offer the reset).
                liveTutors.length === 0 ? (
                  <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                    <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-100 text-ink-500 mb-3">
                      <Icon.search className="w-5 h-5" />
                    </div>
                    <div className="font-display text-[15.5px] font-bold text-ink-900 tracking-tight">
                      ექსპერტები მალე დაემატება
                    </div>
                    <p className="text-[12.5px] text-ink-500 mt-1.5 max-w-[360px] mx-auto leading-snug">
                      ბაზა იზრდება — დაგვიტოვე კითხვა და მოგწერთ, როგორც კი შესაფერისი ექსპერტი გამოჩნდება.
                    </p>
                    <a href="/ask" className="mt-4 h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast">
                      დასვი კითხვა
                    </a>
                  </div>
                ) : (
                  <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                    <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-brand-50 text-brand-600 mb-3">
                      <Icon.search className="w-5 h-5" />
                    </div>
                    <div className="font-display text-[15.5px] font-bold text-ink-900 tracking-tight">
                      ვერ ვიპოვეთ შესაფერისი ექსპერტი — სცადე სხვა ფილტრი ან ტერმინი
                    </div>
                    <button type="button" onClick={resetFilters} className="mt-4 h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast">
                      ფილტრების გასუფთავება
                    </button>
                  </div>
                )
              ) : (
                pagedTutors.map((t, i) => <TutorCard key={t.id} idx={i} t={t} onPreviewEnter={openPreview} onBook={openBook} saved={favIds.has(t.id)} onToggleFav={toggleFav} needsSignIn={authKnown && !signedIn} viewerCantBook={viewerCantBook} viewerCantFav={viewerCantFav} />)
              )}
            </div>

            {/* Helper strip — placed BEFORE pagination so it's actually seen */}
            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              <a href="mailto:hi@mcodne.ge?subject=%E1%83%A8%E1%83%94%E1%83%9B%E1%83%98%20%E1%83%9B%E1%83%9D%E1%83%97%E1%83%AE%E1%83%9D%E1%83%95%E1%83%9C%E1%83%90" className="group text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-5 flex items-start gap-4">
                <span className="w-10 h-10 shrink-0 rounded-btn bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                  <Icon.spark className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight">ვერ იპოვე შესაფერისი?</div>
                  <p className="text-[12px] text-ink-600 mt-0.5 leading-snug">მოგვწერე — 24 საათში შემოგთავაზებთ 3 ვარიანტს შენი კონტექსტიდან.</p>
                </div>
              </a>
              {liveTutors.length >= 2 && (
                <button type="button" onClick={() => setCompareOpen(true)} className="group text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-5 flex items-start gap-4">
                  <span className="w-10 h-10 shrink-0 rounded-btn bg-ink-100 text-ink-700 inline-flex items-center justify-center">
                    <Icon.sliders className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight">შეადარე ტოპ 3-ი გვერდიგვერდ</div>
                    <p className="text-[12px] text-ink-600 mt-0.5 leading-snug">რეიტინგი, ფასი, თავისუფალი დრო, ენები — ერთი ცხრილით.</p>
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

      {/* Filters drawer — right-side sheet (bottom sheet on mobile) */}
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
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill bg-brand-500 text-white text-[10.5px] font-display font-bold tabular-nums">
                {activeFilters.length}
              </span>
            )}
          </span>
        }
        footer={
          <>
            {activeFilters.length > 0 && (
              <button type="button" onClick={resetFilters} className="mr-auto font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-900 transition-colors">გასუფთავება</button>
            )}
            <button type="button" onClick={() => setFiltersOpen(false)} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors">
              ნახე {total} ექსპერტი
            </button>
          </>
        }
      >
        <FiltersPanel
          filters={filters}
          setFilters={setFilters}
          total={total}
          onReset={resetFilters}
          variant="drawer"
          onClose={() => setFiltersOpen(false)}
        />
      </Sheet>
    </div>
  )
}


