import Link from 'next/link'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'
import { jsonLdString } from '@/lib/jsonLd'
import type { CategorySeo } from '@/lib/categorySeo'
import { primaryPrice } from '@/components/booking/slots'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

/**
 * The category landing page, drawn once for the two routes that use it:
 * /categories/<sphere> and /categories/<sphere>/<absorbed> (2026-08-10).
 *
 * It was extracted to be SHARED, not to make a file shorter. The nested page
 * exists so an absorbed category keeps the keyword copy, the FAQ and the
 * structured data it already had — a second, drifting copy of this markup
 * would defeat the point on the first edit.
 *
 * Everything that differs between the two is a prop: the name in the H1, the
 * breadcrumb trail, and the canonical path every piece of JSON-LD points at.
 */

/** A breadcrumb step. The last one is the current page and carries no href. */
export type Crumb = { name: string; href?: string }

type Expert = {
  id: string
  slug?: string | null
  specialty?: string | null
  /** The taxonomy label — preferred over `specialty`, which is free text. */
  category?: { name?: string | null } | null
  rating?: number | null
  price?: number | null
  /** Needed to price the FLAGSHIP service rather than the flat rate. */
  consultations?: { minutes: number; price: number; tier?: string }[] | null
  user?: { fullName?: string | null; avatarUrl?: string | null } | null
}

export function CategoryLanding({
  name,
  canonicalPath,
  trail,
  experts,
  posts,
  seo,
  related,
  subPages = [],
}: {
  name: string
  /** Site-relative, e.g. `/categories/business` or `/categories/business/finance`. */
  canonicalPath: string
  /** Steps AFTER „კატეგორიები"; the last is this page. */
  trail: Crumb[]
  experts: Expert[]
  posts: { slug: string; title: string; excerpt?: string | null }[]
  seo: CategorySeo
  related: { slug: string; keyword: string }[]
  /** Absorbed categories that kept a page of their own, nested under this one. */
  subPages?: { path: string; name: string }[]
}) {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'კატეგორიები', item: `${SITE_URL}/categories` },
      ...trail.map((c, i) => ({
        '@type': 'ListItem',
        position: 3 + i,
        name: c.name,
        ...(c.href ? { item: `${SITE_URL}${c.href}` } : {}),
      })),
    ],
  }
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${name} — ექსპერტები`,
    url: `${SITE_URL}${canonicalPath}`,
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
          {trail.map(c => (
            <span key={c.name} className="contents">
              <span>/</span>
              {c.href
                ? <Link href={c.href} className="hover:text-ink-700">{c.name}</Link>
                : <span className="text-ink-600">{c.name}</span>}
            </span>
          ))}
        </nav>

        <div>
          <Eyebrow className="mb-3">კატეგორია</Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            „{name}“ ექსპერტები
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
              // Flagship, not the flat rate — see app/konsultacia/[slug].
              const price = primaryPrice(t.consultations ?? [], typeof t.price === 'number' ? t.price : 0) || null
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
                      {/* Category FIRST, `specialty` only as a fallback — the
                          rule app/konsultacia/[slug] already states: `specialty`
                          is free text an expert typed once, so after a category
                          rename the two contradict each other. Measured
                          2026-08-13: this page said „გადასახადები" for the same
                          expert /konsultacia called „ფინანსები და გადასახადები". */}
                      {(t.category?.name ?? t.specialty) && <div className="text-meta text-ink-500 truncate">{t.category?.name ?? t.specialty}</div>}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between text-meta">
                    <span className="inline-flex items-center gap-1 text-ink-600">
                      {/* An unrated expert renders NOTHING here — the same decision
                          app/tutors/_card.tsx took on 2026-07-31 and wrote down:
                          „a badge earns its place by DISTINGUISHING, and on
                          production it sat on 9 of 9 cards, so it distinguished
                          nobody and instead told every first-time visitor, once
                          per card, that the marketplace is empty."
                          That decision never reached this page. Measured
                          2026-08-13: „ახალი" was on 6 of 6 cards here and 0 of 21
                          on /tutors — and THIS is the page a stranger lands on
                          from Google. */}
                      {rating > 0 && <><Icon.star className="w-3.5 h-3.5 text-warning-500" /> {rating.toFixed(1)}</>}
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

        {/* The categories absorbed into this sphere that kept a page of their
            own. Without this row those pages are ORPHANS: the only thing
            pointing at them would be a 301 and the sitemap, and a page nothing
            links to is a page a crawler reaches last and trusts least. This is
            also the honest reading of the merge — the sphere did not delete
            them, it now contains them. */}
        {subPages.length > 0 && (
          <section className="mt-14">
            <Eyebrow className="mb-4">მიმართულებები</Eyebrow>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {subPages.map(p => (
                <li key={p.path}>
                  <Link href={p.path} className="text-body text-ink-600 hover:text-brand-700 transition-colors duration-fast">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

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
