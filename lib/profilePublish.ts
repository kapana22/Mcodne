// THE ONE WRITER OF `ServiceProfile.published`.
//
// ⚠️ `published` IS DERIVED, NOT TYPED IN (2026-09-04). Owner: „სანამ სრულად არ
// შევსებს, ფოტოს არ დადებს, იქამდე არ გამოჩნდეს პროფილზე." The rule itself is
// `lib/profileCompleteness → profileBlockers`; this file is the half that has a
// database, and it exists so the rule is applied in ONE place rather than at
// each of the five routes that can change whether a profile is complete.
//
// Every read in the app already asks `published && available` — the catalogue,
// the category counts, request routing, the admin's candidate picker. None of
// them changed. What changed is who is allowed to set the flag.
//
// ⚠️ `available` IS NOT TOUCHED, AND THE SEPARATION IS THE POINT. `available` is
// the provider's own pause button — „I am not taking work this month" — and it
// belongs to them. `published` is „the card is fit to be seen", which is ours.
// Collapsing the two would let a completeness rule silently un-pause somebody,
// or a holiday quietly delete them from the catalogue for good.

import { prisma } from './prisma'
import { isProfileComplete, faceFrom } from './profileCompleteness'

/**
 * Recompute `published` for one provider from what their profile now holds.
 *
 * Call it after ANY write that can change the answer: the profile editor, a
 * photo upload, an avatar change, an approval. Cheap — one read, and a write
 * only when the answer actually moved.
 *
 * Returns what is now stored, or null when there is no profile to publish.
 *
 * ⚠️ IT NEVER THROWS INTO ITS CALLER'S PATH. Republishing is a consequence of
 * the save, not the save itself: a provider who has just pressed „შენახვა" must
 * not see it fail because a follow-up write lost a race. The next save — or the
 * backfill in scripts/republishProfiles.ts — settles it.
 */
export async function syncPublished(userId: string): Promise<boolean | null> {
  try {
    const p = await prisma.serviceProfile.findUnique({
      where: { userId },
      select: {
        published: true,
        photoUrl: true, about: true, services: true, areas: true, categoryId: true,
        user: { select: { avatarUrl: true } },
      },
    })
    if (!p) return null
    const next = isProfileComplete({
      hasFace: faceFrom(p.photoUrl, p.user?.avatarUrl),
      about: p.about,
      services: p.services,
      areas: p.areas,
      categoryId: p.categoryId,
    })
    if (next !== p.published) {
      await prisma.serviceProfile.update({ where: { userId }, data: { published: next } })
    }
    return next
  } catch (err) {
    console.error('[server-error]', JSON.stringify({ scope: 'profile-publish', userId, err: String(err) }))
    return null
  }
}
