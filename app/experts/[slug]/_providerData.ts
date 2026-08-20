// /experts/[slug] — the PROVIDER profile's model (was app/services/[slug]/_data
// until stage 11, 2026-08-19, when the second namespace was collapsed into
// this one). THE LEAF: no sibling import, no JSX (CLAUDE.md → „the model is a
// leaf"). It holds the resolver, the one profile query, and the addresses the
// parts print.
//
// ⚠️ ONE PROFILE SPACE. A provider's service profile answers at
// /experts/<slug>, exactly where an expert's does — CLAUDE.md → THE PRODUCT
// MODEL, one provider, and a consultation is one KIND of service. Two profile
// spaces said the opposite. `lib/slugSpace → slugTaken` is what makes it safe:
// a slug is unique across BOTH tables now, so one address names one person.
//
// ⚠️ THE VISIBILITY RULE IS THE CATALOGUE'S, PLUS `published`. A profile is
// public when the provider's own `available` switch is on, `published` is on, and
// an active RequestAccess row names their user or their company — the same rule
// app/experts/_masterData queries and /api/masters/[id]/photo answers for. It must
// stay one rule: a page reachable for a master the photo route refuses would
// draw a broken portrait; a page for somebody the catalogue hides would publish
// a profile nobody approved. Anything outside the rule is notFound(), and so is
// an unknown slug — a 404, never a blank page.
//
// ⚠️ THE IMAGES ARE NEVER SELECTED. `photoUrl` is a base64 data URI and
// `workPhotos` is up to six of them (~1MB together) — see prisma/schema. This
// file asks the database WHICH ones are servable and the parts point every
// <img> at /api/masters/[id]/photo (`?n=<index>` for the work photos), which
// serves one image with a long cache busted by `?v=<updatedAt>`.

import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { serviceLabels, areaLabels, priceHint, sanitizeStored, countCovering } from '@/lib/serviceProfile'

/**
 * THE DOOR, WRITTEN ONCE — the same address app/experts/_masterData states,
 * and for the same reason: `for=service` opens the
 * wizard on the trades side instead of a picker of school subjects. The wizard
 * reads no topic parameter (app/request/page.tsx), so nothing more is carried.
 */
export const REQUEST_HREF = '/request?for=service'

/**
 * THE SAME DOOR, CARRYING THE PERSON — `?to=<slug>` (2026-08-19).
 *
 * ⚠️ THIS PROFILE USED TO SEND ITS VISITOR INTO THE VOID, and the comment in
 * ./_cta said so plainly: „nothing about this profile is carried — the wizard
 * reads no such parameter". It does now. A visitor standing on somebody's page
 * had to describe a job to nobody in particular and hope that person happened
 * to bid; the client's two verbs are „დაჯავშნე" and „აღწერე", and „აღწერე"
 * could not be aimed at anybody.
 *
 * Built here rather than at the CTA for the reason `REQUEST_HREF` is: the
 * address of the intake is this model's to state, so `for=service` and the
 * recipient stay in one place and cannot drift apart.
 *
 * The wizard resolves the slug server-side against the same visibility rule
 * this file uses (lib/requestTarget) and IGNORES anything that does not
 * resolve — so a stale link is a plain intake form, never a 404.
 */
export const requestHrefFor = (p: { slug: string | null; id: string }) =>
  `${REQUEST_HREF}&to=${encodeURIComponent(p.slug || p.id)}`

/** The visibility rule — see the header. */
const VISIBLE = {
  available: true,
  published: true,
  OR: [
    { user: { requestAccess: { active: true } } },
    { company: { requestAccess: { active: true } } },
  ],
}

/**
 * The `[slug]` segment accepts the public slug („giorgi-maisuradze") AND the
 * raw cuid: a profile whose slug generation failed is still reachable, and an
 * id link somebody shared before slugs existed still lands. Returns null for
 * unknown params AND for profiles outside the visibility rule, so the page can
 * 404 both the same way. React-cached: metadata and the render share it.
 *
 * ⚠️ IT IS THE FOURTH LINK IN THE CHAIN, never the first. The page resolves a
 * profession landing, then a trade landing, then an expert, and only then this
 * — see app/experts/[slug]/page.tsx for why the code-owned lists win.
 */
export const resolveMaster = cache(async (param: string) => {
  try {
    return await prisma.serviceProfile.findFirst({
      where: { AND: [{ OR: [{ slug: param }, { id: param }] }, VISIBLE] },
      select: { id: true, slug: true },
    })
  } catch {
    return null
  }
})

/** One profile, in the words the parts print. Labels are resolved here so the
 *  parts never see a topic id. */
export type MasterProfile = {
  id: string
  slug: string | null
  name: string
  isCompany: boolean
  /** Trade labels, in the catalogue's order. */
  services: string[]
  /** City labels, in the catalogue's order. */
  areas: string[]
  /** „გამოძახება 30₾ · სამუშაო 50₾-დან", or null when they quote per job. */
  price: string | null
  about: string | null
  /** The photo ROUTE, never the image. Null = no servable photo. */
  photoSrc: string | null
  /** The work-photo ROUTES, one per servable index (SVG entries are skipped
   *  here exactly as the route refuses them). Empty = nothing to draw. */
  workPhotoSrcs: string[]
  /** The same person's expert profile, when they have one with a slug. */
  expertHref: string | null
  /** Reviews of this master's finished jobs (Review → RequestOffer whose
   *  provider is this profile's user or company), newest first. */
  reviews: MasterReview[]
  /** Average ★ over `reviews`, one decimal, null when there are none. */
  ratingAvg: number | null
  reviewCount: number
}

