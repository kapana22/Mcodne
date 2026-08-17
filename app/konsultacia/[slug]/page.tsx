import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'
import { queryTutors } from '@/lib/tutorsQuery'
import { primaryPrice } from '@/components/booking/slots'
import { categorySeo, fallbackSeo } from '@/lib/categorySeo'
import { professions, professionBySlug } from '@/lib/professionSeo'
import { jsonLdString } from '@/lib/jsonLd'
import { socialMeta } from '@/lib/seo'

// Profession-level SEO landing page — /konsultacia/[slug].
//
// Targets the „<პროფესია>-თან კონსულტაცია" head terms, which are a separate
// search intent from the sphere terms /categories/[slug] owns (see the long
// note at the top of lib/professionSeo.ts). Content is static and lives in
// code; only the expert grid touches the DB.
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// NO generateStaticParams here, deliberately. Adding it flipped this route to
// SSG in the build output even alongside `dynamic = 'force-dynamic'` — which
// would bake the expert grid at BUILD time, and Railway's build container can't
// reach the DB (same trap documented in app/sitemap.ts). Every page would have
// shipped a permanently empty expert list. The slug set is validated at request
// time against professionBySlug instead; unknown slugs still 404.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = professionBySlug[slug]
  if (!p) return { title: 'კონსულტაცია — მცოდნე' }
  return {
    // ≤60 chars: the old „<keyword> ონლაინ — დაჯავშნე ვიდეოსესია | მცოდნე"
    // ran 61–71 and Google cut the tail, sometimes mid-word.
    title: `${p.keyword} ონლაინ | მცოდნე`,
    description: p.metaDescription,
    alternates: { canonical: `${SITE_URL}/konsultacia/${p.slug}` },
    ...socialMeta({
      title: `${p.keyword} | მცოდნე`,
      description: p.metaDescription,
      url: `/konsultacia/${p.slug}`,
    }),
  }
}

