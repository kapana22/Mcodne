import Link from 'next/link'
import type { Metadata } from 'next'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'ბლოგი — მცოდნე',
  description: 'ცოდნა, პრაქტიკული რჩევები და ინსაითი ქართველი ექსპერტებისგან.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'ბლოგი — მცოდნე',
    description: 'ცოდნა, პრაქტიკული რჩევები და ინსაითი ქართველი ექსპერტებისგან.',
    url: `${SITE_URL}/blog`,
  },
}

const ARTICLES = [
  {
    tag: 'ბიზნესი',
    color: 'brand',
    title: 'როგორ ვიპოვოთ product-market fit ქართულ ბაზარზე',
    excerpt:
      '4 ეტაპიანი მეთოდი, რომელიც სტარტაპებს ეხმარება პირველი 100 მომხმარებლის შეძენაში — რეალური მაგალითებით.',
    date: 'მალე',
    read: '8 წუთი',
  },
  {
    tag: 'კარიერა',
    color: 'accent',
    title: 'ხელფასზე მოლაპარაკება: 7 შეცდომა, რომელიც არ უნდა დაუშვა',
    excerpt:
      'ტოპ რეკრუტერების გამოცდილება — რა ითქვას ინტერვიუზე, როცა შენ გეკითხებიან „რამდენს ელოდები?"',
    date: 'მალე',
    read: '6 წუთი',
  },
  {
    tag: 'ფინანსები',
    color: 'iris',
    title: 'IP სტატუსი vs. LLC — რა აირჩიო ფრილანსერმა 2026 წელს',
    excerpt:
      'დეტალური შედარება გადასახადების, ბუღალტერიის და საერთაშორისო ანგარიშსწორების პერსპექტივიდან.',
    date: 'მალე',
    read: '10 წუთი',
  },
]

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <main className="max-w-[1080px] mx-auto px-6 sm:px-8 py-16 lg:py-24">
        <div className="max-w-[680px]">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">
            ბლოგი
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            პრაქტიკული ცოდნა, პირდაპირ ექსპერტებისგან
          </h1>
          <p className="mt-6 text-[17px] text-ink-600 leading-relaxed">
            მცოდნის ბლოგი მალე ამოქმედდება — გამოქვეყნდება პრაქტიკული სახელმძღვანელოები, კონსულტანტების ჩანაწერები და
            ინდუსტრიის ანალიზი. ქვემოთ ხედავ პირველ სტატიებს, რომლებზეც ვმუშაობთ.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-pill bg-warning-50 border border-warning-200 text-warning-800">
            <Icon.bolt className="w-3.5 h-3.5" />
            <span className="font-display text-[12px] font-semibold tracking-wide">
              მალე გამოვა — მიიღე პირველი შეტყობინება
            </span>
          </div>
        </div>

        <section className="mt-14">
          <div className="flex items-end justify-between gap-6 mb-8">
            <div>
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">
                მალე
              </div>
              <h2 className="font-display text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">
                პირველი სტატიები
              </h2>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {ARTICLES.map(a => (
              <article
                key={a.title}
                aria-label={`${a.title} — მალე გამოქვეყნდება`}
                className="group relative rounded-card border border-dashed border-ink-200 bg-white p-6 flex flex-col transition-all"
              >
                <div className="flex items-center gap-2 self-start">
                  <div
                    className={`inline-flex items-center h-6 px-2.5 rounded-pill bg-${a.color}-50 text-${a.color}-700 font-display text-[10.5px] font-semibold uppercase tracking-[0.14em]`}
                  >
                    {a.tag}
                  </div>
                  <div className="inline-flex items-center h-6 px-2 rounded-pill bg-ink-100 text-ink-600 font-display text-[10px] font-semibold uppercase tracking-[0.14em]">
                    მალე
                  </div>
                </div>
                <h3 className="font-display text-[17px] font-bold text-ink-900 mt-4 leading-snug tracking-tight">
                  {a.title}
                </h3>
                <p className="mt-3 text-[13.5px] text-ink-600 leading-relaxed flex-1">{a.excerpt}</p>
                <div className="mt-5 pt-4 border-t border-ink-100 flex items-center justify-between text-[11.5px] text-ink-500 tabular-nums">
                  <span>{a.date}</span>
                  <span className="inline-flex items-center gap-1">
                    <Icon.clock className="w-3 h-3" />
                    {a.read}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-card border border-ink-200 bg-ink-50/50 p-8 lg:p-12">
          <div className="max-w-[560px]">
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight leading-tight">
              გინდა, რომ პირველს გამოგიგზავნოთ?
            </h2>
            <p className="mt-3 text-[15px] text-ink-600 leading-relaxed">
              დაგვიკავშირდი — შეგატყობინებთ, როგორც კი პირველი სტატია გამოქვეყნდება. სპამი გამორიცხულია.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex h-11 px-5 rounded-btn bg-ink-900 hover:bg-ink-800 text-white font-display font-semibold text-[13.5px] items-center gap-2 transition-colors"
            >
              მაცნობე გამოსვლისას <Icon.arrow className="w-4 h-4" />
            </Link>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  )
}
