'use client'
// Admin shell: brand mark, tab registry, sidebar and top bar.

import { useState } from 'react'
import Link from 'next/link'
import { signOut } from '@/lib/signout'
import { Icon } from '@/components/Icon'
import { b2bFeatureExists } from '@/lib/b2b'

const Logo = () => (
  <Link href="/" className="inline-flex items-center gap-2.5" aria-label="მცოდნე admin">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
    <span className="inline-flex items-center h-5 px-1.5 rounded-pill bg-ink-900 text-white font-display text-micro font-bold uppercase">admin</span>
  </Link>
)

/* ───── Admin shell — sidebar + top bar ───── */
export type AdminTab = 'system' | 'insights' | 'help' | 'overview' | 'moderation' | 'users' | 'bookings' | 'reviews' | 'disputes' | 'finance' | 'broadcast' | 'categories' | 'blog' | 'texts' | 'integrations' | 'audit' | 'companies'

/**
 * Hashes that no longer name a tab, and where they now go.
 *
 * A deep link is a promise: somebody bookmarked `/admin#analytics`, and the
 * browser's own history will keep offering it. Retiring a tab without this map
 * turns that link into a silent no-op — the panel opens on the default tab and
 * nothing says why.
 */
export const TAB_ALIASES: Record<string, AdminTab> = {
  analytics: 'overview',
}

/**
 * THE ONE NAV SOURCE — id, Georgian label, icon and group, in one place.
 *
 * WHY THE GROUPS. Seventeen flat items is the „ძალიან რთული": a solo operator
 * opens four of them in a normal week and the other thirteen are permanently on
 * screen earning a click a month. Nothing is removed — every tab still exists
 * and every feature still works — but they are now sorted by WHEN you need
 * them, so the eye lands on the queue instead of scanning a wall.
 *
 * WHY THE ICONS. A Georgian label is read; a glyph is recognised. With 17 rows
 * the difference is what makes the list scannable rather than readable. Icons
 * are chosen so no two in the list share path data — `Icon.graph`/`Icon.trend`
 * are byte-identical, so only one of them may appear here.
 *
 * ORDER inside a group is a priority statement: „განაცხადები" sits first
 * because it is the only queue with a person waiting at the other end of it.
 */
type NavGroup = 'queue' | 'people' | 'content' | 'signals' | 'system'

const GROUP_LABEL: Record<NavGroup, string> = {
  queue: 'ყოველდღიური',
  people: 'ხალხი',
  content: 'კონტენტი',
  signals: 'ციფრები',
  system: 'სისტემა',
}

type NavItem = { id: AdminTab; l: string; icon: keyof typeof Icon; g: NavGroup }

const ADMIN_NAV: NavItem[] = ([
  { id: 'moderation', l: 'განაცხადები', icon: 'doc', g: 'queue' },
  { id: 'bookings',   l: 'ჯავშნები', icon: 'cal', g: 'queue' },
  { id: 'help',       l: 'ჩატის კითხვები', icon: 'chat', g: 'queue' },
  { id: 'disputes',   l: 'დავები', icon: 'flag', g: 'queue' },

  { id: 'users',      l: 'მომხმარებლები', icon: 'users', g: 'people' },
  { id: 'reviews',    l: 'შეფასებები', icon: 'star', g: 'people' },
  { id: 'broadcast',  l: 'შეტყობინებები', icon: 'send', g: 'people' },
  // B2B (2026-08-11). Filed under „ხალხი" and not „ციფრები": the tab opens on
  // the inbound enquiry queue, and there is a person at the other end of it.
  // The balances behind it are a ledger you open when you already know why.
  { id: 'companies',  l: 'კომპანიები', icon: 'briefcase', g: 'people' },

  { id: 'texts',      l: 'ტექსტები', icon: 'quote', g: 'content' },
  { id: 'blog',       l: 'ბლოგი', icon: 'edit', g: 'content' },
  { id: 'categories', l: 'კატეგორიები', icon: 'grid', g: 'content' },
  // Owner-corrected 2026-08-04: this holds the GA id and the raw header/footer
  // code, and the owner edits it regularly. It was filed under „system" on the
  // assumption that it is set once — it is not, and buried at the bottom of the
  // rail it became unfindable. It belongs with the other things you WRITE.
  { id: 'integrations', l: 'კოდი და ანალიტიკა', icon: 'bolt', g: 'content' },

  // „ანალიტიკა" was removed 2026-08-11: it rendered the same three charts from
  // the same fetch as „მიმოხილვა" and linked to it, so the two were one tab
  // wearing two names. Its unique content moved into the overview; the id stays
  // on AdminTab and page.tsx maps `#analytics` there, so old links still land.
  { id: 'overview',   l: 'მიმოხილვა', icon: 'home', g: 'signals' },
  { id: 'insights',   l: 'ინსაითები', icon: 'pulse', g: 'signals' },
  { id: 'finance',    l: 'ფინანსები', icon: 'wallet', g: 'signals' },

  { id: 'system',     l: 'სისტემა', icon: 'settings', g: 'system' },
  { id: 'audit',      l: 'აუდიტი', icon: 'shield', g: 'system' },
] as NavItem[])
  // ── The ONE line that hides a dark vertical from this panel ──────────────
  // A tab whose feature does not exist on this deployment is filtered out of
  // the source array itself, not merely hidden at render. That matters because
  // everything downstream is DERIVED from this array: the sidebar, the mobile
  // drawer, and VALID_TABS. Filtering here means /admin#companies does nothing
  // at all with the flag off — exactly like any other unknown hash — instead of
  // opening a tab that is simply not drawn in the rail.
  //
  // ⚠️ This is a nav-level hide, and a hide is not a guard. Every /api/admin/
  // companies route checks canSeeB2B() AND requireRoleApi('ADMIN') on its own;
  // nothing here is load-bearing for access control.
  .filter(it => it.id !== 'companies' || b2bFeatureExists())

