// ⚠️ THIS FOLDER WAS `components/tutor/` UNTIL 2026-08-30 — the chrome of the
// PROVIDER workspace, filed under one of the words the product retired.
// „ტუტორი" is on the banned list in CLAUDE.md (with მასწავლებელი, ხელოსანი,
// სტუდენტი and the rest), `Role` has said USER · PROVIDER · ADMIN since
// 2026-08-24, and the second kind of seller the name distinguished has not
// existed since then either.
//
// It is `components/work/` because that is what the space is CALLED — the
// files inside are already `Workspace*`, and a reader in app/work/layout.tsx
// importing from @/components/work has nothing to translate. „provider" was the
// other candidate and is worse here: `app/work/(provider)/` already means
// something NARROWER (the three request paths), so the word would name two
// different scopes in one tree.
//
// ⚠️ ITS MIRROR IS STILL MISNAMED. `components/me/` holds the CLIENT
// space's chrome, and its files are `Student*` inside — the same retired word,
// the same disease, untouched because this rename was scoped to one folder.
import { Icon } from '@/components/Icon'
import { PROVIDER_ROUTE } from '@/lib/requests'

// Single source of truth for the /work destinations. Consumed by
// WorkspaceSidebar (desktop nav) and WorkspaceTopBar (page title).
//
// ONE RAIL, ONE PIPELINE (2026-08-21). /work is the supply side's space
// whatever you supply. Every destination below is shared except three, and each
// of those three is a TOOL one capability owns — never a group, never a half of
// the product. The shell decides which by capability (lib/capabilities →
// capabilitiesOf; ADMIN sees both) and the order is the pipeline, not the
// capability — see the note above WORKSPACE_NAV.

export type NavBadgeKey = 'messages' | 'openRequests'

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
 * THE RAIL — THE SERVICE PIPELINE, IN ORDER (rewritten 2026-08-21).
 *
 * ⚠️ WHAT WAS WRONG WITH THE PREVIOUS LIST, in the owner's words: „ეს სივრცე
 * ძველებურად არის მოწყობილი — კონსულტაციაზეა აგებული და ამიტომ
 * არაკომფორტულია." Ten rows for somebody holding both capabilities, and they
 * read as two products stacked: four shared, then the master's two, then the
 * expert's three. The last three were not tools a provider reaches for — they
 * were the old expert workspace, still standing, with the service screens added
 * beside it. And one of them, „პროფილი", answered the same question as „ჩემი
 * სერვისები" did for a master, because that page held their photo and their
 * sentence (see app/work/profile/page.tsx).
 *
 * So the rail follows what actually happens to a piece of work, and the site
 * sells services, so that pipeline is the service one:
 *
 *     მთავარი → მოთხოვნები → სამუშაოები → მიმოწერა → ჩემი გვერდი → ანგარიში
 *
 * ⚠️ THE TWO QUESTIONS BECAME ONE PAGE (2026-08-30). „რას ვყიდი" (/work/services)
 * and „ვინ ვარ" (/work/profile) were two rows here because they were two rows in
 * the database — and they stopped being two on 2026-08-24, when `TutorProfile`
 * was absorbed into `ServiceProfile`. The rail kept advertising a split the
 * schema no longer had, so a provider opened two destinations, met the same
 * preview card, the same „ნახე შენი პროფილი" button and the same on/off column
 * in both, and asked the obvious question. Owner, 2026-08-30: „ეს ორი არის და
 * შიგნით ერთი და იგივე ინფოს აკეთებს თითქოს და რატომ."
 *
 * „ჩემი გვერდი" is that one editor. „ანგარიში" is the residue — the password and
 * the visibility switch, the only two controls in the pair that write nothing a
 * client reads — and it is LAST because it is the one row here that is not about
 * selling anything.
 *
 * ⚠️ AND „შეთავაზებები" IS NOT A ROW ANY MORE. A sent offer is the first stage
 * of a job, not a separate place: /work/jobs and /work/offers now carry one tab
 * bar between them („გაგზავნილი" / „ხელში მაქვს"), which is where a stage
 * belongs. Nothing was deleted — the page and its address are untouched.
 *
 * What is left conditional is exactly what one capability OWNS: the requests
 * feed (you bid on work) and the calendar and the earnings report (you sell
 * time). Eight rows become six for one capability and seven for both.
 */
