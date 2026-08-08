'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { safeHttpUrl as safeDocHref } from '@/lib/safeUrl'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { signOut } from '@/lib/signout'
import { broadcastSessionChange } from '@/lib/sessionSignal'
import { fmtKaDate, KA_MONTHS_LONG as KA_MONTHS, KA_MONTHS_SHORT_DOT } from '@/lib/kaDate'
import { AdminConfirmDialog, AdminMessageDialog, AdminDeleteUserDialog, TabHeader, adminOk, AdminLoading, AdminError, type DeleteImpact, type DeleteMode } from './_parts'
import { isAnonymized } from '@/lib/userDeletion'
import { packagesFeatureExists } from '@/lib/packages'
import {
  normalizeCertificates, summarizeProfessionData, hasVerificationDocument,
  missingApplicationParts, fileLabel,
} from './_application'
import { BlogSection } from './_blog'
import { SiteTextsSection } from './_texts'
import { IntegrationsSection } from './_integrations'
import { SystemSection } from './_system'
import { InsightsSection } from './_insights'
import { HelpSection } from './_help'
import { MiniChart, CHART } from './_charts'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'

// Tutor-supplied URLs (ID/selfie/certificate scans, LinkedIn, website) are
// rendered as clickable links in the moderation panel. React does NOT block
// `javascript:`/`data:text/html` schemes in an href, so a crafted URL would
// execute on an admin's click. `safeDocHref` (= shared `safeHttpUrl`, imported
// at the top) yields `undefined` for any unsafe scheme so the anchor is
// non-navigable rather than an interpreted payload.


const Logo = () => (
  <Link href="/" className="inline-flex items-center gap-2.5" aria-label="მცოდნე admin">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
    <span className="inline-flex items-center h-5 px-1.5 rounded-pill bg-ink-900 text-white font-display text-micro font-bold uppercase">admin</span>
  </Link>
)

/* ───── Admin shell — sidebar + top bar ───── */
type AdminTab = 'system' | 'insights' | 'help' | 'overview' | 'moderation' | 'users' | 'bookings' | 'reviews' | 'disputes' | 'finance' | 'analytics' | 'broadcast' | 'categories' | 'blog' | 'texts' | 'integrations' | 'audit'

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

const ADMIN_NAV: NavItem[] = [
  { id: 'moderation', l: 'განაცხადები', icon: 'doc', g: 'queue' },
  { id: 'bookings',   l: 'ჯავშნები', icon: 'cal', g: 'queue' },
  { id: 'help',       l: 'ჩატის კითხვები', icon: 'chat', g: 'queue' },
  { id: 'disputes',   l: 'დავები', icon: 'flag', g: 'queue' },

  { id: 'users',      l: 'მომხმარებლები', icon: 'users', g: 'people' },
  { id: 'reviews',    l: 'შეფასებები', icon: 'star', g: 'people' },
  { id: 'broadcast',  l: 'შეტყობინებები', icon: 'send', g: 'people' },

  { id: 'texts',      l: 'ტექსტები', icon: 'quote', g: 'content' },
  { id: 'blog',       l: 'ბლოგი', icon: 'edit', g: 'content' },
  { id: 'categories', l: 'კატეგორიები', icon: 'grid', g: 'content' },
  // Owner-corrected 2026-08-04: this holds the GA id and the raw header/footer
  // code, and the owner edits it regularly. It was filed under „system" on the
  // assumption that it is set once — it is not, and buried at the bottom of the
  // rail it became unfindable. It belongs with the other things you WRITE.
  { id: 'integrations', l: 'კოდი და ანალიტიკა', icon: 'bolt', g: 'content' },

  { id: 'overview',   l: 'მიმოხილვა', icon: 'home', g: 'signals' },
  { id: 'analytics',  l: 'ანალიტიკა', icon: 'graph', g: 'signals' },
  { id: 'insights',   l: 'ინსაითები', icon: 'pulse', g: 'signals' },
  { id: 'finance',    l: 'ფინანსები', icon: 'wallet', g: 'signals' },

  { id: 'system',     l: 'სისტემა', icon: 'settings', g: 'system' },
  { id: 'audit',      l: 'აუდიტი', icon: 'shield', g: 'system' },
]

const NAV_GROUPS: NavGroup[] = ['queue', 'people', 'content', 'signals', 'system']

/** Both surfaces render this, so a badge can never mean two different things
 *  on desktop and mobile (it did: green here, grey there). */
function navBadge(id: AdminTab, pending?: number | null, helpOpen?: number | null): number {
  if (id === 'moderation') return pending ?? 0
  if (id === 'help') return helpOpen ?? 0
  return 0
}

/* Desktop-only left rail — moves the 11-item nav out of the cramped top header
   into a calm sidebar, so managing/moderating is comfortable (mobile keeps the
   TopBar drawer). */
