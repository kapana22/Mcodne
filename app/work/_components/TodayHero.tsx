'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { StatusPill } from '@/components/StatusPill'
import { TzNote } from '@/components/workspace/TzNote'
import { sessionDateTime, sessionTime } from '@/components/workspace/sessionTime'
import { isBookingLive } from '@/lib/bookingLive'
import { type DashBooking, toneOf } from './types'

/* The dashboard's centerpiece: next session as a gradient-dark hero (same
   named-token treatment as the student dashboard — no ad-hoc washes), with a
   live/countdown column, plus today's remaining sessions as slim rows.
   Empty state stays a normal white card — never an empty dark slab. */
export function TodayHero({
  next,
  todayRest,
  noFreeTime = false,
}: {
  next: DashBooking | null
  todayRest: DashBooking[]
  /** True when the expert has no bookable time left. The dashboard already
      states that ONCE, in the alert row above (plus the OpenTimeNudge modal) —
      so this card must not repeat the same „გამოაქვეყნე დრო" CTA a third time.
      It keeps stating its own fact (no confirmed session) and stays silent
      about the fix. */
  noFreeTime?: boolean
}) {
  // 30s tick for the countdown column.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!next) {
    return (
      <Card as="section">
        <Eyebrow tone="muted" className="mb-4">უახლოესი სესია</Eyebrow>
        <EmptyState
          variant="inline"
          icon={<Icon.calendar className="w-5 h-5" />}
          title="დადასტურებული სესია არ გაქვს"
          description={noFreeTime ? undefined : 'გამოაქვეყნე დრო, რომ დაგიჯავშნონ.'}
          cta={noFreeTime ? undefined : { label: 'გრაფიკი', href: '/work/schedule' }}
        />
      </Card>
    )
  }

  const live = isBookingLive(next)
  const start = new Date(next.startAt)
  const diff = Math.max(0, start.getTime() - now)
  const cd = {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff / 3_600_000) % 24),
    m: Math.max(live ? 0 : 1, Math.floor((diff / 60_000) % 60)),
  }

  return (
    <section aria-label="უახლოესი სესია">
      <article className="relative overflow-hidden rounded-card bg-gradient-dark text-white">
        <div className="relative grid lg:grid-cols-[1fr_240px]">
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4 font-display text-micro font-semibold uppercase">
              <span className="inline-flex items-center gap-1.5 text-white/75">
                <Icon.clock className="w-3 h-3" />
                {sessionDateTime(next.startAt)} · {next.durationMin} წთ
              </span>
              <TzNote className="text-white/50" />
              <span className="text-white/25">·</span>
              <span className="text-brand-300">₾{next.price}</span>
            </div>

            <div className="mb-4 max-w-[520px]">
              <div className="font-display text-micro font-semibold uppercase text-white/45 mb-1.5">თემა</div>
              <h2 className="font-display text-h2 sm:text-h1 font-bold tracking-[-0.02em] leading-[1.15] text-white">
                {next.topic}
              </h2>
            </div>

            <div className="inline-flex items-center gap-2.5">
              <Avatar src={next.student?.avatarUrl ?? undefined} name={next.student?.fullName} size={36} />
              <div className="min-w-0">
                <div className="font-display font-semibold text-body text-white">{next.student?.fullName ?? 'უცნობი კლიენტი'}</div>
                <div className="text-meta text-white/55 mt-0.5">კლიენტი</div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {live ? (
                <>
                  <Btn href={`/session/${next.id}`} variant="primary" size="md">
                    <Icon.video className="w-4 h-4" /> ვიდეოოთახში შესვლა
                  </Btn>
                  <Link href={`/work/bookings/${next.id}`} className="h-11 px-4 rounded-btn bg-white/10 hover:bg-white/15 backdrop-blur text-white font-display font-medium text-small inline-flex items-center transition-colors duration-fast">
                    დეტალები
                  </Link>
                </>
              ) : (
                <>
                  <Btn href={`/work/bookings/${next.id}`} variant="primary" size="md">დეტალები</Btn>
                  <Link href={`/session/${next.id}`} className="h-11 px-4 rounded-btn bg-white/10 hover:bg-white/15 backdrop-blur text-white font-display font-medium text-small inline-flex items-center gap-1.5 transition-colors duration-fast">
                    <Icon.video className="w-4 h-4" /> ვიდეოოთახი
                  </Link>
                </>
              )}
            </div>
          </div>

          {live ? (
            <div className="relative bg-white/[0.06] border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col justify-center">
              <div className="font-display text-micro font-semibold uppercase text-white/50 mb-2.5">ახლა</div>
              <div className="inline-flex items-center gap-2.5">
                <span className="font-display text-h2 font-bold leading-none tracking-[-0.02em] text-brand-300">მიმდინარეობს</span>
              </div>
            </div>
          ) : (
            <div className="relative bg-white/[0.06] border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col justify-center">
              <div className="font-display text-micro font-semibold uppercase text-white/50 mb-2.5">დაიწყება</div>
              <div className="flex items-baseline gap-1.5">
                {cd.d > 0 && (
                  <>
                    <span className="font-display text-display-lg font-bold leading-none tabular-nums tracking-[-0.04em]">{cd.d}</span>
                    <span className="font-display text-body font-semibold text-white/60 mr-1.5">დღე</span>
                  </>
                )}
                <span className="font-display text-display-lg font-bold leading-none tabular-nums tracking-[-0.04em]">{String(cd.h).padStart(2, '0')}</span>
                <span className="font-display text-body font-semibold text-white/60">სთ</span>
                <span className="font-display text-h1 font-bold leading-none tabular-nums tracking-[-0.04em] ml-1">{String(cd.m).padStart(2, '0')}</span>
                <span className="font-display text-body font-semibold text-white/60">წთ</span>
              </div>
            </div>
          )}
        </div>
      </article>

      {todayRest.length > 0 && (
        <Card padding="none" className="mt-3 overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-3">
            <Eyebrow tone="muted">კიდევ დღეს</Eyebrow>
            <TzNote />
          </div>
          <ul className="divide-y divide-ink-100">
            {todayRest.map(b => (
              <li key={b.id}>
                <Link href={`/work/bookings/${b.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/60 transition-colors duration-fast">
                  <span className="font-mono text-small tabular-nums text-ink-700 shrink-0 w-12">{sessionTime(b.startAt)}</span>
                  <Avatar src={b.student?.avatarUrl ?? undefined} name={b.student?.fullName} size={28} />
                  <span className="font-display text-small font-semibold text-ink-900 truncate shrink-0 max-w-[160px]">{b.student?.fullName ?? '—'}</span>
                  <span className="text-small text-ink-500 truncate flex-1">{b.topic}</span>
                  <StatusPill tone={isBookingLive(b) ? 'live' : toneOf(b.status)} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
