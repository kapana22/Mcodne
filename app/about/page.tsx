import Link from 'next/link'
import { pageMetadata } from '@/lib/pageSeo'
import { socialMeta } from '@/lib/seo'
import { jsonLdString } from '@/lib/jsonLd'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { SiteText } from '@/components/SiteTextProvider'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
// Metadata now reads the editable SEO text from the database, so this page
// must render per request. Built statically it would bake whatever the
// defaults were at BUILD time — and Railway's builder cannot reach the DB,
// so that means the code defaults forever, whatever the admin types.
export const dynamic = 'force-dynamic'

export const generateMetadata = () => pageMetadata('about', '/about')

const VALUES = [
  {
    icon: <Icon.shield className="w-5 h-5" />,
    titleKey: 'about.value1.title',
    bodyKey: 'about.value1.body',
    title: 'გადამოწმებული ცოდნა',
    body: 'ხელით ვამოწმებთ გამოცდილებას, პორტფოლიოსა და რეპუტაციას.',
  },
  {
    icon: <Icon.wallet className="w-5 h-5" />,
    titleKey: 'about.value2.title',
    bodyKey: 'about.value2.body',
    title: 'გამჭვირვალე ფასი',
    // Honest posture — payments are not live yet, so escrow is framed as the
    // coming model (same „მალე" note as the home page), not a live fact.
    body: 'ერთი ფასი, გადახდა დაჯავშნისას. დაცული გადახდები — მალე.',
  },
  {
    icon: <Icon.clock className="w-5 h-5" />,
    titleKey: 'about.value3.title',
    bodyKey: 'about.value3.body',
    title: 'ღირებული დრო',
    body: 'ფასი წინასწარ ცნობილია. სესია სტრუქტურული და შედეგზე ორიენტირებული.',
  },
  {
    icon: <Icon.users className="w-5 h-5" />,
    titleKey: 'about.value4.title',
    bodyKey: 'about.value4.body',
    title: 'ქართული საზოგადოება',
    body: 'ცოდნა ქართულად — ბიზნესი, სამართალი, კარიერა, ფსიქოლოგია.',
  },
]

export default function AboutPage() {
  // AboutPage + the Organization it describes. This page is where a search
  // engine expects to find the entity behind the site — it was the only public
  // marketing page emitting no structured data at all.
  const aboutLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'ჩვენს შესახებ — მცოდნე',
    url: `${SITE_URL}/about`,
    inLanguage: 'ka',
    mainEntity: {
      '@type': 'Organization',
      name: 'მცოდნე',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      areaServed: { '@type': 'Country', name: 'Georgia' },
      description: 'ქართული ექსპერტ-კონსულტაციის პლატფორმა — ონლაინ ვიდეოსესიები ხელით შერჩეულ სპეციალისტებთან.',
      // `sameAs` is intentionally absent until real social profiles exist —
      // a guessed or empty array is a worse signal than none.
    },
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'ჩვენს შესახებ' },
    ],
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(aboutLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <MarketingTopBar />

      <Container as="main" size="wide" className="py-16 lg:py-24">
        <div className="max-w-[720px]">
          <Eyebrow className="mb-3">
            ჩვენს შესახებ
          </Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05] motion-safe:animate-rise-in">
            <SiteText k="about.hero.title" />
          </h1>
          <p className="mt-6 text-h3 text-ink-600 leading-relaxed">
            <SiteText k="about.hero.body" />
          </p>
        </div>

        <section className="mt-20 pt-10 border-t border-ink-200">
          <Reveal>
            <Eyebrow className="mb-3">
              რას გვჯერა
            </Eyebrow>
            <h2 className="font-display text-h1 font-bold text-ink-900 tracking-tight"><SiteText k="about.principles.title" /></h2>
          </Reveal>
          {/* Reveal-stagger (scroll-triggered) instead of load-time .stagger,
              which finished animating long before the user scrolled here. */}
          <Reveal stagger className="mt-8 grid sm:grid-cols-2 gap-4">
            {VALUES.map(v => (
              <div key={v.title} className="rounded-card border border-ink-200 bg-white p-6 hover-lift">
                <div className="w-10 h-10 rounded-btn bg-brand-50 text-brand-700 flex items-center justify-center">
                  {v.icon}
                </div>
                <div className="font-display text-h3 font-bold text-ink-900 mt-4"><SiteText k={v.titleKey} /></div>
                <p className="mt-2 text-body text-ink-600 leading-relaxed"><SiteText k={v.bodyKey} /></p>
              </div>
            ))}
          </Reveal>
        </section>

        <Reveal>
        <section className="mt-20 grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16">
          <div>
            <Eyebrow className="mb-3">
              რას ვქმნით
            </Eyebrow>
            <h2 className="font-display text-h1 font-bold text-ink-900 tracking-tight leading-tight">
              <SiteText k="about.create.title" />
            </h2>
          </div>
          <div className="space-y-5 text-body-lg text-ink-700 leading-relaxed">
            <p>
              <SiteText k="about.create.p1" />
            </p>
            <p>
              <SiteText k="about.create.p2" />
            </p>
          </div>
        </section>
        </Reveal>

        <ApplyCtaGate>
        <Reveal>
        <section className="mt-20 rounded-card bg-gradient-dark text-white p-10 lg:p-14 relative overflow-hidden">
          <div className="max-w-[560px] relative z-10">
            <div className="font-display text-micro font-semibold uppercase text-brand-300 mb-3">
              შემოგვიერთდი
            </div>
            <h2 className="font-display text-h1 lg:text-display font-bold tracking-tight leading-tight">
              <SiteText k="about.cta.title" />
            </h2>
            <p className="mt-4 text-body-lg text-white/75 leading-relaxed">
              <SiteText k="about.cta.body" />
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/apply"
                className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast"
              >
                გახდი ექსპერტი
              </Link>
              <Link
                href="/contact"
                className="h-11 px-5 rounded-btn bg-white/10 hover:bg-white/15 text-white font-display font-semibold text-body inline-flex items-center transition-colors duration-fast"
              >
                დაგვიკავშირდი
              </Link>
            </div>
          </div>
        </section>
        </Reveal>
        </ApplyCtaGate>
      </Container>

      <Footer />
    </div>
  )
}
