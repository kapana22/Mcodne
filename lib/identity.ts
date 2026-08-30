// Who somebody is — role and hats — in ONE read.
//
// ⚠️ TWO SYSTEMS WERE ANSWERING THE SAME QUESTION (2026-08-21).
//
//   hatsOf         EXPERT  ← a TutorProfile
//                  MASTER  ← a ServiceProfile + an active RequestAccess
//   capabilitiesOf CONSULT ← a TutorProfile
//                  WORK    ← a ServiceProfile + an active RequestAccess
//
// Identical conditions, identical queries, two vocabularies. `/api/me` — hit on
// nearly every page load, by its own comment the cheapest heartbeat in the app —
// called both, so each request paid two `user.findUnique` round trips whose
// SELECTs overlapped almost completely.
//
// ⚠️ AND ON 2026-08-24 THE QUESTION ITSELF GOT SMALLER. The consultation product
// was removed; `TutorProfile` went with it, and with the table went the second
// half of every row above. One profile is left, so „what do they sell" has one
// answer — `provider` — and the labels that were already identical on screen
// („ექსპერტი" for both EXPERT and MASTER) are one word in one place.

import { prisma } from './prisma'
import { asRole, type RoleCode, type Hat } from './roles'

export type Identity = {
  role: RoleCode
  hats: Hat[]
  /** Do they sell anything here? One profile, one answer. */
  provider: boolean
}

/** Everything a menu, a guard or a label needs, from one indexed read. */
export async function identityOf(userId: string): Promise<Identity> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      serviceProfile: { select: { id: true } },
      requestAccess: { select: { active: true } },
      companyMemberships: { select: { companyId: true }, take: 1 },
    },
  })
  if (!u) return { role: 'USER', hats: ['CLIENT'], provider: false }

  const role = asRole(u.role)

  // ⚠️ THE ALLOWLIST IS REQUIRED, NOT JUST THE PROFILE. A ServiceProfile with no
  // active RequestAccess is somebody who filled in a form and was never let in;
  // sending them to a workspace listing requests they cannot answer would be the
  // emptiest room on the site. (The consultation half never checked this at all
  // — an approved TutorProfile was a workspace on its own — which is why the
  // two sides of the same act, selling something here, met two different rules.)
  const provider = !!u.serviceProfile && u.requestAccess?.active === true

  const hats: Hat[] = []
  if (role === 'ADMIN') hats.push('ADMIN')
  if (provider) hats.push('PROVIDER')
  if (u.companyMemberships.length > 0) hats.push('COMPANY')
  // Everybody is a client last — it is the fallback room, never a claim.
  hats.push('CLIENT')

  return { role, hats, provider }
}
