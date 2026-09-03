import { pageMetadata } from '@/lib/pageSeo'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { Footer } from '@/components/Footer'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { jsonLdString } from '@/lib/jsonLd'
import { SiteText } from '@/components/SiteTextProvider'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
// FAQ content moved to lib/helpTopics so the help WIDGET reads the same answers
// — a copy here would drift and start quoting an old cancellation window.
import { resolveGroups } from '@/lib/helpTopics'
import { Illustration } from '@/components/Illustration'
import { HelpFaq } from './_faq'

// /help — „დახმარება", ported from the owner's design canvas
// „How It Works + Help" (2026-08-31).
//
// ⚠️ THE CONTENT IS UNCHANGED. Every question and answer still comes from
// `lib/helpTopics`, resolved ONCE below with `resolveGroups(map)` and handed
// both to the visible accordion and to the FAQPage structured data. That single
// resolution is the guarantee tests/siteTexts pins, and it survived the port
// intact: this was a presentation change, not a content model.
//
// ⚠️ WHAT THE CANVAS CHANGED. The list of questions used to be one white plate
// per group with hairline-divided rows inside it; it is now one CARD per
// question, with a +/− chip and a brand-200 outline on the open one, over a
// pill search field. The two support CHANNELS, which were a pair of cards under
// an illustration, are now the canvas's one dashed „პასუხი ვერ იპოვე?" card —
// same illustration, same two actions, same hours, one surface.
//
// ⚠️ THE INTRO PARAGRAPH LEFT THE TOP OF THE PAGE, and the canvas is why: h1,
// then the field, and nothing between them. It was three lines carrying two
// links — `mailto:SUPPORT_EMAIL` and /contact — and BOTH of them are in the
// dashed card at the bottom, which is where the canvas puts the „can't find it"
// answer. Nothing was lost; it moved to the place a person looks for it, which
// is after the questions rather than before them.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
// Metadata now reads the editable SEO text from the database, so this page
// must render per request. Built statically it would bake whatever the
// defaults were at BUILD time — and Railway's builder cannot reach the DB,
// so that means the code defaults forever, whatever the admin types.
export const dynamic = 'force-dynamic'

export const generateMetadata = () => pageMetadata('help', '/help')

export default async function HelpPage() {
  const map = await getSiteTextMap()
  const t = (k: string) => map[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''
  // ONE resolved list feeds both the visible accordion and the FAQPage
  // structured data below. Built separately, an admin edit would change the
  // answer on screen while Google kept being served the old one — a mismatch
  // that costs the rich result and that nothing in the app would report.
  const GROUPS = resolveGroups(map)
  // FAQPage structured data — every Q/A across all groups. Eligible for Google's
  // collapsible-FAQ rich result.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: GROUPS.flatMap(g => g.items).map(it => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  }
  return (
    <div className="min-h-screen bg-ink-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faqLd) }} />
      <MarketingTopBar />

      <Container as="main" size="content" className="py-10 lg:py-14">
        <Eyebrow className="mb-3">
          დახმარება
        </Eyebrow>
        <h1 className="font-display text-display lg:text-display font-extrabold text-ink-900 tracking-tight leading-[1.05] motion-safe:animate-rise-in">
          <SiteText k="help.hero.title" />
        </h1>

        {/* The search field and the accordion. A client leaf on purpose — the
            filter is the only thing here that needs JavaScript, and the
            questions themselves are <details>, so with scripting off all 25
            answers are still on the page and still openable. */}
        <HelpFaq groups={GROUPS} />

        <Reveal>
        {/* ── „პასუხი ვერ იპოვე?" ─────────────────────────────────────────
            The canvas's dashed card. It carries what the two channel cards
            carried — both actions, the address, both response windows — on one
            surface instead of two, which is what a person needs at the bottom
            of a page they did not find their answer on.

            `border-dashed` is the canvas's own signal and it is the right one:
            this is not a card you can act ON, it is an outline around the way
            out. The two <Btn> inside are the actions. */}
        <section className="mt-10 rounded-panel border border-dashed border-ink-300 bg-white p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-8 text-center sm:text-left">
            <Illustration name="support" size="support" alt="" className="shrink-0" />
            <div className="flex-1 sm:min-w-[240px]">
              <Eyebrow className="mb-2">
                პასუხი ვერ იპოვე?
              </Eyebrow>
              <h2 className="font-display text-h1 font-bold text-ink-900 tracking-tight">
                <SiteText k="help.contact.title" />
              </h2>
              <p className="mt-2 text-body-lg text-ink-600 leading-relaxed"><SiteText k="help.contact.sub" /></p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {/* h-12 ⇒ text-body-lg — the <Btn size="lg"> pairing. Height is
                  how a control announces its importance and the label has to
                  agree (tests/designTokens §F). */}
              <Btn variant="primary" size="lg" href={`mailto:${SUPPORT_EMAIL}`}>
                {t('help.channel1.cta')}
              </Btn>
              <Btn variant="secondary" size="lg" href="/contact">
                {t('help.channel2.cta')}
              </Btn>
            </div>
          </div>

          {/* The facts under the two actions, in the order the buttons sit.
              SUPPORT_EMAIL is PRINTED rather than typed — it has exactly one
              source (lib/supportEmails), so it cannot end up written two
              different ways on two surfaces. */}
          <div className="mt-6 pt-5 border-t border-ink-100 grid gap-x-8 gap-y-2 sm:grid-cols-2 font-mono text-meta tabular-nums text-ink-500">
            <div>
              {t('help.channel1.title')} · {SUPPORT_EMAIL} · {t('help.channel1.hours')}
            </div>
            <div>
              {t('help.channel2.title')} · {t('help.channel2.body')} · {t('help.channel2.hours')}
            </div>
            <div className="sm:col-span-2">
              <Icon.star className="w-3.5 h-3.5 inline-block mr-1.5 text-warning-500" />
              ხელით მოდერაცია · პასუხობს ადმინისტრაცია
            </div>
          </div>
        </section>
        </Reveal>
      </Container>

      <Footer />
    </div>
  )
}
