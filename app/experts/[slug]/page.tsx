// THE ONE NAMESPACE — /experts/[slug]. Four different pages answer here, and
// this file is the resolver that decides which (stage 11, 2026-08-19).
//
// ⚠️ THE PRECEDENCE, IN ORDER, AND IT IS NOT ARBITRARY:
//
//   1. PROFESSION LANDING   /experts/<profession>  lib/professionSeo → part ./_profession
//   2. TRADE LANDING        /experts/<trade>       lib/serviceProfile → resolveTrade, part ./_tradeLanding
//   3. EXPERT PROFILE       /experts/<slug|id>     TutorProfile      → part ./client
//   4. PROVIDER PROFILE     /experts/<slug|id>     ServiceProfile    → parts ./_provider*
//   5. notFound()
//
// THE TWO CODE-OWNED LISTS COME FIRST because they are FIXED lists in source
// (fifteen profession slugs, forty-seven trade ids) while both profile slugs
// are GENERATED from people's names — and both generators RESERVE every id in
// both lists (lib/slugSpace → RESERVED_SLUGS), so no profile can ever be minted
// onto one. The reverse order would let a database row shadow a page that
// exists in code and that nobody could then reach. Landing 1 before landing 2
// is arbitrary only because it can be: the two vocabularies do not overlap
// (asserted in tests/oneNamespace.test.ts).
//
// THE TWO PROFILES ARE ORDERED BY NOTHING BUT HISTORY, and that is safe for a
// reason that did not exist until today: since stage 11 a slug is unique across
// BOTH tables (lib/slugSpace → slugTaken), so at most one of them can answer.
// Before it, TutorProfile answered under /experts and ServiceProfile under
// /services — two prefixes, two namespaces, „ana-gagoshidze" legitimately on
// both sides. Two profile spaces contradict CLAUDE.md → THE PRODUCT MODEL („one
// provider; a consultation is one KIND of service"), so the second prefix was
// collapsed into this one: /services/<anything> now 308s here (middleware.ts).
// Measured before the merge: 26 expert slugs, 7 provider slugs, 0 collisions —
// nothing had to be renamed, and nothing here ever renames a slug.
//
// Responsibilities of this file (and nothing more):
//   1. the precedence above;
//   2. generateMetadata — per-page title/description/OG so a shared link
//      unfurls with the real name instead of the generic site title (profiles
//      are the marketplace's main organic-growth asset);
//   3. notFound() for params that resolve to nothing (a real 404 instead of a
//      client error screen with a 200 status);
//   4. application/ld+json — Person / LocalBusiness + BreadcrumbList;
//      aggregateRating only when a REAL rating exists (never fabricate).
//
// The interactive EXPERT profile lives in ./client.tsx ('use client') and keeps
// its own /api/experts/[slug] fetching exactly as before — this wrapper passes
// no props and does not rewire that data flow. The PROVIDER profile is server
// -rendered from ./_providerData and drawn by ./_providerHero / _providerBlocks
// / _providerCta; it has no client half because it has nothing interactive.
//
// Pinned by tests/oneNamespace.test.ts, tests/taxonomy.test.ts,
// tests/expertsRoute.test.ts and tests/masterProfile.test.ts.
//
// MUST be force-dynamic: the provider branch and the trade count read Postgres,
// which is unreachable at `next build`.
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { stripAvatar } from '@/lib/stripTutorBlobs'
import { jsonLdString } from '@/lib/jsonLd'
import { socialMeta } from '@/lib/seo'
import { avatarSrc } from '@/lib/avatarSrc'
import { professionBySlug } from '@/lib/professionSeo'
import { requestsOn } from '@/lib/requests'
import { resolveTrade, tradeTopicIds, TRADE_LANDING_MIN } from '@/lib/serviceProfile'
import { queryMasters } from '@/app/experts/_masterData'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { Container } from '@/components/Container'
import ExpertProfilePage from './client'
import { ProfessionLanding, professionMetadata } from './_profession'
import { resolveMaster, getMasterProfile, masterPath, countMastersCovering } from './_providerData'
import { ProviderBreadcrumb, ProviderHero } from './_providerHero'
import { PricedServicesBlock, AboutBlock, WorkBlock, ReviewsBlock } from './_providerBlocks'
import { ProviderCta } from './_providerCta'
import { TradeLanding, tradeLabel } from './_tradeLanding'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

type Params = { slug: string }

