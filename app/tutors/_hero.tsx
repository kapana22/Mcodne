'use client'
// /tutors — the search hero above the results (query box + quick facets).

import { Link } from 'next-view-transitions'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { registerSearchInput } from '@/lib/searchFocus'
import { LiveCat, catNameOf } from './_data'
import { CheckOpt, FILTER_AVAIL, FILTER_LANGS, FILTER_RATINGS, Facets, FilterBox, Filters, PriceRange, priceBandActive, priceBandLabel, toggleIn } from './_filters'

export const SearchHero = ({ filters, setFilters, search, setSearch, onSearch, total, loading, liveCats, facets }: { filters: Filters; setFilters: (f: Filters) => void; search: string; setSearch: (v: string) => void; onSearch: () => void; total: number; loading: boolean; liveCats: LiveCat[]; facets: Facets }) => {
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
  // Hidden, not dimmed, while nobody is Super (owner, 2026-08-10). A greyed-out
  // control with „0" next to it still asks to be read and still says the
  // platform has a tier it cannot fill. It comes back on its own the moment an
  // expert is featured — the switch is driven by the facet count, not a flag.
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
            {!superDead && (
            <button
              type="button"
              onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
              className={`h-12 px-4 rounded-card border font-display text-small font-bold inline-flex items-center gap-2 transition-all duration-fast ${filters.superOnly ? 'border-brand-500 bg-brand-50/40 text-brand-800 ring-1 ring-brand-200' : 'border-ink-200 hover:border-ink-300 bg-white text-ink-800'}`}
            >
              <Icon.spark className="w-4 h-4 text-ink-400" /> Super
              <span className="text-meta font-medium text-ink-500 tabular-nums">{facets.superOnly}</span>
            </button>
            )}
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
          {!superDead && (
          <button
            type="button"
            onClick={() => setFilters({ ...filters, superOnly: !filters.superOnly })}
            className={`shrink-0 h-11 px-3.5 rounded-pill border font-display text-small font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast ${filters.superOnly ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-700'}`}
          >
            <Icon.spark className="w-3.5 h-3.5 text-ink-400" /> Super
            <span className="text-meta font-medium text-ink-500 tabular-nums">{facets.superOnly}</span>
          </button>
          )}
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