'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { safeHttpUrl as safeDocHref } from '@/lib/safeUrl'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { signOut } from '@/lib/signout'
import { broadcastSessionChange } from '@/lib/sessionSignal'
import { fmtKaDate, KA_MONTHS_LONG as KA_MONTHS } from '@/lib/kaDate'
import { AdminConfirmDialog, TabHeader } from './_parts'
import { BlogSection } from './_blog'
import { SiteTextsSection } from './_texts'
import { IntegrationsSection } from './_integrations'
import { MiniChart } from './_charts'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'

// Tutor-supplied URLs (ID/selfie/certificate scans, LinkedIn, website) are
// rendered as clickable links in the moderation panel. React does NOT block
// `javascript:`/`data:text/html` schemes in an href, so a crafted URL would
// execute on an admin's click. `safeDocHref` (= shared `safeHttpUrl`, imported
// at the top) yields `undefined` for any unsafe scheme so the anchor is
// non-navigable rather than an interpreted payload.


const Logo = () => (
  <Link href="/" className="inline-flex items-center gap-2.5" aria-label="მცოდნე admin">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
    <span className="inline-flex items-center h-5 px-1.5 rounded-pill bg-ink-900 text-white font-display text-[9.5px] font-bold uppercase tracking-[0.18em]">admin</span>
  </Link>
)

/* ───── Admin shell — sidebar + top bar ───── */
type AdminTab = 'overview' | 'moderation' | 'users' | 'bookings' | 'reviews' | 'disputes' | 'finance' | 'analytics' | 'broadcast' | 'categories' | 'blog' | 'texts' | 'integrations' | 'audit'

// Single nav source for the desktop sidebar AND the mobile drawer.
const ADMIN_NAV: { id: AdminTab; l: string }[] = [
  { id: 'overview',   l: 'მიმოხილვა' },
  { id: 'moderation', l: 'მოდერაცია' },
  { id: 'users',      l: 'მომხმარებლები' },
  { id: 'bookings',   l: 'ჯავშნები' },
  { id: 'reviews',    l: 'შეფასებები' },
  { id: 'disputes',   l: 'დავები' },
  { id: 'finance',    l: 'ფინანსები' },
  { id: 'analytics',  l: 'ანალიტიკა' },
  { id: 'broadcast',  l: 'მასობრივი შეტყობინება' },
  { id: 'categories', l: 'კატეგორიები' },
  { id: 'blog',       l: 'ბლოგი' },
  { id: 'texts',      l: 'ტექსტები' },
  { id: 'integrations', l: 'ინტეგრაციები' },
  { id: 'audit',      l: 'აუდიტი' },
]

/* Desktop-only left rail — moves the 11-item nav out of the cramped top header
   into a calm sidebar, so managing/moderating is comfortable (mobile keeps the
   TopBar drawer). */
const AdminSidebar = ({ active, onNav, pendingCount }: { active: AdminTab; onNav: (t: AdminTab) => void; pendingCount?: number | null }) => (
  <aside className="hidden lg:flex flex-col w-[220px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-ink-100 bg-white px-3 py-5">
    <div className="px-3">
      <Logo />
    </div>
    <nav aria-label="ადმინ ნავიგაცია" className="mt-6 flex flex-col gap-0.5">
      {ADMIN_NAV.map(it => {
        const on = active === it.id
        const badge = it.id === 'moderation' ? (pendingCount ?? 0) : 0
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onNav(it.id)}
            aria-current={on ? 'page' : undefined}
            className={`h-10 px-3 rounded-btn inline-flex items-center gap-2.5 font-display text-[13px] font-semibold transition-colors duration-fast ${
              on ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100/70 hover:text-ink-900'
            }`}
          >
            <span className="flex-1 text-left truncate">{it.l}</span>
            {badge > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 rounded-pill inline-flex items-center justify-center text-[10.5px] font-bold tabular-nums ${on ? 'bg-white text-ink-900' : 'bg-brand-500 text-white'}`}>{badge}</span>
            )}
          </button>
        )
      })}
    </nav>
    <div className="flex-1" />
    <button
      type="button"
      onClick={() => signOut()}
      className="mt-4 h-10 px-3 rounded-btn inline-flex items-center gap-2.5 font-display text-[13px] font-semibold text-ink-600 hover:text-danger-700 hover:bg-danger-50 transition-colors"
    >
      <Icon.logout className="w-4 h-4" /> გამოსვლა
    </button>
  </aside>
)

const TopBar = ({ active, onNav, pendingCount }: { active: AdminTab; onNav: (t: AdminTab) => void; pendingCount?: number | null }) => {
  const [mobOpen, setMobOpen] = useState(false)
  const NAV: { id: AdminTab; l: string; badge?: number | null; urgent?: boolean }[] = [
    { id: 'overview',    l: 'მიმოხილვა' },
    { id: 'moderation',  l: 'მოდერაცია', badge: pendingCount ?? undefined },
    { id: 'users',       l: 'მომხმარებლები' },
    { id: 'bookings',    l: 'ჯავშნები' },
    { id: 'reviews',     l: 'შეფასებები' },
    { id: 'disputes',    l: 'დავები' },
    { id: 'finance',     l: 'ფინანსები' },
    { id: 'analytics',   l: 'ანალიტიკა' },
    { id: 'broadcast',   l: 'მასობრივი შეტყობინება' },
    { id: 'categories',  l: 'კატეგორიები' },
    { id: 'blog',        l: 'ბლოგი' },
    { id: 'texts',       l: 'ტექსტები' },
    { id: 'integrations', l: 'ინტეგრაციები' },
    { id: 'audit',       l: 'აუდიტი' },
  ]
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
        className="hidden md:inline-flex h-9 px-3 rounded-btn text-ink-600 hover:text-danger-700 hover:bg-danger-50 font-display text-[12.5px] font-semibold items-center gap-1.5 transition-colors"
      >
        გამოსვლა
      </button>
      <button type="button" onClick={() => setMobOpen(o => !o)} aria-label="მენიუ" aria-expanded={mobOpen} className="lg:hidden w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-900 hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center transition-colors">
        {mobOpen ? <Icon.x className="w-5 h-5" /> : <Icon.menu className="w-5 h-5" />}
      </button>
    </div>
    {mobOpen && (
      <>
        <button type="button" aria-label="დახურვა" onClick={() => setMobOpen(false)} className="lg:hidden fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-sm" />
        <aside className="lg:hidden fixed top-0 right-0 bottom-0 z-[51] w-[300px] max-w-[85vw] bg-white shadow-float flex flex-col">
          <div className="h-16 px-5 flex items-center justify-between border-b border-ink-200 shrink-0">
            <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.22em] text-ink-500">მენიუ</span>
            <button type="button" onClick={() => setMobOpen(false)} aria-label="დახურვა" className="w-10 h-10 rounded-btn text-ink-700 hover:bg-ink-100 inline-flex items-center justify-center transition-colors">
              <Icon.xC className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-5 py-2 flex flex-col">
          {NAV.map(it => {
            const on = active === it.id
            return (
              <button key={it.id} type="button" onClick={() => { onNav(it.id); setMobOpen(false) }} className={`h-12 flex items-center justify-between text-[15px] font-display font-medium border-b border-ink-100 last:border-b-0 text-left ${on ? 'text-ink-900' : 'text-ink-700'}`}>
                <span>{it.l}</span>
                {it.badge ? <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-[11px] font-display font-bold tabular-nums ${it.urgent ? 'bg-danger-500 text-white' : 'bg-ink-200 text-ink-800'}`}>{it.badge}</span> : null}
              </button>
            )
          })}
          </nav>
          <div className="p-5 border-t border-ink-100">
            <button
              type="button"
              onClick={() => { setMobOpen(false); signOut() }}
              className="w-full h-11 px-3 rounded-btn text-danger-700 hover:bg-danger-50 font-display font-semibold text-[13px] inline-flex items-center justify-center transition-colors border border-danger-200"
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
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-900 mb-1.5 min-h-[16px]" suppressHydrationWarning>
            ადმინ პანელი{today ? ` · ${today}` : ''}
          </div>
          <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.08]">
            მიმოხილვა
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-600 max-w-[600px] leading-[1.55]">
            პლატფორმის ცოცხალი ინდიკატორები. მოდერაცია, მომხმარებლები, ფინანსები და ანალიტიკა.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => { window.location.hash = 'analytics' }} className="h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors">
            <Icon.doc className="w-3.5 h-3.5" /> ანალიტიკა
          </button>
          <button type="button" onClick={() => { window.location.hash = 'moderation' }} className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-2 transition-colors">
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
  { cat: 'რიგი', label: 'მოლოდინში (განცხადება)' },
  { cat: 'აქტიური', label: 'მომხმარებელი / ექსპერტი' },
]

