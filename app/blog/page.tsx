import Link from 'next/link'
import { pageMetadata } from '@/lib/pageSeo'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { SiteText } from '@/components/SiteTextProvider'
import { categoryIcon } from '@/lib/categoryMarks'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { fmtKaDate } from '@/lib/kaDate'
import { socialMeta } from '@/lib/seo'
import { jsonLdString } from '@/lib/jsonLd'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// DB-backed: admin publishes posts in the panel, they appear here immediately.
export const dynamic = 'force-dynamic'

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
export const generateMetadata = () => pageMetadata('blog', '/blog')

// Post tags ARE category names („ბიზნესი", „გადასახადები", …), so the plate on
// an uncovered post can carry that sphere's real hand-drawn mark instead of a
// generic sheet-of-paper. Resolved against the Category table rather than a
// hard-coded Georgian→slug table: a second copy of those names is exactly the
// duplication that gave the category grid six drawings for fourteen spheres
// (see lib/categoryMarks.tsx). A tag with no matching category („რჩევები")
// simply falls through to the neutral mark.
async function getTagSlugs(): Promise<Record<string, string>> {
  try {
    const cats = await prisma.category.findMany({ select: { name: true, slug: true } })
    return Object.fromEntries(cats.map(c => [c.name.trim(), c.slug]))
  } catch { return {} }
}

async function getPosts() {
  try {
    await ensureDbReady()
    return await prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, excerpt: true, tag: true, coverUrl: true, publishedAt: true, body: true },
    })
  } catch { return [] }
}

// Reading time, from the real body — Georgian mkhedruli reads at roughly 160
// wpm for this kind of expository prose. It is computed on the server and the
// body is dropped before render: the index must never ship eight full articles
// down the wire just to print „6 წთ".
function readMin(body: string): number {
  const words = body.replace(/[#*`>\-\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 160))
}

export default async function BlogPage() {
  const [rows, tagSlugs] = await Promise.all([getPosts(), getTagSlugs()])
  const posts = rows.map(({ body, ...p }) => ({ ...p, readMin: readMin(body || '') }))

  // Blog + ItemList so the index is understood as a publication with N posts,
  // not a loose page of links. Each post already emits its own BlogPosting.
  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'მცოდნეს ბლოგი',
    url: `${SITE_URL}/blog`,
    inLanguage: 'ka',
    publisher: { '@type': 'Organization', name: 'მცოდნე', url: SITE_URL },
    blogPost: posts.map(p => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      ...(p.excerpt ? { description: p.excerpt } : {}),
      ...(p.publishedAt ? { datePublished: new Date(p.publishedAt).toISOString() } : {}),
    })),
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'ბლოგი' },
    ],
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(blogLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <MarketingTopBar />

      {/* py-12/16, matching the home page's rhythm. py-16/24 plus the footer's
          old mt-20 was most of the dead band this page opened with. */}
      <Container as="main" size="wide" className="py-12 lg:py-16">
        <div className="max-w-[680px]">
          <Eyebrow className="mb-3"><SiteText k="blog.eyebrow" /></Eyebrow>
          <h1 className="font-display text-h1 sm:text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            <SiteText k="blog.title" />
          </h1>
          <p className="mt-6 text-h3 text-ink-600 leading-relaxed">
            <SiteText k="blog.subtitle" />
          </p>
        </div>

        {posts.length > 0 ? (
          <section className="mt-10 lg:mt-12">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {posts.map(p => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group relative rounded-card border border-ink-200 bg-white overflow-hidden flex flex-col transition-all duration-fast hover-lift"
                >
                  {/* EVERY card gets a 16:9 plate, cover or not. Rendering the
                      image only when it exists made the grid ragged the moment
                      one post had a cover and the next didn't — cards in the
                      same row started at different heights and the titles no
                      longer lined up. The uncovered plate is deliberately a
                      quiet neutral with the section glyph: it reads as „no
                      image yet", not as a broken one. */}
                  <div className="aspect-[16/9] w-full overflow-hidden bg-ink-100 border-b border-ink-100 relative">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-slow ease-out-quart group-hover:scale-[1.03]" />
                    ) : (
                      <div className="w-full h-full bg-ink-50 grain inline-flex items-center justify-center text-ink-300 transition-colors duration-mid group-hover:text-brand-300">
                        {p.tag && tagSlugs[p.tag]
                          ? categoryIcon(tagSlugs[p.tag], 'w-10 h-10')
                          : <Icon.doc className="w-8 h-8" />}
                      </div>
                    )}
                    {/* The tag rides the plate instead of pushing the title
                        down by a whole row — and a post without one no longer
                        leaves an empty flex box behind in the body. */}
                    {p.tag && (
                      <span className="absolute left-3 top-3 inline-flex items-center h-6 px-2.5 rounded-pill bg-white/95 text-ink-700 border border-ink-200 font-display text-micro font-semibold uppercase">
                        {p.tag}
                      </span>
                    )}
                  </div>

                  <div className="p-5 sm:p-6 flex flex-col flex-1">
                    {/* h2, not h3: the page has an h1 and nothing between, so
                        every post title was a level jump. The visual size is a
                        token (text-h3) and is unaffected — only the outline
                        changes, which is what assistive tech reads. */}
                    <h2 className="font-display text-h3 font-bold text-ink-900 leading-snug tracking-tight group-hover:text-brand-700 transition-colors duration-fast">{p.title}</h2>
                    {p.excerpt && <p className="mt-2.5 text-body text-ink-600 leading-relaxed line-clamp-3 flex-1">{p.excerpt}</p>}
                    <div className="mt-5 pt-4 border-t border-ink-100 flex items-center justify-between gap-3 text-meta text-ink-500">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span className="truncate">{p.publishedAt ? fmtKaDate(new Date(p.publishedAt)) : ''}</span>
                        <span aria-hidden className="w-px h-3 bg-ink-200 shrink-0" />
                        <span className="tabular-nums shrink-0">{p.readMin} წთ</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-brand-700 font-semibold shrink-0">კითხვა <Icon.arrow className="w-3 h-3 transition-transform duration-fast group-hover:translate-x-0.5" /></span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-10 lg:mt-12">
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-10 lg:p-14 text-center max-w-[560px] mx-auto">
              <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-pill bg-warning-50 border border-warning-200 text-warning-800">
                <Icon.bolt className="w-3.5 h-3.5" />
                <span className="font-display text-meta font-semibold tracking-wide"><SiteText k="blog.empty.badge" /></span>
              </div>
              <h2 className="mt-5 font-display text-h1 font-bold text-ink-900 tracking-tight"><SiteText k="blog.empty.title" /></h2>
              <p className="mt-3 text-body-lg text-ink-600 leading-relaxed"><SiteText k="blog.empty.body" /></p>
              <Link href="/contact" className="mt-6 inline-flex h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body items-center gap-2 transition-colors duration-fast">
                <SiteText k="blog.empty.cta" />
              </Link>
            </div>
          </section>
        )}
      </Container>

      <Footer />
    </div>
  )
}