/**
 * The `[slug]` segment accepts BOTH the public slug („ana-gagoshidze") and the
 * raw cuid. Two reasons it must accept the id forever:
 *   • roughly 35 places across the app build links as `/experts/${id}` (booking
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
// /api/experts/[slug] fetch is in flight. Deliberately scalar + relation-name
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
          user: {
            select: {
              id: true, fullName: true, avatarUrl: true, bio: true, suspendedAt: true,
              // A dual provider (expert AND ხელოსანი) gets one plain link to the
              // other profile. slug + published ONLY — ServiceProfile's photo
              // columns are base64 and must never ride along (see the model).
              serviceProfile: { select: { slug: true, published: true } },
            },
          },
          category: { select: { id: true, slug: true, name: true, icon: true, status: true, parent: { select: { slug: true } } } },
        },
      }),
      prisma.consultation.findMany({
        where: { tutorId: id },
        // `bookable` decides which of the two lists a row lands in on the
        // profile — without it every service renders as a bookable hour. See
        // Consultation.bookable.
        select: { id: true, tier: true, title: true, description: true, minutes: true, price: true, bookable: true },
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
    // Shape matches /api/experts/[slug] for the seeded fields; the arrays the seed
    // omits are read as `?? []` in the client, so their absence is safe.
    // Apply the SAME blob guards the /api/experts/[slug] route uses — otherwise a
    // legacy `data:` base64 video or an oversized base64 avatar would be inlined
    // raw into this high-traffic page's SSR HTML (blocking first byte).
    // The master cross-link is lifted OUT of the seed: the seed's shape mirrors
    // /api/tutors/[id] (which knows nothing of ServiceProfile), and the client
    // replaces the seed with that payload once its own fetch lands — a field
    // living only in the seed would vanish on hydration.
    const { serviceProfile, ...seedUser } = tutor.user
    const masterHref = serviceProfile?.published && serviceProfile.slug ? `/experts/${serviceProfile.slug}` : null
    const safe = {
      ...tutor,
      videoUrl: typeof tutor.videoUrl === 'string' && tutor.videoUrl.startsWith('data:') ? null : tutor.videoUrl,
      user: stripAvatar(seedUser),
    }
    // Mirror /api/experts/[slug]'s privacy rule: an anonymous review must never
    // ship the reviewer's identity. Avatars are omitted entirely here (they can
    // be multi-MB base64) — the client fetch fills them in.
    const safeReviews = reviews.map(r => ({
      ...r,
      student: r.anonymous ? null : (r.student ? { ...r.student, avatarUrl: null } : null),
    }))
    return { seed: { ...safe, consultations, education, experience, reviews: safeReviews }, masterHref }
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
  const { slug: param } = await params
  // ── 1. the profession landing — see the header ──────────────────────────
  const prof = professionBySlug[param]
  if (prof) return professionMetadata(prof)
  // ── 2. the trade landing ────────────────────────────────────────────────
  // Canonical is the trade's own address whether it is a landing or the door;
  // the sitemap decides what to submit.
  const trade = resolveTrade(param)
  if (trade) {
    const label = tradeLabel(trade)
    const canonical = `${SITE_URL}/experts/${param}`
    const title = `${label} — სერვისები | მცოდნე`
    const description = `${label}: სერვისები მცოდნეზე. აღწერე, რა გჭირდება, და მიიღე შეთავაზებები.`
    return { title, description, alternates: { canonical }, ...socialMeta({ title, description, url: canonical }) }
  }
  // ── 3. the expert profile ───────────────────────────────────────────────
  const resolved = await resolveExpert(param)
  const id = resolved?.id ?? param
  // Canonical is ALWAYS the slug URL when one exists — otherwise an id-form
  // link that someone shared would self-canonicalise and compete with the slug
  // URL for the same profile.
  const canonical = `${SITE_URL}/experts/${resolved?.slug || id}`
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

  // ── 4. the provider profile ─────────────────────────────────────────────
  // Only when the expert table answered NOTHING (not when it answered with a
  // DB error, which must degrade to generic metadata rather than change which
  // page this URL is). A slug is unique across both tables since stage 11, so
  // at most one of the two can be here.
  if (!resolved) {
    const provider = await resolveMaster(param)
    const pp = provider ? await getMasterProfile(provider.id) : null
    if (pp) {
      // Canonical is ALWAYS the slug URL when one exists — otherwise an
      // id-form link would self-canonicalise and compete with it.
      const providerCanonical = `${SITE_URL}${masterPath(pp)}`
      const title = `${pp.name} — სერვისი | მცოდნე`
      const description =
        excerpt(pp.about) || [pp.services.join(', '), pp.areas.join(', ')].filter(Boolean).join(' · ') || title
      // The face through the photo route — allowed in app/robots.ts. socialMeta
      // falls back to /og.png when there is none.
      const image = pp.photoSrc ? `${SITE_URL}${pp.photoSrc}` : null
      return {
        title,
        description,
        alternates: { canonical: providerCanonical },
        ...socialMeta({ title, description, url: providerCanonical, image, type: 'article' }),
      }
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
  const { slug: param } = await params

  // ── 1. THE PROFESSION LANDING — see the header. A fixed list, no DB. ─────
  const prof = professionBySlug[param]
  if (prof) return <ProfessionLanding p={prof} />

  // ── 2. THE TRADE LANDING — the second fixed list, still no profile DB read.
  // ≥ TRADE_LANDING_MIN → the catalogue filtered to this trade; below it → the
  // door only, and NO list query at all (the door draws none).
  const trade = resolveTrade(param)
  if (trade) {
    const topicIds = tradeTopicIds(trade)
    const [count, user] = await Promise.all([countMastersCovering(topicIds), getCurrentUser()])
    const result = count >= TRADE_LANDING_MIN
      ? await queryMasters(trade.topic ? { groups: [], topics: [trade.topic.id], cities: [] } : { groups: [trade.group.id], topics: [], cities: [] })
      : null
    const initialUser = user
      ? { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl, role: user.role }
      : null
    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        // The same two steps the visible trail draws (./_tradeLanding).
        { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'ექსპერტები', item: `${SITE_URL}/experts` },
        { '@type': 'ListItem', position: 3, name: tradeLabel(trade) },
      ],
    }
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
        <PublicTopBar initialUser={initialUser} />
        <TradeLanding trade={trade} result={result} requestsEnabled={requestsOn()} />
        <Footer />
      </>
    )
  }

  // ── 3. THE EXPERT PROFILE ───────────────────────────────────────────────
  const resolved = await resolveExpert(param)

  // ── 4. THE PROVIDER PROFILE — only when the expert table answered nothing.
  // A slug is unique across BOTH tables since stage 11 (lib/slugSpace), so at
  // most one of the two profiles can claim this address and the order between
  // them decides nothing. Anything the provider rule hides — unpublished,
  // paused, not admitted — falls through to the 404 below, exactly as it did
  // under the old prefix.
  if (!resolved) {
    const provider = await resolveMaster(param)
    if (provider) {
      // The same id→slug 308 the expert branch does, and it carries the query
      // string too (it used to drop it under the old prefix).
      if (provider.slug && param !== provider.slug) {
        permanentRedirect(`${masterPath(provider)}${queryOf(await searchParams)}`)
      }
      return providerProfile(provider)
    }
  }

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
    permanentRedirect(`/experts/${resolved.slug}${queryOf(await searchParams)}`)
  }
  const id = resolved?.id ?? param
  // SEO row (unchanged) for notFound + JSON-LD, plus the fuller first-paint
  // seed for the client. Both are React-cached; the seed adds one findUnique +
  // one consultation read, run in parallel.
  const [tutor, initial, viewer] = await Promise.all([getTutorSeo(id), getTutorInitial(id), getCurrentUser()])
  const initialTutor = initial?.seed ?? null
  // „ხელოსნის პროფილი" — only when the same person also has a published
  // ServiceProfile with a public address. ONE namespace since stage 11: it is
  // /experts/<slug> too, resolved by this very file's step 4.
  const masterHref = initial?.masterHref ?? null
  const initialUser = viewer
    ? { id: viewer.id, fullName: viewer.fullName, avatarUrl: viewer.avatarUrl, role: viewer.role }
    : null

  // ⚠️ THE SECOND VERB, AND IT IS THE SECONDARY ONE (2026-08-19). „დაჯავშნე"
  // stays this page's primary action — an expert with published time is booked,
  // not negotiated with. What was missing is „აღწერე": describing a piece of
  // work TO THIS PERSON, which until today could only be done by posting a
  // request into the void and then inviting them from the room.
  //
  // ⚠️ GATED HERE AND ONLY HERE. `requestsOn()` is read ONCE, in the page, and
  // handed to the rail — the same shape the provider profile below and the
  // catalogue use.
  // The profile itself must survive FEATURE_REQUESTS being off: it is an
  // indexable page, and a URL that 404s teaches the crawler to distrust the
  // file. No flag, no href, no second button — nothing else changes.
  //
  // The slug and not the id: the wizard resolves it against the catalogue's own
  // visibility rule and ignores anything that does not resolve.
  const requestHref = requestsOn() ? `/request?to=${encodeURIComponent(resolved?.slug || id)}` : null

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
      url: `${SITE_URL}/experts/${resolved?.slug || id}`,
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
        { '@type': 'ListItem', position: 2, name: 'ექსპერტები', item: `${SITE_URL}/experts` },
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
      <ExpertProfilePage initialTutor={initialTutor} initialUser={initialUser} masterHref={masterHref} requestHref={requestHref} />
    </>
  )
}

/**
 * The query string, rebuilt from Next's parsed searchParams — used by BOTH
 * id→slug 308s on this route. Every deep-link into a profile carries its
 * intent there (?intent=message, ?rebook=1, ?preview=1, ?utm_*), and a
 * redirect to a bare path silently drops all of it.
 */
