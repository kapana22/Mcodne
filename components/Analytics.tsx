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

/**
 * ⚠️ THE MEASUREMENT ID COMES FROM THE DATABASE, AND THERE IS ONE DATABASE
 * (2026-08-21). `gaId` is admin-managed and read from the same Postgres a
 * developer's `.env` points at, so a local `next dev` loads the LIVE property
 * the moment somebody clicks „თანხმობა" on the cookie banner. Measured while
 * QA-ing the booking flow: every step sent a real `page_view` and
 * `user_engagement` to G-4WFNGD5WNX with `dl=http://localhost/...`.
 *
 * That is not a privacy problem — consent was given and it is our own machine
 * — it is a NUMBERS problem, and this site decides things by its numbers. An
 * afternoon of walking the funnel by hand is a few dozen sessions that look
 * exactly like visitors, on the one report that says whether the funnel works.
 * CLAUDE.md rule 6 is „never invent a number"; a dev session in the funnel
 * report is an invented number arriving by accident.
 *
 * The host, not NODE_ENV: `next build && next start` on a laptop is
 * `production`, and so is a preview deploy. Where the browser actually IS is
 * the honest question, and it is the one Google is being told the answer to.
 */
function isRealVisitor(): boolean {
  const h = window.location.hostname
  return h !== 'localhost' && h !== '127.0.0.1' && h !== '::1' && !h.endsWith('.local')
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
    if (!isRealVisitor()) return
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
