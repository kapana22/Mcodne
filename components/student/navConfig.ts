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

/** Page title for the top bar: longest matching workspace destination. */
export function titleForPath(path: string): string {
  let best: NavItem | null = null
  for (const item of WORKSPACE_NAV) {
    if (item.match(path) && (!best || item.href.length > best.href.length)) best = item
  }
  return best?.label ?? 'ჩემი სივრცე'
}
