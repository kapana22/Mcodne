import Link from 'next/link'
import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/pageSeo'
import { socialMeta } from '@/lib/seo'
import { CANCEL_CUTOFF_HOURS, COMMISSION_PCT, PAYMENTS_LIVE } from '@/lib/flags'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { getSiteTextMap } from '@/lib/siteText'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { jsonLdString } from '@/lib/jsonLd'
import { SiteText } from '@/components/SiteTextProvider'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
// FAQ content moved to lib/helpTopics so the help WIDGET reads the same answers
// — a copy here would drift and start quoting an old cancellation window.
import { resolveGroups, type FaqGroup } from '@/lib/helpTopics'
import { Illustration } from '@/components/Illustration'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
// Metadata now reads the editable SEO text from the database, so this page
// must render per request. Built statically it would bake whatever the
// defaults were at BUILD time — and Railway's builder cannot reach the DB,
// so that means the code defaults forever, whatever the admin types.
export const dynamic = 'force-dynamic'

export const generateMetadata = () => pageMetadata('help', '/help')


type Channel = {
  icon: ReactNode
  t: string
  d: string
  hours: string
  cta: string
  href: string
  primary?: boolean
}

// Honest channels only — no invented chat widget or placeholder phone number.
// Support today is email + the contact form; hours match the canonical schedule.
/** Built from the SiteText map inside the page — see `buildChannels`. The
 *  email card's DESCRIPTION stays generated: it prints SUPPORT_EMAIL, which has
 *  exactly one source (lib/supportEmails) so the address cannot end up typed
 *  two different ways on two surfaces. */
const buildChannels = (t: (k: string) => string): Channel[] => [
  { icon: <Icon.mail className="w-6 h-6" />, t: t('help.channel1.title'), d: `${SUPPORT_EMAIL} · პასუხი 24 საათში`, hours: t('help.channel1.hours'), cta: t('help.channel1.cta'), href: `mailto:${SUPPORT_EMAIL}`, primary: true },
  { icon: <Icon.chat className="w-6 h-6" />, t: t('help.channel2.title'), d: t('help.channel2.body'), hours: t('help.channel2.hours'), cta: t('help.channel2.cta'), href: '/contact' },
]

export default async function HelpPage() {
  const map = await getSiteTextMap()
  const t = (k: string) => map[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''
  const CHANNELS = buildChannels(t)
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
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(faqLd) }} />
      <MarketingTopBar />

      <Container as="main" size="content" className="py-12 lg:py-16">
        <Eyebrow className="mb-3">
          დახმარება
        </Eyebrow>
        <h1 className="font-display text-display lg:text-display font-bold text-ink-900 tracking-tight leading-[1.05] motion-safe:animate-rise-in">
          <SiteText k="help.hero.title" />
        </h1>
        <p className="mt-6 text-body-lg text-ink-600 leading-relaxed max-w-[640px]">
          თუ ვერ იპოვე პასუხი აქ, დაწერე{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-700 hover:text-brand-800 font-semibold">
            {SUPPORT_EMAIL}
          </a>{' '}
          ან{' '}
          <Link href="/contact" className="text-brand-700 hover:text-brand-800 font-semibold">
            შეავსე ფორმა
          </Link>
          . პასუხს ჩვეულებრივ 24 საათში იღებ.
        </p>

        <Reveal stagger className="mt-12 space-y-12">
          {GROUPS.map(g => (
            <section key={g.title}>
              <Eyebrow className="mb-4">
                {g.title}
              </Eyebrow>
              <div className="rounded-card border border-ink-200 bg-white divide-y divide-ink-200">
                {g.items.map((f, i) => (
                  <details key={i} className="group">
                    <summary className="flex items-center justify-between p-5 cursor-pointer list-none gap-4">
                      <span className="text-body-lg font-display font-semibold text-ink-900 leading-snug">
                        {f.q}
                      </span>
                      <Icon.chevD className="w-4 h-4 text-ink-500 group-open:rotate-180 transition-transform duration-fast shrink-0" />
                    </summary>
                    {/* No `max-w-prose` here. The card is already the measure —
                        `size="content"` caps this column at 820px, which is a
                        sane line length for body text. Adding a 65ch cap INSIDE
                        it wrapped every answer at roughly half the card and left
                        ~440px of white to the right of each one (measured), so
                        the panel read as broken rather than as considered. Cap
                        the container OR the text, never both. */}
                    <div className="px-5 pb-5 text-body text-ink-600 leading-relaxed">{f.a}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </Reveal>

        <Reveal>
        <section className="mt-16">
          {/* Art BESIDE the text on desktop, ABOVE it on mobile — the brief's
              layout for this block. `items-center` + `gap` is the whole
              treatment: no plate, no border, just air. The heading keeps the
              centring it had on mobile and squares up on desktop, where the
              drawing now holds the left edge. */}
          <div className="mb-8 flex flex-col sm:flex-row items-center sm:items-center justify-center gap-5 sm:gap-8 text-center sm:text-left">
            <Illustration name="support" size="support" alt="" className="shrink-0" />
            <div>
              <Eyebrow className="mb-2">
                პასუხი ვერ იპოვე?
              </Eyebrow>
              <h2 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight">
                <SiteText k="help.contact.title" />
              </h2>
              <p className="mt-2 text-body text-ink-600"><SiteText k="help.contact.sub" /></p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {CHANNELS.map(c => (
              <div key={c.t} className={`rounded-card border p-6 ${c.primary ? 'border-brand-500 bg-brand-50/30 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white'}`}>
                <div className={`w-12 h-12 rounded-card inline-flex items-center justify-center mb-4 ${c.primary ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700'}`}>{c.icon}</div>
                <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">{c.t}</h3>
                <p className="mt-1.5 text-small text-ink-700 tabular-nums">{c.d}</p>
                <div className="mt-3 font-mono text-meta tabular-nums text-ink-500">{c.hours}</div>
                <a
                  href={c.href}
                  // h-11 ⇒ text-body, the <Btn size="md"> pairing. Height says
                  // how important a control is; the label has to agree.
                  className={`mt-5 w-full h-11 rounded-btn font-display font-semibold text-body inline-flex items-center justify-center gap-2 transition-colors duration-fast ${
                    c.primary ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-white border border-ink-200 hover:bg-ink-50 text-ink-800'
                  }`}
                >
                  {c.cta}
                </a>
              </div>
            ))}
          </div>
          <div className="mt-8 p-5 rounded-card bg-ink-50/50 border border-ink-200 text-center">
            <div className="font-mono text-meta tabular-nums text-ink-600">
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
