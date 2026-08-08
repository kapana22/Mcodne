'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { Icon } from '@/components/Icon'
import { NotifBell } from '@/components/NotifBell'
import { UserMenu } from '@/components/UserMenu'

/* Compact workspace header for the student — page title (from nav config) +
   saved (heart) + bell + user menu. Mirrors the tutor's WorkspaceTopBar; the
   full nav lives in StudentSidebar on desktop and the global BottomNav on
   mobile. The heart stays here (not the sidebar-only list) so „შენახული“ is one
   glanceable tap on mobile, where the sidebar is hidden. */
export function StudentWorkspaceTopBar({ user }: { user?: { name: string; avatar?: string | null } }) {
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
      <div className="px-4 sm:px-6 lg:px-8 h-14 lg:h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* No page title — the sidebar already shows the active section, so a
              duplicate label here just took space. Mobile keeps the logo. */}
          <span className="lg:hidden shrink-0">
            <Logo size="sm" />
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/student/favorites"
            aria-label="შენახული"
            aria-current={savedActive ? 'page' : undefined}
            className={`w-10 h-10 rounded-btn inline-flex items-center justify-center transition-colors duration-fast ${
              savedActive ? 'text-brand-700 bg-brand-50' : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100'
            }`}
          >
            <Icon.heart className="w-[18px] h-[18px]" />
          </Link>
          <NotifBell />
          <UserMenu user={user} role="STUDENT" />
        </div>
      </div>
    </header>
  )
}
