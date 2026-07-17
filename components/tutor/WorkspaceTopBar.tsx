'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { NotifBell } from '@/components/NotifBell'
import { UserMenu } from '@/components/UserMenu'
import { titleForPath } from './navConfig'

/* Compact workspace header: page title (from nav config) + bell + user menu.
   The old TutorAppBar's 7-link nav lives in WorkspaceSidebar on desktop;
   mobile navigation = global BottomNav + UserMenu items. */
export function WorkspaceTopBar({ user }: { user?: { name: string; avatar?: string | null } }) {
  const path = usePathname() ?? ''
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
      <div className="px-4 sm:px-6 lg:px-8 h-14 lg:h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="lg:hidden shrink-0">
            <Logo size="sm" href="/tutor" />
          </span>
          <h1 className="font-display text-[15px] font-bold text-ink-900 truncate">
            {titleForPath(path)}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NotifBell />
          <UserMenu user={user} role="TUTOR" />
        </div>
      </div>
    </header>
  )
}
