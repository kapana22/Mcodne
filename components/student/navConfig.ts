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
  { href: '/student',          label: 'მთავარი',   icon: 'home',     match: p => p === '/student' },
  { href: '/student/bookings', label: 'ჯავშნები',  icon: 'calendar', match: startsWith('/student/bookings') },
  { href: '/student/messages', label: 'მიმოწერა',   icon: 'chat',     match: startsWith('/student/messages'), badgeKey: 'messages' },
  { href: '/student/favorites',label: 'შენახული',  icon: 'heart',    match: startsWith('/student/favorites') },
  { href: '/student/profile',  label: 'პროფილი',   icon: 'user',     match: startsWith('/student/profile') },
]

// Outside the workspace proper — rendered below a divider in the sidebar.
export const CATALOG_LINK: NavItem = {
  href: '/tutors', label: 'ექსპერტები', icon: 'search', match: startsWith('/tutors'),
}

/* „გახდი ექსპერტი" is a first-class nav item on every public page (see
   components/PublicTopBar NAV) and used to vanish the moment a student walked
   into their own workspace — it survived only one click deep, inside the avatar
   menu. Same door, same words, in both chromes.
   ⚠️ MUST be rendered inside <ApplyCtaGate>: the student shell hardcodes
   role="STUDENT" on its chrome, but /student also admits a TUTOR using their
   client side, and telling an approved expert to become one is the exact
   2026-07-22 bug. The gate reads the real role from useMe. */
export const APPLY_LINK: NavItem = {
  href: '/apply', label: 'გახდი ექსპერტი', icon: 'briefcase', match: startsWith('/apply'),
}

/** Page title for the top bar: longest matching workspace destination. */
export function titleForPath(path: string): string {
  let best: NavItem | null = null
  for (const item of WORKSPACE_NAV) {
    if (item.match(path) && (!best || item.href.length > best.href.length)) best = item
  }
  return best?.label ?? 'ჩემი სივრცე'
}
