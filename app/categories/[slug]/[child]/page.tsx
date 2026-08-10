import type { Metadata } from 'next'
import { socialMeta } from '@/lib/seo'
import { notFound, permanentRedirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { queryTutors } from '@/lib/tutorsQuery'
import { categorySeo, fallbackSeo } from '@/lib/categorySeo'
import { professionsForCategory } from '@/lib/professionSeo'
import { categoryPath, keepsOwnPage } from '@/lib/categoryRoutes'
import { CategoryLanding } from '../../_landing'

// The landing page of a category that was ABSORBED into a sphere (2026-08-10).
//
// WHY IT EXISTS. „ფინანსები" stopped being a menu entry, but it never stopped
// being a search: it carries its own keyword copy, its own FAQ and its own
// FAQPage structured data in lib/categorySeo, and that copy is the only thing
// on this site targeting „ფინანსური კონსულტაცია". Folding it into a 301 would
// consolidate the link authority and throw the words away. So the old flat URL
// 301s HERE, and this page keeps them, one level under the sphere that now
// carries the category in the menu.
//
// An absorbed category with NO copy has nothing to keep — lib/categoryRoutes
// sends it straight to the sphere instead, and this route redirects the same
// way if anybody constructs the nested URL by hand.
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

async function getChild(slug: string) {
  try {
    await ensureDbReady()
    return await prisma.category.findFirst({
      where: { slug },
      select: {
        id: true, slug: true, name: true, status: true,
        parent: { select: { slug: true, name: true } },
      },
    })
  } catch {
    // Sentinel (not null) so a transient DB blip yields a 5xx (Google retries)
    // rather than a hard 404 that can deindex a live URL.
    return 'error' as const
  }
}

/**
 * Every way this URL can be wrong, answered once. Returns the page's data, or a
 * path to send the visitor to — never a half-valid page.
 *
 * The parent is checked against the URL because the same child must not be
 * reachable under two sphere names: two URLs with one page's content is a
 * duplicate, and a canonical tag is a hint while a 301 is an answer.
 */
type Resolved =
  | { kind: 'ok'; cat: { id: string; slug: string; name: string }; parent: { slug: string; name: string } }
  | { kind: 'redirect'; to: string }
  | { kind: 'missing' }

function resolve(cat: Awaited<ReturnType<typeof getChild>>, parentSlug: string): Resolved {
  if (!cat || cat === 'error') return { kind: 'missing' }
  // Not absorbed at all — it is a sphere, and a sphere lives at the flat URL.
  if (cat.status !== 'REDIRECTED' || !cat.parent) return { kind: 'redirect', to: `/categories/${cat.slug}` }
  // Absorbed, but with no copy of its own: nothing here to show.
  if (!keepsOwnPage(cat.slug)) return { kind: 'redirect', to: `/categories/${cat.parent.slug}` }
  // Absorbed by a different sphere than the URL claims.
  if (cat.parent.slug !== parentSlug) return { kind: 'redirect', to: categoryPath(cat) }
  return { kind: 'ok', cat, parent: cat.parent }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; child: string }> }): Promise<Metadata> {
  const { slug, child } = await params
  const r = resolve(await getChild(child), slug)
  if (r.kind !== 'ok') return { title: 'კატეგორია — მცოდნე' }
  const seo = categorySeo[r.cat.slug] ?? fallbackSeo(r.cat.name)
  const desc = seo.metaDescription
  const title = `${seo.keyword} — ${seo.titleTail} | მცოდნე`
  // Self-canonical, at the nested path. This IS the page for this copy now; the
  // flat URL points here with a 301, so nothing competes with it.
  const path = `/categories/${r.parent.slug}/${r.cat.slug}`
  return {
    title,
    description: desc,
    alternates: { canonical: `${SITE_URL}${path}` },
    ...socialMeta({ title, description: desc, url: path }),
  }
}

export default async function AbsorbedCategoryPage({ params }: { params: Promise<{ slug: string; child: string }> }) {
  const { slug, child } = await params
  const raw = await getChild(child)
  if (raw === 'error') throw new Error('category temporarily unavailable') // → 5xx, not a deindexing 404
  const r = resolve(raw, slug)
  if (r.kind === 'missing') notFound()
  if (r.kind === 'redirect') permanentRedirect(r.to)

  // Its OWN experts — lib/categoryTree's filter answers for an absorbed
  // category by its own name, and returns nobody once its sphere is hidden.
  const [experts, posts] = await Promise.all([
    queryTutors({ category: r.cat.slug, limit: 48 }).catch(() => []),
    prisma.post
      .findMany({
        where: { status: 'PUBLISHED', tag: r.cat.name },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: { slug: true, title: true, excerpt: true },
      })
      .catch(() => []),
  ])
  const seo = categorySeo[r.cat.slug] ?? fallbackSeo(r.cat.name)
  const related = professionsForCategory(r.cat.slug)

  return (
    <CategoryLanding
      name={r.cat.name}
      canonicalPath={`/categories/${r.parent.slug}/${r.cat.slug}`}
      trail={[{ name: r.parent.name, href: `/categories/${r.parent.slug}` }, { name: r.cat.name }]}
      experts={experts}
      posts={posts}
      seo={seo}
      related={related}
    />
  )
}
