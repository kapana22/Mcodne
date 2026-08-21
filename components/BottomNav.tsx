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
import { isProviderWorkspacePath } from '@/lib/requests'
import { HELP_PROFESSIONS } from '@/lib/helpProfessions'

type Role = 'USER' | 'PROVIDER' | 'ADMIN'

type Tab = {
  href: string
  label: string
  icon: (p: any) => ReactElement
  // A tab is "active" if the pathname matches exactly OR starts with
  // the tab's href followed by "/" (so /me/bookings/123 highlights
  // the ჯავშნები tab).
  match?: (path: string) => boolean
}

const startsWith = (prefix: string) => (path: string) =>
  path === prefix || path.startsWith(prefix + '/')

const STUDENT_TABS: Tab[] = [
  { href: '/me',           label: 'მთავარი',      icon: Icon.home, match: p => p === '/me' },
  // /experts/<slug> is the profile (own address space since 2026-08-19); it is
  // still the ექსპერტები section, so it lights the same tab.
  { href: '/experts',            label: 'ექსპერტები',     icon: Icon.search,   match: startsWith('/experts') },
  // Bookings — the core object of the product — earns a tab.
  { href: '/me/bookings',  label: 'ჯავშნები',     icon: Icon.calendar, match: startsWith('/me/bookings') },
  // Messages — a marketplace conversation surface earns its own tab (mirrors
  // the tutor nav).
  { href: '/me/messages',  label: 'მიმოწერა',      icon: Icon.chat,     match: startsWith('/me/messages') },
  // „შენახული" TOOK THE PROFILE SLOT (2026-07-31). The old comment above claimed
  // saved-experts lived „in the StudentAppBar rail + profile" — but that rail is
  // `hidden lg:flex` and the public header's heart was `hidden sm:`, so on a
  // phone a student had NO route to their shortlist anywhere. It was reported to
  // us as „the save function was deleted", which is exactly how an unreachable
  // feature reads.
  // Why PROFILE gave up the slot rather than „ექსპერტები": /experts is the
  // catalog — the core action of a marketplace — and must stay one tap away.
  // The profile is a rare destination that ALREADY has a permanent entry point
  // in the always-visible avatar menu (UserMenu → „პროფილი"), so it loses
  // nothing by leaving the bar. A shortlist, by contrast, is used exactly while
  // the visitor is deciding, which is the whole job of this nav.
  { href: '/me/favorites', label: 'შენახული',     icon: Icon.heart,    match: startsWith('/me/favorites') },
]

const TUTOR_TABS: Tab[] = [
  { href: '/work',             label: 'მთავარი',      icon: Icon.home, match: p => p === '/work' },
  { href: '/work/jobs',        label: 'სამუშაოები',   icon: Icon.calendar, match: startsWith('/work/jobs') },
  { href: '/work/messages',    label: 'მიმოწერა',      icon: Icon.chat,    match: startsWith('/work/messages') },
  { href: '/work/profile',     label: 'პროფილი',      icon: Icon.user,     match: startsWith('/work/profile') },
]

// The master's workspace (M1, 2026-08-18). The screens the /work rail lists
// for this capability (components/tutor/navConfig), because on a phone the
// rail is hidden. Shown by SPACE, not role — a master's `role` is
// STUDENT or TUTOR (lib/hats says why), and anybody who can see these three
// paths at all has already passed their 404 gate (app/work/(provider)/layout).
// ⚠️ THE SPACE IS THE THREE PATHS, NEVER THE /work PREFIX (stage 6): the rest
// of /work is the expert's, and gets TUTOR_TABS.
// ⚠️ FOUR SINCE 2026-08-21, AND THE HOME IS THE ONE THAT WAS MISSING. /work is
// the only screen that draws the balance and the only one that runs the grant,
// and this bar — the whole of a provider's navigation on a phone — had no route
// to it. The desktop rail has carried „მთავარი" for both capabilities since
// stage 6 (components/tutor/navConfig → WORKSPACE_NAV); the phone did not, so
// the feature was desktop-only by accident. It leads the list for the same
// reason it does there: it is the screen the other three are reached from.
const PROVIDER_TABS: Tab[] = [
  { href: '/work',                 label: 'მთავარი',           icon: Icon.home,      match: p => p === '/work' },
  { href: '/work/requests',        label: 'მოთხოვნები',        icon: Icon.list,      match: startsWith('/work/requests') },
  { href: '/work/offers',          label: 'შეთავაზებები',      icon: Icon.send,      match: startsWith('/work/offers') },
  { href: '/work/services',        label: 'ჩემი სერვისები',    icon: Icon.briefcase, match: startsWith('/work/services') },
]

