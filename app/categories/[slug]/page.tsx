import Link from 'next/link'
import type { Metadata } from 'next'
import { socialMeta } from '@/lib/seo'
import { notFound } from 'next/navigation'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { queryTutors } from '@/lib/tutorsQuery'
import { categorySeo, fallbackSeo } from '@/lib/categorySeo'
import { professionsForCategory } from '@/lib/professionSeo'
import { jsonLdString } from '@/lib/jsonLd'

// SEO landing page per category — a crawlable, keyword-targeted URL
// (/categories/ბიზნეს-კონსულტაცია) with a unique H1 + description + the real
// expert list. Captures long-tail "<category> კონსულტაცია" search intent that
// the client-side /tutors filter can't rank for.
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

async function getCategory(slug: string) {
  try {
    await ensureDbReady()
    return await prisma.category.findFirst({
      where: { slug, isLive: true },
      select: { id: true, slug: true, name: true },
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
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faqLd) }} />
      <MarketingTopBar />

      {/* size="content" (820px), NOT "wide": every section on this page is
          prose or a small card grid, and inside the 1280 shell they all sat
          capped at ~760 against the LEFT edge — a third of the page was a void
          column of white. Same tier /blog and /help already use. The inner
          max-w caps are gone with it: the column is the cap now, one source. */}
      <Container as="main" size="content" className="py-12 lg:py-16">
                {/* Hidden below sm — the same rule /tutors, /ask and /tutors/[id] follow.
            Kept in the DOM so crawlers and assistive tech still get the trail. */}
<nav className="hidden sm:flex items-center gap-1.5 text-meta text-ink-400 mb-5">
          <Link href="/" className="hover:text-ink-700">მთავარი</Link>
          <span>/</span>
          <Link href="/categories" className="hover:text-ink-700">კატეგორიები</Link>
          <span>/</span>
          <span className="text-ink-600">{cat.name}</span>
        </nav>

        <div>
          <Eyebrow className="mb-3">კატეგორია</Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            „{cat.name}“ ექსპერტები
          </h1>
          <p className="mt-5 text-h3 text-ink-600 leading-relaxed">{seo.intro}</p>
        </div>

        {experts.length === 0 ? (
          // Cold-start sphere: warm, honest empty state (icon + one line +
          // action) rather than a bare "no experts" note. Supply is genuinely
          // growing, so „მალე დაემატება" is fair; the secondary link invites
          // the first expert in this sphere.
          <div className="mt-12 max-w-[560px]">
            {/* `illustration` is wired ahead of its PNG: while the file is
                missing EmptyState keeps the icon medallion, and the day it
                lands this state switches over with no edit here. */}
            <EmptyState
              illustration="categoryComingSoon"
              icon={<Icon.users className="w-6 h-6" />}
              title="ამ სფეროში ექსპერტებს ჯერ ვარჩევთ"
              description="სანამ დაემატებიან, შეგიძლია სხვა სფეროს ექსპერტებს გადახედო."
              cta={{ label: 'ნახე ყველა ექსპერტი', href: '/tutors' }}
            />
            <div className="mt-3 text-center">
              <Link href="/apply" className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 text-small font-display font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast">
                გახდი პირველი ექსპერტი
              </Link>
            </div>
          </div>
        ) : (
          /* Column count follows the CARD COUNT — the same rule the
             /categories index uses. A fixed 3-up left two experts as a row with
             a third of it empty, which is the normal case while spheres are
             still filling, not an edge one. */
          <div className={`mt-10 grid gap-4 ${experts.length <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {experts.map(t => {
              const name = t.user?.fullName ?? 'ექსპერტი'
              const rating = typeof t.rating === 'number' ? t.rating : 0
              const price = typeof t.price === 'number' ? t.price : null
              return (
                <Link key={t.id} href={`/tutors/${t.slug || t.id}`} className="group rounded-card border border-ink-200 bg-white p-5 flex flex-col hover-lift transition-all duration-fast">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {/* lazy + intrinsic size: the grid sits below the fold and
                        avatars are remote, so without these they compete with
                        the LCP paint and reserve no box until they land. */}
                    <img src={t.user?.avatarUrl || DEFAULT_AVATAR} alt={name} loading="lazy" decoding="async" width={56} height={56} className="w-14 h-14 rounded-full object-cover ring-1 ring-ink-200" />
                    <div className="min-w-0">
                      <div className="font-display text-body-lg font-bold text-ink-900 truncate group-hover:text-brand-700 transition-colors duration-fast">{name}</div>
                      {t.specialty && <div className="text-meta text-ink-500 truncate">{t.specialty}</div>}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between text-meta">
                    <span className="inline-flex items-center gap-1 text-ink-600">
                      {rating > 0 ? <><Icon.star className="w-3.5 h-3.5 text-warning-500" /> {rating.toFixed(1)}</> : <span className="text-ink-400">ახალი</span>}
                    </span>
                    {price != null && <span className="font-display font-bold text-ink-900 tabular-nums">₾{price}</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <div className="mt-12">
          <Link href="/tutors" className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 text-body font-semibold text-brand-700 hover:underline">ყველა კატეგორიის ექსპერტი <Icon.arrow className="w-3.5 h-3.5" /></Link>
        </div>

        {/* Cross-links to the profession pages for this sphere. The two keyword
            families („საგადასახადო კონსულტაცია" vs „ბუღალტერთან კონსულტაცია")
            are separate search intents on separate URLs — linking them tells a
            crawler they're related rather than duplicates. Renders nothing for
            spheres that have no profession page yet. */}
        {related.length > 0 && (
          <section className="mt-14">
            <Eyebrow className="mb-4">კონკრეტული სპეციალისტი</Eyebrow>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {related.map(p => (
                <li key={p.slug}>
                  <Link href={`/konsultacia/${p.slug}`} className="text-body text-ink-600 hover:text-brand-700 transition-colors duration-fast">
                    {p.keyword}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Related reading. The posts already link DOWN to this page; this is
            the return leg, which is what makes the two a cluster rather than a
            one-way funnel — and it gets each post crawled from a second URL. */}
        {posts.length > 0 && (
          <section className="mt-14">
            <Eyebrow className="mb-4">სტატიები ამ სფეროზე</Eyebrow>
            <ul className="space-y-3">
              {posts.map(post => (
                <li key={post.slug}>
                  <Link href={`/blog/${post.slug}`} className="group block rounded-card border border-ink-200 bg-white p-4 hover-lift transition-all duration-fast">
                    <div className="font-display text-body-lg font-bold text-ink-900 leading-snug group-hover:text-brand-700 transition-colors duration-fast">{post.title}</div>
                    {post.excerpt && <p className="mt-1.5 text-small text-ink-600 leading-relaxed line-clamp-2">{post.excerpt}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Keyword-targeted FAQ — matches the /help accordion pattern, feeds the
            FAQPage JSON-LD above. Placed below the expert list so it doesn't push
            the real supply down. */}
        <section className="mt-16 lg:mt-20">
          <Eyebrow className="mb-4">ხშირად დასმული კითხვები</Eyebrow>
          <div className="rounded-card border border-ink-200 bg-white divide-y divide-ink-200">
            {seo.faq.map((f, i) => (
              <details key={i} className="group">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none gap-4">
                  <span className="text-body-lg font-display font-semibold text-ink-900 leading-snug">{f.q}</span>
                  <Icon.chevD className="w-4 h-4 text-ink-500 group-open:rotate-180 transition-transform duration-fast shrink-0" />
                </summary>
                {/* No `max-w-prose` inside a card that is already capped by
                    its container — see app/help. Capping both wraps the answer
                    at ~half the panel and leaves a column of white beside every
                    line. Cap the container OR the text, never both. */}
                <div className="px-5 pb-5 text-body text-ink-600 leading-relaxed">{f.a}</div>
              </details>
            ))}
          </div>
        </section>
      </Container>

      <Footer />
    </div>
  )
}
