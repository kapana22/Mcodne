import Link from 'next/link'
import { pageMetadata } from '@/lib/pageSeo'
import { socialMeta } from '@/lib/seo'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { SiteText } from '@/components/SiteTextProvider'
import { professions } from '@/lib/professionSeo'
import { jsonLdString } from '@/lib/jsonLd'

// Hub for the profession landing pages. Targets the bare „ონლაინ კონსულტაცია"
// term and, more importantly, gives the ten /konsultacia/[slug] pages a single
// parent that the header, footer and sitemap can all point at.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
// Metadata now reads the editable SEO text from the database, so this page
// must render per request. Built statically it would bake whatever the
// defaults were at BUILD time — and Railway's builder cannot reach the DB,
// so that means the code defaults forever, whatever the admin types.
export const dynamic = 'force-dynamic'

export const generateMetadata = () => pageMetadata('konsultacia', '/konsultacia')

export default function KonsultaciaIndex() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'კონსულტაციები' },
    ],
  }
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ონლაინ კონსულტაცია სპეციალისტთან',
    url: `${SITE_URL}/konsultacia`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: professions.length,
      itemListElement: professions.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/konsultacia/${p.slug}`,
        name: p.keyword,
      })),
    },
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemListLd) }} />
      <MarketingTopBar />

      <Container as="main" size="wide" className="py-12 lg:py-16">
                {/* Hidden below sm — the same rule /tutors, /ask and /tutors/[id] follow.
            Kept in the DOM so crawlers and assistive tech still get the trail. */}
<nav className="hidden sm:flex items-center gap-1.5 text-meta text-ink-400 mb-5">
          <Link href="/" className="hover:text-ink-700">მთავარი</Link>
          <span>/</span>
          <span className="text-ink-600">კონსულტაციები</span>
        </nav>

        <div className="max-w-[720px]">
          <Eyebrow className="mb-3"><SiteText k="konsultacia.eyebrow" /></Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            <SiteText k="konsultacia.title" />
          </h1>
          <p className="mt-5 text-h3 text-ink-600 leading-relaxed">
            <SiteText k="konsultacia.subtitle" />
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {professions.map(p => (
            <Link
              key={p.slug}
              href={`/konsultacia/${p.slug}`}
              className="group rounded-card border border-ink-200 bg-white p-5 sm:p-6 flex flex-col hover-lift transition-all duration-fast"
            >
              <h2 className="font-display text-h3 font-bold text-ink-900 leading-snug group-hover:text-brand-700 transition-colors duration-fast">
                {p.keyword}
              </h2>
              <p className="mt-2 text-small text-ink-600 leading-relaxed line-clamp-3">{p.metaDescription}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-small font-display font-semibold text-brand-700">
                გახსენი <Icon.arrow className="w-3.5 h-3.5" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12">
          <Link href="/categories" className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 text-body font-semibold text-brand-700 hover:underline">
            სფეროების მიხედვით ძებნა <Icon.arrow className="w-3.5 h-3.5" />
          </Link>
        </div>
      </Container>

      <Footer />
    </div>
  )
}
