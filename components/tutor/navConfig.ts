import { Icon } from '@/components/Icon'

// Single source of truth for the expert-workspace destinations. Consumed by
// WorkspaceSidebar (desktop nav) and WorkspaceTopBar (page title).

export type NavBadgeKey = 'attention' | 'messages'

export type NavItem = {
  href: string
  label: string
  icon: keyof typeof Icon
  match: (path: string) => boolean
  /** Which useNavBadges count feeds this item's pill. */
  badgeKey?: NavBadgeKey
}

const startsWith = (prefix: string) => (path: string) =>
  path === prefix || path.startsWith(prefix + '/')

export const WORKSPACE_NAV: NavItem[] = [
  { href: '/tutor',          label: 'მთავარი',    icon: 'category', match: p => p === '/tutor' },
  { href: '/tutor/bookings', label: 'ჯავშნები',   icon: 'calendar', match: startsWith('/tutor/bookings'), badgeKey: 'attention' },
  { href: '/tutor/schedule', label: 'გრაფიკი',    icon: 'clock',    match: startsWith('/tutor/schedule') },
  { href: '/tutor/messages', label: 'მესიჯები',    icon: 'chat',     match: startsWith('/tutor/messages'), badgeKey: 'messages' },
  { href: '/tutor/earnings', label: 'შემოსავალი', icon: 'wallet',   match: startsWith('/tutor/earnings') },
  { href: '/tutor/profile',  label: 'პროფილი',    icon: 'user',     match: startsWith('/tutor/profile') },
]

// Outside the workspace proper — rendered below a divider in the sidebar.
export const CATALOG_LINK: NavItem = {
  href: '/tutors', label: 'ექსპერტების კატალოგი', icon: 'search', match: startsWith('/tutors'),
}

/** Page title for the top bar: longest matching workspace destination. */
export function titleForPath(path: string): string {
  let best: NavItem | null = null
  for (const item of WORKSPACE_NAV) {
    if (item.match(path) && (!best || item.href.length > best.href.length)) best = item
  }
  return best?.label ?? 'სამუშაო სივრცე'
}
