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
    fetch('/api/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { user: null }))
      .then(d => {
        if (cancelled) return
        const r = d?.user?.role as Role | undefined
        if (r === 'STUDENT' || r === 'TUTOR' || r === 'ADMIN') setRole(r)
        else setRole(null)
      })
      .catch(() => { if (!cancelled) setRole(null) })
    return () => { cancelled = true }
  }, [path])

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
