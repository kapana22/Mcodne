// Thin SERVER page for /tutors/[id] — the SEO/SSR shell of the profile.
//
// Responsibilities (and nothing more):
//   1. generateMetadata — per-expert title/description/OG so shared profile
//      links unfurl with the expert's real name instead of the generic site
//      title (profiles are the marketplace's main organic-growth asset).
//   2. notFound() for ids that don't exist (real 404 instead of a client
//      error screen with a 200 status).
//   3. application/ld+json Person structured data — aggregateRating only when
//      a REAL rating exists (never fabricate).
//
// The interactive profile lives in ./client.tsx ('use client') and keeps its
// own /api/tutors/[id] fetching exactly as before — this wrapper passes no
// props and does not rewire that data flow.

import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { stripAvatar } from '@/lib/stripTutorBlobs'
import { jsonLdString } from '@/lib/jsonLd'
import { socialMeta } from '@/lib/seo'
import { avatarSrc } from '@/lib/avatarSrc'
import ExpertProfilePage from './client'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

type Params = { id: string }

/**
 * The `[id]` segment accepts BOTH the public slug („ana-gagoshidze") and the
 * raw cuid. Two reasons it must accept the id forever:
 *   • roughly 35 places across the app build links as `/tutors/${id}` (booking
 *     rows, messages, admin, notifications) — they keep working untouched, and
 *     the id form 301s to the slug below, so nothing has to be rewritten;
 *   • a profile whose slug generation failed is still reachable.
 *
 * Returns null for unknown params so callers can 404. React-cached: metadata
 * and the render share the single lookup.
 */
const resolveExpert = cache(async (param: string) => {
  try {
    return await prisma.tutorProfile.findFirst({
      where: { OR: [{ id: param }, { slug: param }] },
      select: { id: true, slug: true },
    })
  } catch {
    return null
  }
})

// One DB round-trip shared by generateMetadata + the page render (React
// per-request cache). Returns 'error' (not null) on DB failure so a transient
// outage degrades to generic metadata + client render instead of a false 404.
const getTutorSeo = cache(async (id: string) => {
  try {
    const t = await prisma.tutorProfile.findUnique({
      where: { id },
      select: {
        specialty: true,
        headline: true,
        bio: true,
        rating: true,
        reviewsCount: true,
        price: true,
        category: { select: { name: true } },
        // `id` is here for absoluteAvatar — the avatar route is keyed on it.
        user: { select: { id: true, fullName: true, avatarUrl: true, suspendedAt: true } },
      },
    })
    // Admin-suspended experts (User.suspendedAt) are fully removed from the
    // public site: return null so the page 404s exactly like a missing id.
    // (findUnique can't filter on a relation field, so we check after fetch.)
    if (t?.user?.suspendedAt) return null
    return t
  } catch {
    return 'error' as const
  }
})

