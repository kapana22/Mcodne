// ONE URL NAMESPACE FOR EVERY PROVIDER — /experts/<slug> (stage 11, 2026-08-19).
//
// ⚠️ WHY THIS FILE EXISTS AT ALL. Until today a provider lived in one of TWO
// address spaces: a TutorProfile answered at /experts/<slug>, a ServiceProfile
// at /services/<slug>. Two prefixes meant two namespaces, so `lib/expertSlug`
// checked only `TutorProfile.slug` and `lib/masterSlug` only
// `ServiceProfile.slug`, and „ana-gagoshidze" could correctly exist on both
// sides — each URL named exactly one profile.
//
// That stopped being true the moment both profiles answered under /experts.
// CLAUDE.md → THE PRODUCT MODEL: ONE provider, and a consultation is one KIND
// of service — two profile spaces contradict it. With one prefix a slug is an
// IDENTITY, not a table-local key: minting „ana-gagoshidze" a second time on
// the other table would hand one URL to two people, and whichever one the
// resolver reaches first would silently own it forever.
//
// So both generators now ask ONE question — `slugTaken(slug)` — and it looks in
// BOTH tables plus the reserved list. Measured before the merge (2026-08-19):
// 26 expert slugs, 7 provider slugs, ZERO collisions, so no existing row had to
// be renamed. Nothing here ever renames one: a slug is permanent (see the two
// generators' headers), and this file only decides what a NEW one may be.
//
// ⚠️ IT IS A CHECK, NOT A LOCK. Two databases-wide unique indexes still exist
// (one per table) and each generator still retries on a constraint violation —
// that is what makes a race inside one table safe. A cross-table race (two
// different people minted the same base name in the same millisecond, on two
// different tables) is not coverable by an index and is left to this check;
// the window is microseconds and the cost of losing it is one duplicate slug,
// which the resolver's fixed precedence still answers deterministically.

import { prisma } from './prisma'
import { professions } from './professionSeo'
import { SERVICE_GROUPS, SERVICE_TOPICS } from './serviceProfile'

/**
 * Reserved segments — a slug equal to one of these would shadow a real page.
 *
 * THREE KINDS OF WORD, and each is here for its own reason:
 *
 *   1. THE ROUTE WORDS. Every top-level segment the app answers, plus the ones
 *      it 308s (a retired address is still a URL somebody types). A provider
 *      minted onto „admin" or „join" would sit under a folder route that always
 *      wins in Next's matcher — a profile nobody could ever open.
 *
 *   2. EVERY PROFESSION SLUG (lib/professionSeo). /experts/<slug> resolves the
 *      profession landing FIRST — a fixed list in code — so an expert minted
 *      onto „iuristi" would be shadowed by a page they cannot see.
 *
 *   3. EVERY SERVICE GROUP AND TOPIC ID (lib/serviceProfile), all of them and
 *      not only the four live ones: a trade we open next month must not collide
 *      with a slug minted today. Same precedence argument — the trade landing
 *      is resolved before either profile.
 *
 * Kinds 2 and 3 are what makes the resolver's precedence SAFE rather than
 * merely documented. See app/experts/[slug]/page.tsx.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // 1. the route words — live…
  'about', 'abroad', 'admin', 'api', 'blog', 'business', 'contact', 'cookies',
  'experts', 'help', 'join', 'me', 'notifications', 'privacy', 'request',
  'session', 'settings', 'signin', 'signup', 'swavleba', 'terms', 'work',
  // …and retired (a 308 is still an address a person can type)
  'apply', 'ask', 'categories', 'konsultacia', 'masters', 'provider',
  'services', 'student', 'tutor', 'tutors',
  // …plus the generic segments a marketplace URL is expected to grow
  'all', 'edit', 'new', 'search',
  // 2. every profession landing
  ...professions.map(p => p.slug),
  // 3. every trade landing, live or not yet open
  ...SERVICE_GROUPS.map(g => g.id),
  ...SERVICE_TOPICS.map(t => t.id),
])

/** True when a slug names a page rather than a person — see RESERVED_SLUGS. */
export const slugReserved = (slug: string): boolean => RESERVED_SLUGS.has(slug)

/**
 * Is this slug already spoken for anywhere under /experts/?
 *
 * ONE QUESTION, BOTH TABLES, plus the reserved list — the whole point of the
 * file. A DB failure answers `true` („taken"), which is the safe direction: the
 * caller tries the next suffix and, at worst, a profile keeps its id URL for a
 * while. Answering `false` on an outage would mint a duplicate.
 */
export async function slugTaken(slug: string): Promise<boolean> {
  if (slugReserved(slug)) return true
  try {
    const [expert, provider] = await Promise.all([
      prisma.tutorProfile.findFirst({ where: { slug }, select: { id: true } }),
      prisma.serviceProfile.findFirst({ where: { slug }, select: { id: true } }),
    ])
    return expert !== null || provider !== null
  } catch {
    return true
  }
}
