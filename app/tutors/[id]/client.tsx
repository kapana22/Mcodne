'use client'
// /tutors/[id] — the expert profile container. Owns the fetch, the booking
// state and the layout; every section lives in a `_*.tsx` beside this file.
//
// next-view-transitions' Link is a drop-in for next/link that runs the
// navigation inside document.startViewTransition — this is what animates the
// card→profile morph. Unsupported browsers get plain navigation.
//
// Shared booking flow (DESIGN_FIX_PROMPT 1.1) — the ONE implementation, also
// used by the /tutors listing. The slot math, tz labels and defaults that used
// to live in this file are imported from components/booking now.
// mapTutorPayload is a tiny pure mapper (used eagerly to memoize tutorInfo), so
// import it statically from its own module. BookingFlow — the heavy calendar /
// date-picker subtree — only mounts after a "book" click, so lazy-load it.

import React, { useState, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Link } from 'next-view-transitions'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer as SharedFooter } from '@/components/Footer'
import { useMe, type Me as PublicMe } from '@/lib/me'
import { isAbroadCategory } from '@/lib/abroad'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { mapTutorPayload } from '@/components/booking/mapTutorPayload'
import { InlineAvailability } from '@/components/booking/InlineAvailability'
import { TUTOR_DEFAULTS, primaryPriceLabel, primaryServiceMin, type ConsultationItem } from '@/components/booking/slots'
import { AuthPromptSheet, MobileBookingBar, SlotsState, StickyBookingCard } from './_booking'
import { Breadcrumb, VideoHero } from './_hero'
import { Reviews } from './_reviews'
import { AboutSection, CertificatesSection, EducationSection, ExperienceSection, ServicesSection } from './_sections'
import { SimilarExperts } from './_similar'

const BookingFlow = dynamic(
  () => import('@/components/booking/BookingFlow').then(m => m.BookingFlow),
  { ssr: false },
)


const Logo = () => (
  <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
  </Link>
)

/* Calendar / DayTimeline / Steps / intake / payment / OrderSummary /
   BookingModal moved WHOLESALE to components/booking/* (BookingFlow) —
   the shared implementation both this profile and /tutors render. */

/* ───── In-page anchor nav (DESIGN_FIX_PROMPT 1.6) ─────
   A floating pill that rises from the BOTTOM once the reader is past the hero,
   instead of the old strip stuck under the PublicTopBar — that strip stretched
   the header by another 44px on every scroll frame and made the page feel
   top-heavy. Same anchors and the same smooth scroll; it also tracks the
   section you are actually reading now.
   Bottom clearance: this page's fixed MobileBookingBar owns the mobile bottom
   edge (~121px + safe-area); BottomNav does NOT render here (it treats
   /tutors/[id] as a focused screen), so the mobile offset only has to clear
   that one bar. Sections carry scroll-mt-24 — enough for the sticky top bar
   (h-16/h-20) now that nothing else sticks under it. */