export const WORKSPACE_NAV: NavItem[] = [
  { href: '/work',          label: 'მთავარი',        icon: 'category', match: p => p === '/work' },
  // ⚠️ ONE ROW FOR THE WHOLE FLOW (2026-08-29). „მოთხოვნები" was a second row,
  // and the two of them named three stages of ONE job: an open request, the
  // offer you sent for it, the work you won. Owner: „ერთი ნაკადი გახდეს."
  // The row matches all three addresses and carries the queue's badge, because
  // the number a person is waiting behind is the same number either way.
  { href: '/work/jobs',     label: 'სამუშაოები',     icon: 'list',
    match: p => startsWith('/work/jobs')(p)
      || startsWith(`${PROVIDER_ROUTE}/offers`)(p)
      || startsWith(`${PROVIDER_ROUTE}/requests`)(p),
    badgeKey: 'openRequests' },
  { href: '/work/messages', label: 'მიმოწერა',        icon: 'chat',     match: startsWith('/work/messages'), badgeKey: 'messages' },
  // ⚠️ IT MATCHES /work/services TOO, and that is not defensive coding: the old
  // address 308s here (middleware.ts → SPACE_MOVES) and the redirect is served
  // BEFORE this runs, so the match is for the one frame a client-side link can
  // paint the old path. Cheap, and it stops the rail going dark mid-navigation.
  { href: '/work/profile',  label: 'ჩემი გვერდი', icon: 'user',
    match: p => startsWith('/work/profile')(p) || startsWith('/work/services')(p) },
  { href: '/work/account',  label: 'ანგარიში',    icon: 'settings', match: startsWith('/work/account') },
]

/* ⚠️ „გრაფიკი" AND „შემოსავალი" WENT WITH THE BOOKING PRODUCT (2026-08-24).
   They were `CONSULT_ONLY_NAV` — a weekly calendar and an earnings report, the
   two tools that only made sense for somebody selling time. Nothing replaces
   them: the money on this side of the site is a credit balance, and the shell
   already draws it. */

/* ⚠️ EMPTY SINCE 2026-08-29, AND THE SHAPE SURVIVES ON PURPOSE. „მოთხოვნები"
   was the one conditional row; it is the first STAGE of „სამუშაოები" now
   (app/work/_components/WorkTabs), so the rail has nothing left that depends
   on the allowlist. `navFor` still splices this list in, so the day a
   supply-side-only destination appears it has a place to go — and the day it
   does, the conditional is already written. */
export const WORK_ONLY_NAV: NavItem[] = []

/** What the viewer may see. `work` is the request queue — the one row that is
 *  still conditional, because a provider who was never admitted to the
 *  allowlist has nothing behind it. It was a pair (`expert` and `work`) while
 *  two capabilities existed. */
export type NavGroups = { work: boolean }

/** A block of the rail. One today; the shape survives so a divider can return
 *  without changing every caller. */
type NavSection = { caption: string | null; items: NavItem[] }

/**
 * The rail, in order. ONE list, and a single section so the sidebar keeps one
 * code path — the shape is a list of sections only because a divider may return.
 */
export function navFor(groups: NavGroups): NavSection[] {
  // ⚠️ THE ORDER IS THE PIPELINE, NOT THE CAPABILITIES. „მოთხოვნები" is spliced
  // in after the home rather than appended after the shared rows, because that
  // is where the work ENTERS: demand, then what you are doing about it, then
  // what you sell, then who you are. Appending the conditional rows at the end
  // is what made the rail read as „the shared product, and then the other one".
  const [home, ...rest] = WORKSPACE_NAV
  const items = [
    home,
    ...(groups.work ? WORK_ONLY_NAV : []),
    ...rest,
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
  for (const item of [...WORKSPACE_NAV, ...WORK_ONLY_NAV]) {
    if (item.match(path) && (!best || item.href.length > best.href.length)) best = item
  }
  return best?.label ?? 'სამუშაო სივრცე'
}
