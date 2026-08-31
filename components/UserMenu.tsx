'use client'
// UserMenu — avatar-triggered dropdown for signed-in users. Currently used
// from the tutor WorkspaceTopBar; the student dashboard has its own inline
// avatar menu. Kept role-aware so future top-bars (admin, unified shell) can
// drop this in without duplicating the menu logic.

import Link from 'next/link'
import { showJoinInvite, JOIN_DOOR_HREF, JOIN_DOOR_LABEL } from '@/lib/capabilities'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { signOut as doSignOut } from '@/lib/signout'
import { useNotifications } from '@/lib/notifications'
import { useMe } from '@/lib/me'
import { useMenuKeys } from '@/lib/useMenuKeys'
import { b2bFeatureExists } from '@/lib/b2b'
import { ROLE, HAT_LABEL, roleLabel, SPACE_LABEL } from '@/lib/roles'
import { PROVIDER_ROUTE, isProviderWorkspacePath } from '@/lib/requests'

type Role = 'USER' | 'PROVIDER' | 'ADMIN'

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
  { href: '/me/profile',   label: 'პროფილი',       icon: Icon.user },
  // „გახდი ექსპერტი" belongs HERE, not only at the bottom of /student/profile.
  // Traced from a real signup (2026-07-29): the person registered as a STUDENT,
  // spent ten minutes looking for how to offer consultations, edited her profile,
  // viewed two expert pages and left — she never reached /apply. The path existed
  // in exactly ONE place: below the sign-out button on a page she had to seek out.
  // The account menu is where someone hunting for „how do I…" actually looks.
  // Only for a plain STUDENT — an expert/admin has no use for it.
  { href: JOIN_DOOR_HREF,       label: JOIN_DOOR_LABEL, icon: Icon.briefcase },
  { href: '/settings',          label: 'პარამეტრები',   icon: Icon.settings },
  { href: '/notifications',     label: 'შეტყობინებები', icon: Icon.bell },
  { href: '/help',              label: 'დახმარება',     icon: Icon.info },
  { label: 'გამოსვლა',          icon: Icon.logout, danger: true, onClick: onSignout },
]

// Two logical groups, in order:
//  1. Mobile escape-hatch — the workspace sections the 4-tab BottomNav can't
//     hold. `mobileOnly` hides them on desktop, where the sidebar already lists
//     them, so the dropdown isn't a duplicate of the sidebar. Messages and Home
//     are omitted entirely — they're in the BottomNav on mobile and the sidebar
//     on desktop.
//  2. Account menu — profile/settings/help/sign-out, shown at every breakpoint.
//
// ⚠️ „გრაფიკი" (/work/schedule) AND „შემოსავალი" (/work/earnings) WERE THE
// FIRST TWO ROWS AND BOTH 404ed (removed 2026-08-26). They were the booking
// calendar and the consultation earnings screen; both pages went with the
// product on 2026-08-24 and the menu kept offering them — so the provider's
// avatar menu on a phone led with two dead ends. The balance a provider does
// have is the credits pill in the top bar, which is a number rather than a
// screen; there is nothing at /work/earnings to point at.
const TUTOR_ITEMS = (onSignout: () => void): MenuItem[] => [
  { href: '/experts',            label: 'ექსპერტები', icon: Icon.search, mobileOnly: true },
  // Also mobileOnly: /work/profile is a rail row on desktop (navConfig).
  { href: '/work/profile',     label: 'პროფილი',       icon: Icon.user, mobileOnly: true },
  { href: '/settings',          label: 'პარამეტრები',   icon: Icon.settings },
  { href: '/help',              label: 'დახმარება',     icon: Icon.info },
  { label: 'გამოსვლა',          icon: Icon.logout, danger: true, onClick: onSignout },
]

