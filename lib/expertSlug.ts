// Public URL slug for an expert profile: /tutors/ana-gagoshidze, not
// /tutors/cms4yyus7000bns01yu8liwai.
//
// WHY: a cuid tells a visitor nothing, looks broken when the profile is shared
// in a chat, and carries none of the expert's name into the URL — the one place
// a search engine reads a page's subject before the page even loads.
//
// SAFETY MODEL — read this before changing anything here:
//   • `slug` is NULLABLE. A profile without one is never broken, because
//     app/tutors/[id] resolves by slug OR by id.
//   • Once a slug is assigned it is PERMANENT. Renaming it would break every
//     link anyone ever shared, and search engines would have to re-learn the
//     URL. `ensureExpertSlug` therefore never overwrites an existing value —
//     not even when the expert changes their display name.
//   • Uniqueness is enforced by a UNIQUE index (lib/dbBoot.ts), and the
//     generator is written to lose the race safely: on a collision it retries
//     with the next suffix rather than trusting an earlier existence check.
import { prisma } from './prisma'
import { slugify } from './slug'

/** Reserved segments — a slug that collides with a real route would shadow it. */
const RESERVED = new Set([
  'new', 'edit', 'search', 'all', 'me', 'admin', 'api', 'apply', 'ask',
  'about', 'blog', 'help', 'contact', 'terms', 'privacy', 'cookies',
  'categories', 'konsultacia', 'signin', 'signup', 'tutors', 'student', 'tutor',
])

/**
 * Base slug from a display name. Falls back to „ekspert" when a name
 * transliterates to nothing (e.g. it was only punctuation or emoji), so the
 * caller always has something to suffix.
 */
function baseExpertSlug(fullName: string | null | undefined): string {
  const base = slugify((fullName ?? '').trim())
  // slugify() returns its own 'cat' stub for empty input — that stub is meant
  // for categories and would be a bizarre expert URL.
  if (!base || base === 'cat' || RESERVED.has(base)) return 'ekspert'
  return base
}

/**
 * Assign a slug to a profile if it doesn't have one, and return it.
 * Idempotent, and safe to call from several requests at once.
 *
 * Returns null only if every candidate collided (practically impossible — the
 * loop allows 50 suffixes) or the write failed for another reason; callers
 * treat null as „keep using the id", which still works.
 */
export async function ensureExpertSlug(profileId: string): Promise<string | null> {
  const profile = await prisma.tutorProfile.findUnique({
    where: { id: profileId },
    select: { slug: true, user: { select: { fullName: true } } },
  })
  if (!profile) return null
  if (profile.slug) return profile.slug

  const base = baseExpertSlug(profile.user?.fullName)
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`
    try {
      const updated = await prisma.tutorProfile.update({
        where: { id: profileId },
        data: { slug: candidate },
        select: { slug: true },
      })
      return updated.slug
    } catch {
      // Unique-constraint violation → this candidate was taken (possibly by a
      // concurrent request between our check and our write). Try the next.
      // Any other failure also falls through; the id URL keeps working.
      continue
    }
  }
  return null
}

