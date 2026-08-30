'use client'
// CookieConsent — small warm-tinted banner pinned to the bottom of the
// viewport. Non-blocking (does not overlay the whole screen). Persists the
// user's decision in localStorage under `mcodne:cookie-consent` and never
// shows again after the first choice.
//
// Values written to localStorage: 'accepted' | 'necessary'
//
// Mounted at layout level. See app/layout.tsx.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const STORAGE_KEY = 'mcodne:cookie-consent'

type Decision = 'accepted' | 'necessary'

function readStored(): Decision | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'accepted' || v === 'necessary' ? v : null
  } catch {
    // localStorage can throw in privacy modes — treat as "no decision yet".
    return null
  }
}

function writeStored(v: Decision) {
  try { window.localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
}

export function CookieConsent() {
  // `mounted` gates render so SSR doesn't try to read localStorage.
  // Without it we'd hydrate a banner state that mismatches the server output.
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
    if (readStored() === null) setVisible(true)
  }, [])

  // The consent banner is for public visitors — it's noise inside the admin
  // panel (the site owner's own tooling), so never render it there.
  if (pathname?.startsWith('/admin')) return null
  if (!mounted || !visible) return null

  const decide = (choice: Decision) => {
    writeStored(choice)
    setVisible(false)
    // Let listeners (Analytics) react immediately — GA starts on 'accepted'
    // without waiting for the next full page load.
    try { window.dispatchEvent(new CustomEvent('mcodne:consent', { detail: choice })) } catch { /* ignore */ }
  }

  return (
    <div
      role="region"
      // KEEP THIS LABEL VERBATIM: globals.css targets the banner by
      // `[aria-label="Cookie consent"]` to lift it clear of the mobile tab bar
      // and of any sticky booking bar. Rename it and both offsets go dark.
      aria-label="Cookie consent"
      // z-consent — still ABOVE page chrome (headers z-40, BottomNav z-40) and
      // still BELOW every full-screen overlay: the mobile nav drawer (z-drawer),
      // Sheet (80), ConfirmModal (90), toasts (95). It used to be z-drawer AND
      // rendered after {children} in AppShell, so it tied with the nav drawer
      // and won on DOM order — covering the drawer's „დაწყება" button.
      //
      // Dropped 60 → 50 on 2026-08-02: at 1440px the banner sits bottom-left and
      // at z-60 it painted OVER the expert profile's section-nav pill (z-pill)
      // and the top of the availability calendar — i.e. over the two controls a
      // visitor uses to decide, while asking them about cookies. Everything
      // between 50 and 55 is a decision surface; consent is not one, so it
      // yields. On mobile the CTA bar is z-overlay and the CSS lift already moves
      // the banner off it entirely, so nothing there depends on this number.
      className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:left-4 sm:right-auto sm:bottom-4 sm:max-w-md z-consent motion-safe:animate-fade-in-fast"
    >
      {/* ONE ROW ON MOBILE, a card from sm up (2026-08-02). As a card at 390px
          this was ~117px of an 844px viewport, and stacked with the profile's
          booking bar it took 249px — 29% of the screen, covering the decision
          it was interrupting. A bar flush to the bottom edge with the copy
          trimmed to what it has to say is ~56px. Same buttons, same consent
          logic (components/Analytics.tsx gates GA on it) — only the geometry
          and the wording length change. */}
      <div className="bg-white shadow-pop border-t border-ink-200 sm:border sm:rounded-card flex items-center gap-2 sm:block px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:p-4 sm:pb-4">
        <p className="flex-1 min-w-0 text-meta sm:text-small leading-snug sm:leading-[1.55] text-ink-700 sm:text-ink-800">
          <span className="sm:hidden">ვიყენებთ ქუქიებს.</span>
          <span className="hidden sm:inline">ვიყენებთ ქუქიებს პლატფორმის მუშაობისთვის.</span>{' '}
          {/* `.tap-area` and not padding: this link sits INSIDE a sentence in a
              bar that is deliberately ~56px tall on a phone, so growing the box
              would reflow the copy it is part of. The utility hangs an
              invisible ≥40px ::before over a 14px line instead — CLAUDE.md
              rule 3 without moving a neighbour. See app/globals.css. */}
          <Link href="/cookies" className="tap-area font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">
            <span className="sm:hidden">პოლიტიკა</span>
            <span className="hidden sm:inline">ქუქიების პოლიტიკა</span>
          </Link>
        </p>
        <div className="shrink-0 flex items-center gap-2 justify-end sm:mt-3 sm:flex-wrap">
          <button
            type="button"
            onClick={() => decide('necessary')}
            className="h-10 sm:h-9 px-2.5 sm:px-3 rounded-btn text-ink-600 hover:text-ink-900 font-display font-semibold text-small whitespace-nowrap transition-colors duration-fast"
          >
            {/* „მხოლოდ საჭირო" doesn't fit the one-row bar at 390px; „საჭირო"
                carries the same meaning next to „თანხმობა". */}
            <span className="sm:hidden">საჭირო</span>
            <span className="hidden sm:inline">მხოლოდ საჭირო</span>
          </button>
          <button
            type="button"
            onClick={() => decide('accepted')}
            className="h-10 sm:h-9 px-3 sm:px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-small whitespace-nowrap transition-colors duration-fast"
          >
            თანხმობა
          </button>
        </div>
      </div>
    </div>
  )
}
