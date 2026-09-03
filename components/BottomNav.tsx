'use client'
// BottomNav — mobile-only bottom tab bar. Rendered from AppShell, which hands
// it the reader's role AND whether they sell (`identity.provider`, off
// /api/me). Renders nothing for anonymous visitors (role === null) or admins
// (they use a desktop-first workspace). Toggles `data-bottom-nav` on
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
  // ⚠️ THE PHONE SHOWS WHAT THE RAIL SHOWS, plus the catalogue (2026-08-30).
  // „მოთხოვნები" left with the rail row of the same name: the home IS the
  // request list now, so a tab for it was a second route to the screen the
  // first tab already opens. See components/me/navConfig.
  { href: '/me',           label: 'მთავარი',    icon: Icon.home,   match: p => p === '/me' },
  // /experts/<slug> is the profile (own address space since 2026-08-19); it is
  // still the ექსპერტები section, so it lights the same tab.
  //
  // ⚠️ IT STAYS ON THE BAR EVEN THOUGH THE RAIL PUTS IT BELOW A DIVIDER: the
  // catalogue is the core action of a marketplace and must be one tap away.
  { href: '/experts',      label: 'ექსპერტები', icon: Icon.search, match: startsWith('/experts') },
  // ⚠️ THE CLIENT'S INBOX CAME BACK ON 2026-08-31 (the owner's „Messages"
  // artboard), and it needs a route on a phone or it is desktop-only —
  // /work/messages learnt exactly this, and the rail on the client's side does
  // not exist below `lg`. Same slot the provider's bar gives it, so the two
  // rooms read as one product.
  { href: '/me/messages',  label: 'მიმოწერა',   icon: Icon.chat,   match: startsWith('/me/messages') },
  // „შენახული" TOOK THE PROFILE SLOT (2026-07-31). The old comment above claimed
  // saved-experts lived „in the StudentAppBar rail + profile" — but that rail is
  // `hidden lg:flex` and the public header's heart was `hidden sm:`, so on a
  // phone a student had NO route to their shortlist anywhere. It was reported to
  // us as „the save function was deleted", which is exactly how an unreachable
  // feature reads.
  // Why PROFILE gave up the slot: it is a rare destination that ALREADY has a
  // permanent entry point in the always-visible avatar menu (UserMenu →
  // „პროფილი"), so it loses nothing by leaving the bar. A shortlist, by
  // contrast, is used exactly while the visitor is deciding, which is the whole
  // job of this nav.
  { href: '/me/favorites', label: 'შენახული',   icon: Icon.heart,  match: startsWith('/me/favorites') },
]

// ⚠️ ONE PROVIDER, ONE TAB SET (merged 2026-08-30). There were TWO — TUTOR_TABS
// (4) and PROVIDER_TABS (5) — chosen by
//
//     const workOnly = caps.includes('WORK') && !caps.includes('CONSULT')
//
// and that test could no longer be true. `/api/me` stopped returning
// `capabilities` on 2026-08-24, when the CONSULT/WORK pair went with the second
// product: it answers one boolean now. AppShell still reads the old field, so
// `caps` is ALWAYS `[]`, so `workOnly` is ALWAYS false, so /work always drew the
// four-tab set.
//
// What that cost, on a phone, on the supply side: no tab for „ჩემი სერვისები" —
// the editor where a provider chooses what they sell and writes the prices. It
// was reachable only from a link in the body of the home screen, or by first
// landing on one of the three /work/(provider) paths, which draw the other set.
// PROVIDER_TABS, with its careful notes from 2026-08-21, rendered on those
// three paths alone.
//
// The rail already knows the answer and has since stage 6: these are exactly
// components/work/navConfig → WORKSPACE_NAV, in its order. The phone shows
// what the rail shows.
const PROVIDER_TABS: Tab[] = [
  { href: '/work',          label: 'მთავარი',        icon: Icon.home,      match: p => p === '/work' },
  // ⚠️ THE JOBS TAB LIGHTS UP ON THE OFFERS PAGE, exactly as the rail's does:
  // they are two stages of one screen and share a tab bar, so the phone must
  // not show the page with nothing selected.
  { href: '/work/jobs',     label: 'სამუშაოები',     icon: Icon.calendar,  match: p => startsWith('/work/jobs')(p) || startsWith('/work/offers')(p) || startsWith('/work/requests')(p) },
  { href: '/work/messages', label: 'მიმოწერა',        icon: Icon.chat,      match: startsWith('/work/messages') },
  // One editor since 2026-08-30 — see components/work/navConfig. „ანგარიში" is
  // deliberately NOT here: five tabs is the ceiling on a phone, and the
  // password is not something anybody reaches for from a bottom bar.
  // ⚠️ THIS ROW WAS HERE TWICE (fixed 2026-09-02). „ჩემი გვერდი" and „პროფილი"
  // were two tabs, two labels, the same icon and the SAME href — the second a
  // leftover from before the two editors became one on 2026-08-30. On a phone
  // that is two of five tabs spent on one destination, and the second one lights
  // up with the first, so the bar showed two active tabs at once on /work/profile.
  { href: '/work/profile', label: 'ჩემი გვერდი', icon: Icon.user,
    match: p => startsWith('/work/profile')(p) || startsWith('/work/services')(p) },
]

