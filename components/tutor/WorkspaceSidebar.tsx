'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { Eyebrow } from '@/components/Eyebrow'
import { navFor, CATALOG_LINK, type NavItem, type NavGroups } from './navConfig'
import type { NavBadges } from './useNavBadges'

function badgeCount(item: NavItem, badges: NavBadges): number {
  if (item.badgeKey === 'attention') return badges.requests + badges.reschedules
  if (item.badgeKey === 'messages') return badges.messages
  // The queue badge — verified requests with a place left. Counted by the
  // server layout (app/work/layout.tsx), the same narrowing the queue page
  // reads (lib/serviceProfile → routingWhere); the same badge grammar as the
  // admin rail: a number on a nav item means a person is waiting behind it.
  if (item.badgeKey === 'openRequests') return badges.openRequests
  return 0
}

function NavRow({ item, badges }: { item: NavItem; badges: NavBadges }) {
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
        <span
          className={`min-w-[20px] h-5 px-1.5 rounded-pill inline-flex items-center justify-center text-meta font-bold tabular-nums text-white ${
            item.badgeKey === 'messages' ? 'bg-danger-500' : item.badgeKey === 'openRequests' ? 'bg-brand-600' : 'bg-brand-500'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

/* Desktop-only workspace navigation rail. Mobile navigation stays with the
   global BottomNav (4 tabs) + UserMenu (schedule/earnings/catalog).
   `groups` = which of the two /work groups this viewer holds (navConfig →
   NAV_GROUPS): the expert's items, the master's items, or both with a divider
   between them. Decided by capabilities on the server, never here. */
export function WorkspaceSidebar({ badges, groups }: { badges: NavBadges; groups: NavGroups }) {
  const percent = badges.profilePercent
  const sections = navFor(groups)
  return (
    <aside className="hidden lg:flex flex-col w-[240px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-ink-100 bg-white px-4 py-5">
      <div className="px-3">
        <Logo size="sm" />
      </div>

      <nav aria-label="სამუშაო სივრცის ნავიგაცია" className="mt-6 flex flex-col gap-0.5">
        {sections.map((section, i) => (
          <div key={i} className={i > 0 ? 'mt-4 pt-4 border-t border-ink-100 flex flex-col gap-0.5' : 'flex flex-col gap-0.5'}>
            {section.caption && (
              <Eyebrow tone="muted" className="px-3 mb-1.5">{section.caption}</Eyebrow>
            )}
            {section.items.map(item => (
              <NavRow key={item.href} item={item} badges={badges} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-4 pt-4 border-t border-ink-100">
        <NavRow item={CATALOG_LINK} badges={badges} />
      </div>

      <div className="flex-1" />

      {groups.expert && percent !== null && percent < 100 && (
        <Link
          href="/work/profile"
          className="mt-4 block rounded-card border border-brand-200 bg-brand-50/40 p-3.5 hover:bg-brand-50/70 transition-colors duration-fast"
        >
          <div className="flex items-baseline justify-between gap-2">
            <Eyebrow as="span">
              პროფილის სისრულე
            </Eyebrow>
            <span className="font-display text-small font-bold text-brand-700 tabular-nums">{percent}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-pill bg-white border border-brand-100 overflow-hidden">
            <div
              className="h-full rounded-pill bg-brand-500 motion-safe:transition-[width] motion-safe:duration-slow"
              style={{ width: `${percent}%` }}
            />
          </div>
        </Link>
      )}
    </aside>
  )
}