const NAV_GROUPS: NavGroup[] = ['queue', 'people', 'content', 'signals', 'system']

/** Both surfaces render this, so a badge can never mean two different things
 *  on desktop and mobile (it did: green here, grey there). */
function navBadge(id: AdminTab, pending?: number | null, helpOpen?: number | null, b2bLeads?: number | null): number {
  if (id === 'moderation') return pending ?? 0
  if (id === 'help') return helpOpen ?? 0
  // Unanswered B2B enquiries. Same treatment as the two above and for the same
  // reason: there is a person at the other end of it. Without this a lead sat
  // in a tab nobody opens until somebody thought to look — which is what the
  // owner hit on the first day it was live.
  if (id === 'companies') return b2bLeads ?? 0
  return 0
}

/* Desktop-only left rail — moves the 11-item nav out of the cramped top header
   into a calm sidebar, so managing/moderating is comfortable (mobile keeps the
   TopBar drawer). */
export const AdminSidebar = ({ active, onNav, pendingCount, helpOpen, b2bLeads }: {
  active: AdminTab; onNav: (t: AdminTab) => void; pendingCount?: number | null; helpOpen?: number | null; b2bLeads?: number | null
}) => (
  <aside className="hidden lg:flex flex-col w-[240px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-ink-100 bg-white px-3 py-4">
    <div className="px-3">
      <Logo />
    </div>
    <nav aria-label="ადმინ ნავიგაცია" className="mt-5 flex flex-col gap-3">
      {NAV_GROUPS.map(g => (
        <div key={g}>
          <div className="px-3 pb-1 text-micro uppercase font-display font-semibold text-ink-400">
            {GROUP_LABEL[g]}
          </div>
          <div className="flex flex-col gap-0.5">
            {ADMIN_NAV.filter(it => it.g === g).map(it => {
              const on = active === it.id
              const badge = navBadge(it.id, pendingCount, helpOpen, b2bLeads)
              const Glyph = Icon[it.icon]
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onNav(it.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`h-10 px-3 rounded-btn inline-flex items-center gap-2.5 font-display text-small font-semibold transition-colors duration-fast ${
                    on ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100/70 hover:text-ink-900'
                  }`}
                >
                  <Glyph className={`w-4 h-4 shrink-0 ${on ? 'text-white' : 'text-ink-400'}`} />
                  <span className="flex-1 text-left truncate">{it.l}</span>
                  {badge > 0 && (
                    <span className={`min-w-[20px] h-5 px-1.5 rounded-pill inline-flex items-center justify-center text-meta font-bold tabular-nums ${on ? 'bg-white text-ink-900' : 'bg-brand-600 text-white'}`}>{badge}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
    <div className="flex-1" />
    <button
      type="button"
      onClick={() => signOut()}
      className="mt-4 h-11 px-3 rounded-btn inline-flex items-center gap-2.5 font-display text-small font-semibold text-ink-600 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast"
    >
      <Icon.logout className="w-4 h-4" /> გამოსვლა
    </button>
  </aside>
)

export const TopBar = ({ active, onNav, pendingCount, helpOpen, b2bLeads }: {
  active: AdminTab; onNav: (t: AdminTab) => void; pendingCount?: number | null; helpOpen?: number | null; b2bLeads?: number | null
}) => {
  const [mobOpen, setMobOpen] = useState(false)
  // Reads the SAME ADMIN_NAV as the sidebar. It used to be a second hand-typed
  // array, which is how the badge drifted: this surface keyed its colour off an
  // `urgent` flag that was declared and never set anywhere, so a backlog that
  // was a green attention badge on desktop was a neutral grey pill here.
  return (
  <header className="h-16 px-6 lg:px-8 flex items-center justify-between gap-4 border-b border-ink-200 bg-white sticky top-0 z-30">
    {/* Desktop nav lives in AdminSidebar (which shows the active section), so no
        duplicate title here — just the mobile logo. */}
    <div className="flex items-center gap-3 min-w-0">
      <span className="lg:hidden shrink-0"><Logo /></span>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => signOut()}
        className="hidden md:inline-flex h-9 px-3 rounded-btn text-ink-600 hover:text-danger-700 hover:bg-danger-50 font-display text-small font-semibold items-center gap-1.5 transition-colors duration-fast"
      >
        გამოსვლა
      </button>
      <button type="button" onClick={() => setMobOpen(o => !o)} aria-label="მენიუ" aria-expanded={mobOpen} className="lg:hidden w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-900 hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center transition-colors duration-fast">
        {mobOpen ? <Icon.x className="w-5 h-5" /> : <Icon.menu className="w-5 h-5" />}
      </button>
    </div>
    {mobOpen && (
      <>
        {/* The SAME pair the public nav drawer uses. It was a private 50/51,
            which put the scrim level with the cookie banner (z-consent = 50) —
            same UI concept, two different answers to "what covers what", and
            DOM order deciding a layering question. */}
        <button type="button" aria-label="დახურვა" onClick={() => setMobOpen(false)} className="lg:hidden fixed inset-0 z-drawer-scrim bg-ink-950/55 backdrop-blur-sm" />
        <aside className="lg:hidden fixed top-0 right-0 bottom-0 z-drawer w-[300px] max-w-[85vw] bg-white shadow-float flex flex-col">
          <div className="h-16 px-5 flex items-center justify-between border-b border-ink-200 shrink-0">
            <span className="font-display text-micro font-bold uppercase text-ink-500">მენიუ</span>
            <button type="button" onClick={() => setMobOpen(false)} aria-label="დახურვა" className="w-10 h-10 rounded-btn text-ink-700 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast">
              <Icon.xC className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-4">
          {NAV_GROUPS.map(g => (
            <div key={g}>
              <div className="pb-1 text-micro uppercase font-display font-semibold text-ink-400">{GROUP_LABEL[g]}</div>
              {ADMIN_NAV.filter(it => it.g === g).map(it => {
                const on = active === it.id
                const badge = navBadge(it.id, pendingCount, helpOpen, b2bLeads)
                const Glyph = Icon[it.icon]
                return (
                  <button key={it.id} type="button" onClick={() => { onNav(it.id); setMobOpen(false) }} className={`h-12 w-full flex items-center gap-3 text-body font-display font-medium border-b border-ink-100 last:border-b-0 text-left ${on ? 'text-ink-900' : 'text-ink-700'}`}>
                    <Glyph className={`w-4 h-4 shrink-0 ${on ? 'text-ink-900' : 'text-ink-400'}`} />
                    <span className="flex-1 truncate">{it.l}</span>
                    {/* Same colour as the sidebar, from the same helper. The two
                        used to disagree. */}
                    {badge > 0 && <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-meta font-display font-bold tabular-nums bg-brand-600 text-white">{badge}</span>}
                  </button>
                )
              })}
            </div>
          ))}
          </nav>
          <div className="p-5 border-t border-ink-100">
            <button
              type="button"
              onClick={() => { setMobOpen(false); signOut() }}
              className="w-full h-11 px-3 rounded-btn text-danger-700 hover:bg-danger-50 font-display font-semibold text-small inline-flex items-center justify-center transition-colors duration-fast border border-danger-200"
            >
              გამოსვლა
            </button>
          </div>
        </aside>
      </>
    )}
  </header>
  )
}

// Derived, not hand-listed. As a literal it was the fourth copy of the tab
// list, with no compile-time link to the nav — add a tab, forget this line, and
// the deep link silently no-ops with nothing to notice.
export const VALID_TABS: AdminTab[] = ADMIN_NAV.map(n => n.id)

