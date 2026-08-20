import { Icon } from '@/components/Icon'
import { PROVIDER_ROUTE } from '@/lib/requests'

// Single source of truth for the /work destinations. Consumed by
// WorkspaceSidebar (desktop nav) and WorkspaceTopBar (page title).
//
// TWO GROUPS, ONE RAIL (stage 6, 2026-08-19). /work is the supply side's
// space whatever you supply: an expert's items (CONSULT) and a master's items
// (WORK) share the prefix and the chrome, and the shell draws each group only
// for the capability that owns it — lib/capabilities → capabilitiesOf, ADMIN
// sees both. Never one flat list: „is this about a booking or a request?" was
// the confusion the old separate /provider space was carved out to avoid, and
// the visual divider between the groups is what keeps that answer visible.

export type NavBadgeKey = 'attention' | 'messages' | 'openRequests'

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

/**
 * THE RAIL — ONE LIST, ITEMS BY FUNCTION (rewritten 2026-08-19).
 *
 * ⚠️ THERE ARE NO LONGER TWO GROUPS. The workspace used to hold the expert's
 * six items and the master's three, split by a hairline and then (for one
 * afternoon) by captions — nine rows saying „you are in two products". Owner:
 * „ხელოსნის სივრცე ზედმეტია… ჩემი აზრით არასწორია." The product model says the
 * same thing: one provider, capabilities are switches, and a consultation is
 * one KIND of service rather than a second half of the site.
 *
 * So the rail asks what a provider DOES, not which kind they are:
 *   · everything that exists for both capabilities is unconditional;
 *   · exactly two items are conditional, and each is a TOOL only one half owns
 *     — the calendar (you sell time) and the requests feed (you bid on work).
 * Nine rows become seven, and five for somebody holding one capability.
 *
 * The captions are gone with the groups: a heading over one list is noise, and
 * a heading over two was the split wearing a label.
 */
export const WORKSPACE_NAV: NavItem[] = [
  { href: '/work',          label: 'მთავარი',        icon: 'category', match: p => p === '/work' },
  { href: '/work/jobs',     label: 'სამუშაოები',     icon: 'calendar', match: startsWith('/work/jobs'), badgeKey: 'attention' },
  { href: '/work/messages', label: 'მიმოწერა',        icon: 'chat',     match: startsWith('/work/messages'), badgeKey: 'messages' },
  { href: '/work/services', label: 'ჩემი სერვისები', icon: 'briefcase', match: startsWith('/work/services') },
]

/** The two tools, each owned by one capability. `requests` keeps its href from
 *  the subsystem's own constant — the dependency direction lib/hats uses. */
export const CONSULT_ONLY_NAV: NavItem[] = [
  { href: '/work/schedule', label: 'გრაფიკი',    icon: 'clock',  match: startsWith('/work/schedule') },
  { href: '/work/earnings', label: 'შემოსავალი', icon: 'wallet', match: startsWith('/work/earnings') },
  { href: '/work/profile',  label: 'პროფილი',    icon: 'user',   match: startsWith('/work/profile') },
]

export const WORK_ONLY_NAV: NavItem[] = [
  { href: `${PROVIDER_ROUTE}/requests`, label: 'მოთხოვნები',   icon: 'list', match: startsWith(`${PROVIDER_ROUTE}/requests`), badgeKey: 'openRequests' },
  { href: `${PROVIDER_ROUTE}/offers`,   label: 'შეთავაზებები', icon: 'send', match: startsWith(`${PROVIDER_ROUTE}/offers`) },
]

/** Which capabilities a viewer holds — decided by the server layout from
 *  capabilitiesOf(), passed down, never derived in the browser. The field
 *  names stay `expert`/`work` because every caller already speaks them; what
 *  changed is what they DO: they no longer pick a group, they add one tool. */
export type NavGroups = { expert: boolean; work: boolean }

/** A block of the rail. One today; the shape survives so a divider can return
 *  without changing every caller. */
export type NavSection = { caption: string | null; items: NavItem[] }

/**
 * The rail, in order. ONE list — see the note above WORKSPACE_NAV for why the
 * groups and their captions are gone. The shared items come first because they
 * are the same question for everybody („what do I have, who is waiting, what do
 * I sell"); the two conditional tools follow, in the order the capability that
 * owns them was added.
 *
 * Returns a single section so the sidebar keeps one code path; the shape is a
 * list of sections only because a divider may return one day.
 */
export function navFor(groups: NavGroups): NavSection[] {
  const items = [
    ...WORKSPACE_NAV,
    ...(groups.work ? WORK_ONLY_NAV : []),
    ...(groups.expert ? CONSULT_ONLY_NAV : []),
  ]
  return items.length ? [{ caption: null, items }] : []
}

// Outside the workspace proper — rendered below a divider in the sidebar.
export const CATALOG_LINK: NavItem = {
  href: '/experts', label: 'ექსპერტები', icon: 'search', match: startsWith('/experts'),
}

/** Page title for the top bar: longest matching workspace destination. */
export function titleForPath(path: string): string {
  let best: NavItem | null = null
  for (const item of [...WORKSPACE_NAV, ...WORK_ONLY_NAV, ...CONSULT_ONLY_NAV]) {
    if (item.match(path) && (!best || item.href.length > best.href.length)) best = item
  }
  return best?.label ?? 'სამუშაო სივრცე'
}
