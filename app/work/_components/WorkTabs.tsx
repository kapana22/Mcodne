'use client'
// THE TWO STAGES OF ONE JOB — a tab bar shared by /work/jobs and /work/offers.
//
// ⚠️ WHY THIS EXISTS (2026-08-21). The rail carried „სამუშაოები" AND
// „შეთავაზებები" as two destinations, which said they were two subjects. They
// are one: an offer is what a job looks like before the client answers. Owner,
// on the workspace as a whole: „ეს სივრცე ძველებურად არის მოწყობილი —
// კონსულტაციაზეა აგებული და ამიტომ არაკომფორტულია"; ten rows, several of them
// stages of the same thing, is part of what that felt like.
//
// ⚠️ FOUR STAGES SINCE 2026-08-29, AND IT IS STILL NOT A MERGE. Owner, asked
// whether the queue and the jobs should stay two destinations or become one
// flow: „ერთი ნაკადი გახდეს."
//
// They were three pages and two rail rows for the three stages of ONE job — an
// open request, the offer you sent for it, the work you won — so a provider had
// to remember which page a piece of work was sitting on. Now the four stages a
// job actually passes through are one tab bar:
//
//     ახალი → გაგზავნილი → ხელში მაქვს → დასრულებული
//
// ⚠️ THE PAGES STAY WHERE THEY ARE, and that is the whole reason this is safe.
// Each keeps its address and its own gate — /work/(provider)/∗ 404s anybody the
// allowlist does not name, /work/jobs carries the union — so nothing about who
// may see what changes. `PROVIDER_WORKSPACE_PATHS` still names /work/offers and
// tests/spaces §F still pins it. What changed is what a person SEES: one
// screen, four stages, one rail row.
//
// ⚠️ AND „გაგზავნილი" IS ONLY FOR SOMEBODY WHO CAN SEND ONE. An expert who
// sells consultations has no offers page — /work/offers is inside the requests
// subsystem, which 404s anybody the allowlist does not name, so drawing the tab
// for them would be a link to a 404 in their own workspace.

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
// ⚠️ THE ADDRESS COMES FROM THE SUBSYSTEM'S OWN CONSTANT, never quoted here —
// tests/requests forbids a literal „/work/offers" outside the requests family,
// and referencing `PROVIDER_ROUTE` is both the correct dependency direction and
// the reason this file does not trip that scan. Same move navConfig makes.
import { PROVIDER_ROUTE } from '@/lib/requests'

export function WorkTabs({ showOffers, openRequests = 0 }: { showOffers: boolean; openRequests?: number }) {
  const path = usePathname() ?? ''
  // ⚠️ THE JOBS PAGE IS TWO STAGES AT ONE ADDRESS, so the path alone cannot say
  // which is open — ?tab=history is „დასრულებული" and everything else is
  // „ხელში მაქვს". Read here rather than passed in, because the page that owns
  // the param is a server component and this bar is drawn on three routes.
  const historyOpen = (useSearchParams()?.get('tab') ?? '') === 'history'
  if (!showOffers) return null

  // ⚠️ THE ORDER IS THE JOB'S OWN, not the pages'. A piece of work enters as an
  // open request, becomes an offer, becomes work in hand, and ends. Ordering
  // these by which route they happen to live on is what made them read as
  // separate products.
  //
  // „დასრულებული" is /work/jobs too — the page's own `history` filter — so it
  // is a query, not a fourth address.
  const tabs = [
    { href: `${PROVIDER_ROUTE}/requests`, label: 'ახალი', n: openRequests },
    { href: `${PROVIDER_ROUTE}/offers`, label: 'გაგზავნილი', n: 0 },
    { href: '/work/jobs?tab=active', label: 'ხელში მაქვს', n: 0 },
    { href: '/work/jobs?tab=history', label: 'დასრულებული', n: 0 },
  ]

  return (
    <div role="tablist" className="mb-5 flex items-center gap-1 border-b border-ink-100">
      {tabs.map(t => {
        const base = t.href.split('?')[0]
        const onPath = path === base || path.startsWith(base + '/')
        // Both jobs stages share one path, so the query breaks the tie — and
        // lighting neither of them when the other is open is the point.
        const on = base === '/work/jobs'
          ? onPath && (t.href.endsWith('history') ? historyOpen : !historyOpen)
          : onPath
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={on}
            className={`relative inline-flex items-center h-11 px-3 font-display text-small font-semibold whitespace-nowrap transition-colors duration-fast ${
              on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            {t.label}
            {t.n > 0 && (
              <span className="ml-1.5 min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-pill bg-brand-600 text-white text-micro font-bold tabular-nums">
                {t.n}
              </span>
            )}
            {on && <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-brand-500 rounded-full" />}
          </Link>
        )
      })}
    </div>
  )
}