const StatCard = ({ s, idx }: { s: Stat; idx: number }) => (
  <div className="relative p-5 rounded-card bg-white border border-ink-200 hover:border-ink-300 transition-colors">
    <div className="flex items-baseline justify-between gap-2">
      <Eyebrow as="span" tone="muted" aria-hidden className="tabular-nums">№ {String(idx + 1).padStart(2, '0')}</Eyebrow>
      <Eyebrow as="span" tone="muted" className="truncate">{s.cat}</Eyebrow>
    </div>
    <Eyebrow tone="muted" className="mt-4">{s.label}</Eyebrow>
    <div className="mt-1 font-display text-[30px] font-bold text-ink-900 tracking-tight tabular-nums leading-none">{s.value}</div>
    <div className="mt-4 pt-3 border-t border-ink-100 text-[11.5px] text-ink-600 leading-snug">{s.sub}</div>
  </div>
)

const Stats = () => {
  const PLACEHOLDER: Stat[] = STAT_DEFS.map(s => ({ ...s, value: '—', sub: <span className="text-ink-400">—</span> }))
  const [live, setLive] = useState<Stat[] | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/stats')
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d || cancelled) return
        setLive([
          { ...STAT_DEFS[0], value: (d.bookings ?? 0).toLocaleString('ka-GE'), sub: <span><span className="font-semibold text-success-700">{d.completed ?? 0}</span> დასრულებული · {d.live ?? 0} ცოცხალი</span> },
          { ...STAT_DEFS[1], value: `₾${(d.revenue ?? 0).toLocaleString('ka-GE')}`, sub: <span>კომისია ≈ ₾{Math.round((d.revenue ?? 0) * 0.15).toLocaleString('ka-GE')}</span> },
          { ...STAT_DEFS[2], value: String(d.pendingApps ?? 0), sub: <span>ექსპერტთა განცხადება მოდერაციისთვის</span> },
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
  useEffect(() => { fetch('/api/admin/analytics/series').then(r => r.ok ? r.json() : null).then(setS).catch(() => {}) }, [])
  if (!s) return null
  return (
    <section className="px-6 lg:px-8 mt-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10.5px] font-bold text-ink-500 uppercase tracking-[0.16em] shrink-0">ბოლო 30 დღე</span>
        <a href="#analytics" className="text-[11.5px] font-semibold text-brand-700 hover:underline shrink-0">სრული ანალიტიკა →</a>
        <div className="flex-1 h-px bg-ink-100" />
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <MiniChart title="ახალი ანგარიშები" data={s.signups} labels={s.days} kind="area" color="#2F9C86" />
        <MiniChart title="ჯავშნები" data={s.bookings} labels={s.days} kind="area" color="#1c1a17" />
        <MiniChart title="შემოსავალი" data={s.revenue} labels={s.days} kind="bar" color="#2F9C86" format={(n) => `₾${n}`} />
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
          <h3 className="font-display text-[18px] font-bold text-ink-900">ექსპერტის განცხადებები</h3>
          <p className="text-[13px] text-ink-500 mt-1">დაამტკიცე, უარყავი და მართე ახალი ექსპერტის მოთხოვნები.</p>
        </div>
        <a href="#moderation" className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-2">
          მოდერაცია
        </a>
      </div>
    </section>
  </>
)

/* ───── Shared SectionHeader (for non-overview tabs) ───── */
/* ───── Section: Moderation (tutor applications queue) ───── */
type AppRow = {
  id: string; name: string; cat: string; yrs: number; rate: number;
  city: string; sla: string; urgent?: boolean; motivation?: string; email?: string;
  phone?: string; linkedinUrl?: string | null; websiteUrl?: string | null;
  introVideoUrl?: string | null; introVideoId?: string | null;
  professionData?: Record<string, any> | null;
  idDocUrl?: string | null; selfieUrl?: string | null;
  certificates?: { title: string; url: string }[] | null;
  createdAt?: string
}

const ModerationSection = ({ onDecision }: { onDecision?: () => void }) => {
  const [APPS, setAPPS] = useState<AppRow[]>([])
  const [sel, setSel] = useState<string | null>(null)
  // Verification-doc blobs (idDoc/selfie/certs) are excluded from the list
  // payload and lazy-loaded for the selected application only (see effect below).
  const [activeDocs, setActiveDocs] = useState<{ idDocUrl?: string | null; selfieUrl?: string | null; certificates?: { title: string; url: string }[] | null } | null>(null)
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

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/applications')
      if (!res.ok) throw new Error('fetch failed')
      const data: any[] = await res.json()
      const submitted = Array.isArray(data) ? data.filter(a => a.status === 'SUBMITTED') : []
      const mapped: AppRow[] = submitted.map((a: any) => ({
        id: a.id, name: a.fullName, cat: a.specialty, yrs: a.yearsExp, rate: a.hourlyRate,
        city: a.city ?? '—',
        sla: fmtKaDate(new Date(a.createdAt), { year: true }),
        urgent: (Date.now() - new Date(a.createdAt).getTime()) > 24 * 3600 * 1000,
        motivation: a.motivation, email: a.user?.email,
        phone: a.phone, linkedinUrl: a.linkedinUrl, websiteUrl: a.websiteUrl,
        introVideoUrl: a.introVideoUrl, introVideoId: a.introVideoId,
        professionData: a.professionData, createdAt: a.createdAt,
        idDocUrl: a.idDocUrl, selfieUrl: a.selfieUrl,
        certificates: Array.isArray(a.certificates) ? a.certificates : null,
      }))
      setAPPS(mapped)
      setSel(mapped[0]?.id ?? null)
      // Reset the bulk-selection set on every refetch — stale IDs (already
      // approved/rejected in this pass) must not linger checked.
      setChecked(new Set())
    } catch {
      setFlash({ kind: 'error', msg: 'განაცხადების ჩატვირთვა ვერ მოხერხდა.' })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

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

  const bulkDecide = async (action: 'approve' | 'reject', reason?: string) => {
    if (busy || checked.size === 0) return
    const ids = Array.from(checked)
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
          body: JSON.stringify({ action, note: reason?.trim() || undefined }),
        })
        const data = await res.json().catch(() => ({} as any))
        if (res.ok && data?.ok !== false) ok++; else fail++
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

  const decide = async (action: 'approve' | 'reject', reasonArg?: string) => {
    if (busy || !sel) return
    setBusy(true)
    setFlash(null)
    try {
      // Reject carries the dialog's required reason as the moderator note;
      // approve keeps using the optional inline textarea.
      const noteToSend = action === 'reject' ? reasonArg?.trim() : note.trim()
      const res = await fetch(`/api/applications/${sel}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: noteToSend || undefined }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setFlash({ kind: 'error', msg: 'ოპერაცია ვერ შესრულდა.' })
        return
      }
      setFlash({ kind: 'success', msg: action === 'approve' ? 'განაცხადი დამტკიცდა.' : 'განაცხადი უარყოფილია.' })
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
  // Lazy-load the selected application's verification documents (kept out of the
  // list payload so the panel isn't several MB of base64 doc scans).
  useEffect(() => {
    if (!sel) { setActiveDocs(null); return }
    let cancelled = false
    setActiveDocs(null)
    fetch(`/api/admin/applications/${sel}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setActiveDocs({ idDocUrl: d.idDocUrl, selfieUrl: d.selfieUrl, certificates: Array.isArray(d.certificates) ? d.certificates : null }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [sel])
  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · ექსპერტის განცხადებები"
        title={<>{APPS.length} განცხადება მოლოდინში</>}
        sub="ხელით განცხადებები: შეამოწმე კვალიფიკაცია, გამოცდილება და მოტივაცია. მიზანი — 24 საათში."
        actions={null}
      />
      {flash && (
        <div className="px-6 lg:px-8">
          <div role="alert" className={`rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        </div>
      )}
      <section className="px-6 lg:px-8 py-6 grid lg:grid-cols-[360px_1fr] gap-5">
        {/* Queue */}
        <aside className="rounded-card border border-ink-200 bg-white overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
            <Eyebrow tone="muted">რიგი · {APPS.length}</Eyebrow>
            <button type="button" onClick={load} disabled={loading} className="font-display text-[11.5px] font-semibold text-brand-700 disabled:text-ink-400">განახლება</button>
          </div>
          {/* Bulk-action bar — hidden when the queue is empty so we don't
              show a checkbox with nothing to check. */}
          {APPS.length > 0 && (
            <div className="px-4 py-2.5 border-b border-ink-100 bg-ink-50/40">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked.size === APPS.length && APPS.length > 0}
                  onChange={toggleAll}
                  className="w-5 h-5 rounded border-ink-300 text-ink-900 focus:ring-brand-500"
                />
                <span className="font-display text-[11.5px] font-semibold text-ink-700">
                  ყველას მონიშვნა{checked.size > 0 ? ` · ${checked.size} მონიშნული` : ''}
                </span>
              </label>
              {checked.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => bulkDecide('approve')}
                    disabled={busy}
                    className="h-8 px-2.5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 text-white font-display font-semibold text-[11.5px] inline-flex items-center gap-1"
                  >
                    <Icon.check className="w-3 h-3" /> მასობრივი დამტკიცება
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendReject('bulk')}
                    disabled={busy}
                    className="h-8 px-2.5 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 disabled:opacity-50 text-danger-700 font-display font-semibold text-[11.5px] inline-flex items-center gap-1"
                  >
                    <Icon.x className="w-3 h-3" /> მასობრივი უარყოფა
                  </button>
                </div>
              )}
              {bulkProgress && (
                <div className="mt-2 font-mono text-[11px] tabular-nums text-ink-600">
                  {bulkProgress.done}/{bulkProgress.total} დამუშავებულია
                </div>
              )}
            </div>
          )}
          {loading ? (
            <div className="px-4 py-10 text-center text-[12px] text-ink-500">იტვირთება…</div>
          ) : APPS.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ink-100 text-ink-500 mb-2"><Icon.check className="w-5 h-5" /></div>
              <div className="font-display text-[13px] font-bold text-ink-900">რიგი ცარიელია</div>
              <div className="text-[11.5px] text-ink-500 mt-1">არცერთი განაცხადი მოლოდინში არ არის.</div>
            </div>
          ) : APPS.map(a => (
            <div key={a.id} className={`flex items-start gap-2 px-4 py-3 border-b border-ink-100 last:border-b-0 hover:bg-ink-50/60 transition-colors ${sel === a.id ? 'bg-brand-50/40' : ''}`}>
              {/* Checkbox is a sibling of the "select this row" button so
                  toggling doesn't also change which application is open. */}
              <input
                type="checkbox"
                aria-label={`მონიშვნა: ${a.name}`}
                checked={checked.has(a.id)}
                onChange={() => toggleCheck(a.id)}
                className="mt-1 w-5 h-5 rounded border-ink-300 text-ink-900 focus:ring-brand-500 shrink-0"
              />
              <button type="button" onClick={() => setSel(a.id)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-[13px] font-semibold text-ink-900 truncate">{a.name}</div>
                    <div className="font-mono text-[10.5px] tabular-nums text-ink-400 mt-0.5">{a.id.slice(0, 8)} · {a.cat}</div>
                  </div>
                  {a.urgent && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-danger-50 border border-danger-200 text-danger-700 font-display text-[9.5px] font-bold uppercase tracking-[0.14em]"><Icon.clock className="w-3 h-3" /> SLA</span>}
                </div>
                <div className="mt-1.5 font-mono text-[10.5px] tabular-nums text-ink-500">{a.yrs} წ. გამოცდილება · ₾{a.rate}/სთ · {a.city} · {a.sla}</div>
              </button>
            </div>
          ))}
        </aside>

        {/* Active application */}
        <div className="space-y-4 min-w-0">
          {!active ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-white p-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ink-100 text-ink-500 mb-3"><Icon.chat className="w-6 h-6" /></div>
              <div className="font-display text-[15px] font-bold text-ink-900">აირჩიე განაცხადი</div>
              <div className="text-[12.5px] text-ink-500 mt-1">მარცხნიდან — რიგში მოცემული ერთ-ერთი.</div>
            </div>
          ) : (
          <div className="rounded-card border border-ink-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center font-display font-bold text-[18px] ring-1 ring-ink-200">
                  {active.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-[18px] font-bold text-ink-900 truncate">{active.name}</h2>
                  <div className="font-mono text-[11px] tabular-nums text-ink-500">{active.cat} · {active.yrs} წ. · ₾{active.rate}/სთ · {active.city}</div>
                  {active.email && <div className="text-[11.5px] text-ink-600 mt-0.5">{active.email}</div>}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 font-display text-[10px] font-bold uppercase tracking-[0.14em]"><Icon.clock className="w-3 h-3" /> {active.sla}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {active.phone && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">ტელეფონი</div>
                  <a href={`tel:${active.phone}`} className="mt-1 block font-display text-[13px] font-bold text-ink-900 tabular-nums hover:text-brand-700">{active.phone}</a>
                </div>
              )}
              {active.linkedinUrl && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">LinkedIn</div>
                  <a href={safeDocHref(active.linkedinUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 block font-display text-[12.5px] font-semibold text-brand-700 hover:text-brand-800 truncate">{active.linkedinUrl}</a>
                </div>
              )}
              {active.websiteUrl && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">ვებ-გვერდი</div>
                  <a href={safeDocHref(active.websiteUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 block font-display text-[12.5px] font-semibold text-brand-700 hover:text-brand-800 truncate">{active.websiteUrl}</a>
                </div>
              )}
              {active.createdAt && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">გაგზავნის დრო</div>
                  <div className="mt-1 font-mono text-[12px] tabular-nums text-ink-900">{fmtDT(active.createdAt)}</div>
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
                  <span className="absolute inset-0 flex items-center justify-center bg-ink-900/20 group-hover:bg-ink-900/40 transition-colors">
                    <span className="w-14 h-14 rounded-full bg-white/95 shadow-float inline-flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-brand-700 ml-1">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-white/95 backdrop-blur text-[10px] font-display font-bold uppercase tracking-[0.14em] text-ink-800">
                    YouTube
                  </span>
                </a>
              </div>
            )}

            <div className="rounded-card border border-ink-100 bg-ink-50/40 p-4 mb-4">
              <Eyebrow tone="muted" className="mb-2">მოტივაცია</Eyebrow>
              <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-wrap">{active.motivation ?? '—'}</p>
            </div>

            {/* Verification documents — ID front, selfie, certificate scans.
                Lazy-loaded per selected application (activeDocs), NOT carried in
                the list payload. */}
            {(activeDocs?.idDocUrl || activeDocs?.selfieUrl || (activeDocs?.certificates?.length ?? 0) > 0) && (
              <div className="rounded-card border border-ink-100 bg-white p-4 mb-4">
                <Eyebrow tone="muted" className="mb-2">დოკუმენტები</Eyebrow>
                <div className="flex flex-wrap gap-3">
                  {activeDocs?.idDocUrl && (
                    <a href={safeDocHref(activeDocs.idDocUrl)} target="_blank" rel="noopener noreferrer" className="block">
                      {/^data:image\/|\.(png|jpe?g|webp|gif)(\?|$)/i.test(activeDocs.idDocUrl)
                        ? <img src={activeDocs.idDocUrl} alt="პირადობა" className="w-24 h-24 rounded-btn object-cover ring-1 ring-ink-200" />
                        : <span className="w-24 h-24 rounded-btn bg-ink-50 border border-ink-200 text-ink-700 font-display text-[10px] font-bold inline-flex items-center justify-center">PDF</span>}
                      <span className="block mt-1 text-[10.5px] text-ink-500 text-center">პირადობა</span>
                    </a>
                  )}
                  {activeDocs?.selfieUrl && (
                    <a href={safeDocHref(activeDocs.selfieUrl)} target="_blank" rel="noopener noreferrer" className="block">
                      {/^data:image\/|\.(png|jpe?g|webp|gif)(\?|$)/i.test(activeDocs.selfieUrl)
                        ? <img src={activeDocs.selfieUrl} alt="სელფი" className="w-24 h-24 rounded-btn object-cover ring-1 ring-ink-200" />
                        : <span className="w-24 h-24 rounded-btn bg-ink-50 border border-ink-200 text-ink-700 font-display text-[10px] font-bold inline-flex items-center justify-center">PDF</span>}
                      <span className="block mt-1 text-[10.5px] text-ink-500 text-center">სელფი</span>
                    </a>
                  )}
                  {activeDocs?.certificates?.map((c, i) => (
                    <a key={i} href={safeDocHref(c.url)} target="_blank" rel="noopener noreferrer" className="block">
                      {/^data:image\/|\.(png|jpe?g|webp|gif)(\?|$)/i.test(c.url)
                        ? <img src={c.url} alt={c.title} className="w-24 h-24 rounded-btn object-cover ring-1 ring-ink-200" />
                        : <span className="w-24 h-24 rounded-btn bg-ink-50 border border-ink-200 text-ink-700 font-display text-[10px] font-bold inline-flex items-center justify-center">PDF</span>}
                      <span className="block mt-1 text-[10.5px] text-ink-500 text-center truncate max-w-[96px]">{c.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {active.professionData && Object.keys(active.professionData).length > 0 && (
              <div className="rounded-card border border-ink-100 bg-white p-4 mb-4">
                <Eyebrow tone="muted" className="mb-2">დამატებითი მონაცემები</Eyebrow>
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
                  {Object.entries(active.professionData).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt className="text-ink-500 font-display font-medium capitalize">{k}</dt>
                      <dd className="font-mono tabular-nums text-ink-900 truncate">{String(v)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            )}
            <div className="mb-3">
              <Eyebrow as="label" tone="muted" className="block mb-1.5">მოდერატორის ჩანაწერი (სურვ.)</Eyebrow>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="მიზეზი / კომენტარი — შენახვისთვის"
                className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-400 focus:outline-none resize-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => decide('approve')} disabled={busy} className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5"><Icon.check className="w-3.5 h-3.5" /> {busy ? 'იგზავნება…' : 'დაამტკიცე'}</button>
              <button type="button" onClick={() => setPendReject('single')} disabled={busy} className="h-11 px-4 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 disabled:opacity-50 text-danger-700 font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5"><Icon.x className="w-3.5 h-3.5" /> უარყავი</button>
            </div>
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
}

const KA_STATUS: Record<string, string> = {
  PREPARING: 'მოსამზადებელი', CONFIRMED: 'დადასტურდა', LIVE: 'ცოცხალი',
  COMPLETED: 'დასრულდა', CANCELED: 'გაუქმდა', NO_SHOW: 'გამოუცხადებლობა',
}
const KA_MO_SHORT = ['იან.','თებ.','მარ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექ.','ოქტ.','ნოე.','დეკ.']
const fmtShort = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return `${d.getDate()} ${KA_MO_SHORT[d.getMonth()]} ${d.getFullYear()}`
}
const fmtDT = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${KA_MO_SHORT[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const UserDetailModal = ({ userId, onClose, onImpersonate }: { userId: string | null; onClose: () => void; onImpersonate: (userId: string, fullName: string) => void }) => {
  const [data, setData] = useState<UserDetail | null>(null)
  const [tab, setTab] = useState<'profile' | 'bookings' | 'reviews' | 'activity'>('profile')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Suspend/unsuspend flow — confirm dialog with a required reason on suspend.
  const [pendSuspend, setPendSuspend] = useState(false)
  const [suspBusy, setSuspBusy] = useState(false)
  const [roleBusy, setRoleBusy] = useState(false)

  useEffect(() => {
    if (!userId) { setData(null); setErr(null); setTab('profile'); return }
    let cancelled = false
    setLoading(true); setErr(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}`)
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
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [userId, onClose])

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
  // never the last admin); here we just reflect the returned role.
  const doRoleChange = async (action: 'makeAdmin' | 'revokeAdmin') => {
    if (!u || roleBusy) return
    setRoleBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { setErr(j?.message ?? 'ოპერაცია ვერ შესრულდა'); return }
      setData(prev => prev ? { ...prev, user: { ...prev.user, role: j.user?.role ?? prev.user.role } } : prev)
    } catch {
      setErr('ქსელის შეცდომა')
    } finally {
      setRoleBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-6">
      <button type="button" aria-label="დახურვა" onClick={onClose} className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" className="relative w-full sm:max-w-[880px] max-h-[95vh] bg-white sm:rounded-card shadow-float overflow-hidden flex flex-col motion-safe:animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-ink-200 flex items-start justify-between gap-4 shrink-0">
          {loading || !u ? (
            <div className="text-[13px] text-ink-500">იტვირთება…</div>
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              <img src={u.avatarUrl || DEFAULT_AVATAR} alt={u.fullName} className="w-12 h-12 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-display text-[17px] font-bold text-ink-900 truncate">{u.fullName}</div>
                  <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
                    u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                    : u.role === 'TUTOR' ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'bg-ink-50 border-ink-200 text-ink-600'
                  }`}>{u.role === 'STUDENT' ? 'კლიენტი' : u.role === 'TUTOR' ? 'ექსპერტი' : 'ადმინი'}</span>
                  {u.emailVerified && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-success-50 border border-success-200 text-success-700 font-display text-[10px] font-bold uppercase tracking-[0.14em]"><Icon.check className="w-3 h-3" /> ვერიფ.</span>}
                  {u.suspendedAt && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-danger-50 border border-danger-200 text-danger-700 font-display text-[10px] font-bold uppercase tracking-[0.14em]"><Icon.pause className="w-3 h-3" /> შეჩერებული</span>}
                </div>
                <div className="text-[12px] text-ink-500 font-mono truncate mt-0.5">{u.email}</div>
              </div>
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="დახურვა" className="w-9 h-9 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center shrink-0">
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
                className={`shrink-0 inline-flex items-center h-10 px-3 font-display text-[12.5px] font-semibold tracking-tight border-b-2 transition-colors ${
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
          {err && <div className="m-6 p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
          {u && data && (
            <>
              {tab === 'profile' && (
                <div className="px-6 py-5 space-y-5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Stat label="რეგისტრაცია" value={fmtShort(u.createdAt)} />
                    <Stat label="ტელეფონი" value={u.phone ?? '—'} />
                    <Stat label="მიმოწერები" value={String(u._count.sentMessages)} />
                    <Stat label="ჯავშნები (კლიენტი)" value={String(u._count.bookingsAsStudent)} />
                    <Stat label="დაწერილი შეფასებები" value={String(u._count.reviewsGiven)} />
                    <Stat label="ფავორიტები" value={String(u._count.favorites)} />
                  </div>
                  {u.bio && (
                    <div>
                      <Eyebrow tone="muted" className="mb-2">ბიო</Eyebrow>
                      <p className="text-[13.5px] text-ink-700 whitespace-pre-wrap leading-[1.55]">{u.bio}</p>
                    </div>
                  )}
                  {isTutor && u.tutor && (
                    <div className="rounded-card border border-brand-200 bg-brand-50/40 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                        <Eyebrow>ექსპერტის პროფილი</Eyebrow>
                        <div className="flex items-center gap-2">
                          <VerifiedToggle tutorId={u.tutor.id} initial={!!u.tutor.verified} />
                          <FeaturedToggle tutorId={u.tutor.id} initial={!!u.tutor.featured} />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
                        <div><span className="text-ink-500">კატეგორია:</span> <span className="font-display font-bold text-ink-900">{u.tutor.category?.name ?? '—'}</span></div>
                        <div><span className="text-ink-500">სპეც.:</span> <span className="font-display font-bold text-ink-900">{u.tutor.specialty}</span></div>
                        <div><span className="text-ink-500">ფასი:</span> <span className="font-display font-bold text-ink-900 tabular-nums">₾{u.tutor.price}</span></div>
                        <div><span className="text-ink-500">გამოცდილება:</span> <span className="font-display font-bold text-ink-900 tabular-nums">{u.tutor.yearsExp} წ.</span></div>
                        <div><span className="text-ink-500">რეიტინგი:</span> <span className="font-display font-bold text-ink-900 tabular-nums">{u.tutor.rating.toFixed(2)}</span> <span className="text-ink-500 tabular-nums">({u.tutor.reviewsCount})</span></div>
                        <div><span className="text-ink-500">სესიები:</span> <span className="font-display font-bold text-ink-900 tabular-nums">{u.tutor.sessionsCount}</span></div>
                        <div><span className="text-ink-500">ინტრო ვიდეო:</span> <span className="font-display font-bold text-ink-900">{u.tutor.videoUrl ? '✓ ატვირთული' : '—'}</span></div>
                      </div>
                      <div className="mt-3 text-[12.5px] text-ink-700"><span className="font-display font-semibold">სათაური:</span> {u.tutor.headline}</div>
                    </div>
                  )}
                </div>
              )}
              {tab === 'bookings' && (
                <div className="px-6 py-5 space-y-6">
                  {data.bookingsAsStudent.length > 0 && (
                    <div>
                      <Eyebrow tone="muted" className="mb-3">როგორც კლიენტი ({data.bookingsAsStudent.length})</Eyebrow>
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
                    <div className="text-center py-10 text-[13px] text-ink-500">ჯავშნები ჯერ არ არის.</div>
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
                    <div className="text-center py-10 text-[13px] text-ink-500">შეფასებები ჯერ არ არის.</div>
                  )}
                </div>
              )}
              {tab === 'activity' && (
                <div className="px-6 py-5">
                  {data.recentNotifications.length === 0 ? (
                    <div className="text-center py-10 text-[13px] text-ink-500">შეტყობინება ჯერ არ არის.</div>
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {data.recentNotifications.map((n: any) => (
                        <li key={n.id} className="py-2.5 flex items-start gap-3">
                          <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${n.readAt ? 'bg-ink-300' : 'bg-brand-500'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="font-display text-[13px] font-semibold text-ink-900 truncate">{n.title}</div>
                            {n.body && <div className="text-[12px] text-ink-600 mt-0.5 truncate">{n.body}</div>}
                            <div className="font-mono text-[10.5px] tabular-nums text-ink-400 mt-1">{fmtDT(n.createdAt)}</div>
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
            <div className="text-[11.5px] text-ink-500 font-mono">ID: {u.id}</div>
            <div className="flex items-center gap-2">
              {/* Grant / revoke ADMIN. Server refuses self-demote + last-admin. */}
              {u.role === 'ADMIN' ? (
                <button
                  type="button"
                  onClick={() => doRoleChange('revokeAdmin')}
                  disabled={roleBusy}
                  className="h-9 px-3 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 text-danger-700 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Icon.shield className="w-3.5 h-3.5" /> ადმინის მოხსნა
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => doRoleChange('makeAdmin')}
                  disabled={roleBusy}
                  className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Icon.shield className="w-3.5 h-3.5" /> ადმინად დანიშვნა
                </button>
              )}
              {u.role !== 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => setPendSuspend(true)}
                  disabled={suspBusy}
                  className={`h-9 px-3 rounded-btn font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                    u.suspendedAt
                      ? 'bg-white border border-success-200 hover:bg-success-50 text-success-700'
                      : 'bg-white border border-danger-200 hover:bg-danger-50 text-danger-700'
                  }`}
                >
                  <Icon.pause className="w-3.5 h-3.5" /> {u.suspendedAt ? 'შეჩერების მოხსნა' : 'შეჩერება'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onImpersonate(u.id, u.fullName)}
                className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 hover:text-ink-800 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors"
              >
                <Icon.external className="w-3.5 h-3.5" /> შესვლა როგორც
              </button>
              <button type="button" onClick={onClose} className="h-9 px-3 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12px] transition-colors">
                დახურვა
              </button>
            </div>
          </div>
        )}
      </div>
      {u && (
        <AdminConfirmDialog
          open={pendSuspend}
          title={u.suspendedAt ? 'შეჩერების მოხსნა' : 'ანგარიშის შეჩერება'}
          body={u.suspendedAt
            ? <>{u.fullName} კვლავ შეძლებს შესვლას.</>
            : <>{u.fullName} ვეღარ შევა ანგარიშზე, სანამ შეჩერება არ მოიხსნება.</>}
          tone={u.suspendedAt ? 'brand' : 'danger'}
          reason={u.suspendedAt ? 'optional' : 'required'}
          reasonLabel={u.suspendedAt ? 'მიზეზი (სურვ.)' : 'მიზეზი (სავალდებულო · ინახება აუდიტში)'}
          confirmLabel={u.suspendedAt ? 'მოხსენი' : 'შეაჩერე'}
          busy={suspBusy}
          onCancel={() => setPendSuspend(false)}
          onConfirm={doSuspendToggle}
        />
      )}
    </div>
  )
}

// The verified-badge toggle — the ONLY way an approved expert gets the public
// „ვერიფიცირებული" trust badge (approval seeds verified:false). Mirrors FeaturedToggle.
const VerifiedToggle = ({ tutorId, initial }: { tutorId: string; initial: boolean }) => {
  const [verified, setVerified] = useState(initial)
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    const next = !verified
    setVerified(next)
    try {
      const res = await fetch(`/api/admin/tutors/${tutorId}/verified`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: next }),
      })
      if (!res.ok) setVerified(!next)
    } catch { setVerified(!next) }
    finally { setBusy(false) }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-60 ${
        verified
          ? 'bg-brand-500 border-brand-500 text-white hover:bg-brand-600'
          : 'bg-white border-ink-300 text-ink-600 hover:border-brand-500 hover:text-brand-700'
      }`}
      title="ვერიფიცირებული ექსპერტი — გამოჩნდება ✓ ბეჯი ბარათსა და პროფილზე"
    >
      <Icon.shieldCheck className="w-3 h-3" /> ვერიფ.
    </button>
  )
}

const FeaturedToggle = ({ tutorId, initial }: { tutorId: string; initial: boolean }) => {
  const [featured, setFeatured] = useState(initial)
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    const next = !featured
    setFeatured(next)
    try {
      const res = await fetch(`/api/admin/tutors/${tutorId}/featured`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: next }),
      })
      if (!res.ok) setFeatured(!next)
    } catch { setFeatured(!next) }
    finally { setBusy(false) }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-60 ${
        featured
          ? 'bg-warning-500 border-warning-500 text-white hover:bg-warning-600'
          : 'bg-white border-ink-300 text-ink-600 hover:border-warning-500 hover:text-warning-700'
      }`}
      title="ჩართე რჩეული — გამოჩნდება მთავარი გვერდის hero-ში"
    >
      <Icon.star className="w-3 h-3" /> რჩეული
    </button>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-card border border-ink-200 bg-ink-50/40 p-3">
    <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">{label}</div>
    <div className="mt-1 font-display text-[15px] font-bold text-ink-900 tabular-nums truncate">{value}</div>
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
            <div className="font-display text-[13px] font-bold text-ink-900 truncate">{b.topic}</div>
            <div className="text-[11.5px] text-ink-500 truncate">{other?.fullName ?? '—'} · {fmtDT(start.toISOString())}</div>
          </div>
          <span className={`inline-flex items-center h-5 px-1.5 rounded-pill font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
            b.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border border-success-200'
            : b.status === 'CANCELED' || b.status === 'NO_SHOW' ? 'bg-ink-100 text-ink-600 border border-ink-200'
            : b.status === 'LIVE' ? 'bg-danger-50 text-danger-700 border border-danger-200'
            : 'bg-brand-50 text-brand-700 border border-brand-200'
          }`}>{KA_STATUS[b.status] ?? b.status}</span>
          <div className="font-display text-[12px] font-bold text-ink-900 tabular-nums shrink-0">₾{b.price}</div>
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
            <span className="font-display text-[12.5px] font-bold text-ink-900 truncate">{author?.fullName ?? '—'}</span>
            <span className="inline-flex items-center gap-0.5 text-warning-500">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon.star key={i} className={`w-3 h-3 ${i < r.rating ? '' : 'text-ink-200'}`} />
              ))}
            </span>
            <span className="ml-auto font-mono text-[10.5px] tabular-nums text-ink-400 shrink-0">{fmtShort(r.createdAt)}</span>
          </div>
          <p className="text-[12.5px] text-ink-700 leading-snug whitespace-pre-wrap">{r.body}</p>
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
        <button type="button" onClick={onMore} disabled={loading} className="h-10 px-5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-60 text-ink-700 font-display font-semibold text-[12.5px] transition-colors">
          {loading ? 'იტვირთება…' : 'მეტის ჩვენება'}
        </button>
      ) : (
        <span className="text-[12px] text-ink-400 tabular-nums">სულ {count} ჩანაწერი</span>
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

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true); setErr(null)
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set('q', q.trim())
        if (role !== 'all') params.set('role', role)
        const res = await fetch(`/api/admin/users?${params}`)
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
  }, [q, role])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (role !== 'all') params.set('role', role)
      params.set('cursor', nextCursor)
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setUsers(prev => [...(prev ?? []), ...(Array.isArray(data.items) ? data.items : [])])
      setNextCursor(data.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  const roleLabel = (r: string) => r === 'STUDENT' ? 'კლიენტი' : r === 'TUTOR' ? 'ექსპერტი' : 'ადმინი'

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
        title={<>{users ? `${users.length} ` : '—'} ანგარიში</>}
        sub="ძებნა და როლის ფილტრი — რეალურ დროში მუშავდება ბაზაზე. დააჭირე რიგს — სრული პროფილი."
        actions={users && users.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'email', 'fullName', 'role', 'emailVerified', 'bookingsAsStudent', 'createdAt'],
              ...users.map(u => [u.id, u.email, u.fullName, u.role, u.emailVerified ? 'yes' : 'no', u._count.bookingsAsStudent, u.createdAt]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV ექსპორტი
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="სახელი ან ელფოსტა…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200">
            {(['all','STUDENT','TUTOR','ADMIN'] as const).map(r => (
              <button key={r} type="button" onClick={() => setRole(r)} className={`h-8 px-3 rounded-pill font-display text-[11.5px] font-semibold tracking-wide transition-colors ${role === r ? 'bg-ink-900 text-white' : 'text-ink-600'}`}>{r === 'all' ? 'ყველა' : roleLabel(r)}</button>
            ))}
          </div>
          {loading && <span className="text-[11.5px] text-ink-500">იტვირთება…</span>}
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <div role="alert" className="mb-4 p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead className="bg-ink-50/40 border-b border-ink-100">
              <tr className="text-left">
                <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">მომხმარებელი</th>
                <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">როლი</th>
                <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">ვერიფიც.</th>
                <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">ჯავშნები</th>
                <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">რეგისტრ.</th>
                <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 text-right whitespace-nowrap">მოქმ.</th>
              </tr>
            </thead>
            <tbody>
              {/* Three visual states: null (initial, never fetched) → skeleton;
                  loaded + empty → empty message; loaded + rows → table.
                  Previously null and [] collapsed into the "empty" branch, so
                  users saw a flash of "no users found" for ~300ms on mount. */}
              {users === null ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-ink-500 text-[13px]">იტვირთება…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-ink-500 text-[13px]">მომხმარებელი ვერ მოიძებნა</td></tr>
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
                        <div className="font-display text-[13px] font-bold text-ink-900 truncate">{u.fullName}</div>
                        <div className="font-mono text-[10.5px] tabular-nums text-ink-500 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
                      u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                      : u.role === 'TUTOR' ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'bg-ink-50 border-ink-200 text-ink-600'
                    }`}>{roleLabel(u.role)}</span>
                  </td>
                  <td className="px-3 py-3">{u.emailVerified ? <span className="text-success-700"><Icon.check className="w-4 h-4 inline" /></span> : <span className="text-ink-400">—</span>}</td>
                  <td className="px-3 py-3"><div className="font-display text-[13px] font-bold text-ink-900 tabular-nums">{u._count.bookingsAsStudent}</div></td>
                  <td className="px-3 py-3"><div className="font-mono text-[11.5px] tabular-nums text-ink-500">{fmtKaDate(new Date(u.createdAt), { year: true })}</div></td>
                  <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenUserId(u.id)}
                      className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
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
              <div className="px-4 py-10 text-center text-ink-500 text-[13px]">იტვირთება…</div>
            ) : users.length === 0 ? (
              <div className="px-4 py-10 text-center text-ink-500 text-[13px]">მომხმარებელი ვერ მოიძებნა</div>
            ) : users.map(u => (
              <div key={u.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-center gap-3">
                  <img src={u.avatarUrl || DEFAULT_AVATAR} alt={u.fullName} className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display text-[13px] font-bold text-ink-900 truncate">{u.fullName}</span>
                      <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
                        u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                        : u.role === 'TUTOR' ? 'bg-brand-50 border-brand-200 text-brand-700'
                        : 'bg-ink-50 border-ink-200 text-ink-600'
                      }`}>{roleLabel(u.role)}</span>
                      {u.emailVerified && <span className="text-success-700"><Icon.check className="w-3.5 h-3.5 inline" /></span>}
                    </div>
                    <div className="font-mono text-[10.5px] tabular-nums text-ink-500 truncate mt-0.5">{u.email}</div>
                    <div className="font-mono text-[10.5px] tabular-nums text-ink-500 mt-0.5">
                      {u._count.bookingsAsStudent} ჯავშანი · {fmtKaDate(new Date(u.createdAt), { year: true })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenUserId(u.id)}
                    className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[11px] shrink-0 transition-colors"
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
      const res = await fetch(`/api/admin/bookings?${params}`)
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
      const res = await fetch(`/api/admin/bookings?${params}`)
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
        title={<>{items ? `${items.length} ` : '—'} ჯავშანი</>}
        sub="ყველა ჯავშნის ნახვა · გაუქმება კლიენტის/ექსპერტის სახელით · მიზეზი გამოჩნდება ორივე მხარისთვის."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadCsv(`bookings-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'ref', 'topic', 'status', 'startAt', 'durationMin', 'price', 'studentEmail', 'tutorEmail'],
              ...items.map(b => [b.id, b.ref, b.topic, b.status, b.startAt, b.durationMin, b.price, b.student?.email ?? '', b.tutor?.user.email ?? '']),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV ექსპორტი
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="თემა, ref, სახელი…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200 overflow-x-auto">
            {BOOKING_STATUS_TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setStatus(t.id)} className={`shrink-0 h-8 px-3 rounded-pill font-display text-[11.5px] font-semibold tracking-wide transition-colors ${status === t.id ? 'bg-ink-900 text-white' : 'text-ink-600'}`}>{t.label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <div role="alert" className="mb-4 p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[13px] min-w-[900px]">
              <thead className="bg-ink-50/40 border-b border-ink-100">
                <tr className="text-left">
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">ჯავშანი</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">კლიენტი</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">ექსპერტი</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">დრო</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">სტატუსი</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 text-right whitespace-nowrap">ფასი</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 text-right whitespace-nowrap">მოქმ.</th>
                </tr>
              </thead>
              <tbody>
                {items === null ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-ink-500 text-[13px]">იტვირთება…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-ink-500 text-[13px]">ჯავშანი ვერ მოიძებნა</td></tr>
                ) : items.map(b => (
                  <tr key={b.id} className="border-t border-ink-100 hover:bg-ink-50/40">
                    <td className="px-3 py-3">
                      <div className="font-display text-[13px] font-bold text-ink-900 truncate max-w-[280px]">{b.topic}</div>
                      <div className="font-mono text-[10.5px] tabular-nums text-ink-500 truncate">#{b.ref.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-display text-[12.5px] font-semibold text-ink-900 truncate max-w-[180px]">{b.student?.fullName ?? '—'}</div>
                      <div className="font-mono text-[10.5px] tabular-nums text-ink-500 truncate max-w-[180px]">{b.student?.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-display text-[12.5px] font-semibold text-ink-900 truncate max-w-[180px]">{b.tutor?.user.fullName ?? '—'}</div>
                      <div className="font-mono text-[10.5px] tabular-nums text-ink-500 truncate max-w-[180px]">{b.tutor?.user.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-[11.5px] tabular-nums text-ink-700 whitespace-nowrap">{fmtDT(b.startAt)}</div>
                      <div className="font-mono text-[10.5px] tabular-nums text-ink-500">{b.durationMin} წუთი</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center h-5 px-1.5 rounded-pill font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
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
                          className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-[11px] transition-colors"
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
              <div className="px-4 py-10 text-center text-ink-500 text-[13px]">იტვირთება…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-ink-500 text-[13px]">ჯავშანი ვერ მოიძებნა</div>
            ) : items.map(b => (
              <div key={b.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-[13px] font-bold text-ink-900 truncate">{b.topic}</div>
                    <div className="font-mono text-[10.5px] tabular-nums text-ink-500">#{b.ref.slice(0, 8)} · {fmtDT(b.startAt)} · {b.durationMin} წუთი</div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center h-5 px-1.5 rounded-pill font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
                    b.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border border-success-200'
                    : b.status === 'CANCELED' || b.status === 'NO_SHOW' ? 'bg-ink-100 text-ink-600 border border-ink-200'
                    : b.status === 'LIVE' ? 'bg-danger-50 text-danger-700 border border-danger-200'
                    : 'bg-brand-50 text-brand-700 border border-brand-200'
                  }`}>{KA_STATUS[b.status] ?? b.status}</span>
                </div>
                <div className="mt-1.5 text-[11.5px] text-ink-600 truncate">
                  <span className="font-display font-semibold">{b.student?.fullName ?? '—'}</span>
                  {' → '}
                  <span className="font-display font-semibold">{b.tutor?.user.fullName ?? '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-display text-[13px] font-bold text-ink-900 tabular-nums">₾{b.price}</span>
                  {(b.status === 'PREPARING' || b.status === 'CONFIRMED') && (
                    <button
                      type="button"
                      onClick={() => setPendCancel(b)}
                      disabled={busy === b.id}
                      className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-[11px] transition-colors"
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
  const [outcome, setOutcome] = useState<string>('PENDING')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  // Pending resolution → confirm dialog with REQUIRED comment.
  const [pend, setPend] = useState<{ d: AdminDispute; out: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REDO_FREE' | 'DISMISSED' } | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams()
      if (outcome !== 'ALL') params.set('outcome', outcome)
      const res = await fetch(`/api/admin/disputes?${params}`)
      if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); return }
      const rows = await res.json()
      setItems(Array.isArray(rows) ? rows : [])
    } catch { setErr('ქსელის შეცდომა') }
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
        title={<>{items ? `${items.length} ` : '—'} დავა</>}
        sub="კლიენტის ფორმალური საჩივრები — გახსენი, გადახედე, გადაწყვიტე (refund / redo / dismiss). გადაწყვეტა უცნობდება ორივე მხარეს."
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200 overflow-x-auto">
          {OUTCOME_TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setOutcome(t.id)} className={`shrink-0 h-8 px-3 rounded-pill font-display text-[11.5px] font-semibold tracking-wide transition-colors ${outcome === t.id ? 'bg-ink-900 text-white' : 'text-ink-600'}`}>{t.label}</button>
          ))}
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6 space-y-3">
        {err && <div role="alert" className="p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        {items === null ? (
          <div className="text-center py-10 text-[13px] text-ink-500">იტვირთება…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-[13px] text-ink-500">ამ ფილტრით დავა არ არის.</div>
        ) : items.map(d => (
          <article key={d.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
                    d.outcome === 'PENDING' ? 'bg-warning-50 border-warning-200 text-warning-700'
                    : d.outcome.startsWith('REFUND') ? 'bg-danger-50 border-danger-200 text-danger-700'
                    : d.outcome === 'REDO_FREE' ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'bg-ink-100 border-ink-200 text-ink-600'
                  }`}>{OUTCOME_LABEL[d.outcome] ?? d.outcome}</span>
                  <span className="font-display text-[12.5px] font-bold text-ink-900">{REASON_LABEL[d.reason] ?? d.reason}</span>
                  <span className="font-mono text-[10.5px] text-ink-400 tabular-nums">{fmtDT(d.createdAt)}</span>
                </div>
                <div className="text-[12px] text-ink-600 truncate">
                  <span className="font-display font-semibold">{d.booking.student.fullName}</span>
                  {' → '}
                  <span className="font-display font-semibold">{d.booking.tutor.user.fullName}</span>
                  {' · '}
                  <span className="text-ink-400">{d.booking.topic}</span>
                  {' · '}
                  <span className="tabular-nums">₾{d.booking.price}</span>
                </div>
                {d.details && <p className="mt-2 text-[13px] text-ink-700 leading-snug whitespace-pre-wrap">{d.details}</p>}
                {d.resolution && (
                  <div className="mt-2 p-2.5 rounded-btn bg-ink-50 border border-ink-100 text-[12px] text-ink-700"><span className="font-display font-semibold">გადაწყვეტა:</span> {d.resolution}</div>
                )}
              </div>
              {d.outcome === 'PENDING' && (
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REFUND_FULL' })} className="h-9 px-2.5 rounded-btn bg-danger-500 hover:bg-danger-600 disabled:opacity-50 text-white font-display text-[11px] font-semibold">100% დაბრუნება</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REFUND_PARTIAL' })} className="h-9 px-2.5 rounded-btn bg-warning-500 hover:bg-warning-600 disabled:opacity-50 text-white font-display text-[11px] font-semibold">50% დაბრუნება</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REDO_FREE' })} className="h-9 px-2.5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-display text-[11px] font-semibold">ხელახალი სესია</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'DISMISSED' })} className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-700 font-display text-[11px] font-semibold">უარყოფა</button>
                </div>
              )}
            </div>
          </article>
        ))}
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
      const res = await fetch(`/api/admin/reviews?${params}`)
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
      const res = await fetch(`/api/admin/reviews?${params}`)
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
        title={<>{items ? `${items.length} ` : '—'} შეფასება</>}
        sub="ცუდი/სპამი/შეურაცხმყოფელი შეფასების წაშლა · წაშლისას ექსპერტის რეიტინგი გადაითვლება ავტომატურად."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadCsv(`reviews-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'rating', 'student', 'tutor', 'topic', 'body', 'createdAt'],
              ...items.map(r => [r.id, r.rating, r.student.fullName, r.tutor.user.fullName, r.booking?.topic ?? '', r.body, r.createdAt]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV ექსპორტი
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ტექსტი ან სახელი…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200">
            {[
              { v: 5, label: 'ყველა' },
              { v: 3, label: '≤ 3 ★' },
              { v: 2, label: '≤ 2 ★' },
              { v: 1, label: '1 ★ (ცუდი)' },
            ].map(o => (
              <button key={o.v} type="button" onClick={() => setMaxRating(o.v)} className={`h-8 px-3 rounded-pill font-display text-[11.5px] font-semibold tracking-wide transition-colors ${maxRating === o.v ? 'bg-ink-900 text-white' : 'text-ink-600'}`}>{o.label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6 space-y-3">
        {err && <div role="alert" className="p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        {items === null ? (
          <div className="text-center py-10 text-[13px] text-ink-500">იტვირთება…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-[13px] text-ink-500">ამ ფილტრით შეფასება არ არის.</div>
        ) : items.map(r => (
          <article key={r.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <img src={r.student.avatarUrl || DEFAULT_AVATAR} alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200" />
                <div className="min-w-0">
                  <div className="font-display text-[13px] font-bold text-ink-900 truncate">{r.student.fullName}</div>
                  <div className="text-[11.5px] text-ink-500 truncate">→ {r.tutor.user.fullName}{r.booking ? ` · #${r.booking.ref.slice(0, 8)}` : ''}</div>
                </div>
              </div>
              <div className="inline-flex items-center gap-0.5 text-warning-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Icon.star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? '' : 'text-ink-200'}`} />
                ))}
                <span className="ml-2 font-display text-[11.5px] font-semibold text-ink-700 tabular-nums">{r.rating}.0</span>
              </div>
              <span className="font-mono text-[10.5px] tabular-nums text-ink-400">{fmtDT(r.createdAt)}</span>
              <button
                type="button"
                onClick={() => setPendDelete(r)}
                disabled={busy === r.id}
                className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-[11.5px] transition-colors"
              >
                {busy === r.id ? '…' : 'წაშლა'}
              </button>
            </div>
            <p className="mt-3 text-[13px] text-ink-700 leading-[1.55] whitespace-pre-wrap">{r.body}</p>
            {r.booking && (
              <div className="mt-2 text-[11.5px] text-ink-500">
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
    fetch('/api/admin/finance').then(r => r.ok ? r.json() : null).then(setData).catch(() => setErr('ჩატვირთვა ვერ მოხერხდა'))
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
        {err && <div className="p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">GMV (სულ)</Eyebrow>
            <div className="mt-1 font-display text-[28px] font-bold text-brand-700 tabular-nums leading-none">{data ? `₾${data.gmv.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">{data ? `${data.completedCount} დასრულებული სესია` : ''}</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">კომისია (15%)</Eyebrow>
            <div className="mt-1 font-display text-[28px] font-bold text-success-700 tabular-nums leading-none">{data ? `₾${data.commission.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">15% საკომისიო</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">ეს თვე</Eyebrow>
            <div className="mt-1 font-display text-[28px] font-bold text-ink-900 tabular-nums leading-none">{data ? `₾${data.gmvMonth.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">გასულ თვესთან: {growth}</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">Payout მოლოდინში</Eyebrow>
            <div className="mt-1 font-display text-[28px] font-bold text-warning-700 tabular-nums leading-none">{data ? `₾${data.pendingPayout.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">{data ? `${data.pendingCount} ჯავშანი` : ''}</div>
          </div>
        </div>
        <div className="p-4 rounded-card border border-ink-200 bg-ink-50/40 text-[13px] text-ink-600 leading-relaxed">
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
    fetch('/api/admin/analytics').then(r => r.ok ? r.json() : null).then(setData).catch(() => setErr('ჩატვირთვა ვერ მოხერხდა'))
    fetch('/api/admin/analytics/series').then(r => r.ok ? r.json() : null).then(setSeries).catch(() => {})
  }, [])
  return (
    <>
      <TabHeader
        eyebrow="ანალიტიკა · პროდუქტი"
        title={data
          ? <>{data.tutors.total} ექსპერტი · {data.users.students} კლიენტი · {data.bookings.total} ჯავშანი</>
          : <>ლოდინი…</>}
        sub="ბაზაზე გამოთვლილი ცოცხალი მაჩვენებლები."
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6 space-y-5">
        {err && <div className="p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">აქტივაცია</Eyebrow>
            <div className="mt-1 font-display text-[28px] font-bold text-ink-900 tabular-nums leading-none">{data ? `${data.activationPct}%` : '—'}</div>
            <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">{data ? `${data.activatedStudents} კლიენტმა დაჯავშნა` : ''}</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">ახალი (7 დღე)</Eyebrow>
            <div className="mt-1 font-display text-[28px] font-bold text-brand-700 tabular-nums leading-none">{data ? data.users.new7d : '—'}</div>
            <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">ახალი ანგარიში</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">ჯავშნები (7 დღე)</Eyebrow>
            <div className="mt-1 font-display text-[28px] font-bold text-ink-900 tabular-nums leading-none">{data ? data.bookings.new7d : '—'}</div>
            <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">ბოლო კვირაში დაჯავშნილი</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">საშ. შეფასება</Eyebrow>
            <div className="mt-1 font-display text-[28px] font-bold text-warning-700 tabular-nums leading-none">{data ? data.reviews.avgRating.toFixed(2) : '—'}</div>
            <div className="mt-2 font-mono text-[10.5px] tabular-nums text-ink-500">{data ? `${data.reviews.total} შეფასების საშუალო` : ''}</div>
          </div>
        </div>
        {series && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10.5px] font-bold text-ink-500 uppercase tracking-[0.16em]">ბოლო 30 დღე · ტრენდები</span>
              <div className="flex-1 h-px bg-ink-100" />
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <MiniChart title="ახალი ანგარიშები" data={series.signups} labels={series.days} kind="area" color="#2F9C86" />
              <MiniChart title="ჯავშნები" data={series.bookings} labels={series.days} kind="area" color="#1c1a17" />
              <MiniChart title="შემოსავალი" data={series.revenue} labels={series.days} kind="bar" color="#2F9C86" format={(n) => `₾${n}`} />
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted" className="mb-3">მომხმარებლების ბაზა</Eyebrow>
            <ul className="space-y-2 text-[13px]">
              <li className="flex items-center justify-between"><span className="text-ink-700">სულ</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.users.total ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">კლიენტი</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.users.students ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">ექსპერტი</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.tutors.total ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">30 დღეში ახალი</span><span className="font-display font-bold text-brand-700 tabular-nums">{data?.users.new30d ?? '—'}</span></li>
            </ul>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted" className="mb-3">აქტივობა</Eyebrow>
            <ul className="space-y-2 text-[13px]">
              <li className="flex items-center justify-between"><span className="text-ink-700">სულ ჯავშნები</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.bookings.total ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">სულ შეფასებები</span><span className="font-display font-bold text-ink-900 tabular-nums">{data?.reviews.total ?? '—'}</span></li>
              <li className="flex items-center justify-between"><span className="text-ink-700">აქტიური კლიენტი</span><span className="font-display font-bold text-success-700 tabular-nums">{data?.activatedStudents ?? '—'}</span></li>
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
  students: 'ყველა კლიენტი',
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
          <div role="alert" className={`rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
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
                className={`h-8 px-3 rounded-pill font-display text-[11.5px] font-semibold tracking-wide transition-colors ${segment === s ? 'bg-ink-900 text-white' : 'text-ink-600'}`}
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
            className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
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
            className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y"
          />
          <div className="mt-1 font-mono text-[10.5px] tabular-nums text-ink-400">{body.length}/4000</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={doPreview}
            disabled={busy}
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-800 font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5"
          >
            <Icon.users className="w-3.5 h-3.5" /> მიმღების რაოდენობა
          </button>
          <button
            type="button"
            onClick={askSend}
            disabled={busy || !subject.trim() || !body.trim()}
            className="h-11 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-200 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5"
          >
            გაგზავნა
          </button>
          {previewCount !== null && (
            <span className="font-mono text-[12px] tabular-nums text-ink-700">
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/categories')
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
      if (!res.ok) throw new Error('patch failed')
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
      if (!res.ok) throw new Error()
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
        {err && <div className="mb-4 p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
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
              className="flex-1 h-10 px-3 rounded-btn border border-ink-200 text-[13px] focus:border-brand-500 focus:outline-none"
            />
            <button type="button" onClick={create} disabled={creating || newName.trim().length < 2} className="h-10 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors shrink-0">
              <Icon.plus className="w-3.5 h-3.5" /> დამატება
            </button>
          </div>
          {(rows?.length ?? 0) > 6 && (
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ძებნა…" aria-label="კატეგორიების ძებნა" className="h-10 px-3 rounded-btn border border-ink-200 text-[13px] focus:border-brand-500 focus:outline-none sm:w-44" />
          )}
        </div>

        {rows === null ? (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5 border-b border-ink-100 last:border-b-0">
                <div className="h-4 w-40 rounded bg-ink-100 animate-pulse" />
                <div className="h-6 w-24 rounded-pill bg-ink-100 animate-pulse" />
                <div className="h-4 w-16 rounded bg-ink-100 animate-pulse" />
                <div className="h-6 w-11 rounded-pill bg-ink-100 animate-pulse" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-ink-200 bg-white py-12 px-6 text-center">
            <div className="font-display text-[15px] font-bold text-ink-900 tracking-tight">კატეგორია არ არის</div>
            <p className="text-[12.5px] text-ink-500 mt-1.5">დაამატე პირველი სფერო ზემოთ ველიდან.</p>
          </div>
        ) : (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1.5fr_1fr_0.6fr_auto] gap-4 px-4 py-2.5 border-b border-ink-200 bg-ink-50/60 font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              <div>სახელი</div>
              <div>Slug</div>
              <div>ექსპერტი</div>
              <div className="text-right">მართვა</div>
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-ink-500">ვერაფერი მოიძებნა.</div>
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
                      className="w-full h-9 px-2.5 rounded-btn border border-brand-400 text-[13.5px] font-display font-semibold focus:outline-none"
                    />
                  ) : (
                    <div className="font-display font-semibold text-[14px] text-ink-900 truncate">{r.name}</div>
                  )}
                </div>
                <div className="font-mono text-[12px] text-ink-500 tabular-nums truncate">{r.slug}</div>
                <div className="font-display font-semibold text-[13px] text-ink-800 tabular-nums">{r.tutorCount}</div>
                <div className="flex items-center gap-1 sm:justify-end">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.isLive}
                    aria-label={`კატეგორია ${r.name} — ${r.isLive ? 'ცოცხალი' : 'დამალული'}`}
                    onClick={() => patch(r.id, { isLive: !r.isLive })}
                    className={`relative inline-flex items-center h-6 w-11 rounded-pill transition-colors shrink-0 ${r.isLive ? 'bg-success-500' : 'bg-ink-200'}`}
                  >
                    <span className={`inline-block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${r.isLive ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
                  </button>
                  <button type="button" onClick={() => { setEditingId(r.id); setEditName(r.name) }} className="h-8 px-2.5 rounded-btn text-[11.5px] font-display font-semibold text-ink-600 hover:bg-ink-100 transition-colors">რედაქტ.</button>
                  <button type="button" onClick={() => setPendDelete(r)} disabled={r.tutorCount > 0} title={r.tutorCount > 0 ? 'ჯერ ექსპერტები ჰყავს — დამალე' : 'წაშლა'} className="h-8 px-2.5 rounded-btn text-[11.5px] font-display font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">წაშლა</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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

const VALID_TABS: AdminTab[] = ['overview', 'moderation', 'users', 'bookings', 'reviews', 'disputes', 'finance', 'analytics', 'broadcast', 'categories', 'blog', 'texts', 'integrations', 'audit']

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

const ACTION_LABEL: Record<string, string> = {
  'application.approve': 'განაცხადი დამტკიცდა',
  'application.reject': 'განაცხადი უარყოფილია',
  'booking.cancel': 'ჯავშანი გაუქმდა',
  'review.delete': 'შეფასება წაიშალა',
  'dispute.resolve': 'დავა გადაწყდა',
  'user.impersonate.start': 'იმპერსონაცია დაიწყო',
  'user.impersonate.end': 'იმპერსონაცია დასრულდა',
  'user.suspend': 'ანგარიში შეჩერდა',
  'user.unsuspend': 'შეჩერება მოიხსნა',
  'tutor.feature': 'ექსპერტი გახდა რჩეული',
  'tutor.unfeature': 'ექსპერტს მოეხსნა რჩეული',
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
      const res = await fetch(`/api/admin/audit?${params}`)
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
        sub="ყოველი admin action ინახება აუდიტში — approve/reject, cancel, delete, impersonate."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadCsv(`audit-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['createdAt', 'actor', 'action', 'targetType', 'targetId', 'meta'],
              ...items.map(i => [i.createdAt, i.actor?.email ?? i.actorId, i.action, i.targetType ?? '', i.targetId ?? '', JSON.stringify(i.meta ?? {})]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV ექსპორტი
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[360px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="მოქმედების პრეფიქსი (booking, review, application…)" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <div role="alert" className="mb-4 p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[13px] min-w-[800px]">
              <thead className="bg-ink-50/40 border-b border-ink-100">
                <tr className="text-left">
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">დრო</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">ვინ</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">მოქმედება</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">ობიექტი</th>
                  <th className="px-3 py-2.5 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 whitespace-nowrap">დეტალი</th>
                </tr>
              </thead>
              <tbody>
                {items === null ? (
                  <tr><td colSpan={5} className="px-3 py-10 text-center text-ink-500 text-[13px]">იტვირთება…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-10 text-center text-ink-500 text-[13px]">ჩანაწერი არ არის.</td></tr>
                ) : items.map(i => (
                  <tr key={i.id} className="border-t border-ink-100 hover:bg-ink-50/40">
                    <td className="px-3 py-2.5 font-mono text-[10.5px] tabular-nums text-ink-500 whitespace-nowrap">{fmtDT(i.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-display text-[12.5px] font-bold text-ink-900 truncate max-w-[180px]">{i.actor?.fullName ?? i.actorId}</div>
                      <div className="font-mono text-[10.5px] text-ink-500 truncate max-w-[180px]">{i.actor?.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-display text-[12.5px] font-bold text-ink-900">{ACTION_LABEL[i.action] ?? i.action}</div>
                      <div className="font-mono text-[10px] text-ink-400 tabular-nums">{i.action}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px] tabular-nums text-ink-500 truncate max-w-[200px]">{i.targetType ?? '—'}{i.targetId ? ' · ' + i.targetId.slice(0, 12) : ''}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] tabular-nums text-ink-500 truncate max-w-[280px]" title={JSON.stringify(i.meta ?? {})}>{i.meta ? JSON.stringify(i.meta).slice(0, 80) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile stacked-card fallback — same rows/states as the table. */}
          <div className="block md:hidden">
            {items === null ? (
              <div className="px-4 py-10 text-center text-ink-500 text-[13px]">იტვირთება…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-ink-500 text-[13px]">ჩანაწერი არ არის.</div>
            ) : items.map(i => (
              <div key={i.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-[12.5px] font-bold text-ink-900 truncate">{ACTION_LABEL[i.action] ?? i.action}</div>
                    <div className="font-mono text-[10px] text-ink-400 tabular-nums truncate">{i.action}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-ink-500">{fmtDT(i.createdAt)}</span>
                </div>
                <div className="mt-1 text-[11.5px] text-ink-600 truncate">
                  <span className="font-display font-semibold">{i.actor?.fullName ?? i.actorId}</span>
                  {i.actor?.email ? <span className="font-mono text-ink-500"> · {i.actor.email}</span> : null}
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] tabular-nums text-ink-500 truncate">
                  {i.targetType ?? '—'}{i.targetId ? ' · ' + i.targetId.slice(0, 12) : ''}
                </div>
                {i.meta ? (
                  <div className="mt-0.5 font-mono text-[10px] tabular-nums text-ink-500 truncate" title={JSON.stringify(i.meta ?? {})}>
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
  const [active, setActive] = useState<AdminTab>('overview')
  const [pendingCount, setPendingCount] = useState<number | null>(null)
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
      const r = await fetch('/api/admin/applications')
      if (!r.ok) return
      const rows = await r.json()
      if (Array.isArray(rows)) setPendingCount(rows.filter((a: any) => a.status === 'SUBMITTED').length)
    } catch {}
  }
  useEffect(() => { loadPending() }, [statsTick])

  const setActiveWithHash = (id: AdminTab) => {
    setActive(id)
    if (typeof window !== 'undefined') window.location.hash = id
  }

  return (
    <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen lg:flex lg:items-start">
      <AdminSidebar active={active} onNav={setActiveWithHash} pendingCount={pendingCount} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
      <TopBar active={active} onNav={setActiveWithHash} pendingCount={pendingCount} />

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
        {active === 'broadcast' && <BroadcastSection />}
        {active === 'categories' && <CategoriesSection />}
        {active === 'blog' && <BlogSection />}
        {active === 'texts' && <SiteTextsSection />}
        {active === 'integrations' && <IntegrationsSection />}
        {active === 'audit' && <AuditSection />}
      </main>
      </div>
    </div>
  )
}


