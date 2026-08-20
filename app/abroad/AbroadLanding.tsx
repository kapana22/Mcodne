// The /abroad landing itself. Mounted by ./page.tsx, which owns the metadata
// and the FEATURE_ABROAD guard — this file assumes it is allowed to render.
//
// AUDIENCE, and why the page looks the way it does: a 40–60-year-old Georgian
// emigrant, on a phone, arriving from a Facebook post. That one sentence decides
// most of the layout:
//   • the three offers are written as the PROBLEM in the reader's own words
//     („მინდობილობა მჭირდება"), not as service categories — they do not know
//     what to call the thing they need, only what is wrong;
//   • every price shows euro next to lari, because a lari figure is not a number
//     this reader can judge;
//   • one path, top to bottom: no filters, no search box, no tabs;
//   • all copy is SiteText, because the wording is the part most likely to need
//     same-day tuning once the first posts run.

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { categorySlugFilter } from '@/lib/categoryTree'
import { ABROAD_SOURCE_CATEGORY_SLUGS, eurLabel, gelFromSiteText } from '@/lib/abroad'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { avatarSrc } from '@/lib/avatarSrc'
import { fmtRating } from '@/lib/fmt'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Container } from '@/components/Container'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Avatar, VerifiedMark } from '@/components/Avatar'
import { SiteText } from '@/components/SiteTextProvider'
import { primaryPrice } from '@/components/booking/slots'

type AbroadExpert = {
  id: string
  slug: string | null
  headline: string
  specialty: string
  price: number
  rating: number
  reviewsCount: number
  verified: boolean
  fullName: string
  avatar: string | null
}

/** The three offer cards. Copy + lari price come from SiteText; this array only
 *  binds a key prefix to its icon and to the code default the price falls back
 *  to when the SiteText value is unparseable. */
const OFFERS = [
  { n: 1, Glyph: Icon.doc, fallbackGel: 120 },
  { n: 2, Glyph: Icon.money, fallbackGel: 150 },
  // Card 3 is „coming home / career", not school tutoring — see the comment on
  // the abroad.card3.* keys in lib/siteTextDefs.
  { n: 3, Glyph: Icon.briefcase, fallbackGel: 150 },
] as const

const STEPS = [1, 2, 3] as const

async function loadExperts(): Promise<AbroadExpert[]> {
  try {
    await ensureDbReady()
    const rows = await prisma.tutorProfile.findMany({
      // Experts from the categories this offering is built on — see
      // ABROAD_SOURCE_CATEGORY_SLUGS for why this is a VIEW over existing
      // categories and not a `diaspora` category of its own. Nobody is moved,
      // so nothing changes in the public catalog.
      //
      // The rest is exactly the public catalog's visibility rule
      // (lib/tutorsQuery): a self-paused or admin-suspended expert must
      // disappear from here too, or the landing page advertises someone who
      // cannot be booked.
      where: {
        category: categorySlugFilter(ABROAD_SOURCE_CATEGORY_SLUGS),
        available: true,
        user: { is: { suspendedAt: null } },
      },
      orderBy: [{ verified: 'desc' }, { rating: 'desc' }],
      take: 8,
      select: {
        id: true,
        slug: true,
        headline: true,
        specialty: true,
        price: true,
        // Needed to price the FLAGSHIP service rather than the flat rate — the
        // shared rule every other expert surface follows (components/booking
        // /slots → primaryPrice). Without it this page would ship the „one
        // expert, two prices" bug the moment FEATURE_ABROAD is switched on.
        consultationDurationMin: true,
        consultations: { select: { minutes: true, price: true, tier: true } },
        rating: true,
        reviewsCount: true,
        verified: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        // The label the rest of the site shows. `specialty` alone made this
        // page say „ბიზნესი" about an expert whose card says „ბიზნესი და
        // ფინანსები" — it is a frozen copy of the category name from approval
        // day, kept only as the fallback for an expert who has no category.
        category: { select: { name: true } },
      },
    })
    return rows.map(r => ({
      id: r.id,
      slug: r.slug,
      headline: r.headline,
      specialty: r.category?.name ?? r.specialty,
      price: primaryPrice(r.consultations ?? [], r.price),
      rating: r.rating,
      reviewsCount: r.reviewsCount,
      verified: r.verified,
      fullName: r.user.fullName,
      // NEVER the raw stored value: avatars are base64 in Postgres, and passing
      // one through a list payload is half a megabyte of uncacheable HTML.
      avatar: avatarSrc(r.user.id, r.user.avatarUrl),
    }))
  } catch {
    // A DB blip renders the page with no expert section rather than a 500 —
    // but NOT with the „list is being prepared" empty state, which would be a
    // failure dressed up as an absence (a-11y/failure-states rule, 2026-08-01).
    return []
  }
}

