'use client'
// UserMenu — avatar-triggered dropdown for signed-in users. Currently used
// from the tutor WorkspaceTopBar; the student dashboard has its own inline
// avatar menu. Kept role-aware so future top-bars (admin, unified shell) can
// drop this in without duplicating the menu logic.

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { signOut as doSignOut } from '@/lib/signout'

type Role = 'STUDENT' | 'TUTOR' | 'ADMIN'

type MenuItem = {
  href?: string
  label: string
  icon: (p: any) => ReactElement
  // If true, item is treated as a destructive action (e.g. sign out).
  danger?: boolean
  onClick?: () => void | Promise<void>
}

const STUDENT_ITEMS = (onSignout: () => void): MenuItem[] => [
  { href: '/student/profile',   label: 'პროფილი',       icon: Icon.user },
  { href: '/settings',          label: 'პარამეტრები',   icon: Icon.settings },
  { href: '/notifications',     label: 'შეტყობინებები', icon: Icon.bell },
  { href: '/help',              label: 'დახმარება',     icon: Icon.doc },
  { label: 'გამოსვლა',          icon: Icon.end, danger: true, onClick: onSignout },
]

// გრაფიკი/შემოსავალი/კატალოგი live here because mobile has no sidebar and
// BottomNav only carries 4 tabs — the menu is the phone's escape hatch to the
// rest of the workspace (the old TutorAppBar chip rail is gone).
const TUTOR_ITEMS = (onSignout: () => void): MenuItem[] => [
  { href: '/tutor/profile',     label: 'პროფილი',       icon: Icon.user },
  { href: '/tutor/schedule',    label: 'გრაფიკი',       icon: Icon.clock },
  { href: '/tutor/earnings',    label: 'შემოსავალი',    icon: Icon.wallet },
  { href: '/tutors',            label: 'ექსპერტების კატალოგი', icon: Icon.search },
  { href: '/settings',          label: 'პარამეტრები',   icon: Icon.settings },
  { href: '/tutor/messages',    label: 'შეტყობინებები', icon: Icon.chat },
  { href: '/help',              label: 'დახმარება',     icon: Icon.doc },
  { label: 'გამოსვლა',          icon: Icon.end, danger: true, onClick: onSignout },
]

const ADMIN_ITEMS = (onSignout: () => void): MenuItem[] => [
  { href: '/admin',             label: 'ადმინი',        icon: Icon.shield },
  { href: '/settings',          label: 'პარამეტრები',   icon: Icon.settings },
  { href: '/help',              label: 'დახმარება',     icon: Icon.doc },
  { label: 'გამოსვლა',          icon: Icon.end, danger: true, onClick: onSignout },
]

export function UserMenu({
  user,
  role,
}: {
  user?: { name: string; avatar?: string | null }
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Unread indicator on the avatar (small red dot) — same source of truth
  // as NotifBell / BottomNav so all three stay in sync across tabs.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/notifications')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!cancelled) setUnread(d?.unreadCount ?? 0) })
        .catch(() => {})
    }
    load()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mcodne:notif-check') load()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
    }
  }, [])

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

  const items =
    role === 'ADMIN'   ? ADMIN_ITEMS(signOut) :
    role === 'STUDENT' ? STUDENT_ITEMS(signOut) :
                         TUTOR_ITEMS(signOut)

  const initialName = user?.name ?? ''

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="მომხმარებლის მენიუ"
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative inline-flex items-center gap-2 h-10 pl-1 pr-2 rounded-btn hover:bg-ink-100 transition-colors"
      >
        <Avatar src={user?.avatar ?? undefined} name={initialName} size={32} />
        <Icon.chevD className="w-3.5 h-3.5 text-ink-500" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 left-6 w-2.5 h-2.5 rounded-full bg-danger-500 ring-2 ring-white"
          />
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
              <div className="text-[10.5px] font-display font-semibold uppercase tracking-[0.18em] text-ink-500 mt-0.5">
                {role === 'TUTOR' ? 'ექსპერტი' : role === 'ADMIN' ? 'ადმინი' : 'კლიენტი'}
              </div>
            </div>
          )}
          <ul className="py-1.5">
            {items.map(item => {
              const IconComp = item.icon
              const showDot = item.href === '/notifications' || item.href?.endsWith('/messages')
              const dot = showDot && unread > 0
              const cls = `w-full text-left px-4 h-10 inline-flex items-center gap-3 text-[13.5px] font-display font-medium transition-colors ${
                item.danger
                  ? 'text-danger-700 hover:bg-danger-50'
                  : 'text-ink-800 hover:bg-ink-50'
              }`
              if (item.href) {
                return (
                  <li key={item.href} role="none">
                    <Link
                      href={item.href}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className={cls}
                    >
                      <IconComp className="w-4 h-4 text-ink-500 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {dot && <span className="w-2 h-2 rounded-full bg-danger-500" />}
                    </Link>
                  </li>
                )
              }
              return (
                <li key={item.label} role="none">
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
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
