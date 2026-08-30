// THE DOOR — one address, one word, and the one question behind it.
//
// ⚠️ THIS FILE USED TO HOLD TWO CAPABILITIES (2026-08-24). `CONSULT` (a
// TutorProfile: an approved expert who takes bookings) and `WORK` (a
// ServiceProfile plus an active RequestAccess) were the two halves a person
// switched on from one account, with a label each, a wizard each, a workspace
// verdict each and a „ჩართე…" switch between them.
//
// The consultation product was removed that day. There is no second half to
// switch on, so there is no axis: somebody either sells services here or they
// do not, and `identityOf(...).provider` is the whole answer. What survives is
// the invitation — the address, the label, and the rule about WHO still needs
// to see it.
//
// Owner, 2026-08-24: „მინდა რომ მცოდნეზე კონსულტაციები საერთოდ ამოვიღოთ და
// მოვარგოთ სერვისებზე რაც ჩანაფიქრში იყო."

import { identityOf } from './identity'

/**
 * Does this person sell anything here?
 *
 * One indexed read, shared with `hatsOf` — see lib/identity for why there is
 * only one reader.
 */
export async function isProvider(userId: string): Promise<boolean> {
  return (await identityOf(userId)).provider
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
 * ⚠️ AND THE HREF CARRIES NO QUERY. It used to accept `?can=CONSULT|WORK`,
 * which SEEDED which of the two wizards opened — and honoured a preset over the
 * profession the applicant had just picked, so a სანტექნიკოსი arriving from the
 * site's own navigation was told „შენს პროფესიაზე კონსულტაციებს ჩაატარებ" and
 * dropped into the consultation wizard. There is one wizard now and nothing to
 * seed; the parameter is gone rather than ignored.
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
 * the trades pitch's own h1 — and since 2026-08-24 it is simply what the door
 * does, for everybody who opens it.
 */
export const JOIN_DOOR_LABEL = 'დაარეგისტრირე სერვისი'

/**
 * Who still deserves the plain „become a provider" invitation.
 *
 * ⚠️ IT ASKS WHAT THEY SELL, NOT WHAT ROLE THEY HOLD (2026-08-19).
 * `showApplyCta(role)` answered „no role, or a client", and an approved
 * provider could still be carrying role USER — so every „გახდი ექსპერტი"
 * surface was inviting somebody who is already listed. The invitation belongs
 * to people who offer NOTHING yet; an admin is nobody's applicant.
 */
export function showJoinInvite(
  role: string | null | undefined,
  provider: boolean | undefined | null,
): boolean {
  if (role === 'ADMIN') return false
  return provider !== true
}

/* ⚠️ THE HEADER'S INTAKE CTA IS NOT HERE — it is `showRequestCta` in
 * lib/requests.ts (2026-08-21). It reads the same fact, so this file is where
 * it wanted to live, and it cannot: this module imports prisma (through
 * lib/identity), and prisma loads `.env` the moment it is imported. Pulling
 * that into tests/requests.test.ts switched FEATURE_REQUESTS on inside the
 * process that pins „the flag defaults to off", i.e. importing a two-line pure
 * function broke the safety property it had nothing to do with. The subsystem's
 * own leaf is prisma-free by contract and states so at the top of the file.
 */
