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
  // Fetch once on mount to determine the user's role for the mobile bottom
  // nav. `/api/me` returns `{ user: null }` for anonymous visitors, which we
  // pass through as `null` — BottomNav short-circuits to render nothing.
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
