import Link from 'next/link'
import type { Metadata } from 'next'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'ქუქიები — მცოდნე',
  description: 'როგორ იყენებს მცოდნე ქუქი-ფაილებს — მოკლედ და გამჭვირვალედ.',
  alternates: { canonical: `${SITE_URL}/cookies` },
  openGraph: {
    title: 'ქუქიები — მცოდნე',
    description: 'როგორ იყენებს მცოდნე ქუქი-ფაილებს — მოკლედ და გამჭვირვალედ.',
    url: `${SITE_URL}/cookies`,
  },
}

const CATEGORIES = [
  {
    name: 'აუცილებელი',
    tag: 'ყოველთვის აქტიური',
    body: 'პლატფორმის ძირითადი მუშაობისთვის — ავტორიზაცია, სესია, უსაფრთხოება (CSRF). ამ ქუქიების გარეშე საიტი არ იმუშავებს.',
    examples: ['mcodne_session', 'csrf_token', 'auth_state'],
  },
  {
    name: 'პარამეტრები',
    tag: 'შენ აკონტროლებ',
    body: 'გახსოვს შენი პირადი პარამეტრები — ენა, თემა, უკანასკნელი ძებნა. თუ გამორთავ, ინტერფეისი დაბრუნდება ნაგულისხმევზე.',
    examples: ['ui_locale', 'theme_pref', 'recent_filters'],
  },
  {
    name: 'ანალიტიკა',
    tag: 'შენ აკონტროლებ',
    body: 'გვეხმარება გავიგოთ, თუ როგორ გამოიყენება პლატფორმა — რომელი გვერდები არის სასარგებლო და სად ხდება შეცდომები. მონაცემები აგრეგირებულია.',
    examples: ['_ga', '_gid', 'mcodne_analytics'],
  },
  {
    name: 'მარკეტინგი',
    tag: 'შენ აკონტროლებ',
    body: 'გამოიყენება რეკლამის რელევანტურობის გასაუმჯობესებლად და კამპანიების ეფექტიანობის გასაზომად. თუ გამორთავ, რეკლამა მაინც გამოჩნდება, უბრალოდ ნაკლებად პერსონალიზებული.',
    examples: ['fbp', 'ads_click_id', 'mcodne_campaign'],
  },
]

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <main className="max-w-[820px] mx-auto px-6 py-16 lg:py-20">
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">
          სამართალი
        </div>
        <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05]">
          ქუქი-ფაილების პოლიტიკა
        </h1>
        <p className="mt-2 text-[12.5px] text-ink-500 tabular-nums">ბოლო განახლება: 2026 წლის 1 ივლისი</p>
        <p className="mt-6 text-[16px] text-ink-700 leading-relaxed">
          ქუქი-ფაილი (cookie) მცირე ტექსტური ფაილია, რომელსაც ვებგვერდი ინახავს შენს მოწყობილობაზე. მცოდნე იყენებს
          ქუქიებს პლატფორმის მუშაობის უზრუნველყოფისთვის, შენი პარამეტრების დამახსოვრებისთვის და მომსახურების
          გასაუმჯობესებლად.
        </p>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-ink-900 tracking-tight">კატეგორიები</h2>
          <div className="mt-6 space-y-4">
            {CATEGORIES.map(c => (
              <div key={c.name} className="rounded-card border border-ink-200 bg-white p-5 lg:p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-display text-[17px] font-bold text-ink-900">{c.name}</div>
                    <p className="mt-2 text-[14px] text-ink-600 leading-relaxed">{c.body}</p>
                  </div>
                  <span
                    className="inline-flex items-center h-6 px-2.5 rounded-pill bg-brand-50 text-brand-700 font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] shrink-0"
                  >
                    {c.tag}
                  </span>
                </div>
                <div className="mt-4 pt-4 border-t border-ink-100">
                  <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-2">
                    მაგალითები
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.examples.map(x => (
                      <code
                        key={x}
                        className="text-[11.5px] font-mono bg-ink-50 text-ink-700 px-2 py-1 rounded-btn"
                      >
                        {x}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-ink-900 tracking-tight">როგორ ვაკონტროლო</h2>
          <p className="mt-4 text-[14.5px] text-ink-700 leading-relaxed">
            შენ შეგიძლია ნებისმიერ დროს გამორთო ან წაშალო ქუქიები შენი ბრაუზერის პარამეტრებში. გახსოვდეს, რომ
            აუცილებელი ქუქიების გამორთვა შესაძლოა შეზღუდოს პლატფორმის ფუნქციონალი — მაგალითად, ვერ შეხვალ ანგარიშში.
          </p>
          <ul className="mt-4 space-y-2 text-[14px] text-ink-700 leading-relaxed">
            <li>
              <b>Chrome:</b> Settings → Privacy → Cookies and other site data
            </li>
            <li>
              <b>Safari:</b> Preferences → Privacy → Manage Website Data
            </li>
            <li>
              <b>Firefox:</b> Options → Privacy → Cookies and Site Data
            </li>
          </ul>
        </section>

        <section className="mt-12 pt-8 border-t border-ink-200">
          <h2 className="font-display text-xl font-bold text-ink-900 tracking-tight">კითხვები?</h2>
          <p className="mt-3 text-[14px] text-ink-600 leading-relaxed">
            თუ გაქვს კითხვა ქუქიების ან პირადი მონაცემების შესახებ, დაწერე{' '}
            <a href="mailto:privacy@mcodne.ge" className="text-brand-700 hover:text-brand-800 font-semibold">
              privacy@mcodne.ge
            </a>
            . დამატებით ინფორმაცია იხილე{' '}
            <Link href="/privacy" className="text-brand-700 hover:text-brand-800 font-semibold">
              პრივატულობის პოლიტიკაში
            </Link>
            .
          </p>
        </section>
      </main>

      <Footer />
    </div>
  )
}
