import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { professions } from '@/lib/professionSeo'
import { BROWSABLE_CATEGORY } from '@/lib/categoryTree'
import { categoryPath } from '@/lib/categoryRoutes'
import { ABROAD_CATEGORY_SLUG } from '@/lib/abroad'

// Next auto-serves this at /sitemap.xml. We keep the surface small and static
// for public routes, then splice in tutor detail pages sourced directly from
// Prisma. A hard cap of 5000 keeps the file well under the 50k / 50MB limit
// even if the tutor catalog grows.
//
// force-dynamic: generate at REQUEST time, never at build. Railway's build
// container can't reach the DB, so a statically-built sitemap silently drops
// every tutor profile + blog post (the try/catch below returns []) and ships
// only the static routes — exactly the "experts aren't in the sitemap" bug.
// Reading per-request (crawlers hit this rarely) guarantees the full catalog.
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

/**
 * Last time the CODE-OWNED copy on this site actually changed — the static
 * marketing pages, the category landing copy (lib/categorySeo) and the
 * profession pages (lib/professionSeo).
 *
 * ⚠️ BUMP THIS when you meaningfully edit that copy. Nothing bumps it for you.
 *
 * WHY IT IS A CONSTANT AND NOT `new Date()`:
 * this route is force-dynamic, so `now` was recomputed on every crawl and 26 of
 * our URLs claimed to have changed seconds ago, every single time. `lastmod` is
 * a trust signal: a sitemap that reports "everything changed just now" on every
 * fetch teaches the crawler the field is noise, and Google then discounts it
 * for the URLs where it IS real (tutor profiles and blog posts, which carry a
 * true `updatedAt` below). A stale-but-honest date is worth far more than a
 * fresh lie.
 */
const CONTENT_REVISION = new Date('2026-07-28T00:00:00.000Z')

