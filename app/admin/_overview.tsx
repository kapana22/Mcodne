'use client'
// Admin tab: მიმოხილვა — hero greeting, KPI tiles, 30-day trend.

import React, { useState, useEffect } from 'react'
import { KA_MONTHS_LONG as KA_MONTHS } from '@/lib/kaDate'
import { MiniChart, CHART } from './_charts'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import type { SeriesData } from './_analytics'

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

export const OverviewSection = () => (
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

