'use client'
// StudentAppBar — the one header for every /student page (and the student
// booking detail). Mirrors TutorAppBar so both workspaces read as the same
// product: sticky bar, desktop nav, mobile chip rail for destinations the
// 4-tab BottomNav can't carry, NotifBell + UserMenu on the right.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { NotifBell } from './NotifBell'
import { UserMenu } from './UserMenu'
import { Icon } from './Icon'
import { Container } from '@/components/Container'

// „შენახული" is NOT a text nav item — it lives as a heart icon in the right
// cluster (left of the bell), so the saved list is one glanceable tap on every
// screen without eating nav width.
const NAV = [
  { label: 'მთავარი',    href: '/student',           exact: true },
  { label: 'ექსპერტები', href: '/tutors' },
  { label: 'ჯავშნები',   href: '/student/bookings' },
  { label: 'მიმოწერა',    href: '/student/messages' },
]

const isActive = (path: string, item: (typeof NAV)[number]) =>
  item.exact ? path === item.href : path === item.href || path.startsWith(item.href + '/')

export function StudentAppBar({ user }: { user?: { name: string; avatar?: string | null } }) {
  const path = usePathname() ?? ''
  const savedActive = path === '/student/favorites' || path.startsWith('/student/favorites/')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-chrome bg-white lg:bg-white/95 lg:backdrop-blur-md border-b border-ink-100 transition-shadow duration-mid ease-out-quart ${
        scrolled ? 'shadow-sm' : ''
      }`}
    >
      <Container className="h-16 sm:h-20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-7 lg:gap-9 min-w-0">
          <Logo size="sm" />
          <nav className="hidden lg:flex items-center gap-1">
            {NAV.map(item => {
              const active = isActive(path, item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`h-11 px-3.5 rounded-btn font-display text-meta font-semibold uppercase inline-flex items-center transition-colors duration-fast ${
                    active ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100/70 hover:text-ink-900'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href="/tutors"
            className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-pill bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 transition-colors duration-fast group"
          >
            <Icon.search className="w-3.5 h-3.5 text-ink-500 group-hover:text-brand-600 transition-colors duration-fast" />
            <span className="font-display text-meta text-ink-500">ექსპერტი, თემა…</span>
          </Link>
          {/* Saved — heart icon left of the bell (replaces the „შენახული“ text nav). */}
          <Link
            href="/student/favorites"
            aria-label="შენახული"
            aria-current={savedActive ? 'page' : undefined}
            className={`w-10 h-10 rounded-btn inline-flex items-center justify-center transition-colors duration-fast ${
              savedActive ? 'text-brand-600 bg-brand-50' : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100'
            }`}
          >
            {savedActive
              ? <Icon.heartFilled className="w-[18px] h-[18px]" />
              : <Icon.heart className="w-[18px] h-[18px]" />}
          </Link>
          <NotifBell />
          <UserMenu user={user} role="STUDENT" />
        </div>
      </Container>
      {/* Mobile chip rail — BottomNav carries only 4 tabs, so Messages /
          Saved / Browse need a visible home on a phone. Same pattern as
          TutorAppBar's rail. */}
      <nav
        aria-label="სამუშაო სივრცის ნავიგაცია"
        className="lg:hidden border-t border-ink-100 px-4 sm:px-6 flex items-center gap-1.5 h-12 overflow-x-auto scrollbar-hide rail-fade-end"
      >
        {NAV.map(item => {
          const active = isActive(path, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 h-9 px-3 rounded-pill font-display text-meta font-semibold inline-flex items-center whitespace-nowrap transition-colors duration-fast ${
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
