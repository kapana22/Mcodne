import Link from 'next/link'
import type { Metadata } from 'next'
import { socialMeta } from '@/lib/seo'
import { notFound } from 'next/navigation'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { fmtKaDate } from '@/lib/kaDate'
import { renderMarkdown } from '@/lib/markdown'
import { jsonLdString } from '@/lib/jsonLd'
import { categoryIcon } from '@/lib/categoryMarks'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const dynamic = 'force-dynamic'

/* COVER VERSIONS, NOT COVER BYTES — see the note in app/blog/page.tsx. Here it
   buys a second thing: `og:image` and the BlogPosting JSON-LD need an ABSOLUTE,
   FETCHABLE url. A `data:` URI in an OG tag is unusable — no crawler can read
   it — so a cover pasted straight into the tag would have looked present and
   shared as nothing. */
async function coverVersions(slugs: string[]): Promise<Map<string, string>> {
  if (!slugs.length) return new Map()
  try {
    const rows = await prisma.$queryRawUnsafe<{ slug: string; v: string }[]>(
      `SELECT "slug", (length("coverUrl") || right("coverUrl", 8)) AS v
         FROM "Post" WHERE "status" = 'PUBLISHED' AND "coverUrl" IS NOT NULL AND "coverUrl" <> ''
          AND "slug" = ANY($1)`,
      slugs,
    )
    return new Map(rows.map(r => [r.slug, r.v]))
  } catch { return new Map() }
}

const coverHref = (slug: string, v: string | undefined, absolute = false) =>
  v ? `${absolute ? SITE_URL : ''}/api/blog/${slug}/cover?v=${encodeURIComponent(v)}` : undefined

async function getPost(slug: string) {
  try {
    await ensureDbReady()
    return await prisma.post.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { slug: true, title: true, excerpt: true, body: true, tag: true, authorName: true, publishedAt: true, updatedAt: true },
    })
  } catch {
    // Sentinel (not null) so a transient DB blip yields a 5xx (Google retries)
    // instead of a hard 404 that can deindex a live URL.
    return 'error' as const
  }
}

