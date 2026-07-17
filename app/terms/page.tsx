import Link from 'next/link'
import type { Metadata } from 'next'
import { CANCEL_CUTOFF_HOURS, COMMISSION_PCT } from '@/lib/flags'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'

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
      'მცოდნე (შემდგომ — „პლატფორმა") არის ონლაინ საკონსულტაციო სივრცე, რომელიც აკავშირებს მომხმარებლებს გადამოწმებულ ექსპერტებთან. პლატფორმაზე რეგისტრაციით ან მისი გამოყენებით შენ თანხმდები წინამდებარე პირობებზე.',
      'თუ არ ეთანხმები რომელიმე პუნქტს, გთხოვთ, არ გამოიყენო პლატფორმა. ცვლილებების შემთხვევაში წინასწარ გაცნობებთ ელფოსტით ან საიტზე გამოქვეყნებით.',
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
    title: '4. გადახდა და escrow',
    body: [
      // Payments are not live yet (PAYMENTS_LIVE=false) — the escrow model is
      // stated as the model that WILL apply once online payments launch.
      'ონლაინ გადახდები პლატფორმაზე ჯერ არ არის ამოქმედებული — ამჟამად სესიის დაჯავშნა უფასოა. ონლაინ გადახდების ამოქმედების შემდეგ გადახდა განხორციელდება წინასწარ, სესიის დაჯავშნისას: თანხა შეინახება უსაფრთხო escrow პრინციპით და ექსპერტს გადაერიცხება მხოლოდ სესიის წარმატებით დასრულების შემდეგ.',
      `ფასიანი სესიებიდან პლატფორმა დაიტოვებს კომისიას — ${COMMISSION_PCT}%-ს ექსპერტის შემოსავლიდან. ეს კომისია მოიცავს ტექნიკურ ინფრასტრუქტურას, გადახდის დამუშავებას და მხარდაჭერას.`,
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
      'პლატფორმაზე იკრძალება: შეურაცხყოფა, დისკრიმინაცია, სპამი, ცრუ ინფორმაცია, უკანონო კონსულტაცია, ინტელექტუალური საკუთრების დარღვევა, პლატფორმის მიღმა კონტაქტის დამყარების მცდელობა კომისიის თავიდან ასაცილებლად.',
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
      'პლატფორმა უზრუნველყოფს მომსახურებას „როგორც არის" პრინციპით. მაქსიმალურ ფარგლებში, კანონით დაშვებულ ფარგლებში, არ ვართ პასუხისმგებელი არაპირდაპირ, შემთხვევით ან შედეგობრივ ზიანზე.',
      'ჩვენი მაქსიმალური პასუხისმგებლობა შემოიფარგლება ბოლო 12 თვის განმავლობაში შენს მიერ გადახდილი თანხით.',
    ],
  },
  {
    id: 'changes',
    title: '9. ცვლილებები',
    body: [
      'ვიტოვებთ უფლებას შევცვალოთ ეს პირობები. მნიშვნელოვანი ცვლილებების შემთხვევაში წინასწარ გაცნობებთ 14 დღით ადრე ელფოსტით.',
    ],
  },
  {
    id: 'law',
    title: '10. მოქმედი კანონმდებლობა',
    body: [
      'წინამდებარე პირობები რეგულირდება საქართველოს კანონმდებლობით. დავები განიხილება თბილისის საქალაქო სასამართლოში.',
      'კონტაქტი: legal@mcodne.ge',
    ],
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <main className="max-w-[820px] mx-auto px-6 py-16 lg:py-20">
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">
          სამართალი
        </div>
        <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05]">
          გამოყენების წესები
        </h1>
        <p className="mt-2 text-[12.5px] text-ink-500 tabular-nums">ბოლო განახლება: 2026 წლის 1 ივლისი</p>

        <p className="mt-6 text-[16px] text-ink-700 leading-relaxed">
          წინამდებარე პირობები არეგულირებს მცოდნე პლატფორმის გამოყენებას. გთხოვთ, ყურადღებით წაიკითხოთ — ეს
          დოკუმენტი ეხება როგორც კლიენტებს, ისე ექსპერტებს.
        </p>

        <nav className="mt-8 rounded-card border border-ink-200 bg-ink-50/50 p-5">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-600 mb-3">
            შინაარსი
          </div>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-ink-700">
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
              <h2 className="font-display text-xl lg:text-2xl font-bold text-ink-900 tracking-tight">{s.title}</h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <p key={i} className="text-[14.5px] text-ink-700 leading-relaxed max-w-prose">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-ink-200 flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" className="text-[13px] text-brand-700 hover:text-brand-800 font-semibold">
            ← მთავარზე დაბრუნება
          </Link>
          <div className="text-[12.5px] text-ink-500">
            იხილე ასევე{' '}
            <Link href="/privacy" className="text-brand-700 hover:text-brand-800 font-semibold">
              პრივატულობა
            </Link>{' '}
            და{' '}
            <Link href="/cookies" className="text-brand-700 hover:text-brand-800 font-semibold">
              ქუქიები
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
