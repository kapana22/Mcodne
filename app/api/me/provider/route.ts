// THE PROVIDER'S OWN PROFILE — the professional half of `ServiceProfile`.
//
// ⚠️ IT WAS `/api/me/tutor` AND IT WROTE `TutorProfile` (2026-08-24). The
// consultation product was removed and the columns it edited moved onto the one
// provider row, so the endpoint moved with them. What went with the product,
// and is not accepted any more: `hourlyRate` (the flat consultation price),
// `serviceType`, `consultationDurationMin`, `bufferMin` — all four described a
// bookable session, and there is nothing to book. `specialty` went too: it was a
// frozen copy of the category name taken on approval day, and it contradicted
// the category itself after any rename.
//
// ⚠️ TWO ENDPOINTS WRITE THIS ROW, AND THEY DO NOT OVERLAP. This one owns who
// somebody IS — the headline, the paragraph, the sphere, the professions, the
// years, the languages, the links, the video, the switch.
// `/api/provider/service-profile` owns what they SELL — the services, the
// cities, the prices and the photos. Every field belongs to exactly one of them, which is what
// keeps a PATCH here from silently reverting a save there.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { syncPublished } from '@/lib/profilePublish'
import { getCurrentUser } from '@/lib/auth'
import { firstGeorgianMessage, georgianRefine } from '@/lib/georgianText'
import { ASSIGNABLE_CATEGORY_WHERE } from '@/lib/categoryTree'
import { ALL_PROFESSIONS, MAX_PROFESSIONS } from '@/lib/professions'
import { ROLE } from '@/lib/roles'

// Very loose URL validator — we don't want to reject unusual TLDs or protocols
// the provider legitimately wants. Empty string is treated as "clear".
const optionalUrl = z.string().max(500).refine(
  v => v === '' || /^https?:\/\/\S+\.\S+/.test(v),
  { message: 'must be a full URL starting with http:// or https://' },
).nullable().optional()