// Same rule as the index — Georgian expository prose at ~160wpm.
function readMin(body: string): number {
  const words = body.replace(/[#*`>\-\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 160))
}

// A reader who finishes a post had exactly two ways out: the back link and a
// „find an expert" CTA. Neither keeps them reading, which is what a blog is
// for. Same tag first (genuinely related), then the newest — so the rail is
// full even for a post whose tag is unique.
// Same resolution as the index: post tags ARE category names, so an uncovered
// card in the rail carries that sphere's real mark rather than a blank sheet.
async function getTagSlugs(): Promise<Record<string, string>> {
  try {
    const cats = await prisma.category.findMany({ select: { name: true, slug: true } })
    return Object.fromEntries(cats.map(c => [c.name.trim(), c.slug]))
  } catch { return {} }
}

async function getMore(slug: string, tag: string | null) {
  try {
    const take = 3
    const base = { status: 'PUBLISHED' as const, slug: { not: slug } }
    const sel = { slug: true, title: true, tag: true, publishedAt: true }
    const same = tag
      ? await prisma.post.findMany({ where: { ...base, tag }, orderBy: { publishedAt: 'desc' }, take, select: sel })
      : []
    if (same.length >= take) return same
    const fill = await prisma.post.findMany({
      where: { ...base, slug: { notIn: [slug, ...same.map(p => p.slug)] } },
      orderBy: { publishedAt: 'desc' },
      take: take - same.length,
      select: sel,
    })
    return [...same, ...fill]
  } catch { return [] }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post || post === 'error') return { title: 'ბლოგი — მცოდნე' }
  const desc = post.excerpt || 'პრაქტიკული ცოდნა ქართველი ექსპერტებისგან.'
  return {
    // Post titles run 38–70 chars on their own; appending „ — მცოდნე" pushed
    // several past Google's ~60-char cut, which then truncated the headline
    // itself. The brand suffix is the expendable part, so it is only added when
    // it fits. (60 is the practical limit; the real one is pixel width, and
    // Georgian mkhedruli is narrow enough that char count tracks it closely.)
    title: post.title.length + 9 <= 60 ? `${post.title} — მცოდნე` : post.title,
    description: desc,
    alternates: { canonical: `${SITE_URL}/blog/${post.slug}` },
    // A post without a cover image used to emit NO og:image at all (undefined
    // replaced the layout default), so every uncovered post shared as a blank
    // card. socialMeta falls back to /og.png instead.
    ...socialMeta({
      title: post.title,
      description: desc,
      url: `/blog/${post.slug}`,
      image: coverHref(post.slug, (await coverVersions([post.slug])).get(post.slug), true),
      type: 'article',
    }),
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (post === 'error') throw new Error('blog post temporarily unavailable') // → 5xx, not a deindexing 404
  if (!post) notFound()
  const [more, tagSlugs] = await Promise.all([getMore(post.slug, post.tag), getTagSlugs()])
  // One query for this post AND the three „კიდევ წასაკითხი" cards.
  const covers = await coverVersions([post.slug, ...more.map(m => m.slug)])
  const cover = coverHref(post.slug, covers.get(post.slug))
  const mins = readMin(post.body || '')

  // BlogPosting structured data — eligible for Google's article rich results
  // (headline, image, date, author). Omit fields that are null so we never
  // emit an empty schema property.
  const published = post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(covers.get(post.slug) ? { image: coverHref(post.slug, covers.get(post.slug), true) } : {}),
    // dateModified was pinned to datePublished, so an edited post still looked
    // untouched. `updatedAt` is maintained by Prisma on every write.
    ...(published ? { datePublished: published } : {}),
    ...(post.updatedAt ? { dateModified: new Date(post.updatedAt).toISOString() } : published ? { dateModified: published } : {}),
    author: { '@type': 'Person', name: post.authorName || 'მცოდნე' },
    publisher: { '@type': 'Organization', name: 'მცოდნე', logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blog/${post.slug}` },
  }

  // Breadcrumbs — every other landing family (/categories, /konsultacia, expert
  // profiles) emitted these; blog posts were the one set that didn't, so they
  // were the only pages that could never show a SERP breadcrumb trail.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'ბლოგი', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title },
    ],
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <MarketingTopBar />

      <Container as="main" size="content" className="py-12 lg:py-16">
        <Link href="/blog" className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 text-small text-ink-500 hover:text-ink-800 transition-colors duration-fast">
          <Icon.back className="w-3.5 h-3.5" /> ბლოგი
        </Link>

        <article className="mt-6 max-w-[720px]">
          <div className="flex items-center gap-3 text-meta text-ink-500">
            {post.tag && <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-brand-50 text-brand-700 font-display text-micro font-semibold uppercase">{post.tag}</span>}
            {post.publishedAt && <span>{fmtKaDate(new Date(post.publishedAt))}</span>}
            {post.authorName && <span>· {post.authorName}</span>}
            <span aria-hidden className="w-px h-3 bg-ink-200" />
            <span className="tabular-nums">{mins} წთ საკითხავი</span>
          </div>

          <h1 className="mt-4 font-display text-display lg:text-display-lg font-bold text-ink-900 tracking-tight leading-[1.1]">{post.title}</h1>
          {post.excerpt && <p className="mt-4 text-h3 text-ink-600 leading-relaxed">{post.excerpt}</p>}

          {cover && (
            /* Locked to the same 16:9 the uploader crops to. `h-auto` let a
               pasted portrait URL render a two-screen-tall image above the
               first paragraph. */
            <div className="mt-8 rounded-card overflow-hidden border border-ink-100 bg-ink-100 aspect-[16/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          <div className="prose-post mt-8 text-h3 leading-[1.75] text-ink-800" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />
        </article>

        {more.length > 0 && (
          <section className="mt-14 pt-8 border-t border-ink-100 max-w-[720px]">
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">კიდევ წასაკითხი</h2>
            <div className="mt-5 grid sm:grid-cols-3 gap-4">
              {more.map(m => (
                <Link key={m.slug} href={`/blog/${m.slug}`} className="group rounded-card border border-ink-200 bg-white overflow-hidden flex flex-col transition-all duration-fast hover-lift">
                  <div className="aspect-[16/9] w-full overflow-hidden bg-ink-100 border-b border-ink-100">
                    {covers.has(m.slug) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverHref(m.slug, covers.get(m.slug))} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-slow ease-out-quart group-hover:scale-[1.03]" />
                    ) : (
                      <div className="w-full h-full bg-ink-50 grain inline-flex items-center justify-center text-ink-300 transition-colors duration-mid group-hover:text-brand-300">
                        {m.tag && tagSlugs[m.tag] ? categoryIcon(tagSlugs[m.tag], 'w-8 h-8') : <Icon.doc className="w-6 h-6" />}
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-display text-small font-bold text-ink-900 leading-snug tracking-tight line-clamp-3 group-hover:text-brand-700 transition-colors duration-fast">{m.title}</h3>
                    {m.publishedAt && <span className="mt-2 text-meta text-ink-500">{fmtKaDate(new Date(m.publishedAt))}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-14 pt-8 border-t border-ink-100 max-w-[720px]">
          <div className="rounded-card border border-ink-200 bg-ink-50/50 p-6 lg:p-8">
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">გჭირდება პრაქტიკული რჩევა?</h2>
            <p className="mt-2 text-body-lg text-ink-600 leading-relaxed">დაჯავშნე კონსულტაცია ექსპერტთან და მიიღე პასუხი შენს კონკრეტულ კითხვაზე.</p>
            <Link href="/tutors" className="mt-5 inline-flex h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body items-center gap-2 transition-colors duration-fast">იპოვე ექსპერტი</Link>
          </div>
        </div>
      </Container>

      <Footer />
    </div>
  )
}
