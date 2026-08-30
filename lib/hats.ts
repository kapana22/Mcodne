// WHO SOMEBODY IS ON THIS PLATFORM — the one function that answers it.
//
// ⚠️ WHY A HAT IS NOT A ROLE. A role is single-valued and identity here is not:
// the same human is a CLIENT when they need a lawyer and a PROVIDER when
// somebody needs a plumber, and the owner is an ADMIN and on the allowlist.
// Adding a role value would force every `role === ROLE.USER` check on the site
// to be re-examined to express something one subsystem cares about.
//
// So the role stays a permission and a HAT is what you can DO. Every hat below
// is an existing table; no new concept is introduced here.

import { identityOf } from './identity'
import { PROVIDER_ROUTE } from './requests'
import { homeForRole } from './roleHome'

// The vocabulary lives in lib/roles (a pure leaf, importable from a client
// component); this file adds the database-backed `hatsOf`.
import { HATS, HAT_LABEL, type Hat } from './roles'
import { ROLE } from '@/lib/roles'
export { HATS, HAT_LABEL }
export type { Hat }

/**
 * Where each hat lives.
 *
 * ⚠️ THE PROVIDER PATH COMES FROM THE SUBSYSTEM'S CONSTANT, not a literal.
 * tests/requests.test.ts forbids a quoted „/provider" outside the subsystem —
 * the rule that keeps the bidder's side reachable by invitation only.
 */
export const HAT_HOME: Record<Hat, string> = {
  ADMIN: '/admin',
  // The home, not the queue: /work is the only screen that runs
  // `grantEarnedTasks` and draws the CreditStrip.
  PROVIDER: '/work',
  // A company member holds RequestAccess WITHOUT a ServiceProfile, so they are
  // not a `provider` and /work would 404 them. Their home is what their gate opens.
  COMPANY: `${PROVIDER_ROUTE}/offers`,
  CLIENT: '/me',
}

/**
 * Every hat this person wears, most-owning first.
 *
 * ⚠️ CLIENT IS ALWAYS PRESENT and always last. Everybody can ask for help,
 * including an expert who needs a plumber, so it is the floor rather than a hat
 * you have or lack — `homeForHats` never sees an empty list.
 */
export async function hatsOf(userId: string): Promise<Hat[]> {
  return (await identityOf(userId)).hats
}

/**
 * Where to send somebody who has just signed in.
 *
 * ⚠️ THE FIRST HAT WINS, and the order in `HATS` is the whole decision. An
 * admin belongs in the panel whatever else they are; the supply side outranks
 * client history because that is the side other people are waiting on.
 *
 * Two hats still land on one door — a chooser at sign-in asks a question before
 * anybody has said what they came for. The switcher lives in the avatar menu.
 */
export function homeForHats(hats: Hat[], role?: string | null): string {
  for (const h of HATS) if (hats.includes(h)) return HAT_HOME[h]
  // Unreachable while CLIENT is always returned — kept so a future change to
  // hatsOf cannot silently produce an empty redirect.
  return homeForRole(role)
}

/** Does this person wear more than the floor? One hat needs no switcher. */
export function hasMultipleHats(hats: Hat[]): boolean {
  return hats.length > 1
}
