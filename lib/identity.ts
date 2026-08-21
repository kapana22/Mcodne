// Who somebody is — role, hats and capabilities — in ONE read.
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
// It also read worse than it ran. Once USER and PROVIDER replaced STUDENT and
// TUTOR, `HAT_LABEL.EXPERT` and `HAT_LABEL.MASTER` were both „ექსპერტი" — two
// names for one thing, which is the shape of mistake the owner has caught on
// screen after screen.
//
// So the supply side is decided ONCE, here, and both vocabularies are derived
// from that one answer. `hatsOf` and `capabilitiesOf` remain for their existing
// callers and now agree by construction rather than by both being maintained.

import { prisma } from './prisma'
import { asRole, type RoleCode, type Hat } from './roles'
import type { Capability } from './capabilities'

export type Identity = {
  role: RoleCode
  hats: Hat[]
  capabilities: Capability[]
}

/** Everything a menu, a guard or a label needs, from one indexed read. */
export async function identityOf(userId: string): Promise<Identity> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      tutor: { select: { id: true } },
      serviceProfile: { select: { id: true } },
      requestAccess: { select: { active: true } },
      companyMemberships: { select: { companyId: true }, take: 1 },
    },
  })
  if (!u) return { role: 'USER', hats: ['CLIENT'], capabilities: [] }

  const role = asRole(u.role)

  // The two facts everything else is derived from.
  const sellsConsultation = !!u.tutor
  // ⚠️ THE ALLOWLIST IS REQUIRED, NOT JUST THE PROFILE. A ServiceProfile with no
  // active RequestAccess is somebody who filled in a form and was never let in;
  // sending them to a workspace listing requests they cannot answer would be the
  // emptiest room on the site.
  const sellsWork = !!u.serviceProfile && u.requestAccess?.active === true

  const capabilities: Capability[] = []
  if (sellsConsultation) capabilities.push('CONSULT')
  if (sellsWork) capabilities.push('WORK')

  const hats: Hat[] = []
  if (role === 'ADMIN') hats.push('ADMIN')
  if (sellsConsultation) hats.push('EXPERT')
  if (sellsWork) hats.push('MASTER')
  if (u.companyMemberships.length > 0) hats.push('COMPANY')
  // Everybody is a client last — it is the fallback room, never a claim.
  hats.push('CLIENT')

  return { role, hats, capabilities }
}
