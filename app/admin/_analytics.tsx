'use client'
// Admin tab: ანალიტიკა — totals plus the 30-day series.

import { useState, useEffect } from 'react'
import { MiniChart, CHART } from './_charts'
import { Eyebrow } from '@/components/Eyebrow'
import { TabHeader, AdminError } from './_parts'

/* ───── Section: Analytics (real data via /api/admin/analytics) ───── */
type AnalyticsData = {
  users: { total: number; students: number; new7d: number; new30d: number }
  tutors: { total: number }
  bookings: { total: number; new7d: number }
  reviews: { total: number; avgRating: number }
  activationPct: number
  activatedStudents: number
}

export type SeriesData = { days: string[]; signups: number[]; bookings: number[]; revenue: number[] }

export const AnalyticsSection = () => {
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

