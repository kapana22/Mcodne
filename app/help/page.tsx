import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { CANCEL_CUTOFF_HOURS, COMMISSION_PCT, PAYMENTS_LIVE } from '@/lib/flags'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { jsonLdString } from '@/lib/jsonLd'
import { SiteText } from '@/components/SiteTextProvider'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'დახმარება — მცოდნე',
  description: 'ხშირად დასმული კითხვები, პრაქტიკული პასუხები და დახმარების არხები.',
  alternates: { canonical: `${SITE_URL}/help` },
  openGraph: {
    title: 'დახმარება — მცოდნე',
    description: 'ხშირად დასმული კითხვები, პრაქტიკული პასუხები და დახმარების არხები.',
    url: `${SITE_URL}/help`,
  },
}

type FaqGroup = {
  title: string
  items: { q: string; a: string }[]
}

const GROUPS: FaqGroup[] = [
  {
    title: 'დაწყება',
    items: [
      {
        q: 'რა არის მცოდნე?',
        a: 'პლატფორმა, სადაც ხელით შერჩეულ ექსპერტებთან იჯავშნი 1-1 ვიდეოკონსულტაციას — ბიზნესი, ფინანსები, კარიერა, სამართალი და სხვა.',
      },
      {
        q: 'როგორ ვიპოვო შესაფერისი ექსპერტი?',
        a: 'გვერდზე „ექსპერტები“ გაფილტრე კატეგორიით, ფასითა და შეფასებით. პროფილში ნახავ ვიდეო-ინტროს, გამოცდილებასა და შეფასებებს.',
      },
      {
        q: 'რა ჯდება პირველი გაცნობა?',
        // Payment tense is gated on PAYMENTS_LIVE — the same flag the „გადახდა“
        // section below reads. While it's off a booking costs nothing, so the
        // page must not imply a charge.
        a: PAYMENTS_LIVE
          ? 'ფასს ადგენს ექსპერტი და წინასწარ ხედავ — გადაიხდი მხოლოდ დაჯავშნისას.'
          : 'ფასს ადგენს ექსპერტი და წინასწარ ხედავ. ონლაინ გადახდა ჯერ არ არის — დაჯავშნა ახლა უფასოა, ბარათს არ ვთხოვთ.',
      },
    ],
  },
  {
    title: 'დაჯავშნა და სესია',
    items: [
      {
        q: 'როგორ დავჯავშნო სესია?',
        a: PAYMENTS_LIVE
          ? 'პროფილში აირჩიე თარიღი და დრო, გადაიხადე — დადასტურება ელფოსტით მოვა.'
          : 'პროფილში აირჩიე თარიღი და დრო — დადასტურება ელფოსტით მოვა. გადახდის ეტაპი ჯერ არ არის, დაჯავშნა ახლა უფასოა.',
      },
      {
        q: 'სად ტარდება სესია?',
        a: 'პირდაპირ პლატფორმაზე — არ გჭირდება Zoom ან სხვა აპლიკაცია. საკმარისია ბრაუზერი და კამერა.',
      },
      {
        q: 'შეიძლება თუ არა გავაუქმო ან გადავიტანო?',
        a: PAYMENTS_LIVE
          ? `დიახ — ${CANCEL_CUTOFF_HOURS} საათით ადრე უფასოა. ამის შემდეგ თანხა აღარ ბრუნდება, გარდა დასაბუთებული გამონაკლისისა.`
          : `დიახ — ${CANCEL_CUTOFF_HOURS} საათით ადრე უფასოა. ახლა დაჯავშნა უფასოა, ამიტომ დასაბრუნებელი თანხა არ არსებობს; გადახდების ამოქმედების შემდეგ ამ ვადის შემდეგ თანხა აღარ დაბრუნდება, გარდა დასაბუთებული გამონაკლისისა.`,
      },
      {
        q: 'რა მოხდება, თუ ექსპერტი არ გამოცხადდა?',
        a: 'უფასოდ შემოგთავაზებთ გადატანას ან სხვა ექსპერტს. გადახდის ამოქმედების შემდეგ თანხა სრულად დაბრუნდება.',
      },
    ],
  },
  {
    title: 'გადახდა',
    items: [
      {
        q: 'უსაფრთხოა თუ არა გადახდა?',
        a: 'ახლა დაჯავშნა უფასოა, ბარათს არ ვთხოვთ. გაშვების შემდეგ თანხა დაცული იქნება — ექსპერტს მხოლოდ სესიის შემდეგ გადაერიცხება.',
      },
      {
        q: 'რომელი გადახდის მეთოდები მიიღება?',
        a: 'ონლაინ გადახდა ჯერ არ არის — ახლა დაჯავშნა უფასოა. მეთოდების სიას ამოქმედებისთანავე გამოვაქვეყნებთ.',
      },
      {
        q: 'შემიძლია მივიღო ინვოისი?',
        a: 'ინვოისები გადახდებთან ერთად ამოქმედდება — ავტომატურად მოვა ელფოსტაზე. მანამდე დაჯავშნა უფასოა.',
      },
    ],
  },
  {
    title: 'ექსპერტებისთვის',
    items: [
      {
        q: 'როგორ ვხდები ექსპერტი?',
        a: '„გახდი ექსპერტი“ გვერდზე შეავსე განაცხადი — გამოცდილება, სპეციალიზაცია, პორტფოლიო. პასუხს 24–48 საათში მიიღებ.',
      },
      {
        q: 'რა კომისიას იღებს პლატფორმა?',
        // Present tense only when money actually moves — today no booking is
        // charged, so nothing is withheld from the expert.
        a: PAYMENTS_LIVE
          ? `პლატფორმა იტოვებს ${COMMISSION_PCT}%-ს. ეს მოიცავს ინფრასტრუქტურას, გადახდას, მხარდაჭერასა და მარკეტინგს.`
          : `ახლა დაჯავშნა უფასოა და საკომისიოს არ ვიკავებთ — ექსპერტი სრულ თანხას იღებს. ონლაინ გადახდების ამოქმედების შემდეგ პლატფორმა ${COMMISSION_PCT}%-ს დაიტოვებს; ეს მოიცავს ინფრასტრუქტურას, გადახდას, მხარდაჭერასა და მარკეტინგს.`,
      },
      {
        q: 'როდის მივიღებ თანხას?',
        a: 'გადახდები მალე ამოქმედდება — მანამდე სესიები უფასოა. გაშვების შემდეგ შემოსავალი რეგულარული გრაფიკით გადმოგერიცხება.',
      },
    ],
  },
  {
    title: 'ანგარიში და უსაფრთხოება',
    items: [
      {
        q: 'როგორ დავიცვა ჩემი ანგარიში?',
        // Only controls that actually exist: /settings has „პაროლის შეცვლა“
        // (min. 8 characters) and Google-ით შესვლა. There is no 2FA anywhere in
        // the product — don't send people looking for a switch that isn't there.
        a: `გამოიყენე ძლიერი, უნიკალური პაროლი (მინიმუმ 8 სიმბოლო) და არავის გაუზიარო წვდომა. პაროლს ნებისმიერ დროს შეცვლი „პარამეტრები → პაროლის შეცვლა“-ში. თუ ეჭვი გაქვს, რომ ვინმემ ანგარიშთან წვდომა მოიპოვა, მაშინვე შეცვალე პაროლი და მოგვწერე ${SUPPORT_EMAIL}.`,
      },
      {
        q: 'როგორ წავშალო ანგარიში?',
        // The DELETE in app/api/me/route.ts runs prisma.user.delete() straight
        // away — no grace period, no restore. It refuses only when live bookings
        // or historical records exist (then support handles it by hand).
        a: `„პარამეტრები → ანგარიში → ანგარიშის წაშლა“. წაშლა მყისიერია და შეუქცევადი — მონაცემები აღდგენას აღარ ექვემდებარება. თუ დაგეგმილი ან მიმდინარე ჯავშანი გაქვს, ჯერ გააუქმე; თუ ანგარიშს დასრულებული ჯავშნები ან მიმოწერა აქვს, წაშლა ავტომატურად არ სრულდება — მოგვწერე ${SUPPORT_EMAIL}.`,
      },
      {
        q: 'რა ხდება, თუ ექსპერტი დისკრიმინაციულად მოიქცა?',
        // Was report@mcodne.ge — an address that appeared nowhere else in the
        // product and had no inbox behind it, so abuse reports went nowhere.
        // Route to the one support address that is actually monitored.
        a: `დაწერე ${SUPPORT_EMAIL} — გამოვიძიებთ 48 საათში. სერიოზული დარღვევისას ანგარიშს ვხურავთ და თანხას სრულად ვაბრუნებთ.`,
      },
    ],
  },
]

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
const CHANNELS: Channel[] = [
  { icon: <Icon.mail className="w-6 h-6" />, t: 'ელფოსტა', d: `${SUPPORT_EMAIL} · პასუხი 24 საათში`, hours: 'ორშ – პარ 10:00 – 19:00 · შაბ – კვ ელფოსტა', cta: 'წერილის გაგზავნა', href: `mailto:${SUPPORT_EMAIL}`, primary: true },
  { icon: <Icon.chat className="w-6 h-6" />, t: 'საკონტაქტო ფორმა', d: 'აღწერე საკითხი დეტალურად', hours: 'პასუხი 24 საათში', cta: 'ფორმის გახსნა', href: '/contact' },
]

