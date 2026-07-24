import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

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

const STATIC_ROUTES: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  priority: number
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/tutors', changeFrequency: 'daily', priority: 0.9 },
  { path: '/categories', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/apply', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/help', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/cookies', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/signin', changeFrequency: 'yearly', priority: 0.4 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  let tutorEntries: MetadataRoute.Sitemap = []
  try {
    const tutors = await prisma.tutorProfile.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    })
    tutorEntries = tutors.map((t) => ({
      url: `${SITE_URL}/tutors/${t.id}`,
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
  let categoryEntries: MetadataRoute.Sitemap = []
  try {
    const cats = await prisma.category.findMany({
      where: { isLive: true },
      select: { slug: true },
      take: 500,
    })
    categoryEntries = cats.map((c) => ({
      url: `${SITE_URL}/categories/${c.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch {
    categoryEntries = []
  }

  return [...staticEntries, ...tutorEntries, ...postEntries, ...categoryEntries]
}
