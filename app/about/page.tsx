import Link from 'next/link'
import type { Metadata } from 'next'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { SiteText } from '@/components/SiteTextProvider'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'ჩვენს შესახებ — მცოდნე',
  description: 'მცოდნე ქართული ცოდნის არქივია — ვაკავშირებთ ადამიანებს გამოცდილ ექსპერტებთან.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: 'ჩვენს შესახებ — მცოდნე',
    description: 'მცოდნე ქართული ცოდნის არქივია — ვაკავშირებთ ადამიანებს გამოცდილ ექსპერტებთან.',
    url: `${SITE_URL}/about`,
  },
}

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
  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <Container as="main" size="wide" className="py-16 lg:py-24">
        <div className="max-w-[720px]">
          <Eyebrow className="mb-3">
            ჩვენს შესახებ
          </Eyebrow>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05] motion-safe:animate-rise-in">
            <SiteText k="about.hero.title" />
          </h1>
          <p className="mt-6 text-[17px] text-ink-600 leading-relaxed">
            <SiteText k="about.hero.body" />
          </p>
        </div>

        <section className="mt-20 pt-10 border-t border-ink-200">
          <Reveal>
            <Eyebrow className="mb-3">
              რას გვჯერა
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold text-ink-900 tracking-tight"><SiteText k="about.principles.title" /></h2>
          </Reveal>
          {/* Reveal-stagger (scroll-triggered) instead of load-time .stagger,
              which finished animating long before the user scrolled here. */}
          <Reveal stagger className="mt-8 grid sm:grid-cols-2 gap-4">
            {VALUES.map(v => (
              <div key={v.title} className="rounded-card border border-ink-200 bg-white p-6 hover-lift">
                <div className="w-10 h-10 rounded-btn bg-brand-50 text-brand-700 flex items-center justify-center">
                  {v.icon}
                </div>
                <div className="font-display text-[17px] font-bold text-ink-900 mt-4"><SiteText k={v.titleKey} /></div>
                <p className="mt-2 text-[14px] text-ink-600 leading-relaxed"><SiteText k={v.bodyKey} /></p>
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
            <h2 className="font-display text-3xl font-bold text-ink-900 tracking-tight leading-tight">
              <SiteText k="about.create.title" />
            </h2>
          </div>
          <div className="space-y-5 text-[15px] text-ink-700 leading-relaxed">
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
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-300 mb-3">
              შემოგვიერთდი
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
              <SiteText k="about.cta.title" />
            </h2>
            <p className="mt-4 text-[15px] text-white/75 leading-relaxed">
              <SiteText k="about.cta.body" />
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/apply"
                className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] inline-flex items-center gap-2 transition-colors"
              >
                გახდი ექსპერტი
              </Link>
              <Link
                href="/contact"
                className="h-11 px-5 rounded-btn bg-white/10 hover:bg-white/15 text-white font-display font-semibold text-[13.5px] inline-flex items-center transition-colors"
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
