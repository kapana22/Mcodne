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
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import ExpertProfilePage from './client'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

type Params = { id: string }

// One DB round-trip shared by generateMetadata + the page render (React
// per-request cache). Returns 'error' (not null) on DB failure so a transient
// outage degrades to generic metadata + client render instead of a false 404.
const getTutorSeo = cache(async (id: string) => {
  try {
    return await prisma.tutorProfile.findUnique({
      where: { id },
      select: {
        specialty: true,
        headline: true,
        bio: true,
        rating: true,
        reviewsCount: true,
        category: { select: { name: true } },
        user: { select: { fullName: true, avatarUrl: true } },
      },
    })
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
const getTutorInitial = cache(async (id: string) => {
  try {
    const [tutor, consultations] = await Promise.all([
      prisma.tutorProfile.findUnique({
        where: { id },
        select: {
          id: true, headline: true, bio: true, specialty: true, yearsExp: true,
          rating: true, reviewsCount: true, sessionsCount: true, price: true,
          verified: true, available: true, responseHours: true, languages: true,
          videoUrl: true, consultationDurationMin: true,
          user: { select: { id: true, fullName: true, avatarUrl: true, bio: true } },
          category: { select: { id: true, slug: true, name: true, icon: true } },
        },
      }),
      prisma.consultation.findMany({
        where: { tutorId: id },
        select: { id: true, tier: true, title: true, description: true, minutes: true, price: true },
      }),
    ])
    if (!tutor) return null
    // Shape matches /api/tutors/[id] for the seeded fields; the arrays the seed
    // omits are read as `?? []` in the client, so their absence is safe.
    return { ...tutor, consultations }
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
function absoluteAvatar(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//.test(url)) return url
  return null
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id } = await params
  const canonical = `${SITE_URL}/tutors/${id}`
  const tutor = await getTutorSeo(id)

  if (tutor && tutor !== 'error') {
    const name = tutor.user?.fullName?.trim() || 'ექსპერტი'
    const specialty = tutor.specialty?.trim() || tutor.category?.name?.trim()
    const title = specialty ? `${name} — ${specialty} | მცოდნე` : `${name} | მცოდნე`
    const description =
      excerpt(tutor.bio) ||
      tutor.headline?.trim() ||
      `დაჯავშნე კონსულტაცია ${name}-სთან მცოდნეზე.`
    const image = absoluteAvatar(tutor.user?.avatarUrl)
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: canonical,
        type: 'profile',
        ...(image ? { images: [{ url: image }] } : {}),
      },
    }
  }

  return {
    title: 'ექსპერტი — მცოდნე',
    description: 'დაჯავშნე კონსულტაცია მცოდნის ექსპერტთან.',
    alternates: { canonical },
    openGraph: {
      title: 'ექსპერტი — მცოდნე',
      description: 'დაჯავშნე კონსულტაცია მცოდნის ექსპერტთან.',
      url: canonical,
    },
  }
}

export default async function TutorProfileRoute(
  { params }: { params: Promise<Params> },
) {
  const { id } = await params
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
  if (tutor && tutor !== 'error') {
    const name = tutor.user?.fullName?.trim() || 'ექსპერტი'
    const jobTitle = tutor.specialty?.trim() || tutor.category?.name?.trim()
    const description = excerpt(tutor.bio)
    const image = absoluteAvatar(tutor.user?.avatarUrl)
    const hasRealRating = (tutor.rating ?? 0) > 0 && (tutor.reviewsCount ?? 0) > 0
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name,
      url: `${SITE_URL}/tutors/${id}`,
      ...(jobTitle ? { jobTitle } : {}),
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
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
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ExpertProfilePage initialTutor={initialTutor} initialUser={initialUser} />
    </>
  )
}
