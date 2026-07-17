import Link from 'next/link'
import type { Metadata } from 'next'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'

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
    title: 'გადამოწმებული ცოდნა',
    body: 'ყოველი ექსპერტი ხელით მოწმდება — გამოცდილება, პორტფოლიო და რეპუტაცია. ცოდნა უნდა იყოს ნამდვილი.',
  },
  {
    icon: <Icon.wallet className="w-5 h-5" />,
    title: 'გამჭვირვალე ფასი',
    body: 'ერთი ფასი, ერთი გვერდი. თანხა ინახება escrow-ში და ექსპერტს გადაერიცხება მხოლოდ სესიის შემდეგ.',
  },
  {
    icon: <Icon.clock className="w-5 h-5" />,
    title: 'ღირებული დრო',
    body: 'ფასი წინასწარ ცნობილია — გადაიხდი მხოლოდ დაჯავშნისას. სესია 40 წუთია, სტრუქტურული და შედეგზე ორიენტირებული.',
  },
  {
    icon: <Icon.users className="w-5 h-5" />,
    title: 'ქართული საზოგადოება',
    body: 'ჩვენი მისიაა, ცოდნა ქართულად ხელმისაწვდომი გავხადოთ — ბიზნესი, სამართალი, კარიერა, ფსიქოლოგია.',
  },
]

const STATS = [
  { n: '142+', l: 'გადამოწმებული ექსპერტი' },
  { n: '6', l: 'პროფესიული სფერო' },
  { n: '4.9', l: 'საშუალო რეიტინგი' },
  { n: '2024', l: 'დაფუძნების წელი' },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <main className="max-w-[1080px] mx-auto px-6 sm:px-8 py-16 lg:py-24">
        <div className="max-w-[720px]">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">
            ჩვენს შესახებ
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05] motion-safe:animate-rise-in">
            ცოდნა, რომელსაც შენ ენდობი
          </h1>
          <p className="mt-6 text-[17px] text-ink-600 leading-relaxed">
            მცოდნე დაარსდა 2024 წელს — მარტივი მიზნით. საქართველოში ბევრი ადამიანი ეძებს პასუხს რთულ პროფესიულ
            კითხვებზე, მაგრამ ვერ პოულობს გამოცდილ ექსპერტს, ვისაც ენდობა. ჩვენ ვქმნით ცოდნის არქივს, სადაც
            შენ ხვდები საუკეთესო სპეციალისტებს — მოკლედ, პირდაპირ და უსაფრთხოდ.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 pt-10 border-t border-ink-200">
          {STATS.map(s => (
            <div key={s.l}>
              <div className="font-display text-3xl lg:text-4xl font-bold text-ink-900 tabular-nums tracking-tight">
                {s.n}
              </div>
              <div className="mt-2 text-[13px] text-ink-500 leading-snug">{s.l}</div>
            </div>
          ))}
        </div>

        <section className="mt-20">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">
            რას გვჯერა
          </div>
          <h2 className="font-display text-3xl font-bold text-ink-900 tracking-tight">ჩვენი პრინციპები</h2>
          <div className="mt-8 grid sm:grid-cols-2 gap-4 motion-safe:stagger">
            {VALUES.map(v => (
              <div key={v.title} className="rounded-card border border-ink-200 bg-white p-6 hover-lift">
                <div className="w-10 h-10 rounded-btn bg-brand-50 text-brand-700 flex items-center justify-center">
                  {v.icon}
                </div>
                <div className="font-display text-[17px] font-bold text-ink-900 mt-4">{v.title}</div>
                <p className="mt-2 text-[14px] text-ink-600 leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16">
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">
              ისტორია
            </div>
            <h2 className="font-display text-3xl font-bold text-ink-900 tracking-tight leading-tight">
              როგორ დაიწყო მცოდნე
            </h2>
          </div>
          <div className="space-y-5 text-[15px] text-ink-700 leading-relaxed">
            <p>
              იდეა დაიბადა უბრალო კითხვიდან — რატომ არის ასე ძნელი საქართველოში კარგი კონსულტაციის მიღება?
              დამფუძნებელი გუნდი წლების განმავლობაში მუშაობდა ტექნოლოგიურ და საკონსულტაციო კომპანიებში და ხედავდა,
              რომ ცოდნა არსებობს — მაგრამ სისტემურად ხელმისაწვდომი არ არის.
            </p>
            <p>
              პირველი ვერსია გავუშვით 2024 წელს, ხელით შერჩეული 20 ექსპერტით ბიზნესის, ფინანსების და კარიერის
              მიმართულებებში. ერთ წელიწადში პლატფორმა 142 ექსპერტამდე გაიზარდა და მოიცავს ექვს პროფესიულ სფეროს.
            </p>
            <p>
              დღეს მცოდნე არის ცოდნის არქივი ქართული საზოგადოებისთვის — სადაც ერთი 40-წუთიანი საუბარი შეიძლება
              შენს პროექტს, კარიერას ან ცხოვრებას შეცვლის.
            </p>
          </div>
        </section>

        <section className="mt-20 rounded-card bg-accent-900 text-white p-10 lg:p-14 relative overflow-hidden">
          <div className="max-w-[560px] relative z-10">
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-300 mb-3">
              შემოგვიერთდი
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
              ხარ ექსპერტი? გვინდა შენი ცოდნა
            </h2>
            <p className="mt-4 text-[15px] text-white/75 leading-relaxed">
              თუ გაქვს 5+ წლის გამოცდილება და გინდა შენი ცოდნა გაუზიარო სხვას — შემოგვიერთდი. განაცხადს
              განვიხილავთ 3 დღეში.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/apply"
                className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] inline-flex items-center gap-2 transition-colors"
              >
                გახდი ექსპერტი <Icon.arrow className="w-4 h-4" />
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

        <Footer />
      </main>
    </div>
  )
}
