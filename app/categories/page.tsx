import Link from 'next/link'
import { pageMetadata } from '@/lib/pageSeo'
import { socialMeta } from '@/lib/seo'
import { jsonLdString } from '@/lib/jsonLd'
import { prisma } from '@/lib/prisma'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Reveal } from '@/components/Reveal'
import { Footer } from '@/components/Footer'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { categoryIcon } from '@/lib/categoryMarks'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { SiteText } from '@/components/SiteTextProvider'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
export const generateMetadata = () => pageMetadata('categories', '/categories')

// Server component — Prisma-fed, no client JS needed for the browse view.
// MUST stay force-dynamic. This page queries the DB (category counts), and on
// Railway the DB (postgres.railway.internal) is ONLY reachable at runtime inside
// the container — NOT during `next build`. Any static/ISR mode makes Next
// prerender this at build time, which fails with "Can't reach database server"
// and ships a broken static page. force-dynamic defers the query to runtime.
// (Same constraint applies to every DB-querying page — never statically render one.)
export const dynamic = 'force-dynamic'

// The icon map that used to live here is GONE (2026-07-31). It pointed at the
// generic UI set (graph/wallet/heart/…), covered seven of fifteen slugs and
// dropped the rest onto one fallback glyph — measured: fifteen cards, six
// distinct drawings. The hand-drawn category marks in lib/categoryMarks are now
// the single source, shared with the home grid, so a category can no longer
// wear two different faces depending on which page you are looking at.

// THE „კონსულტაცია / მენტორინგი" PILL IS GONE (2026-07-31), and must not come
// back while the product sells one thing.
//
// It rendered `Category.defaultServiceType`, which eight of fifteen spheres
// carried as RECURRING → „მენტორინგი". Measured before removing it: every
// booking in the database is CONSULTATION, no service carries a recurring
// price or duration, and /categories/marketing — a sphere the index badged
// „მენტორინგი" — contains the word „კონსულტაცია" 33 times and „მენტორინგი"
// zero. The badge promised an offering the very next page contradicts, which
// is the same failure as the subscription page that was removed for it.
//
// `defaultServiceType` still exists in the schema and in the admin toggle; it
// simply is not a public claim. If recurring engagements ever ship, the label
// comes back attached to something a visitor can actually buy.

