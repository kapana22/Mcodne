'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { Eyebrow } from '@/components/Eyebrow'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { WORKSPACE_NAV, CATALOG_LINK, APPLY_LINK, type NavItem } from './navConfig'
import type { StudentBadges } from './useStudentBadges'

function badgeCount(item: NavItem, badges: StudentBadges): number {
  if (item.badgeKey === 'messages') return badges.messages
  return 0
}

function NavRow({ item, badges }: { item: NavItem; badges: StudentBadges }) {
  const path = usePathname() ?? ''
  const active = item.match(path)
  const count = badgeCount(item, badges)
  const IconComp = Icon[item.icon]
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`h-11 px-3 rounded-btn inline-flex items-center gap-3 font-display text-small font-semibold transition-colors duration-fast ${
        active ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100/70 hover:text-ink-900'
      }`}
    >
      <IconComp className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-brand-700' : 'text-ink-500'}`} />
      <span className="flex-1 truncate">{item.label}</span>
      {count > 0 && (
        <span className="min-w-[20px] h-5 px-1.5 rounded-pill inline-flex items-center justify-center text-meta font-bold tabular-nums text-white bg-danger-500">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

/* Desktop-only workspace navigation rail for the student — mirrors the tutor's
   WorkspaceSidebar so both workspaces read as one product. Mobile navigation
   stays with the global BottomNav (5 tabs) + the top bar's heart/bell/menu. */
export function StudentSidebar({ badges }: { badges: StudentBadges }) {
  return (
    <aside className="hidden lg:flex flex-col w-[240px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-ink-100 bg-white px-4 py-5">
      <div className="px-3">
        <Logo size="sm" />
      </div>

      <nav aria-label="ჩემი სივრცის ნავიგაცია" className="mt-6 flex flex-col gap-0.5">
        {WORKSPACE_NAV.map(item => (
          <NavRow key={item.href} item={item} badges={badges} />
        ))}
      </nav>

      {/* Outside the workspace proper. „გახდი ექსპერტი" sits here rather than
          in the group above because it leaves the client space — same reason
          „ექსპერტები" does — but it is now ALWAYS on screen, not one click deep
          in the avatar menu. Gated on the real role, never on the shell's
          hardcoded "STUDENT" (see APPLY_LINK). */}
      <div className="mt-4 pt-4 border-t border-ink-100 flex flex-col gap-0.5">
        <NavRow item={CATALOG_LINK} badges={badges} />
        <ApplyCtaGate>
          <NavRow item={APPLY_LINK} badges={badges} />
        </ApplyCtaGate>
      </div>

      <div className="flex-1" />

      {/* Quiet prompt to keep discovering — the client analogue of the tutor's
          profile-strength card. */}
      <Link
        href="/experts"
        className="mt-4 block rounded-card border border-ink-200 bg-ink-50/50 p-3.5 hover:border-ink-300 hover:bg-ink-50 transition-colors duration-fast"
      >
        <Eyebrow tone="muted">
          ახალი კონსულტაცია
        </Eyebrow>
        <div className="mt-1 font-display text-small font-semibold text-ink-800">
          იპოვე ექსპერტი
        </div>
      </Link>
    </aside>
  )
}