const STATIC_ROUTES: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  priority: number
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/tutors', changeFrequency: 'daily', priority: 0.9 },
  { path: '/categories', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/konsultacia', changeFrequency: 'weekly', priority: 0.8 },
  // Public again as of 2026-07-29: guests get a crawlable „გახდი ექსპერტი"
  // landing page (app/apply/ApplyMarketing.tsx) and only the FORM needs a
  // session. It was removed from this list while it 307'd every guest away.
  { path: '/apply', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/help', changeFrequency: 'monthly', priority: 0.5 },
  // A sitemap must list ONLY canonical URLs you want in search results — not
  // "every page that exists". Deliberately absent, and why:
  //
  //   /signin, /signup   noindex (their layouts set it).
  //   /ask               an interactive matching tool, now noindex: what it
  //                      returns depends on a query, so there is no stable
  //                      document for Google to rank.
  //   /terms /privacy    legal pages. Indexable and linked, but nobody searches
  //   /cookies           for them, so they don't belong in a targeted sitemap.
  //   /abroad            the diaspora landing (FEATURE_ABROAD). It is noindex,
  //                      nofollow and 404s while the flag is off — listing it
  //                      would be submitting a URL we are simultaneously telling
  //                      the crawler to ignore. When the vertical goes public,
  //                      drop the noindex in app/abroad/page.tsx FIRST, then add
  //                      it here; the two must never disagree.
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: CONTENT_REVISION,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  let tutorEntries: MetadataRoute.Sitemap = []
  try {
    const tutors = await prisma.tutorProfile.findMany({
      // Must mirror the public visibility rule in lib/tutorsQuery.ts EXACTLY,
      // otherwise we submit profiles that no public listing links to:
      //   available: true      — self-paused experts are pulled from browse
      //   suspendedAt: null    — admin-suspended experts 404 on /tutors/[id]
      //   BROWSABLE_CATEGORY   — hidden-category (and categoryId-null) experts
      //                          are unreachable from browse and unbookable
      where: {
        available: true,
        user: { is: { suspendedAt: null } },
        category: { is: BROWSABLE_CATEGORY },
      },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    })
    tutorEntries = tutors.map((t) => ({
      // Slug when the profile has one — submitting the id URL would advertise a
      // page that 308s straight to the slug, and a sitemap must list only final
      // canonical URLs. `t.id` remains the fallback for un-backfilled rows.
      url: `${SITE_URL}/tutors/${t.slug || t.id}`,
      lastModified: t.updatedAt ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch {
    // If DB is unreachable at build time we still emit a valid sitemap for
    // static routes instead of failing the entire route.
    tutorEntries = []
  }

  // Published blog posts (admin CMS). Same DB-unreachable fallback as tutors.
  let postEntries: MetadataRoute.Sitemap = []
  try {
    const posts = await prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
    })
    postEntries = posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.updatedAt ?? now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  } catch {
    postEntries = []
  }

  // Category landing pages (/categories/[slug]) — live categories only.
  //
  // `lastmod` is the most recent change to anything ON the page: either the
  // code-owned intro/FAQ copy, or the newest edit among the experts it lists
  // (which is what actually changes day to day). Whichever is later wins.
  let categoryEntries: MetadataRoute.Sitemap = []
  try {
    // Everything that still ANSWERS at /categories/<slug>: the spheres, and the
    // hidden ones, which keep a real 200 page with unique copy. Dropping the
    // hidden ones would have made them orphans — out of the sitemap AND out of
    // the /categories index while still resolving — which is how a URL quietly
    // loses the history this change exists to keep. Only REDIRECTED is absent,
    // because it answers with a 301 and its target is listed below.
    // …except the /abroad marker. It is a Category row whose entire job is to
    // stay out of the public catalogue (lib/abroad.ts) — not a sphere waiting
    // for its first expert — and /abroad itself is deliberately absent from
    // this file for the same reason. Listing its category page would submit the
    // one URL the vertical exists to keep unlisted.
    const cats = await prisma.category.findMany({
      where: { status: { in: ['VISIBLE', 'HIDDEN'] }, slug: { not: ABROAD_CATEGORY_SLUG } },
      select: {
        slug: true,
        // One row per category: the freshest visible expert in it. Mirrors the
        // visibility rule used for tutorEntries above — an invisible expert's
        // edit must not claim the page changed. Children count too: the page
        // lists their experts, so their edits change it.
        tutors: {
          where: { available: true, user: { is: { suspendedAt: null } } },
          select: { updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
        children: {
          select: {
            tutors: {
              where: { available: true, user: { is: { suspendedAt: null } } },
              select: { updatedAt: true },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      take: 500,
    })
    // The absorbed categories that kept a page of their own. They carry unique
    // keyword copy and their old flat URL 301s to them, so leaving them out
    // would mean the only page holding that copy is the one page we never
    // declare. lib/categoryRoutes decides which ones those are.
    const absorbed = await prisma.category.findMany({
      where: { status: 'REDIRECTED', parent: { is: { status: 'VISIBLE' } } },
      select: { slug: true, status: true, parent: { select: { slug: true } } },
      take: 500,
    })
    const absorbedEntries: MetadataRoute.Sitemap = absorbed
      .map(c => categoryPath(c))
      // A category with no copy resolves to its parent's URL, which is already
      // in the list — declaring it twice would be a duplicate, not a page.
      .filter(path => path.split('/').length === 4)
      .map(path => ({
        url: `${SITE_URL}${path}`,
        lastModified: CONTENT_REVISION,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }))
    categoryEntries = cats.map((c) => {
      const dates = [c.tutors[0]?.updatedAt, ...c.children.map(k => k.tutors[0]?.updatedAt)]
        .filter((d): d is Date => !!d)
      const newestExpert = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : undefined
      const lastModified =
        newestExpert && newestExpert > CONTENT_REVISION ? newestExpert : CONTENT_REVISION
      return {
        url: `${SITE_URL}/categories/${c.slug}`,
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }
    })
    categoryEntries = [...categoryEntries, ...absorbedEntries]
  } catch {
    categoryEntries = []
  }

  // Profession landing pages. Code-owned (lib/professionSeo.ts), so unlike the
  // three blocks above this one can't fail and needs no try/catch.
  const professionEntries: MetadataRoute.Sitemap = professions.map((p) => ({
    url: `${SITE_URL}/konsultacia/${p.slug}`,
    lastModified: CONTENT_REVISION,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [...staticEntries, ...tutorEntries, ...postEntries, ...categoryEntries, ...professionEntries]
}