const Body = z.object({
  headline: z.string().min(2).max(200).superRefine(georgianRefine('ერთი წინადადება შენზე')).optional(),
  /** The paragraph. Stored as `about` — the column the card and the profile
   *  both print. ⚠️ THIS ENDPOINT IS ITS ONLY WRITER: the service editor sends
   *  a full replace and simply omits the field, so the two cannot fight. */
  bio: z.string().max(2000).superRefine(georgianRefine('აღწერა')).nullable().optional(),
  languages: z.array(z.string().min(2).max(10)).max(20).optional(),
  // The browse category. Validated against the live Category set in the handler
  // so an arbitrary id cannot be set.
  categoryId: z.string().min(1).max(40).nullable().optional(),
  // What they call themselves (lib/professions). Validated against the real
  // vocabulary rather than stored as free text: this is a taxonomy field, and
  // an unchecked one silently becomes a second, worse `specialty`.
  professions: z.array(z.string().max(80)).max(MAX_PROFESSIONS).optional(),
  // ⚠️ `videoUrl` WAS ACCEPTED HERE AND NOBODY EVER SENT ONE (removed
  // 2026-08-29). Measured on the live database: 0 of 29 providers had a video.
  // The column stays until a migration drops it; nothing writes it now.
  // Public visibility. When false the profile leaves the catalogue and its
  // /experts/<slug> page 404s — the same switch the service editor shows.
  available: z.boolean().optional(),
  linkedinUrl: optionalUrl,
  websiteUrl: optionalUrl,
  // Response-time promise (hours). A fixed list so the badge stays legible and
  // nobody can over-promise („1 hour").
  responseHours: z.union([z.literal(4), z.literal(12), z.literal(24), z.literal(48)]).optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ profile: null }, { status: 401 })
  // `include` the category, not just its id: since the 2026-08-10 merge a
  // provider can legitimately hold a category the PICKER no longer offers
  // („ფინანსები" was absorbed into „ბიზნესი და ფინანსები"). Without the name,
  // the profile screen renders their category as an EMPTY dropdown — which
  // reads as „my category was deleted", and the „აირჩიე კატეგორია" warning does
  // not fire to explain it, because the field is not actually empty.
  const profile = await prisma.serviceProfile.findUnique({
    where: { userId: user.id },
    // ⚠️ NEVER THE BLOBS. `photoUrl` and `workPhotos` are base64 columns; this
    // payload is read on every profile-screen load and would carry a megabyte.
    omit: { photoUrl: true, workPhotos: true },
    include: { category: { select: { id: true, slug: true, name: true, status: true } } },
  })
  return NextResponse.json({ profile })
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  if (user.role !== ROLE.PROVIDER && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // Surface OUR validation copy (e.g. the Georgian-language gate); zod's own
    // English messages stay behind the generic code.
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  const {
    headline, bio, languages, categoryId, professions,
    available, linkedinUrl, websiteUrl, responseHours,
  } = parsed.data
  if (available !== undefined) data.available = available
  if (categoryId !== undefined) {
    if (categoryId === null) {
      data.categoryId = null
    } else {
      // ASSIGNABLE, which is what the picker actually offers — and until
      // 2026-08-11 this said `status: 'VISIBLE'`, which it did not.
      //
      // THE BUG THAT FIXES. The editor renders the sub-fields absorbed into
      // each sphere inside an <optgroup> („ფინანსები" under „ბიზნესი და
      // ფინანსები"), and every one of those rows is REDIRECTED — so 7 of the 15
      // categories on screen were guaranteed 400s. And `categoryId` travels in
      // the SAME PATCH as everything else, so choosing one did not just fail to
      // save the category: it took the whole form down with a toast reading
      // „შენახვა ვერ მოხერხდა — სცადე თავიდან", which names nothing and is
      // therefore unfixable from inside the screen.
      //
      // The one they ALREADY have still always passes, and that exception is
      // still load-bearing: the form sends `categoryId` on every save, and
      // somebody whose sphere was later hidden must not lose the ability to
      // edit their own profile because of an admin action they had no part in.
      const current = await prisma.serviceProfile.findUnique({
        where: { userId: user.id },
        select: { categoryId: true },
      })
      const cat = categoryId === current?.categoryId
        ? { id: categoryId }
        : await prisma.category.findFirst({
          where: { ...ASSIGNABLE_CATEGORY_WHERE, id: categoryId },
          select: { id: true },
        })
      // Say WHICH field refused. The client shows `message` when it is Georgian
      // and otherwise falls back to the generic sentence, so without this the
      // only signal was the generic one.
      if (!cat) {
        return NextResponse.json({
          ok: false,
          error: 'BAD_CATEGORY',
          message: 'ეს კატეგორია აღარ არის ხელმისაწვდომი — აირჩიე სხვა.',
        }, { status: 400 })
      }
      data.categoryId = cat.id
    }
  }
  if (professions !== undefined) {
    // Unknown entries are DROPPED, not refused: the list can be edited between
    // the page loading and the save, and refusing the whole PATCH would lose
    // everything else they just typed. De-duplicated and capped.
    const known = new Set(ALL_PROFESSIONS.map(p => p.job))
    data.professions = [...new Set(professions.map(p => p.trim()).filter(p => known.has(p)))].slice(0, MAX_PROFESSIONS)
  }
  if (responseHours !== undefined) data.responseHours = responseHours
  if (linkedinUrl !== undefined) {
    const trimmed = (linkedinUrl ?? '').trim()
    data.linkedinUrl = trimmed === '' ? null : trimmed
  }
  if (websiteUrl !== undefined) {
    const trimmed = (websiteUrl ?? '').trim()
    data.websiteUrl = trimmed === '' ? null : trimmed
  }
  if (headline !== undefined) data.headline = headline.trim()
  if (bio !== undefined) data.about = bio === null ? null : bio.trim() || null
  if (languages !== undefined) data.languages = languages

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'NOTHING_TO_UPDATE' }, { status: 400 })
  }

  const existing = await prisma.serviceProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })
  }

  const updated = await prisma.serviceProfile.update({
    where: { userId: user.id },
    data,
    omit: { photoUrl: true, workPhotos: true },
  })
  // Second writer of the same columns as the full editor — same recompute.
  await syncPublished(user.id)
  return NextResponse.json({ ok: true, profile: updated })
}
