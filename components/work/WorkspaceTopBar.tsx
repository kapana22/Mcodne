'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { CreditPill } from '@/components/CreditPill'
import { NotifBell } from '@/components/NotifBell'
import { UserMenu } from '@/components/UserMenu'

/* Compact workspace header: page title (from nav config) + bell + user menu.
   The old TutorAppBar's 7-link nav lives in WorkspaceSidebar on desktop;
   mobile navigation = global BottomNav + UserMenu items. */
export function WorkspaceTopBar({ user, role = 'PROVIDER', balanceTetri = null }: {
  user?: { name: string; avatar?: string | null }
  /** ⚠️ THE SAME PILL AS THE PUBLIC BAR (2026-08-21), and that is the point: a
   *  number that disappears the moment you walk into the room where it is spent
   *  reads as a bug. The public bar gets it from /api/me; here it is a prop,
   *  because app/work/layout.tsx already holds it. */
  balanceTetri?: number | null
  /** The viewer's REAL role. A master keeps role STUDENT (lib/hats) and shares
   *  this bar since stage 6 — a hardcoded TUTOR would hand them the expert's
   *  menu, whose every link bounces them out. */
  role?: 'USER' | 'PROVIDER' | 'ADMIN'
}) {
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
      className={`sticky top-0 z-chrome bg-white lg:bg-white/95 lg:backdrop-blur-md border-b border-ink-100 transition-shadow duration-mid ease-out-quart ${
        scrolled ? 'shadow-sm' : ''
      }`}
    >
      <div className="px-4 sm:px-6 lg:px-8 h-14 lg:h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* No page title — the sidebar shows the active section. Mobile logo only. */}
          <span className="lg:hidden shrink-0">
            <Logo size="sm" />
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CreditPill tetri={balanceTetri} />
          <NotifBell />
          <UserMenu user={user} role={role} />
        </div>
      </div>
    </header>
  )
}
