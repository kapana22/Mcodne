'use client'
// Admin tab: მიმოხილვა — the dashboard. Greeting, KPI tiles, 30-day trend, and
// the product cuts that used to be a second tab.
//
// ── WHY „ანალიტიკა" IS GONE (2026-08-11, owner's audit) ───────────────────
// The two tabs rendered THE SAME THREE CHARTS from the same
// `/api/admin/analytics/series` fetch, and their KPI rows overlapped. One of
// them linked to the other with „სრული ანალიტიკა →", which was the tell: nobody
// could say what was in the other tab that wasn't here, because the answer was
// „four tiles and two lists". Those four tiles and two lists now sit under the
// trend row, where they read as the detail behind the headline instead of a
// second, competing dashboard. `#analytics` still resolves — page.tsx maps the
// old hash here, so bookmarks and the sidebar's history do not break.

import React, { useState, useEffect } from 'react'
import { KA_MONTHS_LONG as KA_MONTHS } from '@/lib/kaDate'
import { MiniChart, CHART, type SeriesData } from './_charts'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { AdminError, Stat } from './_parts'
import { COMMISSION_PCT, PAYMENTS_LIVE } from '@/lib/flags'

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
            პლატფორმის ცოცხალი ინდიკატორები — მოცულობა, ზრდა და ის, რაც რიგში დგას.
          </p>
        </div>
        {/* One action, not two. „ანალიტიკა" pointed at a tab that no longer
            exists as a separate thing; the queue is the only place a dashboard
            should be able to send you. */}
        <a
          href="#moderation"
          className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast shrink-0"
        >
          <Icon.bolt className="w-3.5 h-3.5" /> მოდერაცია
        </a>
      </div>
    </section>
  )
}

/* ───── KPI Stat ─────
   Sparklines were removed 2026-07: they rendered FABRICATED series (hardcoded
   arrays) next to real numbers — decorative fiction an admin could mistake for
   trend data. KPI cards now show only real values from /api/admin/stats.
   The „№ 01" counter went the same way 2026-08-11: it numbered four cards that
   have no order, and it was the first thing the eye hit on every one of them. */
type Kpi = { label: string; value: string; sub: React.ReactNode; cat: string }

// Skeleton card definitions — labels/categories only; values start blank ('—')
// and are only ever filled from the real /api/admin/stats response.
const STAT_DEFS: Pick<Kpi, 'cat' | 'label'>[] = [
  { cat: 'მოცულობა · სულ', label: 'ჯავშანი პლატფორმაზე' },
  { cat: 'ფინანსები', label: 'GMV სულ' },
  { cat: 'რიგი', label: 'მოლოდინში (განაცხადი)' },
  { cat: 'აქტიური', label: 'მომხმარებელი / ექსპერტი' },
]

const KpiCard = ({ s }: { s: Kpi }) => (
  <div className="p-5 rounded-card bg-white border border-ink-200 hover:border-ink-300 transition-colors duration-fast">
    <Eyebrow as="span" tone="muted" className="truncate block">{s.cat}</Eyebrow>
    <Eyebrow tone="muted" className="mt-3">{s.label}</Eyebrow>
    <div className="mt-1 font-display text-display font-bold text-ink-900 tracking-tight tabular-nums leading-none">{s.value}</div>
    <div className="mt-4 pt-3 border-t border-ink-100 text-meta text-ink-600 leading-snug">{s.sub}</div>
  </div>
)

const Kpis = () => {
  const PLACEHOLDER: Kpi[] = STAT_DEFS.map(s => ({ ...s, value: '—', sub: <span className="text-ink-400">—</span> }))
  const [live, setLive] = useState<Kpi[] | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/stats', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d || cancelled) return
        setLive([
          { ...STAT_DEFS[0], value: (d.bookings ?? 0).toLocaleString('ka-GE'), sub: <span><span className="font-semibold text-success-700">{d.completed ?? 0}</span> დასრულებული · {d.live ?? 0} ცოცხალი</span> },
          { ...STAT_DEFS[1], value: `₾${(d.revenue ?? 0).toLocaleString('ka-GE')}`, sub: <span>კომისია ≈ ₾{Math.round((d.revenue ?? 0) * (PAYMENTS_LIVE ? COMMISSION_PCT / 100 : 0)).toLocaleString('ka-GE')}</span> },
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
        {(live ?? PLACEHOLDER).map((s, i) => <KpiCard key={i} s={s} />)}
      </div>
    </section>
  )
}

/* ───── The product cuts (formerly the „ანალიტიკა" tab) ───── */
type AnalyticsData = {
  users: { total: number; students: number; new7d: number; new30d: number }
  tutors: { total: number }
  bookings: { total: number; new7d: number }
  reviews: { total: number; avgRating: number }
  activationPct: number
  activatedStudents: number
}

const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 mb-3">
    <span className="text-micro font-bold text-ink-500 uppercase shrink-0">{label}</span>
    <div className="flex-1 h-px bg-ink-100" />
  </div>
)