// Core profile fields the client needs for FIRST PAINT, loaded server-side so
// the interactive component (./client.tsx) renders the hero/identity/specs/
// about/price immediately instead of a blank skeleton while its own
// /api/tutors/[id] fetch is in flight. Deliberately scalar + relation-name
// only: NO Date / availability / review-timestamp fields, which are viewer-tz
// dependent and must stay client-computed to avoid an SSR hydration mismatch.
// Those (live slots, reviews, experience/education/certificates) hydrate from
// the client's existing fetch. Returns null on any DB error so the client
// cleanly falls back to its pure client-fetch path (skeleton + retry).
//
// CONTRACT: this seed is PARTIAL by design. ./client.tsx tracks it with its own
// `detailsState` flag and keeps every availability-/review-derived region in a
// neutral loading state until the fetch lands — so nothing here may be read as
// „the expert has no free time" or „the histogram is all zeros". If you add a
// field to the seed, keep that flag's meaning intact.
const getTutorInitial = cache(async (id: string) => {
  try {
    const [tutor, consultations, education, experience, reviews] = await Promise.all([
      prisma.tutorProfile.findUnique({
        where: { id },
        select: {
          id: true, headline: true, bio: true, specialty: true, yearsExp: true,
          rating: true, reviewsCount: true, sessionsCount: true, price: true,
          verified: true, available: true, responseHours: true, languages: true,
          // What the expert calls themselves (lib/professions) — seeded so the
          // chips are on the FIRST paint, not after the client fetch.
          professions: true,
          // MEASURED response time (lib/responseTime) — seeded so the profile
          // can print the real number on FIRST PAINT instead of waiting for
          // its own fetch. Both nullable: null = „not enough data", which the
          // UI must render as nothing (never as a fallback constant).
          responseMedianMin: true, responseSampleN: true,
          videoUrl: true, consultationDurationMin: true,
          user: { select: { id: true, fullName: true, avatarUrl: true, bio: true, suspendedAt: true } },
          category: { select: { id: true, slug: true, name: true, icon: true, status: true, parent: { select: { slug: true } } } },
        },
      }),
      prisma.consultation.findMany({
        where: { tutorId: id },
        select: { id: true, tier: true, title: true, description: true, minutes: true, price: true },
      }),
      // Education / experience / reviews are seeded server-side too.
      //
      // WHY: measured 2026-07-29 — the SSR HTML held 226–397 words while the
      // hydrated page held 416–752. On one profile 70% of the text existed only
      // after JavaScript ran. Google does render JS, but on a delayed second
      // pass, so the richest part of a profile — the very page type this
      // marketplace most needs to rank — was the least reliably indexed. These
      // are small text tables and they join the SAME parallel fan-out, so the
      // cost is bounded by the slowest query, not the sum.
      //
      // CERTIFICATES ARE DELIBERATELY NOT SEEDED: their `url` is frequently a
      // base64 data: blob, and inlining those into this page's HTML is exactly
      // the failure that once made profiles multi-megabyte. The client fetch
      // still loads them.
      prisma.education.findMany({
        where: { tutorId: id },
        orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.experience.findMany({
        where: { tutorId: id },
        orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.review.findMany({
        where: { tutorId: id },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { student: { select: { id: true, fullName: true } } },
      }),
    ])
    if (!tutor) return null
    // Admin-suspended experts are hidden site-wide — drop the first-paint seed
    // (the route also 404s via getTutorSeo, and stripAvatar drops suspendedAt
    // from what ships to the client).
    if (tutor.user?.suspendedAt) return null
    // Shape matches /api/tutors/[id] for the seeded fields; the arrays the seed
    // omits are read as `?? []` in the client, so their absence is safe.
    // Apply the SAME blob guards the /api/tutors/[id] route uses — otherwise a
    // legacy `data:` base64 video or an oversized base64 avatar would be inlined
    // raw into this high-traffic page's SSR HTML (blocking first byte).
    const safe = {
      ...tutor,
      videoUrl: typeof tutor.videoUrl === 'string' && tutor.videoUrl.startsWith('data:') ? null : tutor.videoUrl,
      user: stripAvatar(tutor.user),
    }
    // Mirror /api/tutors/[id]'s privacy rule: an anonymous review must never
    // ship the reviewer's identity. Avatars are omitted entirely here (they can
    // be multi-MB base64) — the client fetch fills them in.
    const safeReviews = reviews.map(r => ({
      ...r,
      student: r.anonymous ? null : (r.student ? { ...r.student, avatarUrl: null } : null),
    }))
    return { ...safe, consultations, education, experience, reviews: safeReviews }
  } catch {
    return null
  }
})

// Bio excerpt for meta description — first ~155 chars, cut at a word edge.
function excerpt(text: string | null | undefined, max = 155): string | null {
  const t = text?.replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 100))}…`
}

// OG/JSON-LD images must be absolute URLs — data-URI initials placeholders and
// relative upload paths are skipped rather than mangled.
/**
 * The expert's photo as a URL a CRAWLER can fetch — for og:image and for the
 * Person JSON-LD, which both read this one function.
 *
 * ⚠️ IT USED TO GIVE UP ON 19 OF 24 EXPERTS. Avatars live in Postgres as
 * `data:` URIs, this returned null for them, and socialMeta fell back to the
 * generic /og.png — so almost every profile shared, and appeared in search, as
 * the same house image with no face on it. The old comment described that as a
 * limitation; it stopped being one when /api/avatars/[id] shipped.
 *
 * `avatarSrc` turns the stored blob into that route's URL, carrying the `?v=`
 * fingerprint so the link changes the moment the photo does. Made absolute
 * because og:image and schema.org both require it.
 *
 * ⚠️ /api/avatars/ MUST STAY ALLOWED IN app/robots.ts. Everything under /api is
 * Disallowed; that one prefix is explicitly re-allowed, and without it these
 * tags would point at a URL the crawler is forbidden to open.
 *
 * An expert who signed in with Google already has a hosted URL — passed through
 * untouched, since a redirect through our route would only add a hop.
 */
function absoluteAvatar(userId: string | null | undefined, url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//.test(url)) return url
  const src = avatarSrc(userId, url)
  // `&s=512` — the full stored resolution. The route defaults to 384, which is
  // sized for a ≤128px card; a search thumbnail wants every pixel we actually
  // have. See SERVE_SIZES in app/api/avatars/[id]/route.ts.
  return src && src.startsWith('/') ? `${SITE_URL}${src}${src.includes('?') ? '&' : '?'}s=512` : null
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id: param } = await params
  const resolved = await resolveExpert(param)
  const id = resolved?.id ?? param
  // Canonical is ALWAYS the slug URL when one exists — otherwise an id-form
  // link that someone shared would self-canonicalise and compete with the slug
  // URL for the same profile.
  const canonical = `${SITE_URL}/tutors/${resolved?.slug || id}`
  const tutor = await getTutorSeo(id)

  if (tutor && tutor !== 'error') {
    const name = tutor.user?.fullName?.trim() || 'ექსპერტი'
    const specialty = tutor.specialty?.trim() || tutor.category?.name?.trim()
    const title = specialty ? `${name} — ${specialty} | მცოდნე` : `${name} | მცოდნე`
    const description =
      excerpt(tutor.bio) ||
      tutor.headline?.trim() ||
      `დაჯავშნე კონსულტაცია ${name}-სთან მცოდნეზე.`
    // The expert's own face, served through /api/avatars — see absoluteAvatar.
    // socialMeta still falls back to /og.png when there is no photo at all, so
    // a shared link can never unfurl as a blank card.
    const image = absoluteAvatar(tutor.user?.id, tutor.user?.avatarUrl)
    return {
      title,
      description,
      alternates: { canonical },
      ...socialMeta({ title, description, url: canonical, image, type: 'article' }),
    }
  }

  return {
    title: 'ექსპერტი — მცოდნე',
    description: 'დაჯავშნე კონსულტაცია მცოდნის ექსპერტთან.',
    alternates: { canonical },
    ...socialMeta({
      title: 'ექსპერტი — მცოდნე',
      description: 'დაჯავშნე კონსულტაცია მცოდნის ექსპერტთან.',
      url: canonical,
    }),
  }
}

export default async function TutorProfileRoute(
  { params, searchParams }: {
    params: Promise<Params>
    searchParams: Promise<Record<string, string | string[] | undefined>>
  },
) {
  const { id: param } = await params
  const resolved = await resolveExpert(param)
  // Reached by cuid while a slug exists → send the crawler (and the human) to
  // the one canonical address. permanentRedirect = 308, which browsers and
  // Google treat as a permanent move exactly like a 301, and unlike 302 it
  // transfers ranking signals to the slug URL.
  //
  // THE QUERY STRING MUST SURVIVE. Every deep-link into a profile carries its
  // intent there — `?intent=message` opens the message sheet, `?rebook=1`
  // reopens booking, `?preview=1` is the owner's own preview. Redirecting to a
  // bare path silently dropped all of them: an old link someone had shared
  // still landed on the right expert, but did nothing it promised.
  if (resolved?.slug && param !== resolved.slug) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(await searchParams)) {
      if (Array.isArray(v)) v.forEach(x => sp.append(k, x))
      else if (v !== undefined) sp.set(k, v)
    }
    const qs = sp.toString()
    permanentRedirect(`/tutors/${resolved.slug}${qs ? `?${qs}` : ''}`)
  }
  const id = resolved?.id ?? param
  // SEO row (unchanged) for notFound + JSON-LD, plus the fuller first-paint
  // seed for the client. Both are React-cached; the seed adds one findUnique +
  // one consultation read, run in parallel.
  const [tutor, initialTutor, viewer] = await Promise.all([getTutorSeo(id), getTutorInitial(id), getCurrentUser()])
  const initialUser = viewer
    ? { id: viewer.id, fullName: viewer.fullName, avatarUrl: viewer.avatarUrl, role: viewer.role }
    : null

  // Missing id → real 404. DB error ('error') falls through: the client
  // component has its own error/retry state for that case.
  if (tutor === null) notFound()

  let jsonLd: Record<string, unknown> | null = null
  let breadcrumbLd: Record<string, unknown> | null = null
  if (tutor && tutor !== 'error') {
    const name = tutor.user?.fullName?.trim() || 'ექსპერტი'
    const jobTitle = tutor.specialty?.trim() || tutor.category?.name?.trim()
    const description = excerpt(tutor.bio)
    const image = absoluteAvatar(tutor.user?.id, tutor.user?.avatarUrl)
    const hasRealRating = (tutor.rating ?? 0) > 0 && (tutor.reviewsCount ?? 0) > 0
    const price = typeof tutor.price === 'number' && tutor.price > 0 ? tutor.price : null
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name,
      url: `${SITE_URL}/tutors/${resolved?.slug || id}`,
      ...(jobTitle ? { jobTitle } : {}),
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
      // Real price → an Offer, so Google can surface it. Never fabricated.
      ...(price
        ? { makesOffer: { '@type': 'Offer', priceCurrency: 'GEL', price, category: 'კონსულტაცია', availability: 'https://schema.org/InStock' } }
        : {}),
      // Only when a real rating exists — never fabricated.
      ...(hasRealRating
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(tutor.rating.toFixed(2)),
              reviewCount: tutor.reviewsCount,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
    }
    breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'ექსპერტები', item: `${SITE_URL}/tutors` },
        { '@type': 'ListItem', position: 3, name },
      ],
    }
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
        />
      )}
      {breadcrumbLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }}
        />
      )}
      <ExpertProfilePage initialTutor={initialTutor} initialUser={initialUser} />
    </>
  )
}
