'use client'
// /me — the workspace home. Owns the fetches and composes the sections,
// each of which lives in a `_*.tsx` beside this file.

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/Skeleton'
import { Container } from '@/components/Container'
import { Discover } from './_discover'
import { FavState, MeData, SavedExpert } from './_model'
import { SavedStrip } from './_saved'
import { MyRequestsSection } from './_requests'
import { OnboardingTour, Welcome } from './_welcome'

/* ───── Page ───── */
/* ───── Dashboard "home" section — wraps the original main content ───── */
const HomeSection = ({ me, favs, favState, reloadFavs }: {
  me: MeData | null
  favs: SavedExpert[]
  favState: FavState
  reloadFavs: () => void
}) => {
  /* BLANK SLATE. A brand-new account has nothing in every one of these panels,
     and each empty panel used to render its own „find an expert" card — four
     identical CTAs in four shells, pushing the only real content (Discover)
     ~1300px down. With nothing saved there is exactly one thing to do, so we
     show exactly one place to do it: the Welcome search + the expert grid.

     ⚠️ IT USED TO COUNT BOOKINGS TOO (2026-08-24), and three of the four panels
     it was protecting the reader from were the booking product: the next
     session, the session list and the package credits. What is left is what a
     client actually has here — their requests, what they saved, and who is
     new. */
  const blankSlate = favState === 'ready' && favs.length === 0

  return (
    <>
      <Welcome me={me} />
      <OnboardingTour userId={me?.id} joinedAt={(me as { createdAt?: string } | null)?.createdAt} />
      <Container as="main" className="py-8 lg:py-10">
        {/* The client's own service requests — renders nothing without any, and
            nothing on a deployment without the subsystem, so the blank-slate
            rule above is untouched. */}
        <div className="mb-6 empty:mb-0">
          <MyRequestsSection />
        </div>
        <div className={blankSlate ? '' : 'mb-8'}>
          <Discover onOpen={t => { window.location.href = `/experts/${t.id}` }} />
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
  // Favorites live here (not inside SavedStrip) because the blank-slate rule in
  // <HomeSection> needs the count. 'error' stays distinct from an empty list.
  const [favs, setFavs] = useState<SavedExpert[]>([])
  const [favState, setFavState] = useState<FavState>('loading')

  // Canonical signed-out destination — same param requireUser() uses, so
  // sign-in returns the user straight back here.
  const goSignin = useCallback(() => {
    window.location.replace(`/signin?redirect=${encodeURIComponent('/me')}`)
  }, [])

  const loadFavs = useCallback(async () => {
    setFavState('loading')
    try {
      const res = await fetch('/api/favorites')
      if (!res.ok) throw new Error('favorites failed')
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error('bad shape')
      // Real API fields only — the old strip decorated favorites with stock
      // pravatar photos and a hardcoded "90% match" badge, which lied.
      // Real API fields only — the old strip decorated favourites with stock
      // photos and a hardcoded „90% match" badge, which lied.
      setFavs(data.map((f: any, i: number) => ({
        id: f.provider?.slug ?? f.provider?.id ?? String(i),
        name: f.provider?.company?.name ?? f.provider?.user?.fullName ?? 'ექსპერტი',
        avatar: f.provider?.id ? `/api/masters/${f.provider.id}/photo` : (f.provider?.user?.avatarUrl ?? null),
        cat: f.provider?.category?.name ?? '',
        // 🔒 NEVER INVENT A NUMBER — null means „they quote per job".
        priceLabel: typeof f.provider?.priceFrom === 'number' ? `${f.provider.priceFrom}₾-დან` : 'ფასს შემოგთავაზებს',
        rating: f.provider?.rating ?? 0,
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
    // Favourites load in PARALLEL with the session check — no waterfall behind
    // /api/me. If the session is actually gone this call 401s and redirects
    // exactly like checkAuth would.
    loadFavs()
  }, [checkAuth, loadFavs])

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
              onClick={() => { checkAuth(); loadFavs() }}
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
    <HomeSection me={me} favs={favs} favState={favState} reloadFavs={loadFavs} />
  )
}
