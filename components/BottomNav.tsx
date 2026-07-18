'use client'
// BottomNav — mobile-only bottom tab bar. Rendered from AppShell, receives
// the user's role. Renders nothing for anonymous visitors (role === null) or
// admins (they use a desktop-first workspace). Toggles `data-bottom-nav` on
// <body> so pages can add safe-area padding only when the bar is actually
// showing (see globals.css § "BottomNav spacing").
//
// Also shows an unread indicator on the profile tab, driven by
// /api/notifications and refreshed cross-tab via the `mcodne:notif-check`
// localStorage key that NotifBell / UserMenu bump on read.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactElement } from 'react'
import { Icon } from './Icon'

type Role = 'STUDENT' | 'TUTOR' | 'ADMIN'

type Tab = {
  href: string
  label: string
  icon: (p: any) => ReactElement
  // A tab is "active" if the pathname matches exactly OR starts with
  // the tab's href followed by "/" (so /student/bookings/123 highlights
  // the ჯავშნები tab).
  match?: (path: string) => boolean
}

const startsWith = (prefix: string) => (path: string) =>
  path === prefix || path.startsWith(prefix + '/')

const STUDENT_TABS: Tab[] = [
  { href: '/student',           label: 'მთავარი',      icon: Icon.home, match: p => p === '/student' },
  { href: '/tutors',            label: 'ექსპერტები',     icon: Icon.search,   match: startsWith('/tutors') },
  // Bookings — the core object of the product — earns the tab; notifications
  // stay reachable via the header bell and the profile red dot.
  { href: '/student/bookings',  label: 'ჯავშნები',     icon: Icon.calendar, match: startsWith('/student/bookings') },
  { href: '/student/profile',   label: 'პროფილი',      icon: Icon.user,     match: startsWith('/student/profile') },
]

const TUTOR_TABS: Tab[] = [
  { href: '/tutor',             label: 'მთავარი',      icon: Icon.home, match: p => p === '/tutor' },
  { href: '/tutor/bookings',    label: 'ჯავშნები',     icon: Icon.calendar, match: startsWith('/tutor/bookings') },
  { href: '/tutor/messages',    label: 'მესიჯები',      icon: Icon.chat,    match: startsWith('/tutor/messages') },
  { href: '/tutor/profile',     label: 'პროფილი',      icon: Icon.user,     match: startsWith('/tutor/profile') },
]

const TABS_BY_ROLE: Record<Role, Tab[]> = {
  STUDENT: STUDENT_TABS,
  TUTOR:   TUTOR_TABS,
  ADMIN:   [],
}

export function BottomNav({ role }: { role: Role | null }) {
  const path = usePathname() ?? ''
  const [unread, setUnread] = useState(0)

  const tabs = role ? TABS_BY_ROLE[role] : []
  // Focused screens own the full viewport including the bottom edge, so the
  // tab bar steps aside there:
  //  • conversation threads (student AND tutor) — the composer owns the
  //    bottom edge;
  //  • student booking detail — its fixed MobileActionBar (join/reschedule/
  //    cancel) is the bottom surface; stacking the tab bar under it just
  //    hides the tabs behind an action bar.
  const isFocusedScreen =
    /^\/(?:student|tutor)\/messages\/[^/]+$/.test(path) ||
    /^\/student\/bookings\/[^/]+$/.test(path) ||
    // Expert profile: the fixed MobileBookingBar is the bottom surface for
    // signed-in students — two stacked bottom layers just hide the tabs.
    /^\/tutors\/[^/]+$/.test(path)
  const show = tabs.length > 0 && !isFocusedScreen

  // Signal to globals.css that the bar is present so pages can reserve
  // extra bottom padding (only on the mobile breakpoints where the bar is
  // actually visible — globals.css handles the media-query gating).
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (show) document.body.setAttribute('data-bottom-nav', '1')
    else document.body.removeAttribute('data-bottom-nav')
    return () => document.body.removeAttribute('data-bottom-nav')
  }, [show])

  // Fetch unread count so the profile tab can show a red dot. Cheap: the
  // notifications endpoint returns a summary object with `unreadCount`.
  useEffect(() => {
    if (!show) return
    let cancelled = false
    const load = () => {
      fetch('/api/notifications')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!cancelled) setUnread(d?.unreadCount ?? 0) })
        .catch(() => {})
    }
    load()
    // Cross-tab: when another tab marks something read, refresh here.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mcodne:notif-check') load()
    }
    window.addEventListener('storage', onStorage)
    // Also poll occasionally so a long-lived tab still catches new pushes.
    const t = setInterval(load, 90_000)
    return () => {
      cancelled = true
      clearInterval(t)
      window.removeEventListener('storage', onStorage)
    }
  }, [show])

  if (!show) return null

  return (
    <nav
      aria-label="მთავარი ნავიგაცია"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white/98 backdrop-blur border-t border-ink-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4 h-16">
        {tabs.map(tab => {
          const active = tab.match ? tab.match(path) : path === tab.href
          const IconComp = tab.icon
          const isProfile = tab.href.endsWith('/profile')
          const isBell = tab.href === '/notifications' || tab.href.endsWith('/messages')
          const showDot = (isProfile || isBell) && unread > 0
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`h-full flex flex-col items-center justify-center gap-1 text-[10.5px] font-display font-semibold tracking-tight transition-colors ${
                  active ? 'text-brand-700' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                <span className="relative inline-flex">
                  <IconComp className="w-[22px] h-[22px]" />
                  {showDot && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-danger-500 ring-2 ring-white"
                    />
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
