'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { Btn } from '@/components/Btn'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import {
  WORKSPACE_NAV, CATALOG_LINK, APPLY_LINK, NEW_REQUEST_ACTION,
  type NavItem, type ClientNavBadges,
} from './navConfig'

/* THE CLIENT'S RAIL — rebuilt 2026-08-31 from the owner's design canvas
   („Client Space"). Three things changed and each was in the canvas:

     · A COUNT BADGE on „მთავარი". The rail carried badge machinery until
       2026-08-30 and it was deleted for the right reason — `useStudentBadges`
       was a stub returning `{ messages: 0 }` for ever, so nothing was ever
       drawn and „a control that cannot change is not a control". The badge is
       back with something behind it: `liveRequestCount`, a real `count()` run
       in app/me/layout. 🔒 If it were ever a guess it would have to go again.
     · A FILLED „ახალი მოთხოვნა" pinned to the bottom. See NEW_REQUEST_ACTION in
       ./navConfig for why this is not the fourth door the 2026-08-30 note
       removed — that one linked to /experts, this is the intake, which had no
       permanent control in this chrome at all.
     · The rows are 46px and the rail 248px, per the canvas. */

/* ⚠️ EVERY ROW USED TO BE HANDED `requestCount` (fixed 2026-09-02). `NavRow`
   took a single `count` and the rail passed `requestCount` to all four rows;
   only „მთავარი" carried a `badgeKey`, so the wrong ones drew nothing and the
   defect was invisible. The moment „მიმოწერა" got a key — today — that same
   prop would have printed the number of LIVE REQUESTS beside the word
   „მიმოწერა". One object keyed by `badgeKey`, exactly as
   components/work/WorkspaceSidebar → `badgeCount` does it, is the shape where
   that cannot happen. */
function badgeCount(item: NavItem, badges: ClientNavBadges): number {
  if (item.badgeKey === 'requests') return badges.requests
  if (item.badgeKey === 'messages') return badges.messages
  return 0
}

/** The pill's fill, per key — the supply side's grammar, unchanged: unread
 *  MESSAGES are the red one, everything else is brand. Both are AA on white
 *  (danger-500 #9B2932, brand-700), which `tests/designTokens.test.ts §B`
 *  computes rather than trusts. */
function badgeFill(item: NavItem): string {
  return item.badgeKey === 'messages' ? 'bg-danger-500' : 'bg-brand-700'
}

/** What a screen reader hears instead of a bare number. Never invented — each
 *  is the row's own label put into a sentence. */
function badgeLabel(item: NavItem, n: number): string {
  return item.badgeKey === 'messages' ? `${n} წაუკითხავი შეტყობინება` : `${n} აქტიური მოთხოვნა`
}

function NavRow({ item, badges }: { item: NavItem; badges: ClientNavBadges }) {
  const path = usePathname() ?? ''
  const active = item.match(path)
  const IconComp = Icon[item.icon]
  // 🔒 ZERO IS NOT DRAWN. „0 მოთხოვნა" is a fact nobody needs and a badge that
  // is always present stops being a signal.
  const count = badgeCount(item, badges)
  const badge = item.badgeKey && count > 0 ? count : null
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`h-[46px] px-3 rounded-btn inline-flex items-center gap-3 font-display text-body font-semibold transition-colors duration-fast ${
        active ? 'bg-brand-50 text-brand-900' : 'text-ink-700 hover:bg-ink-100/70 hover:text-ink-900'
      }`}
    >
      <IconComp className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-brand-700' : 'text-ink-500'}`} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge !== null && (
        // brand-700 rather than the canvas's literal #1E6656 — same colour, and
        // it is white text on a filled brand surface, so it has to be a token
        // the contrast test can see (CLAUDE.md, „fills start at 600").
        <span
          aria-label={badgeLabel(item, badge)}
          className={`min-w-[22px] h-[22px] px-1.5 rounded-pill ${badgeFill(item)} text-white font-display text-meta font-bold tabular-nums inline-flex items-center justify-center`}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}

/* Desktop-only workspace navigation rail for the client — mirrors the
   provider's WorkspaceSidebar so both workspaces read as one product. Mobile
   navigation stays with the global BottomNav (3 tabs) + the top bar's bell and
   avatar menu. */
export function ClientSidebar({
  badges,
  newRequestHref,
}: {
  /** Every number this rail prints, resolved server-side — see ClientNavBadges. */
  badges: ClientNavBadges
  newRequestHref: string | null
  /** Already a seller — the join door is not for them. Server-supplied so the
   *  first paint is already correct; `ApplyCtaGate` could only fix it after a
   *  round-trip. */
}) {
  return (
    <aside className="hidden lg:flex flex-col w-[248px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-ink-100 bg-white px-4 py-5">
      <div className="px-3 pb-4">
        <Logo size="sm" />
      </div>

      <nav aria-label="ჩემი სივრცის ნავიგაცია" className="flex flex-col gap-0.5">
        {WORKSPACE_NAV.map(item => (
          <NavRow key={item.href} item={item} badges={badges} />
        ))}
      </nav>

      {/* Outside the workspace proper. „დაარეგისტრირე სერვისი" sits here rather
          than in the group above because it leaves the client space — same
          reason „ექსპერტები" does — but it is ALWAYS on screen, not one click
          deep in the avatar menu. Gated on the real role, never on the shell's
          hardcoded "USER" (see APPLY_LINK). */}
      <div className="mt-3.5 pt-3.5 border-t border-ink-100 flex flex-col gap-0.5">
        <NavRow item={CATALOG_LINK} badges={badges} />
        {/* ⚠️ THE SERVER'S ANSWER, NOT THE CLIENT'S GUESS (2026-09-01).
            `ApplyCtaGate` still guards every surface that has no server fact to
            hand — it is the reason „a provider is invited to become one" cannot
            reappear per-surface — but this rail is rendered by a layout that
            has already asked `sellsHere`. Wrapping it in the gate alone put the
            row in the FIRST PAINT for everybody and removed it a fetch later. */}
        {/* ⚠️ THE `!sells` GUARD IS GONE (2026-09-02) BECAUSE THE ROOM IS.
            /me redirects a seller to /work before this rail is built, so every
            reader of this sidebar is somebody who does not sell here and the
            server fact could only ever be false. `ApplyCtaGate` stays — it is
            the rule „a provider is never invited to become one", expressed
            once, for the surfaces that have no server answer to hand. */}
        <ApplyCtaGate>
          <NavRow item={APPLY_LINK} badges={badges} />
        </ApplyCtaGate>
      </div>

      <div className="flex-1" />

      {/* ⚠️ A CARD USED TO SIT HERE AND IT WAS A THIRD DOOR TO ONE ROOM
          (removed 2026-08-30): it read „ახალი სერვისი / იპოვე ექსპერტი" and
          linked to /experts, which the row directly above it already does. What
          the canvas puts in the slot is not that link — it is the INTAKE, the
          one thing this room exists to start, and it was previously reachable
          only from the home screen's hero. Null when the subsystem is off, so
          the button is absent rather than broken. */}
      {newRequestHref && (
        <Btn href={newRequestHref} variant="primary" size="lg" className="h-[52px] w-full">
          {NEW_REQUEST_ACTION.label}
        </Btn>
      )}
    </aside>
  )
}
