import Link from 'next/link'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { jsonLdString } from '@/lib/jsonLd'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { ROLE } from '@/lib/roles'

// Public „გახდი ექსპერტი" page — what a SIGNED-OUT visitor (and Googlebot)
// sees at /join.
//
// WHY IT EXISTS: /apply used to call requireRole([ROLE.CLIENT]) in its layout, so
// a guest was bounced to /signin. That meant the page could never be crawled,
// its metadata was dead, and „გახდი ექსპერტი / კონსულტანტი ვაკანსია" — real
// search intent, and the exact intent this marketplace most needs to capture —
// had no landing page at all. The FORM is still gated; only this view is not.
//
// HONESTY (CLAUDE.md): payments are not live. Nothing here may promise earnings
// in the present tense while PAYMENTS_LIVE is false — every money statement
// below is gated on that flag, the same way the home page does it.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

/* STEPS / WHO / FAQ used to be module constants. They are now built from the
   SiteText map INSIDE the component, for one reason beyond editability: the FAQ
   also feeds the FAQPage JSON-LD below. Left as constants, an admin edit would
   change the visible answer while the structured data kept serving the old one
   — a mismatch Google treats as a reason to drop the rich result, and nothing
   in the app would have reported it. One source, both consumers. */

export async function ApplyMarketing() {
  const map = await getSiteTextMap()
  const t = (k: string) => map[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''

  const STEPS = [1, 2, 3].map(n => ({ n, t: t(`apply.how.step${n}.title`), d: t(`apply.how.step${n}.desc`) }))
  // One profession per line; blank lines are ignored so the list length is
  // edited with the Enter key rather than with a deploy.
  const WHO = t('apply.who.list').split('\n').map(x => x.trim()).filter(Boolean)
  const FAQ: { q: string; a: string }[] = [
    { q: t('apply.faq.q1'), a: t('apply.faq.a1') },
    { q: t('apply.faq.q2'), a: t('apply.faq.a2') },
    { q: t('apply.faq.q3'), a: t('apply.faq.a3') },
    // The money question became editable 2026-08-05: its commission figure was
    // removed (owner), and with it the PAYMENTS_LIVE branch + COMMISSION_PCT
    // template that had kept it in code. ⚠ It no longer follows the flag —
    // re-type both halves in the admin panel the day paid bookings ship.
    { q: t('apply.faq.q6'), a: t('apply.faq.a6') },
    { q: t('apply.faq.q4'), a: t('apply.faq.a4') },
    { q: t('apply.faq.q5'), a: t('apply.faq.a5') },
  ]

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faqLd) }} />
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

        <section className="mt-16 lg:mt-20">
          <Eyebrow className="mb-4">{t('apply.how.eyebrow')}</Eyebrow>
          <ol className="grid sm:grid-cols-3 gap-4">
            {STEPS.map(s => (
              <li key={s.n} className="rounded-card border border-ink-200 bg-white p-5">
                <div className="w-8 h-8 rounded-full bg-brand-600 text-white inline-flex items-center justify-center font-display text-small font-bold tabular-nums mb-3">
                  {s.n}
                </div>
                <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight leading-snug">{s.t}</div>
                <p className="mt-2 text-small text-ink-600 leading-relaxed">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16">
          <Eyebrow className="mb-4">{t('apply.who.eyebrow')}</Eyebrow>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {WHO.map(w => (
              <li key={w} className="flex items-start gap-2.5 text-body text-ink-700 leading-relaxed">
                <Icon.check className="w-4 h-4 text-brand-600 mt-1 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-small text-ink-600 leading-relaxed">
            {t('apply.who.note')}
          </p>
        </section>

        <section className="mt-16">
          <Eyebrow className="mb-4">{t('apply.get.eyebrow')}</Eyebrow>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { t: t('apply.get.card1.title'), d: t('apply.get.card1.body') },
              { t: t('apply.get.card2.title'), d: t('apply.get.card2.body') },
              { t: t('apply.get.card3.title'), d: t('apply.get.card3.body') },
              {
                // „გადახდები — მალე" is roadmap status in a slot that promises
                // the applicant something they GET. What they actually get today
                // is all of it. Editable since 2026-08-05 — see apply.faq.a6 for
                // the same ⚠ about PAYMENTS_LIVE.
                t: t('apply.get.card4.title'),
                d: t('apply.get.card4.body'),
              },
            ].map(x => (
              <div key={x.t} className="rounded-card border border-ink-200 bg-white p-5">
                <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{x.t}</div>
                <p className="mt-1.5 text-small text-ink-600 leading-relaxed">{x.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 lg:mt-20">
          <Eyebrow className="mb-4">{t('apply.faq.eyebrow')}</Eyebrow>
          <div className="rounded-card border border-ink-200 bg-white divide-y divide-ink-200">
            {FAQ.map((f, i) => (
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
