/**
 * /join FOR A GUEST — the pitch AND the question, in that order, on one page.
 *
 * ⚠️ WHAT THIS REPLACED (2026-08-20). A signed-out visitor used to get a pure
 * marketing page whose only action was „create an account". The door's one
 * question — the profession, from which everything about a provider is derived
 * — sat on the far side of that wall. See `GuestDoor` for why the order was
 * inverted; this file is the page that inversion needed.
 *
 * ⚠️ AND IT IS CAPABILITY-NEUTRAL, deliberately. The two pitches that still
 * exist each speak to one half — `_expert/ApplyMarketing` („გახდი ექსპერტი",
 * `?can=CONSULT`) and `_master/_marketing` („დაარეგისტრირე შენი სერვისი",
 * `?can=WORK`) — and both are real landing pages for real search intent, so
 * they stay, crawlable, linked from the footer under their own headings. But
 * the BARE address cannot be either of them: whichever it were, half of the
 * people the site is recruiting would read the first sentence and conclude
 * that this is not for them. The bare door names no half at all; the applicant
 * names their job, and the site works out the rest.
 *
 * The four supporting sections are shared with the consultation pitch
 * (`../_sections`) — one source, so they cannot answer the same question two
 * ways.
 */

import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { jsonLdString } from '@/lib/jsonLd'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { providersOn } from '@/lib/requests'
import { CAPABILITIES, JOIN_DOOR_LABEL, type Capability } from '@/lib/capabilities'
import { PitchFaqLd, PitchSections } from '../_sections'
import { GuestDoor } from './GuestDoor'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export async function PublicDoor({ preset = [] }: { preset?: Capability[] }) {
  const map = await getSiteTextMap()
  const t = (k: string) => map[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''

  // The same gate the signed-in door applies (app/join/page.tsx): the WORK
  // half is not offered while FEATURE_PROVIDERS is off. A guest must not be
  // told they can register a service and then find the half missing after
  // making an account.
  const offer: Capability[] = CAPABILITIES.filter(c => c !== 'WORK' || providersOn())

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: JOIN_DOOR_LABEL },
    ],
  }

  return (
    <div className="min-h-screen bg-white">
      <PitchFaqLd />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <MarketingTopBar />

      {/* `content` (820px), not `wide` — the same measure as the two pitches.
          Cap the container OR the content, never both (see app/help). */}
      <Container as="main" size="content" className="py-12 lg:py-16">
        <div className="max-w-[720px]">
          <Eyebrow className="mb-3">{t('join.hero.eyebrow')}</Eyebrow>
          <h1 className="font-display text-display lg:text-display font-bold text-ink-900 tracking-tight leading-[1.05]">
            {JOIN_DOOR_LABEL}
          </h1>
          <p className="mt-5 text-h3 text-ink-600 leading-relaxed">
            {t('join.hero.body')}
          </p>

          {/* ⚠️ THE QUESTION IS THE HERO'S ACTION — there is no „create an
              account" button above it. That was the wall. */}
          <p className="mt-8 text-body font-display font-semibold text-ink-900">{t('join.hero.ask')}</p>
          <GuestDoor offer={offer} preset={preset.filter(c => offer.includes(c))} />

          <p className="mt-3 text-meta text-ink-500">{t('join.hero.note')}</p>
        </div>

        <PitchSections />
      </Container>

      <Footer />
    </div>
  )
}