const AdminSidebar = ({ active, onNav, pendingCount, helpOpen }: {
  active: AdminTab; onNav: (t: AdminTab) => void; pendingCount?: number | null; helpOpen?: number | null
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
              const badge = navBadge(it.id, pendingCount, helpOpen)
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

const TopBar = ({ active, onNav, pendingCount, helpOpen }: {
  active: AdminTab; onNav: (t: AdminTab) => void; pendingCount?: number | null; helpOpen?: number | null
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
                const badge = navBadge(it.id, pendingCount, helpOpen)
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

/* ───── Hero ───── */
// Node's built-in ICU has en-US only, so `toLocaleDateString('ka-GE', …)`
// returns English on the server and Georgian on the client — hydration
// mismatch on every load. Format Georgian manually + defer to useEffect for
// timezone safety.
const KA_WEEKDAYS = ['კვირა','ორშ.','სამშ.','ოთხ.','ხუთ.','პარ.','შაბ.']
const fmtAdminDate = (d: Date) =>
  `${KA_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${KA_MONTHS[d.getMonth()]}, ${d.getFullYear()}`

const Hero = () => {
  const [today, setToday] = useState<string>('')
  useEffect(() => { setToday(fmtAdminDate(new Date())) }, [])
  return (
    <section className="px-6 lg:px-8 pt-7 pb-6 border-b border-ink-100 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-1.5 min-h-[16px]" suppressHydrationWarning>
            ადმინ პანელი{today ? ` · ${today}` : ''}
          </div>
          <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.08]">
            მიმოხილვა
          </h1>
          <p className="mt-2 text-body text-ink-600 max-w-[600px]">
            პლატფორმის ცოცხალი ინდიკატორები. მოდერაცია, მომხმარებლები, ფინანსები და ანალიტიკა.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => { window.location.hash = 'analytics' }} className="h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-small inline-flex items-center gap-1.5 transition-colors duration-fast">
            <Icon.doc className="w-3.5 h-3.5" /> ანალიტიკა
          </button>
          <button type="button" onClick={() => { window.location.hash = 'moderation' }} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast">
            <Icon.bolt className="w-3.5 h-3.5" /> მოდერაცია
          </button>
        </div>
      </div>
    </section>
  )
}

/* ───── KPI Stat ─────
   Sparklines were removed 2026-07: they rendered FABRICATED series (hardcoded
   arrays) next to real numbers — decorative fiction an admin could mistake for
   trend data. KPI cards now show only real values from /api/admin/stats. */
type Stat = { label: string; value: string; sub: React.ReactNode; cat: string }

// Skeleton card definitions — labels/categories only; values start blank ('—')
// and are only ever filled from the real /api/admin/stats response.
const STAT_DEFS: Pick<Stat, 'cat' | 'label'>[] = [
  { cat: 'მოცულობა · სულ', label: 'ჯავშანი პლატფორმაზე' },
  { cat: 'ფინანსები', label: 'GMV სულ' },
  { cat: 'რიგი', label: 'მოლოდინში (განაცხადი)' },
  { cat: 'აქტიური', label: 'მომხმარებელი / ექსპერტი' },
]

const StatCard = ({ s, idx }: { s: Stat; idx: number }) => (
  <div className="relative p-5 rounded-card bg-white border border-ink-200 hover:border-ink-300 transition-colors duration-fast">
    <div className="flex items-baseline justify-between gap-2">
      <Eyebrow as="span" tone="muted" aria-hidden className="tabular-nums">№ {String(idx + 1).padStart(2, '0')}</Eyebrow>
      <Eyebrow as="span" tone="muted" className="truncate">{s.cat}</Eyebrow>
    </div>
    <Eyebrow tone="muted" className="mt-4">{s.label}</Eyebrow>
    <div className="mt-1 font-display text-display font-bold text-ink-900 tracking-tight tabular-nums leading-none">{s.value}</div>
    <div className="mt-4 pt-3 border-t border-ink-100 text-meta text-ink-600 leading-snug">{s.sub}</div>
  </div>
)

const Stats = () => {
  const PLACEHOLDER: Stat[] = STAT_DEFS.map(s => ({ ...s, value: '—', sub: <span className="text-ink-400">—</span> }))
  const [live, setLive] = useState<Stat[] | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/stats', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d || cancelled) return
        setLive([
          { ...STAT_DEFS[0], value: (d.bookings ?? 0).toLocaleString('ka-GE'), sub: <span><span className="font-semibold text-success-700">{d.completed ?? 0}</span> დასრულებული · {d.live ?? 0} ცოცხალი</span> },
          { ...STAT_DEFS[1], value: `₾${(d.revenue ?? 0).toLocaleString('ka-GE')}`, sub: <span>კომისია ≈ ₾{Math.round((d.revenue ?? 0) * 0.15).toLocaleString('ka-GE')}</span> },
          { ...STAT_DEFS[2], value: String(d.pendingApps ?? 0), sub: <span>ექსპერტების განაცხადი მოდერაციისთვის</span> },
          { ...STAT_DEFS[3], value: `${d.students ?? 0} / ${d.tutors ?? 0}`, sub: <span>სულ {(d.users ?? 0).toLocaleString('ka-GE')} რეგისტრირებული</span> },
        ])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return (
    <section className="px-6 lg:px-8 mt-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(live ?? PLACEHOLDER).map((s, i) => <StatCard key={i} s={s} idx={i} />)}
      </div>
    </section>
  )
}

/* ───── Section: Overview (default) — real Stats + a jump to moderation ───── */
// Compact 30-day trend row for the overview — the dashboard's first impression.
const OverviewTrends = () => {
  const [s, setS] = useState<SeriesData | null>(null)
  useEffect(() => { fetch('/api/admin/analytics/series', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setS).catch(() => {}) }, [])
  if (!s) return null
  return (
    <section className="px-6 lg:px-8 mt-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-micro font-bold text-ink-500 uppercase shrink-0">ბოლო 30 დღე</span>
        <a href="#analytics" className="text-meta font-semibold text-brand-700 hover:underline shrink-0">სრული ანალიტიკა →</a>
        <div className="flex-1 h-px bg-ink-100" />
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <MiniChart title="ახალი ანგარიშები" data={s.signups} labels={s.days} kind="area" color={CHART.brand} />
        <MiniChart title="ჯავშნები" data={s.bookings} labels={s.days} kind="area" color={CHART.ink} />
        <MiniChart title="შემოსავალი" data={s.revenue} labels={s.days} kind="bar" color={CHART.brand} format={(n) => `₾${n}`} />
      </div>
    </section>
  )
}

const OverviewSection = () => (
  <>
    <Hero />
    <Stats />
    <OverviewTrends />
    <section className="px-6 lg:px-8 mt-8 pb-12">
      <div className="rounded-card border border-ink-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Eyebrow tone="muted" className="mb-1">სამუშაო რიგი</Eyebrow>
          <h3 className="font-display text-h3 font-bold text-ink-900">ექსპერტების განაცხადები</h3>
          <p className="text-small text-ink-500 mt-1">დაამტკიცე, უარყავი და მართე ახალი ექსპერტის მოთხოვნები.</p>
        </div>
        <a href="#moderation" className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-2">
          მოდერაცია
        </a>
      </div>
    </section>
  </>
)

/* ───── Shared SectionHeader (for non-overview tabs) ───── */
/* ───── Section: Moderation (tutor applications queue) ───── */
/* The LIST payload (GET /api/admin/applications) — light fields only.
   `city` keeps its raw nullable value: the queue renders „—“ itself, but the
   detail panel must be able to say „ქალაქი არ არის მითითებული“ out loud, and a
   pre-substituted „—“ is indistinguishable from a city literally named „—“. */
type AppRow = {
  id: string; name: string; cat: string; yrs: number; rate: number;
  city: string | null; sla: string; urgent?: boolean; motivation?: string | null; email?: string;
  phone?: string | null; linkedinUrl?: string | null; websiteUrl?: string | null;
  introVideoUrl?: string | null; introVideoId?: string | null;
  createdAt?: string
  /** `/api/avatars/<userId>?v=` — a URL, never the base64 blob (see the note in
      the list route). Present so the QUEUE can show the face: a column of
      initials is not something 20 applications can be told apart by. */
  photo?: string | null
  status?: AppStatus
  moderatorNote?: string | null
  reviewedAt?: string | null
}

/* The queue is no longer hard-wired to SUBMITTED (2026-08-03): a decided
   application was unreachable from the panel, so „why was this person rejected“
   could not be answered without the audit log. */
type AppStatus = 'SUBMITTED' | 'NEEDS_REVISION' | 'APPROVED' | 'REJECTED'
const APP_STATUS_TABS: { id: AppStatus; l: string }[] = [
  { id: 'SUBMITTED', l: 'მოლოდინში' },
  { id: 'NEEDS_REVISION', l: 'შესასწორებელი' },
  { id: 'APPROVED', l: 'დამტკიცებული' },
  { id: 'REJECTED', l: 'უარყოფილი' },
]
/** Only these two are still open decisions — the action bar is hidden for the
 *  rest, because „დაამტკიცე“ on an already-approved row is a lie about what the
 *  button would do. */
const isOpenStatus = (s: AppStatus) => s === 'SUBMITTED' || s === 'NEEDS_REVISION'

/* The HEAVY half (GET /api/admin/applications/:id) — the profile photo, the
   uploaded document blobs and the apply-flow JSON. Lazy-loaded for the open
   application only; `null` while in flight. */
type AppDetail = {
  avatarUrl?: string | null
  idDocUrl?: string | null
  selfieUrl?: string | null
  certificates?: { title: string; url: string }[] | null
  professionData?: Record<string, unknown> | null
}

/* Mirrors the category resolver inside PATCH /api/applications/:id — the admin
   UI must pre-select exactly what approval would pick on its own, otherwise the
   dropdown quietly lies about the outcome. */
const matchCategory = (specialty: string, cats: AdminCategory[]): AdminCategory | undefined => {
  const nrm = (s: string) => s.toLowerCase().trim()
  const sp = nrm(specialty || '')
  if (!sp) return undefined
  return cats.find(c => nrm(c.name) === sp)
    ?? cats.find(c => { const n = nrm(c.name); const stem = n.slice(0, 4); return sp.includes(n) || n.includes(sp) || (stem.length >= 3 && sp.includes(stem)) })
}

/* One labelled fact in the review grid. A missing value is SAID out loud —
   a blank cell is indistinguishable from a field the form never asked for, and
   that is precisely the complaint this panel exists to fix. */
const ReviewField = ({ label, value, href, newTab = true, mono }: {
  label: string; value?: string | null; href?: string; newTab?: boolean; mono?: boolean
}) => {
  const has = !!(value && String(value).trim())
  return (
    <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3 min-w-0">
      <Eyebrow tone="muted">{label}</Eyebrow>
      {!has ? (
        <div className="mt-1 text-small text-ink-400">არ არის მითითებული</div>
      ) : href ? (
        <a
          href={href}
          {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="mt-1 flex items-start gap-1 font-display text-small font-semibold text-brand-700 hover:text-brand-800"
        >
          <span className="min-w-0 break-all">{value}</span>
          {newTab && <Icon.external className="w-3 h-3 mt-1 shrink-0" />}
        </a>
      ) : (
        <div className={`mt-1 text-small font-semibold text-ink-900 break-words ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</div>
      )}
    </div>
  )
}

/* One openable upload. EVERY href goes through `safeDocHref` — application
   URLs are user-supplied and a `javascript:`/`data:text/html` value would
   execute in the admin's authenticated origin on click. An unsafe URL yields no
   href, so the tile is shown (the moderator still learns a file exists) but is
   inert and says so. Stored files are frequently base64 `data:` images, which
   is why the label comes from `fileLabel` rather than the URL itself. */
const DocTile = ({ caption, url }: { caption: string; url?: string | null }) => {
  const href = safeDocHref(url)
  const isImg = !!url && /^data:image\/|\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
  const thumb = isImg && href
    ? <img src={href} alt={caption} className="w-24 h-24 rounded-btn object-cover border border-ink-200" />
    : <span className="w-24 h-24 rounded-btn bg-white border border-ink-200 text-ink-600 inline-flex flex-col items-center justify-center gap-1"><Icon.doc className="w-5 h-5" /><span className="font-display text-micro font-bold uppercase">ფაილი</span></span>
  const body = (
    <>
      {thumb}
      <span className="block mt-1.5 font-display text-meta font-semibold text-ink-800 max-w-[96px] truncate">{caption}</span>
      <span className="block text-meta text-ink-500 max-w-[96px] truncate">{fileLabel(url)}</span>
    </>
  )
  if (!href) {
    return (
      <div className="block text-left">
        {body}
        <span className="block text-meta text-danger-700 max-w-[96px]">ბმული საეჭვოა</span>
      </div>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block text-left group" title="ახალ ფანჯარაში გახსნა">
      {body}
      <span className="mt-0.5 inline-flex items-center gap-1 text-meta text-brand-700 group-hover:text-brand-800">გახსენი <Icon.external className="w-3 h-3" /></span>
    </a>
  )
}

/* „nothing here“ line — the one thing an empty slot must never do is render as
   empty space. */
const NothingHere = ({ children }: { children: React.ReactNode }) => (
  <p className="text-small text-ink-500 flex items-start gap-1.5">
    <Icon.x className="w-3 h-3 mt-1 shrink-0 text-ink-400" />
    <span>{children}</span>
  </p>
)

const ModerationSection = ({ onDecision }: { onDecision?: () => void }) => {
  const [APPS, setAPPS] = useState<AppRow[]>([])
  const [sel, setSel] = useState<string | null>(null)
  // Which queue is on screen. SUBMITTED is the job; the other three are the
  // history that used to be unreachable from here.
  const [status, setStatus] = useState<AppStatus>('SUBMITTED')
  const [counts, setCounts] = useState<Partial<Record<AppStatus, number>>>({})
  // Search box, debounced into `query` — the value the fetch actually uses.
  // Every other list tab (მომხმარებლები, ჯავშნები, შეფასებები) has had one;
  // the applications queue was the only list you could not search.
  const [qInput, setQInput] = useState('')
  const [query, setQuery] = useState('')
  // Live categories for the approve-time selector. A free-text niche („cat“ is
  // the applicant's specialty) matches no preset → the profile is born
  // category-less and /tutors never shows it, so the moderator needs a way to
  // assign one at the moment of approval.
  const [liveCats, setLiveCats] = useState<AdminCategory[]>([])
  const [catId, setCatId] = useState('')
  // Photo + document blobs + professionData are excluded from the list payload
  // and lazy-loaded for the selected application only (see effect below).
  const [detail, setDetail] = useState<AppDetail | null>(null)
  const [detailErr, setDetailErr] = useState(false)
  // The moderator's „გადამოწმებული“ decision for the OPEN application. Resets
  // to false on every selection change — the badge is never inherited from the
  // previous applicant, and never pre-ticked.
  const [grantVerified, setGrantVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [note, setNote] = useState('')
  // Bulk-action state. `checked` is the set of selected application IDs.
  // `bulkProgress` renders "N/M დამუშავებულია" while the sequential PATCH
  // loop runs; null when idle.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  // Reject flows go through the shared confirm dialog with a REQUIRED reason
  // ('single' → the open application, 'bulk' → every checked application).
  const [pendReject, setPendReject] = useState<'single' | 'bulk' | null>(null)
  // Revise („შესწორება“) also goes through the shared confirm dialog with a
  // REQUIRED note — softer than reject, sends the application back for the
  // applicant to fix. Single-application only (no bulk revise).
  const [pendRevise, setPendRevise] = useState<boolean>(false)
  // Bulk APPROVE is the most consequential button here (N users promoted to
  // TUTOR, no undo) — it now goes through the same dialog as bulk reject.
  const [pendBulkApprove, setPendBulkApprove] = useState<{ ids: string[]; skipped: number } | null>(null)
  // Single approve is exactly as consequential as bulk approve × 1 (a user
  // becomes a public expert, no undo) — same dialog treatment.
  const [pendApprove, setPendApprove] = useState(false)
  // Cursor pagination — the queue mirrors the users/reviews lists.
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const mapRow = (a: any): AppRow => ({
    id: a.id, name: a.fullName, cat: a.specialty, yrs: a.yearsExp, rate: a.hourlyRate,
    city: a.city ?? null,
    sla: fmtKaDate(new Date(a.createdAt), { year: true }),
    urgent: (Date.now() - new Date(a.createdAt).getTime()) > 24 * 3600 * 1000,
    motivation: a.motivation, email: a.user?.email,
    phone: a.phone, linkedinUrl: a.linkedinUrl, websiteUrl: a.websiteUrl,
    introVideoUrl: a.introVideoUrl, introVideoId: a.introVideoId,
    createdAt: a.createdAt,
    photo: a.user?.avatarUrl ?? null,
    status: a.status as AppStatus,
    moderatorNote: a.moderatorNote ?? null,
    reviewedAt: a.reviewedAt ?? null,
  })

  useEffect(() => {
    const t = setTimeout(() => setQuery(qInput.trim()), 300)
    return () => clearTimeout(t)
  }, [qInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Server-filtered: the queue used to pull the newest 300 applications of
      // ANY status and keep the SUBMITTED ones in the browser — past 300 decided
      // rows it read empty while the KPI still counted a real backlog.
      const res = await fetch(`/api/admin/applications?status=${status}&limit=50${query ? `&q=${encodeURIComponent(query)}` : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      const mapped: AppRow[] = (Array.isArray(data?.items) ? data.items : []).map(mapRow)
      setAPPS(mapped)
      setCounts(data?.counts ?? {})
      setNextCursor(data?.nextCursor ?? null)
      setSel(mapped[0]?.id ?? null)
      // Reset the bulk-selection set on every refetch — stale IDs (already
      // approved/rejected in this pass) must not linger checked.
      setChecked(new Set())
    } catch {
      setFlash({ kind: 'error', msg: 'განაცხადების ჩატვირთვა ვერ მოხერხდა.' })
    } finally {
      setLoading(false)
    }
  }, [status, query])
  useEffect(() => { load() }, [load])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/admin/applications?status=${status}&limit=50&cursor=${encodeURIComponent(nextCursor)}${query ? `&q=${encodeURIComponent(query)}` : ''}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setAPPS(prev => [...prev, ...(Array.isArray(data?.items) ? data.items : []).map(mapRow)])
      setNextCursor(data?.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  // Same endpoint the „კატეგორიები“ tab uses — hidden ones are filtered out
  // because assigning a non-live category would keep the expert invisible.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/categories', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: AdminCategory[]) => { if (!cancelled) setLiveCats(Array.isArray(d) ? d.filter(c => c.isLive) : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setChecked(prev => prev.size === APPS.length ? new Set() : new Set(APPS.map(a => a.id)))
  }

  // The category an application would resolve to on approval. Bulk approve sends
  // it EXPLICITLY per row (the single-application path already does) — without it
  // an applicant with a free-text niche is approved with categoryId null and
  // becomes an approved-but-INVISIBLE expert, since /tutors hard-requires a live
  // category. Rows that match nothing are excluded from the bulk action instead.
  const catIdFor = (appId: string) => matchCategory(APPS.find(a => a.id === appId)?.cat ?? '', liveCats)?.id

  const bulkDecide = async (action: 'approve' | 'reject', reason?: string, only?: string[]) => {
    const ids = only ?? Array.from(checked)
    if (busy || ids.length === 0) return
    setBusy(true)
    setFlash(null)
    setBulkProgress({ done: 0, total: ids.length })
    let ok = 0, fail = 0
    // Sequential — keeps the mini progress counter honest and avoids
    // spraying the mutation endpoint with N parallel PATCHes.
    for (let i = 0; i < ids.length; i++) {
      try {
        const res = await fetch(`/api/applications/${ids[i]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            note: reason?.trim() || undefined,
            categoryId: action === 'approve' ? catIdFor(ids[i]) : undefined,
          }),
        })
        // adminOk, not `res.ok && data.ok !== false` — an expired session used
        // to hand back the sign-in HTML as a 200 with no `ok` key at all, and
        // `ok !== false` scored that as an approval. A whole bulk pass could
        // report „N დამტკიცდა“ without a single application changing.
        if (await adminOk(res)) ok++; else fail++
      } catch {
        fail++
      }
      setBulkProgress({ done: i + 1, total: ids.length })
    }
    setBulkProgress(null)
    setBusy(false)
    setFlash({
      kind: fail === 0 ? 'success' : 'error',
      msg: fail === 0
        ? `${ok} განაცხადი ${action === 'approve' ? 'დამტკიცდა' : 'უარყოფილია'}.`
        : `${ok} შესრულდა, ${fail} ვერ შესრულდა.`,
    })
    await load()
    onDecision?.()
  }

  // Split the checked set into „can be approved right now“ and „no live category
  // matches its სფერო" before opening the confirm dialog, so the moderator sees
  // exactly how many go through and how many need the single-application path.
  const askBulkApprove = () => {
    const ids = Array.from(checked)
    const approvable = ids.filter(id => !!catIdFor(id))
    if (approvable.length === 0) {
      setFlash({ kind: 'error', msg: 'ვერცერთ მონიშნულ განაცხადს სფერო ვერ დაემთხვა — დაამტკიცე ცალ-ცალკე და ხელით მიუთითე კატეგორია.' })
      return
    }
    setPendBulkApprove({ ids: approvable, skipped: ids.length - approvable.length })
  }

  const decide = async (action: 'approve' | 'reject' | 'revise', reasonArg?: string) => {
    if (busy || !sel) return
    setBusy(true)
    setFlash(null)
    try {
      // Reject and revise carry the dialog's required reason as the moderator
      // note; approve keeps using the optional inline textarea.
      const noteToSend = action === 'approve' ? note.trim() : reasonArg?.trim()
      const res = await fetch(`/api/applications/${sel}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // categoryId rides along on approve only — the server falls back to its
        // own name match when the key is absent, so we omit it when unset.
        // `verified` likewise: it is the moderator's explicit badge decision,
        // taken with the documents on screen, and defaults to NOT verified.
        body: JSON.stringify({
          action,
          note: noteToSend || undefined,
          categoryId: action === 'approve' ? (catId || undefined) : undefined,
          verified: action === 'approve' ? grantVerified : undefined,
        }),
      })
      // adminOk, not `data.ok === false` — see bulkDecide(). A moderation
      // decision must never claim success it can't prove.
      if (!(await adminOk(res))) {
        setFlash({ kind: 'error', msg: 'ოპერაცია ვერ შესრულდა.' })
        return
      }
      setFlash({ kind: 'success', msg: action === 'approve' ? 'განაცხადი დამტკიცდა.' : action === 'revise' ? 'განაცხადი შესასწორებლად დაბრუნდა.' : 'განაცხადი უარყოფილია.' })
      setNote('')
      await load()
      onDecision?.() // let parent re-fetch KPI stats
    } catch {
      setFlash({ kind: 'error', msg: 'ქსელის შეცდომა.' })
    } finally {
      setBusy(false)
    }
  }

  const active = APPS.find(a => a.id === sel) ?? null

  /* ONE fetch for the open application's heavy half — photo, uploaded documents
   * and the apply-flow JSON, all of which the list payload leaves out. There
   * used to be TWO effects hitting this same endpoint on every selection: one
   * filled `activeDocs` (what the JSX read), the other filled `detail` (what the
   * helpers read, and nothing rendered). Every click cost two round-trips and
   * half the panel was dead. `detailErr` is now RENDERED with a retry — before,
   * a failed request left the photo block saying „იტვირთება…“ forever, which is
   * indistinguishable from „this applicant has no photo“. */
  const loadDetail = useCallback(() => {
    if (!sel) { setDetail(null); setDetailErr(false); return }
    setDetail(null)
    setDetailErr(false)
    // A fresh applicant = a fresh decision. Never carry the previous
    // application's badge tick over to this one.
    setGrantVerified(false)
    fetch(`/api/admin/applications/${sel}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('detail'))))
      .then(d => {
        setDetail({
          avatarUrl: d?.user?.avatarUrl ?? null,
          idDocUrl: d?.idDocUrl ?? null,
          selfieUrl: d?.selfieUrl ?? null,
          certificates: d?.certificates ?? null,
          professionData: d?.professionData ?? null,
        })
      })
      .catch(() => setDetailErr(true))
  }, [sel])
  useEffect(() => { loadDetail() }, [loadDetail])
  // Everything derived from the loaded detail. `certs` is normalized because
  // the column is untyped JSON; `missing` is the explicit list of empty slots
  // (a blank space and a field that does not exist look identical otherwise).
  const certs = normalizeCertificates(detail?.certificates)
  const prof = summarizeProfessionData(detail?.professionData)
  const hasDoc = hasVerificationDocument(detail)
  const missing = active && detail
    ? missingApplicationParts({
      avatarUrl: detail.avatarUrl,
      phone: active.phone,
      city: active.city,
      motivation: active.motivation,
      linkedinUrl: active.linkedinUrl,
      websiteUrl: active.websiteUrl,
      introVideoUrl: active.introVideoUrl,
      introVideoId: active.introVideoId,
      professionData: detail.professionData,
      docs: detail,
    })
    : []
  // Pre-select the category the applicant's specialty resolves to; a niche that
  // matches nothing leaves the select empty (and shows the warning below it).
  useEffect(() => {
    setCatId(active ? (matchCategory(active.cat, liveCats)?.id ?? '') : '')
  }, [active, liveCats])
  return (
    <>
      <TabHeader
        eyebrow="განაცხადები · ექსპერტად მოთხოვნები"
        // Honest count: the server's per-status total when it has one, and the
        // loaded page size only as a fallback — the old title said „N განაცხადი
        // მოლოდინში" while showing whatever status was open.
        title={<>{counts[status] ?? APPS.length} {APP_STATUS_TABS.find(t => t.id === status)?.l.toLowerCase()}</>}
        sub={status === 'SUBMITTED'
          ? 'შეამოწმე ვინ არის, რას სთავაზობს და რა ფასად. მიზანი — 24 საათში.'
          : 'ისტორია — გადაწყვეტილება უკვე მიღებულია.'}
        actions={null}
      />
      {flash && (
        <div className="px-6 lg:px-8">
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        </div>
      )}
      <section className="px-6 lg:px-8 py-6 grid lg:grid-cols-[360px_1fr] gap-5">
        {/* Queue */}
        <aside className="rounded-card border border-ink-200 bg-white overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
            <Eyebrow tone="muted">რიგი · {APPS.length}</Eyebrow>
            <button type="button" onClick={load} disabled={loading} className="font-display text-meta font-semibold text-brand-700 disabled:text-ink-500">განახლება</button>
          </div>
          {/* STATUS TABS. The queue was hard-wired to SUBMITTED, so a decided
              application could not be opened at all from this panel — „რატომ
              უარვყავით ეს კაცი" was answerable only from the audit log. */}
          <div className="px-2 py-2 border-b border-ink-100 flex flex-wrap gap-1">
            {APP_STATUS_TABS.map(t => {
              const on = status === t.id
              const n = counts[t.id]
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { if (!on) { setStatus(t.id); setSel(null) } }}
                  aria-pressed={on}
                  className={`h-9 px-2.5 rounded-pill font-display text-meta font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast ${
                    on ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'
                  }`}
                >
                  {t.l}
                  {typeof n === 'number' && n > 0 && (
                    <span className={`tabular-nums ${on ? 'text-white/70' : 'text-ink-400'}`}>{n}</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="px-3 py-2 border-b border-ink-100">
            <div className="relative">
              <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={qInput}
                onChange={e => setQInput(e.target.value)}
                placeholder="სახელი, სფერო, ქალაქი, ელფოსტა…"
                aria-label="განაცხადების ძებნა"
                className="w-full h-11 pl-9 pr-8 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none"
              />
              {qInput && (
                <button
                  type="button"
                  onClick={() => setQInput('')}
                  aria-label="ძებნის გასუფთავება"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center"
                >
                  <Icon.x className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {/* Bulk-action bar — hidden when the queue is empty so we don't
              show a checkbox with nothing to check. */}
          {APPS.length > 0 && isOpenStatus(status) && (
            <div className="px-4 py-2.5 border-b border-ink-100 bg-ink-50/40">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked.size === APPS.length && APPS.length > 0}
                  onChange={toggleAll}
                  className="w-5 h-5 rounded border-ink-300 text-ink-900 focus:ring-brand-500"
                />
                <span className="font-display text-meta font-semibold text-ink-700">
                  ყველას მონიშვნა{checked.size > 0 ? ` · ${checked.size} მონიშნული` : ''}
                </span>
              </label>
              {checked.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={askBulkApprove}
                    disabled={busy}
                    // h-10 sm:h-9 = the canon compact tier; h-8 is 32px, under
                    // the tap floor — and this one bulk-approves applications.
                    className="h-10 sm:h-9 px-3 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 text-white font-display font-semibold text-small inline-flex items-center gap-1"
                  >
                    <Icon.check className="w-3 h-3" /> მასობრივი დამტკიცება
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendReject('bulk')}
                    disabled={busy}
                    className="h-8 px-2.5 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 disabled:opacity-50 text-danger-700 font-display font-semibold text-meta inline-flex items-center gap-1"
                  >
                    <Icon.x className="w-3 h-3" /> მასობრივი უარყოფა
                  </button>
                </div>
              )}
              {bulkProgress && (
                <div className="mt-2 font-mono text-meta tabular-nums text-ink-600">
                  {bulkProgress.done}/{bulkProgress.total} დამუშავებულია
                </div>
              )}
            </div>
          )}
          {loading ? (
            <AdminLoading inset />
          ) : APPS.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ink-100 text-ink-500 mb-2"><Icon.check className="w-5 h-5" /></div>
              <div className="font-display text-small font-bold text-ink-900">{query ? 'ვერაფერი მოიძებნა' : 'ცარიელია'}</div>
              <div className="text-meta text-ink-500 mt-1">
                {query
                  ? <>„{query}“ — ამ სტატუსში დამთხვევა არ არის.</>
                  : status === 'SUBMITTED' ? 'არცერთი განაცხადი მოლოდინში არ არის.' : 'ამ სტატუსით განაცხადი არ არის.'}
              </div>
            </div>
          ) : APPS.map(a => (
            <div key={a.id} className={`flex items-start gap-2 px-4 py-3 border-b border-ink-100 last:border-b-0 hover:bg-ink-50/60 transition-colors duration-fast ${sel === a.id ? 'bg-brand-50/40' : ''}`}>
              {/* Checkbox is a sibling of the "select this row" button so
                  toggling doesn't also change which application is open. Only
                  open statuses can be bulk-actioned. */}
              {isOpenStatus(status) && (
                <input
                  type="checkbox"
                  aria-label={`მონიშვნა: ${a.name}`}
                  checked={checked.has(a.id)}
                  onChange={() => toggleCheck(a.id)}
                  className="mt-1 w-5 h-5 rounded border-ink-300 text-ink-900 focus:ring-brand-500 shrink-0"
                />
              )}
              <button type="button" onClick={() => setSel(a.id)} className="flex-1 min-w-0 text-left flex items-start gap-2.5">
                {/* The face, in the QUEUE. It costs a ~40-char URL per row
                    (/api/avatars/<id>?v=), and it is the fastest way to tell
                    twenty applications apart — initials are not. */}
                {a.photo
                  ? <img src={a.photo} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
                  : <span className="w-10 h-10 rounded-full bg-ink-100 text-ink-500 inline-flex items-center justify-center font-display font-bold text-small shrink-0" title="ფოტო არ აქვს">{a.name.charAt(0)}</span>}
                <span className="flex-1 min-w-0 block">
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 block">
                      <span className="block font-display text-small font-semibold text-ink-900 truncate">{a.name}</span>
                      <span className="block font-mono text-meta tabular-nums text-ink-400 mt-0.5 truncate">{a.cat}</span>
                    </span>
                    {a.urgent && status === 'SUBMITTED' && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-danger-50 border border-danger-200 text-danger-700 font-display text-micro font-bold uppercase shrink-0"><Icon.clock className="w-3 h-3" /> SLA</span>}
                  </span>
                  <span className="block mt-1.5 font-mono text-meta tabular-nums text-ink-500 truncate">{a.yrs} წ. · ₾{a.rate} · {a.city || '—'} · {a.sla}</span>
                </span>
              </button>
            </div>
          ))}
          {!loading && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={APPS.length} />}
        </aside>

        {/* Active application */}
        <div className="space-y-4 min-w-0">
          {!active ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-white p-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ink-100 text-ink-500 mb-3"><Icon.chat className="w-6 h-6" /></div>
              <div className="font-display text-body-lg font-bold text-ink-900">აირჩიე განაცხადი</div>
              <div className="text-small text-ink-500 mt-1">მარცხნიდან — რიგში მოცემული ერთ-ერთი.</div>
            </div>
          ) : (
          <div className="rounded-card border border-ink-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* The photo that will appear on the PUBLIC profile, at a size a
                    face can actually be judged from — and IN THE HEADER, next to
                    the name, rather than in a separate block halfway down the
                    panel where it read as an afterthought. `detail.avatarUrl` is
                    the lazy-loaded blob; the queue row already showed the
                    cacheable URL, so `active.photo` covers the in-flight moment
                    and the header never flashes an initials circle for someone
                    who does have a photo. */}
                {(detail?.avatarUrl || active.photo) ? (
                  <img
                    src={detail?.avatarUrl || active.photo || ''}
                    alt={active.name}
                    className="w-16 h-16 rounded-full object-cover ring-1 ring-ink-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center font-display font-bold text-h3 ring-1 ring-ink-200 shrink-0" title={detail ? 'ფოტო არ აქვს ატვირთული' : 'იტვირთება…'}>
                    {active.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  {/* Wraps, never truncates: on a 390px panel „ნინო ტესტაშვილი“
                      became „ნინო ტესტ…“, and the applicant's name is the one
                      string on this screen that must always be readable. */}
                  <h2 className="font-display text-h3 font-bold text-ink-900 break-words">{active.name}</h2>
                  {/* „₾N“, not „₾N/სთ“: pricing is a flat per-booking amount the
                      expert sets — the column is still called `hourlyRate` for
                      legacy reasons, and the panel was repeating that legacy in
                      the UI. A trailing „·“ with nothing after it (null city)
                      was the other half of this line's problem. */}
                  <div className="font-mono text-meta tabular-nums text-ink-500">{active.cat} · {active.yrs} წ. · ₾{active.rate} · {active.city || '—'}</div>
                  {active.email && (
                    <a href={`mailto:${active.email}`} className="text-meta text-brand-700 hover:text-brand-800 mt-0.5 inline-block break-all">{active.email}</a>
                  )}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 font-display text-micro font-bold uppercase"><Icon.clock className="w-3 h-3" /> {active.sla}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {active.phone && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-micro font-semibold uppercase text-ink-500">ტელეფონი</div>
                  <a href={`tel:${active.phone}`} className="mt-1 block font-display text-small font-bold text-ink-900 tabular-nums hover:text-brand-700">{active.phone}</a>
                </div>
              )}
              {active.linkedinUrl && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-micro font-semibold uppercase text-ink-500">LinkedIn</div>
                  <a href={safeDocHref(active.linkedinUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 block font-display text-small font-semibold text-brand-700 hover:text-brand-800 truncate">{active.linkedinUrl}</a>
                </div>
              )}
              {active.websiteUrl && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-micro font-semibold uppercase text-ink-500">ვებგვერდი</div>
                  <a href={safeDocHref(active.websiteUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 block font-display text-small font-semibold text-brand-700 hover:text-brand-800 truncate">{active.websiteUrl}</a>
                </div>
              )}
              {active.createdAt && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-micro font-semibold uppercase text-ink-500">გაგზავნის დრო</div>
                  <div className="mt-1 font-mono text-meta tabular-nums text-ink-900">{fmtDT(active.createdAt)}</div>
                </div>
              )}
            </div>

            {active.introVideoId && (
              <div className="mb-4">
                <Eyebrow tone="muted" className="mb-2">ინტრო ვიდეო</Eyebrow>
                <a
                  href={active.introVideoUrl ?? `https://youtu.be/${active.introVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative aspect-video rounded-card overflow-hidden border border-ink-200 bg-ink-900 group"
                >
                  <img
                    src={`https://img.youtube.com/vi/${active.introVideoId}/hqdefault.jpg`}
                    alt="Intro video"
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-ink-900/20 group-hover:bg-ink-900/40 transition-colors duration-fast">
                    <span className="w-14 h-14 rounded-full bg-white/95 shadow-float inline-flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-brand-700 ml-1">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-white/95 backdrop-blur text-micro font-display font-bold uppercase text-ink-800">
                    YouTube
                  </span>
                </a>
              </div>
            )}

            {/* One request feeds everything below. While it is in flight the
                blocks say „იტვირთება…“; if it FAILS the moderator is told and
                offered a retry — the old panel swallowed the error and left
                „იტვირთება…“ on screen forever, which reads exactly like „this
                applicant attached nothing". */}
            {detailErr && (
              <div className="rounded-card border border-danger-200 bg-danger-50 p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-small text-danger-800">
                  ფოტო, დოკუმენტები და განაცხადის დეტალები ვერ ჩაიტვირთა — <b>ეს არ ნიშნავს, რომ არ არსებობს</b>.
                </div>
                <button type="button" onClick={loadDetail} className="h-9 px-3 rounded-btn bg-white border border-danger-200 text-danger-700 font-display text-meta font-semibold inline-flex items-center gap-1.5">
                  <Icon.refresh className="w-3.5 h-3.5" /> ხელახლა
                </button>
              </div>
            )}

            {/* WHAT THEY OFFER — the whole point of the review, and until
                2026-08-03 it was rendered with `String(v)` over the raw JSON, so
                headline/languages/services printed „[object Object]“. The
                shaping helpers existed in _application.ts the whole time and
                were computed but never rendered. */}
            <div className="rounded-card border border-ink-100 bg-white p-4 mb-4">
              <Eyebrow tone="muted" className="mb-2">განაცხადი</Eyebrow>
              {!detail && !detailErr ? (
                <AdminLoading />
              ) : prof.isEmpty ? (
                <NothingHere>განაცხადში სერვისები, ენები და სათაური არ არის შევსებული.</NothingHere>
              ) : (
                <div className="space-y-4">
                  {prof.headline && (
                    <div>
                      <Eyebrow tone="muted">სათაური</Eyebrow>
                      <p className="mt-1 font-display text-body font-semibold text-ink-900 break-words">{prof.headline}</p>
                    </div>
                  )}
                  {prof.languages.length > 0 && (
                    <div>
                      <Eyebrow tone="muted">ენები</Eyebrow>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {prof.languages.map((l, i) => (
                          <span key={i} className="inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 bg-white text-meta text-ink-700">{l}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {prof.services.length > 0 && (
                    <div>
                      <Eyebrow tone="muted">სერვისები</Eyebrow>
                      <ul className="mt-1.5 space-y-2">
                        {prof.services.map((sv, i) => (
                          <li key={i} className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-display text-small font-bold text-ink-900 break-words">{sv.name || 'უსახელო სერვისი'}</span>
                              <span className="font-mono text-meta tabular-nums text-ink-700 shrink-0">
                                {sv.minutes != null ? `${sv.minutes} წთ` : '— წთ'} · {sv.free ? 'უფასო' : sv.price != null ? `₾${sv.price}` : 'ფასი არ არის'}
                              </span>
                            </div>
                            {sv.desc && <p className="mt-1 text-meta text-ink-600 leading-relaxed whitespace-pre-wrap">{sv.desc}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {prof.extras.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {prof.extras.map(e => <ReviewField key={e.key} label={e.label} value={e.value} />)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-card border border-ink-100 bg-ink-50/40 p-4 mb-4">
              <Eyebrow tone="muted" className="mb-2">მოტივაცია</Eyebrow>
              {active.motivation
                ? <p className="text-small text-ink-700 leading-relaxed whitespace-pre-wrap">{active.motivation}</p>
                : <NothingHere>ტექსტი არ დაუწერია.</NothingHere>}
            </div>

            {/* Verification documents — diplomas/certificates, plus the legacy
                ID/selfie pair. Every tile goes through DocTile (safe href +
                a real file label instead of a 12 000-character data: string). */}
            <div className="rounded-card border border-ink-100 bg-white p-4 mb-4">
              <Eyebrow tone="muted" className="mb-2">დოკუმენტები</Eyebrow>
              {!detail && !detailErr ? (
                <AdminLoading />
              ) : hasDoc ? (
                <div className="flex flex-wrap gap-3">
                  {detail?.idDocUrl && <DocTile caption="პირადობა" url={detail.idDocUrl} />}
                  {detail?.selfieUrl && <DocTile caption="სელფი" url={detail.selfieUrl} />}
                  {certs.map((c, i) => <DocTile key={i} caption={c.title} url={c.url} />)}
                </div>
              ) : (
                <NothingHere>არაფერი აქვს მიმაგრებული — შესამოწმებელი დოკუმენტი არ არსებობს.</NothingHere>
              )}
            </div>

            {/* „What is missing“ — computed for the whole application, so an
                empty slot is stated instead of rendering as blank space. This is
                also the honest input to the „გადამოწმებული“ decision below. */}
            {detail && missing.length > 0 && (
              <div className="rounded-card border border-warning-200 bg-warning-50/60 p-4 mb-4">
                <Eyebrow tone="muted" className="mb-2">რა აკლია ({missing.length})</Eyebrow>
                <ul className="space-y-1">
                  {missing.map(m => (
                    <li key={m.key} className="text-small text-ink-700 flex items-start gap-1.5">
                      <Icon.x className="w-3 h-3 mt-1 shrink-0 text-warning-700" />
                      <span>{m.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decision controls exist only while the decision is still open.
                On an APPROVED/REJECTED row they used to render in full — three
                live buttons offering to re-decide something already decided,
                with no sign of what was decided or when. */}
            {isOpenStatus(active.status ?? status) ? (
            <>
            <div className="mb-3">
              <Eyebrow as="label" tone="muted" className="block mb-1.5">მოდერატორის ჩანაწერი (სურვ.)</Eyebrow>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="მიზეზი / კომენტარი — შენახვისთვის"
                className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-none"
              />
            </div>
            {/* Category assignment — sent with „დაამტკიცე“. Without a live
                category the approved expert never appears on /tutors, so an
                unmatched niche gets a loud (not decorative) warning. */}
            <div className="mb-3">
              <Eyebrow as="label" tone="muted" className="block mb-1.5">კატეგორია</Eyebrow>
              <select
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
                className="w-full sm:max-w-[280px] h-11 px-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none"
              >
                <option value="">— არ არის მითითებული —</option>
                {liveCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!catId && liveCats.length > 0 && (
                <p className="mt-1.5 text-meta text-danger-700">
                  „{active.cat}“ ვერცერთ სფეროს ვერ დაემთხვა. თუ კატეგორიას არ მიუთითებ, ექსპერტი /tutors-ზე არ გამოჩნდება — აირჩიე სფერო ან ჯერ დაამატე „კატეგორიები“ ტაბში.
                </p>
              )}
            </div>
            {/* „გადამოწმებული“ — a PUBLIC trust badge on every card and profile,
                so it must be a deliberate act taken with the documents on
                screen, never a default. Not hard-blocked when nothing is
                attached (a moderator may have checked out of band), but the
                consequence is stated so it can't be granted by accident. The
                choice is audited together with whether a document existed. */}
            <label className="mb-3 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={grantVerified}
                onChange={e => setGrantVerified(e.target.checked)}
                className="mt-0.5 w-5 h-5 shrink-0 accent-brand-500"
              />
              <span className="min-w-0">
                <span className="block font-display text-small font-semibold text-ink-900">მიანიჭე „გადამოწმებული“</span>
                <span className="block text-meta text-ink-600 mt-0.5 leading-snug">
                  {detail && !hasDoc
                    ? 'დოკუმენტი მიმაგრებული არ არის — ნიშანი მხოლოდ მაშინ მიანიჭე, თუ სხვა გზით გადაამოწმე.'
                    : 'ნიშანი ყველა ბარათსა და პროფილზე გამოჩნდება.'}
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPendApprove(true)} disabled={busy} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 text-white font-display font-semibold text-body inline-flex items-center gap-1.5"><Icon.check className="w-3.5 h-3.5" /> {busy ? 'იგზავნება…' : 'დაამტკიცე'}</button>
              <button type="button" onClick={() => setPendRevise(true)} disabled={busy} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-700 font-display font-semibold text-small inline-flex items-center gap-1.5">შესწორება</button>
              <button type="button" onClick={() => setPendReject('single')} disabled={busy} className="h-11 px-4 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 disabled:opacity-50 text-danger-700 font-display font-semibold text-small inline-flex items-center gap-1.5"><Icon.x className="w-3.5 h-3.5" /> უარყავი</button>
            </div>
            </>
            ) : (
              <div className="rounded-card border border-ink-200 bg-ink-50/40 p-4">
                <Eyebrow tone="muted" className="mb-2">გადაწყვეტილება</Eyebrow>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center h-6 px-2 rounded-pill font-display text-meta font-bold ${
                    active.status === 'APPROVED' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-700 border border-danger-200'
                  }`}>
                    {active.status === 'APPROVED' ? 'დამტკიცებული' : 'უარყოფილი'}
                  </span>
                  {active.reviewedAt && <span className="font-mono text-meta tabular-nums text-ink-600">{fmtDT(active.reviewedAt)}</span>}
                </div>
                {active.moderatorNote
                  ? <p className="mt-2 text-small text-ink-700 whitespace-pre-wrap leading-relaxed">{active.moderatorNote}</p>
                  : <p className="mt-2 text-meta text-ink-500">მოდერატორის ჩანაწერი არ დარჩენილა.</p>}
              </div>
            )}
          </div>
          )}
        </div>
      </section>
      <AdminConfirmDialog
        open={pendReject !== null}
        title={pendReject === 'bulk' ? `${checked.size} განაცხადის უარყოფა` : 'განაცხადის უარყოფა'}
        body={pendReject === 'bulk'
          ? 'მიზეზი გაეგზავნება ყველა მონიშნულ განმცხადებელს.'
          : <>მიზეზი გაეგზავნება განმცხადებელს: <span className="font-display font-semibold">{active?.name ?? ''}</span></>}
        tone="danger"
        reason="required"
        confirmLabel="უარყავი"
        busy={busy}
        onCancel={() => setPendReject(null)}
        onConfirm={async (reason) => {
          const mode = pendReject
          setPendReject(null)
          if (mode === 'bulk') await bulkDecide('reject', reason)
          else await decide('reject', reason)
        }}
      />
      {/* Single approve — same consequence as bulk approve × 1 (promotion to a
          public expert, no undo), so it earns the same dialog. */}
      <AdminConfirmDialog
        open={pendApprove}
        title="განაცხადის დამტკიცება"
        body={<>
          <span className="font-display font-semibold">{active?.name ?? ''}</span> გახდება ექსპერტი — შეიქმნება პროფილი და გამოჩნდება საიტზე. უკან დაბრუნება არ არსებობს.
          {active && !catId && (
            <span className="mt-2 block text-danger-700">
              კატეგორია მითითებული არ არის — ექსპერტი /tutors-ზე არ გამოჩნდება, სანამ კატეგორიას არ მიანიჭებ.
            </span>
          )}
        </>}
        tone="brand"
        confirmLabel="დაამტკიცე"
        busy={busy}
        onCancel={() => setPendApprove(false)}
        onConfirm={async () => {
          setPendApprove(false)
          await decide('approve')
        }}
      />
      <AdminConfirmDialog
        open={pendBulkApprove !== null}
        title={`${pendBulkApprove?.ids.length ?? 0} განაცხადის დამტკიცება`}
        body={<>
          ეს {pendBulkApprove?.ids.length ?? 0} განმცხადებელი გახდება ექსპერტი — შეიქმნება პროფილი და გამოჩნდება საიტზე. უკან დაბრუნება არ არსებობს.
          {(pendBulkApprove?.skipped ?? 0) > 0 && (
            <span className="mt-2 block text-danger-700">
              {pendBulkApprove?.skipped} განაცხადს სფერო ვერ დაემთხვა — გამოტოვდება. დაამტკიცე ცალ-ცალკე და ხელით მიუთითე კატეგორია, თორემ ექსპერტი /tutors-ზე არ გამოჩნდება.
            </span>
          )}
        </>}
        tone="brand"
        confirmLabel="დაამტკიცე"
        busy={busy}
        onCancel={() => setPendBulkApprove(null)}
        onConfirm={async () => {
          const ids = pendBulkApprove?.ids ?? []
          setPendBulkApprove(null)
          await bulkDecide('approve', undefined, ids)
        }}
      />
      <AdminConfirmDialog
        open={pendRevise}
        title="განაცხადის შესწორება"
        body={<>მიუთითე რა უნდა შეასწოროს — გაეგზავნება განმცხადებელს: <span className="font-display font-semibold">{active?.name ?? ''}</span></>}
        tone="warning"
        reason="required"
        reasonLabel="რა უნდა შესწორდეს"
        reasonPlaceholder="მაგ. სახელი ქართულად ჩაწერე"
        confirmLabel="გააგზავნე"
        busy={busy}
        onCancel={() => setPendRevise(false)}
        onConfirm={async (reason) => {
          setPendRevise(false)
          await decide('revise', reason)
        }}
      />
    </>
  )
}

/* ───── CSV export helper — client-side Blob, no server round-trip ───── */
const escapeCsv = (v: unknown): string => {
  if (v == null) return ''
  const s = String(v)
  // Escape per RFC 4180: wrap in quotes when the field contains ", newline, or comma.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
const downloadCsv = (filename: string, rows: (string | number | null | undefined)[][]) => {
  const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\r\n')
  // BOM lets Excel open Georgian correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ───── User detail modal (opens from Users row click) ───── */
type UserDetail = {
  user: {
    id: string; email: string; fullName: string;
    role: 'STUDENT' | 'TUTOR' | 'ADMIN';
    emailVerified: boolean; createdAt: string; avatarUrl: string | null;
    phone?: string | null; bio?: string | null;
    suspendedAt?: string | null;
    tutor?: {
      id: string; headline: string; specialty: string; price: number;
      yearsExp: number; rating: number; reviewsCount: number;
      sessionsCount: number; verified: boolean;
      featured?: boolean;
      packagesEnabled?: boolean;
      videoUrl?: string | null;
      category?: { id: string; slug: string; name: string } | null;
    } | null;
    _count: { bookingsAsStudent: number; reviewsGiven: number; sentMessages: number; notifications: number; favorites: number };
  }
  bookingsAsStudent: any[]
  bookingsAsTutor: any[]
  reviewsWritten: any[]
  reviewsReceived: any[]
  recentNotifications: any[]
  // Real totals for the delete dialog. The arrays above are capped at take:30/15,
  // so they can't be used to tell an admin what a deletion would destroy.
  deleteImpact?: DeleteImpact
}

const KA_STATUS: Record<string, string> = {
  PREPARING: 'მოსამზადებელი', CONFIRMED: 'დადასტურდა', LIVE: 'ცოცხალი',
  COMPLETED: 'დასრულდა', CANCELED: 'გაუქმდა', NO_SHOW: 'გამოუცხადებლობა',
}
const KA_MO_SHORT = KA_MONTHS_SHORT_DOT
const fmtShort = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return `${d.getDate()} ${KA_MO_SHORT[d.getMonth()]} ${d.getFullYear()}`
}
const fmtDT = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${KA_MO_SHORT[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const UserDetailModal = ({ userId, onClose, onImpersonate, onChanged, onDeleted }: { userId: string | null; onClose: () => void; onImpersonate: (userId: string, fullName: string) => void; onChanged?: () => void; onDeleted?: (msg: string) => void }) => {
  const [data, setData] = useState<UserDetail | null>(null)
  const [tab, setTab] = useState<'profile' | 'bookings' | 'reviews' | 'activity'>('profile')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Suspend/unsuspend flow — confirm dialog with a required reason on suspend.
  const [pendSuspend, setPendSuspend] = useState(false)
  const [suspBusy, setSuspBusy] = useState(false)
  const [roleBusy, setRoleBusy] = useState(false)
  // Grant/revoke ADMIN goes through the shared confirm dialog — it used to fire
  // on a single un-confirmed click, the most dangerous one-click in the panel.
  const [pendRole, setPendRole] = useState<'makeAdmin' | 'revokeAdmin' | null>(null)
  // Account removal — see AdminDeleteUserDialog for why it isn't a confirm.
  const [deleteOpen, setDeleteOpen] = useState(false)
  // „მიწერე“ — the only way to contact ONE person from here (see AdminMessageDialog).
  const [composeOpen, setComposeOpen] = useState(false)
  const [sentMsg, setSentMsg] = useState<string | null>(null)
  // True once any mutation (suspend/role/verified/featured) succeeded — the
  // parent list is stale then, so closing the modal triggers onChanged and the
  // list refetches instead of keeping the pre-mutation rows.
  const dirtyRef = useRef(false)

  const close = useCallback(() => {
    if (dirtyRef.current) { dirtyRef.current = false; onChanged?.() }
    onClose()
  }, [onChanged, onClose])

  useEffect(() => {
    if (!userId) { setData(null); setErr(null); setSentMsg(null); setDeleteOpen(false); setTab('profile'); return }
    let cancelled = false
    dirtyRef.current = false
    setLoading(true); setErr(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('load')
        const j = await res.json()
        if (!cancelled) setData(j)
      } catch {
        if (!cancelled) setErr('ჩატვირთვა ვერ მოხერხდა')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [userId, close])

  if (!userId) return null

  const u = data?.user
  const isTutor = !!u?.tutor

  const doSuspendToggle = async (reason: string) => {
    if (!u || suspBusy) return
    setSuspBusy(true)
    setErr(null)
    const action = u.suspendedAt ? 'unsuspend' : 'suspend'
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || undefined }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setErr(j?.message ?? 'ოპერაცია ვერ შესრულდა')
        return
      }
      dirtyRef.current = true
      setData(prev => prev
        ? { ...prev, user: { ...prev.user, suspendedAt: j.user?.suspendedAt ?? null } }
        : prev)
    } catch {
      setErr('ქსელის შეცდომა')
    } finally {
      setSuspBusy(false)
      setPendSuspend(false)
    }
  }

  // Grant / revoke ADMIN. The server enforces the hard guards (no self-demote,
  // never the last admin); here we just reflect the returned role. Reached only
  // through the confirm dialog below — the reason lands in the audit meta.
  const doRoleChange = async (action: 'makeAdmin' | 'revokeAdmin', reason: string) => {
    if (!u || roleBusy) return
    setRoleBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || undefined }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { setErr(j?.message ?? 'ოპერაცია ვერ შესრულდა'); return }
      dirtyRef.current = true
      setData(prev => prev ? { ...prev, user: { ...prev.user, role: j.user?.role ?? prev.user.role } } : prev)
    } catch {
      setErr('ქსელის შეცდომა')
    } finally {
      setRoleBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-sheet flex items-start sm:items-center justify-center p-0 sm:p-6">
      <button type="button" aria-label="დახურვა" onClick={close} className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" className="relative w-full sm:max-w-[880px] max-h-[95vh] bg-white sm:rounded-card shadow-float overflow-hidden flex flex-col motion-safe:animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-ink-200 flex items-start justify-between gap-4 shrink-0">
          {loading || !u ? (
            <AdminLoading />
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              <img src={u.avatarUrl || DEFAULT_AVATAR} alt={u.fullName} className="w-12 h-12 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-display text-h3 font-bold text-ink-900 truncate">{u.fullName}</div>
                  <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase ${
                    u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                    : u.role === 'TUTOR' ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'bg-ink-50 border-ink-200 text-ink-600'
                  }`}>{u.role === 'STUDENT' ? 'სტუდენტი' : u.role === 'TUTOR' ? 'ექსპერტი' : 'ადმინი'}</span>
                  {u.emailVerified && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-success-50 border border-success-200 text-success-700 font-display text-micro font-bold uppercase"><Icon.check className="w-3 h-3" /> ვერიფ.</span>}
                  {/* Anonymized outranks suspended: the pause is not a pause
                      here, it is the thing keeping the tombstone off the public
                      site, and it can no longer be lifted. Saying „შეჩერებული"
                      would invite an admin to try. */}
                  {isAnonymized(u.email)
                    ? <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-ink-900 text-white font-display text-micro font-bold uppercase"><Icon.warn className="w-3 h-3" /> ანონიმიზებული</span>
                    : u.suspendedAt && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-danger-50 border border-danger-200 text-danger-700 font-display text-micro font-bold uppercase"><Icon.pause className="w-3 h-3" /> შეჩერებული</span>}
                </div>
                <div className="text-meta text-ink-500 font-mono truncate mt-0.5">{u.email}</div>
              </div>
            </div>
          )}
          <button type="button" onClick={close} aria-label="დახურვა" className="w-9 h-9 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center shrink-0">
            <Icon.x className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        {u && (
          <div className="px-6 border-b border-ink-100 flex items-center gap-1 overflow-x-auto shrink-0">
            {[
              { id: 'profile' as const, l: 'პროფილი' },
              { id: 'bookings' as const, l: `ჯავშნები (${data.bookingsAsStudent.length + data.bookingsAsTutor.length})` },
              { id: 'reviews' as const, l: `შეფასებები (${data.reviewsWritten.length + data.reviewsReceived.length})` },
              { id: 'activity' as const, l: `აქტივობა (${data.recentNotifications.length})` },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`shrink-0 inline-flex items-center h-11 px-3 font-display text-small font-semibold tracking-tight border-b-2 transition-colors duration-fast ${
                  tab === t.id ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {err && <AdminError message={err} className="m-6" />}
          {sentMsg && <div role="status" className="m-6 p-3 rounded-btn bg-success-50 border border-success-200 text-success-800 text-small">{sentMsg}</div>}
          {u && data && (
            <>
              {tab === 'profile' && (
                <div className="px-6 py-5 space-y-5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Stat label="რეგისტრაცია" value={fmtShort(u.createdAt)} />
                    <Stat label="ტელეფონი" value={u.phone ?? '—'} />
                    <Stat label="მიმოწერები" value={String(u._count.sentMessages)} />
                    <Stat label="ჯავშნები (სტუდენტი)" value={String(u._count.bookingsAsStudent)} />
                    <Stat label="დაწერილი შეფასებები" value={String(u._count.reviewsGiven)} />
                    <Stat label="ფავორიტები" value={String(u._count.favorites)} />
                  </div>
                  {u.bio && (
                    <div>
                      <Eyebrow tone="muted" className="mb-2">ბიო</Eyebrow>
                      <p className="text-body text-ink-700 whitespace-pre-wrap">{u.bio}</p>
                    </div>
                  )}
                  {isTutor && u.tutor && (
                    <div className="rounded-card border border-brand-200 bg-brand-50/40 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                        <Eyebrow>ექსპერტის პროფილი</Eyebrow>
                        <div className="flex items-center gap-2">
                          <VerifiedToggle tutorId={u.tutor.id} initial={!!u.tutor.verified} onSaved={() => { dirtyRef.current = true }} />
                          <FeaturedToggle tutorId={u.tutor.id} initial={!!u.tutor.featured} onSaved={() => { dirtyRef.current = true }} />
                          <PackagesToggle tutorId={u.tutor.id} initial={!!u.tutor.packagesEnabled} onSaved={() => { dirtyRef.current = true }} />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 text-small">
                        <div><span className="text-ink-500">კატეგორია:</span> <span className="font-display font-bold text-ink-900">{u.tutor.category?.name ?? '—'}</span></div>
                        <div><span className="text-ink-500">სპეც.:</span> <span className="font-display font-bold text-ink-900">{u.tutor.specialty}</span></div>
                        <div><span className="text-ink-500">ფასი:</span> <span className="font-display font-bold text-ink-900 tabular-nums">₾{u.tutor.price}</span></div>
                        <div><span className="text-ink-500">გამოცდილება:</span> <span className="font-display font-bold text-ink-900 tabular-nums">{u.tutor.yearsExp} წ.</span></div>
                        <div><span className="text-ink-500">რეიტინგი:</span> <span className="font-display font-bold text-ink-900 tabular-nums">{u.tutor.rating.toFixed(2)}</span> <span className="text-ink-500 tabular-nums">({u.tutor.reviewsCount})</span></div>
                        <div><span className="text-ink-500">სესიები:</span> <span className="font-display font-bold text-ink-900 tabular-nums">{u.tutor.sessionsCount}</span></div>
                        <div><span className="text-ink-500">ინტრო ვიდეო:</span> <span className="font-display font-bold text-ink-900">{u.tutor.videoUrl ? '✓ ატვირთული' : '—'}</span></div>
                      </div>
                      <div className="mt-3 text-small text-ink-700"><span className="font-display font-semibold">სათაური:</span> {u.tutor.headline}</div>
                    </div>
                  )}
                </div>
              )}
              {tab === 'bookings' && (
                <div className="px-6 py-5 space-y-6">
                  {data.bookingsAsStudent.length > 0 && (
                    <div>
                      <Eyebrow tone="muted" className="mb-3">როგორც სტუდენტი ({data.bookingsAsStudent.length})</Eyebrow>
                      <BookingList items={data.bookingsAsStudent} otherKey="tutor" />
                    </div>
                  )}
                  {data.bookingsAsTutor.length > 0 && (
                    <div>
                      <Eyebrow tone="muted" className="mb-3">როგორც ექსპერტი ({data.bookingsAsTutor.length})</Eyebrow>
                      <BookingList items={data.bookingsAsTutor} otherKey="student" />
                    </div>
                  )}
                  {data.bookingsAsStudent.length === 0 && data.bookingsAsTutor.length === 0 && (
                    <EmptyState variant="inline" icon={<Icon.calendar className="w-6 h-6" />} title="ჯავშნები ჯერ არ არის" description="ამ ანგარიშს არც ერთი ჯავშანი არ ჰქონია." />
                  )}
                </div>
              )}
              {tab === 'reviews' && (
                <div className="px-6 py-5 space-y-6">
                  {data.reviewsReceived.length > 0 && (
                    <div>
                      <Eyebrow tone="muted" className="mb-3">მიღებული ({data.reviewsReceived.length})</Eyebrow>
                      <ReviewList items={data.reviewsReceived} authorKey="student" />
                    </div>
                  )}
                  {data.reviewsWritten.length > 0 && (
                    <div>
                      <Eyebrow tone="muted" className="mb-3">დაწერილი ({data.reviewsWritten.length})</Eyebrow>
                      <ReviewList items={data.reviewsWritten} authorKey="tutor" />
                    </div>
                  )}
                  {data.reviewsReceived.length === 0 && data.reviewsWritten.length === 0 && (
                    <EmptyState variant="inline" icon={<Icon.star className="w-6 h-6" />} title="შეფასებები ჯერ არ არის" description="არც დაწერილი და არც მიღებული შეფასება არ აქვს." />
                  )}
                </div>
              )}
              {tab === 'activity' && (
                <div className="px-6 py-5">
                  {data.recentNotifications.length === 0 ? (
                    <EmptyState variant="inline" icon={<Icon.bell className="w-6 h-6" />} title="შეტყობინება ჯერ არ არის" description="ბოლო აქტივობა აქ გამოჩნდება." />
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {data.recentNotifications.map((n: any) => (
                        <li key={n.id} className="py-2.5 flex items-start gap-3">
                          <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${n.readAt ? 'bg-ink-300' : 'bg-brand-500'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="font-display text-small font-semibold text-ink-900 truncate">{n.title}</div>
                            {n.body && <div className="text-meta text-ink-600 mt-0.5 truncate">{n.body}</div>}
                            <div className="font-mono text-meta tabular-nums text-ink-400 mt-1">{fmtDT(n.createdAt)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {u && (
          <div className="px-6 py-3 border-t border-ink-100 bg-ink-50/40 flex items-center justify-between gap-3 shrink-0">
            <div className="text-meta text-ink-500 font-mono">ID: {u.id}</div>
            <div className="flex items-center gap-2">
              {/* Grant / revoke ADMIN — opens the confirm dialog below (reason
                  required). Server refuses self-demote + last-admin. */}
              {u.role === 'ADMIN' ? (
                <button
                  type="button"
                  onClick={() => setPendRole('revokeAdmin')}
                  disabled={roleBusy}
                  className="h-9 px-3 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 text-danger-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-50"
                >
                  <Icon.shield className="w-3.5 h-3.5" /> ადმინის მოხსნა
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendRole('makeAdmin')}
                  disabled={roleBusy}
                  className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-800 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-50"
                >
                  <Icon.shield className="w-3.5 h-3.5" /> ადმინად დანიშვნა
                </button>
              )}
              {/* No suspend toggle on an anonymized account: the server refuses
                  the unsuspend (it would republish the tombstone profile), and
                  a control whose only outcome is an error is worse than none. */}
              {u.role !== 'ADMIN' && !isAnonymized(u.email) && (
                <button
                  type="button"
                  onClick={() => setPendSuspend(true)}
                  disabled={suspBusy}
                  className={`h-9 px-3 rounded-btn font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-50 ${
                    u.suspendedAt
                      ? 'bg-white border border-success-200 hover:bg-success-50 text-success-700'
                      : 'bg-white border border-danger-200 hover:bg-danger-50 text-danger-700'
                  }`}
                >
                  <Icon.pause className="w-3.5 h-3.5" /> {u.suspendedAt ? 'შეჩერების მოხსნა' : 'შეჩერება'}
                </button>
              )}
              {/* Removal. Never on an admin — the server refuses it too, but a
                  button that only ever errors is worse than no button. */}
              {u.role !== 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="h-9 px-3 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 text-danger-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
                >
                  <Icon.warn className="w-3.5 h-3.5" /> წაშლა
                </button>
              )}
              <button
                type="button"
                onClick={() => onImpersonate(u.id, u.fullName)}
                className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 hover:text-ink-800 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
              >
                <Icon.external className="w-3.5 h-3.5" /> შესვლა როგორც
              </button>
              {/* The missing middle: before this, an admin could suspend or
                  impersonate this person but not simply write to them. */}
              <button
                type="button"
                onClick={() => { setSentMsg(null); setComposeOpen(true) }}
                className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 hover:text-ink-800 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
              >
                <Icon.mail className="w-3.5 h-3.5" /> მიწერე
              </button>
              <button type="button" onClick={close} className="h-9 px-3 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-small transition-colors duration-fast">
                დახურვა
              </button>
            </div>
          </div>
        )}
      </div>
      {u && (
        <AdminConfirmDialog
          open={pendRole !== null}
          title={pendRole === 'makeAdmin' ? 'ადმინად დანიშვნა' : 'ადმინის მოხსნა'}
          body={pendRole === 'makeAdmin'
            ? <>{u.fullName} მიიღებს სრულ წვდომას ადმინ პანელზე — მომხმარებლები, ჯავშნები, ფინანსები, იმპერსონაცია.</>
            : <>{u.fullName} დაკარგავს ადმინის უფლებებს და ყველა სესიიდან გავა.</>}
          tone="danger"
          reason="required"
          reasonLabel="მიზეზი (სავალდებულო · ინახება აუდიტში)"
          confirmLabel={pendRole === 'makeAdmin' ? 'დანიშნე' : 'მოხსენი'}
          busy={roleBusy}
          onCancel={() => setPendRole(null)}
          onConfirm={async (reason) => {
            const action = pendRole
            setPendRole(null)
            if (action) await doRoleChange(action, reason)
          }}
        />
      )}
      {u && (
        <AdminConfirmDialog
          open={pendSuspend}
          title={u.suspendedAt ? 'შეჩერების მოხსნა' : 'ანგარიშის შეჩერება'}
          body={u.suspendedAt
            ? <>{u.fullName} კვლავ შეძლებს შესვლას.</>
            : <>{u.fullName} ვეღარ შევა ანგარიშზე, სანამ შეჩერება არ მოიხსნება.</>}
          tone={u.suspendedAt ? 'brand' : 'danger'}
          reason="optional"
          reasonLabel={u.suspendedAt ? 'მიზეზი (სურვ.)' : 'მიზეზი (სურვ. · ინახება აუდიტში)'}
          confirmLabel={u.suspendedAt ? 'მოხსენი' : 'შეაჩერე'}
          busy={suspBusy}
          onCancel={() => setPendSuspend(false)}
          onConfirm={doSuspendToggle}
        />
      )}
      {u && (
        <AdminMessageDialog
          open={composeOpen}
          user={{ id: u.id, fullName: u.fullName, email: u.email }}
          onClose={() => setComposeOpen(false)}
          onSent={msg => setSentMsg(msg)}
        />
      )}
      {u && (
        <AdminDeleteUserDialog
          open={deleteOpen}
          user={{ id: u.id, fullName: u.fullName, email: u.email, isExpert: isTutor }}
          impact={data?.deleteImpact ?? null}
          onClose={() => setDeleteOpen(false)}
          onDeleted={(mode: DeleteMode, name: string) => {
            setDeleteOpen(false)
            // The row this modal is showing no longer exists (purge) or no
            // longer says what it says (anonymize) — close and refetch rather
            // than leave a stale profile on screen.
            dirtyRef.current = true
            onDeleted?.(mode === 'purge'
              ? `${name} — ანგარიში სრულად წაიშალა.`
              : `${name} — ანგარიში ანონიმიზებულია და დაბლოკილია.`)
            close()
          }}
        />
      )}
    </div>
  )
}

// The verified-badge toggle — the ONLY way an approved expert gets the public
// „ვერიფიცირებული“ trust badge (approval seeds verified:false). Mirrors FeaturedToggle.
// Success is judged with adminOk, not `res.ok` — an expired session redirects
// to sign-in and fetch hands the HTML page back as a 200, so the badge used to
// flip on screen while the DB never changed.
const VerifiedToggle = ({ tutorId, initial, onSaved }: { tutorId: string; initial: boolean; onSaved?: () => void }) => {
  const [verified, setVerified] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const next = !verified
    setVerified(next)
    try {
      const res = await fetch(`/api/admin/tutors/${tutorId}/verified`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: next }),
      })
      if (await adminOk(res)) onSaved?.()
      else { setVerified(!next); setFailed(true) }
    } catch { setVerified(!next); setFailed(true) }
    finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display text-micro font-bold uppercase transition-colors duration-fast disabled:opacity-60 ${
          verified
            ? 'bg-brand-600 border-brand-600 text-white hover:bg-brand-700'
            : 'bg-white border-ink-300 text-ink-600 hover:border-brand-500 hover:text-brand-700'
        }`}
        title="ვერიფიცირებული ექსპერტი — გამოჩნდება ✓ ბეჯი ბარათსა და პროფილზე"
      >
        <Icon.shieldCheck className="w-3 h-3" /> ვერიფ.
      </button>
      {failed && <span role="alert" className="font-display text-meta font-semibold text-danger-700">ვერ შეინახა</span>}
    </span>
  )
}

const FeaturedToggle = ({ tutorId, initial, onSaved }: { tutorId: string; initial: boolean; onSaved?: () => void }) => {
  const [featured, setFeatured] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const next = !featured
    setFeatured(next)
    try {
      const res = await fetch(`/api/admin/tutors/${tutorId}/featured`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: next }),
      })
      // adminOk, not res.ok — see VerifiedToggle.
      if (await adminOk(res)) onSaved?.()
      else { setFeatured(!next); setFailed(true) }
    } catch { setFeatured(!next); setFailed(true) }
    finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display text-micro font-bold uppercase transition-colors duration-fast disabled:opacity-60 ${
          featured
            ? 'bg-warning-600 border-warning-600 text-white hover:bg-warning-700'
            : 'bg-white border-ink-300 text-ink-600 hover:border-warning-500 hover:text-warning-700'
        }`}
        title="ჩართე რჩეული — გამოჩნდება მთავარი გვერდის hero-ში"
      >
        <Icon.star className="w-3 h-3" /> რჩეული
      </button>
      {failed && <span role="alert" className="font-display text-meta font-semibold text-danger-700">ვერ შეინახა</span>}
    </span>
  )
}

// „პაკეტები" — the ONE gate for the teaching vertical (lib/packages.ts).
//
// Renders only while the feature exists at all; with PACKAGES_VISIBILITY 'off'
// the control is absent rather than disabled, so an unfinished vertical leaves
// no trace in the admin either.
//
// Deliberately NOT styled like „რჩეული"/„ვერიფ.": those describe what an
// expert IS, this one decides what they may SELL. Brand green marks it as the
// same family as the site's other „this is live" affordances.
const PackagesToggle = ({ tutorId, initial, onSaved }: { tutorId: string; initial: boolean; onSaved?: () => void }) => {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!packagesFeatureExists()) return null
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const next = !on
    setOn(next)
    try {
      const res = await fetch(`/api/admin/tutors/${tutorId}/packages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packagesEnabled: next }),
      })
      // adminOk, not res.ok — see VerifiedToggle.
      if (await adminOk(res)) onSaved?.()
      else { setOn(!next); setFailed(true) }
    } catch { setOn(!next); setFailed(true) }
    finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display text-micro font-bold uppercase transition-colors duration-fast disabled:opacity-60 ${
          on
            ? 'bg-brand-600 border-brand-600 text-white hover:bg-brand-700'
            : 'bg-white border-ink-300 text-ink-600 hover:border-brand-500 hover:text-brand-700'
        }`}
        title="ჩართე თვიური პაკეტები — ექსპერტი გამოჩნდება სწავლების გვერდზე"
      >
        <Icon.calendar className="w-3 h-3" /> პაკეტები
      </button>
      {failed && <span role="alert" className="font-display text-meta font-semibold text-danger-700">ვერ შეინახა</span>}
    </span>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-card border border-ink-200 bg-ink-50/40 p-3">
    <div className="font-display text-micro font-semibold uppercase text-ink-500">{label}</div>
    <div className="mt-1 font-display text-body-lg font-bold text-ink-900 tabular-nums truncate">{value}</div>
  </div>
)

const BookingList = ({ items, otherKey }: { items: any[]; otherKey: 'tutor' | 'student' }) => (
  <ul className="divide-y divide-ink-100 rounded-card border border-ink-200 overflow-hidden bg-white">
    {items.map(b => {
      const other = otherKey === 'tutor' ? b.tutor?.user : b.student
      const start = new Date(b.startAt)
      return (
        <li key={b.id} className="p-3 flex items-center gap-3 flex-wrap">
          <img src={other?.avatarUrl || DEFAULT_AVATAR} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-small font-bold text-ink-900 truncate">{b.topic}</div>
            <div className="text-meta text-ink-500 truncate">{other?.fullName ?? '—'} · {fmtDT(start.toISOString())}</div>
          </div>
          <span className={`inline-flex items-center h-5 px-1.5 rounded-pill font-display text-micro font-bold uppercase ${
            b.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border border-success-200'
            : b.status === 'CANCELED' || b.status === 'NO_SHOW' ? 'bg-ink-100 text-ink-600 border border-ink-200'
            : b.status === 'LIVE' ? 'bg-danger-50 text-danger-700 border border-danger-200'
            : 'bg-brand-50 text-brand-700 border border-brand-200'
          }`}>{KA_STATUS[b.status] ?? b.status}</span>
          <div className="font-display text-meta font-bold text-ink-900 tabular-nums shrink-0">₾{b.price}</div>
        </li>
      )
    })}
  </ul>
)

const ReviewList = ({ items, authorKey }: { items: any[]; authorKey: 'student' | 'tutor' }) => (
  <ul className="divide-y divide-ink-100 rounded-card border border-ink-200 overflow-hidden bg-white">
    {items.map(r => {
      const author = authorKey === 'student' ? r.student : r.tutor?.user
      return (
        <li key={r.id} className="p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-display text-small font-bold text-ink-900 truncate">{author?.fullName ?? '—'}</span>
            <span className="inline-flex items-center gap-0.5 text-warning-500">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon.star key={i} className={`w-3 h-3 ${i < r.rating ? '' : 'text-ink-200'}`} />
              ))}
            </span>
            <span className="ml-auto font-mono text-meta tabular-nums text-ink-400 shrink-0">{fmtShort(r.createdAt)}</span>
          </div>
          <p className="text-small text-ink-700 leading-snug whitespace-pre-wrap">{r.body}</p>
        </li>
      )
    })}
  </ul>
)

/* Shared "load more" footer for the paginated admin lists (users/bookings/
   reviews). Shows the button while a cursor remains, else a total-count line. */
const LoadMoreBar = ({ hasMore, loading, onMore, count }: { hasMore: boolean; loading: boolean; onMore: () => void; count: number }) => {
  if (count === 0) return null
  return (
    <div className="px-6 lg:px-8 py-5 flex justify-center">
      {hasMore ? (
        <button type="button" onClick={onMore} disabled={loading} className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-60 text-ink-700 font-display font-semibold text-small transition-colors duration-fast">
          {loading ? 'იტვირთება…' : 'მეტის ჩვენება'}
        </button>
      ) : (
        <span className="text-meta text-ink-400 tabular-nums">სულ {count} ჩანაწერი</span>
      )}
    </div>
  )
}

/* ───── Section: Users (real data via /api/admin/users) ───── */
type ApiUser = {
  id: string; email: string; fullName: string;
  role: 'STUDENT' | 'TUTOR' | 'ADMIN';
  emailVerified: boolean; createdAt: string; avatarUrl: string | null;
  _count: { bookingsAsStudent: number; sentMessages: number };
}

const UsersSection = () => {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all'|'STUDENT'|'TUTOR'|'ADMIN'>('all')
  const [users, setUsers] = useState<ApiUser[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  // Bumped by the detail modal (onChanged) when it closes after a successful
  // mutation — suspend/role/verified/featured — so the list refetches instead
  // of keeping the pre-mutation rows on screen.
  const [refreshTick, setRefreshTick] = useState(0)
  // A deletion closes the modal it happened in, so the confirmation has to land
  // out here — otherwise the row just silently vanishes from the list.
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true); setErr(null)
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set('q', q.trim())
        if (role !== 'all') params.set('role', role)
        const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' })
        if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); setUsers([]); setNextCursor(null); return }
        const data = await res.json()
        if (!cancelled) { setUsers(Array.isArray(data.items) ? data.items : []); setNextCursor(data.nextCursor ?? null) }
      } catch {
        if (!cancelled) setErr('ქსელის შეცდომა')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, role, refreshTick])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (role !== 'all') params.set('role', role)
      params.set('cursor', nextCursor)
      const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setUsers(prev => [...(prev ?? []), ...(Array.isArray(data.items) ? data.items : [])])
      setNextCursor(data.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  const roleLabel = (r: string) => r === 'STUDENT' ? 'სტუდენტი' : r === 'TUTOR' ? 'ექსპერტი' : 'ადმინი'

  // Impersonation goes through the shared confirm dialog (no native confirm()).
  const [pendImp, setPendImp] = useState<{ userId: string; fullName: string } | null>(null)
  const [impBusy, setImpBusy] = useState(false)
  const impersonate = (userId: string, fullName: string) => setPendImp({ userId, fullName })
  const doImpersonate = async () => {
    if (!pendImp || impBusy) return
    setImpBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/impersonate/${pendImp.userId}`, { method: 'POST' })
      const data = await res.json().catch(() => ({} as any))
      // Session identity just changed (admin → impersonated user). Tell other
      // tabs to reload so none keeps showing the admin panel, then hard-navigate.
      if (res.ok && data?.ok) { broadcastSessionChange(); window.location.href = data.redirect ?? '/'; return }
      setErr('იმპერსონაცია ვერ მოხერხდა')
      setOpenUserId(null)
    } catch {
      setErr('ქსელის შეცდომა')
      setOpenUserId(null)
    } finally {
      setImpBusy(false)
      setPendImp(null)
    }
  }

  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · მომხმარებლები"
        // Honest count: the list is cursor-paginated, so this is what's LOADED,
        // not the total match — say so while more pages remain.
        title={<>{users ? (nextCursor ? `ჩატვირთულია ${users.length} ` : `${users.length} `) : '— '}ანგარიში</>}
        sub="ძებნა და როლის ფილტრი — რეალურ დროში მუშავდება ბაზაზე. დააჭირე რიგს — სრული პროფილი."
        actions={users && users.length > 0 ? (
          <button
            type="button"
            title="ექსპორტდება მხოლოდ ჩატვირთული ჩანაწერები"
            onClick={() => downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'email', 'fullName', 'role', 'emailVerified', 'bookingsAsStudent', 'createdAt'],
              ...users.map(u => [u.id, u.email, u.fullName, u.role, u.emailVerified ? 'yes' : 'no', u._count.bookingsAsStudent, u.createdAt]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV · {users.length}
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="სახელი ან ელფოსტა…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200">
            {(['all','STUDENT','TUTOR','ADMIN'] as const).map(r => (
              <button key={r} type="button" onClick={() => setRole(r)} className={`h-8 px-3 rounded-pill font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${role === r ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}>{r === 'all' ? 'ყველა' : roleLabel(r)}</button>
            ))}
          </div>
          {loading && <span className="text-meta text-ink-500">იტვირთება…</span>}
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        {notice && (
          <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-card border border-success-200 bg-success-50 px-4 py-3 text-small text-success-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="დახურვა" className="shrink-0 w-9 h-9 -my-1.5 -mr-2 rounded-btn inline-flex items-center justify-center text-success-700 hover:bg-success-100 transition-colors duration-fast">
              <Icon.x className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-small min-w-[720px]">
            <thead className="bg-ink-50/40 border-b border-ink-100">
              <tr className="text-left">
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">მომხმარებელი</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">როლი</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ვერიფიც.</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ჯავშნები</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">რეგისტრ.</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 text-right whitespace-nowrap">მოქმ.</th>
              </tr>
            </thead>
            <tbody>
              {/* Three visual states: null (initial, never fetched) → skeleton;
                  loaded + empty → empty message; loaded + rows → table.
                  Previously null and [] collapsed into the "empty" branch, so
                  users saw a flash of "no users found" for ~300ms on mount. */}
              {users === null ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center"><AdminLoading /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-3">
                  <EmptyState
                    variant="inline"
                    icon={<Icon.search className="w-6 h-6" />}
                    title="მომხმარებელი ვერ მოიძებნა"
                    description="ამ ძებნას და ფილტრს არავინ შეესაბამება."
                    cta={q.trim() || role !== 'all' ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setRole('all') } } : undefined}
                  />
                </td></tr>
              ) : users.map(u => (
                <tr
                  key={u.id}
                  onClick={() => setOpenUserId(u.id)}
                  className="border-t border-ink-100 hover:bg-ink-50/40 cursor-pointer"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img src={u.avatarUrl || DEFAULT_AVATAR} alt={u.fullName} className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200" />
                      <div className="min-w-0">
                        <div className="font-display text-small font-bold text-ink-900 truncate">{u.fullName}</div>
                        <div className="font-mono text-meta tabular-nums text-ink-500 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase ${
                      u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                      : u.role === 'TUTOR' ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'bg-ink-50 border-ink-200 text-ink-600'
                    }`}>{roleLabel(u.role)}</span>
                  </td>
                  <td className="px-3 py-3">{u.emailVerified ? <span className="text-success-700"><Icon.check className="w-4 h-4 inline" /></span> : <span className="text-ink-400">—</span>}</td>
                  <td className="px-3 py-3"><div className="font-display text-small font-bold text-ink-900 tabular-nums">{u._count.bookingsAsStudent}</div></td>
                  <td className="px-3 py-3"><div className="font-mono text-meta tabular-nums text-ink-500">{fmtKaDate(new Date(u.createdAt), { year: true })}</div></td>
                  <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenUserId(u.id)}
                      className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1 transition-colors duration-fast"
                    >
                      დეტალები
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {/* Mobile stacked-card fallback — same rows/states as the table. */}
          <div className="block md:hidden">
            {users === null ? (
              <AdminLoading inset />
            ) : users.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={<Icon.search className="w-6 h-6" />}
                title="მომხმარებელი ვერ მოიძებნა"
                description="ამ ძებნას და ფილტრს არავინ შეესაბამება."
                cta={q.trim() || role !== 'all' ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setRole('all') } } : undefined}
              />
            ) : users.map(u => (
              <div key={u.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-center gap-3">
                  <img src={u.avatarUrl || DEFAULT_AVATAR} alt={u.fullName} className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display text-small font-bold text-ink-900 truncate">{u.fullName}</span>
                      <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase ${
                        u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                        : u.role === 'TUTOR' ? 'bg-brand-50 border-brand-200 text-brand-700'
                        : 'bg-ink-50 border-ink-200 text-ink-600'
                      }`}>{roleLabel(u.role)}</span>
                      {u.emailVerified && <span className="text-success-700"><Icon.check className="w-3.5 h-3.5 inline" /></span>}
                    </div>
                    <div className="font-mono text-meta tabular-nums text-ink-500 truncate mt-0.5">{u.email}</div>
                    <div className="font-mono text-meta tabular-nums text-ink-500 mt-0.5">
                      {u._count.bookingsAsStudent} ჯავშანი · {fmtKaDate(new Date(u.createdAt), { year: true })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenUserId(u.id)}
                    className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta shrink-0 transition-colors duration-fast"
                  >
                    დეტალები
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {users && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={users.length} />}
      </section>
      <UserDetailModal
        userId={openUserId}
        onClose={() => setOpenUserId(null)}
        onImpersonate={impersonate}
        onChanged={() => setRefreshTick(t => t + 1)}
        onDeleted={msg => setNotice(msg)}
      />
      <AdminConfirmDialog
        open={pendImp !== null}
        title={`შესვლა როგორც ${pendImp?.fullName ?? ''}?`}
        body="გაიხსნება მისი ანგარიში ამავე ბრაუზერში. მოქმედება ინახება აუდიტში."
        tone="warning"
        confirmLabel="შესვლა"
        busy={impBusy}
        onCancel={() => setPendImp(null)}
        onConfirm={doImpersonate}
      />
    </>
  )
}

/* ───── Section: Bookings (admin view of all bookings + cancel) ───── */
type AdminBooking = {
  id: string
  ref: string
  topic: string
  status: 'PREPARING'|'CONFIRMED'|'LIVE'|'COMPLETED'|'CANCELED'|'NO_SHOW'
  startAt: string
  durationMin: number
  price: number
  student: { id: string; fullName: string; email: string; avatarUrl: string | null } | null
  tutor: {
    id: string
    user: { id: string; fullName: string; email: string; avatarUrl: string | null }
  } | null
}

const BOOKING_STATUS_TABS: { id: 'all' | AdminBooking['status']; label: string }[] = [
  { id: 'all',       label: 'ყველა' },
  { id: 'PREPARING', label: 'მოსამზადებელი' },
  { id: 'CONFIRMED', label: 'დადასტურდა' },
  { id: 'LIVE',      label: 'ცოცხალი' },
  { id: 'COMPLETED', label: 'დასრულდა' },
  { id: 'CANCELED',  label: 'გაუქმდა' },
  { id: 'NO_SHOW',   label: 'გამოუცხადებლობა' },
]

const BookingsSection = () => {
  const [items, setItems] = useState<AdminBooking[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [status, setStatus] = useState<'all' | AdminBooking['status']>('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Action feedback (success/error) — separate from load errors so a reload
  // doesn't wipe the "canceled" confirmation.
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [pendCancel, setPendCancel] = useState<AdminBooking | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (status !== 'all') params.set('status', status)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/bookings?${params}`, { cache: 'no-store' })
      if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); return }
      const j = await res.json()
      setItems(j.items ?? [])
      setNextCursor(j.nextCursor ?? null)
    } catch { setErr('ქსელის შეცდომა') }
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: '50', cursor: nextCursor })
      if (status !== 'all') params.set('status', status)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/bookings?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      setItems(prev => [...(prev ?? []), ...(j.items ?? [])])
      setNextCursor(j.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [status, q])

  const cancel = async (b: AdminBooking, reason: string) => {
    setBusy(b.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/bookings/${b.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setFlash({ kind: 'error', msg: j.error === 'BAD_STATE' ? 'ეს ჯავშანი უკვე დახურულია' : 'გაუქმება ვერ მოხერხდა' })
        return
      }
      await load()
      setFlash({ kind: 'success', msg: 'ჯავშანი გაუქმდა — ორივე მხარეს ეცნობა.' })
    } catch { setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' }) }
    finally { setBusy(null) }
  }

  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · ჯავშნები"
        // Cursor-paginated list — while a next page remains this is the LOADED
        // count, not the total match, and the CSV carries exactly these rows.
        title={<>{items ? (nextCursor ? `ჩატვირთულია ${items.length} ` : `${items.length} `) : '— '}ჯავშანი</>}
        sub="ყველა ჯავშნის ნახვა · გაუქმება სტუდენტის/ექსპერტის სახელით · მიზეზი გამოჩნდება ორივე მხარისთვის."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            title="ექსპორტდება მხოლოდ ჩატვირთული ჩანაწერები"
            onClick={() => downloadCsv(`bookings-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'ref', 'topic', 'status', 'startAt', 'durationMin', 'price', 'studentEmail', 'tutorEmail'],
              ...items.map(b => [b.id, b.ref, b.topic, b.status, b.startAt, b.durationMin, b.price, b.student?.email ?? '', b.tutor?.user.email ?? '']),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV · {items.length}
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="თემა, ref, სახელი…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200 overflow-x-auto">
            {BOOKING_STATUS_TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setStatus(t.id)} className={`shrink-0 h-8 px-3 rounded-pill font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${status === t.id ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}>{t.label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-small min-w-[900px]">
              <thead className="bg-ink-50/40 border-b border-ink-100">
                <tr className="text-left">
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ჯავშანი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">სტუდენტი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ექსპერტი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">დრო</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">სტატუსი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 text-right whitespace-nowrap">ფასი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 text-right whitespace-nowrap">მოქმ.</th>
                </tr>
              </thead>
              <tbody>
                {items === null ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center"><AdminLoading /></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="px-3">
                    <EmptyState
                      variant="inline"
                      icon={<Icon.search className="w-6 h-6" />}
                      title="ჯავშანი ვერ მოიძებნა"
                      description="ამ ძებნას და სტატუსს არც ერთი ჯავშანი არ შეესაბამება."
                      cta={q.trim() || status !== 'all' ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setStatus('all') } } : undefined}
                    />
                  </td></tr>
                ) : items.map(b => (
                  <tr key={b.id} className="border-t border-ink-100 hover:bg-ink-50/40">
                    <td className="px-3 py-3">
                      <div className="font-display text-small font-bold text-ink-900 truncate max-w-[280px]">{b.topic}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500 truncate">#{b.ref.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-display text-small font-semibold text-ink-900 truncate max-w-[180px]">{b.student?.fullName ?? '—'}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500 truncate max-w-[180px]">{b.student?.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-display text-small font-semibold text-ink-900 truncate max-w-[180px]">{b.tutor?.user.fullName ?? '—'}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500 truncate max-w-[180px]">{b.tutor?.user.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-meta tabular-nums text-ink-700 whitespace-nowrap">{fmtDT(b.startAt)}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500">{b.durationMin} წუთი</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center h-5 px-1.5 rounded-pill font-display text-micro font-bold uppercase ${
                        b.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border border-success-200'
                        : b.status === 'CANCELED' || b.status === 'NO_SHOW' ? 'bg-ink-100 text-ink-600 border border-ink-200'
                        : b.status === 'LIVE' ? 'bg-danger-50 text-danger-700 border border-danger-200'
                        : 'bg-brand-50 text-brand-700 border border-brand-200'
                      }`}>{KA_STATUS[b.status] ?? b.status}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-display font-bold text-ink-900 tabular-nums whitespace-nowrap">₾{b.price}</td>
                    <td className="px-3 py-3 text-right">
                      {(b.status === 'PREPARING' || b.status === 'CONFIRMED') && (
                        <button
                          type="button"
                          onClick={() => setPendCancel(b)}
                          disabled={busy === b.id}
                          className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-meta transition-colors duration-fast"
                        >
                          {busy === b.id ? '…' : 'გაუქმება'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile stacked-card fallback — same rows/states as the table. */}
          <div className="block md:hidden">
            {items === null ? (
              <AdminLoading inset />
            ) : items.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={<Icon.search className="w-6 h-6" />}
                title="ჯავშანი ვერ მოიძებნა"
                description="ამ ძებნას და სტატუსს არც ერთი ჯავშანი არ შეესაბამება."
                cta={q.trim() || status !== 'all' ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setStatus('all') } } : undefined}
              />
            ) : items.map(b => (
              <div key={b.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-small font-bold text-ink-900 truncate">{b.topic}</div>
                    <div className="font-mono text-meta tabular-nums text-ink-500">#{b.ref.slice(0, 8)} · {fmtDT(b.startAt)} · {b.durationMin} წუთი</div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center h-5 px-1.5 rounded-pill font-display text-micro font-bold uppercase ${
                    b.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border border-success-200'
                    : b.status === 'CANCELED' || b.status === 'NO_SHOW' ? 'bg-ink-100 text-ink-600 border border-ink-200'
                    : b.status === 'LIVE' ? 'bg-danger-50 text-danger-700 border border-danger-200'
                    : 'bg-brand-50 text-brand-700 border border-brand-200'
                  }`}>{KA_STATUS[b.status] ?? b.status}</span>
                </div>
                <div className="mt-1.5 text-meta text-ink-600 truncate">
                  <span className="font-display font-semibold">{b.student?.fullName ?? '—'}</span>
                  {' → '}
                  <span className="font-display font-semibold">{b.tutor?.user.fullName ?? '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-display text-small font-bold text-ink-900 tabular-nums">₾{b.price}</span>
                  {(b.status === 'PREPARING' || b.status === 'CONFIRMED') && (
                    <button
                      type="button"
                      onClick={() => setPendCancel(b)}
                      disabled={busy === b.id}
                      className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-meta transition-colors duration-fast"
                    >
                      {busy === b.id ? '…' : 'გაუქმება'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        {items && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={items.length} />}
      </section>
      <AdminConfirmDialog
        open={pendCancel !== null}
        title="ჯავშნის გაუქმება"
        body={pendCancel ? <>{pendCancel.topic} · {pendCancel.student?.fullName ?? '—'} → {pendCancel.tutor?.user.fullName ?? '—'}. მიზეზი გამოჩნდება ორივე მხარისთვის.</> : null}
        tone="danger"
        reason="required"
        confirmLabel="გააუქმე"
        busy={pendCancel !== null && busy === pendCancel.id}
        onCancel={() => setPendCancel(null)}
        onConfirm={async (reason) => {
          const b = pendCancel
          setPendCancel(null)
          if (b) await cancel(b, reason)
        }}
      />
    </>
  )
}

/* ───── Section: Disputes (list + resolve with outcome) ───── */
type AdminDispute = {
  id: string
  bookingId: string
  studentId: string
  tutorId: string
  reason: 'NO_SHOW' | 'QUALITY' | 'WRONG_TOPIC' | 'UNPROFESSIONAL' | 'TECHNICAL' | 'OTHER'
  details: string | null
  requested: string
  outcome: string
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
  booking: {
    id: string; ref: string; topic: string; startAt: string; price: number; status: string
    student: { id: string; fullName: string; email: string; avatarUrl: string | null }
    tutor: { id: string; user: { id: string; fullName: string; email: string; avatarUrl: string | null } }
  }
}

const REASON_LABEL: Record<string, string> = {
  NO_SHOW: 'ექსპერტი არ მოვიდა',
  QUALITY: 'დაბალი ხარისხი',
  WRONG_TOPIC: 'არასწორი თემა',
  UNPROFESSIONAL: 'არაპროფესიული ქცევა',
  TECHNICAL: 'ტექნიკური პრობლემა',
  OTHER: 'სხვა',
}
const OUTCOME_LABEL: Record<string, string> = {
  PENDING: 'გახსნილი',
  REFUND_FULL: '100% ფული უკან',
  REFUND_PARTIAL: '50% ფული უკან',
  REDO_FREE: 'უფასო ხელახლა',
  DISMISSED: 'გამორიცხულია',
}

const DisputesSection = () => {
  const [items, setItems] = useState<AdminDispute[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [outcome, setOutcome] = useState<string>('PENDING')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  // Pending resolution → confirm dialog with REQUIRED comment.
  const [pend, setPend] = useState<{ d: AdminDispute; out: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REDO_FREE' | 'DISMISSED' } | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (outcome !== 'ALL') params.set('outcome', outcome)
      const res = await fetch(`/api/admin/disputes?${params}`, { cache: 'no-store' })
      if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); return }
      const j = await res.json()
      setItems(Array.isArray(j.items) ? j.items : [])
      setNextCursor(j.nextCursor ?? null)
    } catch { setErr('ქსელის შეცდომა') }
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: '50', cursor: nextCursor })
      if (outcome !== 'ALL') params.set('outcome', outcome)
      const res = await fetch(`/api/admin/disputes?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      setItems(prev => [...(prev ?? []), ...(Array.isArray(j.items) ? j.items : [])])
      setNextCursor(j.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [outcome])

  const resolve = async (d: AdminDispute, out: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REDO_FREE' | 'DISMISSED', resolution: string) => {
    setBusy(d.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/disputes/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: out, resolution }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setFlash({ kind: 'error', msg: 'გადაწყვეტა ვერ მოხერხდა' }); return }
      await load()
      setFlash({ kind: 'success', msg: `დავა გადაწყდა: ${OUTCOME_LABEL[out]}. ორივე მხარეს ეცნობა.` })
    } catch { setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' }) }
    finally { setBusy(null) }
  }

  const OUTCOME_TABS = [
    { id: 'PENDING', label: 'გახსნილი' },
    { id: 'ALL', label: 'ყველა' },
    { id: 'REFUND_FULL', label: '100% დაბრუნება' },
    { id: 'REFUND_PARTIAL', label: '50% დაბრუნება' },
    { id: 'REDO_FREE', label: 'ხელახალი სესია' },
    { id: 'DISMISSED', label: 'უარყოფილი' },
  ]

  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · დავები"
        // Cursor-paginated — while a next page remains this is the LOADED count.
        title={<>{items ? (nextCursor ? `ჩატვირთულია ${items.length} ` : `${items.length} `) : '— '}დავა</>}
        sub="სტუდენტის ფორმალური საჩივრები — გახსენი, გადახედე, გადაწყვიტე (refund / redo / dismiss). გადაწყვეტა უცნობდება ორივე მხარეს."
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200 overflow-x-auto">
          {OUTCOME_TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setOutcome(t.id)} className={`shrink-0 h-8 px-3 rounded-pill font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${outcome === t.id ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}>{t.label}</button>
          ))}
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6 space-y-3">
        {err && <AdminError message={err} />}
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        {items === null ? (
          <AdminLoading inset />
        ) : items.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={<Icon.flag className="w-6 h-6" />}
            title="ამ ფილტრით დავა არ არის"
            description={outcome === 'PENDING' ? 'გახსნილი დავა არ არის — ყველა გადაწყვეტილია ან საერთოდ არ ყოფილა.' : 'სცადე სხვა ფილტრი.'}
            cta={outcome !== 'ALL' ? { label: 'ყველას ჩვენება', onClick: () => setOutcome('ALL') } : undefined}
          />
        ) : items.map(d => (
          <article key={d.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase ${
                    d.outcome === 'PENDING' ? 'bg-warning-50 border-warning-200 text-warning-700'
                    : d.outcome.startsWith('REFUND') ? 'bg-danger-50 border-danger-200 text-danger-700'
                    : d.outcome === 'REDO_FREE' ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'bg-ink-100 border-ink-200 text-ink-600'
                  }`}>{OUTCOME_LABEL[d.outcome] ?? d.outcome}</span>
                  <span className="font-display text-small font-bold text-ink-900">{REASON_LABEL[d.reason] ?? d.reason}</span>
                  <span className="font-mono text-meta text-ink-400 tabular-nums">{fmtDT(d.createdAt)}</span>
                </div>
                <div className="text-meta text-ink-600 truncate">
                  <span className="font-display font-semibold">{d.booking.student.fullName}</span>
                  {' → '}
                  <span className="font-display font-semibold">{d.booking.tutor.user.fullName}</span>
                  {' · '}
                  <span className="text-ink-400">{d.booking.topic}</span>
                  {' · '}
                  <span className="tabular-nums">₾{d.booking.price}</span>
                </div>
                {d.details && <p className="mt-2 text-small text-ink-700 leading-snug whitespace-pre-wrap">{d.details}</p>}
                {d.resolution && (
                  <div className="mt-2 p-2.5 rounded-btn bg-ink-50 border border-ink-100 text-meta text-ink-700"><span className="font-display font-semibold">გადაწყვეტა:</span> {d.resolution}</div>
                )}
              </div>
              {d.outcome === 'PENDING' && (
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REFUND_FULL' })} className="h-9 px-2.5 rounded-btn bg-danger-500 hover:bg-danger-600 disabled:opacity-50 text-white font-display text-meta font-semibold">100% დაბრუნება</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REFUND_PARTIAL' })} className="h-9 px-2.5 rounded-btn bg-warning-600 hover:bg-warning-700 disabled:opacity-50 text-white font-display text-meta font-semibold">50% დაბრუნება</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REDO_FREE' })} className="h-9 px-2.5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-display text-small font-semibold">ხელახალი სესია</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'DISMISSED' })} className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-700 font-display text-meta font-semibold">უარყოფა</button>
                </div>
              )}
            </div>
          </article>
        ))}
        {items && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={items.length} />}
      </section>
      <AdminConfirmDialog
        open={pend !== null}
        title={pend ? `გადაწყვეტა: ${OUTCOME_LABEL[pend.out]}` : ''}
        body={pend ? <>{pend.d.booking.student.fullName} → {pend.d.booking.tutor.user.fullName} · {pend.d.booking.topic}. კომენტარი გამოჩნდება ორივე მხარის ცნობებში.</> : null}
        tone={pend?.out === 'REFUND_FULL' || pend?.out === 'REFUND_PARTIAL' ? 'danger' : 'brand'}
        reason="required"
        reasonLabel="კომენტარი (სავალდებულო)"
        confirmLabel="გადაწყვიტე"
        busy={pend !== null && busy === pend.d.id}
        onCancel={() => setPend(null)}
        onConfirm={async (resolution) => {
          const p = pend
          setPend(null)
          if (p) await resolve(p.d, p.out, resolution)
        }}
      />
    </>
  )
}

/* ───── Section: Reviews (moderation — list + delete) ───── */
type AdminReview = {
  id: string
  rating: number
  body: string
  createdAt: string
  student: { id: string; fullName: string; avatarUrl: string | null }
  tutor: { id: string; user: { id: string; fullName: string; avatarUrl: string | null } }
  booking: { id: string; topic: string; ref: string } | null
}

const ReviewsSection = () => {
  const [items, setItems] = useState<AdminReview[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [maxRating, setMaxRating] = useState<number>(5)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [pendDelete, setPendDelete] = useState<AdminReview | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams({ maxRating: String(maxRating), limit: '50' })
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/reviews?${params}`, { cache: 'no-store' })
      if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); return }
      const j = await res.json()
      setItems(Array.isArray(j.items) ? j.items : [])
      setNextCursor(j.nextCursor ?? null)
    } catch { setErr('ქსელის შეცდომა') }
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ maxRating: String(maxRating), limit: '50', cursor: nextCursor })
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/reviews?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      setItems(prev => [...(prev ?? []), ...(Array.isArray(j.items) ? j.items : [])])
      setNextCursor(j.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [maxRating, q])

  const remove = async (r: AdminReview, reason: string) => {
    setBusy(r.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/reviews?id=${r.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { setFlash({ kind: 'error', msg: 'წაშლა ვერ მოხერხდა' }); return }
      await load()
      setFlash({ kind: 'success', msg: 'შეფასება წაიშალა — ექსპერტის რეიტინგი გადაითვალა.' })
    } catch { setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' }) }
    finally { setBusy(null) }
  }

  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · შეფასებები"
        // Cursor-paginated list — while a next page remains this is the LOADED
        // count, not the total match, and the CSV carries exactly these rows.
        title={<>{items ? (nextCursor ? `ჩატვირთულია ${items.length} ` : `${items.length} `) : '— '}შეფასება</>}
        sub="ცუდი/სპამი/შეურაცხმყოფელი შეფასების წაშლა · წაშლისას ექსპერტის რეიტინგი გადაითვლება ავტომატურად."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            title="ექსპორტდება მხოლოდ ჩატვირთული ჩანაწერები"
            onClick={() => downloadCsv(`reviews-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'rating', 'student', 'tutor', 'topic', 'body', 'createdAt'],
              ...items.map(r => [r.id, r.rating, r.student.fullName, r.tutor.user.fullName, r.booking?.topic ?? '', r.body, r.createdAt]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV · {items.length}
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ტექსტი ან სახელი…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200">
            {[
              { v: 5, label: 'ყველა' },
              { v: 3, label: '≤ 3 ★' },
              { v: 2, label: '≤ 2 ★' },
              { v: 1, label: '1 ★ (ცუდი)' },
            ].map(o => (
              <button key={o.v} type="button" onClick={() => setMaxRating(o.v)} className={`h-8 px-3 rounded-pill font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${maxRating === o.v ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}>{o.label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6 space-y-3">
        {err && <AdminError message={err} />}
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        {items === null ? (
          <AdminLoading inset />
        ) : items.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={<Icon.star className="w-6 h-6" />}
            title="ამ ფილტრით შეფასება არ არის"
            description="სცადე სხვა ძებნა ან რეიტინგის ზღვარი."
            cta={q.trim() || maxRating !== 5 ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setMaxRating(5) } } : undefined}
          />
        ) : items.map(r => (
          <article key={r.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <img src={r.student.avatarUrl || DEFAULT_AVATAR} alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200" />
                <div className="min-w-0">
                  <div className="font-display text-small font-bold text-ink-900 truncate">{r.student.fullName}</div>
                  <div className="text-meta text-ink-500 truncate">→ {r.tutor.user.fullName}{r.booking ? ` · #${r.booking.ref.slice(0, 8)}` : ''}</div>
                </div>
              </div>
              <div className="inline-flex items-center gap-0.5 text-warning-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Icon.star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? '' : 'text-ink-200'}`} />
                ))}
                <span className="ml-2 font-display text-meta font-semibold text-ink-700 tabular-nums">{r.rating}.0</span>
              </div>
              <span className="font-mono text-meta tabular-nums text-ink-400">{fmtDT(r.createdAt)}</span>
              <button
                type="button"
                onClick={() => setPendDelete(r)}
                disabled={busy === r.id}
                className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-meta transition-colors duration-fast"
              >
                {busy === r.id ? '…' : 'წაშლა'}
              </button>
            </div>
            <p className="mt-3 text-small text-ink-700 leading-[1.55] whitespace-pre-wrap">{r.body}</p>
            {r.booking && (
              <div className="mt-2 text-meta text-ink-500">
                <span className="font-display font-semibold">ჯავშანი:</span> {r.booking.topic}
              </div>
            )}
          </article>
        ))}
        {items && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={items.length} />}
      </section>
      <AdminConfirmDialog
        open={pendDelete !== null}
        title="შეფასების წაშლა"
        body={pendDelete ? <>{pendDelete.student.fullName} → {pendDelete.tutor.user.fullName} · {pendDelete.rating}★. მიზეზი ინახება აუდიტში; ექსპერტის რეიტინგი გადაითვლება.</> : null}
        tone="danger"
        reason="required"
        confirmLabel="წაშალე"
        busy={pendDelete !== null && busy === pendDelete.id}
        onCancel={() => setPendDelete(null)}
        onConfirm={async (reason) => {
          const r = pendDelete
          setPendDelete(null)
          if (r) await remove(r, reason)
        }}
      />
    </>
  )
}

/* ───── Section: Finance (real data via /api/admin/finance) ───── */
type FinanceData = {
  gmv: number; gmvMonth: number; growthPct: number | null;
  commission: number; completedCount: number;
  pendingPayout: number; pendingCount: number;
}

const FinanceSection = () => {
  const [data, setData] = useState<FinanceData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    // A non-2xx must reach `err` too — mapping it to null left the section
    // sitting in its „ლოდინი“ placeholder forever with nothing said.
    fetch('/api/admin/finance', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('finance')))
      .then(setData)
      .catch(() => setErr('ჩატვირთვა ვერ მოხერხდა'))
  }, [])
  const growth = data?.growthPct == null ? '—' : `${data.growthPct >= 0 ? '+' : ''}${data.growthPct}%`
  return (
    <>
      <TabHeader
        eyebrow="ფინანსები · GMV + კომისია"
        title={<>{data ? <>ჯამური GMV — <span className="tabular-nums">₾{data.gmv.toLocaleString()}</span></> : 'ფინანსური მდგომარეობა'}</>}
        sub="ყველა დასრულებული ჯავშნის მთლიანი მოცულობა და 15%-იანი კომისია. გადახდის ინტეგრაცია მალე დაემატება."
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6 space-y-6">
        {err && <AdminError message={err} />}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">GMV (სულ)</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-brand-700 tabular-nums leading-none">{data ? `₾${data.gmv.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">{data ? `${data.completedCount} დასრულებული სესია` : ''}</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">კომისია (15%)</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-success-700 tabular-nums leading-none">{data ? `₾${data.commission.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">15% საკომისიო</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">ეს თვე</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-ink-900 tabular-nums leading-none">{data ? `₾${data.gmvMonth.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">გასულ თვესთან: {growth}</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">Payout მოლოდინში</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-warning-700 tabular-nums leading-none">{data ? `₾${data.pendingPayout.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">{data ? `${data.pendingCount} ჯავშანი` : ''}</div>
          </div>
        </div>
        <div className="p-4 rounded-card border border-ink-200 bg-ink-50/40 text-small text-ink-600 leading-relaxed">
          გადახდის ავტომატიზაცია (TBC / BOG / Stripe) ჯერ არ არის ინტეგრირებული — payout რიცხვები არის ის, რაც ჯამში ეკუთვნით ექსპერტებს დასრულებული სესიების საფუძველზე. ხელით გადახდის შემდეგ payoutStatus გახდება RELEASED.
        </div>
      </section>
    </>
  )
}

/* ───── Section: Analytics (real data via /api/admin/analytics) ───── */
type AnalyticsData = {
  users: { total: number; students: number; new7d: number; new30d: number }
  tutors: { total: number }
  bookings: { total: number; new7d: number }
  reviews: { total: number; avgRating: number }
  activationPct: number
  activatedStudents: number
}

type SeriesData = { days: string[]; signups: number[]; bookings: number[]; revenue: number[] }

const AnalyticsSection = () => {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [series, setSeries] = useState<SeriesData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    // Same as FinanceSection: a non-2xx has to surface, not silently hold the
    // header at „ლოდინი…“. The series is a secondary sparkline — it may stay
    // quiet, since the section still reads without it.
    fetch('/api/admin/analytics', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('analytics')))
      .then(setData)
      .catch(() => setErr('ჩატვირთვა ვერ მოხერხდა'))
    fetch('/api/admin/analytics/series', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setSeries).catch(() => {})
  }, [])
  return (
    <>
      <TabHeader
        eyebrow="ანალიტიკა · პროდუქტი"
        title={data
          ? <>{data.tutors.total} ექსპერტი · {data.users.students} სტუდენტი · {data.bookings.total} ჯავშანი</>
          : <>ლოდინი…</>}
        sub="ბაზაზე გამოთვლილი ცოცხალი მაჩვენებლები."
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6 space-y-5">
        {err && <AdminError message={err} />}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">აქტივაცია</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-ink-900 tabular-nums leading-none">{data ? `${data.activationPct}%` : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">{data ? `${data.activatedStudents} სტუდენტმა დაჯავშნა` : ''}</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">ახალი (7 დღე)</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-brand-700 tabular-nums leading-none">{data ? data.users.new7d : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">ახალი ანგარიში</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">ჯავშნები (7 დღე)</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-ink-900 tabular-nums leading-none">{data ? data.bookings.new7d : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">ბოლო კვირაში დაჯავშნილი</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">საშ. შეფასება</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-warning-700 tabular-nums leading-none">{data ? data.reviews.avgRating.toFixed(2) : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">{data ? `${data.reviews.total} შეფასების საშუალო` : ''}</div>
          </div>
        </div>
        {series && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-micro font-bold text-ink-500 uppercase">ბოლო 30 დღე · ტრენდები</span>
              <div className="flex-1 h-px bg-ink-100" />
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <MiniChart title="ახალი ანგარიშები" data={series.signups} labels={series.days} kind="area" color={CHART.brand} />
              <MiniChart title="ჯავშნები" data={series.bookings} labels={series.days} kind="area" color={CHART.ink} />
              <MiniChart title="შემოსავალი" data={series.revenue} labels={series.days} kind="bar" color={CHART.brand} format={(n) => `₾${n}`} />
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted" className="mb-3">მომხმარებლების ბაზა</Eyebrow>
            <ul className="space-y-2 text-small">
              <li className="flex items-center justify-between"><span className="text-ink-700">სულ</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.users.total ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">სტუდენტი</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.users.students ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">ექსპერტი</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.tutors.total ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">30 დღეში ახალი</span><span className="font-display font-bold text-brand-700 tabular-nums">{data?.users.new30d ?? '—'}</span></li>
            </ul>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted" className="mb-3">აქტივობა</Eyebrow>
            <ul className="space-y-2 text-small">
              <li className="flex items-center justify-between"><span className="text-ink-700">სულ ჯავშნები</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.bookings.total ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">სულ შეფასებები</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.reviews.total ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">აქტიური სტუდენტი</span><span className="font-display font-bold text-success-700 tabular-nums">{data?.activatedStudents ?? '—'}</span></li>
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}

/* ───── Section: Broadcast (in-app Notification fan-out) ───── */
type Segment = 'all' | 'students' | 'tutors' | 'recent'

const SEGMENT_LABEL: Record<Segment, string> = {
  all: 'ყველა მომხმარებელი',
  students: 'ყველა სტუდენტი',
  tutors: 'ყველა ექსპერტი',
  recent: 'ბოლო 7 დღის რეგისტრაცია',
}

const BroadcastSection = () => {
  const [segment, setSegment] = useState<Segment>('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  // Send goes through the shared confirm dialog (no native confirm()).
  const [pendSend, setPendSend] = useState(false)

  // Any change to the segment invalidates a previously-fetched preview count —
  // otherwise the user sees a "will send to 240" while the segment now says
  // "tutors only" (misleading).
  useEffect(() => { setPreviewCount(null) }, [segment])

  const doPreview = async () => {
    setBusy(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/broadcast/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (res.ok && data?.ok) setPreviewCount(data.count)
      else setFlash({ kind: 'error', msg: 'დათვლა ვერ მოხერხდა' })
    } catch {
      setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' })
    } finally { setBusy(false) }
  }

  const askSend = () => {
    if (!subject.trim() || !body.trim()) {
      setFlash({ kind: 'error', msg: 'სათაური და ტექსტი სავალდებულოა' })
      return
    }
    setPendSend(true)
  }

  const doSend = async () => {
    setPendSend(false)
    setBusy(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, subject: subject.trim(), body: body.trim() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (res.ok && data?.ok) {
        setFlash({ kind: 'success', msg: `${data.sent} შეტყობინება გაიგზავნა.` })
        setSubject(''); setBody(''); setPreviewCount(null)
      } else {
        setFlash({ kind: 'error', msg: 'გაგზავნა ვერ მოხერხდა' })
      }
    } catch {
      setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' })
    } finally { setBusy(false) }
  }

  return (
    <>
      <TabHeader
        eyebrow="მასობრივი · შიდა შეტყობინება"
        title={<>მასობრივი შეტყობინება</>}
        sub="შერჩეულ სეგმენტს ეგზავნება Notification ჩანაწერი. Email არ იგზავნება."
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6 max-w-[720px] space-y-4">
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        <div>
          <Eyebrow as="label" tone="muted" className="block mb-1.5">სეგმენტი</Eyebrow>
          <div className="inline-flex flex-wrap items-center p-0.5 rounded-pill bg-white border border-ink-200">
            {(['all', 'students', 'tutors', 'recent'] as Segment[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSegment(s)}
                className={`h-8 px-3 rounded-pill font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${segment === s ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}
              >{SEGMENT_LABEL[s]}</button>
            ))}
          </div>
        </div>
        <div>
          <Eyebrow as="label" tone="muted" className="block mb-1.5">სათაური</Eyebrow>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            maxLength={120}
            placeholder="მაგ. სამომხმარებლო შეთანხმების განახლება"
            className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </div>
        <div>
          <Eyebrow as="label" tone="muted" className="block mb-1.5">ტექსტი</Eyebrow>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder="შეტყობინების შინაარსი…"
            className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y"
          />
          <div className="mt-1 font-mono text-meta tabular-nums text-ink-400">{body.length}/4000</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={doPreview}
            disabled={busy}
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-800 font-display font-semibold text-small inline-flex items-center gap-1.5"
          >
            <Icon.users className="w-3.5 h-3.5" /> მიმღების რაოდენობა
          </button>
          <button
            type="button"
            onClick={askSend}
            disabled={busy || !subject.trim() || !body.trim()}
            className="h-11 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-100 text-white font-display font-semibold text-small inline-flex items-center gap-1.5"
          >
            გაგზავნა
          </button>
          {previewCount !== null && (
            <span className="font-mono text-meta tabular-nums text-ink-700">
              {previewCount} მიმღები
            </span>
          )}
        </div>
      </section>
      <AdminConfirmDialog
        open={pendSend}
        title="მასობრივი შეტყობინების გაგზავნა"
        body={<>სეგმენტი: <span className="font-display font-semibold">{SEGMENT_LABEL[segment]}</span>{previewCount !== null ? <> · {previewCount} მიმღები</> : null}. თითოეულს შეექმნება in-app შეტყობინება.</>}
        tone="brand"
        confirmLabel="გააგზავნე"
        busy={busy}
        onCancel={() => setPendSend(false)}
        onConfirm={doSend}
      />
    </>
  )
}

/* ───── Section: Categories (isLive + defaultServiceType toggles) ─────
   Small admin surface for controlling the /categories browse page. Every
   toggle hits PATCH /api/admin/categories/:id — we mutate local state first
   (optimistic) and revert on network failure so the switch feels instant. */
type AdminCategory = {
  id: string
  slug: string
  name: string
  defaultServiceType: 'CONSULTATION' | 'RECURRING'
  isLive: boolean
  tutorCount: number
}

const CategoriesSection = () => {
  const [rows, setRows] = useState<AdminCategory[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [query, setQuery] = useState('')
  // Category delete was the only destructive admin action firing instantly on
  // click — route it through the shared confirm dialog like every other delete.
  const [pendDelete, setPendDelete] = useState<AdminCategory | null>(null)
  // Turning isLive OFF is far more destructive than DELETE (which is blocked
  // while the category still has experts): it delists every expert in it from
  // /tutors, the category page, the sitemap and the homepage. Confirm it.
  // Turning it back ON is harmless and stays one click.
  const [pendHide, setPendHide] = useState<AdminCategory | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/categories', { cache: 'no-store' })
        if (!res.ok) throw new Error('fetch failed')
        const data: AdminCategory[] = await res.json()
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setErr('კატეგორიების ჩატვირთვა ვერ მოხერხდა.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const patch = async (id: string, body: Partial<Pick<AdminCategory, 'isLive' | 'defaultServiceType'>>) => {
    if (!rows) return
    const before = rows
    // Optimistic mutation first — the UI feels instant. If the server rejects
    // (auth expired, 404, network drop) we swap the array back and flash.
    const next = rows.map(r => r.id === id ? { ...r, ...body } : r)
    setRows(next)
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // adminOk, not res.ok — an expired session 307s to sign-in and fetch
      // hands the HTML back as a 200, which used to flash fake success while
      // the category never changed.
      if (!(await adminOk(res))) throw new Error('patch failed')
      setFlash({ kind: 'success', msg: 'ცვლილება შეინახა.' })
    } catch {
      setRows(before)
      setFlash({ kind: 'error', msg: 'ცვლილება ვერ შეინახა — სცადე თავიდან.' })
    }
  }

  // Create a category from a name — it appears in /apply + discovery instantly
  // (both read the DB), so the field list is no longer hardcoded in the app.
  const create = async () => {
    const name = newName.trim()
    if (name.length < 2 || creating) return
    setCreating(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => [...(prev ?? []), j.category])
      setNewName('')
      setFlash({ kind: 'success', msg: 'კატეგორია დაემატა.' })
    } catch { setFlash({ kind: 'error', msg: 'დამატება ვერ მოხერხდა.' }) }
    finally { setCreating(false) }
  }

  const rename = async (id: string) => {
    const name = editName.trim()
    setEditingId(null)
    if (name.length < 2) return
    const before = rows
    setRows(prev => (prev ?? []).map(r => r.id === id ? { ...r, name } : r))
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      // adminOk, not res.ok — see patch() above.
      if (!(await adminOk(res))) throw new Error()
      setFlash({ kind: 'success', msg: 'სახელი შეიცვალა.' })
    } catch { setRows(before); setFlash({ kind: 'error', msg: 'ვერ შეინახა.' }) }
  }

  const remove = async (id: string) => {
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (res.status === 409) { setFlash({ kind: 'error', msg: 'ვერ წაიშლება — ამ კატეგორიას ექსპერტები ჰყავს. დამალე ნაცვლად.' }); return }
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => (prev ?? []).filter(r => r.id !== id))
      setFlash({ kind: 'success', msg: 'კატეგორია წაიშალა.' })
    } catch { setFlash({ kind: 'error', msg: 'წაშლა ვერ მოხერხდა.' }) }
  }

  const filtered = (rows ?? []).filter(r => {
    const q = query.trim().toLowerCase()
    return !q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)
  })

  return (
    <>
      <TabHeader
        eyebrow="კატეგორიები · სფეროების მართვა"
        title={<>სფეროების მართვა</>}
        sub="დაამატე, გადაარქვი, დამალე ან წაშალე სფერო — /apply და ძებნა DB-დან კითხულობს, ასე რომ კოდის შეცვლა აღარ სჭირდება."
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}

        {/* Add a category + (once the list grows) filter it. */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex gap-2 flex-1">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create() }}
              placeholder="ახალი სფერო — მაგ. ეთიკური ჰაკინგი"
              maxLength={60}
              className="flex-1 h-11 px-3 rounded-btn border border-ink-200 text-small focus:border-brand-500 focus:outline-none"
            />
            <button type="button" onClick={create} disabled={creating || newName.trim().length < 2} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body inline-flex items-center gap-1.5 transition-colors duration-fast shrink-0">
              <Icon.plus className="w-3.5 h-3.5" /> დამატება
            </button>
          </div>
          {(rows?.length ?? 0) > 6 && (
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ძებნა…" aria-label="კატეგორიების ძებნა" className="h-11 px-3 rounded-btn border border-ink-200 text-small focus:border-brand-500 focus:outline-none sm:w-44" />
          )}
        </div>

        {rows === null ? (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5 border-b border-ink-100 last:border-b-0">
                <div className="h-4 w-40 rounded bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-6 w-24 rounded-pill bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-4 w-16 rounded bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-6 w-11 rounded-pill bg-ink-100 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-ink-200 bg-white py-12 px-6 text-center">
            <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">კატეგორია არ არის</div>
            <p className="text-small text-ink-500 mt-1.5">დაამატე პირველი სფერო ზემოთ ველიდან.</p>
          </div>
        ) : (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1.5fr_1fr_0.6fr_auto] gap-4 px-4 py-2.5 border-b border-ink-200 bg-ink-50/60 font-display text-micro font-semibold uppercase text-ink-500">
              <div>სახელი</div>
              <div>Slug</div>
              <div>ექსპერტი</div>
              <div className="text-right">მართვა</div>
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-small text-ink-500">ვერაფერი მოიძებნა.</div>
            ) : filtered.map(r => (
              <div key={r.id} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_0.6fr_auto] gap-2 sm:gap-4 items-center px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="min-w-0">
                  {editingId === r.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => rename(r.id)}
                      onKeyDown={e => { if (e.key === 'Enter') rename(r.id); if (e.key === 'Escape') setEditingId(null) }}
                      maxLength={60}
                      className="w-full h-9 px-2.5 rounded-btn border border-brand-400 text-body font-display font-semibold focus:outline-none"
                    />
                  ) : (
                    <div className="font-display font-semibold text-body text-ink-900 truncate">{r.name}</div>
                  )}
                </div>
                <div className="font-mono text-meta text-ink-500 tabular-nums truncate">{r.slug}</div>
                <div className="font-display font-semibold text-small text-ink-800 tabular-nums">{r.tutorCount}</div>
                <div className="flex items-center gap-1 sm:justify-end">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.isLive}
                    aria-label={`კატეგორია ${r.name} — ${r.isLive ? 'ცოცხალი' : 'დამალული'}`}
                    onClick={() => r.isLive ? setPendHide(r) : patch(r.id, { isLive: true })}
                    className={`relative inline-flex items-center h-6 w-11 rounded-pill transition-colors duration-fast shrink-0 ${r.isLive ? 'bg-success-500' : 'bg-ink-200'}`}
                  >
                    <span className={`inline-block w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-fast ${r.isLive ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
                  </button>
                  <button type="button" onClick={() => { setEditingId(r.id); setEditName(r.name) }} className="h-8 px-2.5 rounded-btn text-meta font-display font-semibold text-ink-600 hover:bg-ink-100 transition-colors duration-fast">რედაქტ.</button>
                  <button type="button" onClick={() => setPendDelete(r)} disabled={r.tutorCount > 0} title={r.tutorCount > 0 ? 'ჯერ ექსპერტები ჰყავს — დამალე' : 'წაშლა'} className="h-8 px-2.5 rounded-btn text-meta font-display font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast">წაშლა</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <AdminConfirmDialog
        open={pendHide !== null}
        title="კატეგორიის დამალვა"
        body={<>
          „{pendHide?.name ?? ''}“ საჯარო საიტიდან გაქრება — მისი <span className="font-display font-semibold tabular-nums">{pendHide?.tutorCount ?? 0}</span> ექსპერტი აღარ გამოჩნდება ძებნაში, კატეგორიის გვერდზე, sitemap-სა და მთავარ გვერდზე.
          {(pendHide?.tutorCount ?? 0) > 0 && <span className="mt-2 block text-danger-700">ჯავშნები და პროფილები რჩება — მაგრამ ვეღარავინ იპოვის. ჩართვით ყველაფერი დაბრუნდება.</span>}
        </>}
        tone="danger"
        confirmLabel="დამალე"
        onCancel={() => setPendHide(null)}
        onConfirm={async () => {
          const id = pendHide?.id
          setPendHide(null)
          if (id) await patch(id, { isLive: false })
        }}
      />
      <AdminConfirmDialog
        open={pendDelete !== null}
        title="კატეგორიის წაშლა"
        body={<>წაიშლება კატეგორია <span className="font-display font-semibold">{pendDelete?.name ?? ''}</span>. ეს შეუქცევადია.</>}
        tone="danger"
        confirmLabel="წაშლა"
        onCancel={() => setPendDelete(null)}
        onConfirm={async () => {
          const id = pendDelete?.id
          setPendDelete(null)
          if (id) await remove(id)
        }}
      />
    </>
  )
}

// Derived, not hand-listed. As a literal it was the fourth copy of the tab
// list, with no compile-time link to the nav — add a tab, forget this line, and
// the deep link silently no-ops with nothing to notice.
const VALID_TABS: AdminTab[] = ADMIN_NAV.map(n => n.id)

/* ───── Section: Audit log ───── */
type AuditItem = {
  id: string
  actorId: string
  action: string
  targetType: string | null
  targetId: string | null
  meta: any
  createdAt: string
  actor: { id: string; fullName: string; email: string } | null
}

// Every action string written by an audit() call site must have a label here —
// an unmapped one falls back to the raw `noun.verb` and reads like a bug.
const ACTION_LABEL: Record<string, string> = {
  'application.approve': 'განაცხადი დამტკიცდა',
  'application.approve.verified': 'დამტკიცებისას მიენიჭა „გადამოწმებული“',
  'application.reject': 'განაცხადი უარყოფილია',
  'application.revise': 'განაცხადი შესასწორებლად დაბრუნდა',
  'booking.cancel': 'ჯავშანი გაუქმდა',
  'review.delete': 'შეფასება წაიშალა',
  'dispute.resolve': 'დავა გადაწყდა',
  'user.impersonate.start': 'იმპერსონაცია დაიწყო',
  'user.impersonate.end': 'იმპერსონაცია დასრულდა',
  'user.suspend': 'ანგარიში შეჩერდა',
  'user.unsuspend': 'შეჩერება მოიხსნა',
  'user.message': 'მომხმარებელს მიეწერა',
  'user.makeAdmin': 'მიენიჭა ადმინის უფლება',
  'user.revokeAdmin': 'მოეხსნა ადმინის უფლება',
  'user.delete': 'ანგარიში სრულად წაიშალა',
  'user.anonymize': 'ანგარიში ანონიმიზდა',
  'tutor.feature': 'ექსპერტი გახდა რჩეული',
  'tutor.unfeature': 'ექსპერტს მოეხსნა რჩეული',
  'tutor.verify': 'ექსპერტი ვერიფიცირდა',
  'tutor.unverify': 'ვერიფიკაცია მოეხსნა',
  'integration.set': 'ინტეგრაციის კოდი ჩაიწერა',
  'integration.clear': 'ინტეგრაციის კოდი ამოიშალა',
  'siteText.set': 'საიტის ტექსტი შეიცვალა',
  'siteText.reset': 'საიტის ტექსტი დაუბრუნდა ნაგულისხმევს',
  'post.create': 'სტატია შეიქმნა',
  'post.update': 'სტატია დარედაქტირდა',
  'post.publish': 'სტატია გამოქვეყნდა',
  'post.unpublish': 'სტატია დაიმალა',
  'post.delete': 'სტატია წაიშალა',
  'category.create': 'კატეგორია დაემატა',
  'category.update': 'კატეგორია შეიცვალა',
  'category.hide': 'კატეგორია დაიმალა',
  'category.show': 'კატეგორია გამოჩნდა',
  'category.delete': 'კატეგორია წაიშალა',
  'broadcast.send': 'მასობრივი შეტყობინება გაიგზავნა',
}

const AuditSection = () => {
  const [items, setItems] = useState<AuditItem[] | null>(null)
  const [actionFilter, setActionFilter] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (actionFilter) params.set('action', actionFilter)
      const res = await fetch(`/api/admin/audit?${params}`, { cache: 'no-store' })
      if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); return }
      const rows = await res.json()
      setItems(Array.isArray(rows) ? rows : [])
    } catch { setErr('ქსელის შეცდომა') }
  }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [actionFilter])

  return (
    <>
      <TabHeader
        eyebrow="სისტემა · აუდიტი"
        title={<>{items ? `${items.length} ` : '—'} ჩანაწერი</>}
        sub="ყოველი admin action ინახება აუდიტში — approve/reject, cancel, delete, impersonate, message."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadCsv(`audit-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['createdAt', 'actor', 'action', 'targetType', 'targetId', 'meta'],
              ...items.map(i => [i.createdAt, i.actor?.email ?? i.actorId, i.action, i.targetType ?? '', i.targetId ?? '', JSON.stringify(i.meta ?? {})]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV ექსპორტი
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[360px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="მოქმედების პრეფიქსი (booking, review, application…)" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-small min-w-[800px]">
              <thead className="bg-ink-50/40 border-b border-ink-100">
                <tr className="text-left">
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">დრო</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ვინ</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">მოქმედება</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ობიექტი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">დეტალი</th>
                </tr>
              </thead>
              <tbody>
                {items === null ? (
                  <tr><td colSpan={5} className="px-3 py-10 text-center"><AdminLoading /></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-3">
                    <EmptyState
                      variant="inline"
                      icon={<Icon.doc className="w-6 h-6" />}
                      title="ჩანაწერი არ არის"
                      description="ადმინის მოქმედებები აქ დაფიქსირდება."
                      cta={actionFilter ? { label: 'ფილტრის გასუფთავება', onClick: () => setActionFilter('') } : undefined}
                    />
                  </td></tr>
                ) : items.map(i => (
                  <tr key={i.id} className="border-t border-ink-100 hover:bg-ink-50/40">
                    <td className="px-3 py-2.5 font-mono text-meta tabular-nums text-ink-500 whitespace-nowrap">{fmtDT(i.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-display text-small font-bold text-ink-900 truncate max-w-[180px]">{i.actor?.fullName ?? i.actorId}</div>
                      <div className="font-mono text-meta text-ink-500 truncate max-w-[180px]">{i.actor?.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-display text-small font-bold text-ink-900">{ACTION_LABEL[i.action] ?? i.action}</div>
                      <div className="font-mono text-meta text-ink-400 tabular-nums">{i.action}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-meta tabular-nums text-ink-500 truncate max-w-[200px]">{i.targetType ?? '—'}{i.targetId ? ' · ' + i.targetId.slice(0, 12) : ''}</td>
                    <td className="px-3 py-2.5 font-mono text-meta tabular-nums text-ink-500 truncate max-w-[280px]" title={JSON.stringify(i.meta ?? {})}>{i.meta ? JSON.stringify(i.meta).slice(0, 80) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile stacked-card fallback — same rows/states as the table. */}
          <div className="block md:hidden">
            {items === null ? (
              <AdminLoading inset />
            ) : items.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={<Icon.doc className="w-6 h-6" />}
                title="ჩანაწერი არ არის"
                description="ადმინის მოქმედებები აქ დაფიქსირდება."
                cta={actionFilter ? { label: 'ფილტრის გასუფთავება', onClick: () => setActionFilter('') } : undefined}
              />
            ) : items.map(i => (
              <div key={i.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-small font-bold text-ink-900 truncate">{ACTION_LABEL[i.action] ?? i.action}</div>
                    <div className="font-mono text-meta text-ink-400 tabular-nums truncate">{i.action}</div>
                  </div>
                  <span className="shrink-0 font-mono text-meta tabular-nums text-ink-500">{fmtDT(i.createdAt)}</span>
                </div>
                <div className="mt-1 text-meta text-ink-600 truncate">
                  <span className="font-display font-semibold">{i.actor?.fullName ?? i.actorId}</span>
                  {i.actor?.email ? <span className="font-mono text-ink-500"> · {i.actor.email}</span> : null}
                </div>
                <div className="mt-0.5 font-mono text-meta tabular-nums text-ink-500 truncate">
                  {i.targetType ?? '—'}{i.targetId ? ' · ' + i.targetId.slice(0, 12) : ''}
                </div>
                {i.meta ? (
                  <div className="mt-0.5 font-mono text-meta tabular-nums text-ink-500 truncate" title={JSON.stringify(i.meta ?? {})}>
                    {JSON.stringify(i.meta).slice(0, 80)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

/* ───── Impersonation banner ─────
   Polls the /status endpoint (a cheap read of the impersonation cookie, no DB
   hit) so the banner also appears when this same tab is idle after an admin
   in a different tab triggered impersonation. */
// Local ImpersonationBanner was replaced by the global one mounted in app/layout.tsx
// so the banner appears on every page (student, tutor, public) — not only /admin.

export default function AdminOverview() {
  // MODERATION is the landing tab (2026-08-03, user's call): reviewing expert
  // applications is the one job on this panel that someone is WAITING on — an
  // unopened queue costs an applicant days. „მიმოხილვა“ is a dashboard you read
  // when you choose to; it is one click away and still the first nav item.
  const [active, setActive] = useState<AdminTab>('moderation')
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  // People waiting for a reply from the help chat. It gets a nav badge for the
  // same reason the application queue does: it is a person, not a number, and
  // until now the only way to discover one was to open the tab and scroll past
  // four stat tiles.
  const [helpOpen, setHelpOpen] = useState<number | null>(null)
  // Bump this to force <OverviewSection> KPI re-fetch after a moderation
  // decision (approve/reject changes counts).
  const [statsTick, setStatsTick] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyHash = () => {
      const h = window.location.hash.replace('#', '') as AdminTab
      if (VALID_TABS.includes(h)) setActive(h)
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  const loadPending = async () => {
    try {
      // The applications list is cursor-paginated now, so its length is a page
      // size, not the backlog — the stats endpoint carries the real count.
      const r = await fetch('/api/admin/stats', { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      if (typeof d?.pendingApps === 'number') setPendingCount(d.pendingApps)
      if (typeof d?.helpOpen === 'number') setHelpOpen(d.helpOpen)
    } catch {}
  }
  useEffect(() => { loadPending() }, [statsTick])

  const setActiveWithHash = (id: AdminTab) => {
    setActive(id)
    if (typeof window !== 'undefined') window.location.hash = id
  }

  return (
    <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen lg:flex lg:items-start">
      <AdminSidebar active={active} onNav={setActiveWithHash} pendingCount={pendingCount} helpOpen={helpOpen} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
      <TopBar active={active} onNav={setActiveWithHash} pendingCount={pendingCount} helpOpen={helpOpen} />

      {/* NB: the `key` used to be `active + ':' + statsTick` so that a moderation
          decision would remount the overview KPIs. But `statsTick` also
          bumped while the moderation section was still mounted, destroying
          the success-flash local state. Key on `active` only; parent-level
          `loadPending` still refreshes the nav badge, and OverviewSection
          re-fetches its own KPIs whenever it mounts. */}
      <main key={active}>
        {active === 'overview' && <OverviewSection />}
        {active === 'moderation' && <ModerationSection onDecision={() => setStatsTick(t => t + 1)} />}
        {active === 'users' && <UsersSection />}
        {active === 'bookings' && <BookingsSection />}
        {active === 'reviews' && <ReviewsSection />}
        {active === 'disputes' && <DisputesSection />}
        {active === 'finance' && <FinanceSection />}
        {active === 'analytics' && <AnalyticsSection />}
        {active === 'insights' && <InsightsSection />}
        {active === 'help' && <HelpSection />}
        {active === 'broadcast' && <BroadcastSection />}
        {active === 'categories' && <CategoriesSection />}
        {active === 'blog' && <BlogSection />}
        {active === 'texts' && <SiteTextsSection />}
        {active === 'integrations' && <IntegrationsSection />}
        {active === 'audit' && <AuditSection />}
        {active === 'system' && <SystemSection />}
      </main>
      </div>
    </div>
  )
}


