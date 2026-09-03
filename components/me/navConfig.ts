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
// ⚠️ `requestsFeatureExists` LEFT THIS IMPORT AND IT WAS ALREADY DEAD. It reads
// `process.env.FEATURE_REQUESTS`, which does not exist in a browser, and every
// consumer of this file is a client component — so the flag can only ever be
// answered on the server. app/me/layout reads it once and hands the sidebar an
// href or null; see NEW_REQUEST_ACTION.
import { REQUEST_ROUTE } from '@/lib/requests'
import { Icon } from '@/components/Icon'

// Single source of truth for the client-workspace destinations. Consumed by
// ClientSidebar (desktop nav) and ClientTopBar (the crumb).
// Mirrors components/work/navConfig.ts so the two workspaces stay in lockstep.

/** ⚠️ THE SAME SHAPE THE PROVIDER'S RAIL USES (components/work/navConfig →
 *  `NavBadgeKey` + `NavBadges`), and it is the same shape on purpose: two rooms
 *  drawing one control two ways is what the 2026-09-02 pass was for. The KEYS
 *  differ because the rooms count different things; the grammar does not. */
export type NavBadgeKey = 'requests' | 'messages'

/** Every number this rail can print, resolved on the SERVER in app/me/layout
 *  and handed down — never fetched after mount. The provider's twin polls
 *  (`useNavBadges`) because its counts change while a provider sits on one
 *  screen; this room's are read fresh on every /me/∗ navigation because the
 *  segment is already `force-dynamic`. */
export type ClientNavBadges = { requests: number; messages: number }

export type NavItem = {
  href: string
  label: string
  icon: keyof typeof Icon
  match: (path: string) => boolean
  /** Which count feeds this item's pill. ⚠️ THE BADGE IS A REAL `count()` —
   *  resolved in app/me/layout (lib/myRequests → liveRequestCount) and handed
   *  down. The rail carried a `useStudentBadges` STUB until 2026-08-30 that
   *  returned `{ messages: 0 }` for ever, so nothing was ever drawn; the fix
   *  was to delete it, and the canvas's badge is why a real one came back. */
  badgeKey?: NavBadgeKey
  /** ⚠️ THE TOP BAR'S CRUMB IS NOT ALWAYS THE RAIL LABEL. The owner's „Client
   *  Space" canvas lights „მთავარი" in the rail and writes „ჩემი მოთხოვნები"
   *  in the bar above it, which is right: the rail row is a place and the crumb
   *  names what is on the screen. Everywhere the two agree, this is omitted. */
  crumb?: string
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
  /* ⚠️ THE MATCHER COVERS `/me/r/<ref>` TOO (2026-09-02), and it has to.
     A request opens INSIDE this room now — app/me/r/[ref], the same component
     /request/<ref> draws, in this chrome instead of the intake's — and until
     the matcher knew about it two things were wrong on that screen at once:
     no rail row was lit, so the reader could not see which section they were
     standing in, and `titleForPath` fell through to the room's own name, so
     the bar above their request read „ჩემი სივრცე". Walked in the browser the
     day the address was added.
     `/me/r/<ref>` IS the requests section — the row is „მთავარი" and the crumb
     is the list it came from, which is also where the back link goes. */
  { href: '/me',          label: 'მთავარი',  icon: 'home',
    match: p => p === '/me' || p.startsWith('/me/r/'),
    badgeKey: 'requests', crumb: 'ჩემი მოთხოვნები' },
  /* ⚠️ THE CLIENT HAD NO WAY TO THEIR OWN MESSAGES (added 2026-09-01).
     Verified in the browser before adding it: a signed-in client standing in
     their own room saw `მთავარი · შენახული · პროფილი` and nothing else.
     `ClientTopBar` carries only the bell and the avatar, `STUDENT_ITEMS` in
     UserMenu has no entry, and `PublicTopBar`'s chat icon renders on PUBLIC
     pages only — so on a desktop there was no route to /me/messages at all,
     while the provider's rail has had one since it was built. That asymmetry is
     the owner's „ჩათი დამალული და დაკარგულია" at its root, and PublicTopBar's
     own comment („desktop, workspace → the sidebar item, 1 click") had been
     describing a row that did not exist in this room.
     Same href, label, icon and matcher as the provider's row in
     components/work/navConfig — the two rooms name one thing one way.
     ⚠️ THE BADGE ARRIVED 2026-09-02 — „the row is the fix; the badge is its
     own change", said the note that stood here, and this is that change. Owner:
     „მესიჯები რომ მოდიოდეს შეტყობინებებში კარგი იქნება. რადგან ესე დაიკარგება."
     Behind it is `lib/inboxRows → clientUnreadTotal`, the exact twin of the
     supply side's `offerUnreadTotal` and counted over the exact rows this row
     opens — never a second count of the same thing, which is the bug that
     leaves a badge nothing can clear. */
  { href: '/me/messages', label: 'მიმოწერა', icon: 'chat',  match: startsWith('/me/messages'),
    badgeKey: 'messages' },
  { href: '/me/favorites',label: 'შენახული', icon: 'heart', match: startsWith('/me/favorites') },
  /* ⚠️ THE CRUMB IS „პარამეტრები" AND THE ROW IS „პროფილი" (2026-09-02). Not a
     slip — the two name different things, which is what `crumb` exists for
     (see NavItem). The rail row is a PLACE and keeps the short word the canvas
     gave it; the screen is now app/settings' own, whose h1 reads
     „პარამეტრები", and a bar naming the screen has to say what the screen
     says. app/me/profile stopped being a second account form on the same day —
     its header records why. */
  { href: '/me/profile',  label: 'პროფილი',  icon: 'user',  match: startsWith('/me/profile'),
    crumb: 'პარამეტრები' },
]

