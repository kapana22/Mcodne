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
  // ⚠️ HOW IT IS BOUGHT, NOT WHAT IT IS (2026-08-20). „ვაკონსულტირებ" named a
  // second product; there is one — a service — and this half is the one with a
  // clock on it. See lib/catalogItems → KIND_LABEL for the full reasoning.
  CONSULT: 'ჯავშნადი სერვისი',
  WORK: 'სერვისი შეთანხმებით',
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

/* ═══════════ THE DOOR: ONE ADDRESS, ONE WORD ═══════════════════════════
 *
 * ⚠️ EVERY HUMAN-FACING INVITATION USES THESE TWO CONSTANTS (2026-08-20), and
 * the reason is measured, not stylistic. The same action carried SIX labels
 * across the site — „გახდი ექსპერტი" (header, footer), „გახდი მცოდნე" (home,
 * from the DB), „დაარეგისტრირე სერვისი" (footer), „შემოგვიერთდი" (user menu
 * and the door's own h1), „ვთავაზობ" (signup), „დაიწყე განაცხადი" (the pitch)
 * — and three different destinations. A label that does not reappear as the
 * destination's heading reads as „wrong page" and costs the click (NN/g,
 * information scent).
 *
 * ⚠️ AND THE HREF CARRIES NO `?can=`. That parameter SEEDS the door; it is not
 * a navigation choice. Until today the header and the footer both pointed at
 * `/join?can=CONSULT`, and the door honoured a preset over the profession the
 * applicant had just picked — so a სანტექნიკოსი arriving from the site's own
 * navigation was told „შენს პროფესიაზე კონსულტაციებს ჩაატარებ" and dropped
 * into the consultation wizard, with the service half unreachable. The
 * hierarchy (CLAUDE.md rule 4) was being broken by a query string.
 *
 * `?can=` remains legitimate in exactly two places, both of which NAME a half
 * on purpose: the two crawlable pitches (`/join?can=WORK` is the trades
 * landing), and system links that resume or enable one half —
 * `enableCapabilityHref`, `lib/auth`'s pending-application resume, the
 * application mails and notifications.
 */
export const JOIN_DOOR_HREF = '/join'

/**
 * The one label for it — in the header, the user menu, the footer's action and
 * the door's own h1, so the click is confirmed by the heading it lands on.
 *
 * ⚠️ PLAIN, AND A SENTENCE THE SITE ALREADY WROTE. Owner, 2026-08-20, looking
 * at „შემოგვიერთდი" and „დანარჩენს ჩვენ მოვაწყობთ": „ძალიან ცუდად წერ
 * ტექსტებს, არავინ იყენებს ესეთს… მარტივი ტექსტი უნდა იყოს, არ უნდა ეწეროს
 * გაურკვეველი, გამოგონილი ინფორმაციები." This is the footer's own wording and
 * the trades pitch's own h1, and it is service-first — which the model already
 * makes correct for both halves: a consultation IS a kind of service.
 */
export const JOIN_DOOR_LABEL = 'დაარეგისტრირე სერვისი'

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
