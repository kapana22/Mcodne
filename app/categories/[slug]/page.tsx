import type { Metadata } from 'next'
import { socialMeta } from '@/lib/seo'
import { notFound, permanentRedirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { queryTutors } from '@/lib/tutorsQuery'
import { categorySeo, fallbackSeo } from '@/lib/categorySeo'
import { professionsForCategory } from '@/lib/professionSeo'
import { categoryPath, keepsOwnPage } from '@/lib/categoryRoutes'
import { CategoryLanding } from '../_landing'

// SEO landing page per category — a crawlable, keyword-targeted URL
// (/categories/ბიზნეს-კონსულტაცია) with a unique H1 + description + the real
// expert list. Captures long-tail "<category> კონსულტაცია" search intent that
// the client-side /tutors filter can't rank for.
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

async function getCategory(slug: string) {
  try {
    await ensureDbReady()
    // Every status is fetched, and the caller branches. A HIDDEN sphere keeps
    // this page — it is a real, indexable landing page that simply is not
    // advertised while nobody works in it — and a REDIRECTED one is answered
    // with a 301 below rather than a 404, because a 404 is how a URL loses the
    // history this whole change exists to keep.
    return await prisma.category.findFirst({
      where: { slug },
      select: {
        id: true, slug: true, name: true, status: true,
        parent: { select: { slug: true } },
        // Absorbed categories. Which of them kept a page is decided in code
        // (lib/categoryRoutes), so this list is filtered there, not here.
        children: {
          where: { status: 'REDIRECTED' },
          select: { slug: true, name: true },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
        },
      },
    })
  } catch {
    // Sentinel (not null) so a transient DB blip yields a 5xx (Google retries)
    // rather than a hard 404 that can deindex a live category URL.
    return 'error' as const
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const cat = await getCategory(slug)
  if (!cat || cat === 'error') return { title: 'კატეგორია — მცოდნე' }
  // Absorbed into a sphere — the page below 301s, so it claims no metadata.
  if (cat.status === 'REDIRECTED') return { title: 'კატეგორია — მცოდნე' }
  const seo = categorySeo[cat.slug] ?? fallbackSeo(cat.name)
  // The SERP snippet, not the page's opening paragraph — `intro` runs ~300
  // chars and was being cut mid-sentence in the results.
  const desc = seo.metaDescription
  // ⚠️ DO NOT add a noindex-while-empty rule here. One was added on 2026-07-28
  // and removed again on 07-29: it silently de-indexed 12 of the 15 category
  // landing pages — the site's primary keyword pages, each with unique copy, a
  // FAQ, structured data and internal links from everywhere.
  //
  // The thin-content argument for it is real, and it was put to the owner on
  // 2026-07-28. They decided these pages stay indexable while supply is still
  // being built („არა იყოს ღია ჯერ"). That is a product decision, not a
  // technical one — reopen it with them, never in code.
  return {
    // „<keyword> — <titleTail> | მცოდნე", capped under ~60 so Google doesn't
    // truncate. The tail carries the terms people actually search (see the
    // titleTail note in lib/categorySeo). Before it, the title was the service
    // name alone and ran 27–33 chars — half the usable width sat empty while
    // the words buyers type („დღგ", „დეკლარაცია") appeared nowhere in it.
    title: `${seo.keyword} — ${seo.titleTail} | მცოდნე`,
    description: desc,
    alternates: { canonical: `${SITE_URL}/categories/${cat.slug}` },
    ...socialMeta({ title: `${seo.keyword} — ${seo.titleTail} | მცოდნე`, description: desc, url: `/categories/${cat.slug}` }),
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cat = await getCategory(slug)
  if (cat === 'error') throw new Error('category temporarily unavailable') // → 5xx, not a deindexing 404
  if (!cat) notFound()
  // 301, permanently: the sphere it was absorbed into now answers for it, and
  // its experts are listed there. The parent is guaranteed by lib/categoryTree
  // — a REDIRECTED row without one cannot be saved, and the migration refuses
  // to commit if one exists.
  // 301, permanently, to wherever lib/categoryRoutes says this category now
  // lives: its own nested page when it carried keyword copy, otherwise the
  // sphere itself. Never a chain — the target is always a real page.
  if (cat.status === 'REDIRECTED' && cat.parent) permanentRedirect(categoryPath(cat))

  // Posts are matched by TAG = the category's own name. That is the contract
  // for the admin blog editor too: tag a post with the exact sphere name
  // („გადასახადები") and it surfaces here automatically. A mistyped tag simply
  // shows nothing — it can never 500 or mismatch.
  const [experts, posts] = await Promise.all([
    queryTutors({ category: cat.slug, limit: 48 }).catch(() => []),
    prisma.post
      .findMany({
        where: { status: 'PUBLISHED', tag: cat.name },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: { slug: true, title: true, excerpt: true },
      })
      .catch(() => []),
  ])
  const seo = categorySeo[cat.slug] ?? fallbackSeo(cat.name)
  const related = professionsForCategory(cat.slug)
  const subPages = cat.children
    .filter(k => keepsOwnPage(k.slug))
    .map(k => ({ path: `/categories/${cat.slug}/${k.slug}`, name: k.name }))

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'კატეგორიები', item: `${SITE_URL}/categories` },
      { '@type': 'ListItem', position: 3, name: cat.name },
    ],
  }
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${cat.name} — ექსპერტები`,
    url: `${SITE_URL}/categories/${cat.slug}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: experts.length,
      itemListElement: experts.slice(0, 20).map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/tutors/${t.slug || t.id}`,
        name: t.user?.fullName ?? 'ექსპერტი',
      })),
    },
  }
  // FAQPage structured data — eligible for Google's collapsible-FAQ rich result.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: seo.faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <CategoryLanding
      name={cat.name}
      canonicalPath={`/categories/${cat.slug}`}
      trail={[{ name: cat.name }]}
      experts={experts}
      posts={posts}
      seo={seo}
      related={related}
      subPages={subPages}
    />
  )
}
