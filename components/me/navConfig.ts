// ⚠️ THIS FOLDER WAS `components/student/` UNTIL 2026-08-30, and its files were
// `Student*` inside — the chrome of the CLIENT space, filed under a word the
// product retired. „სტუდენტი" is on the banned list in CLAUDE.md with its
// sanctioned replacement named beside it („კლიენტი"), and `Role` has said
// USER · PROVIDER · ADMIN since 2026-08-24.
//
// `components/me/` mirrors `app/me/` the way `components/work/` mirrors
// `app/work/`: the two spaces are named by their routes, so a reader in the
// layout has nothing to translate. The FILES carry the role word rather than
// the route — `MeSidebar` names a URL, `ClientSidebar` names a person.

import { JOIN_DOOR_HREF, JOIN_DOOR_LABEL } from '@/lib/capabilities'
import { requestsFeatureExists } from '@/lib/requests'
import { Icon } from '@/components/Icon'

// Single source of truth for the student-workspace destinations. Consumed by
// ClientSidebar (desktop nav) and ClientTopBar (page title).
// Mirrors components/work/navConfig.ts so the two workspaces stay in lockstep.

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
  // ⚠️ „მთავარი" AND „მოთხოვნები" WERE ONE THING SAID TWICE (merged 2026-08-30).
  // Three quarters of the home was a preview of this very rail: the latest
  // three requests with a „ყველა" link to the same rows, a suggestion grid
  // duplicating the catalogue one row below, and a strip summarising the saved
  // page one row below that. A client's home IS their requests.
  //
  // The provider's home learned this on 2026-08-29 — owner: „ერთი ნაკადი
  // გახდეს" — and the note it left says what a home is for: the one thing to
  // do next. So the flow owns the screen and the rail loses a row. /me/requests
  // still resolves; it redirects here.
  { href: '/me',          label: 'მთავარი',  icon: 'home',  match: p => p === '/me' },
  { href: '/me/favorites',label: 'შენახული', icon: 'heart', match: startsWith('/me/favorites') },
  { href: '/me/profile',  label: 'პროფილი',  icon: 'user',  match: startsWith('/me/profile') },
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
