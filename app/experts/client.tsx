'use client'
// THE CATALOGUE — one container, ONE URL (/experts), one list of PEOPLE.
//
// ⚠️ IT WAS THREE PAGES (2026-08-19). Owner, four times in one day: „სერვისები
// და ექსპერტები უნდა გაერთიანდეს და პატარა გადასართავი ექნება", „მოვიფიქროთ რომ
// იდენტურია უბრალოდ და ფილტრაციასავით უნდა იყოს", „ექსპერტები და სერვისები ხო
// ერთია — ექსპერტს აქვს სერვისი რეალურად და პარალელურად აკეთებს
// კონსულტაციასაც. მთელი პრინციპი ეს იყო", and finally „სერვისები საერთოდ ხო
// ამოსაგდებია … ექსპერტებზე გადაიტანე".
//
// So /tutors (consultations), /masters (trades) and /services (the trades door)
// became ONE list at ONE address, and the first two 308 here along with the
// third. There is no `preset` and no `basePath` left: the page opens on
// everybody and `?type=` narrows it, so a half-view („/experts?type=WORK") is
// still a link somebody can send and Back still walks through them.
//
// ⚠️ THE LIST IS KEYED ON THE PERSON, NOT ON THE ROW — see lib/catalogItems.
// Somebody who offers both halves is ONE card carrying both labels.
//
// Owns the query/filter state, the fetch, and the layout; every piece it
// renders lives in a `_*.tsx` beside it (the job half's card and model are
// `_masterCard` / `_masterData`, which moved here from app/masters when that
// folder went; the card keeps its own footer and its own „პროფილი" CTA).

import React, { useState, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { Link } from 'next-view-transitions'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { MobileCollapse } from '@/components/catalog/MobileCollapse'
import { useCatalogView, VIEW_CLASS } from '@/components/catalog/useCatalogView'
import { Illustration, hasIllustration } from '@/components/Illustration'
import { frameQuestion } from '@/lib/askFraming'
import { requestsOn } from '@/lib/requests'
import { useToast } from '@/components/ToastProvider'
import { useMe, type Me } from '@/lib/me'
import { focusSearchInput } from '@/lib/searchFocus'
import { MasterCard } from '@/app/experts/_masterCard'
import type { MasterRow } from '@/app/experts/_masterData'
import { CAPABILITIES } from '@/lib/capabilities'
import {
  KIND_LABEL, byPrice, cityLabelOf, parseCities, parseTrades, resolveTypes,
  toCatalogItems, tradeLabel, typeParam, workMatchesQuery, type CatalogItem,
} from '@/lib/catalogItems'

/** The catalogue's one address — the URL every filter change is written back
 *  into. It was a `basePath` prop while /tutors and /masters were two entrances
 *  to this container; there is one entrance now. */
const CATALOG_PATH = '/experts'
import { TutorCard, VideoPreview } from './_card'
import { LiveCat, Tutor, catNameOf, mapRows } from './_data'
import { FILTER_LANGS, FILTER_RATINGS, Facets, Filters, NO_CAP, TutorFilters, consultRefined, passesFilters, priceBandActive, priceBandLabel, workRefined } from './_filters'
import { SearchHero } from './_hero'
import { CompareModal, Pagination, ResultsBar } from './_results'
import { ROLE } from '@/lib/roles'

const BookingFlow = dynamic(
  () => import('@/components/booking/BookingFlow').then(m => m.BookingFlow),
  { ssr: false },
)


const Logo = () => (
  <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
  </Link>
)

/**
 * What the server page hands the catalogue.
 *
 * BOTH halves are loaded SERVER-side — there is one list, so the page may not
 * open on half of it. `tradeCounts` is the job side's roster-wide count query
 * (app/experts/_masterData → filterCounts), the same numbers the rail has
 * printed since /masters.
 */
export type CatalogProps = {
  initialTutors: any[]
  initialMasters: MasterRow[]
  tradeCounts: { trades: Record<string, number>; cities: Record<string, number> }
  initialUser?: Me | null
  /** The intake address, or null when FEATURE_REQUESTS is off. Read ONCE in the
   *  server page so the header CTA and the empty state cannot disagree. */
  requestHref: string | null
}

// Wrapper — useSearchParams requires a Suspense boundary in Next 15. The
// server page (app/experts/page.tsx) renders this with the SSR-seeded lists.
export function CatalogClient(props: CatalogProps) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <Catalog {...props} />
    </Suspense>
  )
}

