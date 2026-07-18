'use client'
import React, { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { RecentTutorsStrip } from '@/components/RecentTutorsStrip'
import { SignInPromptBanner } from '@/components/SignInPromptBanner'
import { Sheet } from '@/components/Sheet'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { RISK_REVERSAL_LINE } from '@/lib/copy'
import { userTimezone, TBILISI } from '@/lib/tz'
import { fmtRating } from '@/lib/fmt'

/* ───── Icons ───── */
const Icon = {
  search: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  arrow: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>,
  chevD: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6" /></svg>,
  chevR: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 6 6 6-6 6" /></svg>,
  chevL: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 6-6 6 6 6" /></svg>,
  check: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m4 12 5 5L20 6" /></svg>,
  star: (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>,
  play: (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7L8 5Z" /></svg>,
  heart: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20s-7-4.4-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.6 12 20 12 20Z" /></svg>,
  heartFilled: (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 20s-7-4.4-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.6 12 20 12 20Z" /></svg>,
  globe: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" /></svg>,
  clock: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  spark: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>,
  shield: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  chat: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.6 8.6 0 0 1-3.5-.7L3 21l1.7-5.5A8.5 8.5 0 1 1 21 11.5Z" /></svg>,
  sliders: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 6h13M20 6h-2M4 12h7M14 12h6M4 18h10M17 18h3" /><circle cx="18" cy="6" r="2" fill="currentColor" /><circle cx="12.5" cy="12" r="2" fill="currentColor" /><circle cx="15.5" cy="18" r="2" fill="currentColor" /></svg>,
  grid: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
  list: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>,
  x: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  cal: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  xC:       (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  menu:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  bell:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3V9Z" /><path d="M10 19a2 2 0 1 0 4 0" /></svg>,
}

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
  { slug: 'business',   label: 'ბიზნესი' },
  { slug: 'finance',    label: 'ფინანსები' },
  { slug: 'career',     label: 'კარიერა' },
  { slug: 'marketing',  label: 'მარკეტინგი' },
  { slug: 'law',        label: 'სამართალი' },
  { slug: 'psychology', label: 'ფსიქოლოგია' },
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
      <button type="button" onClick={() => setOpen(o => !o)} className={`h-[52px] min-w-[140px] w-full sm:w-auto px-3.5 rounded-card border text-left flex items-center justify-between gap-2 transition-all ${active ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-200' : 'border-ink-200 hover:border-ink-300 bg-white'}`}>
        <span className="min-w-0">
          <span className="block text-[10px] font-display font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</span>
          <span className={`block font-display text-[13px] font-bold truncate ${active ? 'text-brand-800' : 'text-ink-900'}`}>{value}</span>
        </span>
        <Icon.chevD className={`w-4 h-4 text-ink-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-40 top-full left-0 mt-2 w-[248px] rounded-card border border-ink-200 bg-white shadow-float p-2 max-h-[340px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  )
}

const CheckOpt = ({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) => (
  <button type="button" onClick={onToggle} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-btn hover:bg-ink-50 text-left transition-colors">
    <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300'}`}>{on && <Icon.check className="w-2.5 h-2.5" />}</span>
    <span className="text-[13px] text-ink-800">{label}</span>
  </button>
)

// Price filter is a MINIMUM floor only — the apply logic filters on
// `t.price < filters.price[0]` and ignores the upper bound, so these options
// are floors (not ranges). Labels say "from ₾N" to match what actually happens.
const PRICE_OPTS: { min: number; l: string }[] = [
  { min: 0, l: 'ნებისმიერი ფასი' },
  { min: 40, l: '₾40-დან' },
  { min: 80, l: '₾80-დან' },
  { min: 120, l: '₾120-დან' },
]

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
    : search.trim() ? `„${search.trim()}"`
    : null
  const priceVal = filters.price[0] === 0 ? 'ნებისმიერი' : `₾${filters.price[0]}-დან`
  const langVal = filters.langs.length === 0 ? 'ნებისმიერი ენა' : filters.langs.length === 1 ? filters.langs[0] : `${filters.langs.length} ენა`
  const availVal = filters.available.length === 0 ? 'ნებისმიერ დროს' : filters.available.map(id => FILTER_AVAIL.find(a => a.id === id)?.l ?? id).join(', ')
  return (
    <section className="bg-white border-b border-ink-200">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 pt-8 pb-6">
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
        <p className="text-[13.5px] text-ink-500 mt-2">ხელით გადამოწმებული პროფესიონალები · გამჭვირვალე ფასი · {PAYMENTS_LIVE ? 'escrow-დაცული' : 'დაჯავშნა უფასოა'}</p>

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
          <FilterBox label="ფასი / სესია" value={priceVal} active={filters.price[0] > 0}>
            {PRICE_OPTS.map(o => {
              const on = filters.price[0] === o.min
              return (
                <button key={o.l} type="button" onClick={() => setFilters({ ...filters, price: [o.min, 200] })} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-btn hover:bg-ink-50 text-left transition-colors">
                  <span className={`w-4 h-4 rounded-full border-[1.5px] inline-flex items-center justify-center shrink-0 ${on ? 'border-brand-500' : 'border-ink-300'}`}>{on && <span className="w-2 h-2 rounded-full bg-brand-500" />}</span>
                  <span className="text-[13px] text-ink-800">{o.l}</span>
                </button>
              )
            })}
          </FilterBox>
          <FilterBox label="ენა" value={langVal} active={filters.langs.length > 0}>
            {FILTER_LANGS.map(l => <CheckOpt key={l.l} label={l.l} on={filters.langs.includes(l.l)} onToggle={() => setFilters({ ...filters, langs: toggleIn(filters.langs, l.l) })} />)}
          </FilterBox>
          <FilterBox label="ხელმისაწვდომობა" value={availVal} active={filters.available.length > 0}>
            {FILTER_AVAIL.map(a => <CheckOpt key={a.id} label={a.l} on={filters.available.includes(a.id)} onToggle={() => setFilters({ ...filters, available: toggleIn(filters.available, a.id) })} />)}
          </FilterBox>
          <button type="button" onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })} className={`h-[52px] px-4 rounded-card border font-display text-[13px] font-bold inline-flex items-center gap-2 transition-all ${filters.superOnly ? 'border-brand-500 bg-brand-50/40 text-brand-800 ring-1 ring-brand-200' : 'border-ink-200 hover:border-ink-300 bg-white text-ink-800'}`}>
            <Icon.spark className="w-4 h-4 text-warning-500" /> Super
          </button>
          </div>
          <div className="flex-1 min-w-[220px] bg-white rounded-card border border-ink-200 flex items-stretch focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
            <div className="relative flex-1 min-w-0">
              <Icon.search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearch() }} placeholder="ძებნა სახელით ან თემით…" className="w-full h-[50px] pl-10 pr-3 bg-transparent text-[13.5px] text-ink-900 placeholder:text-ink-400 focus:outline-none" />
            </div>
          </div>
        </div>

        {/* Mobile category rail — one-tap refinement without opening the
            drawer. Horizontal scroll, active chips in brand. */}
        <div className="lg:hidden mt-3 -mx-6 px-6 flex gap-2 overflow-x-auto scrollbar-hide" role="group" aria-label="სფეროს ფილტრი">
          <button
            type="button"
            onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
            className={`shrink-0 h-10 px-3.5 rounded-pill border font-display text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors ${filters.superOnly ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-700'}`}
          >
            <Icon.spark className="w-3.5 h-3.5 text-warning-500" /> Super
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
      </div>
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
  { l: 'ფინანსები', c: 0 },
  { l: 'კარიერა', c: 0 },
  { l: 'მარკეტინგი', c: 0 },
  { l: 'სამართალი', c: 0 },
  { l: 'ფსიქოლოგია', c: 0 },
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
    (filters.price[0] > 0 ? 1 : 0)

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
                <Icon.spark className="w-3 h-3 text-warning-500" />
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

          {/* Minimum-only price slider. Only a lower bound is applied — there is
              no upper ceiling, so expensive experts are never silently hidden
              (the old default [40,200] dropped everyone priced above ₾200). */}
          <FilterSection title="ფასი" defaultOpen={false}>
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-display text-[15px] font-bold text-ink-900 tabular-nums">{filters.price[0] > 0 ? `₾${filters.price[0]}+` : 'ნებისმიერი'}</span>
              <span className="text-[11px] text-ink-500">მინ. ფასი</span>
            </div>
            <div className="relative h-6 flex items-center">
              <div className="absolute left-0 right-0 h-1 rounded-pill bg-ink-100" />
              <div
                className="absolute h-1 rounded-pill bg-brand-500"
                style={{
                  left:  `${(filters.price[0] / 300) * 100}%`,
                  right: 0,
                }}
              />
              <input
                type="range" min={0} max={300} step={5}
                value={filters.price[0]}
                onChange={e => setFilters({ ...filters, price: [Number(e.target.value), filters.price[1]] })}
                className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer accent-brand-500"
                style={{ pointerEvents: 'auto' }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500 tabular-nums">
              <span>₾0</span>
              <span>₾300+</span>
            </div>
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
const KA_MONTHS_SHORT = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ']

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
function initialsAvatarSvg(name: string): string {
  const initials = (name || 'ე ე').split(' ').map(s => s[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><rect width='400' height='400' fill='#e5e5e9'/><text x='200' y='240' font-family='sans-serif' font-size='150' fill='#7a7a82' text-anchor='middle'>${initials}</text></svg>`,
  )}`
}

// SSR seed intentionally empty: the previous hardcoded 9-tutor array leaked
// fake names/photos to SEO crawlers, no-JS clients, and social preview cards,
// which contradicts the "hand-picked · individually verified" promise. Real
// data arrives via the `/api/tutors` fetch on mount (see fetchTutors below).
const TUTORS: Tutor[] = []

// ───── Shared fallback defaults ─────
// These MUST stay identical to the TUTOR_DEFAULTS block in
// app/tutors/[id]/client.tsx so a search card and the expert's detail page never
// disagree on price / duration / name for the same missing fields. Duration is
// aligned to the Prisma schema (`consultationDurationMin @default(30)`); price
// has no schema default, so we pick one shared fallback used by both surfaces.
// Covered by tests/tutor-mapping.test.ts.
const TUTOR_DEFAULTS = { price: 80, durationMin: 30, name: 'ექსპერტი', responseHours: 24 } as const

// A card is bookable only when the expert has an upcoming free slot
// (`nextSlotAt`). Mirrors the detail page's StickyBookingCard gate
// (`uniqueDays.length === 0` → CTA disabled) so search never implies a
// bookability the profile will immediately deny. Covered by the test file.
function isTutorBookable(nextSlotAt?: string | null): boolean {
  return nextSlotAt != null
}

/*/* ───── "Available now" pill — instant-booking indicator ───── */
/* ───── Tutor card — mirrors landing.tsx ExpertCard ───── */
const TutorCard = ({ t, idx, onPreviewEnter, onBook, saved, onToggleFav, needsSignIn }: { t: Tutor; idx: number; onPreviewEnter: (t: Tutor, anchor: HTMLElement) => void; onBook: (t: Tutor) => void; saved: boolean; onToggleFav: (tutorId: string) => void; needsSignIn?: boolean }) => {
  // Prefer the tutor's real avatar; fall back to an initials placeholder so we
  // never render a random pravatar face over a real name (crawler-safe).
  const photoSrc = t.avatarUrl || initialsAvatarSvg(t.name)
  // Advertise the expert's real consultation length + their flat, self-set
  // price (t.price is exactly what the expert charges — see priceForDuration).
  const dur = t.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin
  // Gate the CTA on real availability — same rule the detail page's
  // StickyBookingCard uses — so the card never promises a booking the profile
  // will deny with "no published slots".
  const bookable = isTutorBookable(t.nextSlotAt)
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
        <button
          type="button"
          onClick={() => onToggleFav(t.id)}
          aria-label={saved ? 'შენახული' : 'შენახვა'}
          className={`absolute bottom-3 left-3 z-10 w-10 h-10 inline-flex items-center justify-center rounded-full backdrop-blur transition-colors ${saved ? 'text-danger-600 bg-white/95' : 'text-ink-700 bg-white/80 hover:bg-white'}`}
        >
          {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
        </button>
      </div>

      {/* Desktop — Preply-style horizontal card: photo │ content+stats │ price+CTA rail */}
      <div className="hidden sm:grid sm:grid-cols-[132px_1fr_216px] gap-5 p-5 sm:p-6">
        {/* Photo + video. The photo itself links to the profile — the
            highest-frequency action on a listing card. The video preview is a
            separate small stopPropagation target (the play circle only), so it
            no longer swallows every click on the face. */}
        <div className="shrink-0">
          <div className="relative w-[132px] h-[132px] rounded-card overflow-hidden bg-ink-100 group/photo ring-1 ring-inset ring-ink-900/[0.06] shadow-xs">
            <Link href={`/tutors/${t.id}`} aria-label={`${t.name} — პროფილი`} className="absolute inset-0 block">
              <img src={photoSrc} alt={t.name} className="absolute inset-0 w-full h-full object-cover" />
            </Link>
            {/* The old bare green availability dot moved into the right rail as
                a worded next-slot line (same fmtNextSlot the mobile card uses). */}
            {t.video && (
              <>
                <button
                  type="button"
                  aria-label="ვიდეო-გაცნობა"
                  onClick={e => { e.stopPropagation(); onPreviewEnter(t, e.currentTarget) }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 shadow-pop ring-1 ring-black/5 inline-flex items-center justify-center group-hover/photo:scale-105 transition-transform"
                >
                  <Icon.play className="w-4 h-4 text-brand-700 ml-0.5" />
                </button>
                <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 h-4 px-1.5 rounded-pill bg-accent-950/70 backdrop-blur text-white font-display text-[8.5px] font-bold uppercase tracking-[0.12em]">ვიდეო</span>
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
              <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 font-display text-[9.5px] font-bold uppercase tracking-[0.12em]">
                <Icon.spark className="w-2.5 h-2.5" /> Super
              </span>
            )}
          </div>
          {/* Accomplishment headline reads FIRST (consultation scan pattern);
              the category label is secondary, muted. */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {t.headline && (
              <>
                <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-info-50 text-info-700 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">{t.headline}</span>
                <span className="text-ink-300">·</span>
              </>
            )}
            <span className="font-display text-[12px] font-medium text-ink-500">{t.cat}</span>
          </div>
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
            <button type="button" onClick={() => onToggleFav(t.id)} aria-label={saved ? 'შენახული' : 'შენახვა'} className={`h-8 w-8 rounded-btn inline-flex items-center justify-center transition-colors shrink-0 ${saved ? 'text-danger-600 bg-danger-50' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'}`}>
              {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {/* Same computed next-slot line the mobile card shows — replaces
                the unexplained green dot the photo used to carry. */}
            {t.nextSlotAt && (
              <div className="inline-flex items-center gap-1 text-[11px] text-success-700">
                <Icon.clock className="w-3 h-3" />
                უახლოესი <span className="font-display font-semibold">{fmtNextSlot(t.nextSlotAt)}</span>
              </div>
            )}
            {bookable ? (
              <button type="button" onClick={() => onBook(t)} className="w-full h-11 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs">
                {needsSignIn ? 'შესვლა & ჯავშანი' : 'დაჯავშნე'}
              </button>
            ) : (
              <button type="button" disabled title="ექსპერტს ჯერ არ აქვს გამოცხადებული სლოტები" className="w-full h-11 rounded-btn bg-ink-100 text-ink-400 font-display font-semibold text-[12px] tracking-wide inline-flex items-center justify-center gap-1.5 cursor-not-allowed">
                <Icon.clock className="w-3.5 h-3.5" /> ხელმისაწვდომობა მალე
              </button>
            )}
            {/* „პროფილი" button dropped — name and photo already link there. */}
          </div>
        </div>
      </div>

      {/* Mobile content block */}
      <div className="sm:hidden px-4 pt-4 pb-3 flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <h3 className="font-display text-[18px] font-bold text-ink-900 tracking-tight leading-[1.15] truncate">{t.name}</h3>
          {t.verified && <VerifiedMark size={14} />}
          {t.superExpert && (
            <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 font-display text-[9.5px] font-bold uppercase tracking-[0.12em]">
              <Icon.spark className="w-2.5 h-2.5" />
              Super
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-display text-[12px] font-semibold text-ink-700">{t.cat}</span>
          {t.headline && (
            <>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-info-50 text-info-700 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">
                {t.headline}
              </span>
            </>
          )}
        </div>
        <p className="mt-3 text-[13px] text-ink-700 leading-[1.55] line-clamp-2">{t.bio}</p>
        <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-500 flex-wrap">
          <span className="tabular-nums"><span className="font-display font-semibold text-ink-800">{t.sessions}</span> სესია</span>
          <span className="text-ink-300">·</span>
          {t.nextSlotAt ? (
            <span className="inline-flex items-center gap-1 text-success-700">
              <Icon.clock className="w-3 h-3" />
              უახლოესი <span className="font-display font-semibold ml-0.5">{fmtNextSlot(t.nextSlotAt)}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-ink-400">
              <Icon.clock className="w-3 h-3" />
              ხელმისაწვდომობა მალე
            </span>
          )}
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
        {/* relative z-10: explicit actions stay above the mobile overlay link */}
        <div className="relative z-10 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggleFav(t.id)}
            aria-label={saved ? 'შენახული' : 'შენახვა'}
            className={`hidden sm:inline-flex h-10 w-10 rounded-btn border items-center justify-center transition-colors ${saved ? 'border-danger-200 bg-danger-50 text-danger-600' : 'border-ink-200 bg-white hover:border-ink-300 text-ink-500 hover:text-ink-800'}`}
          >
            {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
          </button>
          <Link href={`/tutors/${t.id}`} aria-label="ექსპერტის დეტალები" className="h-10 w-10 rounded-btn border border-ink-200 hover:border-ink-300 bg-white text-ink-500 hover:text-ink-800 inline-flex items-center justify-center transition-colors">
            <Icon.arrow className="w-4 h-4" />
          </Link>
          {bookable ? (
            <button type="button" onClick={() => onBook(t)} className="h-11 px-3.5 sm:px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-all duration-fast shadow-xs hover:shadow-sm">
              {needsSignIn ? 'შესვლა & ჯავშანი' : 'დაიჯავშნე'} <Icon.arrow className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled
              title="ექსპერტს ჯერ არ აქვს გამოცხადებული სლოტები"
              aria-label="ხელმისაწვდომობა მალე — ჯერ არ არის გამოცხადებული სლოტები"
              className="h-11 px-3.5 sm:px-4 rounded-btn bg-ink-100 text-ink-400 font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 cursor-not-allowed"
            >
              <Icon.clock className="w-3.5 h-3.5" /> ხელმისაწვდომობა მალე
            </button>
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
              src={tutor.avatarUrl || initialsAvatarSvg(tutor.name)}
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
            <img src={tutor.avatarUrl || initialsAvatarSvg(tutor.name)} alt={tutor.name} className="w-7 h-7 rounded-full ring-2 ring-white/30 object-cover" />
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
            დაჯავშნა
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───── Quick-Book popup (Preply-style — no nav to profile) ───── */
type BookStep = 1 | 2 | 3 | 4

// Flat, expert-authored price — MUST stay identical to the helper in
// app/tutors/[id]/client.tsx. `base` is the exact price the expert set for their
// consultation: what they enter is what the client pays. The system does NOT
// re-derive it from an hourly rate — `minutes` is only a display label. Kept
// two-arg so existing call sites (which pass the duration for the "/ N წთ"
// label) stay unchanged.
function priceForDuration(base: number, _minutes: number): number {
  return Math.max(0, Math.round(base || 0))
}
const PRICE_QB = (price: number, d: number) => priceForDuration(price, d)

// Category-agnostic — MUST stay in sync with TOPIC_OPTIONS on the detail-page
// modal. The old VC-specific chips ('Series A pitch', 'OKR setup'…) read as
// nonsense to a psychology or law client quick-booking from the list.
const TOPIC_CHIPS = [
  'კონკრეტული პრობლემის განხილვა',
  'სტრატეგია და მიმართულება',
  'უკუკავშირი ჩემს გეგმაზე',
  'გადაწყვეტილების მიღება',
  'სხვა თემა',
]

const StepDot = ({ n, l, step }: { n: BookStep; l: string; step: BookStep }) => {
  const done = step > n
  const active = step === n
  return (
    <div className={`inline-flex items-center gap-1.5 ${active ? 'text-brand-700' : done ? 'text-success-700' : 'text-ink-400'}`}>
      <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-display font-bold ${
        active ? 'bg-brand-500 text-white' : done ? 'bg-success-500 text-white' : 'bg-ink-100 text-ink-500'
      }`}>{done ? <Icon.check className="w-3 h-3" /> : n}</span>
      <span className="font-display text-[11.5px] font-semibold tracking-wide">{l}</span>
    </div>
  )
}

type LiveSlot = { startAt: string; endAt: string; booked: boolean }
type LiveBusy = { startAt: string; endAt: string }
type LiveDay = { idx: number; dateNum: number; monthShort: string; dow: string; dowFull: string; load: number; date: Date }

const DOW_LONG_KA = ['კვირა','ორშაბათი','სამშაბათი','ოთხშაბათი','ხუთშაბათი','პარასკევი','შაბათი']
const MON_SHORT_KA = ['იან.','თებ.','მარ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექ.','ოქტ.','ნოე.','დეკ.']
const sameYMD = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/* Small day-picker tz hint. Slot times below are computed with Date#getHours —
   the VIEWER's browser tz — so the label must say that or it lies. Mirrors the
   profile BookingModal's TbilisiHint (same lib/tz userTimezone/TBILISI logic):
   Tbilisi browsers see "GMT+4", remote browsers see "შენს დროზე".
   Client-only so SSR/first paint stays stable. */
const QuickBookTbilisiHint = () => {
  const [tz, setTz] = useState<string>(TBILISI)
  useEffect(() => { setTz(userTimezone()) }, [])
  if (tz === TBILISI) {
    return <span className="text-[10.5px] text-ink-400 tabular-nums">GMT+4</span>
  }
  return <span className="text-[10.5px] text-ink-400">შენს დროზე</span>
}

/* Longer variant for the slot-grid footer — same truthfulness rule as the
   profile's CalendarTzLabel: name the viewer's own zone when it isn't Tbilisi. */
const QuickBookTzLabel = () => {
  const [tz, setTz] = useState<string>(TBILISI)
  useEffect(() => { setTz(userTimezone()) }, [])
  if (tz === TBILISI) {
    return <span>დროის ზონა: <span className="font-display font-semibold text-ink-700">თბილისი (GMT+4)</span></span>
  }
  return <span>დროის ზონა: <span className="font-display font-semibold text-ink-700">შენი ({tz})</span></span>
}

const QuickBookPopup = ({ tutor, onClose }: { tutor: Tutor; onClose: () => void }) => {
  // Calendar booking flow: pick a day/time → details → payment.
  const [step, setStep] = useState<BookStep>(1)
  // Fixed consultation length set by the expert — the client no longer picks a
  // duration. Price is flat (what the expert set), so a duration picker would
  // just show the same price N times; the offering is one fixed slot length.
  const duration = tutor.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin
  const [live, setLive] = useState<{ avail: LiveSlot[]; busy: LiveBusy[] } | null>(null)
  const [dayIdx, setDayIdx] = useState<number>(0)
  const [time, setTime] = useState<string>('')
  const [topic, setTopic] = useState<string>(TOPIC_CHIPS[0])
  const [goal, setGoal] = useState<string>('')
  const [pay, setPay] = useState<'tbc' | 'bog' | 'card'>('tbc')
  const [submitting, setSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingUnverified, setBookingUnverified] = useState(false)
  const [resendingVerify, setResendingVerify] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)
  const [bookingRef, setBookingRef] = useState<string | null>(null)
  // Full booking id from POST /api/bookings — powers the "ჯავშნის ნახვა" deep
  // link on the success step (bookingRef is only the display short-code).
  const [bookingId, setBookingId] = useState<string | null>(null)

  // Escape / focus trap / scroll-lock come from the Sheet container.

  // Fetch this tutor's real availability + busy bookings on open.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/tutors/${tutor.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        setLive({ avail: d.availability ?? [], busy: d.busySlots ?? [] })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tutor.id])

  // Derive next-7-days strip from real availability windows.
  const weekDays: LiveDay[] = React.useMemo(() => {
    const days: LiveDay[] = []
    const now = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i)
      const load = (live?.avail ?? []).filter(s => !s.booked && sameYMD(new Date(s.startAt), d)).length
      days.push({
        idx: i,
        dateNum: d.getDate(),
        monthShort: MON_SHORT_KA[d.getMonth()],
        dow: DOW_LONG_KA[d.getDay()].slice(0, 3),
        dowFull: DOW_LONG_KA[d.getDay()],
        load,
        date: d,
      })
    }
    return days
  }, [live])

  // Slots for the currently-selected day, stepped by chosen duration.
  const slotTimes: { hhmm: string; taken: boolean; endHHMM: string }[] = React.useMemo(() => {
    if (!live) return []
    const day = weekDays[dayIdx]
    if (!day) return []
    const nowMs = Date.now()
    const busyMs = live.busy.map(b => ({ s: new Date(b.startAt).getTime(), e: new Date(b.endAt).getTime() }))
    const out: { hhmm: string; taken: boolean; endHHMM: string }[] = []
    for (const s of live.avail) {
      const sStart = new Date(s.startAt)
      if (!sameYMD(sStart, day.date)) continue
      const startMs = sStart.getTime()
      const endMs = new Date(s.endAt).getTime()
      for (let t = startMs; t + duration * 60_000 <= endMs; t += duration * 60_000) {
        if (t + duration * 60_000 < nowMs) continue
        const end = t + duration * 60_000
        const taken = s.booked || busyMs.some(b => b.s < end && b.e > t)
        const dt = new Date(t)
        const de = new Date(end)
        const pad = (n: number) => String(n).padStart(2, '0')
        out.push({
          hhmm: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
          endHHMM: `${pad(de.getHours())}:${pad(de.getMinutes())}`,
          taken,
        })
      }
    }
    out.sort((a, b) => a.hhmm.localeCompare(b.hhmm))
    return out
  }, [live, weekDays, dayIdx, duration])

  // Auto-select first available day + slot on data load.
  useEffect(() => {
    if (!live) return
    const firstIdx = weekDays.findIndex(d => d.load > 0)
    if (firstIdx >= 0 && dayIdx === 0 && weekDays[dayIdx].load === 0) setDayIdx(firstIdx)
  }, [live, weekDays])

  useEffect(() => {
    if (!time && slotTimes.length > 0) {
      const first = slotTimes.find(s => !s.taken)
      if (first) setTime(first.hhmm)
    }
  }, [slotTimes, time])

  const day = weekDays[dayIdx]
  const slots = slotTimes.map(s => s.hhmm)
  const taken = slotTimes.filter(s => s.taken).map(s => s.hhmm)

  // Flat, expert-set price, shared with the detail BookingModal via
  // priceForDuration (what the expert set = what the client pays).
  const price = PRICE_QB(tutor.price, duration)
  const priceL = `₾${price}`
  const commission = Math.round(price * 0.15)

  const ERROR_MAP: Record<string, string> = {
    SLOT_TAKEN: 'ეს slot უკვე დაკავებულია — აირჩიე სხვა დრო.',
    NO_AVAILABILITY: 'ექსპერტს ამ დროზე არ აქვს გახსნილი ხელმისაწვდომობა.',
    PAST_DATE: 'დროის შერჩევა წარსულში ვერ მოხდება.',
    BAD_DATE: 'დროის ფორმატი არასწორია.',
    TUTOR_NOT_FOUND: 'ექსპერტი ვერ მოიძებნა.',
    SELF_BOOKING: 'საკუთარ თავზე ჯავშნა ვერ მოხდება.',
    INVALID: 'ველების შეცდომა — შეამოწმე თემა და დრო.',
  }

  const confirmBooking = async () => {
    if (!day || !time) { setBookingError('აირჩიე დრო.'); return }
    setSubmitting(true)
    setBookingError(null)
    setBookingUnverified(false)
    setResendMsg(null)
    try {
      // Send the picked calendar slot explicitly.
      const [hh, mm] = time.split(':').map(Number)
      const startAt = new Date(day.date)
      startAt.setHours(hh, mm, 0, 0)
      const body: Record<string, unknown> = {
        tutorId: tutor.id,
        topic: topic.slice(0, 160),
        startAt: startAt.toISOString(),
        durationMin: duration,
        price,
        studentNotes: goal.trim() || undefined,
      }
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/tutors'
        window.location.href = `/signin?redirect=${encodeURIComponent(here)}`
        return
      }
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        if (data?.error === 'EMAIL_NOT_VERIFIED') {
          setBookingUnverified(true)
          setResendMsg(null)
          setBookingError('დაჯავშნამდე დაადასტურე ელფოსტა.')
          return
        }
        setBookingError(ERROR_MAP[data?.error] ?? 'ჯავშნის შექმნა ვერ მოხერხდა. სცადე თავიდან.')
        return
      }
      setBookingRef(data.id?.slice(0, 8).toUpperCase() ?? null)
      setBookingId(data.id ?? null)
      setStep(4)
    } catch {
      setBookingError('ქსელის შეცდომა. სცადე თავიდან.')
    } finally {
      setSubmitting(false)
    }
  }

  // Fires when the user hits "ხელახლა გაგზავნა" under the unverified banner —
  // reuses the existing signup OTP endpoint with purpose=verify so the same
  // session can complete verification without a full sign-out round trip.
  const resendVerify = async () => {
    if (resendingVerify) return
    setResendingVerify(true)
    setResendMsg(null)
    try {
      const meRes = await fetch('/api/me')
      const meData = await meRes.json().catch(() => ({} as any))
      const email = meData?.user?.email
      if (!email) {
        setResendMsg('სესია ვერ მოიძებნა — გაიარე სისტემაში შესვლა.')
        return
      }
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'verify' }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setResendMsg(data?.error === 'RATE_LIMITED' ? 'ხშირად ცდი — მოგვიანებით სცადე.' : 'გაგზავნა ვერ მოხერხდა.')
        return
      }
      setResendMsg('კოდი გაიგზავნა — შეამოწმე ინბოქსი.')
    } catch {
      setResendMsg('ქსელის შეცდომა.')
    } finally {
      setResendingVerify(false)
    }
  }

  // Payments aren't live → skip the card step; details (step 2) is the last
  // input step and submits directly.
  const lastInputStep: BookStep = PAYMENTS_LIVE ? 3 : 2
  const next = () => {
    if (step === lastInputStep) { confirmBooking(); return }
    setStep(s => (s < 4 ? (s + 1) as BookStep : s))
  }
  const back = () => setStep(s => (s > 1 ? (s - 1) as BookStep : s))

  return (
    // Right-side sheet on desktop, bottom sheet on mobile — the shared Sheet
    // container (focus trap, Escape, scroll-lock, safe-area footer). Anchoring
    // to an edge keeps the /tutors grid visible on the left, so it reads as a
    // follow-up panel, not a takeover.
    <Sheet
      open
      onClose={onClose}
      variant="side"
      size="lg"
      busy={submitting}
      ariaLabel={`${tutor.name} — სწრაფი დაჯავშნა`}
      title={
        <div className="font-sans font-normal tracking-normal flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src={tutor.avatarUrl || initialsAvatarSvg(tutor.name)} alt={tutor.name} className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-[14px] font-bold text-ink-900 truncate">{tutor.name}</span>
                {tutor.verified && <VerifiedMark size={12} />}
              </div>
              <div className="text-[11px] text-ink-500 truncate tabular-nums"><span className="font-display font-semibold text-brand-700">{tutor.cat}</span> · {tutor.headline}</div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3 shrink-0">
            <StepDot n={1} l="დრო"        step={step} />
            <span className="w-5 h-px bg-ink-200" />
            <StepDot n={2} l="დეტალები"   step={step} />
            {PAYMENTS_LIVE && (
              <>
                <span className="w-5 h-px bg-ink-200" />
                <StepDot n={3} l="გადახდა"    step={step} />
              </>
            )}
          </div>
        </div>
      }
      footer={step !== 4 ? (
        <div className="w-full flex flex-col gap-2">
          {bookingError && (
            <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12.5px] font-medium">
              {bookingUnverified ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>დაჯავშნამდე დაადასტურე ელფოსტა</span>
                  <span>·</span>
                  <a href="/settings" className="underline font-semibold hover:text-danger-900">ბმული ვერიფიკაციაზე</a>
                  <button
                    type="button"
                    onClick={resendVerify}
                    disabled={resendingVerify}
                    className="ml-auto h-7 px-2 rounded-btn bg-white border border-danger-200 hover:border-danger-300 disabled:opacity-50 text-danger-700 font-display font-semibold text-[11.5px] transition-colors"
                  >
                    {resendingVerify ? 'იგზავნება…' : 'კოდის ხელახლა გაგზავნა'}
                  </button>
                  {resendMsg && <div className="w-full text-[11.5px] text-danger-700 mt-0.5">{resendMsg}</div>}
                </div>
              ) : bookingError}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] min-w-0">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">არჩეული</div>
              <div className="font-display font-bold text-ink-900 tabular-nums truncate">
                {day ? `${day.dow}. ${day.dateNum} ${day.monthShort}` : '—'} · {time || '—'} · {duration} წთ · {priceL}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {step > 1 ? (
                <button type="button" onClick={back} disabled={submitting} className="h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-700 font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors">
                  <Icon.chevL className="w-3.5 h-3.5" /> უკან
                </button>
              ) : (
                <button type="button" onClick={onClose} className="h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12.5px] transition-colors">გაუქმება</button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={submitting || (step === 1 && (!time || !day))}
                className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-300 text-white font-display font-semibold text-[13px] inline-flex items-center gap-2 transition-colors"
              >
                {submitting
                  ? 'იგზავნება…'
                  : (step === 1 ? 'შემდეგი — დეტალები' : step === lastInputStep ? `დაჯავშნა · ${priceL}` : 'შემდეგი — გადახდა')
                }
                <Icon.arrow className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Risk-reversal glued to the confirm CTA — one canonical line. */}
          {step === lastInputStep && (
            <p className="text-[11.5px] text-ink-500 text-center leading-snug">{RISK_REVERSAL_LINE}</p>
          )}
        </div>
      ) : undefined}
    >
        {/* Body — full-bleed inside Sheet's padded scroll area */}
        <div className="grid lg:grid-cols-[330px_1fr] -mx-5 sm:-mx-6 -my-4">
          {/* LEFT: tutor card + sticky summary */}
          <aside className="border-b lg:border-b-0 lg:border-r border-ink-200 bg-ink-50/50 flex flex-col">
            {/* Video preview — real YouTube iframe if the tutor has one, else
                a static portrait. Booking modal doesn't autoplay to keep focus
                on the pick-a-time task; the play button is inside the frame. */}
            <div className="relative aspect-video bg-accent-900 overflow-hidden">
              {(() => { const ytId = tutorYouTubeId(tutor); return ytId ? (
                <iframe
                  key={tutor.id}
                  src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`}
                  title={`${tutor.name} — ინტრო ვიდეო`}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                />
              ) : (
                <img
                  src={tutor.avatarUrl || initialsAvatarSvg(tutor.name)}
                  alt={tutor.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )})()}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-accent-950/80 to-transparent pointer-events-none" />

              <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2 h-5 rounded-pill bg-accent-900/70 backdrop-blur border border-white/10 pointer-events-none">
                <Icon.play className="w-2.5 h-2.5 text-white" />
                <span className="font-display text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/90">ინტრო ვიდეო</span>
              </div>

              <div className="absolute left-3 right-3 bottom-2.5 flex items-center gap-3 text-[10.5px] text-white/85 font-mono tabular-nums pointer-events-none">
                <span className="inline-flex items-center gap-1"><Icon.star className="w-2.5 h-2.5 text-warning-400" /><span className="font-display font-bold text-white">{fmtRating(tutor.rating)}</span></span>
                <span className="text-white/40">·</span>
                <span><span className="font-display font-semibold text-white">{tutor.sessions}</span> სესია</span>
                <span className="text-white/40">·</span>
                <span>{tutor.langs.join(' · ')}</span>
              </div>
            </div>

            {/* Mini bio */}
            <div className="p-5 flex-1 overflow-y-auto">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-1.5">შესახებ</div>
              <p className="text-[12.5px] text-ink-700 leading-[1.55] line-clamp-4">{tutor.bio}</p>

              {/* Real response-time promise only (tutorProfile.responseHours).
                  The old hardcoded „პასუხი < 2 სთ" / „დასრულება 98%" pair was
                  fabricated for every expert; a completion metric returns only
                  when a real one exists in the data. */}
              {typeof tutor.responseHours === 'number' && (
                <div className="mt-5 rounded-card bg-white border border-ink-200 p-2.5 text-[11.5px]">
                  <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">პასუხი</div>
                  <div className="mt-0.5 font-display text-[14px] font-bold text-ink-900 tabular-nums">~{tutor.responseHours} სთ</div>
                </div>
              )}

              {/* Live summary */}
              <div className="mt-5 pt-5 border-t border-ink-200">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-2">შენი ჯავშანი</div>
                <ul className="space-y-1.5 text-[12.5px]">
                  <li className="flex items-center justify-between"><span className="text-ink-600">დღე</span><span className="font-display font-semibold text-ink-900 tabular-nums">{day ? `${day.dowFull}, ${day.dateNum} ${day.monthShort}` : '—'}</span></li>
                  <li className="flex items-center justify-between"><span className="text-ink-600">დრო</span><span className="font-display font-semibold text-ink-900 tabular-nums">{time || '—'}</span></li>
                  <li className="flex items-center justify-between"><span className="text-ink-600">ხანგრძლივობა</span><span className="font-display font-semibold text-ink-900 tabular-nums">{duration} წთ</span></li>
                  <li className="flex items-center justify-between"><span className="text-ink-600">თემა</span><span className="font-display font-semibold text-ink-900 truncate max-w-[170px]">{topic}</span></li>
                </ul>
                <div className="mt-3 pt-3 border-t border-ink-200 flex items-baseline justify-between">
                  <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">ჯამი</span>
                  <span className="font-display text-[18px] font-bold text-ink-900 tabular-nums">{priceL}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-ink-200 bg-white text-[11px] text-ink-600 leading-[1.5] flex gap-2">
              <Icon.shield className="w-3.5 h-3.5 text-brand-700 mt-0.5 shrink-0" />
              {PAYMENTS_LIVE
                ? 'გადახდილი თანხა escrow-ში დარჩება სესიის დასრულებამდე. დაბრუნება — 24სთ-მდე.'
                : 'ჯავშანი ამჟამად უფასოა — გადახდის სისტემა მალე ჩაირთვება. ექსპერტი დაგიდასტურებს მოთხოვნას.'}
            </div>
          </aside>

          {/* RIGHT: step content */}
          <div className="flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">

              {step === 1 && (
                <div>
                  <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">დროის არჩევა</div>
                  <h2 className="font-display text-[22px] font-bold text-ink-900 tracking-tight leading-tight">აირჩიე თავისუფალი slot</h2>
                  {/* Times are enumerated in the viewer's browser tz (Date#getHours),
                      so the copy says so. The booking rule (API: PAST_DATE when
                      start is >5 min gone) in plain Georgian — the old „slot-ი
                      იჯავშნება 5 წუთის შემდეგ" line was incomprehensible. */}
                  <p className="mt-1 text-[13px] text-ink-600 leading-[1.55]">დროები ნაჩვენებია შენს დროის ზონაში. დაჯავშნა შესაძლებელია არჩეული დროის დაწყებამდე.</p>

                  {/* Fixed consultation offering — the expert set the length and
                      the exact price; the client just picks a free slot. */}
                  <div className="mt-5 flex items-center justify-between gap-3 p-3.5 rounded-card border border-brand-200 bg-brand-50">
                    <div className="min-w-0">
                      <div className="font-display text-[15px] font-bold text-ink-900 tracking-tight tabular-nums">{duration} <span className="text-[11px] font-medium text-ink-600">წთ</span> · კონსულტაცია</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-600 leading-snug">ინდივიდუალური ვიდეო-სესია {tutor.name}-სთან</div>
                    </div>
                    <div className="shrink-0 font-display text-[18px] font-bold text-brand-700 tabular-nums tracking-tight">₾{PRICE_QB(tutor.price, duration)}</div>
                  </div>

                  {/* Week strip */}
                  <div className="mt-6 flex items-center justify-between mb-2.5">
                    <div className="font-display text-[12.5px] font-bold text-ink-900 tracking-tight">
                      {!live ? 'იტვირთება…' : weekDays[0] && weekDays[6]
                        ? `${weekDays[0].dateNum} ${weekDays[0].monthShort} – ${weekDays[6].dateNum} ${weekDays[6].monthShort}`
                        : ''}
                    </div>
                    <QuickBookTbilisiHint />
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {weekDays.map(d => {
                      const empty = d.load === 0
                      const active = d.idx === dayIdx
                      return (
                        <button key={d.idx} type="button" disabled={empty} onClick={() => { setDayIdx(d.idx); setTime('') }} className={`p-2.5 rounded-card text-center border transition-all disabled:cursor-not-allowed ${
                          active ? 'border-brand-500 bg-brand-50' :
                          empty ? 'border-ink-200 bg-ink-50/60 opacity-60' :
                          'border-ink-200 bg-white hover:border-ink-300'
                        }`}>
                          <div className={`font-display text-[9.5px] font-semibold uppercase tracking-[0.14em] ${active ? 'text-brand-700' : 'text-ink-500'}`}>{d.dow}</div>
                          <div className={`mt-0.5 font-display text-[16px] font-bold tabular-nums ${active ? 'text-brand-800' : 'text-ink-900'}`}>{d.dateNum}</div>
                          <div className={`mt-1 text-[10px] tabular-nums ${empty ? 'text-ink-400' : active ? 'text-brand-700 font-display font-semibold' : 'text-ink-500'}`}>
                            {empty ? '—' : `${d.load} slot`}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Slot grid */}
                  <div className="mt-6">
                    {!live ? (
                      <div className="rounded-card border border-ink-200 bg-ink-50/40 p-6 text-center text-[12px] text-ink-500">იტვირთება…</div>
                    ) : slotTimes.length === 0 ? (
                      // Distinguish "this day is full" from "the whole 7-day strip
                      // is empty" — the card CTA enables on ANY future slot, so a
                      // tutor whose first slot is >7 days out lands here on every
                      // day; telling them to "pick another day" would be a lie.
                      weekDays.every(d => d.load === 0) ? (
                        <div className="rounded-card border border-ink-200 bg-ink-50/40 p-6 text-center">
                          <div className="w-10 h-10 mx-auto rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-3"><Icon.cal className="w-4 h-4" /></div>
                          <div className="font-display text-[13.5px] font-semibold text-ink-900">უახლოესი თავისუფალი დრო ამ კვირის შემდეგაა</div>
                          <p className="text-[12px] text-ink-500 mt-1">სრული კალენდარი პროფილზეა — იქ ნებისმიერი მომავალი დღის არჩევა შეგიძლია.</p>
                          <a href={`/tutors/${tutor.id}`} className="mt-4 inline-flex h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide items-center gap-1.5 transition-colors">
                            სრული კალენდარი <Icon.arrow className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : (
                        <div className="rounded-card border border-ink-200 bg-ink-50/40 p-6 text-center">
                          <div className="w-10 h-10 mx-auto rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-3"><Icon.cal className="w-4 h-4" /></div>
                          <div className="font-display text-[13.5px] font-semibold text-ink-900">ამ დღეს თავისუფალი slot-ი არ არის</div>
                          <p className="text-[12px] text-ink-500 mt-1">აირჩიე სხვა დღე ან გადადი <a href={`/tutors/${tutor.id}`} className="font-display font-semibold text-brand-700 hover:underline">სრულ პროფილზე</a>.</p>
                        </div>
                      )
                    ) : (
                      <div>
                        <div className="flex items-baseline justify-between mb-2.5">
                          <span className="font-display text-[12.5px] font-bold text-ink-900 tracking-tight">{day?.dowFull}, {day?.dateNum} {day?.monthShort}</span>
                          <span className="font-mono text-[11px] tabular-nums text-ink-500">{slots.length - taken.length} თავისუფალი · {taken.length} დაჯავშნული</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {slotTimes.map(s => {
                            const isTaken = s.taken
                            const isSelected = s.hhmm === time && !isTaken
                            return (
                              <button key={s.hhmm} type="button" disabled={isTaken} onClick={() => { setTime(s.hhmm); if (bookingError) setBookingError(null) }} className={`p-2.5 rounded-card text-center border transition-all disabled:cursor-not-allowed ${
                                isTaken ? 'border-ink-200 bg-ink-50/60' :
                                isSelected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' :
                                'border-ink-200 bg-white hover:border-ink-400'
                              }`}>
                                <div className={`font-display text-[13.5px] font-bold tabular-nums tracking-tight ${isTaken ? 'text-ink-400 line-through' : isSelected ? 'text-brand-800' : 'text-ink-900'}`}>{s.hhmm}</div>
                                <div className={`text-[10.5px] tabular-nums mt-0.5 ${isTaken ? 'text-ink-400' : isSelected ? 'text-brand-700' : 'text-ink-500'}`}>
                                  {isTaken ? 'დაკავებული' : `→ ${s.endHHMM}`}
                                </div>
                              </button>
                            )
                          })}
                        </div>

                        {/* Viewer-tz label (see QuickBookTzLabel). The old strip
                            claimed „თბილისი (GMT+4)" for everyone and asserted
                            the expert's own zone, which we don't actually know. */}
                        <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-500">
                          <Icon.globe className="w-3.5 h-3.5" />
                          <QuickBookTzLabel />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">სესიის დეტალები</div>
                  <h2 className="font-display text-[22px] font-bold text-ink-900 tracking-tight leading-tight">რას მოელი ამ სესიისგან?</h2>
                  <p className="mt-1 text-[13px] text-ink-600 leading-[1.55]">ექსპერტი ნახავს ამ ინფორმაციას სესიამდე — რომ მოემზადოს. რაც უფრო კონკრეტული ხარ, მით უკეთეს შედეგს მიიღებ.</p>

                  <div className="mt-5">
                    <label className="block font-display text-[11.5px] font-semibold text-ink-900 mb-2">თემა</label>
                    <div className="flex flex-wrap gap-1.5">
                      {TOPIC_CHIPS.map(t => (
                        <button key={t} type="button" onClick={() => setTopic(t)} className={`h-8 px-3 rounded-pill border font-display text-[11.5px] font-semibold transition-colors ${
                          topic === t ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-ink-700 border-ink-200 hover:border-ink-300'
                        }`}>{t}</button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    <label className="block font-display text-[11.5px] font-semibold text-ink-900 mb-2">შენი მიზანი ან კონკრეტული შეკითხვა <span className="text-ink-400 font-normal">(არასავალდებულო, რეკომენდებული)</span></label>
                    <textarea
                      value={goal}
                      onChange={e => setGoal(e.target.value)}
                      rows={5}
                      placeholder="მაგ. სამიდან ერთი slide-ი არ მცემს თავის ფუნქციას — slide 06 GTM. მინდა, რომ კონკრეტული 2–3 ცვლილება გავარკვიო investor-მდე."
                      className="w-full p-3 rounded-field border border-ink-200 bg-white text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none leading-[1.55]"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-ink-500 tabular-nums">
                      <span>{goal.length} / 500 სიმბოლო</span>
                      <span className="inline-flex items-center gap-1"><Icon.shield className="w-3 h-3" /> კერძო · ხედავს მხოლოდ ექსპერტი</span>
                    </div>
                  </div>

                </div>
              )}

              {PAYMENTS_LIVE && step === 3 && (
                <div>
                  <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">გადახდა</div>
                  <h2 className="font-display text-[22px] font-bold text-ink-900 tracking-tight leading-tight">აირჩიე გადახდის მეთოდი</h2>
                  <p className="mt-1 text-[13px] text-ink-600 leading-[1.55]">თანხა გადადის escrow-ში — ექსპერტს ხელფასი მხოლოდ სესიის წარმატებით დასრულების შემდეგ ერიცხება.</p>

                  <div className="mt-5 space-y-2">
                    {([
                      { id: 'tbc' as const, l: 'TBC E-Commerce', sub: 'TBC ბანკის ბარათები · Apple Pay · Google Pay', logo: 'TBC' },
                      { id: 'bog' as const, l: 'BOG iPay', sub: 'საქართველოს ბანკი · ყველა ვიზა/მასტერი', logo: 'BOG' },
                      { id: 'card' as const, l: 'საერთაშორისო ბარათი', sub: 'Visa · Mastercard · 3-D Secure', logo: '••••' },
                    ]).map(m => (
                      <label key={m.id} className={`flex items-center gap-3 p-3.5 rounded-card border cursor-pointer transition-all ${pay === m.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-ink-200 hover:border-ink-300 bg-white'}`}>
                        <input type="radio" name="pay" checked={pay === m.id} onChange={() => setPay(m.id)} className="w-4 h-4 accent-brand-500" />
                        <span className={`w-12 h-9 rounded-btn inline-flex items-center justify-center font-display text-[10.5px] font-bold tracking-wider ${pay === m.id ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-700'}`}>{m.logo}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[13.5px] font-bold text-ink-900 tracking-tight">{m.l}</span>
                          <span className="block text-[11.5px] text-ink-500">{m.sub}</span>
                        </span>
                        <Icon.shield className="w-4 h-4 text-success-600 shrink-0" />
                      </label>
                    ))}
                  </div>

                  <div className="mt-5 p-4 rounded-card bg-ink-50 border border-ink-200">
                    <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-2">ანგარიში</div>
                    <ul className="space-y-1.5 text-[12.5px]">
                      <li className="flex justify-between"><span className="text-ink-600">{duration}-წუთიანი სესია</span><span className="font-display font-semibold text-ink-900 tabular-nums">{priceL}</span></li>
                      <li className="flex justify-between"><span className="text-ink-600">პლატფორმის კომისია (15%)</span><span className="font-mono text-ink-600 tabular-nums">−₾{commission}</span></li>
                      <li className="flex justify-between"><span className="text-ink-600">ექსპერტი მიიღებს</span><span className="font-mono text-ink-700 tabular-nums">₾{price - commission}</span></li>
                    </ul>
                    <div className="mt-3 pt-3 border-t border-ink-200 flex items-baseline justify-between">
                      <span className="font-display text-[14px] font-bold text-ink-900">ჩასარიცხი ჯამი</span>
                      <span className="font-display text-[22px] font-bold text-ink-900 tabular-nums">{priceL}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-start gap-2 text-[11.5px] text-ink-600 leading-[1.5]">
                    <Icon.shield className="w-3.5 h-3.5 text-brand-700 mt-0.5 shrink-0" />
                    გადახდით ეთანხმები <Link href="/terms" className="underline text-ink-800">სერვისის წესებს</Link> და <Link href="/terms" className="underline text-ink-800">დაბრუნების პოლიტიკას</Link>. გაუქმება სესიამდე 24სთ-მდე უფასოა.
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                  <div className="relative">
                    <span className="absolute inset-0 rounded-full bg-success-500/15 animate-ping" />
                    <span className="relative w-16 h-16 rounded-full bg-success-500 text-white inline-flex items-center justify-center">
                      <Icon.check className="w-7 h-7" />
                    </span>
                  </div>
                  {/* Honest state: this is a REQUEST awaiting expert
                      confirmation — never claim it is already confirmed. */}
                  <h2 className="mt-6 font-display text-[26px] font-bold text-ink-900 tracking-tight leading-tight">მოთხოვნა გაგზავნილია</h2>
                  <p className="mt-2 text-[13.5px] text-ink-600 max-w-[420px] leading-[1.55]">
                    {day ? `${day.dowFull}, ${day.dateNum} ${day.monthShort} · ${time} · ${duration} წუთი` : ''}<br />{tutor.name}-სთან. ექსპერტი მალე დაადასტურებს — შეტყობინებას მიიღებ.
                  </p>
                  <div className="mt-6 grid grid-cols-3 gap-2 w-full max-w-[440px] text-[11px]">
                    <div className="p-3 rounded-card bg-ink-50 border border-ink-100"><div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">მოთხოვნა</div><div className="font-mono text-[12px] tabular-nums text-ink-900 mt-0.5">№ {bookingRef ?? '—'}</div></div>
                    <div className="p-3 rounded-card bg-ink-50 border border-ink-100"><div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">სტატუსი</div><div className="font-mono text-[12px] text-ink-900 mt-0.5">ელოდება დადასტურებას</div></div>
                    <div className="p-3 rounded-card bg-ink-50 border border-ink-100"><div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">ფასი</div><div className="font-mono text-[12px] tabular-nums text-ink-900 mt-0.5">{priceL}</div></div>
                  </div>
                  <div className="mt-7 flex items-center gap-2">
                    <button type="button" onClick={onClose} className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[13px] transition-colors">დახურვა</button>
                    {/* Deep-link straight to the created booking when we have
                        its id; fall back to the list only if the id is missing. */}
                    <a href={bookingId ? `/student/bookings/${bookingId}` : '/student/bookings'} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] inline-flex items-center gap-2 transition-colors">
                      {bookingId ? 'ჯავშნის ნახვა' : 'ჩემს ჯავშნებზე გადასვლა'} <Icon.arrow className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
    </Sheet>
  )
}

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

/* ───── Footer ───── */
const Footer = () => (
  <footer className="mt-20 lg:mt-28 bg-white border-t border-ink-200">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-14">
      <div className="grid md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 mb-12">
        <div>
          <Logo />
          <p className="text-[13px] text-ink-600 mt-5 max-w-[280px] leading-relaxed">პირადი ვიდეო-კონსულტაცია ქართველ პროფესიონალებთან. ქართულ ბაზარზე, ქართულ ფასებზე.</p>
          {/* Honest by flag: no bank names until the payment gateway is live. */}
          <div className="mt-5 inline-flex items-center gap-2 text-[12px] text-ink-500">
            <Icon.shield className="w-4 h-4 text-ink-400" />
            {PAYMENTS_LIVE ? (
              <>
                <span>escrow:</span>
                <span className="font-display font-semibold text-ink-700 tracking-wide">TBC</span>
                <span className="text-ink-300">·</span>
                <span className="font-display font-semibold text-ink-700 tracking-wide">BOG</span>
                <span className="text-ink-300">·</span>
                <span className="font-display font-semibold text-ink-700 tracking-wide">SOLO</span>
              </>
            ) : (
              <span>უსაფრთხო გადახდები · <span className="font-display font-semibold text-ink-700">მალე</span></span>
            )}
          </div>
        </div>
        {[
          { h: 'პროდუქტი', l: [
            { t: 'ექსპერტები', href: '/tutors' },
            { t: 'კატეგორიები', href: '/tutors' },
            { t: 'როგორ მუშაობს', href: '/#how' },
            { t: 'დაწყება', href: '/signup' },
          ]},
          { h: 'კომპანია', l: [
            { t: 'ჩვენ შესახებ', href: '/#about' },
            { t: 'ბლოგი', href: '/help' },
            { t: 'კარიერა', href: '/help' },
            { t: 'პრესა', href: '/help' },
            { t: 'კონტაქტი', href: 'mailto:hi@mcodne.ge' },
          ]},
          { h: 'სამართალი', l: [
            { t: 'წესები', href: '/terms' },
            { t: 'კონფიდენციალურობა', href: '/privacy' },
            { t: 'დაბრუნება', href: '/terms' },
            { t: 'FAQ', href: '/help' },
            { t: 'უსაფრთხოება', href: '/privacy' },
          ]},
        ].map((c, i) => (
          <div key={i}>
            <div className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-4">{c.h}</div>
            <ul className="space-y-2.5">
              {c.l.map(it => <li key={it.t}><a href={it.href} className="text-[13px] text-ink-700 hover:text-ink-900 inline-flex items-center min-h-[32px] py-1">{it.t}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pt-8 border-t border-ink-200 gap-4">
        <div className="text-[12px] text-ink-500">© 2026 მცოდნე. ყველა უფლება დაცულია.</div>
        <div className="flex items-center gap-3 text-[12px] text-ink-500">
          {/* Language toggle inert until i18n lands — kept as static labels */}
          <span className="text-ink-400">ქართული</span>
          <span className="text-ink-300">·</span>
          <span>თბილისი, საქართველო</span>
        </div>
      </div>
    </div>
  </footer>
)

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
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-1">{label}</div>
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
                  <img src={t.avatarUrl || initialsAvatarSvg(t.name)} alt={t.name} className="w-16 h-16 mx-auto rounded-full object-cover ring-2 ring-ink-200 mb-3" />
                  <div className="font-display text-[14px] font-bold text-ink-900 tracking-tight truncate">{t.name}</div>
                  <div className="text-[11px] text-ink-500 mt-0.5 truncate">{t.cat}</div>
                  {t.superExpert && <span className="inline-flex items-center gap-1 mt-2 px-1.5 h-5 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 font-display text-[10px] font-bold uppercase tracking-[0.14em]"><Icon.spark className="w-2.5 h-2.5" /> Super</span>}
                </div>
                <Row label="რეიტინგი" isBest={t.rating === best.rating} value={<span className="inline-flex items-center gap-1"><Icon.star className="w-3.5 h-3.5 text-warning-500" />{fmtRating(t.rating)} · {t.reviews}</span>} />
                <Row label="ჩატარდა სესია" isBest={t.sessions === best.sessions} value={<>{t.sessions.toLocaleString()}</>} />
                <Row label="ფასი"          isBest={t.price === best.price}      value={<>₾{t.price}</>} />
                <Row label="ენები"          value={<span className="text-[12px] text-ink-700 font-normal">{t.langs.join(' · ')}</span>} />
                <Row label="უახლოესი დრო"  value={<span className="text-[12px] text-ink-700 font-normal">{t.next}</span>} />
                <div className="p-3 border-t border-ink-100">
                  <button type="button" onClick={() => { onClose(); onBook(t) }} className="w-full h-10 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center justify-center gap-1.5 transition-colors">
                    დაიჯავშნე <Icon.arrow className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
    </Sheet>
  )
}

// Wrapper — useSearchParams requires a Suspense boundary in Next 15.
export default function TutorsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <Tutors />
    </Suspense>
  )
}

function Tutors() {
  const params = useSearchParams()
  const router = useRouter()
  // Hydrate from URL so /tutors?q=foo&category=business is shareable/refreshable.
  const [search, setSearch] = useState(() => params?.get('q') ?? '')
  const [sort, setSort] = useState<string>(() => params?.get('sort') ?? 'rating')
  const [page, setPage] = useState(1)
  const [liveTutors, setLiveTutors] = useState<Tutor[]>(TUTORS)
  // Start truthy so first paint (before the /api/tutors mount fetch resolves)
  // shows the skeleton, not the empty-state message.
  const [loading, setLoading] = useState(true)
  const [favIds, setFavIds] = useState<Set<string>>(new Set())
  const [signedIn, setSignedIn] = useState<boolean>(false)
  // True once the /api/me auth probe has resolved. Used to relabel the booking
  // CTA ("შესვლა & ჯავშანი") only for KNOWN-anonymous visitors, avoiding a
  // sign-in flash for authed users before the probe returns.
  const [authKnown, setAuthKnown] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [authDismissed, setAuthDismissed] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Check auth via /api/me first (always 200 with `{user: null}` for
        // anon). This avoids the console-spam 401 on /api/favorites for
        // unauthenticated visitors browsing the public tutor list.
        const meRes = await fetch('/api/me')
        if (!meRes.ok) { setSignedIn(false); return }
        const meBody = await meRes.json().catch(() => ({}))
        if (!meBody?.user) { setSignedIn(false); return }
        setSignedIn(true)
        if (cancelled) return
        const favRes = await fetch('/api/favorites')
        if (!favRes.ok || cancelled) return
        const rows = await favRes.json()
        if (Array.isArray(rows)) setFavIds(new Set(rows.map((r: any) => r.tutorId)))
      } catch {}
      finally { if (!cancelled) setAuthKnown(true) }
    })()
    return () => { cancelled = true }
  }, [])

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
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/tutors${params.toString() ? `?${params}` : ''}`)
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data)) return
      const mapped: Tutor[] = data.map((t: any, i: number) => ({
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
        // Super = verified AND consistently top-rated — same rule as the
        // detail page's "Super expert" label (verified && rating ≥ 4.8).
        superExpert: (t.verified ?? false) && (t.rating ?? 0) >= 4.8,
        nextSlotAt: t.nextSlotAt ?? null,
        consultationDurationMin: typeof t.consultationDurationMin === 'number' ? t.consultationDurationMin : TUTOR_DEFAULTS.durationMin,
        responseHours: typeof t.responseHours === 'number' ? t.responseHours : undefined,
      }))
      setLiveTutors(mapped)
    } catch {
      // keep whatever we had
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTutors('') }, [fetchTutors])

  useEffect(() => {
    const t = setTimeout(() => fetchTutors(search), 350)
    return () => clearTimeout(t)
  }, [search, fetchTutors])

  const runSearch = () => fetchTutors(search)

  /* Click-to-open video preview — opens a centered modal (no anchoring) */
  const [preview, setPreview] = useState<Tutor | null>(null)
  const openPreview = (t: Tutor) => setPreview(t)
  const closeNow = () => setPreview(null)

  /* Quick-Book popup — open without leaving page */
  const [quickBook, setQuickBook] = useState<Tutor | null>(null)
  const openBook = (t: Tutor) => {
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
      price: [num('priceMin', 0), num('priceMax', 200)],
    }
  })

  const resetFilters = () => setFilters({
    cats: [], minRate: 0, langs: [], available: [], minRating: 0, superOnly: false, price: [0, 200],
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
    const qs = url.toString()
    router.replace(qs ? `/tutors?${qs}` : '/tutors', { scroll: false })
  }, [search, sort, filters, router])

  const removeFilter = (k: string, v: string) => {
    if (k === 'cat')   setFilters({ ...filters, cats:    filters.cats.filter(x => x !== v) })
    if (k === 'lang')  setFilters({ ...filters, langs:   filters.langs.filter(x => x !== v) })
    if (k === 'avail') setFilters({ ...filters, available: filters.available.filter(x => x !== v) })
    if (k === 'rate')  setFilters({ ...filters, minRating: 0 })
    if (k === 'super') setFilters({ ...filters, superOnly: false })
    if (k === 'price') setFilters({ ...filters, price: [0, 200] })
  }

  const activeFilters: { k: string; v: string }[] = [
    ...filters.cats.map(c    => ({ k: 'cat',   v: c })),
    ...filters.langs.map(l   => ({ k: 'lang',  v: l })),
    ...filters.available.map(a => ({ k: 'avail', v: a })),
    ...(filters.minRating > 0 ? [{ k: 'rate', v: `${filters.minRating}+ ★` }] : []),
    ...(filters.superOnly ? [{ k: 'super', v: 'Super-ექსპერტი' }] : []),
    ...(filters.price[0] > 0 ? [{ k: 'price', v: `მინ. ₾${filters.price[0]}` }] : []),
  ]

  // Apply sidebar filters + sort client-side on top of the API-loaded list.
  const visibleTutors = React.useMemo(() => {
    const now = new Date()
    const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    let out = liveTutors.filter(t => {
      if (filters.superOnly && !t.superExpert) return false
      if (filters.minRating > 0 && (t.rating ?? 0) < filters.minRating) return false
      // Minimum-only price filter — no upper ceiling, so expensive experts are
      // never silently hidden.
      if (t.price < filters.price[0]) return false
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

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      <PublicTopBar activeHref="/tutors" />

      <SearchHero filters={filters} setFilters={setFilters} search={search} setSearch={setSearch} onSearch={runSearch} total={total} loading={loading} />

      <main id="main" className="max-w-[1280px] mx-auto px-6 sm:px-8 py-8 sm:py-10 lg:py-14">
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
                // Compact canon empty state — icon + one line + one action.
                // (The mailto helper card right below already covers "ask us".)
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
              ) : (
                pagedTutors.map((t, i) => <TutorCard key={t.id} idx={i} t={t} onPreviewEnter={openPreview} onBook={openBook} saved={favIds.has(t.id)} onToggleFav={toggleFav} needsSignIn={authKnown && !signedIn} />)
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
                <Icon.arrow className="w-4 h-4 mt-1 text-ink-400 group-hover:text-ink-800 group-hover:translate-x-0.5 transition-all shrink-0" />
              </a>
              <button type="button" onClick={() => setCompareOpen(true)} className="group text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-5 flex items-start gap-4">
                <span className="w-10 h-10 shrink-0 rounded-btn bg-ink-100 text-ink-700 inline-flex items-center justify-center">
                  <Icon.sliders className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight">შეადარე ტოპ 3-ი გვერდიგვერდ</div>
                  <p className="text-[12px] text-ink-600 mt-0.5 leading-snug">რეიტინგი, ფასი, სლოტები, ენები — ერთი ცხრილით.</p>
                </div>
                <Icon.arrow className="w-4 h-4 mt-1 text-ink-400 group-hover:text-ink-800 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            </div>

            <Pagination page={page} setPage={setPage} totalPages={totalPages} />
          </div>
        </div>
      </main>

      <Footer />

      {/* Tutor video preview — centered modal (16:9) */}
      {preview && <VideoPreview tutor={preview} onClose={closeNow} onBook={openBook} />}

      {/* Full Quick-Book popup — pick time, add context, pay (no profile nav) */}
      {quickBook && <QuickBookPopup tutor={quickBook} onClose={closeBook} />}

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
              <Icon.arrow className="w-4 h-4" />
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