/* THE RAIL'S ONE FILLED CONTROL, pinned to the bottom of the sidebar
   („Client Space" canvas, 2026-08-31).

   ⚠️ IT IS NOT THE FOURTH DOOR THE 2026-08-30 NOTE REMOVED. That card linked to
   /experts — the row directly above it, and the home screen, and the bottom nav
   already went there. This one is the INTAKE, which had no permanent control in
   this chrome at all: it lived in the `Welcome` hero, on one of the three
   screens, and vanished the moment a client opened „შენახული".

   The address is `REQUEST_ROUTE` and NOT `/request?for=service`: the client
   room serves both verticals, and the wizard's own door-picker is what chooses
   (app/_home/request explains why a guess belongs on a page that knows the
   words somebody typed — this one knows nothing). Null while FEATURE_REQUESTS
   is off, and the sidebar draws nothing rather than a button into a 404. */
export const NEW_REQUEST_ACTION = { href: REQUEST_ROUTE, label: 'ახალი მოთხოვნა' } as const

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

/* ⚠️ SCREENS INSIDE A SECTION THAT ARE NOT THE SECTION (2026-09-02).
   `/me/r/<ref>` is one request, opened from the list — the rail correctly
   lights „მთავარი" for it (the matcher above), and until this table the bar
   above it therefore read „ჩემი მოთხოვნები", which is the LIST'S name. The
   screen's own back link says „ჩემი მოთხოვნები" too, so the same three words
   stood twice within 40px, one of them clickable and one not. Walked in the
   browser on the day the address was added.

   A table rather than a branch inside `titleForPath`, so the next screen of
   this shape is a line here instead of another `if`. Checked BEFORE the rows,
   because a section's own crumb is the fallback for everything under it. */
const SCREEN_CRUMBS: { match: (path: string) => boolean; crumb: string }[] = [
  // The word the page's own <title> already uses („მოთხოვნა — მცოდნე"), so the
  // browser tab and the bar say one thing.
  { match: startsWith('/me/r'), crumb: 'მოთხოვნა' },
]

/** The top bar's crumb: a named screen if this is one, else the longest
 *  matching workspace destination, by its own `crumb` when it has one (see
 *  NavItem). Never invented — a path outside all of them falls back to the
 *  room's name. */
export function titleForPath(path: string): string {
  for (const s of SCREEN_CRUMBS) if (s.match(path)) return s.crumb
  let best: NavItem | null = null
  for (const item of WORKSPACE_NAV) {
    if (item.match(path) && (!best || item.href.length > best.href.length)) best = item
  }
  return best ? (best.crumb ?? best.label) : 'ჩემი სივრცე'
}
