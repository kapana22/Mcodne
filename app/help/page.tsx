import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { CANCEL_CUTOFF_HOURS, COMMISSION_PCT } from '@/lib/flags'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'

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
        a: 'მცოდნე არის ცოდნის არქივი — პლატფორმა, სადაც შენ ხვდები გადამოწმებულ ექსპერტებთან 40-წუთიან 1-1 კონსულტაციაზე ბიზნესის, ფინანსების, კარიერის, სამართლისა და სხვა სფეროებში.',
      },
      {
        q: 'როგორ ვიპოვო შესაფერისი ექსპერტი?',
        a: 'გვერდზე „ექსპერტები“ შეგიძლია გაფილტრო კატეგორიით, ფასით და შეფასებით. თითოეულ პროფილში ნახავ ვიდეო-ინტროს, გამოცდილებასა და ბოლო შეფასებებს.',
      },
      {
        q: 'რა ჯდება პირველი გაცნობა?',
        a: 'ფასი წინასწარ ცნობილია — გადაიხდი მხოლოდ დაჯავშნისას. სესია 40 წუთია, ფასი მერყეობს 40₾-დან 300₾-მდე ექსპერტის დონისა და სფეროს მიხედვით.',
      },
    ],
  },
  {
    title: 'დაჯავშნა და სესია',
    items: [
      {
        q: 'როგორ დავჯავშნო სესია?',
        a: 'შედი ექსპერტის პროფილში, აირჩიე თარიღი და დრო კალენდარში, გადაიხადე — მიიღებ დადასტურებას ელფოსტით და კალენდარულ მოწვევას.',
      },
      {
        q: 'სად ტარდება სესია?',
        a: 'ვიდეო ზარი ტარდება პირდაპირ პლატფორმაზე — არ გჭირდება Zoom-ის ან სხვა აპლიკაციის ჩამოტვირთვა. საკმარისია ბრაუზერი და კამერა.',
      },
      {
        q: 'შეიძლება თუ არა გავაუქმო ან გადავიტანო?',
        a: `დიახ — სესიის დაწყებამდე ${CANCEL_CUTOFF_HOURS} საათით ადრე შესაძლებელია უფასო გაუქმება ან გადატანა. ${CANCEL_CUTOFF_HOURS} საათზე ნაკლებ დროში გაუქმებისას თანხა არ ბრუნდება, გარდა დასაბუთებული გამონაკლისებისა.`,
      },
      {
        q: 'რა მოხდება, თუ ექსპერტი არ გამოცხადდა?',
        a: 'შემოგთავაზებთ გადატანას ან ჩანაცვლებას სხვა ექსპერტით — უფასოდ. ონლაინ გადახდების ამოქმედების შემდეგ ასეთ შემთხვევაში გადახდილი თანხა სრულად დაბრუნდება. გამოუცხადებლობა გავლენას ახდენს ექსპერტის რეიტინგზე.',
      },
    ],
  },
  {
    title: 'გადახდა',
    items: [
      {
        q: 'უსაფრთხოა თუ არა გადახდა?',
        a: 'ონლაინ გადახდები მალე ამოქმედდება — ამჟამად სესიის დაჯავშნა უფასოა და ბარათს არ გთხოვთ. გაშვების შემდეგ თანხა დაცულ ანგარიშზე შეინახება: ექსპერტს გადაერიცხება მხოლოდ სესიის წარმატებით დასრულების შემდეგ, ბარათის დეტალები კი ჩვენთან არ შეინახება.',
      },
      {
        q: 'რომელი გადახდის მეთოდები მიიღება?',
        a: 'ონლაინ გადახდები ჯერ არ არის ჩართული — ამჟამად დაჯავშნა უფასოა. ამოქმედებისთანავე აქვე გამოვაქვეყნებთ მხარდაჭერილი მეთოდების სრულ სიას.',
      },
      {
        q: 'შემიძლია მივიღო ინვოისი?',
        a: 'ინვოისები ონლაინ გადახდებთან ერთად ამოქმედდება — ყოველი გადახდის შემდეგ ინვოისი ავტომატურად გაიგზავნება ელფოსტაზე. მანამდე დაჯავშნა უფასოა და ინვოისი არ გჭირდება.',
      },
    ],
  },
  {
    title: 'ექსპერტებისთვის',
    items: [
      {
        q: 'როგორ ვხდები ექსპერტი?',
        a: '„გახდი ექსპერტი“ გვერდზე შეავსე განაცხადი — გამოცდილება, სპეციალიზაცია, პორტფოლიო. 3 დღეში მიიღებ პასუხს. მოწმდება: მინიმუმ 5 წლის გამოცდილება და პროფესიული რეპუტაცია.',
      },
      {
        q: 'რა კომისიას იღებს პლატფორმა?',
        a: `პლატფორმა იტოვებს ${COMMISSION_PCT}% ექსპერტის შემოსავლიდან. ეს მოიცავს ტექნიკურ ინფრასტრუქტურას, გადახდის დამუშავებას, მხარდაჭერას და მარკეტინგს.`,
      },
      {
        q: 'როდის მივიღებ თანხას?',
        a: 'ონლაინ გადახდები და გადმორიცხვები მალე ამოქმედდება — მანამდე სესიები უფასოდ იჯავშნება და გადმორიცხვები არ ხდება. გაშვების შემდეგ შემოსავალი რეგულარული, წინასწარ ცნობილი გრაფიკით გადმოირიცხება შენს ანგარიშზე — დეტალებს გაშვებამდე შეგატყობინებთ.',
      },
    ],
  },
  {
    title: 'ანგარიში და უსაფრთხოება',
    items: [
      {
        q: 'როგორ დავიცვა ჩემი ანგარიში?',
        a: 'ჩართე 2FA „პარამეტრები → უსაფრთხოებაში“, გამოიყენე ძლიერი პაროლი და არასდროს გაუზიარო წვდომა სხვას. ეჭვის შემთხვევაში დაუყოვნებლივ დაგვიკავშირდი.',
      },
      {
        q: 'როგორ წავშალო ანგარიში?',
        a: '„პარამეტრები → ანგარიში → ანგარიშის დახურვა“. წაშლის შემდეგ მონაცემები ინახება 90 დღე (საშეღავათო პერიოდი), შემდეგ სრულად შორდება სისტემას.',
      },
      {
        q: 'რა ხდება, თუ ექსპერტი დისკრიმინაციულად მოიქცა?',
        a: 'დაუყოვნებლივ დაწერე report@mcodne.ge — გამოვიძიებთ 48 საათში. სერიოზული დარღვევის შემთხვევაში ექსპერტს ვხურავთ ანგარიშს და ვაბრუნებთ თანხას სრულად.',
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
  { icon: <Icon.mail className="w-6 h-6" />, t: 'ელფოსტა', d: 'hi@mcodne.ge · პასუხი 24 საათში', hours: 'ორშ – პარ 10:00 – 19:00 · შაბ – კვ ელფოსტა', cta: 'წერილის გაგზავნა', href: 'mailto:hi@mcodne.ge', primary: true },
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <MarketingTopBar />

      <Container as="main" size="content" className="py-16 lg:py-20">
        <Eyebrow className="mb-3">
          დახმარება
        </Eyebrow>
        <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05] motion-safe:animate-rise-in">
          ხშირად დასმული კითხვები
        </h1>
        <p className="mt-6 text-[16px] text-ink-600 leading-relaxed max-w-[640px]">
          თუ ვერ იპოვე პასუხი აქ, დაწერე{' '}
          <a href="mailto:hi@mcodne.ge" className="text-brand-700 hover:text-brand-800 font-semibold">
            hi@mcodne.ge
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
              დაგვიკავშირდი
            </h2>
            <p className="mt-2 text-[13.5px] text-ink-600">ჩვენი გუნდი პასუხობს ორშ – პარ 10:00 – 19:00.</p>
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
              ხელით მოდერაცია · ადმინისტრაცია პასუხობს პირად შემთხვევებზე
            </div>
          </div>
        </section>
        </Reveal>
      </Container>

      <Footer />
    </div>
  )
}
