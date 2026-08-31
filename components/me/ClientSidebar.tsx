'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { Eyebrow } from '@/components/Eyebrow'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { WORKSPACE_NAV, CATALOG_LINK, APPLY_LINK, type NavItem } from './navConfig'

// ⚠️ THE BADGE MACHINERY IS GONE (2026-08-30). `useStudentBadges` was a STUB —
// its own header said so — returning `{ messages: 0 }` for ever, because the
// client inbox it once polled went with the booking product. Three call sites
// read it, `badgeCount` mapped it, and every row rendered `count > 0 && …`,
// which is a condition that could not become true. Nothing was drawn by any of
// it. A control that cannot change is not a control.
function NavRow({ item }: { item: NavItem }) {
  const path = usePathname() ?? ''
  const active = item.match(path)
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
    </Link>
  )
}

/* Desktop-only workspace navigation rail for the student — mirrors the tutor's
   WorkspaceSidebar so both workspaces read as one product. Mobile navigation
   stays with the global BottomNav (5 tabs) + the top bar's heart/bell/menu. */
export function ClientSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-[240px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-ink-100 bg-white px-4 py-5">
      <div className="px-3">
        <Logo size="sm" />
      </div>

      <nav aria-label="ჩემი სივრცის ნავიგაცია" className="mt-6 flex flex-col gap-0.5">
        {WORKSPACE_NAV.map(item => (
          <NavRow key={item.href} item={item} />
        ))}
      </nav>

      {/* Outside the workspace proper. „გახდი ექსპერტი" sits here rather than
          in the group above because it leaves the client space — same reason
          „ექსპერტები" does — but it is now ALWAYS on screen, not one click deep
          in the avatar menu. Gated on the real role, never on the shell's
          hardcoded "USER" (see APPLY_LINK). */}
      <div className="mt-4 pt-4 border-t border-ink-100 flex flex-col gap-0.5">
        <NavRow item={CATALOG_LINK} />
        <ApplyCtaGate>
          <NavRow item={APPLY_LINK} />
        </ApplyCtaGate>
      </div>

      <div className="flex-1" />

      {/* ⚠️ A CARD USED TO SIT HERE AND IT WAS A THIRD DOOR TO ONE ROOM
          (removed 2026-08-30). It read „ახალი სერვისი / იპოვე ექსპერტი" and
          linked to /experts — which the row directly above it already does, and
          which the home screen offered again. Four controls to the catalogue on
          one screen.

          Its own comment called it „the client analogue of the tutor's
          profile-strength card". The analogy is where it went wrong: THAT card
          carries information a provider cannot get anywhere else (how much of
          the grant is unearned); this one carried a link. A slot filled for
          symmetry is not a reason for the slot.

          And the words were wrong besides. „ახალი სერვისი" reads as CREATING a
          service — a seller's action — offered to somebody whose whole role
          here is to buy one. */}
    </aside>
  )
}
