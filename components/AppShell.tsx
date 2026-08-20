'use client'
// AppShell — thin client boundary mounted from the root layout so we can
// host client-only providers (toasts) and floating widgets (cookie banner,
// mobile bottom navigation) without turning the whole layout into a client
// component.

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ToastProvider } from './ToastProvider'
import { CookieConsent } from './CookieConsent'
import { BottomNav } from './BottomNav'
import { isRequestPath, isProviderWorkspacePath } from '@/lib/requests'
import { BackToTop } from './BackToTop'
import { HelpWidget } from './HelpWidget'
import { NavProgress } from './NavProgress'
import { ClientErrorReporter } from './ClientErrorReporter'
import { fetchMe } from '@/lib/me'

type Role = 'STUDENT' | 'TUTOR' | 'ADMIN'

// sessionStorage, not localStorage: a remembered scroll position is meaningful
// only inside the tab (and the history stack) that produced it.
const SCROLL_KEY = 'mcodne:scroll:'

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  // The requests subsystem carries its own chrome and suppresses this one —
  // see the block around <BottomNav> below.
  const inRequests = isRequestPath(path ?? '')
  // …except the master's WORKSPACE (M1, 2026-08-18). Its three screens
  // (/work/requests, /work/offers, /work/service-profile — since stage 6 under
  // the shared /work prefix, and ONLY those three) are inside the subsystem's
  // path list, so they inherited the wizard's „no furniture" rule and a master
  // working from a phone had neither a top nav that fit nor a bottom one at
  // all. The rule was written for the intake, which somebody finishes in one
  // sitting; a workspace is the opposite — you come back to it. So the
  // workspace keeps the tab bar (and BackToTop, its lists are long) and only
  // the help bubble stays away, its content being the expert product's.
  const inProviderSpace = isProviderWorkspacePath(path ?? '')
  // Determines the user's role for the mobile bottom nav. `/api/me` returns
  // `{ user: null }` for anonymous visitors, which we pass through as `null`
  // — BottomNav short-circuits to render nothing.
  //
  // Re-checked on every client-side route change (not just mount): AppShell
  // lives in the root layout and never remounts across SPA navigations, so a
  // fetch-once role would keep serving STALE tabs after any in-app session
  // transition (impersonation, applicant→tutor promotion) until a hard
  // reload. The previous role stays on screen while the re-check is in
  // flight, so there's no flicker on ordinary navigations.
  const [role, setRole] = useState<Role | null>(null)
  // True for exactly one path change: the one caused by back/forward.
  //
  // Seeded from the NAVIGATION TYPE, not only from the `popstate` listener.
  // Going back can also reload the document (bfcache miss, a hard forward
  // navigation, a fresh tab restored from history) — and in that case popstate
  // has already fired before React mounted, so a listener alone would miss it
  // and dump the reader at the top. This was the actual behaviour the first
  // time round; the browser tells us plainly, so ask it.
  const poppedRef = useRef<boolean | null>(null)
  if (poppedRef.current === null) {
    let popped = false
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      popped = nav?.type === 'back_forward'
    } catch { /* older browsers: fall back to the listener */ }
    poppedRef.current = popped
  }
  // True from the instant a navigation is initiated until the new path settles.
  const navigatingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    // Shared probe (lib/me): concurrent mount-time callers on this page collapse
    // to ONE /api/me request; a new pathname re-invokes it for a fresh role.
    fetchMe()
      .then(m => {
        if (cancelled) return
        const r = m?.role as Role | undefined
        if (r === 'STUDENT' || r === 'TUTOR' || r === 'ADMIN') setRole(r)
        else setRole(null)
      })
      .catch(() => { if (!cancelled) setRole(null) })
    return () => { cancelled = true }
  }, [path])

  // Scroll to top on every FORWARD client-side navigation. Next's default
  // scroll-reset doesn't reliably fire with our pathname-keyed fade-in wrapper,
  // so a new page could open scrolled to wherever the previous one was. Skip
  // when the URL carries a hash: an in-page anchor (#chat, etc.) owns its scroll.
  //
  // BACK IS DIFFERENT (2026-07-30). This effect used to fire on back/forward
  // too, which threw the reader to the top of a list they had just spent time
  // scrolling: browse → open the 7th expert → Back → start over. Comparing
  // experts, the single most common thing anyone does here, cost a re-scroll
  // every time. Now a POP navigation restores the position we recorded for that
  // path instead.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPop = () => { poppedRef.current = true }
    // The browser's own restoration fights ours and lands a frame apart, which
    // reads as a jump. We own it.
    const prev = window.history.scrollRestoration
    try { window.history.scrollRestoration = 'manual' } catch {}
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      try { window.history.scrollRestoration = prev } catch {}
    }
  }, [])

  // Record where the reader is, per path. rAF-coalesced so a scroll gesture
  // writes once per frame at most.
  //
  // …and STOP the moment a navigation begins. This is the subtle part, and it
  // cost two deploys to find: leaving a page fires a burst of scroll events as
  // the router resets to the top, and those events are still carrying the OLD
  // path's key. They overwrote a hard-won 1400 with 137 — a position the reader
  // never chose and never saw. `navigating` closes the recorder before the
  // router touches anything.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let raf = 0
    const save = () => {
      raf = 0
      if (navigatingRef.current) return
      try { sessionStorage.setItem(SCROLL_KEY + path, String(window.scrollY)) } catch {}
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(save) }
    // Capture phase: this has to win the race against Next's Link handler, or
    // the navigation is already under way and the burst has begun.
    const onNavStart = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== '_self')) return
      const href = a.getAttribute('href') || ''
      if (!href || href.startsWith('#')) return
      navigatingRef.current = true
    }
    const onPopStart = () => { navigatingRef.current = true }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onNavStart, true)
    window.addEventListener('popstate', onPopStart)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onNavStart, true)
      window.removeEventListener('popstate', onPopStart)
      // Cancel, and deliberately do NOT flush. Saving on cleanup looks like the
      // careful thing to do and is the exact opposite: by the time this runs the
      // router has already reset the scroll for the incoming page, so `save()`
      // wrote 0 OVER the position we spent the whole visit recording. Measured:
      // /experts held 1400 while browsing and 0 the moment a card was clicked.
      // The rAF writes during the scroll itself are the record; this only tidies.
      if (raf) cancelAnimationFrame(raf)
    }
  }, [path])

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash) return
    navigatingRef.current = false
    if (!poppedRef.current) { window.scrollTo(0, 0); return }
    poppedRef.current = false
    const y = Number(sessionStorage.getItem(SCROLL_KEY + path) || 0)
    if (!(y > 0)) { window.scrollTo(0, 0); return }
    // The target may be taller than the DOM is right now (images, lazy blocks),
    // so a single scrollTo would land short. Re-apply over a few frames until
    // the position sticks, then stop — bounded, so it can never fight the user.
    let tries = 0
    let raf = 0
    const settle = () => {
      window.scrollTo(0, y)
      if (++tries < 12 && Math.abs(window.scrollY - y) > 2) raf = requestAnimationFrame(settle)
    }
    raf = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(raf)
  }, [path])

  // Cross-tab session guard. When the session identity changes in ANY tab
  // (admin impersonation start/exit, sign-out), that tab writes the
  // `mcodne:session-changed` key; every OTHER tab hard-reloads so it can never
  // keep rendering a page for the previous identity — the exact "logged in as
  // admin, still looking at the tutor dashboard as a student" cross-tab stale
  // shell. The initiating tab does its own hard navigation, and `storage`
  // doesn't fire in the tab that wrote it, so there's no double reload.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mcodne:session-changed') window.location.reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <ToastProvider>
      <NavProgress />
      <ClientErrorReporter />
      {/* Keyed on pathname so every client-side route change remounts the
          subtree and re-plays the `animate-fade-in` entrance. Server-side navigations
          get the same effect naturally on initial paint. */}
      {/* ⚠️ EXCEPT INSIDE THE INTAKE, WHICH IS ONE ROOM (stage 10, 2026-08-19).
          The wizard turns into the live room in place — no navigation — and
          rewrites the address bar to /request/<ref> with history.replaceState
          so a refresh lands on the room. Next hears that and updates the
          pathname; a key on the pathname would then remount this subtree, throw
          the just-sent state away and put an empty wizard under the room's
          address. So the request pages share one key: moving between the
          wizard, its room and /request/<ref> is a step inside the same errand,
          drawn by the same chrome (app/request/_shell), and does not re-play a
          page entrance. The master's workspace keeps the per-path key like the
          rest of the site — it is a workspace, not the intake. */}
      <div key={inRequests && !inProviderSpace ? '/request' : (path ?? '/')} className="motion-safe:animate-fade-in">
        {children}
      </div>
      <CookieConsent />
      {/* ⚠️ THE REQUESTS SUBSYSTEM GETS NO SITE FURNITURE. It is a separate
          space with its own chrome (app/request/_shell) and a wizard somebody
          is meant to finish in one sitting — a bottom nav offering four other
          destinations, a floating help bubble and a back-to-top button are
          three invitations to leave mid-form. It also has to read as its own
          world rather than as a page of this site, which is the whole reason
          it is unlinked.

          Path-based and therefore honest about what it is: a presentation
          rule, not a guard. The routes gate themselves — see
          lib/requestsServer → requestsViewer. */}
      {(!inRequests || inProviderSpace) && (
        <>
          {/* Long-page comfort. Self-gating (appears past 2 viewports), so it
              costs nothing on short routes and needs no per-page opt-in. */}
          <BackToTop />
          {/* Sits above BackToTop (z-46 vs 45) and offset upward so the two
              never overlap; hides itself entirely while a mobile booking CTA
              owns the bottom edge — see HelpWidget. */}
          {!inProviderSpace && <HelpWidget />}
          <BottomNav role={role} />
        </>
      )}
    </ToastProvider>
  )
}
