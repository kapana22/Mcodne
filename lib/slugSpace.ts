// ONE URL NAMESPACE FOR EVERY PROVIDER — /experts/<slug>.
//
// Under one prefix a slug is an IDENTITY, not a table-local key: minting the
// same name twice would hand one URL to two people, and whichever the resolver
// reached first would own it forever. So generators ask one question —
// `slugTaken(slug)` — instead of checking their own table.
//
// ⚠️ IT IS A CHECK, NOT A LOCK. The unique index is what makes a race inside
// the table safe; this covers the reserved list, which no index can.

import { prisma } from './prisma'
import { professions } from './professionSeo'
import { OFFER_GROUPS, OFFER_TOPICS } from './serviceProfile'

/**
 * Reserved segments — a slug equal to one of these would shadow a real page.
 *
 *   1. ROUTE WORDS, live and 308'd (a retired address is still typed). A
 *      provider on „admin" sits under a folder route that always wins.
 *   2. EVERY PROFESSION SLUG — /experts/<slug> resolves the profession landing
 *      FIRST, so an expert on „iuristi" is shadowed by a page they cannot see.
 *   3. EVERY SERVICE GROUP AND TOPIC ID, including ones not yet open: a trade
 *      opened next month must not collide with a slug minted today.
 *
 * 2 and 3 are what make the resolver's precedence safe rather than merely
 * documented — see app/experts/[slug]/page.tsx.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // 1. the route words — live…
  'about', 'admin', 'api', 'blog', 'contact', 'cookies',
  'experts', 'help', 'join', 'me', 'notifications', 'privacy', 'request',
  'session', 'settings', 'signin', 'signup', 'swavleba', 'terms', 'work',
  // …and retired (a 308 is still an address a person can type; so is a 404 —
  // 'abroad' and 'business' were deleted outright on 2026-09-03 and stay
  // reserved, because a provider slug is forever and those two words are
  // exactly what a firm would ask for)
  'abroad', 'apply', 'ask', 'business', 'categories', 'konsultacia', 'masters',
  'provider', 'services', 'student', 'tutor', 'tutors',
  // …plus the generic segments a marketplace URL is expected to grow
  'all', 'edit', 'new', 'search',
  // 2. every profession landing
  ...professions.map(p => p.slug),
  // 3. every trade landing, live or not yet open
  ...OFFER_GROUPS.map(g => g.id),
  ...OFFER_TOPICS.map(t => t.id),
])

/** True when a slug names a page rather than a person — see RESERVED_SLUGS. */
export const slugReserved = (slug: string): boolean => RESERVED_SLUGS.has(slug)

/**
 * Is this slug already spoken for under /experts/?
 *
 * A DB failure answers `true` („taken"), the safe direction: the caller tries
 * the next suffix and at worst a profile keeps its id URL for a while.
 * Answering `false` on an outage would mint a duplicate.
 */
export async function slugTaken(slug: string): Promise<boolean> {
  if (slugReserved(slug)) return true
  try {
    const provider = await prisma.serviceProfile.findFirst({ where: { slug }, select: { id: true } })
    return provider !== null
  } catch {
    return true
  }
}
