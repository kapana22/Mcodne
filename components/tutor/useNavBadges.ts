'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export type NavBadges = {
  requests: number
  messages: number
  reschedules: number
  profilePercent: number | null
}

const ZERO: NavBadges = { requests: 0, messages: 0, reschedules: 0, profilePercent: null }

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
export function useNavBadges(): NavBadges {
  const [badges, setBadges] = useState<NavBadges>(ZERO)
  const path = usePathname()

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (document.visibilityState === 'hidden') return
      fetch('/api/tutor/nav-badges')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (cancelled || !d?.ok) return
          setBadges({
            requests: d.requests ?? 0,
            messages: d.messages ?? 0,
            reschedules: d.reschedules ?? 0,
            profilePercent: typeof d.profilePercent === 'number' ? d.profilePercent : null,
          })
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 60_000)
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
  }, [path])

  return badges
}
