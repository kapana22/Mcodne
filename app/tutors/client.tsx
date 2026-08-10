'use client'
// /tutors — the browse page container. Owns the query/filter state, the
// fetch, and the layout; every piece it renders lives in a `_*.tsx` beside it.

import React, { useState, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { Link } from 'next-view-transitions'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { Container } from '@/components/Container'
import { Illustration, hasIllustration } from '@/components/Illustration'
import { frameQuestion } from '@/lib/askFraming'
import { useToast } from '@/components/ToastProvider'
import { useMe, type Me } from '@/lib/me'
import { focusSearchInput } from '@/lib/searchFocus'
import { TutorCard, VideoPreview } from './_card'
import { LiveCat, Tutor, catNameOf, mapRows } from './_data'
import { FILTER_AVAIL, FILTER_RATINGS, Facets, Filters, FiltersPanel, NO_CAP, availMatches, passesFilters, priceBandActive, priceBandLabel } from './_filters'
import { SearchHero } from './_hero'
import { CompareModal, Pagination, ResultsBar } from './_results'

const BookingFlow = dynamic(
  () => import('@/components/booking/BookingFlow').then(m => m.BookingFlow),
  { ssr: false },
)


const Logo = () => (
  <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
  </Link>
)

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

  // The admin-managed SPHERES (GET /api/categories → VISIBLE only; a sphere's
  // count and results include everything folded into it). Drives
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

  // The term the visitor actually searched for, used by the dead-end empty
  // state below. Echoed back (clipped, so a pasted paragraph can't blow up the
  // heading) and carried into /ask so the intent survives the miss.
  const searchQ = search.trim()
  const searchQEcho = searchQ.length > 40 ? `${searchQ.slice(0, 40)}…` : searchQ

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      {/* ONE header, every viewer (2026-08-08, owner: „ექსპერტებზე რომ
          გადავდივარ — იცვლება; მინდა როგორც ორიგინალში").
          A signed-in STUDENT used to get the workspace shell here instead — the
          reasoning was that they should never feel they had left their account.
          What it actually produced was a menu that changed under them: /tutors
          read მთავარი · ექსპერტები · ჯავშნები · მიმოწერა, and opening any expert
          from that very list swapped it back to ექსპერტები · კატეგორიები ·
          გახდი ექსპერტი · დახმარება. Browse and the profile it leads to are the
          same public section, so they get the same bar.
          The way back to the account was never in the nav items anyway: the Logo
          auto-routes to the viewer's role-home (a student lands on /student) and
          UserMenu carries the rest — both are in this header already.
          No `activeHref`: the lit item is DERIVED from usePathname inside
          PublicTopBar (§L). Passing it is what made the highlight go dark on
          /tutors/[slug] the last time this was reported. */}
      <PublicTopBar initialUser={initialUser} />

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
