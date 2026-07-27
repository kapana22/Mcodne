'use client'
// UserMenu — avatar-triggered dropdown for signed-in users. Currently used
// from the tutor WorkspaceTopBar; the student dashboard has its own inline
// avatar menu. Kept role-aware so future top-bars (admin, unified shell) can
// drop this in without duplicating the menu logic.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { signOut as doSignOut } from '@/lib/signout'
import { useNotifications } from '@/lib/notifications'
import { useMe } from '@/lib/me'

type Role = 'STUDENT' | 'TUTOR' | 'ADMIN'

type MenuItem = {
  href?: string
  label: string
  icon: (p: any) => ReactElement
  // If true, item is treated as a destructive action (e.g. sign out).
  danger?: boolean
  onClick?: () => void | Promise<void>
  // Workspace-section shortcut shown ONLY on mobile (< lg). On desktop the
  // sidebar already lists these, so surfacing them here too would duplicate
  // the nav. Hidden with `lg:hidden` so the desktop dropdown stays a clean
  // account menu.
  mobileOnly?: boolean
}

const STUDENT_ITEMS = (onSignout: () => void): MenuItem[] => [
  { href: '/student/profile',   label: 'პროფილი',       icon: Icon.user },
  { href: '/settings',          label: 'პარამეტრები',   icon: Icon.settings },
  { href: '/notifications',     label: 'შეტყობინებები', icon: Icon.bell },
  { href: '/help',              label: 'დახმარება',     icon: Icon.info },
  { label: 'გამოსვლა',          icon: Icon.logout, danger: true, onClick: onSignout },
]

// Two logical groups, in order:
//  1. Mobile escape-hatch — the workspace sections the 4-tab BottomNav can't
//     hold (schedule/earnings/catalog). `mobileOnly` hides them on desktop,
//     where the sidebar already lists them, so the dropdown isn't a duplicate
//     of the sidebar. Messages/Home/Bookings are omitted entirely — they're in
//     the BottomNav on mobile and the sidebar on desktop.
//  2. Account menu — profile/settings/help/sign-out, shown at every breakpoint.
const TUTOR_ITEMS = (onSignout: () => void): MenuItem[] => [
  { href: '/tutor/schedule',    label: 'გრაფიკი',       icon: Icon.clock,  mobileOnly: true },
  { href: '/tutor/earnings',    label: 'შემოსავალი',    icon: Icon.wallet, mobileOnly: true },
  { href: '/tutors',            label: 'ექსპერტები', icon: Icon.search, mobileOnly: true },
  { href: '/tutor/profile',     label: 'პროფილი',       icon: Icon.user },
  { href: '/settings',          label: 'პარამეტრები',   icon: Icon.settings },
  { href: '/help',              label: 'დახმარება',     icon: Icon.info },
  { label: 'გამოსვლა',          icon: Icon.logout, danger: true, onClick: onSignout },
]

const ADMIN_ITEMS = (onSignout: () => void): MenuItem[] => [
  { href: '/admin',             label: 'ადმინი',        icon: Icon.shield },
  { href: '/settings',          label: 'პარამეტრები',   icon: Icon.settings },
  { href: '/help',              label: 'დახმარება',     icon: Icon.info },
  { label: 'გამოსვლა',          icon: Icon.logout, danger: true, onClick: onSignout },
]

