'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// ⚠️ THREE KEYS LEFT THIS SHAPE ON 2026-08-26 — `requests`, `reschedules` and
// `noAvailability`. All three were booking numbers the route had been sending
// as hardcoded 0/null since 2026-08-24 („they go when that file does", says its
// own comment). `noAvailability` fed a modal telling providers to publish
// calendar time; `requests + reschedules` was the „სამუშაოები" pill, which
// therefore could never appear.
export type NavBadges = {
  messages: number
  profilePercent: number | null
  // The master's queue badge — verified requests with a place left. Counted
  // once per page load by app/work/layout.tsx (server), not polled: it is
  // seeded here so the sidebar reads every pill from one object.
  openRequests: number
}

const ZERO: NavBadges = { messages: 0, profilePercent: null, openRequests: 0 }

/* Sidebar badge counts. Refreshes: on mount, every 60s while the tab is
   visible, on route change (so acting on a request clears its pill without
   waiting), on the cross-tab `mcodne:notif-check` localStorage bump that
   NotifBell / UserMenu / action handlers already fire, and on the same-tab
   `mcodne:badges-refresh` window event (storage events don't fire in the tab
   that wrote the key). Failures are silent — badges simply hide. */

/** Fire after any action that changes badge counts (accept/decline/read). */
export function refreshNavBadges() {
  try {
    window.dispatchEvent(new Event('mcodne:badges-refresh'))
    localStorage.setItem('mcodne:notif-check', String(Date.now()))
  } catch {}
}
export function useNavBadges(opts: { enabled?: boolean; openRequests?: number } = {}): NavBadges {
  const { enabled = true, openRequests = 0 } = opts
  const [badges, setBadges] = useState<NavBadges>(ZERO)
  const path = usePathname()

  useEffect(() => {
    // ⚠️ THE PATH IS `/api/work/nav-badges` AND IT WAS `/api/tutor/…` UNTIL
    // 2026-08-26. The route moved with everything else on 2026-08-24 — its own
    // header records the move — and this, its only caller, kept polling the old
    // address. `r.ok ? … : null` swallowed the 404, so every provider's sidebar
    // showed zero unread messages and no profile percentage, every 60 seconds,
    // silently. It answers the PROVIDER's counts and 403s anybody else; a
    // WORK-only master in the shared shell has nothing to poll for.
    if (!enabled) return
    let cancelled = false
    const load = () => {
      if (document.visibilityState === 'hidden') return
      fetch('/api/work/nav-badges')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (cancelled || !d?.ok) return
          setBadges({
            messages: d.messages ?? 0,
            profilePercent: typeof d.profilePercent === 'number' ? d.profilePercent : null,
            openRequests,
          })
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 90_000)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mcodne:notif-check') load()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('mcodne:badges-refresh', load)
    return () => {
      cancelled = true
      clearInterval(t)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('mcodne:badges-refresh', load)
    }
  }, [path, enabled, openRequests])

  return { ...badges, openRequests }
}