const ListRow = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'brand' | 'success' }) => (
  <li className="flex items-center justify-between">
    <span className="text-ink-700">{label}</span>
    <span className={`font-display font-bold tabular-nums ${tone === 'brand' ? 'text-brand-700' : tone === 'success' ? 'text-success-700' : 'text-ink-900'}`}>{value}</span>
  </li>
)

const Product = () => {
  const [s, setS] = useState<SeriesData | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    fetch('/api/admin/analytics/series', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setS).catch(() => {})
    // A non-2xx has to surface, not silently hold every number at „—“.
    fetch('/api/admin/analytics', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('analytics')))
      .then(setData)
      .catch(() => setErr(true))
  }, [])

  return (
    <section className="px-6 lg:px-8 mt-8 space-y-6">
      {err && <AdminError message="ანალიტიკა ვერ ჩაიტვირთა." />}

      {s && (
        <div>
          <Divider label="ბოლო 30 დღე" />
          <div className="grid md:grid-cols-3 gap-3">
            <MiniChart title="ახალი ანგარიშები" data={s.signups} labels={s.days} kind="area" color={CHART.brand} />
            <MiniChart title="ჯავშნები" data={s.bookings} labels={s.days} kind="area" color={CHART.ink} />
            <MiniChart title="შემოსავალი" data={s.revenue} labels={s.days} kind="bar" color={CHART.brand} format={(n) => `₾${n}`} />
          </div>
        </div>
      )}

      <div>
        <Divider label="პროდუქტი" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            n={data ? `${data.activationPct}%` : '—'}
            label="აქტივაცია"
            sub={data ? `${data.activatedStudents} კლიენტმა დაჯავშნა` : undefined}
          />
          <Stat n={data ? data.users.new7d : '—'} label="ახალი ანგარიში" sub="ბოლო 7 დღეში" />
          <Stat n={data ? data.bookings.new7d : '—'} label="ახალი ჯავშანი" sub="ბოლო 7 დღეში" />
          <Stat
            n={data ? data.reviews.avgRating.toFixed(2) : '—'}
            label="საშ. შეფასება"
            sub={data ? `${data.reviews.total} შეფასების საშუალო` : undefined}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div className="p-5 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted" className="mb-3">მომხმარებლების ბაზა</Eyebrow>
            <ul className="space-y-2 text-small">
              <ListRow label="სულ" value={data?.users.total ?? '—'} />
              <ListRow label="კლიენტი" value={data?.users.students ?? '—'} />
              <ListRow label="ექსპერტი" value={data?.tutors.total ?? '—'} />
              <ListRow label="30 დღეში ახალი" value={data?.users.new30d ?? '—'} tone="brand" />
            </ul>
          </div>
          <div className="p-5 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted" className="mb-3">აქტივობა</Eyebrow>
            <ul className="space-y-2 text-small">
              <ListRow label="სულ ჯავშნები" value={data?.bookings.total ?? '—'} />
              <ListRow label="სულ შეფასებები" value={data?.reviews.total ?? '—'} />
              <ListRow label="აქტიური კლიენტი" value={data?.activatedStudents ?? '—'} tone="success" />
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

export const OverviewSection = () => (
  <>
    <Hero />
    <Kpis />
    <Product />
    <section className="px-6 lg:px-8 mt-8 pb-12">
      <div className="rounded-card border border-ink-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Eyebrow tone="muted" className="mb-1">სამუშაო რიგი</Eyebrow>
          <h3 className="font-display text-h3 font-bold text-ink-900">ექსპერტების განაცხადები</h3>
          <p className="text-small text-ink-500 mt-1">დაამტკიცე, უარყავი და მართე ახალი ექსპერტის მოთხოვნები.</p>
        </div>
        <a href="#moderation" className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast">
          მოდერაცია
        </a>
      </div>
    </section>
  </>
)