function queryOf(sp: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach(x => out.append(k, x))
    else if (v !== undefined) out.set(k, v)
  }
  const qs = out.toString()
  return qs ? `?${qs}` : ''
}

/**
 * STEP 4 OF THE PRECEDENCE — the provider's public profile, moved here from
 * app/services/[slug]/page.tsx in stage 11 (2026-08-19) with every behaviour
 * intact: the Profile archetype (breadcrumb, hero, blocks, reviews, CTA), the
 * two-column shape the expert profile uses, the photo ROUTE and never the
 * base64 column, and the intake CTA mounted only when `requestsOn()`.
 *
 * ⚠️ SLUG OR ID, AND THE ID REDIRECTS — in the CALLER, before this runs
 * (`_providerData → resolveMaster` accepts both forms; reached by cuid while a
 * slug exists it 308s to the slug, so one profile has one address).
 *
 * Unknown, unpublished, paused, or not admitted never reaches here: the caller
 * only calls this with a row the VISIBLE rule already admitted, and a second
 * read that disagrees (a row hidden between the two queries) is notFound().
 */
async function providerProfile(provider: { id: string; slug: string | null }) {
  const [p, user] = await Promise.all([getMasterProfile(provider.id), getCurrentUser()])
  if (!p) notFound()
  const initialUser = user
    ? { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl, role: user.role }
    : null

  // ⚠️ THE FLAG IS READ ONCE, HERE, AND HANDED DOWN — see app/experts/page.tsx.
  const on = requestsOn()

  const url = `${SITE_URL}${masterPath(p)}`
  const image = p.photoSrc ? `${SITE_URL}${p.photoSrc}` : null
  const description = excerpt(p.about)
  // A firm is a LocalBusiness, a person is a Person. Minimal and real: name,
  // address, what they do, where. No rating, no offer — neither exists yet.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': p.isCompany ? 'LocalBusiness' : 'Person',
    name: p.name,
    url,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(p.services.length ? { knowsAbout: p.services } : {}),
    ...(p.areas.length ? { areaServed: p.areas } : {}),
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      // The same two steps the visible trail draws (./_providerHero →
      // ProviderBreadcrumb) — and since stage 11 they are the real path.
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'ექსპერტები', item: `${SITE_URL}/experts` },
      { '@type': 'ListItem', position: 3, name: p.name },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <PublicTopBar initialUser={initialUser} />

      <main>
        <Container className="py-6 sm:py-10 pb-14 sm:pb-20">
          <ProviderBreadcrumb name={p.name} />

          {/* Two columns from `lg`, one below it. The rail spans BOTH rows so its
              sticky card has the whole page height to stick inside; on a phone
              the DOM order is the reading order — hero, then the action, then
              the blocks. `min-w-0` on every track: a grid track will not shrink
              below its content's intrinsic width, and one long name would
              scroll the page sideways at 390px (app/experts/client.tsx). */}
          <div className={`sm:mt-6 grid gap-8 xl:gap-12 ${on ? 'lg:grid-cols-[1fr_360px] lg:grid-rows-[auto_1fr]' : ''}`}>
            <div className="min-w-0">
              <ProviderHero p={p} />
            </div>

            {on && (
              <aside className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
                <div className="lg:sticky lg:top-[80px]">
                  <ProviderCta master={p} />
                </div>
              </aside>
            )}

            <div className="min-w-0 lg:col-start-1">
              {/* The offer before the paragraph about the person — see
                  PricedServicesBlock for why it leads. */}
              <PricedServicesBlock p={p} />
              <AboutBlock p={p} />
              <WorkBlock p={p} />
              <ReviewsBlock p={p} />
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </>
  )
}