export type MasterReview = {
  id: string
  rating: number
  body: string
  /** ISO — formatted by the part, in Tbilisi time (lib/tz). */
  at: string
}

/**
 * The profile, or null when the id is not visible (the resolver already
 * answered that, but the two are separate reads and the rule is applied to
 * both). Cached per request: metadata and the render share one round trip.
 */
export const getMasterProfile = cache(async (id: string): Promise<MasterProfile | null> => {
  try {
    const row = await prisma.serviceProfile.findFirst({
      where: { id, ...VISIBLE },
      select: {
        id: true, slug: true, services: true, areas: true, calloutFee: true, priceFrom: true,
        about: true, updatedAt: true,
        // The provider identity the reviews join on — never rendered.
        userId: true, companyId: true,
        user: { select: { fullName: true, tutor: { select: { slug: true } } } },
        company: { select: { name: true } },
      },
    })
    if (!row) return null

    // ── The reviews (stage 7) ──────────────────────────────────────────────
    // Through the OFFER, not a tutorId: a trades review has no TutorProfile
    // behind it (Review.tutorId is null; Review.offerId is the key). The
    // provider match is the same either/or the offer row itself carries.
    // Rating, sentence, date — nothing about the reviewer, and no blob column
    // anywhere near this query.
    const providerWhere = row.companyId
      ? { companyId: row.companyId }
      : row.userId
        ? { expertUserId: row.userId }
        : null
    const reviewRows = providerWhere
      ? await prisma.review.findMany({
          where: { offer: providerWhere },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, rating: true, body: true, createdAt: true },
        })
      : []
    const reviews: MasterReview[] = reviewRows.map(r => ({
      id: r.id, rating: r.rating, body: r.body, at: r.createdAt.toISOString(),
    }))
    const reviewCount = reviews.length
    const ratingAvg = reviewCount
      ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviewCount) * 10) / 10
      : null

    // Which images the photo route will actually hand back — asked as SQL over
    // the ONE row, returning booleans and small integers, never the columns.
    // `WITH ORDINALITY` numbers the array 1-based; the route's `?n=` is 0-based.
    // The refusal is the route's own (SVG is a document, not an image).
    const probe = await prisma.$queryRawUnsafe<{ hasPhoto: boolean; idx: number[] | null }[]>(
      `SELECT ("photoUrl" IS NOT NULL AND "photoUrl" LIKE 'data:image/%' AND "photoUrl" NOT LIKE 'data:image/svg%') AS "hasPhoto",
              (SELECT array_agg((i - 1)::int ORDER BY i)
                 FROM unnest("workPhotos") WITH ORDINALITY AS t(p, i)
                WHERE p LIKE 'data:image/%' AND p NOT LIKE 'data:image/svg%') AS "idx"
         FROM "ServiceProfile" WHERE "id" = $1`,
      row.id,
    )
    const hasPhoto = probe[0]?.hasPhoto === true
    const idx = probe[0]?.idx ?? []
    const v = row.updatedAt.getTime()
    const clean = sanitizeStored(row)
    const expertSlug = row.user?.tutor?.slug ?? null

    return {
      id: row.id,
      slug: row.slug,
      name: row.company?.name ?? row.user?.fullName ?? '—',
      isCompany: row.company !== null,
      services: serviceLabels(clean.services),
      areas: areaLabels(clean.areas),
      price: priceHint(row),
      about: row.about?.trim() || null,
      photoSrc: hasPhoto ? `/api/masters/${row.id}/photo?v=${v}` : null,
      workPhotoSrcs: idx.map(n => `/api/masters/${row.id}/photo?n=${n}&v=${v}`),
      expertHref: expertSlug ? `/experts/${expertSlug}` : null,
      reviews,
      ratingAvg,
      reviewCount,
    }
  } catch {
    return null
  }
})

/**
 * How many PUBLIC providers cover any of these topics — the number the ≥3 rule
 * (lib/serviceProfile → TRADE_LANDING_MIN) reads for /experts/<trade>. Same
 * VISIBLE rule as the profile and the catalogue; `services` only, no photo, no
 * text — two small arrays per row. Cached per request: metadata and the render
 * share it. A DB failure counts as nobody, which renders the door — the honest
 * answer when we cannot say who is here.
 */
export const countMastersCovering = cache(async (topicIds: string[]): Promise<number> => {
  try {
    const rows = await prisma.serviceProfile.findMany({ where: VISIBLE, select: { services: true } })
    return countCovering(rows, topicIds)
  } catch {
    return 0
  }
})

/** The public address of a profile — slug when it has one, id otherwise.
 *  ONE namespace since stage 11: /experts, the same prefix the expert profile
 *  and both landings answer under. */
export const masterPath = (p: { slug: string | null; id: string }) => `/experts/${p.slug || p.id}`
