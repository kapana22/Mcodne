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
// adding a value would force every `role === ROLE.CLIENT` check on the site —
// homeForRole, showApplyCta, requireRole, the nav, the shells, the booking flow
// — to be re-examined to express something only one subsystem cares about.
//
// So the role stays what it is, and a HAT is what you can DO. Every hat below is
// an existing table; not one new concept is introduced here. Owner, 2026-08-18:
// „კარგად უნდა გამიჯნო ექსპერტი და სტუდენტი — ეს არ ნიშნავს, რომ ყველაფერი
// უნდა გავაერთიანო." This is the separating half: each hat has its own
// workspace and nobody is shown the wrong one.

import { prisma } from './prisma'
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
  MASTER: `${PROVIDER_ROUTE}/requests`,
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
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      tutor: { select: { id: true } },
      serviceProfile: { select: { id: true } },
      requestAccess: { select: { active: true, kind: true } },
      companyMemberships: { select: { companyId: true }, take: 1 },
    },
  })
  if (!u) return ['CLIENT']

  const out: Hat[] = []
  if (u.role === 'ADMIN') out.push('ADMIN')
  // The profile, not the role: a TUTOR row without one has nothing to show on a
  // calendar, and an approved expert always has both.
  if (u.tutor) out.push('EXPERT')
  // ⚠️ THE ALLOWLIST IS REQUIRED, NOT JUST THE PROFILE. A ServiceProfile with no
  // active RequestAccess is somebody who filled in a form and was never let in —
  // sending them to a workspace listing requests they cannot answer would be the
  // emptiest room on the site.
  const allowed = u.requestAccess?.active === true
  if (u.serviceProfile && allowed) out.push('MASTER')
  if (u.companyMemberships.length > 0) out.push('COMPANY')
  out.push('CLIENT')
  return out
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
