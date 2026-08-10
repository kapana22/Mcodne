import Link from 'next/link'
import type { Metadata } from 'next'
import { CANCEL_CUTOFF_HOURS, COMMISSION_PCT, PAYMENTS_LIVE } from '@/lib/flags'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { LEGAL_EMAIL } from '@/lib/supportEmails'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'სამომხმარებლო წესები — მცოდნე',
  description: 'მცოდნე პლატფორმის გამოყენების წესები და პირობები.',
  alternates: { canonical: `${SITE_URL}/terms` },
  openGraph: {
    title: 'სამომხმარებლო წესები — მცოდნე',
    description: 'მცოდნე პლატფორმის გამოყენების წესები და პირობები.',
    url: `${SITE_URL}/terms`,
  },
}

const SECTIONS = [
  {
    id: 'introduction',
    title: '1. ზოგადი დებულებები',
    body: [
      'მცოდნე (შემდგომ — „პლატფორმა“) არის ონლაინ საკონსულტაციო სივრცე, რომელიც აკავშირებს მომხმარებლებს ხელით შერჩეულ ექსპერტებთან. პლატფორმაზე რეგისტრაციით ან მისი გამოყენებით შენ თანხმდები წინამდებარე პირობებზე.',
      'თუ არ ეთანხმები რომელიმე პუნქტს, გთხოვ, არ გამოიყენო პლატფორმა. ცვლილებების შემთხვევაში წინასწარ შეგატყობინებთ ელფოსტით ან საიტზე გამოქვეყნებით.',
    ],
  },
  {
    id: 'account',
    title: '2. ანგარიშის რეგისტრაცია',
    body: [
      'პლატფორმის სრული ფუნქციონალით სარგებლობისთვის საჭიროა 18 წელი შესრულებული. რეგისტრაცია მოითხოვს რეალურ სახელს, ელფოსტას და (ექსპერტების შემთხვევაში) დამატებით ინფორმაციას.',
      'შენ პასუხს აგებ ანგარიშის უსაფრთხოებაზე და პაროლის კონფიდენციალურობაზე. თუ შენიშნავ არაავტორიზებულ წვდომას, დაუყოვნებლივ დაგვიკავშირდი.',
    ],
  },
  {
    id: 'services',
    title: '3. მომსახურება',
    body: [
      'პლატფორმა უზრუნველყოფს ტექნიკურ ინფრასტრუქტურას — პროფილს, ვიდეო ზარს, გადახდის სისტემას, შეფასებას. კონსულტაციის კონკრეტული შინაარსი, ხარისხი და შედეგი ექსპერტის პასუხისმგებლობაა.',
      'ექსპერტთა ცოდნა და გამოცდილება მოწმდება, თუმცა პლატფორმა არ იძლევა გარანტიას კონკრეტული შედეგის მიღწევის შესახებ. კონსულტაცია არ ცვლის იურიდიულ, სამედიცინო ან ფინანსურ პროფესიულ დახმარებას სპეციფიკურ საკითხებში.',
    ],
  },
  {
    id: 'payments',
    title: '4. გადახდა და დაცული თანხა',
    body: [
      // Payments are not live yet (PAYMENTS_LIVE=false) — the escrow model is
      // stated as the model that WILL apply once online payments launch.
      'ონლაინ გადახდები პლატფორმაზე ჯერ არ არის ამოქმედებული — ამჟამად სესიის დაჯავშნა უფასოა. ონლაინ გადახდების ამოქმედების შემდეგ გადახდა განხორციელდება წინასწარ, სესიის დაჯავშნისას: თანხა დაცულ ანგარიშზე შეინახება და ექსპერტს გადაერიცხება მხოლოდ სესიის წარმატებით დასრულების შემდეგ.',
      // The commission clause STAYS (it is a legal obligation) — only its
      // applicability is made accurate: the percentage always reads
      // COMMISSION_PCT, and while PAYMENTS_LIVE is false nothing is withheld,
      // because nothing is charged. Flipping the flag restores the present
      // tense without touching this file.
      PAYMENTS_LIVE
        ? `ფასიანი სესიებიდან პლატფორმა იტოვებს კომისიას — ${COMMISSION_PCT}%-ს ექსპერტის შემოსავლიდან. ეს კომისია მოიცავს ტექნიკურ ინფრასტრუქტურას, გადახდის დამუშავებას და მხარდაჭერას.`
        : `ონლაინ გადახდების ამოქმედების შემდეგ ფასიანი სესიებიდან პლატფორმა დაიტოვებს კომისიას — ${COMMISSION_PCT}%-ს ექსპერტის შემოსავლიდან. ეს კომისია მოიცავს ტექნიკურ ინფრასტრუქტურას, გადახდის დამუშავებას და მხარდაჭერას. სანამ ონლაინ გადახდები არ ამოქმედდება, ჯავშნა უფასოა.`,
    ],
  },
  {
    id: 'cancellation',
    title: '5. გაუქმება და თანხის დაბრუნება',
    body: [
      // Window reads from CANCEL_CUTOFF_HOURS — copy previously said 12h while
      // the server (and every other surface) enforced 24h.
      `სესიის დაწყებამდე ${CANCEL_CUTOFF_HOURS} საათით ადრე შესაძლებელია უფასო გაუქმება სრული დაბრუნებით. ${CANCEL_CUTOFF_HOURS} საათზე ნაკლებ დროში გაუქმებისას თანხა არ ბრუნდება, გარდა დასაბუთებული გამონაკლისებისა.`,
      'თუ ექსპერტმა გააუქმა სესია ან არ გამოცხადდა, გადახდილი თანხა (ონლაინ გადახდების ამოქმედების შემდეგ) ავტომატურად დაბრუნდება იმავე გადახდის მეთოდზე.',
    ],
  },
  {
    id: 'conduct',
    title: '6. ქცევის წესები',
    body: [
      // Anti-circumvention stays in force as written; the parenthetical only
      // clarifies that it also binds after online payments (and the commission)
      // go live — it is not a statement that money changes hands today.
      `პლატფორმაზე იკრძალება: შეურაცხყოფა, დისკრიმინაცია, სპამი, ცრუ ინფორმაცია, უკანონო კონსულტაცია, ინტელექტუალური საკუთრების დარღვევა, პლატფორმის მიღმა გარიგების ან ანგარიშსწორების მცდელობა პლატფორმის საკომისიოს გვერდის ავლის მიზნით${PAYMENTS_LIVE ? '' : ' — მათ შორის მას შემდეგ, რაც ონლაინ გადახდები ამოქმედდება'}.`,
      'დარღვევის შემთხვევაში ვიტოვებთ უფლებას შევზღუდოთ ან წავშალოთ ანგარიში წინასწარი გაფრთხილების გარეშე.',
    ],
  },
  {
    id: 'ip',
    title: '7. ინტელექტუალური საკუთრება',
    body: [
      'პლატფორმის ლოგო, დიზაინი, ტექსტი და კოდი — მცოდნის საკუთრებაა. ექსპერტების მიერ შექმნილი მასალები (პროფილი, სტატიები, ჩანაწერები) რჩება მათ საკუთრებაში, თუმცა შენ გვანიჭებ ლიცენზიას მათი ჩვენების უფლებით პლატფორმაზე.',
    ],
  },
  {
    id: 'liability',
    title: '8. პასუხისმგებლობის შეზღუდვა',
    body: [
      'პლატფორმა უზრუნველყოფს მომსახურებას „როგორც არის“ პრინციპით. მაქსიმალურ ფარგლებში, კანონით დაშვებულ ფარგლებში, არ ვართ პასუხისმგებელი არაპირდაპირ, შემთხვევით ან შედეგობრივ ზიანზე.',
      'ჩვენი მაქსიმალური პასუხისმგებლობა შემოიფარგლება ბოლო 12 თვის განმავლობაში შენს მიერ გადახდილი თანხით.',
    ],
  },
  {
    id: 'changes',
    title: '9. ცვლილებები',
    body: [
      'ვიტოვებთ უფლებას შევცვალოთ ეს პირობები. მნიშვნელოვანი ცვლილებების შესახებ 14 დღით ადრე შეგატყობინებთ ელფოსტით.',
    ],
  },
  {
    id: 'law',
    title: '10. მოქმედი კანონმდებლობა',
    body: [
      'წინამდებარე პირობები რეგულირდება საქართველოს კანონმდებლობით. დავები განიხილება თბილისის საქალაქო სასამართლოში.',
      `კონტაქტი: ${LEGAL_EMAIL}`,
    ],
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <Container as="main" size="content" className="py-16 lg:py-20">
        <Eyebrow className="mb-3">
          სამართალი
        </Eyebrow>
        <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
          გამოყენების წესები
        </h1>
        <p className="mt-2 text-small text-ink-500 tabular-nums">ბოლო განახლება: 2026 წლის 1 ივლისი</p>

        <p className="mt-6 text-body-lg text-ink-700 leading-relaxed">
          წინამდებარე პირობები არეგულირებს მცოდნე პლატფორმის გამოყენებას. გთხოვ, ყურადღებით წაიკითხე — ეს
          დოკუმენტი ეხება როგორც სტუდენტებს, ისე ექსპერტებს.
        </p>

        <nav className="mt-8 rounded-card border border-ink-200 bg-ink-50/50 p-5">
          <Eyebrow tone="muted" className="mb-3">
            შინაარსი
          </Eyebrow>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-small text-ink-700">
            {SECTIONS.map(s => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:text-brand-700">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-10">
          {SECTIONS.map(s => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="font-display text-h2 lg:text-h1 font-bold text-ink-900 tracking-tight">{s.title}</h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <p key={i} className="text-body-lg text-ink-700 leading-relaxed max-w-prose">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-ink-200 flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" className="inline-flex items-center min-h-[40px] sm:min-h-0 text-small text-brand-700 hover:text-brand-800 font-semibold">
            ← მთავარზე დაბრუნება
          </Link>
          <div className="text-small text-ink-500">
            იხილე ასევე{' '}
            <Link href="/privacy" className="tap-area text-brand-700 hover:text-brand-800 font-semibold">
              კონფიდენციალურობა
            </Link>{' '}
            და{' '}
            <Link href="/cookies" className="tap-area text-brand-700 hover:text-brand-800 font-semibold">
              ქუქიების პოლიტიკა
            </Link>
          </div>
        </div>
      </Container>

      <Footer />
    </div>
  )
}
