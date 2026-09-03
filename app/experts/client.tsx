'use client'
// THE CATALOGUE — one container, ONE URL (/experts), one list of PEOPLE.
//
// ⚠️ IT WAS THREE PAGES (2026-08-19). Owner, four times in one day: „სერვისები
// და ექსპერტები უნდა გაერთიანდეს და პატარა გადასართავი ექნება", „მოვიფიქროთ რომ
// იდენტურია უბრალოდ და ფილტრაციასავით უნდა იყოს", „ექსპერტები და სერვისები ხო
// ერთია", and finally „სერვისები საერთოდ ხო ამოსაგდებია … ექსპერტებზე
// გადაიტანე". So /tutors, /masters and /services became ONE list at ONE address,
// and all three 308 here.
//
// ⚠️ AND ON 2026-08-24 IT BECAME ONE LIST OF ONE KIND OF ROW. Until then the
// merge was cosmetic underneath: two rosters were loaded, keyed by person and
// drawn with two different cards, and half the machinery in this file existed to
// keep them in step — a `type` axis, two predicates, a cross-kind empty state, a
// server refetch for the consultation half's trigram search, and a Quick-Compare
// that could only compare consultations. The consultation product was removed
// and its 27 people migrated into the one provider table, so all of that is
// gone. What is left is what a catalogue actually is: one array, filtered in the
// browser, written back into the URL.
//
// ⚠️ NO FETCH AT ALL NOW. The whole public roster arrives server-rendered
// (app/experts/page.tsx → queryProviders, unfiltered) and every refinement —
// including the typed query — is applied here. It used to be a `/api/tutors`
// round trip per keystroke, ranked by Postgres trigram similarity, which was
// worth it for a table this browser could not hold; the roster is one query and
// tens of rows, and a search that cannot fail on a dropped connection is better
// than a ranked one that can.

import Link from 'next/link'
import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { MobileCollapse } from '@/components/catalog/MobileCollapse'
import { useCatalogView, VIEW_CLASS } from '@/components/catalog/useCatalogView'
import { Illustration, hasIllustration } from '@/components/Illustration'
import { requestsOn } from '@/lib/requests'
import { type Me } from '@/lib/me'
import { focusSearchInput } from '@/lib/searchFocus'
import { ProviderCard } from '@/app/experts/_providerCard'
import type { ProviderRow } from '@/app/experts/_providers'
import {
  byPrice, cityLabelOf, parseCities, parseTrades, tradeLabel, matchesQuery,
} from '@/lib/catalogItems'
import {
  anyRefined, CatalogFilters, EMPTY_FILTERS, FILTER_LANGS, FILTER_RATINGS, type Facets, type Filters,
  NO_CAP, passesFilters, priceBandActive, priceBandLabel, sideFilters, VerticalSwitch,
  verticalOfTrades,
} from './_filters'
import { isVertical, type Vertical } from '@/lib/requestTopics'
import { LiveCat, catNameOf } from './_cats'
import { SearchHero } from './_hero'
import { Pagination, ResultsBar } from './_results'

/** The catalogue's one address — the URL every filter change is written back
 *  into. It was a `basePath` prop while /tutors and /masters were two entrances
 *  to this container; there is one entrance now. */
const CATALOG_PATH = '/experts'

/**
 * What the server page hands the catalogue.
 *
 * `tradeCounts` is the roster-wide count query (app/experts/_providers →
 * filterCounts), the same numbers the rail has printed since /masters.
 */
export type CatalogProps = {
  initialProviders: ProviderRow[]
  tradeCounts: { trades: Record<string, number>; cities: Record<string, number> }
  initialUser?: Me | null
  /** The intake address, or null when FEATURE_REQUESTS is off. Read ONCE in the
   *  server page so the header CTA and the empty state cannot disagree. */
  requestHref: string | null
}

// Wrapper — useSearchParams requires a Suspense boundary in Next 15.
export function CatalogClient(props: CatalogProps) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-50" />}>
      <Catalog {...props} />
    </Suspense>
  )
}

