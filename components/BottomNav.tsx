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
import { useEffect, type ReactElement } from 'react'
import { Icon } from './Icon'
import { useNotifications } from '@/lib/notifications'

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
  // Bookings — the core object of the product — earns a tab.
  { href: '/student/bookings',  label: 'ჯავშნები',     icon: Icon.calendar, match: startsWith('/student/bookings') },
  // Messages — a marketplace conversation surface earns its own tab (mirrors
  // the tutor nav).
  { href: '/student/messages',  label: 'მიმოწერა',      icon: Icon.chat,     match: startsWith('/student/messages') },
  // „შენახული" TOOK THE PROFILE SLOT (2026-07-31). The old comment above claimed
  // saved-experts lived „in the StudentAppBar rail + profile" — but that rail is
  // `hidden lg:flex` and the public header's heart was `hidden sm:`, so on a
  // phone a student had NO route to their shortlist anywhere. It was reported to
  // us as „the save function was deleted", which is exactly how an unreachable
  // feature reads.
  // Why PROFILE gave up the slot rather than „ექსპერტები": /tutors is the
  // catalog — the core action of a marketplace — and must stay one tap away.
  // The profile is a rare destination that ALREADY has a permanent entry point
  // in the always-visible avatar menu (UserMenu → „პროფილი"), so it loses
  // nothing by leaving the bar. A shortlist, by contrast, is used exactly while
  // the visitor is deciding, which is the whole job of this nav.
  { href: '/student/favorites', label: 'შენახული',     icon: Icon.heart,    match: startsWith('/student/favorites') },
]

const TUTOR_TABS: Tab[] = [
  { href: '/tutor',             label: 'მთავარი',      icon: Icon.home, match: p => p === '/tutor' },
  { href: '/tutor/bookings',    label: 'ჯავშნები',     icon: Icon.calendar, match: startsWith('/tutor/bookings') },
  { href: '/tutor/messages',    label: 'მიმოწერა',      icon: Icon.chat,    match: startsWith('/tutor/messages') },
  { href: '/tutor/profile',     label: 'პროფილი',      icon: Icon.user,     match: startsWith('/tutor/profile') },
]

const TABS_BY_ROLE: Record<Role, Tab[]> = {
  STUDENT: STUDENT_TABS,
  TUTOR:   TUTOR_TABS,
  ADMIN:   [],
}

export function BottomNav({ role }: { role: Role | null }) {
  const path = usePathname() ?? ''
  // Shared store (one poll app-wide, visibility-gated + cross-tab). Reads the
  // unread count for the profile/messages dot.
  //
  // Gated on `role`: this component renders nothing for anonymous visitors, but
  // the hook still ran for them and started a 90-second /api/notifications poll
  // that 401s every time. Guests now subscribe to nothing.
  const { unreadCount: unread } = useNotifications(role !== null)

  // SPACE-aware, not just role-aware. A dual-role expert (or an admin) who
  // switches into the client space at /student got TUTOR tabs whose every
  // destination bounced them straight back out — on mobile the switch was a
  // trap. The path names the space the user is IN; the role only decides the
  // default elsewhere.
  const space = path.startsWith('/student') ? 'STUDENT' : path.startsWith('/tutor') ? 'TUTOR' : role
  const tabs = role ? TABS_BY_ROLE[space === 'STUDENT' || space === 'TUTOR' ? space : role] ?? [] : []
  // Focused screens own the full viewport including the bottom edge, so the
  // tab bar steps aside there:
  //  • conversation threads (student AND tutor) — the composer owns the
  //    bottom edge;
  //  • student booking detail — its fixed MobileActionBar (join/reschedule/
  //    cancel) is the bottom surface; stacking the tab bar under it just
  //    hides the tabs behind an action bar.
  const isFocusedScreen =
    /^\/(?:student|tutor)\/messages\/[^/]+$/.test(path) ||
    // Pre-booking pair threads (/…/messages/u/[userId]) — the composer owns
    // the bottom edge, same as booking threads.
    /^\/(?:student|tutor)\/messages\/u\/[^/]+$/.test(path) ||
    /^\/student\/bookings\/[^/]+$/.test(path) ||
    // Expert profile: the fixed MobileBookingBar is the bottom surface for
    // signed-in students — two stacked bottom layers just hide the tabs.
    /^\/tutors\/[^/]+$/.test(path) ||
    // The /apply expert-application wizard owns the bottom edge with its own
    // back/next footer — the tab bar (+ cookie banner) stacked under it hid the
    // "next" button and read as a broken double bar.
    /^\/apply(?:\/|$)/.test(path) ||
    // /ask owns the bottom edge with its sticky follow-up submit bar; the fixed
    // tab bar (z-40) stacked over it (z-30) covered the input and made it
    // unusable on mobile.
    /^\/ask(?:\/|$)/.test(path)
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

  if (!show) return null

  return (
    <nav
      aria-label="მთავარი ნავიგაცია"
      className="lg:hidden fixed inset-x-0 bottom-0 z-chrome bg-white border-t border-ink-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className={`grid h-16 ${tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {tabs.map(tab => {
          const active = tab.match ? tab.match(path) : path === tab.href
          const IconComp = tab.icon
          const isProfile = tab.href.endsWith('/profile')
          const isBell = tab.href === '/notifications' || tab.href.endsWith('/messages')
          // The profile tab used to carry the SAME count as the messages tab —
          // one unread message painted two identical red badges side by side in
          // a four-tab bar, and neither told you which one to press. The count
          // belongs to the destination that answers it. Measured 2026-07-30:
          // one unread produced FOUR badges on a single screen (bell, avatar,
          // messages tab, profile tab). This removes one of the two duplicates
          // here; UserMenu drops the avatar badge.
          const showDot = isBell && unread > 0
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`h-full flex flex-col items-center justify-center gap-1 text-meta font-display font-semibold tracking-tight transition-colors duration-fast ${
                  active ? 'text-brand-700' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                <span className="relative inline-flex">
                  <IconComp className="w-[22px] h-[22px]" />
                  {showDot && (
                    // Unread COUNT micro-chip (canon blesses count chips; not a
                    // bare status dot). Caps at 9+ so it never overflows the tab.
                    <span
                      aria-label={`${unread} წაუკითხავი`}
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-danger-500 text-white ring-2 ring-white text-meta font-display font-bold leading-none inline-flex items-center justify-center tabular-nums"
                    >
                      {unread > 9 ? '9+' : unread}
                    </span>
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