export function UserMenu({
  user,
  role,
}: {
  user?: { name: string; avatar?: string | null }
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Unread indicator on the avatar (count chip — canon bans status dots) — reads the shared
  // lib/notifications store so bell / user menu / bottom nav stay in sync
  // (one app-wide poll, cross-tab aware).
  const { unreadCount: unread } = useNotifications()
  const pathname = usePathname() ?? ''
  // Real role from the shared identity (the shell may hardcode the `role` prop,
  // e.g. the student shell always passes "STUDENT" even when the viewer is a
  // TUTOR consulting/viewing as a client). An approved expert (TUTOR) was a
  // STUDENT first, so they can hold both an expert workspace AND client-side
  // bookings/messages — give them a switch between the two spaces.
  const { me } = useMe()
  const isDualRole = me?.role === 'TUTOR'
  const inClientSpace = pathname.startsWith('/student')

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const signOut = async () => {
    if (busy) return
    setBusy(true)
    // Shared helper: POST-to-signout via fetch, then hard `replace` to the
    // public landing. Same destination on every logout surface (was `/signin`
    // here but `/` on the tutor/student pages — now uniformly `/`).
    await doSignOut('/')
    // If navigation somehow didn't happen (SSR/no window), clear the busy state.
    setBusy(false)
  }

  const baseItems =
    role === 'ADMIN'   ? ADMIN_ITEMS(signOut) :
    role === 'STUDENT' ? STUDENT_ITEMS(signOut) :
                         TUTOR_ITEMS(signOut)

  // Space switcher for a dual-role user (expert who also has a client side).
  // Sits at the top of the menu: „სტუდენტის სივრცე" from the expert workspace,
  // „ექსპერტის სივრცე" from the client space — so student-side messages/bookings
  // stay reachable after becoming an expert (they used to be locked away).
  const switchItem: MenuItem | null = isDualRole
    ? inClientSpace
      ? { href: '/tutor', label: 'ექსპერტის სივრცე', icon: Icon.briefcase }
      : { href: '/student', label: 'სტუდენტის სივრცე', icon: Icon.home }
    : null
  const items = switchItem ? [switchItem, ...baseItems] : baseItems

  const initialName = user?.name ?? ''

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={unread > 0 ? `მომხმარებლის მენიუ — ${unread} წაუკითხავი` : 'მომხმარებლის მენიუ'}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative inline-flex items-center gap-2 h-10 pl-1 pr-2 rounded-btn hover:bg-ink-100 transition-colors"
      >
        <Avatar src={user?.avatar ?? undefined} name={initialName} size={32} />
        <Icon.chevD className="w-3.5 h-3.5 text-ink-500" />
        {/* Count chip, not a status dot (canon) — the same badge the bell uses,
            so the two unread surfaces read identically. A number also says how
            much is waiting, which the dot never did. */}
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 left-[18px] min-w-[16px] h-[16px] px-1 rounded-full bg-danger-500 text-white font-display text-[9.5px] font-bold tabular-nums inline-flex items-center justify-center ring-2 ring-white motion-safe:animate-scale-in"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[240px] bg-white border border-ink-200 rounded-card shadow-float z-50 overflow-hidden motion-safe:animate-[fadeIn_140ms_ease-out]"
        >
          {initialName && (
            <div className="px-4 pt-3 pb-2 border-b border-ink-100">
              <div className="font-display text-[13px] font-bold text-ink-900 truncate">{initialName}</div>
              <Eyebrow tone="muted" className="mt-0.5">
                {role === 'TUTOR' ? 'ექსპერტი' : role === 'ADMIN' ? 'ადმინი' : 'სტუდენტი'}
              </Eyebrow>
            </div>
          )}
          <ul className="py-1.5">
            {items.map((item, idx) => {
              const IconComp = item.icon
              const showsUnread = item.href === '/notifications' || !!item.href?.endsWith('/messages')
              const itemUnread = showsUnread && unread > 0 ? unread : 0
              // Divider between the mobile escape-hatch group and the account
              // group — mobile-only, since the escape-hatch group is hidden on
              // desktop and the divider would otherwise dangle at the top.
              const needsDivider = !item.mobileOnly && idx > 0 && !!items[idx - 1]?.mobileOnly
              const liCls = item.mobileOnly ? 'lg:hidden' : ''
              const cls = `w-full text-left px-4 h-10 inline-flex items-center gap-3 text-[13.5px] font-display font-medium transition-colors ${
                item.danger
                  ? 'text-danger-700 hover:bg-danger-50'
                  : 'text-ink-800 hover:bg-ink-50'
              }`
              const body = item.href ? (
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={cls}
                >
                  <IconComp className="w-4 h-4 text-ink-500 shrink-0" />
                  {/* Unread = bold label + count chip, the ConversationRow /
                      notifications treatment. No status dots (canon). */}
                  <span className={`flex-1 ${itemUnread > 0 ? 'font-bold text-ink-900' : ''}`}>{item.label}</span>
                  {itemUnread > 0 && (
                    <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-500 text-white font-display text-[11px] font-bold tabular-nums">
                      {itemUnread > 9 ? '9+' : itemUnread}
                    </span>
                  )}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false)
                    item.onClick?.()
                  }}
                  className={`${cls} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <IconComp className="w-4 h-4 text-danger-500 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </button>
              )
              return (
                <Fragment key={item.href ?? item.label}>
                  {needsDivider && <li aria-hidden className="lg:hidden my-1.5 border-t border-ink-100" />}
                  <li role="none" className={liCls}>{body}</li>
                </Fragment>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
