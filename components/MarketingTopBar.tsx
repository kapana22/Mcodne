'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Logo } from './Logo'
import { Icon } from './Icon'

const NAV = [
  { label: 'ექსპერტები', href: '/tutors' },
  { label: 'როგორ მუშაობს', href: '/#how' },
  { label: 'გახდი ექსპერტი', href: '/apply' },
  { label: 'FAQ', href: '/help' },
]

export function MarketingTopBar() {
  const [mobOpen, setMobOpen] = useState(false)

  // Close on Escape and lock body scroll while the drawer is open.
  // Without this the drawer accepts clicks but the page underneath still
  // scrolls, and there's no keyboard exit.
  useEffect(() => {
    if (!mobOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [mobOpen])
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-ink-200">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-7 min-w-0">
          <Logo size="sm" />
          <nav className="lg:flex hidden items-center gap-0.5">
            {NAV.map(item => (
              <Link key={item.href} href={item.href}
                    className="h-9 px-3 rounded-btn text-[13px] font-medium tracking-wide text-ink-800 hover:bg-ink-50 inline-flex items-center transition-colors">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/signin" className="hidden md:inline-flex h-9 px-3 rounded-btn font-medium text-[13px] text-ink-800 hover:bg-ink-50 items-center">
            შესვლა
          </Link>
          <Link href="/signup" className="h-9 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[12.5px] transition-colors inline-flex items-center gap-1.5">
            დაიწყე
            <Icon.arrow className="w-3.5 h-3.5" />
          </Link>
          <button type="button" onClick={() => setMobOpen(true)}
                  aria-label="მენიუ" aria-expanded={mobOpen}
                  className="lg:hidden w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-900 hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center transition-colors">
            <Icon.menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {mobOpen && (
        <>
          <button type="button" aria-label="დახურვა" onClick={() => setMobOpen(false)} className="lg:hidden fixed inset-0 z-50 bg-accent-900/50 backdrop-blur-sm" />
          <aside role="dialog" aria-modal="true" aria-label="მენიუ" className="lg:hidden fixed top-0 right-0 bottom-0 z-[51] w-[300px] max-w-[85vw] bg-white shadow-float flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-ink-200 shrink-0">
              <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.22em] text-ink-500">მენიუ</span>
              <button type="button" onClick={() => setMobOpen(false)} aria-label="დახურვა" className="w-10 h-10 rounded-btn hover:bg-ink-50 text-ink-700 inline-flex items-center justify-center">
                <Icon.xC className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-2 flex flex-col">
              {NAV.map(item => (
                <Link key={item.href} href={item.href} onClick={() => setMobOpen(false)}
                      className="h-12 flex items-center justify-between text-[15px] font-display font-medium text-ink-800 border-b border-ink-100 last:border-b-0">
                  {item.label}
                </Link>
              ))}
              <Link href="/signin" onClick={() => setMobOpen(false)}
                    className="h-12 flex items-center justify-between text-[15px] font-display font-medium text-ink-800 border-b border-ink-100">
                შესვლა
              </Link>
            </div>
            <div className="px-5 pb-5">
              <Link href="/signup"
                    className="w-full h-11 rounded-btn bg-brand-500 text-white font-display font-semibold text-[13px] inline-flex items-center justify-center gap-2">
                დაიწყე
                <Icon.arrow className="w-4 h-4" />
              </Link>
            </div>
          </aside>
        </>
      )}
    </header>
  )
}