export async function AbroadLanding() {
  const [texts, experts] = await Promise.all([getSiteTextMap(), loadExperts()])
  const t = (k: string) => texts[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''

  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-wash border-b border-ink-100">
        <Container className="py-16 lg:py-24">
          <div className="max-w-[720px]">
            <Eyebrow>დიასპორა</Eyebrow>
            <h1 className="mt-3 font-display text-h1 sm:text-display lg:text-display-lg font-bold text-ink-900">
              <SiteText k="abroad.hero.title" />
            </h1>
            <p className="mt-5 text-body-lg text-ink-600 max-w-[560px]">
              <SiteText k="abroad.hero.subtitle" />
            </p>
            <div className="mt-8">
              <Btn href="#experts" variant="hero" size="lg">
                {t('abroad.hero.cta')}
              </Btn>
            </div>
          </div>
        </Container>
      </section>

      {/* ── The three offers ─────────────────────────────────────────────── */}
      <section className="py-16 lg:py-24">
        <Container>
          <h2 className="font-display text-h2 sm:text-display font-bold text-ink-900">
            <SiteText k="abroad.cards.title" />
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {OFFERS.map(({ n, Glyph, fallbackGel }) => {
              const gel = gelFromSiteText(t(`abroad.card${n}.priceGel`), fallbackGel)
              return (
                // min-w-0 is load-bearing on every grid item — without it a long
                // unbroken Georgian word blows the column out on a phone.
                <Card key={n} padding="section" className="min-w-0 flex flex-col">
                  <span className="w-10 h-10 rounded-field bg-brand-50 text-brand-700 inline-flex items-center justify-center">
                    <Glyph className="w-5 h-5" />
                  </span>
                  <h3 className="mt-4 font-display text-h3 font-bold text-ink-900">
                    <SiteText k={`abroad.card${n}.title`} />
                  </h3>
                  <p className="mt-2 text-body text-ink-600 flex-1">
                    <SiteText k={`abroad.card${n}.body`} />
                  </p>
                  <div className="mt-5 flex items-baseline gap-2">
                    {/* Euro leads, lari follows: euro is the number this reader
                        can judge, lari is the number they will be charged.
                        Both, always — showing only one of them is the mismatch
                        this arrangement exists to avoid. */}
                    <span className="font-display text-h2 font-bold text-ink-900">{eurLabel(gel)}</span>
                    <span className="text-small text-ink-500">₾{gel}</span>
                  </div>
                  <div className="mt-4">
                    <Btn href="#experts" variant="primary" size="md" className="w-full">
                      {t(`abroad.card${n}.cta`)}
                    </Btn>
                  </div>
                </Card>
              )
            })}
          </div>
        </Container>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="py-16 lg:py-24 bg-ink-50 border-y border-ink-100">
        <Container>
          <h2 className="font-display text-h2 sm:text-display font-bold text-ink-900">
            <SiteText k="abroad.how.title" />
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map(n => (
              <li key={n} className="min-w-0">
                <span className="w-9 h-9 rounded-full bg-brand-600 text-white font-display text-body font-bold inline-flex items-center justify-center tabular-nums">
                  {n}
                </span>
                <h3 className="mt-4 font-display text-h3 font-bold text-ink-900">
                  <SiteText k={`abroad.how.step${n}.title`} />
                </h3>
                <p className="mt-2 text-body text-ink-600">
                  <SiteText k={`abroad.how.step${n}.desc`} />
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* ── Experts ──────────────────────────────────────────────────────── */}
      <section id="experts" className="py-16 lg:py-24 scroll-mt-24">
        <Container>
          <h2 className="font-display text-h2 sm:text-display font-bold text-ink-900">
            <SiteText k="abroad.experts.title" />
          </h2>
          <p className="mt-2 text-body text-ink-500 max-w-[560px]">
            <SiteText k="abroad.experts.subtitle" />
          </p>

          {experts.length === 0 ? (
            <Card padding="section" className="mt-8 text-center">
              <p className="text-body text-ink-600 max-w-[420px] mx-auto">
                <SiteText k="abroad.experts.empty" />
              </p>
              <div className="mt-5">
                <Btn href={`mailto:${SUPPORT_EMAIL}`} variant="primary" size="md">
                  {t('abroad.cta.button')}
                </Btn>
              </div>
            </Card>
          ) : (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {experts.map(e => (
                <li key={e.id} className="min-w-0">
                  {/* The href MUST be the slug when there is one: a cuid href
                      308s to the slug, and that redirect downgrades the
                      navigation to a full load, silently killing the photo
                      view-transition (CLAUDE.md, 2026-08-01). */}
                  <Link href={`/experts/${e.slug || e.id}`} className="block h-full">
                    <Card interactive padding="default" className="h-full min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar src={e.avatar} name={e.fullName} size={56} className="shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-display text-body font-bold text-ink-900 truncate">{e.fullName}</span>
                            {e.verified && <VerifiedMark size={14} />}
                          </div>
                          <div className="text-small text-ink-500 truncate">{e.specialty}</div>
                        </div>
                      </div>
                      <p className="mt-3 text-small text-ink-600 line-clamp-2">{e.headline}</p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="font-display text-body font-bold text-ink-900">
                          {eurLabel(e.price)} <span className="font-normal text-meta text-ink-500">₾{e.price}</span>
                        </span>
                        {/* A rating is shown only when one was actually earned —
                            „0.0" on a new expert is a bad review, not an
                            absence. */}
                        {e.reviewsCount > 0 && (
                          <span className="text-meta text-ink-500 inline-flex items-center gap-1 tabular-nums">
                            <Icon.star className="w-3 h-3 text-warning-500" />
                            {fmtRating(e.rating)} · {e.reviewsCount}
                          </span>
                        )}
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="pb-16 lg:pb-24">
        <Container>
          <Card padding="section" className="text-center bg-gradient-wash">
            <h2 className="font-display text-h2 font-bold text-ink-900">
              <SiteText k="abroad.cta.title" />
            </h2>
            <p className="mt-3 text-body-lg text-ink-600 max-w-[520px] mx-auto">
              <SiteText k="abroad.cta.body" />
            </p>
            <div className="mt-6">
              {/* A mailto, not a form: this reader is on a phone and already has
                  a mail app signed in, and a form here would be one more thing
                  to build, staff and monitor for a page that may never scale. */}
              <Btn href={`mailto:${SUPPORT_EMAIL}`} variant="cta" size="lg">
                {t('abroad.cta.button')}
              </Btn>
            </div>
          </Card>
        </Container>
      </section>

      <Footer />
    </div>
  )
}