export default async function CategoriesPage() {
  // Resolved here rather than through <SiteText> because these three strings
  // are PROPS on <EmptyState>, not children — a component can't render a client
  // context leaf into a plain `string` prop.
  const map = await getSiteTextMap()
  const t = (k: string) => map[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''
  const cats = await prisma.category.findMany({
    where: { isLive: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      icon: true,
      defaultServiceType: true,
      // Count only PUBLICLY VISIBLE experts so the „X ექსპერტი" trust number
      // matches what clicking through actually shows. The three gates MUST stay
      // in step with lib/tutorsQuery: available (not self-paused), not
      // admin-suspended, and — added 2026-07-31 — at least one service, because
      // a serviceless expert is hidden from browse and counting them here would
      // promise a person the destination then withholds. Same drift that made
      // the home page say „10 ექსპერტი" over a 9-expert list.
      _count: {
        select: {
          tutors: {
            where: {
              available: true,
              user: { is: { suspendedAt: null } },
              consultations: { some: {} },
            },
          },
        },
      },
    },
  })

  // Split the roster by whether the sphere can actually be entered today.
  // 11 of the 15 live categories have nobody in them, and every one of those
  // rendered a full-weight card — same size, same icon plate, same hairline —
  // whose entire payload was the words „მალე დაემატება". Four screens of
  // identical cards where the eye can find no signal, and the page as a whole
  // read as an apology rather than as a directory. Populated spheres stay cards;
  // the rest keep their links (they are real, indexable landing pages) but as
  // one quiet line, which is the weight a „not yet" deserves.
  const populated = cats.filter(c => c._count.tutors > 0)
  const upcoming = cats.filter(c => c._count.tutors === 0)

  // CollectionPage + ItemList: tells a crawler this URL IS the index of the
  // sphere pages, and names each one. Without it the page was structurally
  // anonymous — /konsultacia (the sibling index) had this from day one.
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'სფეროები — მცოდნე',
    url: `${SITE_URL}/categories`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: cats.length,
      itemListElement: cats.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/categories/${c.slug}`,
        name: c.name,
      })),
    },
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'სფეროები' },
    ],
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <MarketingTopBar />

      <Container as="main" className="py-12 lg:py-16">
        {/* Hero */}
        <section className="max-w-[720px] mb-10 lg:mb-12">
          <Eyebrow className="mb-3">
            სფეროები
          </Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            <SiteText k="categories.hero.title" />
          </h1>
          <p className="mt-4 text-body-lg text-ink-600 leading-relaxed">
            <SiteText k="categories.hero.subtitle" />
          </p>
        </section>

        {/* The whole-catalogue-cold case. The „upcoming spheres" strip further
            down deliberately stays a one-line footnote — putting a 200px
            drawing on the EMPTY spheres would give them more visual weight than
            the populated ones, the opposite of what that section is for. */}
        {populated.length === 0 ? (
          <EmptyState
            illustration="categoryComingSoon"
            icon={<Icon.category className="w-6 h-6" />}
            title={t('categories.empty.title')}
            description={t('categories.empty.body')}
            cta={{ label: t('categories.empty.cta'), href: '/tutors' }}
          />
        ) : (
          /* Column count follows the CARD COUNT. A fixed 3-up left four cards
             as „three and a lonely one", with two thirds of the second row
             empty — the site has nine experts across four live spheres, so
             that is the normal case, not an edge one. Two columns fill; a
             single card doesn't stretch to full width either. */
          <Reveal
            stagger
            className={`grid gap-4 lg:gap-5 ${
              populated.length === 1 ? 'grid-cols-1 max-w-[420px]'
              : populated.length <= 4 ? 'grid-cols-1 sm:grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {populated.map(c => {
              const tutorCount = c._count.tutors
              return (
                <Link
                  key={c.id}
                  href={`/categories/${encodeURIComponent(c.slug)}`}
                  className="group relative flex flex-col overflow-hidden rounded-card border border-ink-200 bg-white p-5 lg:p-6 shadow-xs hover-lift hover:border-brand-200 motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  {/* Brand accent hairline — reveals on hover for a subtle premium cue. */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand-500 transition-transform duration-mid ease-out-quart group-hover:scale-x-100"
                  />

                  <div className="mb-5">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-btn bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-900/[0.04] shadow-xs transition-all duration-mid ease-out-quart group-hover:text-brand-700 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-105">
                      {categoryIcon(c.slug, 'w-6 h-6')}
                    </div>
                  </div>

                  <div className="font-display text-h3 lg:text-h2 font-bold text-ink-900 tracking-tight leading-tight transition-colors duration-mid group-hover:text-brand-700">
                    {c.name}
                  </div>

                  {/* Expert count — a trust signal, so the number carries the
                      weight. The old „მალე დაემატება" branch that lived here is
                      gone: an empty sphere no longer reaches this grid at all
                      (see the populated/upcoming split above), so every card in
                      it has a real number to show. */}
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-h1 font-bold text-ink-900 tabular-nums leading-none">
                      {tutorCount}
                    </span>
                    <span className="text-small text-ink-500">ექსპერტი</span>
                  </div>

                  <div className="mt-5 pt-4 border-t border-ink-100">
                    {/* `transition-all group-hover:gap-2.5` removed 2026-07-29 —
                        a gap on a single-child flex container animates nothing;
                        it was `transition-all` paying for a no-op every hover. */}
                    <span className="inline-flex items-center gap-1.5 text-small font-display font-semibold text-brand-700">
                      ნახე ექსპერტები
                    </span>
                  </div>
                </Link>
              )
            })}
          </Reveal>
        )}

        {/* Spheres with nobody in them yet. Still linked — each is a real,
            indexable landing page, and someone who wants „ფინანსები" should be
            able to reach it and see the honest state — but at the weight of a
            footnote instead of eleven cards. Rendered only when at least one
            sphere IS populated; on a completely cold catalogue the EmptyState
            above is the whole answer and this would contradict it. */}
        {populated.length > 0 && upcoming.length > 0 && (
          <Reveal delay={120} className="mt-10 lg:mt-12 border-t border-ink-100 pt-6">
            <Eyebrow tone="muted" className="mb-3"><SiteText k="categories.emptySpheres.eyebrow" /></Eyebrow>
            <p className="text-small text-ink-500 leading-[1.7]">
              {upcoming.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && <span aria-hidden className="text-ink-300"> · </span>}
                  <Link
                    href={`/categories/${encodeURIComponent(c.slug)}`}
                    className="text-ink-600 hover:text-brand-700 transition-colors duration-fast"
                  >
                    {c.name}
                  </Link>
                </span>
              ))}
            </p>
            {/* No „გახდი ექსპერტი" CTA here on purpose: this is a server
                component, so it cannot run <ApplyCtaGate>, and an ungated apply
                link is exactly what showed „გახდი ექსპერტი" to people who
                already are one (see the 2026-07-22 role-correctness fix). The
                footer carries the gated one. */}
            <p className="mt-3 text-meta text-ink-500">
              ამ სფეროებში ექსპერტებს ჯერ ვარჩევთ.
            </p>
          </Reveal>
        )}
      </Container>

      <Footer />
    </div>
  )
}
