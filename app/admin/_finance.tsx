'use client'
// Admin tab: ფინანსები — GMV, commission, pending payouts.

import { useState, useEffect } from 'react'
import { Eyebrow } from '@/components/Eyebrow'
import { TabHeader, AdminError } from './_parts'

/* ───── Section: Finance (real data via /api/admin/finance) ───── */
type FinanceData = {
  gmv: number; gmvMonth: number; growthPct: number | null;
  commission: number; completedCount: number;
  pendingPayout: number; pendingCount: number;
}

export const FinanceSection = () => {
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

