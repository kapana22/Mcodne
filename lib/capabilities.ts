// THE DOOR — one address, one label, and who still needs to see it.

import { identityOf } from './identity'

/** Does this person sell anything here? One indexed read, shared with hatsOf. */
export async function isProvider(userId: string): Promise<boolean> {
  return (await identityOf(userId)).provider
}

// ⚠️ EVERY HUMAN-FACING INVITATION USES THESE TWO CONSTANTS, and the reason is
// measured. The same action once carried SIX labels and three destinations; a
// label that does not reappear as the destination's heading reads as „wrong
// page" and costs the click (NN/g, information scent).
//
// The href carries no query. It accepted `?can=…` to seed which wizard opened,
// and honoured the preset over the profession the applicant had just picked.
export const JOIN_DOOR_HREF = '/join'
export const JOIN_DOOR_LABEL = 'დაარეგისტრირე სერვისი'

/**
 * Who still deserves the „become a provider" invitation.
 *
 * ⚠️ IT ASKS WHAT THEY SELL, NOT WHAT ROLE THEY HOLD. An approved provider can
 * still carry role USER, so a role-based check invited people already listed.
 * An admin is nobody's applicant.
 */
export function showJoinInvite(
  role: string | null | undefined,
  provider: boolean | undefined | null,
): boolean {
  if (role === 'ADMIN') return false
  return provider !== true
}

/* ⚠️ THE HEADER'S INTAKE CTA IS NOT HERE — it is `showRequestCta` in
 * lib/requests.ts. It reads the same fact and belongs here, but this module
 * imports prisma (via lib/identity), and prisma loads `.env` on import: pulling
 * that into tests/requests.test.ts switched FEATURE_REQUESTS on inside the
 * process pinning „the flag defaults to off". The subsystem's leaf is
 * prisma-free by contract. */
