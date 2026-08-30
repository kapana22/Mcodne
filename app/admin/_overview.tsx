'use client'
// Admin tab: მიმოხილვა — the dashboard. Greeting, KPI tiles, and the queue.
//
// THE TREND ROW AND THE PRODUCT CUTS WENT WITH THE BOOKING PRODUCT
// (2026-08-24). Three charts (signups, bookings, revenue), an activation
// percentage, an average rating and two lists — every one of them measured the
// consultation funnel, and their endpoint (/api/admin/analytics) was deleted
// with it. What is left is what is still true: how many people are here, how
// many sell, and what is waiting in the queue. Nothing is invented to fill the
// space a chart used to take.
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

import React, { useState, useEffect, useCallback } from 'react'
import { KA_MONTHS_LONG as KA_MONTHS } from '@/lib/kaDate'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'

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
          href="#masters"
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
  { cat: 'მიწოდება', label: 'ექსპერტი სიაში' },
  { cat: 'მოთხოვნა', label: 'ახალი მოთხოვნა' },
  { cat: 'რიგი', label: 'მოლოდინში (განაცხადი)' },
  { cat: 'აქტიური', label: 'კლიენტი / ექსპერტი' },
]

const KpiCard = ({ s }: { s: Kpi }) => (
  <div className="p-5 rounded-card bg-white border border-ink-200 hover:border-ink-300 transition-colors duration-fast">
    <Eyebrow as="span" tone="muted" className="truncate block">{s.cat}</Eyebrow>
    <Eyebrow tone="muted" className="mt-3">{s.label}</Eyebrow>
    <div className="mt-1 font-display text-display font-bold text-ink-900 tracking-tight tabular-nums leading-none">{s.value}</div>
    <div className="mt-4 pt-3 border-t border-ink-100 text-meta text-ink-600 leading-snug">{s.sub}</div>
  </div>
)

/* ───── „ყურადღება" — the things that look fine and are not ─────
 *
 * ⚠️ THIS BLOCK IS HERE BECAUSE OF A REAL OUTAGE (2026-08-26). For two days
 * `routableProviders()` threw, so every verified request was mailed to nobody;
 * the panel stayed green the whole time, because „verified" is a status and the
 * failure was in what happens AFTER it. The one shape that would have shown it
 * — a request verified, with no offer against it — was on no screen.
 *
 * ⚠️ AND IT HIDES ITS OWN ZEROS. A permanent row reading „0" trains the eye to
 * stop reading; a row that only appears when there IS something teaches the
 * opposite. All clear says so in one line instead.
 *
 * Every number is a COUNT — nothing here is derived, averaged or projected. */
type Attention = { awaitingOffers: number; stalled24h: number; offersSent: number; offersAccepted: number }

const AttentionBlock = ({ a }: { a: Attention | null }) => {
  if (!a) return null
  const rows = [
    a.stalled24h > 0 && {
      bad: true,
      n: a.stalled24h,
      l: 'გადამოწმებული მოთხოვნა 24 საათზე მეტია შეთავაზების გარეშე',
      s: 'ან ვერავინ მიიღო, ან მიიღეს და არ პასუხობენ — ორივე შესამოწმებელია.',
    },
    a.awaitingOffers > 0 && {
      bad: false,
      n: a.awaitingOffers,
      l: 'გადამოწმებული მოთხოვნა ჯერ შეთავაზების გარეშე',
      s: 'ექსპერტებს გაეგზავნა; პასუხს ელოდება.',
    },
  ].filter(Boolean) as { bad: boolean; n: number; l: string; s: string }[]

  return (
    <section className="px-6 lg:px-8 mt-8">
      <div className="rounded-card border border-ink-200 bg-white p-5 sm:p-6">
        <Eyebrow tone="muted" className="mb-3">ყურადღება</Eyebrow>
        {rows.length === 0 ? (
          <p className="text-small text-ink-600">
            გადამოწმებული მოთხოვნა, რომელსაც შეთავაზება არ აქვს, არ არის.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`font-display text-h3 font-bold tabular-nums leading-none ${r.bad ? 'text-danger-700' : 'text-ink-900'}`}>{r.n}</span>
                <span className="min-w-0">
                  <span className="block text-small font-display font-semibold text-ink-900">{r.l}</span>
                  <span className="block text-meta text-ink-600 mt-0.5">{r.s}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* The line under it, always — two counts, no rate. A percentage on one
            or two offers is a number that moves 50% on one click. */}
        <div className="mt-4 pt-3 border-t border-ink-100 text-meta text-ink-600">
          შეთავაზება: <span className="font-display font-semibold text-ink-900 tabular-nums">{a.offersSent}</span> გაგზავნილი
          {' · '}
          <span className="font-display font-semibold text-ink-900 tabular-nums">{a.offersAccepted}</span> არჩეული
        </div>
        <a href="#requests" className="mt-4 h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 text-ink-700 font-display font-semibold text-small inline-flex items-center gap-1.5 transition-colors duration-fast">
          <Icon.list className="w-3.5 h-3.5" /> მოთხოვნები
        </a>
      </div>
    </section>
  )
}

const Kpis = ({ onAttention }: { onAttention: (a: Attention) => void }) => {
  const PLACEHOLDER: Kpi[] = STAT_DEFS.map(s => ({ ...s, value: '—', sub: <span className="text-ink-400">—</span> }))
  const [live, setLive] = useState<Kpi[] | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/stats', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d || cancelled) return
        onAttention({
          awaitingOffers: Number(d.awaitingOffers ?? 0),
          stalled24h: Number(d.stalled24h ?? 0),
          offersSent: Number(d.offersSent ?? 0),
          offersAccepted: Number(d.offersAccepted ?? 0),
        })
        setLive([
          { ...STAT_DEFS[0], value: (d.providers ?? 0).toLocaleString('ka-GE'), sub: <span>პროფილი სერვისით</span> },
          { ...STAT_DEFS[1], value: String(d.newRequests ?? 0), sub: <span>გადამოწმებას ელოდება</span> },
          { ...STAT_DEFS[2], value: String(d.pendingApps ?? 0), sub: <span>განაცხადი მოდერაციისთვის</span> },
          { ...STAT_DEFS[3], value: `${d.clients ?? 0} / ${d.providers ?? 0}`, sub: <span>სულ {(d.users ?? 0).toLocaleString('ka-GE')} რეგისტრირებული</span> },
        ])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [onAttention])
  return (
    <section className="px-6 lg:px-8 mt-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(live ?? PLACEHOLDER).map((s, i) => <KpiCard key={i} s={s} />)}
      </div>
    </section>
  )
}

export const OverviewSection = () => {
  const [attention, setAttention] = useState<Attention | null>(null)
  const onAttention = useCallback((a: Attention) => setAttention(a), [])
  return (
  <>
    <Hero />
    <Kpis onAttention={onAttention} />
    <AttentionBlock a={attention} />
    <section className="px-6 lg:px-8 mt-8 pb-12">
      <div className="rounded-card border border-ink-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Eyebrow tone="muted" className="mb-1">სამუშაო რიგი</Eyebrow>
          <h3 className="font-display text-h3 font-bold text-ink-900">განაცხადები</h3>
          <p className="text-small text-ink-500 mt-1">დაამტკიცე, უარყავი და მართე ახალი ექსპერტის მოთხოვნები.</p>
        </div>
        <a href="#masters" className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-2 transition-colors duration-fast">
          მოდერაცია
        </a>
      </div>
    </section>
  </>
  )
}
