// WHO SOMEBODY IS ON THIS PLATFORM — the one function that answers it.
//
// ⚠️ THE PROBLEM THIS EXISTS FOR. „Who are you" had two independent answers
// that did not know about each other: `Role` (STUDENT | TUTOR | ADMIN), which
// decides where you land and what every guard lets you do, and `RequestAccess`,
// which decides whether you may bid on requests. Measured 2026-08-18: ALL FOUR
// people on the allowlist carry `role: STUDENT` — the owner included. So a
// tradesperson was, to this site, a learner who happens to be let into one
// hidden room: they signed in and landed on „იპოვე მასწავლებელი".
//
// ⚠️ AND WHY THIS IS NOT A FOURTH ROLE. A role is single-valued and identity
// here is not. The same human is a CLIENT when they need a lawyer and a MASTER
// when somebody needs a plumber; the owner is an ADMIN and on the allowlist; a
// tutor may also do home repairs. `Role` cannot hold two of those at once, and
// adding a value would force every `role === ROLE.USER` check on the site —
// homeForRole, showApplyCta, requireRole, the nav, the shells, the booking flow
// — to be re-examined to express something only one subsystem cares about.
//
// So the role stays what it is, and a HAT is what you can DO. Every hat below is
// an existing table; not one new concept is introduced here. Owner, 2026-08-18:
// „კარგად უნდა გამიჯნო ექსპერტი და სტუდენტი — ეს არ ნიშნავს, რომ ყველაფერი
// უნდა გავაერთიანო." This is the separating half: each hat has its own
// workspace and nobody is shown the wrong one.

import { identityOf } from './identity'
import { PROVIDER_ROUTE } from './requests'
import { homeForRole } from './roleHome'

// The vocabulary itself lives in lib/roles (a pure leaf, importable from a
// client component); this file adds the database-backed `hatsOf`.
import { HATS, HAT_LABEL, type Hat } from './roles'
import { ROLE } from '@/lib/roles'
export { HATS, HAT_LABEL }
export type { Hat }

/**
 * Where each hat lives.
 *
 * ⚠️ THE PROVIDER PATH COMES FROM THE SUBSYSTEM'S OWN CONSTANT, not from a
 * literal typed here. tests/requests.test.ts forbids a quoted „/provider"
 * anywhere outside the subsystem — the rule that keeps the bidder's side
 * reachable by invitation only — and referencing `PROVIDER_ROUTE` is both the
 * correct dependency direction and the reason this file does not trip it. The
 * subsystem publishes its address; the identity layer quotes it by name.
 */
export const HAT_HOME: Record<Hat, string> = {
  ADMIN: '/admin',
  EXPERT: '/work',
  // ⚠️ THE HOME, NOT THE QUEUE (2026-08-21). This pointed at the master's queue
  // — PROVIDER_ROUTE + the requests segment — and that was the reason the balance „did not exist": /work is the ONLY screen that
  // runs `grantEarnedTasks` and draws the CreditStrip, and a person who
  // registered a SERVICE was the one supply-side hat never sent there. Measured
  // that day on live data: both service providers had zero grants — one of them
  // had six priced services, a photo, a work photo and an area (85₾ earned) and
  // a balance of −5₾ from the single offer they had sent.
  //
  // /work was BUILT for this hat — read its own header: „a work-only provider
  // had no home at all… the first screen of their workspace was a queue with no
  // context and no balance." The page landed, this line did not follow. The
  // (expert) layout and the avatar menu were both repointed at /work on
  // 2026-08-20; sign-in and /join were the two doors left behind.
  MASTER: PROVIDER_ROUTE,
  // COMPANY stays on the queue's sibling: a company member holds RequestAccess
  // WITHOUT a ServiceProfile, so `capabilitiesOf` gives them no WORK capability
  // and /work would 404 them. Their home is the screen their gate actually opens.
  COMPANY: `${PROVIDER_ROUTE}/offers`,
  CLIENT: '/me',
}

/**
 * Every hat this person wears, most-owning first.
 *
 * ONE QUERY. Four `select`s on relations the User row already joins, so this
 * costs one round trip rather than four — it runs on the sign-in path, which is
 * the one place a person is watching a spinner.
 *
 * ⚠️ CLIENT IS ALWAYS PRESENT and is always last. Everybody can ask for help,
 * including an expert who needs a plumber, so „client" is not a hat you either
 * have or lack — it is the floor. Returning it means `homeForHats` never has an
 * empty list to reason about, and a switcher always has somewhere to go back to.
 */
export async function hatsOf(userId: string): Promise<Hat[]> {
  // ⚠️ ONE READER SINCE 2026-08-21 (lib/identity). This used to run its own
  // `user.findUnique` deciding EXPERT from a TutorProfile and MASTER from a
  // ServiceProfile plus the allowlist — the identical pair of conditions
  // lib/capabilities was deciding CONSULT and WORK from, in a second query, on
  // the same request. They now agree by construction instead of by both being
  // kept correct.
  return (await identityOf(userId)).hats
}

/**
 * Where to send somebody who has just signed in.
 *
 * ⚠️ THE FIRST HAT WINS, and the order in `HATS` is the whole decision. An
 * admin belongs in the panel whatever else they are; an expert's calendar
 * outranks their client history because that is the side other people are
 * waiting on. „Client" is last precisely because everybody has it.
 *
 * A person with two hats still lands on one door — a chooser at sign-in is a
 * question asked before anybody has said what they came for. The switcher
 * belongs in the avatar menu, where it costs nothing until it is wanted.
 */
export function homeForHats(hats: Hat[], role?: string | null): string {
  for (const h of HATS) if (hats.includes(h)) return HAT_HOME[h]
  // Unreachable while CLIENT is always returned — kept so a future change to
  // hatsOf cannot silently produce an empty redirect.
  return homeForRole(role)
}

/** Does this person wear more than the floor? Drives whether a switcher is
 *  drawn at all — one hat needs no switch. */
export function hasMultipleHats(hats: Hat[]): boolean {
  return hats.length > 1
}
