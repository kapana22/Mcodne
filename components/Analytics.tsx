'use client'
// Google Analytics 4 — loaded ONLY after the user accepts cookies (the
// CookieConsent banner writes 'accepted' and dispatches `mcodne:consent`).
// The measurement id is admin-managed (passed from the DB via layout); it falls
// back to NEXT_PUBLIC_GA_ID if that's set. No id or no consent → nothing loads,
// no cookies, nothing sent. SPA page views are sent per client-side navigation.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const CONSENT_KEY = 'mcodne:cookie-consent'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

function hasConsent(): boolean {
  try { return window.localStorage.getItem(CONSENT_KEY) === 'accepted' } catch { return false }
}

function loadGa(id: string) {
  if (window.gtag) return
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer!.push(arguments) } as unknown as (...args: unknown[]) => void
  window.gtag('js', new Date())
  window.gtag('config', id, { anonymize_ip: true })
  const s = document.createElement('script')
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  s.async = true
  document.head.appendChild(s)
}

export function Analytics({ gaId }: { gaId?: string }) {
  const pathname = usePathname()
  const id = (gaId && gaId.trim()) || process.env.NEXT_PUBLIC_GA_ID || ''

  useEffect(() => {
    if (!id) return
    if (hasConsent()) loadGa(id)
    const onConsent = (e: Event) => {
      if ((e as CustomEvent).detail === 'accepted') loadGa(id)
    }
    window.addEventListener('mcodne:consent', onConsent)
    return () => window.removeEventListener('mcodne:consent', onConsent)
  }, [id])

  useEffect(() => {
    if (!id || !window.gtag) return
    window.gtag('event', 'page_view', { page_path: pathname })
  }, [pathname, id])

  return null
}
