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
      aria-label="Cookie consent"
      // z-[60] — ABOVE page chrome (headers z-40, BottomNav z-40, mobile CTA
      // bars z-[65]… which the CSS lift rule moves the banner clear of anyway)
      // but BELOW every full-screen overlay: the mobile nav drawer (z-[70]),
      // Sheet (80), ConfirmModal (90), toasts (95). It used to be z-[70] AND
      // rendered after {children} in AppShell, so it tied with the nav drawer
      // and won on DOM order — covering the drawer's „დაწყება" button.
      className="fixed bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:bottom-4 sm:max-w-md z-[60] motion-safe:animate-[fadeIn_220ms_ease-out]"
    >
      <div className="rounded-card border border-ink-200 bg-white shadow-pop p-4 sm:p-4">
        <p className="text-[12.5px] leading-[1.55] text-ink-800">
          ვიყენებთ ქუქიებს პლატფორმის მუშაობისთვის.{' '}
          <Link href="/cookies" className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">
            ქუქიების პოლიტიკა
          </Link>
        </p>
        <div className="mt-3 flex items-center gap-2 justify-end flex-wrap">
          <button
            type="button"
            onClick={() => decide('necessary')}
            className="h-9 px-3 rounded-btn text-ink-600 hover:text-ink-900 font-display font-semibold text-[12.5px] transition-colors"
          >
            მხოლოდ საჭირო
          </button>
          <button
            type="button"
            onClick={() => decide('accepted')}
            className="h-9 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] transition-colors"
          >
            თანხმობა
          </button>
        </div>
      </div>
    </div>
  )
}