// Keyed by the two roles the product has plus the admin — USER buys, PROVIDER
// sells, and a consultation is a KIND of service so its seller is a PROVIDER
// too (2026-08-21). The legacy words never reach here: every caller passes a
// role through lib/roles → `asRole`.
const TABS_BY_ROLE: Record<Role, Tab[]> = {
  USER:     STUDENT_TABS,
  PROVIDER: TUTOR_TABS,
  ADMIN:    [],
}

export function BottomNav({ role, caps = [] }: { role: Role | null; caps?: string[] }) {
  const path = usePathname() ?? ''
  // Shared store (one poll app-wide, visibility-gated + cross-tab). Reads the
  // unread count for the profile/messages dot.
  //
  // Gated on `role`: this component renders nothing for anonymous visitors, but
  // the hook still ran for them and started a 90-second /api/notifications poll
  // that 401s every time. Guests now subscribe to nothing.
  const { unreadCount: unread } = useNotifications(role !== null)

  // SPACE-aware, not just role-aware. A dual-role expert (or an admin) who
  // switches into the client space at /me got TUTOR tabs whose every
  // destination bounced them straight back out — on mobile the switch was a
  // trap. The path names the space the user is IN; the role only decides the
  // default elsewhere. The master's three paths are tested BEFORE the /work
  // prefix they live under — the order is the whole distinction.
  // ⚠️ /work BELONGS TO WHOEVER IS STANDING ON IT (2026-08-21). The path alone
  // cannot answer which space that screen is: it is the home of BOTH halves,
  // and a person who only sells a service got the expert's tabs there — with a
  // პროფილი tab that redirects them off the page they just opened. The
  // capability decides, exactly as the desktop rail's groups do
  // (app/work/layout → NAV_GROUPS). Someone holding both stays on the expert's
  // tabs: that profile is the one with more in it.
  // ⚠️ THE TAB SET IS CHOSEN BY CAPABILITY, NOT BY ROLE (restated 2026-08-21,
  // when USER/PROVIDER replaced STUDENT/TUTOR). Both a trades provider and a
  // consulting one are now the same ROLE, so the role can no longer tell their
  // tabs apart — and it never should have: what differs is what they SELL.
  // A provider holding both stays on the expert tabs, which have more in them.
  const workOnly = caps.includes('WORK') && !caps.includes('CONSULT')
  const tabs =
      path.startsWith('/me') ? STUDENT_TABS
    : isProviderWorkspacePath(path) ? PROVIDER_TABS
    : path.startsWith('/work') ? (workOnly ? PROVIDER_TABS : TUTOR_TABS)
    : !role ? []
    : TABS_BY_ROLE[role] ?? []
  // Focused screens own the full viewport including the bottom edge, so the
  // tab bar steps aside there:
  //  • conversation threads (student AND tutor) — the composer owns the
  //    bottom edge;
  //  • student booking detail — its fixed MobileActionBar (join/reschedule/
  //    cancel) is the bottom surface; stacking the tab bar under it just
  //    hides the tabs behind an action bar.
  const isFocusedScreen =
    /^\/(?:me|work)\/messages\/[^/]+$/.test(path) ||
    // Pre-booking pair threads (/…/messages/u/[userId]) — the composer owns
    // the bottom edge, same as booking threads.
    /^\/(?:me|work)\/messages\/u\/[^/]+$/.test(path) ||
    /^\/me\/bookings\/[^/]+$/.test(path) ||
    // Expert profile: the fixed MobileBookingBar is the bottom surface for
    // signed-in students — two stacked bottom layers just hide the tabs.
    // NOT the profession landings that share the address space since stage 8
    // (/experts/<profession>, lib/professionSeo) — those are marketing pages
    // with no bottom bar of their own. The slug list is read from the help
    // widget's client-safe copy of the table (tests/helpProfessions pins it to
    // the real one), not from professionSeo, whose 450 lines of prose must not
    // ship in this bundle.
    (/^\/experts\/[^/]+$/.test(path) && !HELP_PROFESSIONS.some(p => path === `/experts/${p.slug}`)) ||
    // The /join expert-application wizard owns the bottom edge with its own
    // back/next footer — the tab bar (+ cookie banner) stacked under it hid the
    // "next" button and read as a broken double bar.
    /^\/join(?:\/|$)/.test(path)
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
      <ul className={`grid h-16 ${tabs.length === 5 ? 'grid-cols-5' : tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
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