function Catalog({ initialTutors, initialMasters, tradeCounts, initialUser, requestHref }: CatalogProps) {
  const params = useSearchParams()
  const router = useRouter()
  // Hydrate from URL so /experts?q=foo&category=business is shareable/refreshable.
  const [search, setSearch] = useState(() => params?.get('q') ?? '')
  // NEWEST FIRST by default (owner, 2026-08-12). An explicit ?sort= still wins,
  // and a free-text search still defers to relevance — see the `case 'new'`
  // note below, which is the guard that makes this safe.
  //
  // It was 'rating' — the server's curated verified→rating order. That order
  // ranks on signal this catalogue does not have yet: measured the same day,
  // ONE of 21 visible experts is verified and NONE has a single review. So
  // „ჩვენი რჩევით" was sorting by two fields that are constant across almost
  // the whole roster, which is not a recommendation, it is an arbitrary but
  // STABLE order — and a stable order means a new expert lands wherever the
  // seed put them and stays there. Newest-first at least answers a question
  // („who is new here") truthfully. Revisit when reviews exist: at that point
  // the curated order starts carrying real information and should probably
  // take the default back.
  const [sort, setSort] = useState<string>(() => params?.get('sort') ?? 'new')
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
  const viewerCantFav = !!(viewerRoleForBook && viewerRoleForBook !== ROLE.CLIENT)
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
      // category detection (lib/askFraming) and show that category's experts instead.
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

  // …EXCEPT ON THE WAY BACK. Measured 2026-08-02: scroll /experts to y=1600,
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
      router.push(`/experts/${t.slug || t.id}?rebook=1`)
      return
    }
    setQuickBook(t)
  }
  const closeBook = () => setQuickBook(null)

  /* Quick-Compare modal */
  const [compareOpen, setCompareOpen] = useState(false)

  /* The reader's layout choice — one preference for BOTH catalogues, stored
     under one key (components/catalog/useCatalogView). The container class and
     the card's own geometry both come from it, so they cannot disagree. */
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
    // Backward-compat: external links (breadcrumbs, SimilarExperts, the home
    // grid) still point at /experts?category=<slug>. `cats` now holds SLUGS too,
    // so the deep-link slug seeds straight in — no name lookup needed.
    const seedCats = csv('cats')
    const catParam = p?.get('category')
    if (catParam && catParam !== 'all' && !seedCats.includes(catParam)) {
      seedCats.push(catParam)
    }
    return {
      // ⚠️ EVERYTHING, UNLESS `?type=` SAYS OTHERWISE. A parameter we cannot
      // read falls back to the whole list rather than to an empty page
      // (lib/catalogItems → resolveTypes).
      types: resolveTypes(p?.get('type')),
      cats: seedCats,
      minRate: 0,
      langs: csv('langs'),
      minRating: num('minRating', 0),
      superOnly: p?.get('super') === '1',
      price: [num('priceMin', 0), num('priceMax', NO_CAP)],
      // ⚠️ THE SAME PARAMETER NAMES /experts HAS ALWAYS USED. `?trade=` still
      // takes a group id or a topic id in one list and `?city=` still takes city
      // ids, so every /experts?trade=… link ever sent keeps working — the only
      // change is who resolves them (the browser now, over one loaded list).
      trades: parseTrades(p?.get('trade')),
      cities: parseCities(p?.get('city')),
    }
  })

  /* ⚠️ ONE LIST OF PEOPLE, BUILT ONCE. The job side is not refetched — it is
     the whole public roster (app/experts/_masterData → queryMasters with no filter,
     the VISIBLE rule untouched) and the browser narrows it, exactly as the
     consultation side has always worked. `mapRows` runs on the consultation
     rows first because a search replaces them. */
  const masters = React.useMemo(() => initialMasters ?? [], [initialMasters])
  const items = React.useMemo(() => toCatalogItems(liveTutors, masters), [liveTutors, masters])

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

  // Reset returns the page to what the address alone shows: EVERYBODY. It used
  // to return to the URL's own preset, because /masters with its filters
  // cleared was still the trades catalogue — there is one address now, so
  // „clear" and „the page I opened" are the same state.
  const resetFilters = () => setFilters({
    types: [...CAPABILITIES],
    cats: [], minRate: 0, langs: [], minRating: 0, superOnly: false, price: [0, NO_CAP],
    trades: [], cities: [],
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
        //
        // `browsable` is checked as well as the count, and not as a belt: the
        // endpoint now also returns the spheres that are hidden BECAUSE they
        // have nobody yet (so the application can offer them — somebody has to
        // be first). Their count is zero today, so the count alone would filter
        // them out; relying on that would make this correct by coincidence.
        setLiveCats(rows
          .filter(r => r && r.slug && r.name && r.browsable !== false && (r.expertCount ?? 0) > 0)
          .map(r => ({ id: r.id, slug: r.slug, name: r.name, expertCount: r.expertCount })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Keep URL in sync with all filter state so refresh + share work.
  //
  // ⚠️ ONE ADDRESS, AND THE WHOLE SELECTION LANDS IN IT. The type is a
  // parameter like every other refinement, so „/experts?type=WORK" is a link
  // somebody can send and Back walks through — and it stays silent while both
  // halves are shown, which is what the bare address already means (the same
  // rule `sort` follows for its default).
  useEffect(() => {
    const url = new URLSearchParams()
    if (search.trim()) url.set('q', search.trim())
    const type = typeParam(filters.types)
    if (type) url.set('type', type)
    // Only non-default sorts land in the URL — 'new' IS the default.
    // This MUST track the useState initializer above; when the two disagreed the
    // default sort was written into every URL as if the user had chosen it.
    if (sort !== 'new') url.set('sort', sort)
    // Categories live entirely in `cats` now (the hero chips write here too),
    // so there is no separate `category` param to keep in sync.
    if (filters.cats.length > 0) url.set('cats', filters.cats.join(','))
    if (filters.langs.length > 0) url.set('langs', filters.langs.join(','))
    if (filters.minRating > 0) url.set('minRating', String(filters.minRating))
    if (filters.superOnly) url.set('super', '1')
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
    if (k === 'cat')   setFilters({ ...filters, cats:    filters.cats.filter(x => x !== v) })
    if (k === 'lang')  setFilters({ ...filters, langs:   filters.langs.filter(x => x !== v) })
    if (k === 'rate')  setFilters({ ...filters, minRating: 0 })
    if (k === 'super') setFilters({ ...filters, superOnly: false })
    if (k === 'price') setFilters({ ...filters, price: [0, NO_CAP] })
    if (k === 'trade') setFilters({ ...filters, trades:  filters.trades.filter(x => x !== v) })
    if (k === 'city')  setFilters({ ...filters, cities:  filters.cities.filter(x => x !== v) })
  }

  // `raw` carries the value removeFilter needs (the SLUG for categories), while
  // `v` is the human label shown on the chip (the category NAME). For every other
  // filter the two coincide.
  const activeFilters: { k: string; v: string; raw?: string }[] = [
    // FIRST, because it is the refinement the visitor made most deliberately —
    // they typed it. Quoted so „ბუღალტერი" reads as their words rather than as
    // a label we chose.
    ...(search.trim() ? [{ k: 'q', v: `„${search.trim()}“` }] : []),
    ...filters.cats.map(slug  => ({ k: 'cat',   v: catNameOf(liveCats, slug), raw: slug })),
    ...filters.langs.map(l   => ({ k: 'lang',  v: l })),
    // `v` is what the chip PRINTS, so it must be the Georgian label — the raw
    // id („today“) leaked onto the chip while the hero dropdown showed „დღეს“.
    ...(filters.minRating > 0 ? [{ k: 'rate', v: `${filters.minRating}+ ★` }] : []),
    ...(filters.superOnly ? [{ k: 'super', v: 'Super-ექსპერტი' }] : []),
    ...(priceBandActive(filters.price[0], filters.price[1]) ? [{ k: 'price', v: priceBandLabel(filters.price[0], filters.price[1]) }] : []),
    // The job half's two refinements, undoable at every width like the rest.
    // The TYPE gets no chip: it always has a value (unticking the last one turns
    // both on), so a chip whose „×" cannot clear it would be a control that
    // lies about what it does.
    ...filters.trades.map(id => ({ k: 'trade', v: tradeLabel(id), raw: id })),
    ...filters.cities.map(id => ({ k: 'city',  v: cityLabelOf(id), raw: id })),
  ]

  // The refinements the RAIL owns — everything except the typed query, which
  // lives in the search field and undoes itself through its own chip. The TYPE
  // counts only when it NARROWS: both halves ticked is the page you asked for,
  // not „one filter applied".
  const filterCount = activeFilters.filter(f => f.k !== 'q').length +
    (typeParam(filters.types) ? 1 : 0)

  /* ⚠️ THE TYPED QUERY, APPLIED TO THE HALF THE SERVER COULD NOT SEARCH. The
     consultation rows in `items` are already the search result (lib/tutorsQuery
     ranks them by Georgian trigram similarity in Postgres); the job half has no
     such index and six rows do not justify building one, so it is matched here
     over the words on its own card (lib/catalogItems → workMatchesQuery). This
     pool is also what the type counts are measured against, so „სამუშაო (2)"
     during a search means two matches, not two masters. */
  const queryPool = React.useMemo(() => {
    const q = search.trim()
    if (!q) return items
    return items.filter(i => i.consult !== null || (i.work !== null && workMatchesQuery(i.work, q)))
  }, [items, search])

  // Apply sidebar filters + sort client-side on top of the loaded list.
  const visibleItems = React.useMemo(() => {
    // `passesFilters` (app/experts/_filters) is the ONE predicate — the facet
    // counts below call the same function with a dimension skipped.
    let out = queryPool.filter(i => passesFilters(i, filters))
    switch (sort) {
      // „ახლის მიხედვით" — THE DEFAULT (again, 2026-08-12). Newest first. The
      // server order is
      // verified→rating, which buries brand-new experts — so sort explicitly by
      // createdAt desc. Rows without a createdAt fall to the end (epoch 0).
      //
      // EXCEPT during a free-text search: the server has already ordered those
      // rows by trigram relevance (lib/tutorsQuery), and re-sorting by
      // createdAt would push the best Georgian-declension match onto page 3 of
      // an 8-per-page list — the same silent loss as re-filtering client-side.
      // The user can still pick any explicit sort; only the DEFAULT defers.
      case 'new':      if (!rankedByRelevance) out = [...out].sort((a, b) => b.createdAt - a.createdAt); break
      // „ჩვენი რჩევით" — no longer the default, still an explicit choice.
      // KEEP the server's curated order (verified→rating with
      // bookable experts bubbled up, from queryTutors). Re-sorting purely by
      // rating here discarded that curation — a verified, bookable but brand-new
      // expert (rating 0) sank below a mediocre unverified one. Leaving the
      // seeded order intact IS „our recommendation".
      case 'rating':   /* keep the server's curated order */ break
      // ⚠️ TWO SORTS NEEDED A FALLBACK FOR THE OTHER HALF, AND BOTH ARE WRITTEN
      // DOWN IN lib/catalogItems (CatalogItem.sessions / .price): a job side has
      // no session count, so it sorts as 0 rather than as an invented number;
      // a person who quotes per job has no price, so they sort LAST in BOTH
      // directions rather than posing as ₾0. „ჩვენი რჩევით" keeps the seeded
      // order, which is the consultation side's curated order followed by the
      // job side's own (oldest first, the same as /services).
      case 'sessions': out = [...out].sort((a, b) => b.sessions - a.sessions); break
      case 'price-a':  out = [...out].sort(byPrice(1)); break
      case 'price-d':  out = [...out].sort(byPrice(-1)); break
    }
    return out
  }, [queryPool, filters, sort, rankedByRelevance])

  // Per-option counts for rating / availability / Super, computed against the
  // loaded roster with that option's OWN dimension excluded — so „4.0+ (0)"
  // and „ამ კვირას (2)" can be true at the same time. Feeds both filter
  // surfaces; see the `Facets` note near CheckOpt for why they exist at all.
  const facets = React.useMemo<Facets>(() => {
    // ⚠️ THE CONSULTATION FACETS ARE MEASURED ON THE CONSULTATION HALF, with the
    // type dimension pinned to CONSULT. Otherwise „ინგლისური (12)" would count
    // plumbers, who have no language field at all, and the section's own
    // „does this option return everyone" arithmetic (usefulLangs) would be
    // computed against a pool half of which it cannot describe.
    const consultOnly: Filters = { ...filters, types: ['CONSULT'] }
    const ratingBase = queryPool.filter(i => passesFilters(i, consultOnly, 'rating'))
    const superBase = queryPool.filter(i => passesFilters(i, consultOnly, 'super'))
    const rating: Record<string, number> = {}
    for (const r of FILTER_RATINGS) rating[String(r)] = ratingBase.filter(i => (i.consult?.rating ?? 0) >= r).length
    // Language counts, on the same terms: measured with the language dimension
    // itself excluded, against the roster this search actually loaded.
    const langBase = queryPool.filter(i => passesFilters(i, { ...consultOnly, langs: [] }))
    const langs: Record<string, number> = {}
    for (const l of FILTER_LANGS) langs[l.l] = langBase.filter(i => i.consult?.langs.includes(l.l) ?? false).length
    return {
      rating,
      langs,
      pool: langBase.length,
      superOnly: superBase.filter(i => i.consult?.superExpert ?? false).length,
      // ⚠️ ROSTER-WIDE (against what this search loaded), and NOT narrowed by
      // the other refinements — a type row that read „კონსულტაცია (0)" the
      // moment somebody ticked a city would be telling the reader the site has
      // no experts. Same argument app/experts/_masterData → filterCounts writes down.
      types: {
        CONSULT: queryPool.filter(i => i.kinds.includes('CONSULT')).length,
        WORK: queryPool.filter(i => i.kinds.includes('WORK')).length,
      },
      // The job half's numbers come from the server's one count query over the
      // whole public roster — the same numbers /experts' rail always printed.
      trades: tradeCounts.trades,
      cities: tradeCounts.cities,
    }
  }, [queryPool, filters, tradeCounts])

  const total = visibleItems.length
  /** Both halves on screen → every card says which it is. */
  const mixedView = filters.types.length > 1
  /** Both halves refined at once — the one empty state the merge created. */
  const crossKindDeadEnd = consultRefined(filters) && workRefined(filters)
  /** The consultation rows currently visible — what Quick-Compare compares. */
  const compareTutors = React.useMemo(
    () => visibleItems.map(i => i.consult).filter((t): t is Tutor => t !== null),
    [visibleItems],
  )
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
  const pagedItems = visibleItems.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // The term the visitor actually searched for, used by the dead-end empty
  // state below. Echoed back (clipped, so a pasted paragraph can't blow up the
  // heading) and carried into the request wizard so the intent survives the miss.
  const searchQ = search.trim()
  const searchQEcho = searchQ.length > 40 ? `${searchQ.slice(0, 40)}…` : searchQ

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      {/* ONE header, every viewer (2026-08-08, owner: „ექსპერტებზე რომ
          გადავდივარ — იცვლება; მინდა როგორც ორიგინალში").
          A signed-in STUDENT used to get the workspace shell here instead — the
          reasoning was that they should never feel they had left their account.
          What it actually produced was a menu that changed under them: /experts
          read მთავარი · ექსპერტები · ჯავშნები · მიმოწერა, and opening any expert
          from that very list swapped it back to ექსპერტები · კატეგორიები ·
          გახდი ექსპერტი · დახმარება. Browse and the profile it leads to are the
          same public section, so they get the same bar.
          The way back to the account was never in the nav items anyway: the Logo
          auto-routes to the viewer's role-home (a student lands on /student) and
          UserMenu carries the rest — both are in this header already.
          No `activeHref`: the lit item is DERIVED from usePathname inside
          PublicTopBar (§L). Passing it is what made the highlight go dark on
          /experts/[slug] the last time this was reported. */}
      <PublicTopBar initialUser={initialUser} />

      <SearchHero filters={filters} total={total} loading={loading} liveCats={liveCats} requestHref={requestHref} />

      {/* ⚠️ THE SAME TWO-COLUMN SHELL /experts HAS (2026-08-19). Owner:
          „სერვისები და ექპერტები უნდა გაერთიანდეს." Rail on the left from `lg`,
          results on the right; below `lg` the rail folds into one button
          (components/catalog/MobileCollapse) and the results start straight
          after it.

          240px and not a fraction: the rail's contents are rows of known width,
          and a percentage column would re-wrap them at every viewport for no
          gain. `items-start` so the sticky rail has a shorter box than the
          results to stick inside — with `stretch` it would be as tall as the
          grid and never stick at all.

          ⚠️ `min-w-0` ON BOTH TRACKS, AND WITHOUT IT THE PAGE SCROLLS SIDEWAYS
          AT 390px. A grid item's default `min-width` is `auto`, not 0 — so a
          `1fr` track will not shrink below its content's intrinsic width, and
          one long name or one untruncatable chip pushes the whole column past
          the viewport. This is the single most common cause of a horizontal
          scrollbar in a CSS grid, it is invisible until somebody opens a phone,
          and it has already been caught once on /experts. */}
      <Container as="main" id="main" className="py-8 sm:py-10 pb-14 sm:pb-20">
        {/* SignInPromptBanner removed 2026-07-31. `toggleFav` was its ONLY
            trigger, and it rendered here — above the results, i.e. off-screen
            for the reader who had just tapped a heart 1000px further down —
            while pushing every card down by its own height. It could never be
            seen by the person it was written for. The toast in `toggleFav`
            replaces it; the header's „შესვლა" is the permanent path. */}
        {/* „ბოლოს ნანახი" strip removed 2026-07-27 — it pushed the actual
            results below the fold and repeated cards the visitor had just
            scrolled past. The component still serves the home page. */}
        <div className="grid gap-8 lg:grid-cols-[240px_1fr] items-start">
          <div className="min-w-0">
            {/* The rail counts FILTERS, not the typed query: the query is not in
                the rail, so „ფილტრის მოხსნა" must not claim to undo it, and the
                folded button must not promise a refinement the panel cannot
                show. The query stays visible and removable as its own chip in
                the results header. */}
            <MobileCollapse panelId="catalog-filter-panel" activeCount={filterCount}>
              <TutorFilters
                filters={filters}
                setFilters={setFilters}
                liveCats={liveCats}
                facets={facets}
                activeCount={filterCount}
                onReset={resetFilters}
              />
            </MobileCollapse>
          </div>
          {/* Anchor for the „take me to the new results" scroll below. */}
          <div ref={resultsRef} className="min-w-0">
            <ResultsBar
              total={total}
              loading={loading}
              sort={sort}
              setSort={setSort}
              search={search}
              setSearch={setSearch}
              onSearch={runSearch}
              view={view}
              setView={setView}
              activeFilters={activeFilters}
              removeFilter={removeFilter}
              onReset={resetFilters}
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

            <div className={`relative motion-safe:transition-opacity motion-safe:duration-fast ${loading && items.length > 0 ? 'opacity-60' : ''}`}>
              {/* Refetch indicator — the first-paint skeleton below only covers
                  an empty list, so on re-search/refilter (when results already
                  exist) we dim the stale list and show an inline spinner. */}
              {loading && items.length > 0 && (
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
              ) : loading && items.length === 0 ? (
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
              ) : visibleItems.length === 0 ? (
                // Compact canon empty state — icon + one line + one action.
                // FOUR distinct dead ends, and they need different exits:
                //
                //   a) the SEARCH matched nothing (server returned zero rows).
                //      „ფილტრების გასუფთავება" is a no-op here — the filters
                //      never ran — so it would strand the visitor. This is also
                //      the most valuable moment on the site: they just named an
                //      expert we don't have. Carry the query into the request
                //      wizard (?q=, gated like branch b) so the intent is
                //      captured instead of lost. The API records the same miss
                //      as `search_zero` server-side (lib/events).
                //   b) a COLD marketplace (nobody listed at all, no query).
                //   c) the filters killed a non-empty result set → offer reset.
                //   d) a CONSULTATION refinement and a JOB refinement at once —
                //      a contradiction no roster can answer, and the one dead
                //      end the merge created. Shares (c)'s block, own sentence.
                // ⚠️ THE SEARCH MISS IS TESTED FIRST, AND ON THE POOL, NOT ON
                // THE ROSTER (2026-08-19). Before the merge „the list is empty"
                // and „the search found nobody" were the same condition, because
                // the roster WAS the search result. There are two halves now and
                // the job half is always loaded, so a query that matches nobody
                // still leaves six masters in `items` — and branch (a), the
                // single most valuable moment on the site, would never fire
                // again. `queryPool` is what the query actually matched, across
                // both halves; that is the number this question is about.
                searchQ && queryPool.length === 0 ? (
                    <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                      <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-100 text-ink-500 mb-3">
                        <Icon.search className="w-5 h-5" />
                      </div>
                      <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">
                        „{searchQEcho}“ — ექსპერტი ვერ ვიპოვეთ
                      </div>
                      {/* Honest: we promise a reply, NOT a match. /ask (the
                          old primary here) was retired 2026-08-19; the request
                          wizard is the same bridge branch (b) below already
                          uses — same href, same gate, carrying the query. */}
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
                ) : items.length === 0 ? (
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
                      სცადე ფილტრების შეცვლა ან აღწერე, რა გჭირდება.
                    </p>
                    {/* ── THE BRIDGE OUT OF A DEAD END (2026-08-18) ──────────
                        The catalogue's empty state was a cul-de-sac: filters
                        that found nobody, and one link to the old /ask. But „nobody
                        matches these filters" is the single best moment to
                        offer the other path — describe it and let experts come
                        to you — and until now the two halves of this product
                        did not know about each other at all. Owner: „არ მინდა,
                        რომ ცალკე პლათფორმაზე ხდებოდეს."

                        ⚠️ IT CARRIES THE SEARCH. Whatever they typed here
                        seeds the request wizard's first screen (?q=), so the
                        bridge does not cost them their sentence — the same
                        hand-off the home band already makes.

                        ⚠️ AND IT IS BEHIND THE FLAG. `requestsOn()` is checked
                        here rather than inherited: this file is not the home
                        page, and a deployment with the subsystem off must not
                        grow a link to a 404. */}
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      {requestsOn() && (
                        <a
                          href={search.trim() ? `/request?q=${encodeURIComponent(search.trim())}` : '/request'}
                          className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 shadow-xs transition-colors duration-fast"
                        >
                          აღწერე, რა გჭირდება
                        </a>
                      )}
                      {/* The secondary „დასვი კითხვა" → /ask went with that page
                          (2026-08-19). */}
                    </div>
                  </div>
                ) : (
                  /* ⚠️ d) THE DEAD END THE MERGE CREATED (2026-08-19) SHARES
                     THIS BLOCK, and only the sentence changes — because only
                     the CAUSE changes, and the way out is the same button.
                     „ვერ ვიპოვეთ — სცადე სხვა ფილტრი" is right when one more
                     tick than the roster can answer emptied the list. It is bad
                     advice when a consultation refinement and a job refinement
                     are ticked at the same time: that pair asks for somebody
                     whose one offering is two different things, so no other
                     VALUE of either filter helps and the words have to name the
                     fix — take one off. See `passesFilters`. */
                  <div className="py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in">
                    <div className={`inline-flex items-center justify-center w-11 h-11 rounded-full mb-3 ${crossKindDeadEnd ? 'bg-ink-100 text-ink-500' : 'bg-brand-50 text-brand-600'}`}>
                      {crossKindDeadEnd ? <Icon.sliders className="w-5 h-5" /> : <Icon.search className="w-5 h-5" />}
                    </div>
                    <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">
                      {crossKindDeadEnd ? 'ამ ფილტრით არავინ არის — მოხსენი ფილტრი' : 'ვერ ვიპოვეთ — სცადე სხვა ფილტრი'}
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
                // and 2-up from sm, exactly as this page has always shipped;
                // `list` is one full-width row per expert. The same `view` goes
                // to the card so its own geometry agrees with the box it is in.
                // Grid items stretch and the card is `h-full flex flex-col` with
                // the footer after a `flex-1` body, so a row's cards share one
                // height AND their button rows share a baseline.
                <div className={VIEW_CLASS[view]}>
                  {/* ⚠️ TWO KINDS OF CARD IN ONE LIST, AND ONE CARD PER PERSON
                      (2026-08-19). Each half keeps the card it already had —
                      its own footer, its own CTA, its own behaviours
                      (`vt-photo-<id>`, the slug href, favourites, the hover
                      video, the badges; the job side's „პროფილი" →
                      /experts/<slug>, step 4 of that file's chain). Flattening them into one card would
                      cost the expert their booking button or the master their
                      profile link, and the reader nothing gained.
                      Somebody who offers BOTH is ONE item (lib/catalogItems)
                      and is drawn by the consultation card, because that is the
                      card with the calendar behind it; the labels say the rest.
                      `kinds` is passed only when it distinguishes: a mixed list,
                      or a person who holds both halves. */}
                  {pagedItems.map((it, i) => (
                    it.consult ? (
                      <TutorCard key={it.key} idx={i} t={it.consult} view={view} onPreviewEnter={openPreview} onBook={openBook} saved={favIds.has(it.consult.id)} onToggleFav={toggleFav} needsSignIn={authKnown && !signedIn} viewerCantBook={viewerCantBook} viewerCantFav={viewerCantFav} />
                    ) : it.work ? (
                      <MasterCard key={it.key} m={it.work} view={view} />
                    ) : null
                  ))}
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
              {compareTutors.length >= 2 && (
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
      {/* Quick-Compare is a CONSULTATION control — it compares ratings, session
          counts, prices and languages, four fields a job side does not have.
          It therefore reads the consultation half of what is on screen, and the
          strip that opens it hides itself when there are fewer than two. */}
      <CompareModal open={compareOpen} tutors={compareTutors.slice(0, 3)} onClose={() => setCompareOpen(false)} onBook={openBook} />

      {/* ⚠️ NO FILTERS DRAWER ANY MORE (2026-08-19). A `Sheet` used to hold a
          SECOND copy of every refinement for phones, opened from a `lg:hidden`
          trigger in the results bar, while the hero drew a row of dropdown
          boxes for everything above `lg`. One rail now serves both widths — it
          folds into a button below `lg` (components/catalog/MobileCollapse), so
          there is no second surface to keep in step and no second „ნახე N
          ექსპერტი" button restating the count that is already on screen. */}
    </div>
  )
}
