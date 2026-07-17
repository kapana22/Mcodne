'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { NotifBell } from './NotifBell'
import { UserMenu } from './UserMenu'

const NAV = [
  { label: 'მთავარი',      href: '/tutor' },
  { label: 'ჯავშნები',     href: '/tutor/bookings' },
  { label: 'გრაფიკი',      href: '/tutor/schedule' },
  { label: 'შემოსავალი',   href: '/tutor/earnings' },
  { label: 'ექსპერტები',   href: '/tutors' },
  { label: 'მესიჯები',      href: '/tutor/messages' },
  { label: 'პროფილი',      href: '/tutor/profile' },
]

export function TutorAppBar({ user }: { user?: { name: string; avatar?: string | null } }) {
  const path = usePathname()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-ink-100 transition-shadow duration-mid ease-out-quart ${
        scrolled ? 'shadow-sm' : ''
      }`}
    >
      <div className="px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4 lg:gap-8">
        <div className="flex items-center gap-7">
          <Logo size="sm" href="/tutor" />
          <div className="hidden lg:flex items-center gap-1.5">
            <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-400">ექსპერტი</span>
            <span className="text-ink-300">/</span>
            <span className="font-display text-[12px] font-bold text-ink-900 uppercase tracking-[0.06em]">სამუშაო სივრცე</span>
          </div>
        </div>
        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map(item => {
            const active = path === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`h-11 px-3.5 rounded-btn font-display text-[12px] font-semibold uppercase tracking-[0.06em] inline-flex items-center transition-colors duration-fast ${
                  active ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100/70 hover:text-ink-900'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-2">
          <NotifBell />
          <UserMenu user={user} role="TUTOR" />
        </div>
      </div>
      {/* Mobile nav rail — BottomNav only carries 4 tabs, which left
          Schedule / Earnings / Browse unreachable on a phone. Horizontal
          scroll, same chip language as the search rail. */}
      <nav className="lg:hidden border-t border-ink-100 px-4 sm:px-6 flex items-center gap-1.5 h-12 overflow-x-auto scrollbar-hide" aria-label="სამუშაო სივრცის ნავიგაცია">
        {NAV.map(item => {
          const active = path === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 h-9 px-3 rounded-pill font-display text-[12px] font-semibold inline-flex items-center whitespace-nowrap transition-colors duration-fast ${
                active ? 'bg-brand-50 text-brand-800 border border-brand-200' : 'text-ink-600 hover:text-ink-900 border border-transparent'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