export default function HelpPage() {
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

      <Container as="main" size="content" className="py-16 lg:py-20">
        <Eyebrow className="mb-3">
          დახმარება
        </Eyebrow>
        <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05] motion-safe:animate-rise-in">
          <SiteText k="help.hero.title" />
        </h1>
        <p className="mt-6 text-[16px] text-ink-600 leading-relaxed max-w-[640px]">
          თუ ვერ იპოვე პასუხი აქ, დაწერე{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-700 hover:text-brand-800 font-semibold">
            {SUPPORT_EMAIL}
          </a>{' '}
          ან{' '}
          <Link href="/contact" className="text-brand-700 hover:text-brand-800 font-semibold">
            შეავსე ფორმა
          </Link>
          . ვცდილობთ ვუპასუხოთ 24 საათში.
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
                      <span className="text-[15px] font-display font-semibold text-ink-900 leading-snug">
                        {f.q}
                      </span>
                      <Icon.chevD className="w-4 h-4 text-ink-500 group-open:rotate-180 transition-transform shrink-0" />
                    </summary>
                    <div className="px-5 pb-5 text-[14px] text-ink-600 leading-relaxed max-w-prose">{f.a}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </Reveal>

        <Reveal>
        <section className="mt-16">
          <div className="text-center mb-8">
            <Eyebrow className="mb-2">
              პასუხი ვერ იპოვე?
            </Eyebrow>
            <h2 className="font-display text-[28px] lg:text-[32px] font-bold text-ink-900 tracking-tight">
              <SiteText k="help.contact.title" />
            </h2>
            <p className="mt-2 text-[13.5px] text-ink-600"><SiteText k="help.contact.sub" /></p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {CHANNELS.map(c => (
              <div key={c.t} className={`rounded-card border p-6 ${c.primary ? 'border-brand-500 bg-brand-50/30 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white'}`}>
                <div className={`w-12 h-12 rounded-card inline-flex items-center justify-center mb-4 ${c.primary ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-700'}`}>{c.icon}</div>
                <h3 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">{c.t}</h3>
                <p className="mt-1.5 text-[13px] text-ink-700 tabular-nums">{c.d}</p>
                <div className="mt-3 font-mono text-[11px] tabular-nums text-ink-500">{c.hours}</div>
                <a
                  href={c.href}
                  className={`mt-5 w-full h-10 rounded-btn font-display font-semibold text-[12.5px] inline-flex items-center justify-center gap-2 transition-colors ${
                    c.primary ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-white border border-ink-200 hover:bg-ink-50 text-ink-800'
                  }`}
                >
                  {c.cta}
                </a>
              </div>
            ))}
          </div>
          <div className="mt-8 p-5 rounded-card bg-ink-50/50 border border-ink-200 text-center">
            <div className="font-mono text-[11.5px] tabular-nums text-ink-600">
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