function Catalog({ initialProviders, tradeCounts, initialUser, requestHref }: CatalogProps) {
  const params = useSearchParams()
  const router = useRouter()
  // Hydrate from URL so /experts?q=foo&category=business is shareable/refreshable.
  const [search, setSearch] = useState(() => params?.get('q') ?? '')
  // NEWEST FIRST by default (owner, 2026-08-12). An explicit ?sort= still wins.
  //
  // It was 'rating' — a curated verified→rating order that ranked on signal this
  // catalogue does not have: measured that day, ONE of 21 visible people was
  // verified and NONE had a single review. Sorting by two fields that are
  // constant across the roster is not a recommendation, it is an arbitrary but
  // STABLE order — and a stable order means somebody new lands wherever the seed
  // put them and stays there. Newest-first at least answers a question truthfully.
  const [sort, setSort] = useState<string>(() => params?.get('sort') ?? 'new')
  const [page, setPage] = useState(1)
  // Arriving from the site-wide `/` or ⌘K pressed on a page with no search box:
  // land here with the cursor already in the field.
  useEffect(() => {
    if (params?.get('focus') !== 'search') return
    const t = window.setTimeout(() => focusSearchInput(), 0)
    return () => window.clearTimeout(t)
  }, [params])

  /* The reader's layout choice — stored under one key
     (components/catalog/useCatalogView). The container class and the card's own
     geometry both come from it, so they cannot disagree. */
  const [view, setView] = useCatalogView()

  const [filters, setFilters] = useState<Filters>(() => {
    const p = params
    const csv = (k: string) => (p?.get(k) ?? '').split(',').filter(Boolean)
    const num = (k: string, def: number) => {
      const raw = p?.get(k)
      if (raw == null || raw === '') return def
      const v = Number(raw)
      return Number.isFinite(v) ? v : def
    }
    // Backward-compat: external links (breadcrumbs, the similar rail, the home
    // grid) still point at /experts?category=<slug>. `cats` holds SLUGS too, so
    // the deep-link slug seeds straight in.
    const seedCats = csv('cats')
    const catParam = p?.get('category')
    if (catParam && catParam !== 'all' && !seedCats.includes(catParam)) {
      seedCats.push(catParam)
    }
    // ⚠️ `?for=service` IS THE SAME DOOR THE INTAKE READS (app/request/page →
    // the owner's option „ა", 2026-08-18): same parameter, same vocabulary,
    // same fallback, so the link that opens the everyday catalogue and the link
    // that opens the everyday request form are spelled the same way. It was
    // briefly `?vertical=SERVICE` — a second name for a door the site already
    // had.
    const forParam = (p?.get('for') ?? '').trim().toUpperCase()
    const trades = parseTrades(p?.get('trade'))
    return {
      // An explicit `?for=` wins; otherwise a pre-switch `?trade=` link is read
      // for the side it is obviously asking about (every /experts?trade=… link
      // ever sent predates the switch); otherwise the professional side, which
      // is what the site leads with.
      vertical: isVertical(forParam) ? forParam : (verticalOfTrades(trades) ?? EMPTY_FILTERS.vertical),
      cats: seedCats,
      langs: csv('langs'),
      minRating: num('minRating', 0),
      price: [num('priceMin', 0), num('priceMax', NO_CAP)] as [number, number],
      // ⚠️ THE SAME PARAMETER NAMES /experts HAS ALWAYS USED. `?trade=` still
      // takes a group id or a topic id in one list and `?city=` still takes city
      // ids, so every /experts?trade=… link ever sent keeps working.
      trades,
      cities: parseCities(p?.get('city')),
    }
  })

  /* THE RAIL'S FOLD, OWNED HERE (2026-09-01). The trigger is in the results
     header and the panel is in the rail column, so the boolean cannot live in
     either — one state, two places that render it, no way for them to disagree.
     Ignored from `lg`, where the panel is always drawn.

     ⚠️ ARRIVING ON A NARROWED VIEW OPENS IT, and it is the INITIAL value rather
     than an effect: somebody who followed „ელექტრიკოსი თბილისში" should see
     what is ticked without a tap, and re-opening it on every later change would
     fight the reader who just closed it after choosing something. `anyRefined`
     is the same question the fold's own `useState(activeCount > 0)` asked
     before the button moved. */
  const [filtersOpen, setFiltersOpen] = useState(() => anyRefined(filters))

  /* ONE LIST OF PEOPLE. Not refetched, not paged on the server: this is the
     whole public roster (app/experts/_providers → queryProviders with no filter,
     the VISIBLE rule untouched) and the browser narrows it. */
  const providers = React.useMemo(() => initialProviders ?? [], [initialProviders])

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
  const resultsRef = React.useRef<HTMLDivElement | null>(null)
  const skipFirstScroll = React.useRef(true)

  // …EXCEPT ON THE WAY BACK. Measured 2026-08-02: scroll /experts to y=1600,
  // open a card, press Back → AppShell restores 1600 correctly and this effect
  // then dragged the reader to y=253. `skipFirstScroll` guards only the very
  // first run; the restore is still settling when a later run fires, so one
  // guard was never enough. Ask the browser what kind of navigation this is —
  // the same question components/AppShell.tsx asks, and it has to be asked from
  // the navigation TYPE as well as from `popstate`: a back that reloads the
  // document (bfcache miss, restored tab) fires popstate before React mounts.
  //
  // Stored as a TIMESTAMP, not a boolean: a boolean consumed by „the next effect
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

  useEffect(() => {
    if (skipFirstScroll.current) { skipFirstScroll.current = false; return }
    if (Date.now() - (backAtRef.current ?? 0) < BACK_QUIET_MS) return
    const el = resultsRef.current
    if (!el || typeof window === 'undefined') return
    const top = el.getBoundingClientRect().top + window.scrollY - 12
    if (window.scrollY > top + 4) window.scrollTo({ top, behavior: 'smooth' })
  }, [filters, sort, page])

  const runSearch = () => {
    // The list is already narrowed as they type; the button's job is to take
    // them to the results, which is the one thing the keystroke handler must not
    // do — moving the page while somebody types is worse than not moving.
    const el = resultsRef.current
    if (!el || typeof window === 'undefined') return
    const top = el.getBoundingClientRect().top + window.scrollY - 12
    if (window.scrollY > top + 4) window.scrollTo({ top, behavior: 'smooth' })
  }

  // Reset returns the page to what the address alone shows: everybody ON THIS
  // SIDE. Clearing your filters means „show me all of these", never „send me to
  // the other half of the site" — the switch is the axis, not a refinement, and
  // „ფილტრის მოხსნა" does not count it (see `filterCount`).
  const resetFilters = () => setFilters({ ...EMPTY_FILTERS, price: [0, NO_CAP], vertical: filters.vertical })

  // ⚠️ ONE FUNCTION FOR THE ACT AND FOR THE NUMBER ON IT (app/experts/_filters
  // → sideFilters): pressing a segment drops the other side's picks, and the
  // count printed on that segment is measured through the same drop, so a
  // segment cannot promise 4 and hand back 0.
  const setVertical = (v: Vertical) => setFilters(sideFilters(filters, v))

  // The admin-managed CATEGORIES (GET /api/categories → VISIBLE only). Starts empty
  // → the sphere filter is hidden until this resolves (and stays hidden if the
  // fetch fails), so we never show a dead/unmatched chip.
  const [liveCats, setLiveCats] = useState<LiveCat[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: LiveCat[]) => {
        if (cancelled || !Array.isArray(rows)) return
        // Offer only categories that actually have somebody visible — an option
        // that can only return zero results is a dead end. A deep-linked
        // ?category= still works: the seed above is independent of this list.
        setLiveCats(rows
          .filter(r => r && r.slug && r.name && r.browsable !== false && (r.expertCount ?? 0) > 0)
          .map(r => ({ id: r.id, slug: r.slug, name: r.name, expertCount: r.expertCount })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Keep the URL in sync with all filter state so refresh + share work.
  useEffect(() => {
    const url = new URLSearchParams()
    if (search.trim()) url.set('q', search.trim())
    // Only non-default sorts land in the URL — 'new' IS the default. This MUST
    // track the useState initializer above; when the two disagreed the default
    // sort was written into every URL as if the user had chosen it.
    if (sort !== 'new') url.set('sort', sort)
    // Only the non-default side lands in the address, for the same reason the
    // default sort does not: a parameter the visitor never chose reads as one
    // they did.
    if (filters.vertical !== EMPTY_FILTERS.vertical) url.set('for', filters.vertical.toLowerCase())
    if (filters.cats.length > 0) url.set('cats', filters.cats.join(','))
    if (filters.langs.length > 0) url.set('langs', filters.langs.join(','))
    if (filters.minRating > 0) url.set('minRating', String(filters.minRating))
    if (filters.price[0] > 0) url.set('priceMin', String(filters.price[0]))
    if (filters.price[1] < NO_CAP) url.set('priceMax', String(filters.price[1]))
    if (filters.trades.length > 0) url.set('trade', filters.trades.join(','))
    if (filters.cities.length > 0) url.set('city', filters.cities.join(','))
    const qs = url.toString()
    router.replace(qs ? `${CATALOG_PATH}?${qs}` : CATALOG_PATH, { scroll: false })
  }, [search, sort, filters, router])

  const removeFilter = (k: string, v: string) => {
    // The typed query is a refinement like any other, so it is removable like
    // any other. It used to be the page's h1 instead — the largest type on the
    // page given to a string the visitor had just typed, and the only way to
    // undo it was to find the field and clear it by hand.
    if (k === 'q')     setSearch('')
    if (k === 'cat')   setFilters({ ...filters, cats:   filters.cats.filter(x => x !== v) })
    if (k === 'lang')  setFilters({ ...filters, langs:  filters.langs.filter(x => x !== v) })
    if (k === 'rate')  setFilters({ ...filters, minRating: 0 })
    if (k === 'price') setFilters({ ...filters, price: [0, NO_CAP] })
    if (k === 'trade') setFilters({ ...filters, trades: filters.trades.filter(x => x !== v) })
    if (k === 'city')  setFilters({ ...filters, cities: filters.cities.filter(x => x !== v) })
  }

  // `raw` carries the value removeFilter needs (the SLUG for categories), while
  // `v` is the human label shown on the chip (the category NAME). For every
  // other filter the two coincide.
  const activeFilters: { k: string; v: string; raw?: string }[] = [
    // FIRST, because it is the refinement the visitor made most deliberately —
    // they typed it. Quoted so „ბუღალტერი" reads as their words rather than as
    // a label we chose.
    ...(search.trim() ? [{ k: 'q', v: `„${search.trim()}“` }] : []),
    ...filters.cats.map(slug => ({ k: 'cat', v: catNameOf(liveCats, slug), raw: slug })),
    ...filters.langs.map(l => ({ k: 'lang', v: l })),
    ...(filters.minRating > 0 ? [{ k: 'rate', v: `${filters.minRating}+ ★` }] : []),
    ...(priceBandActive(filters.price[0], filters.price[1]) ? [{ k: 'price', v: priceBandLabel(filters.price[0], filters.price[1]) }] : []),
    ...filters.trades.map(id => ({ k: 'trade', v: tradeLabel(id), raw: id })),
    ...filters.cities.map(id => ({ k: 'city', v: cityLabelOf(id), raw: id })),
  ]

  // The refinements the RAIL owns — everything except the typed query, which
  // lives in the search field and undoes itself through its own chip.
  const filterCount = activeFilters.filter(f => f.k !== 'q').length

  /* THE TYPED QUERY, over the words on the card itself (lib/catalogItems →
     matchesQuery). This pool is also what the facet counts are measured
     against, so a number beside an option means „matches", not „exists". */
  const queryPool = React.useMemo(() => {
    const q = search.trim()
    if (!q) return providers
    return providers.filter(m => matchesQuery(m, q))
  }, [providers, search])

  // Apply the rail's filters + sort on top of the pool.
  const visible = React.useMemo(() => {
    // `passesFilters` (app/experts/_filters) is the ONE predicate — the facet
    // counts below call the same function with a dimension skipped.
    let out = queryPool.filter(m => passesFilters(m, filters))
    switch (sort) {
      // „ახლის მიხედვით" — THE DEFAULT. An unparseable date sorts last.
      case 'new':     out = [...out].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)); break
      // „ჩვენი რჩევით" — the ADMIN'S PICKS first, then the server's order
      // (oldest first, as the roster has always been listed).
      //
      // ⚠️ IT READ NOTHING UNTIL 2026-08-25 and simply `break`-ed, which meant
      // „our recommendation" was „whatever order the query returned". Meanwhile
      // `featured` was a column, an index and a button in the admin panel that
      // changed nothing anywhere — an editorial lever wired to a dead end. This
      // is the one place it belongs: a recommendation is an ORDER, never a badge
      // on the card, because a badge would sell a placement as a credential.
      //
      // A STABLE sort, so two featured providers keep the roster's own order
      // between them rather than an arbitrary one.
      case 'rating':
        out = out
          .map((m, i) => ({ m, i }))
          .sort((a, b) => (Number(b.m.featured) - Number(a.m.featured)) || (a.i - b.i))
          .map(x => x.m)
        break
      // ⚠️ SOMEBODY WHO QUOTES PER JOB SORTS LAST IN BOTH DIRECTIONS rather
      // than posing as ₾0 — see byPrice. A missing price is not a cheap one.
      case 'price-a': out = [...out].sort(byPrice(1)); break
      case 'price-d': out = [...out].sort(byPrice(-1)); break
    }
    return out
  }, [queryPool, filters, sort])

  // Per-option counts, each measured with its OWN dimension excluded — so
  // „4.0+ (0)" and „ინგლისური (2)" can be true at the same time.
  const facets = React.useMemo<Facets>(() => {
    const ratingBase = queryPool.filter(m => passesFilters(m, filters, 'rating'))
    const rating: Record<string, number> = {}
    for (const r of FILTER_RATINGS) rating[String(r)] = ratingBase.filter(m => m.rating >= r).length
    const langBase = queryPool.filter(m => passesFilters(m, filters, 'lang'))
    const langs: Record<string, number> = {}
    for (const l of FILTER_LANGS) langs[l.l] = langBase.filter(m => m.langs.includes(l.l)).length
    return {
      rating,
      langs,
      pool: langBase.length,
      // ⚠️ ROSTER-WIDE, and NOT narrowed by the other refinements — a row that
      // read „სამართალი (0)" the moment somebody ticked a city would be telling
      // the reader the site has nobody. Same argument app/experts/_providers →
      // filterCounts writes down.
      trades: tradeCounts.trades,
      cities: tradeCounts.cities,
    }
  }, [queryPool, filters, tradeCounts])

  /* WHAT EACH SEGMENT WOULD ACTUALLY HAND BACK.
     Measured through `sideFilters`, the same function the press runs, and with
     the side's own dimension excluded — standard facet semantics, and the one
     number that makes the switch honest about a side the roster has not
     reached yet (0 of 23 on the everyday side, 2026-09-01). */
  const sideCounts = React.useMemo(() => {
    const count = (v: Vertical) =>
      queryPool.filter(m => passesFilters(m, sideFilters(filters, v))).length
    return { EXPERT: count('EXPERT'), SERVICE: count('SERVICE') }
  }, [queryPool, filters])

  /* Is there anybody at all on this side, before any refinement? „NOBODY YET"
     and „NOBODY LIKE THAT" are different answers needing different screens, and
     since the switch exists the first one is a question about a SIDE rather
     than about the roster — the roster is never empty while the other side has
     23 people in it. */
  const sidePool = React.useMemo(
    () => providers.filter(m => m.verticals.includes(filters.vertical)),
    [providers, filters.vertical],
  )

  const total = visible.length
  // 8 split a 9-person roster into „გვერდი 1 / 2" with ONE card on page two —
  // pagination that exists only to announce how short the list is. 24 is four
  // rows of the 2-up grid: it keeps the whole roster on one page at today's size
  // while still capping the DOM if the catalogue grows.
  const PER_PAGE = 24
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  // Any change to the result set sends the reader back to page 1 so they do not
  // land mid-way through a different list.
  useEffect(() => { setPage(1) }, [filters, search, sort])
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [totalPages, page])
  const paged = visible.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // The term the visitor actually searched for, echoed back by the dead-end
  // empty state (clipped, so a pasted paragraph cannot blow up the heading) and
  // carried into the request wizard so the intent survives the miss.
  const searchQ = search.trim()
  const searchQEcho = searchQ.length > 40 ? `${searchQ.slice(0, 40)}…` : searchQ

  return (
    <div className="font-sans bg-ink-50 text-ink-900 antialiased">
      {/* ONE header, every viewer (2026-08-08, owner: „ექსპერტებზე რომ
          გადავდივარ — იცვლება; მინდა როგორც ორიგინალში"). Browse and the profile
          it leads to are the same public section, so they get the same bar.
          No `activeHref`: the lit item is DERIVED from usePathname inside
          PublicTopBar. */}
      <PublicTopBar initialUser={initialUser} />

      {/* ⚠️ THE FIELD IS THE BAND'S NOW (2026-08-31, the owner's design canvas
          → Catalogue). It was in <ResultsBar>; see that file for why the home
          page's hero handing a typed query to this page is what settled it. */}
      <SearchHero
        filters={filters}
        total={total}
        liveCats={liveCats}
        search={search}
        setSearch={setSearch}
        onSearch={runSearch}
      />

      {/* ⚠️ `min-w-0` ON BOTH TRACKS, AND WITHOUT IT THE PAGE SCROLLS SIDEWAYS
          AT 390px. A grid item's default `min-width` is `auto`, not 0 — so a
          `1fr` track will not shrink below its content's intrinsic width, and
          one long name or one untruncatable chip pushes the whole column past
          the viewport. It is invisible until somebody opens a phone, and it has
          already been caught once here. */}
      <Container as="main" id="main" className="py-8 sm:py-10 pb-14 sm:pb-20">
        <div className="grid gap-8 lg:grid-cols-[264px_minmax(0,1fr)] items-start">
          <div className="min-w-0">
            {/* ⚠️ THE SWITCH IS ABOVE THE FOLD-AWAY RAIL, NOT INSIDE IT
                (2026-09-01). Owner: „ორი მთავარი კატეგორია … მინდა იყოს
                გადამრთველი, რომ არევა არ მოხდეს ამათი და კომფორტულად იყოს."
                Below `lg` the panel collapses behind a „ფილტრი" button, and the
                axis of the whole catalogue cannot be a thing you open the
                filters to find. One instance, one piece of state, every width. */}
            <div className="mb-3">
              <VerticalSwitch value={filters.vertical} onChange={setVertical} counts={sideCounts} />
            </div>
            <MobileCollapse panelId="catalog-filter-panel" open={filtersOpen}>
              <CatalogFilters
                filters={filters}
                setFilters={setFilters}
                liveCats={liveCats}
                facets={facets}
                activeCount={filterCount}
                onReset={resetFilters}
                requestHref={requestHref}
              />
            </MobileCollapse>
          </div>
          {/* Anchor for the „take me to the new results" scroll above. */}
          <div ref={resultsRef} className="min-w-0">
            <ResultsBar
              total={total}
              loading={false}
              sort={sort}
              setSort={setSort}
              view={view}
              setView={setView}
              activeFilters={activeFilters}
              removeFilter={removeFilter}
              onReset={resetFilters}
              /* The trigger counts FILTERS, not the typed query: the query is
                 not in the rail, so neither the badge nor „ფილტრის მოხსნა" may
                 claim to undo it. */
              filters={{ panelId: 'catalog-filter-panel', open: filtersOpen, onToggle: () => setFiltersOpen(o => !o), count: filterCount }}
            />

            <div className="relative">
              {visible.length === 0 ? (
                // THREE distinct dead ends, and they need different exits:
                //
                //   a) the SEARCH matched nothing. „ფილტრების გასუფთავება" is a
                //      no-op here — the filters never ran — so it would strand
                //      the visitor. This is also the most valuable moment on the
                //      site: they just named somebody we do not have. Carry the
                //      query into the request wizard so the intent is captured
                //      instead of lost.
                //   b) a COLD marketplace (nobody listed at all, no query).
                //   c) the filters killed a non-empty result set → offer reset.
                searchQ && queryPool.length === 0 ? (
                  <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                    <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-100 text-ink-500 mb-3">
                      <Icon.search className="w-5 h-5" />
                    </div>
                    <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">
                      „{searchQEcho}“ — ექსპერტი ვერ ვიპოვეთ
                    </div>
                    {/* Honest: we promise a reply, NOT a match. */}
                    {requestsOn() && (
                      <>
                        <p className="text-small text-ink-500 mt-1.5 max-w-[380px] mx-auto leading-snug">
                          დაწერე, რა გჭირდება — გავეცნობით და მოგწერთ.
                        </p>
                        <a
                          href={`/request?q=${encodeURIComponent(searchQ.slice(0, 200))}`}
                          className="mt-4 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast"
                        >
                          აღწერე, რა გჭირდება
                        </a>
                      </>
                    )}
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
                ) : sidePool.length === 0 ? (
                  <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                    {/* The drawing arrived on 2026-09-03 (the owner's icon
                        standard names this screen); `hasIllustration` is what
                        kept the grey disc here until it did, and it stays as
                        the guard so this state can never degrade to a bare
                        heading if the file is ever pulled. */}
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
                      ჯერ არავინ არის სიაში
                    </div>
                    <p className="text-small text-ink-500 mt-1.5 max-w-[360px] mx-auto leading-snug">
                      აღწერე, რა გჭირდება — და მოგწერთ.
                    </p>
                    {/* ⚠️ BEHIND THE FLAG. `requestsOn()` is checked here rather
                        than inherited: a deployment with the subsystem off must
                        not grow a link to a 404. */}
                    {requestsOn() && (
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        {/* ⚠️ <Link>, NEVER <a>, FOR A ROUTE INSIDE THIS APP
                            (2026-08-30). Owner: „ხანდახან დილეი აქვს, ნახევარს
                            ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება." An <a>
                            throws the whole document away and boots React
                            again — the chrome redraws, every client probe
                            re-runs, and the page assembles in front of the
                            reader. eslint had been calling this one an ERROR
                            (`no-html-link-for-pages`) the whole time. */}
                        <Link
                          href="/request"
                          className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast"
                        >
                          აღწერე, რა გჭირდება
                        </Link>
                      </div>
                    )}
                  </div>
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
                // THE CONTAINER IS THE SHELL'S JOB, THE CARD IS THE CARD'S.
                // `VIEW_CLASS` writes the two layouts once
                // (components/catalog/useCatalogView): `grid` is 1-up on mobile
                // and 2-up from sm; `list` is one full-width row each. The same
                // `view` goes to the card so its own geometry agrees with the
                // box it is in.
                <div className={VIEW_CLASS[view]}>
                  {paged.map(m => (
                    <ProviderCard key={m.id} m={m} view={view} />
                  ))}
                </div>
              )}
            </div>

            {/* Helper strip — placed BEFORE pagination so it is actually seen */}
            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('ექსპერტის მოთხოვნა')}`} className="group text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-5 flex items-start gap-4">
                <span className="w-10 h-10 shrink-0 rounded-btn bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                  <Icon.spark className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-body font-bold text-ink-900 tracking-tight">ვერ იპოვე შესაფერისი?</div>
                  <p className="text-meta text-ink-600 mt-0.5 leading-snug">მოგვწერე — გავეცნობით და მოგწერთ.</p>
                </div>
              </a>
            </div>

            <Pagination page={page} setPage={setPage} totalPages={totalPages} />
          </div>
        </div>
      </Container>

      <Footer />
    </div>
  )
}
