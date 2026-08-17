'use client'
// Admin tab: ფინანსები — GMV, commission, pending payouts.

import { useState, useEffect } from 'react'
import { Eyebrow } from '@/components/Eyebrow'
import { TabHeader, AdminError } from './_parts'
import { COMMISSION_PCT, PAYMENTS_LIVE } from '@/lib/flags'

/* ───── Section: Finance (real data via /api/admin/finance) ───── */
type FinanceData = {
  gmv: number; gmvMonth: number; growthPct: number | null;
  commission: number; completedCount: number; packageCount?: number;
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
        sub={`ყველა დასრულებული ჯავშნის მთლიანი მოცულობა და ${COMMISSION_PCT}%-იანი კომისია. გადახდის ინტეგრაცია მალე დაემატება.`}
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6 space-y-6">
        {err && <AdminError message={err} />}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">GMV (სულ)</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-brand-700 tabular-nums leading-none">{data ? `₾${data.gmv.toLocaleString()}` : '—'}</div>
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">{data ? `${data.completedCount} დასრულებული სესია${data.packageCount ? ` · ${data.packageCount} პაკეტი` : ''}` : ''}</div>
          </div>
          <div className="p-4 rounded-card border border-ink-200 bg-white">
            <Eyebrow tone="muted">{`კომისია (${COMMISSION_PCT}%)`}</Eyebrow>
            <div className="mt-1 font-display text-h1 font-bold text-success-700 tabular-nums leading-none">{data ? `₾${data.commission.toLocaleString()}` : '—'}</div>
            {/* THE CAPTION HAS TO AGREE WITH THE NUMBER ABOVE IT. `commission`
                is 0 while PAYMENTS_LIVE is false — the platform withholds
                nothing today — so „15% საკომისიო" under a ₾0 was the card
                contradicting itself. The phrasing is the one the home CTA
                already uses for exactly this state, not a new string. */}
            <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">
              {PAYMENTS_LIVE ? `${COMMISSION_PCT}% საკომისიო` : 'ონლაინ გადახდების ამოქმედების შემდეგ'}
            </div>
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

