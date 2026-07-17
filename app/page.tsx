'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PAYMENTS_LIVE, COMMISSION_PCT, TUTOR_PAYOUT_PCT } from '@/lib/flags'
import { RecentTutorsStrip } from '@/components/RecentTutorsStrip'

/* ───── Icons (shared) ───── */
const Icon = {
  search:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  arrow:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>,
  star:    (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>,
  play:    (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7L8 5Z" /></svg>,
  chat:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12c0 4.4-4 8-9 8a10 10 0 0 1-4-.8L3 21l1-4.4A8.2 8.2 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8Z" /></svg>,
  check:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m4 12 5 5L20 6" /></svg>,
  clock:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  shield:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  video:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" /></svg>,
  globe:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" /></svg>,
  spark:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>,
  chevD:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6" /></svg>,
  menu:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  x:       (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  mail:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 5.5L20 7" /></svg>,
  phone:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2.3Z" /></svg>,
  cal:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  wallet:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7a2 2 0 0 1 2-2h11l4 4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><circle cx="16" cy="14" r="1.4" fill="currentColor" stroke="none" /></svg>,
  user:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
  bolt:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" /></svg>,
  users:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5" /></svg>,
  trend:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 17 9 11l4 4 8-9M14 4h7v7" /></svg>,
  quote:   (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M7 7h4v4H8c0 2 1 3 3 3v3c-3.5 0-6-2-6-6V7Zm9 0h4v4h-3c0 2 1 3 3 3v3c-3.5 0-6-2-6-6V7Z" opacity=".8" /></svg>,
}

const Logo = ({ inverse }: { inverse?: boolean }) => (
  <div className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className={`h-7 w-auto object-contain select-none ${inverse ? 'brightness-0 invert' : ''}`} draggable={false} />
  </div>
)

const VerifiedMark = ({ size = 16 }: { size?: number }) => (
  <span className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

/* ───── Categories (shared data) ───── */
const CatIcon = {
  business: <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><rect x="3.5" y="9" width="21" height="14" rx="2" /><path d="M10 9V6.5A1.5 1.5 0 0 1 11.5 5h5A1.5 1.5 0 0 1 18 6.5V9" /><path d="M3.5 15.5h21" /><path d="M13 14.5v2.5" /></svg>,
  finance:  <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M3.5 11 14 5l10.5 6" /><path d="M5 11v10h18V11" /><path d="M9 14v5M14 14v5M19 14v5" /><path d="M3.5 22h21" /></svg>,
  career:   <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M14 4c4 3 6 7 6 11 0 2.5-1 4.5-2 6l-4 3-4-3c-1-1.5-2-3.5-2-6 0-4 2-8 6-11Z" /><circle cx="14" cy="13" r="2.5" /><path d="m9 21-2.5 3.5 4.5-1M19 21l2.5 3.5-4.5-1" /></svg>,
  law:      <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M14 4v19" /><path d="M8.5 23h11" /><path d="M6 9h16" /><path d="M14 5.5c-2 1.5-5.5 2.5-8 3.5M14 5.5c2 1.5 5.5 2.5 8 3.5" /><path d="m7 9-3 6h6Z" /><path d="m21 9-3 6h6Z" /></svg>,
  marketing:<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="m22.5 5-13 5H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4.5l13 5V5Z" /><path d="M9.5 16v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3" /></svg>,
  psych:    <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M14 5a4 4 0 0 0-4 4 3.5 3.5 0 0 0-3 5.5A3.5 3.5 0 0 0 10 20a3 3 0 0 0 4 2.5V5Z" /><path d="M14 5a4 4 0 0 1 4 4 3.5 3.5 0 0 1 3 5.5A3.5 3.5 0 0 1 18 20a3 3 0 0 1-4 2.5V5Z" /></svg>,
}

const categories = [
  { l: 'ბიზნესი',     d: 'სტრატეგია, ოპერაციები',   i: CatIcon.business,   c: 32, color: 'brand',   slug: 'business' },
  { l: 'ფინანსები',   d: 'ბუღალტერია, გადასახადი',  i: CatIcon.finance,    c: 18, color: 'accent',  slug: 'finance' },
  { l: 'კარიერა',     d: 'ზრდა, ინტერვიუ, CV',      i: CatIcon.career,     c: 24, color: 'iris',    slug: 'career' },
  { l: 'სამართალი',   d: 'კონტრაქტი, კონსულტაცია',  i: CatIcon.law,        c: 12, color: 'warning', slug: 'law' },
  { l: 'მარკეტინგი',  d: 'ბრენდი, რეკლამა, SMM',    i: CatIcon.marketing,  c: 21, color: 'flame',   slug: 'marketing' },
  { l: 'ფსიქოლოგია',  d: 'ცხოვრება, ურთიერთობა',    i: CatIcon.psych,      c: 17, color: 'success', slug: 'psychology' },
]

/* ───── Top nav ───── */
const TopNav = () => {
  const [menu, setMenu] = useState<'cat' | null>(null)
  const [mobOpen, setMobOpen] = useState(false)
  const navItems: { l: string; href: string }[] = [
    { l: 'ექსპერტები', href: '/tutors' },
    { l: 'პროცესი', href: '/#how' },
    { l: 'გახდი ექსპერტი', href: '/apply' },
    { l: 'ჩვენ შესახებ', href: '/about' },
    { l: 'დახმარება', href: '/help' },
  ] // mobile-only — desktop nav stays canonical 4-item
  const popularQuestions = [
    'როგორ მოვძებნო პროდუქტის market fit?',
    'უცხოურ კომპანიაში როგორ შევიდე?',
    'რა გადასახადს ვიხდი IP სტატუსით?',
    'როგორ ვალაპარაკო ხელფასზე?',
    'სტარტაპის კონტრაქტი — რა შევცვალო?',
  ]
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-ink-200 relative">
      <div>
        <div className="max-w-[1280px] mx-auto px-6 sm:px-8 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-7 min-w-0">
            <Link href="/" className="shrink-0"><Logo /></Link>
            <nav className="hidden lg:flex items-center gap-0.5">
              <Link href="/tutors" className="h-9 px-3 rounded-btn font-display text-[13px] font-medium tracking-wide text-ink-800 hover:bg-ink-50 inline-flex items-center transition-colors">ექსპერტები</Link>
              <button
                type="button"
                onClick={() => setMenu(menu === 'cat' ? null : 'cat')}
                className={`h-9 px-3 rounded-btn font-display text-[13px] font-medium tracking-wide inline-flex items-center gap-1.5 transition-colors ${menu === 'cat' ? 'bg-ink-100 text-ink-900' : 'text-ink-800 hover:bg-ink-50'}`}
                aria-expanded={menu === 'cat'}
              >
                კატეგორიები
                <Icon.chevD className={`w-3.5 h-3.5 opacity-60 transition-transform ${menu === 'cat' ? 'rotate-180' : ''}`} />
              </button>
              <Link href="/#how" className="h-9 px-3 rounded-btn font-display text-[13px] font-medium tracking-wide inline-flex items-center transition-colors text-ink-800 hover:bg-ink-50">პროცესი</Link>
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <button type="button" disabled aria-disabled title="English ვერსია მალე გახდება ხელმისაწვდომი" className="hidden xl:inline-flex items-center gap-1 h-9 px-2.5 rounded-pill bg-ink-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <Icon.globe className="w-3.5 h-3.5 text-ink-600" />
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-700 ml-0.5">ქარ</span>
              <Icon.chevD className="w-3 h-3 text-ink-500 ml-0.5" />
            </button>
            <Link href="/apply" className={`hidden md:inline-flex h-9 px-3 rounded-btn font-display font-medium tracking-wide text-[13px] items-center transition-colors text-ink-800 hover:bg-ink-50`}>გახდი ექსპერტი</Link>
            <div className="hidden md:block w-px h-5 bg-ink-200 mx-1.5" />
            <Link href="/signin" className="hidden md:inline-flex h-9 px-3 rounded-btn font-display font-medium tracking-wide text-[13px] text-ink-800 hover:bg-ink-50 items-center transition-colors">შესვლა</Link>
            <Link href="/signup" className="hidden sm:inline-flex font-display font-semibold text-[12.5px] tracking-wide bg-brand-500 hover:bg-brand-600 text-white h-9 px-3.5 sm:px-4 rounded-btn transition-colors items-center gap-1.5">
              დაიწყე
              <Icon.arrow className="w-3.5 h-3.5" />
            </Link>
            <button type="button" onClick={() => setMobOpen(o => !o)} aria-label="მენიუ" aria-expanded={mobOpen} className="lg:hidden w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-900 hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center transition-colors">
              {mobOpen ? <Icon.x className="w-5 h-5" /> : <Icon.menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobOpen && (
          <>
            <button type="button" aria-label="დახურვა" onClick={() => setMobOpen(false)} className="lg:hidden fixed inset-0 z-50 bg-accent-900/50 backdrop-blur-sm" />
            <aside className="lg:hidden fixed top-0 right-0 bottom-0 z-[51] w-[300px] max-w-[85vw] bg-white shadow-float flex flex-col">
              <div className="h-16 px-5 flex items-center justify-between border-b border-ink-200 shrink-0">
                <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.22em] text-ink-500">მენიუ</span>
                <button type="button" onClick={() => setMobOpen(false)} aria-label="დახურვა" className="w-10 h-10 rounded-btn text-ink-700 hover:bg-ink-100 inline-flex items-center justify-center transition-colors">
                  <Icon.x className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-5 py-2 flex flex-col">
                {navItems.map(it => (
                  <Link key={it.l} href={it.href} onClick={() => setMobOpen(false)} className="h-12 flex items-center justify-between text-[15px] font-display font-medium text-ink-800 border-b border-ink-100 last:border-b-0">
                    {it.l}
                    <Icon.arrow className="w-4 h-4 text-ink-300" />
                  </Link>
                ))}
              </nav>
              <div className="px-5 py-4 border-t border-ink-200 shrink-0 space-y-2.5 bg-ink-50/40">
                <Link href="/signup" onClick={() => setMobOpen(false)} className="w-full h-11 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors">
                  დაიწყე უფასოდ <Icon.arrow className="w-3.5 h-3.5" />
                </Link>
                <Link href="/signin" onClick={() => setMobOpen(false)} className="w-full h-11 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center transition-colors">
                  შესვლა
                </Link>
              </div>
            </aside>
          </>
        )}

        {menu === 'cat' && (
          <>
            <div className="absolute top-full left-0 right-0 bg-white border-t border-b border-ink-200 shadow-pop z-30">
              <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-10 grid grid-cols-[1fr_320px] gap-12">
                <div>
                  <div className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-6">სფეროები · ხელით შერჩეული ბაზა</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {categories.map(c => (
                      <Link key={c.l} href={`/tutors?category=${c.slug}`} onClick={() => setMenu(null)} className="group flex items-center gap-3 p-3 rounded-card hover:bg-ink-50 transition-colors text-left">
                        <div className={`w-9 h-9 rounded-card flex items-center justify-center bg-${c.color}-50 text-${c.color}-700 shrink-0 group-hover:bg-${c.color}-500 group-hover:text-white transition-colors`}>{React.cloneElement(c.i, { className: 'w-4 h-4' })}</div>
                        <div className="min-w-0">
                          <div className="font-display text-[13px] font-bold text-ink-900 leading-tight">{c.l}</div>
                          <div className="text-[11px] text-ink-500 mt-0.5">{c.d}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="pl-10 border-l border-ink-200">
                  <div className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-6">პოპულარული შეკითხვები</div>
                  <ul className="space-y-3.5">
                    {popularQuestions.map(q => (
                      <li key={q}>
                        <Link href={`/ask?q=${encodeURIComponent(q)}`} onClick={() => setMenu(null)} className="text-[13px] text-ink-800 hover:text-brand-700 inline-flex items-start gap-2 group leading-snug text-left">
                          <Icon.arrow className="w-3.5 h-3.5 mt-0.5 text-ink-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                          <span>{q}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href="/discover" onClick={() => setMenu(null)} className="mt-7 pt-5 border-t border-ink-100 flex items-center gap-1.5 font-display text-[11.5px] font-semibold tracking-[0.12em] uppercase text-brand-700 hover:text-brand-800">
                    ნახე ყველა შეკითხვა <Icon.arrow className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
            <button type="button" aria-label="დახურვა" className="fixed inset-0 bg-accent-900/15 backdrop-blur-sm -z-10 cursor-default" onClick={() => setMenu(null)} />
          </>
        )}
      </div>
    </header>
  )
}

/* ───── Shared footer ───── */
const Footer = () => (
  <footer className="bg-white border-t border-ink-200">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-16">
      <div className="grid md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 mb-12">
        <div>
          <Logo />
          <p className="text-[13px] text-ink-600 mt-5 max-w-[280px] leading-relaxed">პირადი ვიდეო-კონსულტაცია ქართველ პროფესიონალებთან. ქართულ ბაზარზე, ქართულ ფასებზე.</p>
          <div className="mt-5 inline-flex items-center gap-2 text-[12px] text-ink-500">
            <Icon.shield className="w-4 h-4 text-ink-400" />
            {PAYMENTS_LIVE ? (
              <span className="font-display font-semibold text-ink-700 tracking-wide">escrow-ით დაცული გადახდები</span>
            ) : (
              <span>უსაფრთხო გადახდები · <span className="font-display font-semibold text-ink-700 tracking-wide">მალე</span></span>
            )}
          </div>
        </div>
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-4">პროდუქტი</div>
          <ul className="space-y-2.5">
            <li><Link href="/tutors" className="text-[13px] text-ink-700 hover:text-ink-900">ექსპერტები</Link></li>
            <li><Link href="/tutors" className="text-[13px] text-ink-700 hover:text-ink-900">კატეგორიები</Link></li>
            <li><Link href="/#how" className="text-[13px] text-ink-700 hover:text-ink-900">როგორ მუშაობს</Link></li>
            <li><Link href="/apply" className="text-[13px] text-ink-700 hover:text-ink-900">გახდი ექსპერტი</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-4">კომპანია</div>
          <ul className="space-y-2.5">
            <li><Link href="/about" className="text-[13px] text-ink-700 hover:text-ink-900 min-h-[32px] inline-flex items-center">ჩვენ შესახებ</Link></li>
            <li><Link href="/blog" className="text-[13px] text-ink-700 hover:text-ink-900 min-h-[32px] inline-flex items-center">ბლოგი</Link></li>
            <li><Link href="/contact" className="text-[13px] text-ink-700 hover:text-ink-900 min-h-[32px] inline-flex items-center">დაგვიკავშირდი</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-4">დახმარება</div>
          <ul className="space-y-2.5">
            <li><Link href="/help" className="text-[13px] text-ink-700 hover:text-ink-900 min-h-[32px] inline-flex items-center">დახმარების ცენტრი</Link></li>
            <li><Link href="/help" className="text-[13px] text-ink-700 hover:text-ink-900 min-h-[32px] inline-flex items-center">FAQ</Link></li>
            <li><Link href="/terms" className="text-[13px] text-ink-700 hover:text-ink-900 min-h-[32px] inline-flex items-center">წესები</Link></li>
            <li><Link href="/privacy" className="text-[13px] text-ink-700 hover:text-ink-900 min-h-[32px] inline-flex items-center">კონფიდენციალურობა</Link></li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pt-8 border-t border-ink-200 gap-4">
        <div className="text-[12px] text-ink-500">© 2026 მცოდნე. ყველა უფლება დაცულია.</div>
        <div className="flex items-center gap-3 text-[12px] text-ink-500">
          {/* Language toggle disabled until real i18n lands — mutating `<html lang>`
              alone does nothing visible, so it read as a broken button. */}
          <span className="text-ink-400">ქართული</span>
          <span className="text-ink-300">·</span>
          <span>თბილისი, საქართველო</span>
        </div>
      </div>
    </div>
  </footer>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* HOME VIEW                                                            */
/* ═══════════════════════════════════════════════════════════════════ */

// Shape used by HomeHero + FeaturedExperts + ExpertCard.
type Expert = {
  id?: string
  name: string
  cat: string
  headline: string
  quote: string
  rate: number
  reviews: number
  sessions: number
  price: number
  durationMin: number
  next: string
  online: boolean
  video: boolean
  verified: boolean
  photo: string
}

// Compact Georgian label for the next free slot — must tell the same truth as
// the /tutors card ("დღეს" / "ხვალ" / weekday). A static placeholder here used
// to over-promise relative to the detail page.
const KA_DAYS_SHORT = ['კვ.', 'ორშ.', 'სამშ.', 'ოთხ.', 'ხუთ.', 'პარ.', 'შაბ.']
function fmtNextShort(iso: string | null | undefined): string {
  if (!iso) return 'გამოცხადდება მალე'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'გამოცხადდება მალე'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((that.getTime() - today.getTime()) / 86_400_000)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (diffDays <= 0) return `დღეს ${hm}`
  if (diffDays === 1) return `ხვალ ${hm}`
  return `${KA_DAYS_SHORT[d.getDay()]} ${d.getDate()}, ${hm}`
}

// Map a TutorProfile row from /api/tutors → Expert shape used by hero cards.
function mapTutorToExpert(t: any): Expert {
  const initials = (t?.user?.fullName ?? 'ე ე').split(' ').map((s: string) => s[0]).join('').slice(0, 2)
  return {
    id: t.id,
    name: t?.user?.fullName ?? 'ექსპერტი',
    cat: t?.category?.name ?? t?.specialty ?? 'სფერო',
    headline: t?.headline ?? '',
    quote: (t?.bio ?? '').slice(0, 140),
    rate: typeof t?.rating === 'number' ? t.rating : 0,
    reviews: t?.reviewsCount ?? 0,
    sessions: t?.sessionsCount ?? 0,
    // Shared fallback — MUST match TUTOR_DEFAULTS.price (80) in the /tutors
    // surfaces so the same missing-price row never shows two different numbers.
    price: t?.price ?? 80,
    durationMin: t?.consultationDurationMin ?? 30,
    next: fmtNextShort(t?.nextSlotAt),
    online: false,
    video: Boolean(t?.videoUrl),
    verified: t?.verified ?? false,
    // Fall back to the user's avatar URL, then to a neutral initials placeholder
    // (no unsplash stock photos — a stock photo tied to a real name reads as a
    // fake identity to crawlers and undermines the "hand-picked" trust claim).
    photo: t?.user?.avatarUrl ?? `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'><rect width='320' height='320' fill='%23e5e5e9'/><text x='160' y='190' font-family='sans-serif' font-size='120' fill='%237a7a82' text-anchor='middle'>${initials}</text></svg>`,
    )}`,
  }
}

const HomeHero = () => {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const quickTopics = ['Series A pitch', 'FAANG ინტერვიუ', 'IP სტატუსი', 'product-market fit']
  // Real featured tutors — replaces the previous hardcoded fixture that leaked
  // "გიორგი მელაძე" and other fake names to SSR HTML (crawler / social preview
  // saw them as real tutors). Starts empty so first paint has no fake identities.
  const [experts, setExperts] = useState<Expert[]>([])
  const [stats, setStats] = useState<{ total: number; avg: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    // Top experts anchor the hero preview card. We deliberately do NOT gate on
    // `featured` — if nothing is editorially featured the hero must still show a
    // real, strong expert (otherwise it renders an empty skeleton forever).
    fetch('/api/tutors?limit=8')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        setExperts(rows.map(mapTutorToExpert))
      })
      .catch(() => {})
    // Real aggregate numbers — honest, never fabricated.
    fetch('/api/tutors/stats')
      .then(r => (r.ok ? r.json() : null))
      .then((s: any) => {
        if (cancelled || !s) return
        setStats({ total: s.total ?? 0, avg: s.avgRating ?? 0 })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const featured = experts[0]
  const sidekicks = experts.slice(1, 5)

  return (
    <section className="relative bg-white overflow-hidden border-b border-ink-200">
      {/* Restrained backdrop — barely-there brand tint, premium/clean. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-brand-50/25 via-white to-white pointer-events-none" />
      <div aria-hidden className="absolute top-0 right-0 w-[640px] h-[640px] -translate-y-1/3 translate-x-1/4 rounded-full bg-brand-100/20 blur-3xl pointer-events-none" />

      <div className="relative max-w-[1280px] mx-auto px-6 sm:px-8 pt-8 sm:pt-14 lg:pt-20 pb-12 sm:pb-16 lg:pb-24">
        {/* Trust strip — clean, single line */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6 sm:mb-10 lg:mb-12">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
            <Icon.shield className="w-3.5 h-3.5 text-ink-400" />
            <span>ხელით შერჩეული ბაზა · ინდივიდუალურად შემოწმებული</span>
          </span>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 xl:gap-20 items-start">
          {/* Left — headline + search + stats */}
          <div className="min-w-0">
            <h1 className="font-display font-bold text-ink-900 leading-[1.02] sm:leading-[0.96] tracking-[-0.03em] text-[34px] sm:text-[58px] lg:text-[72px] motion-safe:animate-rise-in">
              60 წუთი ექსპერტთან —<br />
              {/* The one gradient-signature moment on this page. */}
              <span className="bg-gradient-signature bg-clip-text text-transparent">3 თვის გუგლის ნაცვლად.</span>
            </h1>
            <p className="mt-7 sm:mt-8 text-[16px] sm:text-[17.5px] text-ink-700 max-w-[540px] leading-[1.6] motion-safe:animate-rise-in" style={{ animationDelay: '80ms' }}>
              McKinsey, BCG, FAANG, BIG4 — ქართველი პროფესიონალები, რომლებიც გადასახადს, კარიერას ან Series A-ს ვიდეო-სესიით გადაგიწყვეტენ. <span className="font-display font-semibold text-ink-900">აირჩიე დრო, დაჯავშნე, შეხვდი.</span>
            </p>

            {/* Search bar */}
            <div className="mt-9 sm:mt-10 motion-safe:animate-rise-in" style={{ animationDelay: '160ms' }}>
              <form onSubmit={e => { e.preventDefault(); router.push(query ? `/ask?q=${encodeURIComponent(query)}` : '/tutors') }} className="rounded-card bg-white border border-ink-200 shadow-card p-2 flex flex-col sm:flex-row gap-2 focus-within:border-brand-400 focus-within:shadow-brand-glow transition-[box-shadow,border-color] duration-mid">
                <div className="relative flex-1">
                  <Icon.search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="რა გჭირდება? მაგ. fundraising, IP სტატუსი, Series A deck"
                    className="w-full h-12 pl-11 pr-3 bg-transparent text-[15px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
                  />
                </div>
                <button type="submit" className="h-12 px-6 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(21,154,130,0.4)] transition-all duration-fast">
                  ექსპერტის ძიება
                  <Icon.arrow className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </form>
              <div className="mt-4 flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] text-ink-500 mr-1">პოპულარული:</span>
                {quickTopics.map(t => (
                  <Link key={t} href={`/ask?q=${encodeURIComponent(t)}`} className="h-7 px-2.5 rounded-pill bg-white/60 border border-ink-200 hover:bg-white hover:border-ink-300 text-[12px] font-display font-medium text-ink-700 transition-colors inline-flex items-center">
                    {t}
                  </Link>
                ))}
              </div>
            </div>

            {/* Quality anchors — honest framing, no fabricated stats. On
                mobile: one compact 3-up row (labels only) instead of three
                stacked rows — saves most of a screen of hero scroll. */}
            <div className="mt-8 sm:mt-12 lg:mt-14 pt-6 sm:pt-8 border-t border-ink-200 grid grid-cols-3 gap-3 sm:gap-8 max-w-[540px] motion-safe:stagger">
              {[
                { l: 'ხელით შერჩეული', d: 'ყოველი ექსპერტი ინდივიდუალურად შემოწმებული' },
                { l: 'გამჭვირვალე ფასი', d: 'ერთი ნათელი განაკვეთი — გადაიხდი მხოლოდ დაჯავშნისას' },
                { l: 'ვიდეო-სესია', d: 'HD ვიდეო-ოთახი, ჩატი, ფაილები' },
              ].map(s => (
                <div key={s.l}>
                  <div className="font-display text-[12px] sm:text-[13px] font-bold text-ink-900 tracking-tight leading-snug">{s.l}</div>
                  <div className="mt-1.5 text-[11.5px] text-ink-500 leading-snug hidden sm:block">{s.d}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — product preview: a live, premium expert booking card that
              shows the actual product (Topmate / Intro pattern). Desktop-only:
              on mobile the REAL expert cards of FeaturedExperts are one scroll
              away, and this preview cost ~2.5 screens of duplicate content. */}
          <div className="relative motion-safe:animate-scale-in hidden lg:block" style={{ animationDelay: '240ms' }}>
            {/* Depth: a soft secondary card peeking behind the main one. */}
            <div aria-hidden className="absolute -top-3 left-6 right-6 h-24 rounded-card bg-white border border-ink-100 shadow-sm -z-10 hidden sm:block" />

            {/* Floating live-availability pill — real aggregate, never faked. */}
            <div className="flex justify-center mb-4">
              <span className="inline-flex items-center gap-2 h-8 pl-3 pr-3.5 rounded-pill bg-white border border-ink-200 shadow-pop">
                <Icon.shield className="w-3.5 h-3.5 text-brand-600" />
                <span className="font-display text-[12px] font-semibold text-ink-800 tracking-tight tabular-nums">
                  {stats ? `${stats.total} გადამოწმებული ექსპერტი` : 'ხელით შერჩეული ბაზა'}
                </span>
              </span>
            </div>

            {featured ? (
              <article className="relative rounded-card bg-white border border-ink-200 shadow-float hover-lift overflow-hidden">
                {/* Identity */}
                <div className="p-5 sm:p-6 flex items-start gap-4">
                  <div className="relative shrink-0">
                    <img src={featured.photo} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow-card" />
                    {featured.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-success-500 ring-[3px] ring-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-[18px] font-bold text-ink-900 tracking-tight truncate">{featured.name}</span>
                      {featured.verified && <VerifiedMark size={16} />}
                    </div>
                    {featured.headline && (
                      <div className="mt-1 inline-flex items-center gap-1.5 h-5 px-2 rounded-pill bg-info-50 text-info-700 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">
                        {featured.headline}
                      </div>
                    )}
                    <div className="mt-1.5 text-[12px] text-ink-500 truncate">{featured.cat}</div>
                  </div>
                </div>

                {/* Trust stats row */}
                <div className="px-5 sm:px-6 pb-4 flex items-center gap-3 text-[12px] flex-wrap">
                  <span className="inline-flex items-center gap-1 text-ink-800">
                    <Icon.star className="w-3.5 h-3.5 text-warning-500" />
                    <span className="font-display font-bold tabular-nums">{featured.rate.toFixed(2)}</span>
                    <span className="text-ink-400 tabular-nums">({featured.reviews})</span>
                  </span>
                  <span className="w-px h-3.5 bg-ink-200" />
                  <span className="inline-flex items-center gap-1 text-ink-600">
                    <span className="font-display font-semibold text-ink-800 tabular-nums">{featured.sessions}</span> სესია
                  </span>
                  <span className="w-px h-3.5 bg-ink-200" />
                  <span className="inline-flex items-center gap-1 text-ink-600">
                    <Icon.clock className="w-3.5 h-3.5 text-ink-400" /> პასუხი &lt; 24სთ
                  </span>
                </div>

                {/* Live availability mini-widget */}
                <div className="mx-5 sm:mx-6 rounded-card bg-ink-75 border border-ink-100 px-3.5 py-2.5 flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-btn bg-white border border-ink-200 inline-flex items-center justify-center shrink-0">
                    <Icon.cal className="w-3.5 h-3.5 text-brand-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">ხელმისაწვდომობა</div>
                    <div className="font-display text-[13px] font-bold text-ink-900 tracking-tight truncate">{featured.next}</div>
                  </div>
                </div>

                {/* Price + CTA */}
                <div className="p-5 sm:p-6 pt-4 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-display text-[24px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">₾{featured.price}</span>
                    <span className="text-[12px] font-medium text-ink-500 ml-1">/ {featured.durationMin} წთ</span>
                  </div>
                  <Link href={featured.id ? `/tutors/${featured.id}` : '/tutors'} className="shrink-0 h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center gap-1.5 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(21,154,130,0.36)] motion-safe:active:scale-[0.97] transition-all duration-fast">
                    დაჯავშნა <Icon.arrow className="w-4 h-4" />
                  </Link>
                </div>

                {/* Trust footer */}
                <div className="border-t border-ink-100 px-5 sm:px-6 py-3 flex items-center gap-4 text-[11px] text-ink-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon.shield className="w-3.5 h-3.5 text-brand-600" /> Escrow-დაცული
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon.check className="w-3.5 h-3.5 text-brand-600" /> ID + გადამოწმებული
                  </span>
                </div>
              </article>
            ) : (
              <article aria-busy="true" className="relative rounded-card bg-white border border-ink-200 shadow-float overflow-hidden">
                <div className="p-6 flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-ink-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 w-32 bg-ink-100 rounded animate-pulse" />
                    <div className="h-4 w-24 bg-ink-100 rounded-pill animate-pulse" />
                    <div className="h-3 w-20 bg-ink-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="px-6 pb-6 flex items-center justify-between">
                  <div className="h-6 w-16 bg-ink-100 rounded animate-pulse" />
                  <div className="h-11 w-28 bg-ink-100 rounded-btn animate-pulse" />
                </div>
              </article>
            )}

            {/* Avatar stack + see-all */}
            <div className="mt-5 flex items-center gap-3.5">
              <div className="flex -space-x-2.5">
                {sidekicks.length > 0 ? sidekicks.map((e, i) => (
                  <div key={i} className="relative">
                    <img src={e.photo} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white" />
                    {e.online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success-500 ring-2 ring-white" />}
                  </div>
                )) : [0, 1, 2].map(i => (
                  <div key={i} className="w-9 h-9 rounded-full bg-ink-100 ring-2 ring-white animate-pulse" />
                ))}
                <div className="w-9 h-9 rounded-full bg-ink-100 ring-2 ring-white inline-flex items-center justify-center font-display text-[10.5px] font-bold text-ink-700">+</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[13px] font-semibold text-ink-900 tracking-tight">
                  {stats ? `${stats.avg.toFixed(1)}★ საშუალო · ${stats.total} ექსპერტი` : 'გადახედე მთელ ბაზას'}
                </div>
                <Link href="/tutors" className="mt-0.5 inline-flex items-center gap-1 font-display text-[11.5px] font-semibold text-brand-700 hover:text-brand-800 transition-colors">
                  ყველა ექსპერტი <Icon.arrow className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Trust callout */}
            <div className="mt-5 rounded-card bg-accent-950 text-white p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-card bg-brand-500 inline-flex items-center justify-center shrink-0">
                <Icon.shield className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[14px] font-bold tracking-tight">გადახდა მხოლოდ დაჯავშნისას</div>
                <div className="text-[12px] text-white/70 mt-1 leading-snug">ერთი ნათელი ფასი · ვიდეო-ლინკი დადასტურებისთანავე.</div>
              </div>
              <Link href="/tutors" aria-label="დაწყება" className="shrink-0 w-9 h-9 rounded-btn bg-white/10 hover:bg-white/20 inline-flex items-center justify-center transition-colors">
                <Icon.arrow className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}


const Categories = () => (
  <section className="bg-white border-b border-ink-200">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-10 sm:py-16 lg:py-20">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8 sm:mb-10">
        <div className="max-w-[640px]">
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-3">კატეგორიები</div>
          <h2 className="font-display text-[30px] sm:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">აირჩიე სფერო, რომელშიც გჭირდება ცოდნა</h2>
          <p className="hidden sm:block mt-4 text-[14.5px] text-ink-600 leading-[1.55]">ხელით შერჩეული ექსპერტები 6 სფეროში — გადახედე, შეადარე და დაიჯავშნე ვიდეო-სესია.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
        {categories.map(c => (
          <Link key={c.l} href={`/tutors?category=${c.slug}`} className="group relative overflow-hidden rounded-card border border-ink-200 bg-white p-4 sm:p-6 shadow-xs hover:border-brand-200 hover-lift motion-safe:active:scale-[0.99] flex flex-col text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
            {/* Brand accent hairline — reveals on hover (matches /categories). */}
            <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand-500 to-brand-600 transition-transform duration-300 ease-out group-hover:scale-x-100" />
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-btn flex items-center justify-center shrink-0 bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-inset ring-brand-900/[0.04] shadow-xs transition-colors group-hover:text-brand-700">
                {React.cloneElement(c.i, { className: 'w-5 h-5 sm:w-7 sm:h-7' })}
              </div>
              <span className="font-display text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-ink-400 whitespace-nowrap pt-1">
                <span className="hidden sm:inline">ხელით შერჩეული</span>
              </span>
            </div>
            <h3 className="mt-4 sm:mt-6 font-display text-[18px] sm:text-[26px] font-bold text-ink-900 leading-[1.1] tracking-tight transition-colors group-hover:text-brand-700">{c.l}</h3>
            <p className="mt-1 sm:mt-1.5 text-[12px] sm:text-[13px] text-ink-600 leading-[1.45] line-clamp-2">{c.d}</p>
            <div className="mt-auto pt-4 sm:pt-5 border-t border-ink-100 flex items-center justify-between">
              <span className="font-display text-[10px] sm:text-[11.5px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-ink-500 group-hover:text-brand-700 transition-colors">
                <span className="sm:hidden">ნახე</span>
                <span className="hidden sm:inline">ექსპერტების ნახვა</span>
              </span>
              <Icon.arrow className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-ink-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  </section>
)

const ExpertCard = ({ e }: { e: Expert }) => (
  <article className="group relative rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift overflow-hidden flex flex-col">
    {/* Mobile photo banner */}
    <div className="sm:hidden relative aspect-[16/10] w-full bg-gradient-to-br from-brand-50 to-ink-100 overflow-hidden">
      <img src={e.photo} alt={e.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover motion-safe:animate-fade-in-fast" />
      <div className="absolute inset-0 bg-gradient-to-t from-accent-950/40 via-transparent to-transparent" />
      <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-white/95 backdrop-blur rounded-pill h-7 px-2.5 shadow-xs">
        <Icon.star className="w-3 h-3 text-warning-500" />
        <span className="font-display text-[12px] font-bold text-ink-900 tabular-nums leading-none">{e.rate}</span>
        <span className="text-[10px] text-ink-500 tabular-nums">({e.reviews})</span>
      </div>
    </div>

    {/* Desktop horizontal */}
    <div className="hidden sm:grid sm:grid-cols-[160px_1fr] gap-5 p-5 sm:p-6">
      <div className="shrink-0">
        <div className="relative w-[160px] h-[160px] rounded-card overflow-hidden bg-ink-100">
          <img src={e.photo} alt={e.name} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      </div>
      <div className="min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <h3 className="font-display text-[20px] font-bold text-ink-900 tracking-tight leading-[1.15]">{e.name}</h3>
              {e.verified && <VerifiedMark size={14} />}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="font-display text-[12px] font-semibold text-ink-700">{e.cat}</span>
              {e.headline && (
                <>
                  <span className="text-ink-300">·</span>
                  <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-info-50 text-info-700 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">
                    {e.headline}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right -mt-0.5">
            <div className="inline-flex items-baseline gap-1 font-display">
              <Icon.star className="w-3.5 h-3.5 text-warning-500 self-center" />
              <span className="text-[17px] font-bold text-ink-900 tabular-nums leading-none">{e.rate}</span>
            </div>
            <div className="mt-1 text-[9.5px] uppercase tracking-[0.18em] text-ink-500 tabular-nums">{e.reviews} მიმოხ.</div>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink-700 leading-[1.55] line-clamp-2">{e.quote}</p>
        <div className="mt-3 pt-3 border-t border-ink-100 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-500">
          <span className="tabular-nums"><span className="font-display font-semibold text-ink-800">{e.sessions}</span> სესია</span>
          <span className="text-ink-300">·</span>
          <span className="inline-flex items-center gap-1">
            <Icon.clock className="w-3 h-3" />
            უახლოესი <span className="font-display font-semibold text-ink-800 ml-0.5">{e.next}</span>
          </span>
        </div>
      </div>
    </div>

    {/* Mobile content block */}
    <div className="sm:hidden px-4 pt-4 pb-3 flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <h3 className="font-display text-[18px] font-bold text-ink-900 tracking-tight leading-[1.15] truncate">{e.name}</h3>
        {e.verified && <VerifiedMark size={14} />}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap min-w-0">
        <span className="font-display text-[12px] font-semibold text-ink-700">{e.cat}</span>
        {e.headline && (
          <>
            <span className="text-ink-300">·</span>
            <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-info-50 text-info-700 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">
              {e.headline}
            </span>
          </>
        )}
      </div>
      <p className="mt-3 text-[13px] text-ink-700 leading-[1.55] line-clamp-2">{e.quote}</p>
      <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-500 flex-wrap">
        <span className="tabular-nums"><span className="font-display font-semibold text-ink-800">{e.sessions}</span> სესია</span>
        <span className="text-ink-300">·</span>
        <span className="inline-flex items-center gap-1">
          <Icon.clock className="w-3 h-3" />
          უახლოესი <span className="font-display font-semibold text-ink-800 ml-0.5">{e.next}</span>
        </span>
      </div>
    </div>

    {/* Bottom price strip */}
    <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-t border-ink-100 bg-ink-50/40">
      <div className="min-w-0 flex items-baseline gap-2">
        <span className="font-display text-[20px] sm:text-[22px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">
          ₾{e.price}<span className="text-[11.5px] font-medium text-ink-500 ml-0.5">/ {e.durationMin} წთ</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href={e.id ? `/tutors/${e.id}` : '/tutors'} className="h-10 px-3.5 rounded-btn border border-ink-200 hover:border-ink-300 bg-white text-ink-700 hover:text-ink-900 font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center transition-colors">
          პროფილი
        </Link>
        <Link href={e.id ? `/tutors/${e.id}` : '/tutors'} className="h-10 px-3.5 sm:px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors shadow-xs">
          დაიჯავშნე <Icon.arrow className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  </article>
)

const FeaturedExperts = () => {
  const [active, setActive] = useState('all')
  const [experts, setExperts] = useState<Expert[] | null>(null)
  // Fetch real featured tutors (admin-marked featured=true) so the "hand-picked
  // experts" section no longer ships hardcoded fake names in the SSR HTML.
  useEffect(() => {
    let cancelled = false
    const cat = active === 'all' ? '' : `&category=${encodeURIComponent(active)}`
    const load = async () => {
      try {
        let rows = await fetch(`/api/tutors?featured=1&limit=6${cat}`).then(r => (r.ok ? r.json() : []))
        // Fall back to top-rated experts so this section is never empty — a cold
        // "featured" list still shows a strong, hand-picked-feeling row instead
        // of a dead-end empty state.
        if (!Array.isArray(rows) || rows.length === 0) {
          rows = await fetch(`/api/tutors?limit=6${cat}`).then(r => (r.ok ? r.json() : []))
        }
        if (!cancelled && Array.isArray(rows)) setExperts(rows.map(mapTutorToExpert))
      } catch {
        if (!cancelled) setExperts([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [active])
  const filters = [
    { k: 'all', l: 'ყველა' },
    { k: 'business', l: 'ბიზნესი' },
    { k: 'finance', l: 'ფინანსები' },
    { k: 'career', l: 'კარიერა' },
    { k: 'marketing', l: 'მარკეტინგი' },
  ]
  return (
    <section className="bg-ink-50/60 border-b border-ink-200">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-10 sm:py-16 lg:py-20">
        <div className="mb-8 lg:mb-10 max-w-[640px]">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">ექსპერტები</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
              ხელით შერჩეული · ინდივიდუალურად შემოწმებული
            </span>
          </div>
          <h2 className="font-display text-[28px] sm:text-[40px] lg:text-[48px] font-bold text-ink-900 tracking-[-0.025em] leading-[1.05]">
            ხელით შერჩეული ექსპერტები.
          </h2>
        </div>

        <div className="flex items-center gap-2 mb-7 overflow-x-auto pb-1 -mx-6 sm:-mx-8 px-6 sm:px-8">
          {filters.map(f => (
            <button key={f.k} type="button" onClick={() => setActive(f.k)} className={`shrink-0 h-9 px-4 rounded-pill font-display text-[12.5px] font-semibold tracking-wide inline-flex items-center transition-colors ${active === f.k ? 'bg-brand-500 text-white' : 'bg-white border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'}`}>
              {f.l}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4 sm:gap-5">
          {experts === null ? (
            [0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-card border border-ink-200 bg-white p-5 flex items-start gap-4 animate-pulse">
                <div className="w-20 h-20 rounded-card bg-ink-100 shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-4 w-2/5 bg-ink-100 rounded" />
                  <div className="h-3 w-3/5 bg-ink-100 rounded" />
                  <div className="h-3 w-full bg-ink-100 rounded" />
                </div>
              </div>
            ))
          ) : experts.length === 0 ? (
            <div className="lg:col-span-2 py-14 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white">
              <div className="font-display text-[15px] font-bold text-ink-900">ჯერ არავინაა მონიშნული როგორც „featured"</div>
              <p className="text-[12.5px] text-ink-500 mt-1.5 max-w-[420px] mx-auto leading-relaxed">გადახედე ყველა ექსპერტს — მოდერაცია რჩეულ პროფესიონალებს მალე მოირჩევს.</p>
              <Link href="/tutors" className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide transition-colors">
                ყველა ექსპერტი <Icon.arrow className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            experts.map((e, i) => <ExpertCard key={e.id ?? i} e={e} />)
          )}
        </div>

        <div className="mt-12 flex justify-center">
          <Link href="/tutors" className="h-12 px-6 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-900 font-display text-[13px] font-semibold tracking-wide inline-flex items-center gap-2 transition-colors">
            ნახე ყველა ექსპერტი <Icon.arrow className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

const HowItWorks = () => (
  <section id="how" className="bg-ink-50 border-b border-ink-200 scroll-mt-24">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-10 sm:py-16 lg:py-24">
      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-12 items-start">
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-3">როგორ მუშაობს</div>
          <h2 className="font-display text-[32px] sm:text-[44px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
            სამი ნაბიჯი —<br />
            ვიდრე უკვე გელაპარაკები.
          </h2>
          <p className="text-[15px] text-ink-600 mt-5 max-w-[400px] leading-relaxed">რეგისტრაცია — გაცნობა — სესია. 15 წუთიდან სრულ კონსულტაციამდე.</p>
          <Link href="/signup" className="mt-7 h-12 px-6 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
            დაიწყე ახლავე <Icon.arrow className="w-4 h-4" />
          </Link>
        </div>
        <div className="space-y-3">
          {[
            { n: '01', t: 'აირჩიე ექსპერტი', d: 'გადახედე პროფილებს, რეიტინგებს და მოკლე ვიდეო-შესავალს. ფილტრები სფერო-ფასი-ხელმისაწვდომობაზე.' },
            { n: '02', t: 'აირჩიე დრო და დაჯავშნე', d: 'ექსპერტის კალენდრიდან აირჩიე თავისუფალი დრო — ის ადასტურებს მოთხოვნას. ხანგრძლივობა · 15, 30 ან 60 წუთი.' },
            PAYMENTS_LIVE
              ? { n: '03', t: 'გადახდი escrow-ით', d: 'ბარათით — თანხა escrow-ში დგას, ექსპერტს მხოლოდ სესიის შემდეგ გადაერიცხება.' }
              : { n: '03', t: 'უსაფრთხო გადახდები · მალე', d: 'escrow-ით დაცული გადახდები — მალე. ამჟამად სესია იჯავშნება უფასოდ, გადახდის სისტემა მოდის.' },
          ].map((s, i) => (
            <div key={i} className="rounded-card border border-ink-200 bg-white p-6 grid grid-cols-[60px_1fr] gap-5 items-start">
              <div className="font-display text-[44px] font-bold text-brand-500 tabular-nums tracking-tight leading-none">{s.n}</div>
              <div>
                <h3 className="font-display text-xl font-bold text-ink-900 mb-2 tracking-tight">{s.t}</h3>
                <p className="text-[14px] text-ink-600 leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
)

const WhyUs = () => (
  <section className="bg-white border-b border-ink-200">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-10 sm:py-16 lg:py-20">
      <div className="max-w-[720px] mb-10">
        <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-3">რატომ მცოდნე</div>
        <h2 className="font-display text-[32px] sm:text-[44px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
          ცოდნა, რომელსაც ენდობი —<br className="hidden sm:inline" />
          <span className="text-ink-500">ფასი, რომელიც ღირს.</span>
        </h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink-200 border border-ink-200 rounded-card overflow-hidden">
        {[
          PAYMENTS_LIVE
            ? { t: 'Escrow უსაფრთხოება', d: 'თანხა escrow-ში დგას სანამ სესია არ ჩატარდება. გაუქმდე უფასოდ 24 სთ-ით ადრე.' }
            : { t: 'უსაფრთხო გადახდები · მალე', d: 'escrow-ით დაცული გადახდები მუშავდება — ამჟამად სესია იჯავშნება უფასოდ, ბარათი არ ვთხოვთ.' },
          { t: 'ხელით მოდერაცია',    d: 'ადმინისტრაცია განიხილავს ყოველ განაცხადს. ვამოწმებთ პროფილს, გამოცდილებას, საჯარო კვალს.' },
          { t: 'HD ვიდეო-სესია',     d: 'ჩაშენებული ვიდეო-ოთახი, ფაილების გაცვლა, ჩატი. სესია იწერება — გადახედე ნებისმიერ დროს.' },
          { t: 'გამჭვირვალე ფასი',   d: 'ერთი ნათელი განაკვეთი ექსპერტზე — გადაიხდი მხოლოდ დაჯავშნისას, ფარული საკომისიოს გარეშე.' },
        ].map((c, i) => (
          <div key={i} className="bg-white p-7">
            <div className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-400 tabular-nums mb-4">№ {String(i + 1).padStart(2, '0')}</div>
            <h3 className="font-display text-[17px] font-bold text-ink-900 tracking-tight leading-tight mb-2">{c.t}</h3>
            <p className="text-[12.5px] text-ink-600 leading-[1.55]">{c.d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
)

const Testimonials = () => (
  <section className="bg-white border-b border-ink-200">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-10 sm:py-16 lg:py-20">
      <div className="grid lg:grid-cols-[1fr_auto] items-end gap-6 mb-12">
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-3">მიმოხილვები</div>
          <h2 className="font-display text-[32px] sm:text-[44px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
            ფული, რომელიც დააბრუნდა.
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-warning-50 border border-warning-200 text-warning-800 font-display text-[10.5px] font-bold uppercase tracking-[0.14em]">
            საილუსტრაციო · მაგალითი
          </span>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <figure className="relative rounded-card border border-ink-200 bg-white p-8 lg:p-10">
          <Icon.star className="absolute top-8 right-8 w-5 h-5 text-warning-500" />
          <blockquote className="font-display text-[24px] sm:text-[28px] lg:text-[32px] leading-[1.3] tracking-tight font-medium text-ink-900 max-w-[640px]">
            „გიორგი 80₾-ად მოგვცა იდეა, რომელიც 12,000₾ შემოსავალი გახდა 6 თვეში. შემდეგ Series A-ც გავიგრძელეთ მისი deck-ით."
          </blockquote>
          <figcaption className="mt-8 pt-6 border-t border-ink-100 flex items-center gap-4">
            <img src="https://i.pravatar.cc/120?img=23" alt="" className="w-12 h-12 rounded-full object-cover" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-[15px] font-bold text-ink-900 tracking-tight">თამარ ხორავა</span>
                <span className="inline-flex items-center h-5 px-2 rounded-pill bg-ink-100 text-ink-700 font-display text-[9.5px] font-bold uppercase tracking-[0.14em]">მაგალითი</span>
              </div>
              <div className="text-[12.5px] text-ink-500">Founder · Patika.ge</div>
            </div>
          </figcaption>
        </figure>
        <div className="grid grid-rows-2 gap-5">
          {[
            { n: 'ლუკა ბერიძე', role: 'SWE · Pulsar', img: 33, t: 'ნინომ მირჩია 3 პუნქტი — Google-ში 2 თვეში გადავედი.' },
            { n: 'მარიამ კობახიძე', role: 'Designer · Adjar', img: 49, t: 'ლევანმა საგადასახადო 45 წუთში ამიხსნა. რეალურად შემიცვალა.' },
          ].map((it, i) => (
            <figure key={i} className="rounded-card border border-ink-200 bg-white p-6 flex flex-col">
              <blockquote className="font-display text-[16px] text-ink-900 leading-[1.45] font-medium flex-1">„{it.t}"</blockquote>
              <figcaption className="mt-4 pt-4 border-t border-ink-100 flex items-center gap-3">
                <img src={`https://i.pravatar.cc/120?img=${it.img}`} alt="" className="w-9 h-9 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-display text-[13px] font-bold text-ink-900 truncate tracking-tight">{it.n}</span>
                    <span className="inline-flex items-center h-4 px-1.5 rounded-pill bg-ink-100 text-ink-700 font-display text-[9px] font-bold uppercase tracking-[0.14em]">მაგალითი</span>
                  </div>
                  <div className="text-[11px] text-ink-500 truncate">{it.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  </section>
)

const ExpertCta = () => (
  <section className="relative bg-ink-50/50 border-y border-ink-200">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-10 sm:py-16 lg:py-24">
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-pill bg-white border border-ink-200 pl-1 pr-3 py-1 mb-6 shadow-xs">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-500 text-white px-2.5 py-1 text-[11px] font-display font-semibold tracking-wide">ექსპერტებისთვის</span>
            <span className="text-[12px] text-ink-700 font-medium">ღია განაცხადი · ხელით მოდერაცია</span>
          </div>
          <h2 className="font-display text-[36px] sm:text-[48px] lg:text-[56px] font-bold leading-[1.02] tracking-[-0.02em] text-ink-900">
            გააზიარე შენი ცოდნა.<br />
            <span className="text-brand-600">{PAYMENTS_LIVE ? 'გასამრჯელო — escrow-ის შემდეგ.' : 'შემოსავალი · მალე.'}</span>
          </h2>
          <p className="text-[15px] text-ink-700 mt-6 max-w-[520px] leading-relaxed">
            შენ წერ შენს კონსულტაციას — ფასს, დროს, თემას. ჩვენ ვუვლით მოდერაციას, ანგარიშფაქტურებს და მომხმარებლების მოძიებას. საკომისიო {COMMISSION_PCT}% — გამჭვირვალე, ერთი ციფრი.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/apply" className="h-12 px-6 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
              გახდი ექსპერტი <Icon.arrow className="w-4 h-4" />
            </Link>
            <Link href="/apply" className="h-12 px-5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-800 font-display font-medium text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
              <Icon.play className="w-3.5 h-3.5 text-brand-600" /> 90 წამიანი ვიდეო
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {[
            { n: `${COMMISSION_PCT}%`, l: 'საკომისიო',    s: 'გამჭვირვალე · ერთი ციფრი',            tone: 'brand'   },
            { n: `${TUTOR_PAYOUT_PCT}%`, l: 'შენი ნაწილი', s: 'დანარჩენი — შენს ჯიბეშია',            tone: 'accent'  },
            { n: 'მალე', l: 'შემოსავალი',                 s: 'escrow-ის დანერგვის შემდეგ',           tone: 'success' },
          ].map((s, i) => (
            <div key={i} className="rounded-card border border-ink-200 bg-white p-5 grid grid-cols-[auto_1fr] gap-5 items-baseline shadow-xs">
              <div className={`font-display text-[40px] font-bold text-${s.tone}-600 tabular-nums tracking-tight leading-none`}>{s.n}</div>
              <div>
                <div className={`font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-${s.tone}-700`}>{s.l}</div>
                <div className="text-[12px] text-ink-600 mt-1.5 leading-snug">{s.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
)

const AuthedRecentTutorsStrip = () => {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [hasItems, setHasItems] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me')
        if (!res.ok || cancelled) { if (!cancelled) setSignedIn(false); return }
        const body = await res.json().catch(() => ({}))
        if (!cancelled) setSignedIn(!!body?.user)
      } catch {
        if (!cancelled) setSignedIn(false)
      }
    })()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const check = () => {
      try {
        const raw = window.localStorage.getItem('mcodne:recent-tutors')
        if (!raw) { setHasItems(false); return }
        const parsed = JSON.parse(raw)
        setHasItems(Array.isArray(parsed) && parsed.length > 0)
      } catch {
        setHasItems(false)
      }
    }
    check()
    const onChange = () => check()
    window.addEventListener('storage', onChange)
    window.addEventListener('mcodne:recent-tutors:change', onChange as EventListener)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener('mcodne:recent-tutors:change', onChange as EventListener)
    }
  }, [])
  if (!signedIn || !hasItems) return null
  return (
    <section className="bg-white border-b border-ink-200">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 pt-6 pb-4">
        <RecentTutorsStrip />
      </div>
    </section>
  )
}

const HomeView = () => (
  <>
    <HomeHero />
    <AuthedRecentTutorsStrip />
    <Categories />
    <FeaturedExperts />
    <HowItWorks />
    <WhyUs />
    <Testimonials />
    <ExpertCta />
  </>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

export default function Landing() {
  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      <TopNav />
      <HomeView />
      <Footer />
    </div>
  )
}


