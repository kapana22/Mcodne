// WHAT SOMEBODY OFFERS ON THIS PLATFORM — the two capabilities behind /join.
//
// A hat (lib/hats) is who you are; a capability is what you are set up to
// sell. Today the two capabilities map onto the same tables the hats read:
//   CONSULT — a TutorProfile row (an approved expert who takes consultations)
//   WORK    — a ServiceProfile row AND an active RequestAccess (an admitted
//             ხელოსანი who is routed requests)
// Not one new concept: `capabilitiesOf` is `hatsOf` narrowed to the supply
// side, and the labels are the words the signup tiles already use, so the
// door at /join and the tile at /signup say the same thing.

import { prisma } from './prisma'

export const CAPABILITIES = ['CONSULT', 'WORK'] as const
export type Capability = (typeof CAPABILITIES)[number]

/** The tile wording from app/signin/_signup.tsx, reused verbatim. */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  CONSULT: 'ვაკონსულტირებ',
  WORK: 'სერვისს ვასრულებ',
}

/** Parses `?can=CONSULT|WORK|CONSULT,WORK` (case-insensitive); unknown → []. */
export function parseCapabilities(raw: string | string[] | null | undefined): Capability[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ''])
    .flatMap(s => s.split(','))
    .map(s => s.trim().toUpperCase())
  return CAPABILITIES.filter(c => parts.includes(c))
}

/**
 * Every capability this person already has, in CAPABILITIES order.
 *
 * ONE QUERY, the same reads as lib/hats → hatsOf: the profile row for CONSULT;
 * the profile row plus an ACTIVE allowlist row for WORK. A ServiceProfile
 * without access is somebody who filled in a form and was never let in.
 */
export async function capabilitiesOf(userId: string): Promise<Capability[]> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tutor: { select: { id: true } },
      serviceProfile: { select: { id: true } },
      requestAccess: { select: { active: true } },
    },
  })
  if (!u) return []
  const out: Capability[] = []
  if (u.tutor) out.push('CONSULT')
  if (u.serviceProfile && u.requestAccess?.active === true) out.push('WORK')
  return out
}

/**
 * The half they do NOT have yet, or null when they hold both (or neither — a
 * plain client is invited by the ordinary join door, not by this one).
 *
 * ⚠️ THIS EXISTS BECAUSE THE DOOR WAS INVISIBLE (2026-08-19). `/join` has always
 * offered exactly the missing half — an approved expert who opens it is shown
 * the trades form and nothing else. But every link to it is gated by
 * `showApplyCta`, which answers „no role, or a client" — so somebody who is
 * ALREADY a provider is the one person the invitation never reaches, and the
 * capability switch the product is built on could only be used by typing the
 * URL. Owner, 2026-08-19: „ვიღაცას უბრალოდ ექნებოდა ჩართული კონსულტაციის
 * ფუნქცია, ვიღაცას არა… ფუნქციებში ექნებოდა ეს გასააქტიურებელი."
 */
export function missingCapability(caps: readonly Capability[] | undefined | null): Capability | null {
  if (!caps || caps.length !== 1) return null
  return caps[0] === 'CONSULT' ? 'WORK' : 'CONSULT'
}

/** The word for turning the other half on. Plain: what it does, nothing more. */
export const CAPABILITY_ENABLE_LABEL: Record<Capability, string> = {
  CONSULT: 'ჩართე კონსულტაციები',
  WORK: 'ჩართე სერვისები',
}

/** Where that switch leads — the one door, opened on the missing half. */
export function enableCapabilityHref(cap: Capability): string {
  return `/join?can=${cap}`
}

/**
 * Who still deserves the plain „become a provider" invitation.
 *
 * ⚠️ CAPABILITIES, NOT THE ROLE (2026-08-19). `showApplyCta(role)` answers „no
 * role, or a client", and an approved MASTER keeps role CLIENT (lib/hats says
 * why) — so every „გახდი ექსპერტი" surface was still inviting somebody who is
 * already a provider, in the wrong words, next to the „ჩართე…" switch that says
 * the right ones. The invitation belongs to people who offer NOTHING yet; a
 * provider who holds one half gets `missingCapability` instead, and somebody
 * with both gets neither. An admin is nobody's applicant.
 */
export function showJoinInvite(
  role: string | null | undefined,
  caps: readonly Capability[] | undefined | null,
): boolean {
  if (role === 'ADMIN') return false
  return (caps?.length ?? 0) === 0
}
