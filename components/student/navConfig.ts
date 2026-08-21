import { JOIN_HREF } from '@/lib/roleHome'
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
  { href: '/me/bookings', label: 'ჯავშნები',  icon: 'calendar', match: startsWith('/me/bookings') },
  { href: '/me/messages', label: 'მიმოწერა',   icon: 'chat',     match: startsWith('/me/messages'), badgeKey: 'messages' },
  // The client's own service requests (D7, stage 6). Desktop rail only — the
  // five mobile tabs are full (components/BottomNav → STUDENT_TABS), and the
  // /me home carries a section for it. Filtered below on the subsystem's
  // flag: the page 404s without it, and a rail item leading to a 404 is a
  // broken promise, not a link.
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
  href: JOIN_HREF, label: 'შემოგვიერთდი', icon: 'briefcase', match: startsWith('/signup'),
}

/** Page title for the top bar: longest matching workspace destination. */
export function titleForPath(path: string): string {
  let best: NavItem | null = null
  for (const item of WORKSPACE_NAV) {
    if (item.match(path) && (!best || item.href.length > best.href.length)) best = item
  }
  return best?.label ?? 'ჩემი სივრცე'
}