const ADMIN_ITEMS = (onSignout: () => void): MenuItem[] => [
  { href: '/admin',             label: 'ადმინი',        icon: Icon.shield },
  // B2B (2026-08-11). THE ONLY LINK TO /business ANYWHERE ON THE SITE, and it
  // is doubly gated: this array is built only for `role === 'ADMIN'` (see the
  // ternary below), and the entry exists at all only while the vertical does.
  //
  // ⚠️ tests/b2b.test.ts scans the tree for exactly this and allowlists this
  // one site by name. If a second link is ever wanted, it must be gated the
  // same way and added to that allowlist deliberately — never by widening the
  // scan, which is the whole guarantee that a dark vertical stays dark.
  ...(b2bFeatureExists()
    ? [{ href: '/business', label: 'ბიზნესი', icon: Icon.briefcase } as MenuItem]
    : []),
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
  // ↑/↓/Home/End/Escape/Tab for the dropdown. The role="menu" below was already
  // promising this behaviour and not delivering it.
  const { triggerRef, menuProps } = useMenuKeys(open, () => setOpen(false))

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
  const isDualRole = me?.role === ROLE.PROVIDER
  // The two spaces (stage 6, 2026-08-19): /me is the client's, /work the supply
  // side's — and inside /work the master's three screens are their own room.
  const inClientSpace = pathname.startsWith('/me')
  // ⚠️ THE HATS, BECAUSE `role` CANNOT SEE A MASTER (2026-08-18). An
  // allowlisted tradesperson keeps role STUDENT by design (lib/hats), so this
  // menu was labelling them „სტუდენტი", offering them „შემოგვიერთდი" pointing
  // at the EXPERT application, and gating its space switcher on
  // `role === ROLE.PROVIDER` — with the result that there was NO route back to
  // the master's screens from anywhere on the site. Their own workspace was
  // reachable only by typing the URL or signing in again.
  const hats = me?.hats ?? []
  const sellsHere = hats.includes('PROVIDER')
  const inProviderSpace = isProviderWorkspacePath(pathname)
  const inExpertSpace = pathname.startsWith('/work') && !inProviderSpace

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      // Focus goes back to the avatar button — the menu's own handler does the
      // same, and two Escape paths must not behave differently.
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
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
    role === ROLE.USER ? STUDENT_ITEMS(signOut) :
                         TUTOR_ITEMS(signOut)

  // Space switcher for somebody with more than one room. Sits at the top of
  // the menu and offers every space they hold EXCEPT the one they are in:
  // „ექსპერტის სივრცე" (/work) for a dual-role expert, „ხელოსნის სივრცე"
  // (the master's screens) for a MASTER hat, „კლიენტის სივრცე" (/me) for
  // either — so client-side messages/bookings stay reachable after becoming
  // an expert (they used to be locked away), and a person holding both supply
  // hats can reach both rooms rather than only the first one checked. The
  // master's door is gated on the HAT, never on a role: an approved
  // tradesperson keeps role STUDENT, and the hat requires the same allowlist
  // row the workspace itself checks (tests/requests.test.ts pins this).
  const switchItems: MenuItem[] = []
  // ⚠️ ONE DOOR, NOT TWO (2026-08-20). Both branches used to push an item —
  // an expert got „ექსპერტის სივრცე" → /work and a provider „ხელოსნის სივრცე"
  // → /work/requests — so somebody holding both hats read two entries for one
  // room, and the provider's entry skipped the home screen carrying their
  // balance. /work now serves both, so the two checks answer one item.
  if ((isDualRole || sellsHere) && !inExpertSpace && !inProviderSpace) {
    switchItems.push({ href: '/work', label: SPACE_LABEL.PROVIDER, icon: Icon.briefcase })
  }
  // ⚠️ ONLY WHEN THERE IS SOMETHING IN IT (2026-08-21). Owner: „ირევა
  // ჩვეულებრივ იუზერსა და ეს უნდა გავმიჯნოთ სწორად." „ჩემი სივრცე" sat directly
  // beneath „სამუშაო სივრცე" for every provider, and the two words read as one
  // idea twice — both rooms are „mine", and nothing said which one held what.
  //
  // The separation is not a better label, it is a truer condition: measured that
  // day, 27 OF 29 PROVIDERS HAD AN ENTIRELY EMPTY CLIENT ROOM — nothing bought,
  // nothing saved, nothing asked for. The door was furniture. A provider's menu
  // is about selling; the client room appears when they have actually been a
  // client, and `clientRoom` flips the moment they do any of the three, so
  // nobody is ever locked out of their own bookings or messages.
  //
  // Somebody ALREADY IN the client space keeps the way back regardless — that is
  // the switcher doing its job, not an invitation.
  if ((isDualRole || sellsHere) && !inClientSpace && me?.clientRoom) {
    switchItems.push({ href: '/me', label: SPACE_LABEL.CLIENT, icon: Icon.home })
  }
  // ADMIN manages all three worlds — give the menu direct doors into both
  // spaces (user request 2026-08-01: „ადმინადაც და სტუდენტადაც… იკარგება").
  const adminSpaceItems: MenuItem[] = role === 'ADMIN'
    ? [
        { href: '/me', label: SPACE_LABEL.CLIENT, icon: Icon.home },
        { href: '/work', label: SPACE_LABEL.PROVIDER, icon: Icon.briefcase },
      ]
    : []
  // „გახდი ექსპერტი" only for someone who can actually apply — an approved
  // expert browsing their client space was still being invited to become one.
  const gated = baseItems.filter(i => i.href !== '/join' || showJoinInvite(role, me?.provider))
  // ⚠️ THE OTHER HALF (2026-08-19). A provider who holds one capability is the
  // one person `showApplyCta` hides the join door from — so the switch the
  // product is built on („ვიღაცას ექნებოდა ჩართული კონსულტაციის ფუნქცია,
  // ვიღაცას არა") could only be reached by typing /join. This row is that
  // switch, and it is here rather than in the workspace rail because the menu
  // is the one surface present in every space and on a phone.
  // ⚠️ IT SAID „ჩართე სერვისები" TO PEOPLE WHO ALREADY SELL ONE (2026-08-21).
  // Owner: „როცა უკვე სერვისი მაქვს არ გვინდა… პროფილში უნდა იყოს რედაქტირება
  // და მუშაობა და შეცვლა." Measured the same day: all 29 providers hold exactly
  // one capability, so every single one of them was being invited to switch on
  // something they had already been selling for weeks — a consultation IS a
  // service (CLAUDE.md rule 2), so the row was arguing with the product model.
  //
  // The menu now points at the page that answers „რას ვყიდი?" — /work/services,
  // the same „ჩემი სერვისები" the workspace rail and the bottom nav already
  // name. Adding, editing and changing all live there.
  //
  // THE SWITCH ITSELF IS NOT LOST, it moved to where it belongs: /work/services
  // offers the other half at the bottom of what you already sell, which is the
  // moment it makes sense to ask. That page used to say the invitation was
  // „/join's job" and this is that comment being paid off — the 2026-08-19 fix
  // („ფუნქციებში ექნებოდა ეს გასააქტიურებელი") kept its meaning and lost its
  // nag.
  const sells = me?.provider === true
  // `mobileOnly`, because the workspace rail already carries this exact row on
  // desktop — the convention the გრაფიკი/შემოსავალი/ექსპერტები rows above
  // already follow. Without it the menu repeated the rail two items running.
  const servicesItem: MenuItem[] = sells
    ? [{ href: '/work/profile', label: 'ჩემი გვერდი', icon: Icon.user, mobileOnly: true }]
    : []
  const items = [...switchItems, ...adminSpaceItems, ...servicesItem, ...gated]

  const initialName = user?.name ?? ''

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={unread > 0 ? `მომხმარებლის მენიუ — ${unread} წაუკითხავი` : 'მომხმარებლის მენიუ'}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative inline-flex items-center gap-2 h-11 pl-1 pr-2 rounded-btn hover:bg-ink-100 transition-colors duration-fast"
      >
        <Avatar src={user?.avatar ?? undefined} name={initialName} size={32} />
        <Icon.chevD className="w-3.5 h-3.5 text-ink-500" />
        {/* NO unread badge here (removed 2026-07-30). Every top bar that
            renders this menu renders a NotifBell immediately to its left with
            the identical count — the avatar badge painted the same number twice,
            40px apart. Measured: one unread message produced FOUR red badges on
            a single mobile screen (bell, avatar, messages tab, profile tab). The
            bell owns the count; this is the account menu. The aria-label above
            still carries it, so a screen-reader user loses nothing. */}
      </button>

      {open && (
        <div
          {...menuProps}
          role="menu"
          className="absolute right-0 top-full mt-2 w-[240px] bg-white border border-ink-200 rounded-card shadow-float z-50 overflow-hidden motion-safe:animate-fade-in-fast"
        >
          {initialName && (
            <div className="px-4 pt-3 pb-2 border-b border-ink-100">
              <div className="font-display text-small font-bold text-ink-900 truncate">{initialName}</div>
              {/* ⚠️ THE HAT, NOT THE ROLE (2026-08-18). An approved
                  tradesperson keeps role STUDENT, so this line printed
                  „კლიენტი" under the name of somebody whose whole relationship
                  with the site is that they fix taps. The hat is what they
                  actually are; the role stays the fallback for everybody
                  without one. */}
              <Eyebrow tone="muted" className="mt-0.5">
                {sellsHere ? HAT_LABEL.PROVIDER : roleLabel(role)}
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
              const cls = `w-full text-left px-4 h-11 inline-flex items-center gap-3 text-body font-display font-medium transition-colors duration-fast ${
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
                    <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-600 text-white font-display text-meta font-bold tabular-nums">
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
