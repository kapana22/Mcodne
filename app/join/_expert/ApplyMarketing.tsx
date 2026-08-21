import Link from 'next/link'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { jsonLdString } from '@/lib/jsonLd'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { PitchFaqLd, PitchSections } from '../_sections'

// Public „გახდი ექსპერტი" page — what a SIGNED-OUT visitor (and Googlebot)
// sees at /join.
//
// WHY IT EXISTS: /apply used to call requireRole([ROLE.USER]) in its layout, so
// a guest was bounced to /signin. That meant the page could never be crawled,
// its metadata was dead, and „გახდი ექსპერტი / კონსულტანტი ვაკანსია" — real
// search intent, and the exact intent this marketplace most needs to capture —
// had no landing page at all. The FORM is still gated; only this view is not.
//
// HONESTY (CLAUDE.md): payments are not live. Nothing here may promise earnings
// in the present tense while PAYMENTS_LIVE is false — every money statement
// below is gated on that flag, the same way the home page does it.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

/* ⚠️ STEPS / WHO / GET / FAQ MOVED TO `../_sections` (2026-08-20) — they are
   shared with the bare door (`_door/PublicDoor`), which needs exactly the same
   four blocks under its question. They are still SiteText-driven and still
   feed the FAQ JSON-LD from the same array; see that file's header. */

export async function ApplyMarketing() {
  const map = await getSiteTextMap()
  const t = (k: string) => map[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'გახდი ექსპერტი' },
    ],
  }

  // Both CTAs carry ?redirect=/join so signing in lands the person back here —
  // and, being a STUDENT by then, straight into the form.
  const signup = '/signup?redirect=%2Fjoin'
  const signin = '/signin?redirect=%2Fjoin'

  return (
    <div className="min-h-screen bg-white">
      <PitchFaqLd />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <MarketingTopBar />

      {/* `content` (820px), not `wide` (1280px). Every section on this page then
          capped ITSELF at 760px, so the page rendered a 760px column hugging the
          left of a 1280px container with ~520px of dead white down the right —
          the proportions read as a layout that failed rather than one that
          breathes. Cap the container OR the content, never both (same rule as
          app/help). The per-section caps are gone; the container is the measure. */}
      <Container as="main" size="content" className="py-12 lg:py-16">
        <div className="max-w-[720px]">
          <Eyebrow className="mb-3">{t('apply.hero.eyebrow')}</Eyebrow>
          <h1 className="font-display text-display lg:text-display font-bold text-ink-900 tracking-tight leading-[1.05]">
            {t('apply.hero.title')}
          </h1>
          <p className="mt-5 text-h3 text-ink-600 leading-relaxed">
            {t('apply.hero.body')}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={signup}
              className="h-12 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center gap-2 shadow-xs transition-colors duration-fast"
            >
              {t('apply.hero.ctaPrimary')}
            </Link>
            <Link
              href={signin}
              className="h-12 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-400 text-ink-800 font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast"
            >
              {t('apply.hero.ctaSecondary')}
            </Link>
          </div>
          <p className="mt-3 text-meta text-ink-500">
            {t('apply.hero.note')}
          </p>
        </div>

        <PitchSections />

        <section className="mt-16 lg:mt-20">
          <div className="rounded-card border border-ink-200 bg-ink-50/50 p-6 lg:p-8">
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">{t('apply.cta.title')}</h2>
            <p className="mt-2 text-body-lg text-ink-600 leading-relaxed">
              {t('apply.cta.body')}
            </p>
            <Link
              href={signup}
              className="mt-5 h-12 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg inline-flex items-center gap-2 transition-colors duration-fast"
            >
              {t('apply.cta.button')}
            </Link>
          </div>
        </section>
      </Container>

      <Footer />
    </div>
  )
}