const TABS_BY_ROLE: Record<Role, Tab[]> = {
  USER:     STUDENT_TABS,
  PROVIDER: PROVIDER_TABS,
  ADMIN:    [],
}

// ⚠️ NO `caps` PROP ANY MORE (2026-08-30). It carried the CONSULT/WORK pair
// that the second product took with it on 2026-08-24; every caller passed an
// array that /api/me had stopped filling, and the one branch that read it could
// not be reached. A parameter nobody can populate is not an input.
export function BottomNav({ role, sells = false }: {
  role: Role | null
  /** Does this person actually SELL here — a ServiceProfile plus an active
   *  allowlist row, `identity.provider` as /api/me already reports it.
   *  See the tab-set block below for why a role could not answer this. */
  sells?: boolean
}) {
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
  // ⚠️ THE PATH DECIDES, AND IT IS THE ONLY THING THAT CAN (2026-08-30). This
  // read „THE TAB SET IS CHOSEN BY CAPABILITY, NOT BY ROLE" and computed
  // `workOnly` out of a `caps` array that has been empty since /api/me stopped
  // sending one — see the note above PROVIDER_TABS. There is one kind of
  // provider now, so there is one supply-side set, and which ROOM you are
  // standing in is the whole question: /me is the client's, /work is the
  // provider's. Role is the last resort, for a page in neither.
  /* ⚠️ THE LAST RESORT IS `sells`, NOT `role` (2026-09-03), AND IT IS THE ONE
     RULE CLAUDE.md STATES OUTRIGHT: „Still ask identityOf, not role, for what
     does this person sell. A role is a permission; a profile plus an allowlist
     row is the fact."

     MEASURED THE DAY THIS CHANGED: of 27 accounts holding an active
     RequestAccess row AND a ServiceProfile — providers, by the product's own
     definition — THREE carry `role: USER`. For those three the fallback below
     resolved to STUDENT_TABS, so everywhere outside /me and /work (the account
     screen, the bell, an expert's public page) a working provider got the
     CLIENT's tab bar: „ექსპერტები", „შენახული", and a home that is not theirs.

     It was invisible while those pages had no rail of their own to disagree
     with. app/notifications and app/settings now wear the reader's workspace
     (components/SpaceChrome, which asks `sellsHere`), so the top of the screen
     said „provider" while the bottom said „client" — the same screen answering
     one question two ways.

     The converse is fixed by the same line: a granted PROVIDER who never
     finished registering sells nothing and is an ordinary client, and used to
     get the supply-side bar off `role` alone.

     ADMIN keeps its own (empty) entry — an admin is not a seller and the bar
     is not their navigation. */
  const tabs =
      path.startsWith('/me') ? STUDENT_TABS
    : path.startsWith('/work') ? PROVIDER_TABS
    : !role ? []
    : role === 'ADMIN' ? TABS_BY_ROLE.ADMIN
    : sells ? PROVIDER_TABS
    : STUDENT_TABS
  // Focused screens own the full viewport including the bottom edge, so the
  // tab bar steps aside there:
  //  • conversation threads (student AND tutor) — the composer owns the
  //    bottom edge;
  //  • student booking detail — its fixed MobileActionBar (join/reschedule/
  //    cancel) is the bottom surface; stacking the tab bar under it just
  //    hides the tabs behind an action bar.
  /* ⚠️ THIS REGEX HAD GONE STALE AND THE TAB BAR SAT ON EVERY COMPOSER
     (fixed 2026-09-01). `/…/messages/<id>` is ONE segment — the shape booking
     threads had. Conversations have lived at `/…/messages/o/<offerId>`, TWO
     segments, since 2026-08-19, so no thread matched: the bar stayed up over
     the message box on both sides and globals.css kept reserving its 64px.
     Measured at 800×600 before the fix: 201px of document below the fold with
     the composer behind the tab strip.
     The `u/<userId>` arm below is dead the same way — pre-booking pair threads
     went with the bookings — and is kept only because a stale link may still
     resolve; it costs one test and hides nothing that exists. */
  const isFocusedScreen =
    /^\/(?:me|work)\/messages\/o\/[^/]+$/.test(path) ||
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
