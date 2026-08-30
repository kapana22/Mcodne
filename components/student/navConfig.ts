import { JOIN_DOOR_HREF, JOIN_DOOR_LABEL } from '@/lib/capabilities'
import { requestsFeatureExists } from '@/lib/requests'
import { Icon } from '@/components/Icon'

// Single source of truth for the student-workspace destinations. Consumed by
// StudentSidebar (desktop nav) and StudentWorkspaceTopBar (page title).
// Mirrors components/tutor/navConfig.ts so the two workspaces stay in lockstep.

export type NavBadgeKey = 'messages'

export type NavItem = {
  href: string
  label: string
  icon: keyof typeof Icon
  match: (path: string) => boolean
  /** Which student-badge count feeds this item's pill. */
  badgeKey?: NavBadgeKey
}

const startsWith = (prefix: string) => (path: string) =>
  path === prefix || path.startsWith(prefix + '/')

export const WORKSPACE_NAV: NavItem[] = [
  { href: '/me',          label: 'მთავარი',   icon: 'home',     match: p => p === '/me' },
  // ⚠️ „ჯავშნები" AND „მიმოწერა" WENT WITH THE BOOKING PRODUCT (2026-08-24).
  // The first listed sessions; the second was the pair inbox that carried a
  // booking's conversation. A client's thread with a provider is the request's
  // own thread — /request/<ref> — which is reached from the row below.
  //
  // The client's own service requests. Filtered on the subsystem's flag: the
  // page 404s without it, and a rail item leading to a 404 is a broken promise,
  // not a link.
  ...(requestsFeatureExists()
    ? [{ href: '/me/requests', label: 'მოთხოვნები', icon: 'list', match: startsWith('/me/requests') } as NavItem]
    : []),
  { href: '/me/favorites',label: 'შენახული',  icon: 'heart',    match: startsWith('/me/favorites') },
  { href: '/me/profile',  label: 'პროფილი',   icon: 'user',     match: startsWith('/me/profile') },
]

// Outside the workspace proper — rendered below a divider in the sidebar.
export const CATALOG_LINK: NavItem = {
  href: '/experts', label: 'ექსპერტები', icon: 'search', match: startsWith('/experts'),
}

/* „გახდი ექსპერტი" is a first-class nav item on every public page (see
   components/PublicTopBar NAV) and used to vanish the moment a student walked
   into their own workspace — it survived only one click deep, inside the avatar
   menu. Same door, same words, in both chromes.
   ⚠️ MUST be rendered inside <ApplyCtaGate>: the student shell hardcodes
   role="USER" on its chrome, but /student also admits a TUTOR using their
   client side, and telling an approved expert to become one is the exact
   2026-07-22 bug. The gate reads the real role from useMe. */
export const APPLY_LINK: NavItem = {
  // ⚠️ THE SAME DESTINATION THE PUBLIC HEADER USES (2026-08-18). The two
  // chromes diverging is the bug tests/regression-invariants §K was written
  // for; the constant is how they cannot. It moved from /apply — the EXPERT
  // application — because a tradesperson in their own workspace was being
  // invited to become an expert, with no route to the trades form anywhere.
  //
  // ⚠️ AND IT IS `JOIN_DOOR_*`, NOT `JOIN_HREF` (2026-08-21). This item is only
  // ever drawn for somebody who is SIGNED IN — it lives in the client
  // workspace sidebar — and `JOIN_HREF` is `/signup`, which for a signed-in
  // person redirects straight back to `/me`. So the one invitation a client
  // gets to start selling was a link to the page they were already past: click
  // it, land back where you started, no error, no door. Walked in the browser
  // 2026-08-21 as a freshly registered client.
  //
  // `JOIN_HREF` is still correct where it is used — the guest's „დაწყება"
  // button in PublicTopBar, where an account genuinely has to exist first.
  // What diverged is that every OTHER signed-in surface (the UserMenu item,
  // the footer action, the home CTA) had already moved to `JOIN_DOOR_HREF`
  // and this one had not. §K2 now pins the constant rather than the presence,
  // so the sidebar cannot name a different door again.
  href: JOIN_DOOR_HREF, label: JOIN_DOOR_LABEL, icon: 'briefcase', match: startsWith('/join'),
}

/** Page title for the top bar: longest matching workspace destination. */
export function titleForPath(path: string): string {
  let best: NavItem | null = null
  for (const item of WORKSPACE_NAV) {
    if (item.match(path) && (!best || item.href.length > best.href.length)) best = item
  }
  return best?.label ?? 'ჩემი სივრცე'
}
