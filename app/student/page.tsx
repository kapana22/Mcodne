'use client'
// /student — the workspace home. Owns the fetches and composes the sections,
// each of which lives in a `_*.tsx` beside this file.

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/Skeleton'
import { Container } from '@/components/Container'
import { StudentPackages } from './_packages'
import { Discover } from './_discover'
import { FavState, MeData, SavedExpert } from './_model'
import { NextSession } from './_next'
import { SavedStrip } from './_saved'
import { SessionsPanel } from './_sessions'
import { OnboardingTour, Welcome } from './_welcome'
import { primaryPriceLabel, TUTOR_DEFAULTS } from '@/components/booking/slots'

/* ───── Page ───── */
/* ───── Dashboard "home" section — wraps the original main content ───── */
const HomeSection = ({ me, bookings, bookingsLoading, bookingsError, reload, onOpenDetail, favs, favState, reloadFavs }: { me: MeData | null; bookings: any[]; bookingsLoading: boolean; bookingsError: string | null; reload: () => Promise<void> | void; onOpenDetail: (id?: string) => void; favs: SavedExpert[]; favState: FavState; reloadFavs: () => void }) => {
  /* BLANK SLATE. A brand-new account has nothing in every one of these panels,
     and each empty panel used to render its own „find an expert" card — four
     identical CTAs in four shells, pushing the only real content (Discover)
     ~1300px down. With zero bookings AND zero saved experts there is exactly
     one thing to do, so we show exactly one place to do it: the Welcome search
     + the expert grid. A load ERROR is never treated as „empty" — SessionsPanel
     has to stay mounted to show its retry banner. */
  const blankSlate =
    !bookingsLoading && !bookingsError && bookings.length === 0 &&
    favState === 'ready' && favs.length === 0

  return (
    <>
      <Welcome me={me} bookings={bookings} />
      <OnboardingTour userId={me?.id} hasBookings={bookings.length > 0} joinedAt={(me as any)?.createdAt} />
      <Container as="main" className="py-8 lg:py-10">
        {/* Primary: the user's own sessions come FIRST, full-width — the old
            quick-book sidebar duplicated the hero search and is gone.
            Discovery (recommendations, saved strip) follows below. */}
        {/* Packages ABOVE the session list, and above the blankSlate branch:
            a client with credits but no bookings yet is exactly the person this
            card exists for, and they would otherwise land on an empty
            dashboard holding lessons they paid for. Renders nothing when there
            are no packages. */}
        <div className="mb-6 empty:mb-0">
          <StudentPackages />
        </div>
        {!blankSlate && (
          <>
            <div className="mb-6">
              <NextSession bookings={bookings} loading={bookingsLoading} onOpenDetail={onOpenDetail} onOpenExpert={() => {}} />
            </div>
            <div className="mb-8">
              <SessionsPanel bookings={bookings} loading={bookingsLoading} loadError={bookingsError} reload={reload} onOpenSession={s => onOpenDetail(s.id)} />
            </div>
          </>
        )}
        <div className={blankSlate ? '' : 'mb-8'}>
          <Discover onOpen={(t) => { window.location.href = `/tutors/${t.id}` }} />
        </div>
        {!blankSlate && (
          <div>
            <SavedStrip items={favs} loadState={favState} onRetry={reloadFavs} />
          </div>
        )}
      </Container>
    </>
  )
}

