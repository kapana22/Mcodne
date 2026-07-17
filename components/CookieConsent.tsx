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

  useEffect(() => {
    setMounted(true)
    if (readStored() === null) setVisible(true)
  }, [])

  if (!mounted || !visible) return null

  const decide = (choice: Decision) => {
    writeStored(choice)
    setVisible(false)
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:bottom-4 sm:max-w-md z-[60] motion-safe:animate-[fadeIn_220ms_ease-out]"
    >
      <div className="rounded-card border border-warning-200 bg-warning-50 shadow-pop p-4 sm:p-4">
        <p className="text-[12.5px] leading-[1.55] text-ink-800">
          ვიყენებთ cookie-ებს პლატფორმის მუშაობისთვის.{' '}
          <Link href="/cookies" className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">
            წესები
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
