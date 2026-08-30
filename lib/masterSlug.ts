// Public URL slug for a provider's service profile: /experts/giorgi-maisuradze,
// not /experts/cms4yyus7000bns01yu8liwai.
//
// The expert side's lib/expertSlug.ts, applied to `ServiceProfile`. Same
// transliteration (lib/slug — tuned for NAMES, see its header), same de-dupe by
// numeric suffix, same safety model:
//   • `slug` is NULLABLE. A profile without one is never broken — app/experts/
//     [slug] resolves by slug OR by id.
//   • Once assigned it is PERMANENT; `ensureMasterSlug` never overwrites.
//   • Uniqueness is the UNIQUE index (prisma/schema, lib/dbBoot), and the loop
//     is written to lose a race safely: a collision retries with the next
//     suffix instead of trusting an earlier existence check.
//
// ⚠️ IT NO LONGER HAS ITS OWN NAMESPACE (stage 11, 2026-08-19). Until today
// uniqueness was checked against `ServiceProfile.slug` ONLY, and the header
// here argued for it: the two profiles lived under different prefixes
// (/experts, /services), so „ana-gagoshidze" could exist on both sides and both
// were right — one person may be an expert AND a provider, and each URL named
// one profile. THE SECOND PREFIX IS GONE. Both profiles answer under
// /experts/<slug> (CLAUDE.md → THE PRODUCT MODEL: one provider), so a slug is
// now an identity and a duplicate would hand one URL to two people. The
// question is asked once, in lib/slugSpace → slugTaken, across BOTH tables —
// the same call lib/expertSlug makes.
import { prisma } from './prisma'
import { slugify } from './slug'
import { slugReserved, slugTaken } from './slugSpace'

/**
 * Base slug from a display name. Falls back to „ekspert" when a name
 * transliterates to nothing, so the caller always has something to suffix.
 *
 * ⚠️ THE SAME FALLBACK THE EXPERT SIDE USES, and deliberately: „ხელოსანი" is a
 * retired word (CLAUDE.md → THE PRODUCT MODEL) and „ექსპერტი" is who sells,
 * whichever half of the catalogue they are in. Two providers who both fall back
 * are no longer a collision waiting to happen either — the shared `slugTaken`
 * below suffixes the second one across BOTH tables.
 */
function baseMasterSlug(name: string | null | undefined): string {
  const base = slugify((name ?? '').trim())
  // slugify() returns its own 'cat' stub for empty input — that stub is meant
  // for categories and would be a bizarre provider URL.
  if (!base || base === 'cat' || slugReserved(base)) return 'ekspert'
  return base
}

/**
 * Assign a slug to a ServiceProfile if it doesn't have one, and return it.
 * Idempotent, and safe to call from several requests at once.
 *
 * The name is the person's (`user.fullName`) or, for a firm, the company's
 * (`company.name`) — the same precedence app/experts/_providers prints.
 *
 * Returns null only if every candidate collided (practically impossible — the
 * loop allows 50 suffixes) or the write failed for another reason; callers
 * treat null as „keep using the id", which still works.
 */
export async function ensureMasterSlug(serviceProfileId: string): Promise<string | null> {
  const profile = await prisma.serviceProfile.findUnique({
    where: { id: serviceProfileId },
    select: {
      slug: true,
      user: { select: { fullName: true } },
      company: { select: { name: true } },
    },
  })
  if (!profile) return null
  if (profile.slug) return profile.slug

  const base = baseMasterSlug(profile.company?.name ?? profile.user?.fullName)
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`
    // BOTH tables and the reserved list (lib/slugSpace) — see the header.
    if (await slugTaken(candidate)) continue
    try {
      const updated = await prisma.serviceProfile.update({
        where: { id: serviceProfileId },
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