export default function Dashboard() {
  const [me, setMe] = useState<MeData | null>(null)
  // 'checking' until /api/me resolves — we render a neutral loader, never the
  // authed shell, so unauthenticated visitors don't flash logged-in UI before
  // the redirect. The parent layout gates the initial server render, but that
  // guard does NOT re-run on client-side nav, so this re-verifies per mount.
  // 'error' is a first-class state: a hung request, 5xx, or non-JSON body must
  // land on a visible retry card — NEVER an eternal spinner, and NEVER a bogus
  // bounce of a still-authed user to /signin.
  const [authState, setAuthState] = useState<'checking' | 'authed' | 'error'>('checking')
  const [bookings, setBookings] = useState<any[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  // Favorites live here (not inside SavedStrip) because the blank-slate rule in
  // <HomeSection> needs the count. 'error' stays distinct from an empty list.
  const [favs, setFavs] = useState<SavedExpert[]>([])
  const [favState, setFavState] = useState<FavState>('loading')

  // Canonical signed-out destination — same param requireUser() uses, so
  // sign-in returns the user straight back here.
  const goSignin = useCallback(() => {
    window.location.replace(`/signin?redirect=${encodeURIComponent('/student')}`)
  }, [])

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true)
    setBookingsError(null)
    try {
      const res = await fetch('/api/student/bookings')
      // Session died between page load and this call — the API now 401s
      // (JSON) instead of 307-ing to /signin HTML; route to signin ourselves.
      if (res.status === 401) { goSignin(); return }
      if (!res.ok) throw new Error('load failed')
      const d = await res.json()
      if (!Array.isArray(d)) throw new Error('bad shape')
      setBookings(d)
    } catch {
      setBookingsError('სესიების ჩატვირთვა ვერ მოხერხდა.')
    } finally {
      setBookingsLoading(false)
    }
  }, [goSignin])

  const loadFavs = useCallback(async () => {
    setFavState('loading')
    try {
      const res = await fetch('/api/favorites')
      if (!res.ok) throw new Error('favorites failed')
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error('bad shape')
      // Real API fields only — the old strip decorated favorites with stock
      // pravatar photos and a hardcoded "90% match" badge, which lied.
      setFavs(data.map((f: any, i: number) => ({
        id: f.tutor?.id ?? String(i),
        name: f.tutor?.user?.fullName ?? 'ექსპერტი',
        avatar: f.tutor?.user?.avatarUrl ?? null,
        // Real category or nothing — see app/tutors/_data.tsx.
        cat: f.tutor?.category?.name ?? '',
        priceLabel: primaryPriceLabel(
          Array.isArray(f.tutor?.consultations) ? f.tutor.consultations : [],
          f.tutor?.price ?? 0,
          f.tutor?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin,
        ).label,
        rating: f.tutor?.rating ?? 0,
      })))
      setFavState('ready')
    } catch {
      setFavState('error')
    }
  }, [])

  // Retryable session check. Every path settles authState: signed-out
  // redirects, success renders, and anything else (network drop, 5xx,
  // non-JSON 200) shows the retry card. The abort timer guarantees even a
  // request that never returns settles instead of wedging on „იტვირთება…".
  const checkAuth = useCallback(async () => {
    setAuthState('checking')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const res = await fetch('/api/me', { cache: 'no-store', signal: ctrl.signal })
      if (res.status === 401) { goSignin(); return }
      if (!res.ok) throw new Error(`me ${res.status}`)
      const d = await res.json()
      // /api/me returns 200 { user: null } (not 401) when the session is gone,
      // so a missing user is "signed out", not an error.
      if (!d?.user) { goSignin(); return }
      setMe(d.user)
      setAuthState('authed')
    } catch {
      setAuthState('error')
    } finally {
      clearTimeout(timer)
    }
  }, [goSignin])

  useEffect(() => {
    checkAuth()
    // Bookings load in PARALLEL with the session check — no waterfall behind
    // /api/me. If the session is actually gone this call 401s and redirects
    // exactly like checkAuth would.
    loadBookings()
    loadFavs()
  }, [checkAuth, loadBookings, loadFavs])

  // Neutral gate while we confirm the session — no authed chrome, no redirect
  // flash. On failure this becomes a visible dead-end-free error card with a
  // retry, never an indefinite spinner.
  if (authState !== 'authed') {
    // Content-shaped skeleton shell instead of a centered spinner: the page
    // reads as "already here, filling in" rather than "stuck loading" — the
    // dev/slow-network multi-second /api/me wait stops feeling broken.
    if (authState === 'checking') {
      // The workspace shell already provides the sidebar + top bar, so this
      // loading state renders ONLY the content skeleton (no internal header).
      return (
          // Same rhythm as the loaded page — a skeleton that pads differently
          // makes the content jump when it arrives.
          <Container className="py-8 lg:py-10" aria-busy="true">
            <Skeleton className="h-7 w-56 max-w-full mb-3" />
            <Skeleton className="h-4 w-80 max-w-full mb-8" />
            <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 mb-6">
              <Skeleton.Card />
              <Skeleton.Card className="hidden sm:block" />
            </div>
            <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
              {[0, 1, 2].map(i => (
                <div key={i} className="p-4 sm:p-5 flex items-center gap-3">
                  <Skeleton.Avatar size={40} />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton.Line width={35} />
                    <Skeleton.Line width={65} className="h-3" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </Container>
      )
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-ink-50/40 text-ink-900 px-6">
        <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain opacity-90 select-none" draggable={false} />
        {(
          <div className="text-center max-w-[360px]">
            <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">ვერ ჩაიტვირთა</div>
            <p className="text-small text-ink-500 mt-1.5 leading-relaxed">შეამოწმე ინტერნეტი და სცადე თავიდან.</p>
            <button
              type="button"
              onClick={() => { checkAuth(); if (bookingsError) loadBookings() }}
              className="mt-4 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast"
            >
              <Icon.refresh className="w-3.5 h-3.5" />
              სცადე თავიდან
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <HomeSection
      me={me}
      bookings={bookings}
      bookingsLoading={bookingsLoading}
      bookingsError={bookingsError}
      reload={loadBookings}
      onOpenDetail={(id) => { if (id) window.location.href = `/student/bookings/${id}` }}
      favs={favs}
      favState={favState}
      reloadFavs={loadFavs}
    />
  )
}
