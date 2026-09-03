'use client'
// /signin (and /signup — both routes render this) — the auth container.
// It reads the view from the URL and mounts one of the `_*.tsx` views beside it.

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { VIEW_TITLES, View, viewFromParams } from './_model'
import { OnboardingView } from './_onboarding'
import { ResetView } from './_reset'
import { SignInView } from './_signin'
import { SignUpView } from './_signup'
import { VerifyView } from './_verify'

/* ═══════════════════════════════════════════════════════════════════ */
/* PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

// Shared auth page client — rendered by BOTH routes:
//   /signin → <AuthPage defaultView="signin" />
//   /signup → <AuthPage defaultView="signup" />
// useSearchParams requires a Suspense boundary in Next 15.
export default function AuthPage({ defaultView = 'signin' }: { defaultView?: View }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-50" />}>
      <AuthInner defaultView={defaultView} />
    </Suspense>
  )
}

function AuthInner({ defaultView }: { defaultView: View }) {
  const params = useSearchParams()
  const router = useRouter()

  // View is derived from the URL — the single source of truth. This renders
  // the correct view on first paint (no signin flash for `?view=signup`) and
  // re-syncs automatically on browser back/forward or shared `?view=` links.
  // Without an explicit `?view=`, the route's own default applies (so `/signup`
  // shows the signup form on a clean URL).
  const view = viewFromParams(params, defaultView)

  // Keep the tab title in sync with the visible view (see VIEW_TITLES).
  useEffect(() => { document.title = VIEW_TITLES[view] }, [view])

  // Switching views navigates to the view's canonical URL so route and view
  // never drift: signin → /signin, signup → /signup (first-class routes),
  // everything else → /signin?view=…. Other params (email, redirect/next) are
  // preserved; push() keeps a back-navigable history.
  const setView = (next: View) => {
    const qp = new URLSearchParams(params?.toString() ?? '')
    qp.delete('view')
    // A failed-Google `?error=` belongs to the attempt that just failed, not to
    // whatever the visitor navigates to next — otherwise the banner follows
    // them onto the signup form.
    qp.delete('error')
    // Leaving the verify step via "სხვა ელფოსტა" (or back to signin) must not
    // carry the old address into the next form's prefill.
    if (view === 'verify') qp.delete('email')
    let path = '/signin'
    if (next === 'signup') path = '/signup'
    else if (next !== 'signin') qp.set('view', next)
    const qs = qp.toString()
    router.push(qs ? `${path}?${qs}` : path)
  }

  return (
    <div className="font-sans bg-ink-50 text-ink-900 antialiased">
      <PublicTopBar />
      {view === 'signin' && <SignInView setView={setView} />}
      {view === 'signup' && <SignUpView setView={setView} />}
      {view === 'verify' && <VerifyView setView={setView} />}
      {view === 'reset'  && <ResetView setView={setView} />}
      {view === 'onboarding' && <OnboardingView setView={setView} />}
      <Footer />
    </div>
  )
}
