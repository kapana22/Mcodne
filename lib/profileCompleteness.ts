// WHEN IS A PROVIDER'S CARD FIT TO BE SEEN? One function, one answer.
//
// Owner, 2026-09-04: „სანამ სრულად არ შევსებს, ფოტოს არ დადებს, იქამდე არ
// გამოჩნდეს პროფილზე."
//
// ⚠️ IT IS THE PRECONDITION OF `published`, NOT A SECOND SWITCH. `ServiceProfile
// .published` already exists and every catalogue and routing read in the code
// asks `published && available` (lib/requestsServer, lib/categoryCounts,
// app/experts/_providers, lib/requestLive, the admin tabs). Adding a separate
// „complete" flag beside it would mean two columns answering „is this visible",
// and two facts about one thing eventually disagree — which is how a control
// starts lying. So: one function decides, every WRITE path recomputes
// `published` from it, and every existing READER is already correct.
//
// ⚠️ AND IT ASKS WHAT THE CARD ASKS, NOT WHAT THE COLUMN SAYS. Measured on
// production 2026-09-04: 25 of 28 profiles have `photoUrl = null` and 24 of
// those draw a perfectly good face anyway — the catalogue falls back to the
// account avatar for every professional migrated on 2026-08-24
// (app/experts/_providers, „THE PROFILE PHOTO FIRST, THE ACCOUNT AVATAR
// SECOND"). A rule that read the column alone would have hidden 28 of 28
// providers and emptied the site. Asked as „is there a face", it hides 5.
//
// The sibling rule for an APPLICATION is `lib/providerApplication →
// approvalBlockers`. Same four words for the same four gaps, deliberately:
// they are the same requirement asked at two moments — before a profile exists,
// and about the profile that now does.

import { MASTER } from './providerApplication'

export type ProfileCompletenessInput = {
  /**
   * Is there a face AT ALL, by either route? `faceFrom` answers it for a caller
   * that already holds both columns.
   *
   * ⚠️ A BOOLEAN AND NOT THE TWO URLs, AND THAT IS ABOUT BYTES (2026-09-04).
   * An avatar is stored as a base64 data URI — ~32KB a row — so selecting it to
   * ask „is this null" ships the whole portrait to a route that then throws it
   * away. tests/apiPayloadHygiene refuses exactly that, and it caught this rule
   * on its first pass through /api/provider/offers. Every caller can answer the
   * question more cheaply than it can fetch the answer.
   */
  hasFace?: boolean
  about?: string | null
  services?: string[]
  areas?: string[]
  categoryId?: string | null
}

/**
 * What is still missing, in the owner's words, ready to print on /work.
 *
 * Empty array = the card is fit to be seen.
 *
 * ⚠️ THE `about` FLOOR IS `MASTER.ABOUT_MIN`, NOT A NUMBER CHOSEN HERE. That
 * constant is what the application form has always demanded (40 characters);
 * inventing a second threshold would mean a provider who satisfied the door
 * could be refused by the profile for a rule nobody ever told them.
 */
export function profileBlockers(p: ProfileCompletenessInput): string[] {
  const out: string[] = []
  if (!p.hasFace) out.push('ფოტო')
  if (!p.about || p.about.trim().length < MASTER.ABOUT_MIN) out.push('აღწერა')
  if (!p.services || p.services.length === 0) out.push('სერვისი')
  if (!p.areas || p.areas.length === 0) out.push('ქალაქი')
  if (!p.categoryId) out.push('კატეგორია')
  return out
}

/** The one boolean `published` is computed from. */
export function isProfileComplete(p: ProfileCompletenessInput): boolean {
  return profileBlockers(p).length === 0
}

/**
 * „Is there a face" for a caller that already holds both columns in memory —
 * the profile editor, and `profileFacts`, which reads the avatar anyway to
 * decide whether the 15₾ photo bonus is earned.
 *
 * A caller that does NOT already hold them must not fetch them to get here:
 * ask the database for the boolean instead (`photoUrl IS NOT NULL OR
 * avatarUrl IS NOT NULL`), the way /api/provider/offers does.
 */
export function faceFrom(photoUrl?: string | null, avatarUrl?: string | null): boolean {
  return !!photoUrl || !!avatarUrl
}
