'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { gelLabel } from '@/lib/credits'
import { Eyebrow } from '@/components/Eyebrow'
import { navFor, type NavItem, type NavGroups } from './navConfig'
import type { NavBadges } from './useNavBadges'

function badgeCount(item: NavItem, badges: NavBadges): number {
  // ⚠️ `attention` WAS THE FIRST BRANCH AND IT SUMMED TWO ZEROES
  // (removed 2026-08-26): `requests + reschedules` were booking counts the API
  // stopped computing on 2026-08-24, so the „სამუშაოები" pill could never
  // render a number. If that item should carry one again, the honest source is
  // the jobs page's own „attention" bucket (lib → buildJobRows), counted on the
  // server the way `openRequests` already is.
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
            /* ⚠️ THE FALLBACK IS brand-600, NOT brand-500 (2026-08-31). This
               badge is white text on a filled brand surface, and white on
               brand-500 measures 3.38 — below the 4.5 that small text needs.
               No badge reaches this branch today (navConfig defines only
               `messages` and `openRequests`), which is exactly why it was
               wrong and nothing said so: the third badge somebody adds would
               have shipped the failure. Measured, not assumed — brand-600 is
               4.78 and danger-500 is 7.62. */
            item.badgeKey === 'messages' ? 'bg-danger-500' : item.badgeKey === 'openRequests' ? 'bg-brand-600' : 'bg-brand-600'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

/* Desktop-only workspace navigation rail. Mobile navigation is the global
   BottomNav, which draws THESE FIVE ROWS (components/BottomNav → PROVIDER_TABS)
   plus UserMenu for the rare destinations.

   ⚠️ THIS PARAGRAPH WAS WRONG IN THREE PLACES until 2026-08-30 and every one of
   them was a product that had been removed: „4 tabs" (the phone drew a set
   missing „ჩემი სერვისები"), „schedule/earnings/catalog" (a calendar and an
   earnings screen that went with the booking product), and „the expert's items,
   the master's items … decided by capabilities" (the CONSULT/WORK pair, gone
   2026-08-24). A comment describing a shape the code no longer has is worse
   than none: it is read as documentation. */
export function WorkspaceSidebar({ badges, groups, unearnedTetri = 0, grantPercent = null }: {
  badges: NavBadges
  groups: NavGroups
  /** What the unfinished profile is still worth, in tetri. 0 hides the line. */
  unearnedTetri?: number
  /** The grant's own completeness, from the server. */
  grantPercent?: number | null
}) {
  // ⚠️ FROM THE SERVER, NOT FROM THE BADGE POLL (2026-08-30), and for two
  // reasons. It used to read `badges.profilePercent`, which arrives from
  // /api/work/nav-badges AFTER mount — so this block, the one added that
  // morning, rendered nothing on the first paint and then appeared: the exact
  // stutter the owner had reported hours earlier. And that number came from
  // lib/profileScore while the line beneath it comes from the grant, so the bar
  // could sit at 100% above „კიდევ 40 ₾". One source now, in the first paint.
  const percent = grantPercent
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

      {/* ⚠️ THE CATALOGUE ROW IS GONE (2026-09-02). „ექსპერტები" → /experts sat
          below a divider here, and /experts is the screen a CLIENT uses to shop
          for somebody like this person. Owner: „თუ ექსპერტად რეგისტრირდება
          ადამიანი, მაგ შემთხვევაში აღარ უნდა ჰქონდეს კლიენტის ფუნქციები."
          A provider's own card is „ჩემი გვერდი" two rows above, which is the
          selling-side answer to the one thing they might have wanted here. */}

      <div className="flex-1" />

      {/* ⚠️ THE BAR NOW SAYS WHAT IT IS WORTH, NOT HOW FULL IT IS (2026-08-30,
          from the owner's canvas, where this line is on SEVEN of the fourteen
          artboards — it is the most-repeated element in the whole design).
          It used to read „პროფილის სისრულე · 60%", which is a metric about a
          form: true, and it answers nothing a person would act on. „კიდევ 40 ₾
          პროფილის შევსებისთვის" is the same bar with the reason attached.

          ⚠️ IT DOES NOT REPEAT THE BALANCE. The canvas prints „ბალანსი 60 ₾"
          here because its rail is the only place that number appears; ours has
          it in the top bar already (components/CreditPill, put there on the
          owner's „აქ უნდა ჩანდეს ლამაზად", 2026-08-21). Two readouts of one
          number in one chrome is the confusion this session keeps removing, so
          this block keeps the half the pill cannot carry: what is still unearned. */}
      {percent !== null && percent < 100 && (
        <Link
          href="/work/profile"
          className="mt-4 block rounded-card border border-brand-200 bg-brand-50/40 p-3.5 hover:bg-brand-50/70 transition-colors duration-fast"
        >
          <div className="flex items-baseline justify-between gap-2">
            <Eyebrow as="span">
              პროფილი
            </Eyebrow>
            <span className="font-display text-small font-bold text-brand-700 tabular-nums">{percent}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-pill bg-white border border-brand-100 overflow-hidden">
            <div
              className="h-full rounded-pill bg-brand-500 motion-safe:transition-[width] motion-safe:duration-slow"
              style={{ width: `${percent}%` }}
            />
          </div>
          {/* Only when there is something left to earn. A provider whose grants
              are all paid but whose profile is short of 100% would otherwise be
              shown „კიდევ 0 ₾", which is a promise of nothing. */}
          {unearnedTetri > 0 && (
            <p className="mt-2 text-meta text-brand-700 leading-snug">
              კიდევ {gelLabel(unearnedTetri)} პროფილის შევსებისთვის
            </p>
          )}
        </Link>
      )}
    </aside>
  )
}