const SectionNav = ({ items, hidden = false }: { items: { id: string; l: string }[]; hidden?: boolean }) => {
  const [active, setActive] = useState<string | null>(null)
  const ids = items.map(i => i.id).join(',')

  useEffect(() => {
    const list = ids ? ids.split(',') : []
    if (list.length < 2) return
    let frame = 0
    const measure = () => {
      frame = 0
      // NOTE: there is deliberately no reveal threshold here any more. The pill
      // used to appear only after you scrolled ~400px; it is now permanent
      // chrome, present from the moment the profile opens. The effect below is
      // purely the scroll-spy that highlights the current section.
      //
      // Scroll-spy: the last section whose heading has passed the top bar. At
      // the very bottom the final section can never reach that line (the page
      // runs out of scroll), so the end of the document claims the last tab.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let current = atEnd ? list[list.length - 1] : list[0]
      if (!atEnd) {
        for (const id of list) {
          const el = document.getElementById(id)
          if (el && el.getBoundingClientRect().top <= 140) current = id
        }
      }
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ids])

  // `hidden` still applies — it's a genuine conflict (the booking sheet / auth
  // gate is open on top), not a scroll state.
  if (items.length < 2 || hidden) return null
  return (
    // The wrapper owns the centering transform; the pill owns the entry
    // animation — `animate-slide-in-b` animates `transform`, so sharing one
    // element would cancel `-translate-x-1/2` and knock the pill off-centre.
    // `pointer-events-none` on the wrapper keeps the fixed layer from eating
    // taps beside the pill.
    <div
      // 150px = the mobile booking bar's real height (~122px at 390px, where
      // the risk-reversal line wraps) plus a clear gap; the safe-area inset is
      // added on top because the bar itself grows by it.
      // DESKTOP ONLY (2026-08-01). This jump-nav is a SHORTCUT, not a path:
      // every section it links to is reachable by scrolling, so removing it on
      // phones takes nothing away. (That is what separates it from the
      // saved-experts heart, which was hidden on mobile with NO other route —
      // the reason this was repositioned twice before being cut.)
      //
      // Measured on a phone before cutting it: a profile runs 6–8.3 screens, and
      // header + this nav + the booking bar occupied 241px = 29% of a 390×844
      // viewport, permanently. Anchored at the bottom it landed on a bio
      // paragraph (`.glass-over-copy` could only make that coverage opaque, not
      // stop it); moved under the header at 72px it left an 8px slit that body
      // text showed through as a band of cut type; flush at 64px it read as a
      // second bar stacked on the first. Every position was a different way of
      // spending a third of a small screen on a convenience.
      //
      // No major marketplace ships a floating section nav on a mobile profile.
      // If the function is ever wanted back on phones, the right shape is an
      // IN-FLOW index under the identity card — visible while the reader is
      // orienting, then scrolled away — not another fixed layer.
      className="hidden lg:block fixed left-1/2 -translate-x-1/2 z-pill pointer-events-none bottom-6"
    >
      <nav
        aria-label="პროფილის სექციები"
        // `.glass` (globals.css) owns the whole surface — translucency, blur,
        // hairline, edge-highlight, shadow AND the compositor promotion that
        // keeps a blurred fixed element from strobing on mobile scroll. It is
        // glass at every breakpoint now (the old `lg:`-only blur was the
        // avoidance workaround; promotion is the real fix). Add nothing but the
        // radius here — no bg-/border-/shadow- utilities on a glass surface.
        // `glass-over-copy`: below lg this pill floats directly over the bio
        // paragraph, where 55% translucency smeared a line into unreadability.
        // See the utility's note in globals.css — opacity is the only fix.
        className="pointer-events-auto max-w-[calc(100vw-2rem)] rounded-pill glass glass-over-copy motion-safe:animate-slide-in-b"
      >
        {/* The rail scrolls INSIDE the pill (four Georgian labels overflow
            390px), and only the labels are edge-masked — masking the <nav>
            itself would fade out the pill's own border and shadow. */}
        <div className="flex items-center gap-1 p-1 overflow-x-auto scrollbar-hide rail-fade-end">
          {items.map(it => (
            <a
              key={it.id}
              href={`#${it.id}`}
              aria-current={active === it.id ? 'true' : undefined}
              // Smooth-glide to the section instead of a hard jump. scrollIntoView
              // honors each section's scroll-mt-24, so the heading lands clear of
              // the sticky top bar. Fall back to the native hash jump if the
              // target isn't found.
              onClick={(e) => {
                const el = document.getElementById(it.id)
                if (!el) return
                e.preventDefault()
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                history.replaceState(null, '', `#${it.id}`)
              }}
              // Active chip is BRAND green, not `bg-ink-900`. Black was the only
              // non-palette surface left on this control and it read as a
              // foreign element sitting on the site's own glass.
              className={`shrink-0 h-11 px-3.5 rounded-pill inline-flex items-center font-display text-small font-semibold whitespace-nowrap no-caps transition-colors duration-fast ${
                active === it.id ? 'bg-brand-600 text-white shadow-xs' : 'text-ink-600 hover:text-ink-900 hover:bg-ink-50'
              }`}
            >
              {it.l}
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}

/* ───── Page ─────
   Wrapped in <Suspense> because `useSearchParams` (used inside for rebook
   query params) must be inside a Suspense boundary in Next 15. */
export default function ExpertProfilePage({ initialTutor, initialUser }: { initialTutor?: any; initialUser?: PublicMe | null }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <ExpertProfile initialTutor={initialTutor ?? null} initialUser={initialUser} />
    </Suspense>
  )
}

function ExpertProfile({ initialTutor, initialUser }: { initialTutor: any; initialUser?: PublicMe | null }) {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  // The REAL profile id — never the URL segment.
  //
  // The URL is now the human slug („/tutors/ana-gagoshidze"), and every request
  // this component makes (/api/tutors/…, /api/favorites?tutorId=…, booking
  // submits) is keyed by the profile's actual id. Reading `params.id` here sent
  // the slug to those endpoints, which 404'd — it broke booking on every
  // profile the moment slugs shipped. `initialTutor` is the server's own row,
  // so its id is authoritative; the param is only a fallback for the id-form
  // URL (and for the brief window before the seed exists).
  const tutorId = initialTutor?.id ?? params?.id
  // Seed from the server's already-loaded profile (page.tsx passes the same
  // core fields it reads for SEO — name/avatar/headline/specialty/verified/
  // rating/price/consultations). The hero, identity, specs, about and price
  // then render on the FIRST paint instead of a blank skeleton. The fetch below
  // still runs to hydrate what the seed omits (live availability, reviews,
  // experience/education/certificates) and to refresh the core fields. When no
  // seed is available (server DB error), we fall back to the pure client-fetch
  // path — identical to before, incl. the skeleton + error/retry states.
  const [tutorData, setTutorData] = useState<any>(initialTutor ?? null)
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'not-found' | 'error'>(
    initialTutor ? 'ok' : 'loading',
  )
  // The seed is PARTIAL — it carries the scalars but NOT availability/busySlots/
  // reviews (viewer-tz dependent, so they stay client-computed; see the seed
  // note in page.tsx). `loadState === 'ok'` therefore says „we can draw the
  // profile", NOT „we know this expert's free times". Everything slot- or
  // review-derived reads this second flag instead, so a seeded first paint
  // shows a neutral loading affordance rather than a disabled CTA and an
  // all-zero review histogram that silently flip 300–1500ms later.
  const [detailsState, setDetailsState] = useState<SlotsState>('pending')
  // Bumping this refires the profile fetch — powers the error-state retry
  // button (the DB sits behind a remote proxy, so transient failures happen).
  const [loadAttempt, setLoadAttempt] = useState(0)

  // Rebook / pre-fill params from ?topic&duration&price&rebook — the
  // student/bookings/[id] "დაჯავშნე ისევ" CTA embeds these when jumping here.
  const rebookTopic = searchParams?.get('topic') ?? null
  // `duration` and `price` are accepted in the URL for future prefill hooks
  // but not yet applied — the booking modal derives duration from
  // free/paid mode and price from the tutor's rate. Reading them here keeps
  // the URL contract stable for the /student/bookings CTA.
  void searchParams?.get('duration')
  void searchParams?.get('price')
  const rebookAutoOpen = searchParams?.get('rebook') === '1'
  // The slot + tier the visitor picked BEFORE the auth gate (written by
  // AuthPromptSheet). Reading them here is what makes the gate's promise —
  // „ჯავშანი გაგრძელდება" — literally true; before this the flow reopened
  // empty and the person re-hunted the same time.
  const resumeStartIso = searchParams?.get('start') ?? null
  const resumeServiceId = searchParams?.get('service') ?? null
  // Deep-link from a slot-less expert's card CTA ("მიწერე ექსპერტს"): open the
  // message flow on arrival — auth-gated for guests, straight to the thread for
  // signed-in students. Same one-shot pattern as ?rebook=1 for booking.
  const messageAutoOpen = searchParams?.get('intent') === 'message'

  useEffect(() => {
    if (!tutorId) return
    // Only drop to the skeleton when we have NOTHING seeded from the server —
    // with a seed we keep the profile on screen while the fresh payload loads.
    // Likewise a transient refetch failure must not blow a working seeded
    // profile into the error screen (the server already had the data); it only
    // downgrades to not-found/error on the pure client-fetch path.
    const seeded = !!initialTutor
    if (!seeded) setLoadState('loading')
    setDetailsState('pending')
    fetch(`/api/tutors/${tutorId}`)
      .then(async r => {
        if (r.status === 404) { if (!seeded) setLoadState('not-found'); return null }
        if (!r.ok) { if (!seeded) setLoadState('error'); return null }
        // Non-JSON body (proxy error page, dead dev server) must land in the
        // error branch — not throw into an uncaught rejection.
        return r.json().catch(() => { if (!seeded) setLoadState('error'); return null })
      })
      // `detailsState` resolves on EVERY outcome — a seeded profile survives a
      // failed refetch (it keeps the error screen away), but its slot/review
      // regions must not sit on a skeleton forever: they switch to an honest
      // „ვერ ჩაიტვირთა" + retry instead.
      .then(d => {
        if (d) { setTutorData(d); setLoadState('ok'); setDetailsState('ready') }
        else setDetailsState('failed')
      })
      .catch(() => { if (!seeded) setLoadState('error'); setDetailsState('failed') })
  }, [tutorId, loadAttempt])

  // Soft sign-in prompt: replaces hard redirect for anon interactions.
  // Shared /api/me (lib/me) — deduped with the top bar, AppShell and VideoHero.
  // Tri-state preserved: null until the probe resolves (`ready`), then boolean —
  // the rebook auto-open waits on `signedIn === null`, requireAuth gates on
  // `=== false`.
  const { me, ready: meReady } = useMe()
  // The server already resolved the session (page.tsx passes `initialUser`), so
  // fall back to it until the probe lands — otherwise an expert opening their
  // OWN profile flashes a live „დაჯავშნე" + a save-heart they can't use, and a
  // signed-in visitor flashes „შესვლა და დაჯავშნა". Same seed-then-refresh
  // pattern as app/tutors/client.tsx. It's a prop, identical on the server and
  // the hydration render, so no mismatch.
  const viewer = me ?? initialUser ?? null
  const signedIn: boolean | null = meReady ? !!me : initialUser ? true : null
  const [needsAuth, setNeedsAuth] = useState(false)
  const [authDismissed, setAuthDismissed] = useState(false)
  // Which flow the visitor was in when the auth gate fired. 'book' makes the
  // post-auth redirect carry ?rebook=1 so the booking modal reopens by itself.
  const [authIntent, setAuthIntent] = useState<'book' | 'message' | null>(null)
  // THE SLOT THE VISITOR ALREADY PICKED. The gate used to promise „ჯავშანი
  // გაგრძელდება" and then return ?rebook=1 with nothing in it — the chosen
  // time and tier were dropped and the person had to re-find the exact slot
  // they had just tapped. These travel through the redirect and are re-seeded
  // on arrival (see the ?start/?service reader below).
  const [authStart, setAuthStart] = useState<Date | null>(null)
  const [authServiceId, setAuthServiceId] = useState<string | null>(null)
  const requireAuth = React.useCallback((intent?: 'book' | 'message', ctx?: { start?: Date | null; service?: ConsultationItem | null }) => {
    if (signedIn === false) {
      setAuthIntent(intent ?? null)
      setAuthStart(ctx?.start ?? null)
      setAuthServiceId(ctx?.service?.id ?? null)
      setNeedsAuth(true)
      setAuthDismissed(false)
      // Deliberately NO scroll — the AuthPromptSheet opens at the point of
      // tap; yanking the user to the top of a long profile was disorienting.
      return true
    }
    return false
  }, [signedIn])

  // NB: the `loadState === 'not-found'` early-return lives BELOW, after every
  // hook. Returning here (before the useState/useEffect calls that follow)
  // changed the hook count between renders — React threw "Rendered fewer hooks
  // than expected" and the intended not-found screen crashed into the error
  // boundary. All hooks must run on every render.

  const [bookingOpen, setBookingOpen] = useState(false)
  // Request-based booking is scoped to one category on the SERVER (lib/abroad).
  // Every CTA that offers it must read the same predicate, or the button
  // promises something POST /api/bookings refuses.
  const isAbroadProfile = isAbroadCategory(tutorData?.category?.slug ?? null)
  // Pre-selected slot start — set by the inline „განრიგი" picker so the flow
  // opens with that time already chosen. Null for generic CTAs.
  const [bookingStart, setBookingStart] = useState<Date | null>(null)
  // Consultation tier tapped in ServicesSection — flows into BookingFlow so
  // it books THAT tier's minutes/price (via consultationId). Null for
  // every generic CTA (sticky card, mobile bar), which books the flat default
  // (or asks for a tier at step 1 when the expert has several).
  const [selectedService, setSelectedService] = useState<ConsultationItem | null>(null)

  // The shared flow's payload, derived once per fetch from the SAME
  // /api/tutors/[id] JSON this page already loaded (no extra request).
  // Memoized: BookingFlow's reset logic must not see a new object per render.
  const bookingTutorInfo = React.useMemo(
    () => (tutorData ? mapTutorPayload(tutorData) : null),
    [tutorData],
  )

  // No-op when the tutor is paused (available === false). The banner above
  // explains the state; silently swallowing the click prevents any of the
  // booking entry points (sidebar, mobile bar, service cards, inline
  // schedule) from opening the flow for a tutor who's stepped out.
  const isPaused = tutorData?.available === false

  const openPaid = () => {
    if (isPaused) return
    if (requireAuth('book')) return
    setSelectedService(null)
    setBookingStart(null)
    setBookingOpen(true)
  }
  // Service-card entry point: same gates as openPaid, but carries the tapped
  // tier into the flow (tier step pre-answered).
  const openServiceBooking = (s: ConsultationItem) => {
    if (isPaused) return
    if (requireAuth('book', { service: s })) return
    setSelectedService(s)
    setBookingStart(null)
    setBookingOpen(true)
  }
  // Inline-schedule entry point (1.6): opens the flow with the tapped time
  // preselected; multi-tier experts still answer the tier step first.
  // `service` comes from the #schedule tier switcher: the times shown there are
  // derived for THAT service, so it must travel with the tap. Passing null (as
  // this did unconditionally) meant the sheet re-asked for the tier and then
  // silently discarded the start whenever the chosen tier was longer.
  const openSlotBooking = (start: Date, service: ConsultationItem | null = null) => {
    if (isPaused) return
    if (requireAuth('book', { start, service })) return
    setSelectedService(service)
    setBookingStart(start)
    setBookingOpen(true)
  }

  // Pre-booking messaging — the objection-handler for high-stakes one-off
  // consultations (Clarity/Topmate pattern). Guests hit the auth sheet (returns
  // here after sign-in); logged-in students open the pair thread with this
  // expert. Allowed even while paused — a prospect can still ask questions.
  const router = useRouter()
  const expertUserId: string | undefined = tutorData?.user?.id
  // The expert viewing their OWN public profile must not see a "book/message
  // yourself" control — swap it for an edit-profile link.
  const isOwnProfile = !!(viewer?.id && expertUserId && viewer.id === expertUserId)
  // Dual-role model (2026-07-23): anyone who can act as a CLIENT may message or
  // book another expert — guests, students, AND a promoted expert (role TUTOR)
  // consulting a DIFFERENT expert. The backend permits it (bookings API now
  // refuses only ADMIN; messages API allows TUTOR→TUTOR pre-booking inquiries),
  // so the only viewers excluded are the expert on their own profile
  // (isOwnProfile) and ADMIN (no client space). Messaging is allowed even while
  // the listing is paused — a prospect can still ask questions.
  const canMessage = expertUserId != null && !isOwnProfile && viewer?.role !== 'ADMIN'
  const viewerCantBook = viewer?.role === 'ADMIN'
  // Favorites remain STUDENT-only (the favorites API still 403s a TUTOR), so the
  // save button uses a separate flag from booking (which a dual-role TUTOR can do).
  const viewerCantFav = !!(viewer?.role && viewer.role !== 'STUDENT')
  const onMessageExpert = () => {
    if (requireAuth('message')) return
    if (!expertUserId) return
    router.push(`/student/messages/u/${expertUserId}`)
  }

  // Auto-open the booking flow when the caller passed ?rebook=1. Only fire
  // once — we track it with a guard state so React strict-mode double invokes
  // stay idempotent, and further opens/closes remain manual. Skip if
  // the tutor has paused their listing since the rebook link was generated.
  // Anonymous visitors go through requireAuth instead of straight into the
  // flow — the AuthPromptSheet's 'book' intent carries ?rebook=1 through
  // sign-in, so the flow resumes here after auth.
  const [rebookConsumed, setRebookConsumed] = useState(false)
  useEffect(() => {
    if (!rebookAutoOpen || rebookConsumed) return
    if (loadState !== 'ok') return
    if (isPaused) { setRebookConsumed(true); return }
    if (signedIn === null) return // wait for the /api/me probe to resolve
    if (requireAuth('book')) { setRebookConsumed(true); return }
    // Re-seed what the gate carried. A stale/past `start` is dropped rather
    // than passed on — the flow would reject it anyway, and an expired time
    // silently preselected is worse than none.
    const resumed = resumeStartIso ? new Date(resumeStartIso) : null
    const usableStart = resumed && !isNaN(resumed.getTime()) && resumed.getTime() > Date.now() ? resumed : null
    const tiers: ConsultationItem[] = tutorData?.consultations ?? []
    // No explicit tier in the URL? The carried start came from a chip derived
    // for the FLAGSHIP tier, so resume on that one — otherwise the sheet
    // re-validates the start against a different duration and drops it.
    const flagMin = primaryServiceMin(tiers, tutorData?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin)
    const resumedService = resumeServiceId
      ? (tiers.find(t => t.id === resumeServiceId) ?? null)
      : (usableStart ? (tiers.find(t => t.minutes === flagMin) ?? null) : null)
    setSelectedService(resumedService)
    setBookingStart(usableStart)
    setBookingOpen(true)
    setRebookConsumed(true)
  }, [rebookAutoOpen, rebookConsumed, loadState, isPaused, signedIn, requireAuth, resumeStartIso, resumeServiceId, tutorData])

  // Same one-shot resolution for the ?intent=message deep-link (slot-less card
  // CTA): guests hit the auth sheet with a 'message' intent, signed-in students
  // go straight to the pair thread.
  const [messageConsumed, setMessageConsumed] = useState(false)
  useEffect(() => {
    if (!messageAutoOpen || messageConsumed) return
    if (loadState !== 'ok' || signedIn === null) return
    // Guests: fire the auth sheet (doesn't need the expert's user id).
    if (signedIn === false) { setMessageConsumed(true); requireAuth('message'); return }
    // Signed-in student: the SSR seed carries no `user.id` (SEO fields only), so
    // wait for the client payload to fill `expertUserId` before redirecting —
    // do NOT consume early, or the redirect is lost. The effect re-runs when
    // expertUserId lands (it's a dep).
    if (!expertUserId) return
    setMessageConsumed(true)
    router.push(`/student/messages/u/${expertUserId}`)
  }, [messageAutoOpen, messageConsumed, loadState, signedIn, requireAuth, expertUserId, router])

  // Safe now — every hook above has already run unconditionally.
  if (loadState === 'not-found') {
    return (
      <div className="font-sans bg-white text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar initialUser={initialUser} />
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-[480px] w-full text-center">
            <h1 className="font-display text-h2 font-bold text-ink-900">ექსპერტი ვერ მოიძებნა</h1>
            <p className="text-body text-ink-500 mt-2">პროფილი წაიშალა ან ბმული არასწორია.</p>
            <Link href="/tutors" className="tap-shrink mt-6 inline-flex h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body items-center gap-2">
              ყველა ექსპერტი
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Error gate — a failed fetch must NEVER strand the user on an infinite
  // skeleton (the DB is behind a remote proxy; transient failures are real).
  // Say what happened and offer a retry.
  if (loadState === 'error') {
    return (
      <div className="font-sans bg-white text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar initialUser={initialUser} />
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-[480px] w-full text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-warning-50 border border-warning-200 inline-flex items-center justify-center text-warning-700 mb-5">
              <Icon.warn className="w-6 h-6" />
            </div>
            <h1 className="font-display text-h2 font-bold text-ink-900">პროფილი ვერ ჩაიტვირთა</h1>
            <p className="text-body text-ink-500 mt-2 leading-relaxed">ქსელის დროებითი ხარვეზი — სცადე თავიდან.</p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setLoadAttempt(a => a + 1)}
                className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 transition-colors duration-fast"
              >
                სცადე თავიდან
              </button>
              <Link href="/tutors" className="h-11 px-5 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center transition-colors duration-fast">
                ყველა ექსპერტი
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading gate (B1): until the fetch resolves, `tutorData` is null. Rendering
  // the full profile here used to flash "—" names, an empty facts strip, a
  // ₾80/30-წთ fallback price and a DISABLED "no published slots" booking card —
  // all of which self-healed a moment later once the data arrived, so users saw
  // a jarring broken-then-fixed profile. Show a skeleton instead; only render
  // the real profile + booking UI once `loadState === 'ok'`. (`not-found` and
  // `error` are handled above; only genuine `loading` lands here.)
  if (loadState !== 'ok') {
    return (
      <div className="font-sans bg-white text-ink-900 antialiased">
        <PublicTopBar initialUser={initialUser} />
        <Container as="main"
          id="main"
          className="pt-4 sm:pt-7 lg:pt-9 pb-24 lg:pb-16"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="sm:mt-6 grid lg:grid-cols-[1fr_360px] gap-8 xl:gap-12 motion-safe:animate-pulse">
            {/* Left: identity + specs placeholders. Deliberately NO media
                block: most experts have no intro video, so a video-shaped
                skeleton promised one to everyone and then vanished. */}
            <div className="min-w-0">
              <div className="relative rounded-card bg-white border border-ink-200 shadow-card px-5 sm:px-7 pt-5 sm:pt-6 pb-6">
                <div className="w-[88px] h-[88px] sm:w-[112px] sm:h-[112px] rounded-full bg-ink-100" />
                <div className="mt-4 space-y-3">
                  <div className="h-7 w-2/3 bg-ink-100 rounded" />
                  <div className="h-4 w-1/3 bg-ink-100 rounded" />
                  <div className="h-3 w-4/5 bg-ink-100 rounded" />
                </div>
              </div>
              <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-card bg-ink-100" />)}
              </div>
            </div>
            {/* Right: sticky booking card placeholder */}
            <div className="hidden lg:block">
              <div className="rounded-card border border-ink-200 bg-white p-6 space-y-4">
                <div className="h-9 w-1/2 bg-ink-100 rounded" />
                <div className="h-4 w-2/3 bg-ink-100 rounded" />
                <div className="h-12 w-full bg-ink-100 rounded-btn" />
              </div>
            </div>
          </div>
          <span className="sr-only">იტვირთება…</span>
        </Container>
      </div>
    )
  }

  // Anchor-nav items — only the sections that actually render get a link.
  const navItems: { id: string; l: string }[] = [
    ...((tutorData?.bio || tutorData?.headline || tutorData?.user?.bio) ? [{ id: 'overview', l: 'მიმოხილვა' }] : []),
    ...((tutorData?.consultations?.length ?? 0) > 0 ? [{ id: 'services', l: 'სერვისები' }] : []),
    ...(!isPaused ? [{ id: 'schedule', l: 'განრიგი' }] : []),
    ...((tutorData?.experience?.length ?? 0) > 0 ? [{ id: 'experience', l: 'გამოცდილება' }] : []),
    { id: 'reviews', l: 'შეფასებები' },
  ]

  // ONE service length for every pre-tier surface (rail, mobile bar, #schedule)
  // so they can't disagree: the expert's FLAGSHIP service — longest PAID tier —
  // falling back to the profile duration. It used to be the SHORTEST service,
  // which drew the schedule on a grid most of whose starts could not hold the
  // service the visitor actually wanted (see primaryService in slots.ts).
  // Starts are DERIVED from it (windows − bookings − length), never read off a
  // pre-sliced row's `booked` flag.
  const previewMin = primaryServiceMin(tutorData?.consultations ?? [], tutorData?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin)
  // The headline price shared by the rail + mobile bar. It reads off the SAME
  // flagship tier `previewMin` above is derived from, so the price and the times
  // beside it now describe one service. It used to be `fromPriceLabel`, i.e. the
  // CHEAPEST tier — the rail said „₾25-დან" while the browse card said „₾80" and
  // the service list said both. See primaryPriceLabel in slots.ts.
  const headlinePrice = primaryPriceLabel(
    tutorData?.consultations ?? [],
    tutorData?.price ?? TUTOR_DEFAULTS.price,
    previewMin,
  )
  // Absent from the payload until the profile carries it — 0 changes nothing.
  const bufferMin = typeof tutorData?.bufferMin === 'number' && tutorData.bufferMin > 0 ? tutorData.bufferMin : 0

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      <PublicTopBar initialUser={initialUser} />

      {/* pb: on mobile the page carries a fixed stack — the section pill at 150px
          and the booking bar below it — so the final section needs room to be
          scrolled ABOVE them. Without it the last paragraph could never be read
          in full, no matter how far you scrolled. */}
      <Container as="main" id="main" className="pt-4 sm:pt-7 lg:pt-9 pb-[168px] lg:pb-16">
        {/* Owner preview note — the expert opened their own profile from the
            editor's „ნახე შენი პროფილი“ button (?preview=1). Shown only when the
            signed-in viewer owns this profile, so a student never sees it.
            The page already resolves for the owner even while paused (nothing
            gates on available === false — only admin-suspension hides). */}
        {searchParams?.get('preview') === '1' && initialUser?.id && tutorData?.user?.id === initialUser.id && (
          <div className="mb-4 rounded-card border border-ink-200 bg-ink-50 p-3 flex items-center gap-2 text-small text-ink-600">
            <Icon.eye className="w-4 h-4 shrink-0 text-ink-400" />
            ასე გხედავს სტუდენტი.
          </div>
        )}
        {/* Paused-profile banner. Shown when the tutor has toggled visibility
            off on /tutor/profile — the detail page still resolves (existing
            students may have deep links) but explicit CTAs (StickyBookingCard,
            MobileBookingBar, ServicesSection) short-circuit their handlers so
            no new bookings can start. */}
        {tutorData && tutorData.available === false && (
          <div className="mb-4 sm:mb-6 rounded-card border border-warning-200 bg-warning-50 p-4 sm:p-5 flex items-start gap-3">
            <Icon.warn className="w-5 h-5 shrink-0 text-warning-700 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-body font-bold text-warning-800">ექსპერტი დროებით პაუზაზეა</div>
              <p className="text-small text-warning-800/85 mt-1 leading-snug">ახალი ჯავშანი შეჩერებულია. არსებული სესია აქტიურია და მიწერა შეგიძლია.</p>
            </div>
          </div>
        )}
        <div className="hidden sm:block">
          <Breadcrumb tutor={tutorData} />
        </div>

        <div className="sm:mt-6 grid lg:grid-cols-[1fr_360px] gap-8 xl:gap-12">

          {/* Left: scrollable content */}
          <div className="min-w-0">
            <VideoHero tutorId={tutorId} tutor={tutorData} requireAuth={requireAuth} viewerCantFav={viewerCantFav} />

            <AboutSection tutor={tutorData} />
            {/* Consultation tiers: a tapped card opens the shared BookingFlow
                with that tier preselected — the flow enumerates by the tier's
                minutes, restates ITS price and sends consultationId (the
                server books the Consultation row's authoritative values). */}
            <ServicesSection consultations={tutorData?.consultations ?? []} onBook={openServiceBooking} />
            {/* Inline availability (1.6) — the shared flow's calendar/slot
                view rendered in-page, viewer-local tz. Tapping a time opens
                the booking Sheet with the slot preselected. Hidden while the
                expert is paused (booking is closed anyway). */}
            {!isPaused && (
              <section id="schedule" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
                <Eyebrow className="mb-3">განრიგი</Eyebrow>
                <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">თავისუფალი დროები</h2>
                <p className="mt-2 text-body text-ink-500 max-w-[520px]">აირჩიე დრო — ჯავშანი არჩეული დროით გაიხსნება.</p>
                <div className="mt-6">
                  {detailsState === 'pending' ? (
                    // The picker reads an empty `availability` as „no free
                    // times" — with the seed carrying none, that empty state
                    // would fire before the fetch even lands.
                    <div className="rounded-card border border-ink-200 bg-white p-4 sm:p-6 motion-safe:animate-pulse" aria-busy="true">
                      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
                        <div className="h-[260px] rounded-card bg-ink-100" />
                        <div className="hidden lg:grid grid-cols-2 gap-2 content-start">
                          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-11 rounded-btn bg-ink-100" />)}
                        </div>
                      </div>
                      <span className="sr-only">თავისუფალი დროები იტვირთება…</span>
                    </div>
                  ) : detailsState === 'failed' ? (
                    <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-6 py-8 text-center">
                      <div className="font-display text-body-lg font-bold text-ink-900">დროები ვერ ჩაიტვირთა</div>
                      <p className="text-small text-ink-500 mt-1.5">ქსელის დროებითი ხარვეზი — სცადე თავიდან.</p>
                      <Btn variant="secondary" onClick={() => setLoadAttempt(a => a + 1)} className="mt-4">
                        <Icon.refresh className="w-4 h-4" /> სცადე თავიდან
                      </Btn>
                    </div>
                  ) : (
                    <InlineAvailability
                      availability={tutorData?.availability ?? []}
                      busySlots={tutorData?.busySlots ?? []}
                      sessionMin={previewMin}
                      bufferMin={bufferMin}
                      priceLabel={headlinePrice.label}
                      tutorName={tutorData?.user?.fullName ?? TUTOR_DEFAULTS.name}
                      tutorId={tutorData?.id}
                      consultations={tutorData?.consultations ?? []}
                      onPickSlot={openSlotBooking}
                      categorySlug={tutorData?.category?.slug ?? null}
                      onPropose={() => setBookingOpen(true)}
                    />
                  )}
                </div>
              </section>
            )}
            <ExperienceSection items={tutorData?.experience ?? []} />
            <EducationSection items={tutorData?.education ?? []} />
            <CertificatesSection items={tutorData?.certificates ?? []} />
            <Reviews
              reviews={tutorData?.reviews ?? []}
              rating={tutorData?.rating ?? 0}
              total={tutorData?.reviewsCount ?? 0}
              verified={!!tutorData?.verified}
              expertFeatured={!!tutorData?.featured}
              // reviewsCount is seeded, the review ROWS are not — without this
              // the histogram drew all-zero bars next to a real total.
              loading={detailsState === 'pending'}
            />
          </div>

          {/* Right: sticky booking — desktop only */}
          <div className="hidden lg:block">
            <StickyBookingCard
                canProposeCategory={isAbroadProfile}
              onOpen={openPaid}
              availability={tutorData?.availability ?? []}
              busySlots={tutorData?.busySlots ?? []}
              slotsState={detailsState}
              onRetrySlots={() => setLoadAttempt(a => a + 1)}
              tutorPrice={tutorData?.price ?? TUTOR_DEFAULTS.price}
              sessionMin={previewMin}
              bufferMin={bufferMin}
              sessionsCount={tutorData?.sessionsCount ?? 0}
              rating={tutorData?.rating ?? 0}
              reviewsCount={tutorData?.reviewsCount ?? 0}
              signedIn={signedIn}
              consultations={tutorData?.consultations ?? []}
              canMessage={canMessage}
              onMessage={onMessageExpert}
              isOwnProfile={isOwnProfile}
              viewerCantBook={viewerCantBook}
            />
          </div>
        </div>

        {/* Similar experts — FULL WIDTH, deliberately outside the two-column
            grid (moved 2026-08-05). Inside the 1fr column it shared the row
            with the 360px booking rail, so the section measured 808px and its
            4-up grid gave each card 193px: after p-4 and the 60px photo the
            text column was 89px, which truncated every name and let the
            category chip (min-content 114px — Georgian category words don't
            break) hang 26px outside the card. At full width the same cards
            are 295px and everything fits. Nothing here belongs to the rail's
            row, so it costs nothing to lift out. */}
        <SimilarExperts
          excludeId={tutorId}
          categorySlug={tutorData?.category?.slug ?? null}
          categoryName={tutorData?.category?.name ?? null}
        />
      </Container>

      {/* The fixed mobile booking bar overlays the page bottom. The clearance
          covers its TALLEST state — the one that still renders a status strip
          („paused" / „no published time" / load failure), which wraps to two
          lines at 390px. In the ordinary bookable state the bar is now ~72px,
          since the strip no longer carries a line there at all. The
          footer lives OUTSIDE the main Container, so it carries the clearance
          itself — with only the Container's old pb-24 the last footer row was
          permanently unreachable on a phone. */}
      <div className="pb-[calc(128px+env(safe-area-inset-bottom))] lg:pb-0">
        <SharedFooter />
      </div>

      {/* Floating section nav — rendered at page level (a fixed layer), and
          hidden while a dialog owns the screen so it can't float over it. */}
      <SectionNav items={navItems} hidden={bookingOpen || (needsAuth && !authDismissed && signedIn === false)} />

      {/* Mobile sticky bottom booking */}
      <MobileBookingBar
              canProposeCategory={isAbroadProfile}
        onBook={openPaid}
        priceLabel={headlinePrice.label}
        sessionMin={previewMin}
        bufferMin={bufferMin}
        signedIn={signedIn}
        paused={isPaused}
        availability={tutorData?.availability ?? []}
        busySlots={tutorData?.busySlots ?? []}
        slotsState={detailsState}
        onRetrySlots={() => setLoadAttempt(a => a + 1)}
        canMessage={canMessage}
        onMessage={onMessageExpert}
        isOwnProfile={isOwnProfile}
        viewerCantBook={viewerCantBook}
      />

      {/* Point-of-tap auth prompt — replaces the old top-of-page banner. */}
      {needsAuth && !authDismissed && signedIn === false && (
        <AuthPromptSheet
          tutorId={tutorId}
          intent={authIntent}
          start={authStart}
          serviceId={authServiceId}
          onDismiss={() => setAuthDismissed(true)}
        />
      )}

      <BookingFlow
        open={bookingOpen}
        // Closing drops the tapped tier/slot too — the next generic open must
        // not silently rebook the previous selection.
        onClose={() => { setBookingOpen(false); setSelectedService(null); setBookingStart(null) }}
        tutorId={tutorId}
        tutor={bookingTutorInfo}
        initialStart={bookingStart}
        initialTopic={rebookTopic}
        initialService={selectedService}
      />
    </div>
  )
}
