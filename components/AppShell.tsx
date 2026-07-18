'use client'
// AppShell — thin client boundary mounted from the root layout so we can
// host client-only providers (toasts) and floating widgets (cookie banner,
// mobile bottom navigation) without turning the whole layout into a client
// component.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ToastProvider } from './ToastProvider'
import { CookieConsent } from './CookieConsent'
import { BottomNav } from './BottomNav'
import { fetchMe } from '@/lib/me'

type Role = 'STUDENT' | 'TUTOR' | 'ADMIN'

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
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
      {/* Keyed on pathname so every client-side route change remounts the
          subtree and re-plays the `.page-in` fade. Server-side navigations
          get the same effect naturally on initial paint. */}
      <div key={path ?? '/'} className="motion-safe:animate-fade-in">
        {children}
      </div>
      <CookieConsent />
      <BottomNav role={role} />
    </ToastProvider>
  )
}