export default async function ProfessionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = professionBySlug[slug]
  if (!p) notFound()

  // Supply is genuinely allowed to be zero here — the catalog fills in sphere by
  // sphere — so a failed/empty query is an empty state, never an error page.
  const experts = await queryTutors({ category: p.categorySlug, limit: 24 }).catch(() => [])
  const sphere = categorySeo[p.categorySlug] ?? fallbackSeo(p.categorySlug)

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'კონსულტაციები', item: `${SITE_URL}/konsultacia` },
      { '@type': 'ListItem', position: 3, name: p.keyword },
    ],
  }
  // Service (not CollectionPage): this page describes a bookable service — the
  // consultation with this kind of specialist — and the expert list is evidence
  // of it, not the page's subject.
  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: p.keyword,
    serviceType: p.label,
    description: p.metaDescription,
    url: `${SITE_URL}/konsultacia/${p.slug}`,
    areaServed: { '@type': 'Country', name: 'Georgia' },
    provider: { '@type': 'Organization', name: 'მცოდნე', url: SITE_URL },
    // Delivered over video, never on premises — the correct schema signal for a
    // fully remote service.
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: `${SITE_URL}/konsultacia/${p.slug}`,
      availableLanguage: { '@type': 'Language', name: 'Georgian', alternateName: 'ka' },
    },
  }
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faqLd) }} />
      <MarketingTopBar />

      {/* size="content" — see the note in app/categories/[slug]: every
          section here is capped ~760 too, so a 1280 shell only produced an
          empty right-hand column. */}
      {/* The standard section rhythm, matching /konsultacia — a landing page
          and its index reading at two different rhythms is drift, not design. */}
      <Container as="main" size="content" className="py-12 lg:py-16">
        <nav className="flex items-center gap-1.5 text-meta text-ink-400 mb-5">
          <Link href="/" className="tap-area hover:text-ink-700">მთავარი</Link>
          <span>/</span>
          <Link href="/konsultacia" className="tap-area hover:text-ink-700">კონსულტაციები</Link>
          <span>/</span>
          <span className="text-ink-600">{p.label}</span>
        </nav>

        <div>
          <Eyebrow className="mb-3">ონლაინ კონსულტაცია</Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            {p.keyword}
          </h1>
          <p className="mt-5 text-h3 text-ink-600 leading-relaxed">{p.intro}</p>
        </div>

        {/* „როდის ღირს მიმართვა" — the section that makes this page answer a
            different question than the sphere page it sits beside. */}
        <section className="mt-12">
          {/* labelWith / labelPlural, never `label + suffix` — Georgian declines
              by stem change, so „ბუღალტერი"+„თან" yields the non-word
              „ბუღალტერითან" (and +„ები" yields „ბუღალტერიები"). */}
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">როდის ღირს {p.labelWith} მიმართვა</h2>
          <ul className="mt-5 space-y-3">
            {p.when.map((w, i) => (
              <li key={i} className="flex items-start gap-3 text-body-lg text-ink-700 leading-relaxed">
                <Icon.check className="w-4 h-4 text-brand-600 mt-1.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight mb-6">
            {p.labelPlural} მცოდნეზე
          </h2>
          {experts.length === 0 ? (
            <div className="max-w-[560px]">
              <EmptyState
                illustration="categoryComingSoon"
                icon={<Icon.users className="w-6 h-6" />}
                title={`${p.label} ჯერ არ დარეგისტრირებულა`}
                description="ბაზა თანდათან ივსება. სანამ ელოდები, გადახედე სხვა სფეროების ექსპერტებს."
                cta={{ label: 'ნახე ყველა ექსპერტი', href: '/tutors' }}
              />
              <div className="mt-3 text-center">
                <Link href="/apply" className="inline-flex items-center gap-1.5 text-small font-display font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast">
                  გახდი პირველი {p.label} მცოდნეზე
                </Link>
              </div>
            </div>
          ) : (
            <div className={`grid gap-4 ${experts.length <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {experts.map(t => {
                const name = t.user?.fullName ?? 'ექსპერტი'
                const rating = typeof t.rating === 'number' ? t.rating : 0
                // The FLAGSHIP service's price, never the flat rate — the same
                // shared rule /tutors, the profile and the home grid use. The
                // two differ for any expert who set one and priced the other.
                const price = primaryPrice(t.consultations ?? [], typeof t.price === 'number' ? t.price : 0) || null
                return (
                  <Link key={t.id} href={`/tutors/${t.slug || t.id}`} className="group rounded-card border border-ink-200 bg-white p-5 flex flex-col hover-lift transition-all duration-fast">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {/* Same reasoning as /categories/[slug]: below-fold,
                          remote, so lazy + an intrinsic box. */}
                      <img src={t.user?.avatarUrl || DEFAULT_AVATAR} alt={name} loading="lazy" decoding="async" width={56} height={56} className="w-14 h-14 rounded-full object-cover ring-1 ring-ink-200" />
                      <div className="min-w-0">
                        <div className="font-display text-body-lg font-bold text-ink-900 truncate group-hover:text-brand-700 transition-colors duration-fast">{name}</div>
                        {/* The CATEGORY, not `specialty` — every card on this
                            page is already inside one sphere, and `specialty`
                            is a frozen copy of the category name from approval
                            day that contradicts it after a rename. */}
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
        </section>

        {/* Cross-link to the sphere page. This is the pair that keeps the two
            keyword families connected instead of competing.
            GUARDED on there being experts (2026-08-11): a profession page whose
            `categorySlug` no longer resolves — twelve empty sub-categories were
            retired once professions replaced them — would link straight to a
            404. `experts.length > 0` is the honest proxy: the category exists
            and has somebody in it, which is also the only case where „see the
            whole sphere" leads anywhere worth going. */}
        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2">
          {experts.length > 0 && (
            <Link href={`/categories/${p.categorySlug}`} className="tap-area inline-flex items-center gap-1.5 text-body font-semibold text-brand-700 hover:underline">
              {sphere.keyword} <Icon.arrow className="w-3.5 h-3.5" />
            </Link>
          )}
          <Link href="/tutors" className="tap-area inline-flex items-center gap-1.5 text-body font-semibold text-ink-700 hover:underline">
            ყველა ექსპერტი
          </Link>
        </div>

        <section className="mt-16 lg:mt-20">
          <Eyebrow className="mb-4">ხშირად დასმული კითხვები</Eyebrow>
          <div className="rounded-card border border-ink-200 bg-white divide-y divide-ink-200">
            {p.faq.map((f, i) => (
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

        {/* Sibling professions — a crawl path between every page in the set, so
            a crawler that lands on one reaches all ten. */}
        <section className="mt-16">
          <Eyebrow className="mb-4">სხვა სპეციალისტები</Eyebrow>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {professions.filter(o => o.slug !== p.slug).map(o => (
              <li key={o.slug}>
                <Link href={`/konsultacia/${o.slug}`} className="text-small text-ink-600 hover:text-brand-700 transition-colors duration-fast">
                  {o.keyword}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Container>

      <Footer />
    </div>
  )
}
