'use client'
import { CountUp } from '@/components/CountUp'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { SkeletonKpi } from '@/components/Skeleton'
import { FEATURE_PAYMENTS_V2 } from '@/lib/flags'

/* One quiet strip instead of four separate KPI cards — the numbers are
   secondary context, not the dashboard's job. */
export function SnapshotRow({
  loading,
  today,
  week,
  completed,
  totalEarned,
  pendingPayout,
}: {
  loading: boolean
  today: number
  week: number
  completed: number
  totalEarned: number
  pendingPayout: number
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SkeletonKpi /><SkeletonKpi /><SkeletonKpi /><SkeletonKpi />
      </div>
    )
  }
  const cells: { label: string; value: number; prefix?: string; sub?: string }[] = [
    { label: 'დღეს', value: today, sub: 'სესია' },
    { label: 'ეს კვირა', value: week, sub: 'მოსალოდნელი' },
    { label: 'დასრულებული', value: completed, sub: 'სესია ჯამში' },
    {
      label: 'სულ ნაშოვნი', value: totalEarned, prefix: '₾',
      sub: FEATURE_PAYMENTS_V2 ? (pendingPayout ? `₾${pendingPayout} მოლოდინში` : 'ყველა გადახდილი') : 'გადახდები მალე',
    },
  ]
  return (
    <Card as="section" aria-label="სტატისტიკა" padding="none" className="shadow-xs grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-ink-100">
      {cells.map((c, i) => (
        <div key={c.label} className={`p-4 sm:p-5 ${i >= 2 ? 'border-t sm:border-t-0 border-ink-100' : ''} ${i === 1 ? 'border-l sm:border-l-0 border-ink-100' : ''} ${i === 3 ? 'border-l sm:border-l-0 border-ink-100' : ''}`}>
          <Eyebrow tone="muted">{c.label}</Eyebrow>
          <div className="font-display text-[22px] font-bold text-ink-900 tabular-nums mt-1 leading-none">
            <CountUp value={c.value} prefix={c.prefix ?? ''} />
          </div>
          {c.sub && <div className="text-[11px] text-ink-500 mt-1.5">{c.sub}</div>}
        </div>
      ))}
    </Card>
  )
}
