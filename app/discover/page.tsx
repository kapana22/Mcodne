'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Container } from '@/components/Container'
import { Footer as SharedFooter } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'

type Item = { q: string; snippet: string; cat: string; slug: string }

// Curated "Discover" feed — the popular questions clients ask, each opening the
// Ask thread (matched experts + framing). Mirrors Perplexity's browsable feed.
const FEED: Item[] = [
  { q: 'როგორ მოვძებნო product-market fit?', snippet: 'ადრეული სტარტაპის #1 კითხვა — სიგნალები, ექსპერიმენტები და როდის უნდა pivot.', cat: 'ბიზნესი', slug: 'business' },
  { q: 'რა გადასახადს ვიხდი IP სტატუსით?', snippet: 'ინდივიდუალური მეწარმის საგადასახადო რეჟიმი, 1% ბრუნვაზე და ხაფანგები.', cat: 'ფინანსები', slug: 'finance' },
  { q: 'FAANG ინტერვიუსთვის როგორ მოვემზადო?', snippet: 'system design, behavioral და coding — რას აქცევენ ყურადღებას რეალურად.', cat: 'კარიერა', slug: 'career' },
  { q: 'Series A-სთვის რა მეტრიკები მჭირდება?', snippet: 'MRR, growth rate, retention — რა რიცხვები უნდა აჩვენო ინვესტორს.', cat: 'ბიზნესი', slug: 'business' },
  { q: 'სტარტაპის კონტრაქტში რა შევცვალო?', snippet: 'founder agreement, vesting, IP assignment — სად არის ხაფანგები.', cat: 'სამართალი', slug: 'law' },
  { q: 'როგორ ავაწყო SMM სტრატეგია?', snippet: 'არხის არჩევა, კონტენტ-პლანი და პირველი 90 დღე ბიუჯეტის გარეშე.', cat: 'მარკეტინგი', slug: 'marketing' },
  { q: 'როგორ ვალაპარაკო ხელფასზე?', snippet: 'offer-ის მიღების შემდეგ — რას ამბობ, რას არა და როგორ ზრდი ნომერს.', cat: 'კარიერა', slug: 'career' },
  { q: 'burnout-ს როგორ გავუმკლავდე?', snippet: 'ნიშნები, საზღვრები და პრაქტიკული ნაბიჯები აღდგენისთვის.', cat: 'ფსიქოლოგია', slug: 'psychology' },
  { q: 'შპს თუ ინდ. მეწარმე — რომელი ჯობია?', snippet: 'პასუხისმგებლობა, გადასახადები და როდის ღირს გადასვლა.', cat: 'ფინანსები', slug: 'finance' },
  { q: 'როგორ ავაწყო gtm სტრატეგია?', snippet: 'go-to-market — პირველი 100 კლიენტი და არხების ტესტირება.', cat: 'ბიზნესი', slug: 'business' },
  { q: 'NDA როგორ შევადგინო?', snippet: 'რა უნდა შეიცავდეს, რა არა და როდის ნამდვილად გჭირდება.', cat: 'სამართალი', slug: 'law' },
  { q: 'ბრენდი როგორ განვასხვავო?', snippet: 'positioning, ტონი და ვიზუალი — რით გამოირჩევი გაჯერებულ ბაზარზე.', cat: 'მარკეტინგი', slug: 'marketing' },
]

const CHIPS = [
  { l: 'ყველა', slug: '' },
  { l: 'ბიზნესი', slug: 'business' },
  { l: 'ფინანსები', slug: 'finance' },
  { l: 'კარიერა', slug: 'career' },
  { l: 'სამართალი', slug: 'law' },
  { l: 'მარკეტინგი', slug: 'marketing' },
  { l: 'ფსიქოლოგია', slug: 'psychology' },
]

export default function DiscoverPage() {
  const [filter, setFilter] = useState('')
  const items = filter ? FEED.filter(i => i.slug === filter) : FEED

  return (
    <div className="font-sans bg-white text-ink-900 antialiased min-h-screen flex flex-col">
      <PublicTopBar />

      <Container as="main" size="content" className="flex-1 w-full py-8 lg:py-12">
        <Eyebrow className="mb-3 inline-flex items-center gap-2">
          <Icon.globe className="w-4 h-4" /> აღმოაჩინე
        </Eyebrow>
        <h1 className="font-display text-[28px] sm:text-[36px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
          პოპულარული კითხვები
        </h1>
        <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[560px]">
          აირჩიე კითხვა — მაშინვე ნახავ ვინ დაგეხმარება და რა უნდა მოამზადო. ან დასვი შენი.
        </p>

        {/* Category chips */}
        <div className="mt-6 flex flex-wrap gap-1.5">
          {CHIPS.map(c => (
            <button key={c.slug} type="button" onClick={() => setFilter(c.slug)} className={`h-8 px-3.5 rounded-pill font-display text-[12.5px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${filter === c.slug ? 'bg-brand-500 text-white' : 'bg-white border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'}`}>
              {c.l}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="mt-6 grid sm:grid-cols-2 gap-3">
          {items.map((it, i) => (
            <Link key={i} href={`/ask?q=${encodeURIComponent(it.q)}`} className="group rounded-card border border-ink-200 bg-white hover:border-brand-300 hover:shadow-card p-5 flex flex-col transition-all">
              <div className="inline-flex items-center gap-1.5 h-5 px-2 rounded-pill bg-brand-50 text-brand-700 font-display text-[10px] font-bold uppercase tracking-[0.12em] self-start mb-3">
                {it.cat}
              </div>
              <h3 className="font-display text-[15px] font-bold text-ink-900 leading-snug group-hover:text-brand-700 transition-colors">{it.q}</h3>
              <p className="mt-1.5 text-[12.5px] text-ink-600 leading-[1.5] line-clamp-2">{it.snippet}</p>
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center">
                <span className="font-display text-[11px] font-semibold text-ink-500 group-hover:text-brand-700 transition-colors">ვინ პასუხობს</span>
              </div>
            </Link>
          ))}
        </div>
      </Container>

      <SharedFooter />
    </div>
  )
}
