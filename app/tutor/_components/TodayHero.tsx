'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { StatusPill } from '@/components/StatusPill'
import { fmtKaDateTime, fmtKaTime } from '@/lib/kaDate'
import { isBookingLive } from '@/lib/bookingLive'
import { type DashBooking, toneOf } from './types'

/* The dashboard's centerpiece: next session as a gradient-dark hero (same
   named-token treatment as the student dashboard — no ad-hoc washes), with a
   live/countdown column, plus today's remaining sessions as slim rows.
   Empty state stays a normal white card — never an empty dark slab. */
export function TodayHero({
  next,
  todayRest,
}: {
  next: DashBooking | null
  todayRest: DashBooking[]
}) {
  // 30s tick for the countdown column.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!next) {
    return (
      <section className="rounded-card border border-ink-200 bg-white p-5 sm:p-6">
        <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-4">
          უახლოესი სესია
        </div>
        <EmptyState
          variant="inline"
          icon={<Icon.calendar className="w-5 h-5" />}
          title="დადასტურებული სესია არ გაქვს"
          description="გამოაქვეყნე თავისუფალი დროები — კლიენტები მხოლოდ გამოცხადებულ დროზე ჯავშნიან."
          cta={{ label: 'გრაფიკის რედაქტირება', href: '/tutor/schedule' }}
        />
      </section>
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em]">
              <span className="inline-flex items-center gap-1.5 text-white/75">
                <Icon.clock className="w-3 h-3" />
                {fmtKaDateTime(start, { weekday: true })} · {next.durationMin} წთ
              </span>
              <span className="text-white/25">·</span>
              <span className="text-brand-300">₾{next.price}</span>
            </div>

            <div className="mb-4 max-w-[520px]">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/45 mb-1.5">თემა</div>
              <h2 className="font-display text-[21px] sm:text-[24px] font-bold tracking-[-0.02em] leading-[1.15] text-white">
                {next.topic}
              </h2>
            </div>

            <div className="inline-flex items-center gap-2.5">
              <Avatar src={next.student?.avatarUrl ?? undefined} name={next.student?.fullName} size={36} />
              <div className="min-w-0">
                <div className="font-display font-semibold text-[13.5px] text-white">{next.student?.fullName ?? 'უცნობი კლიენტი'}</div>
                <div className="text-[11.5px] text-white/55 mt-0.5">კლიენტი</div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {live ? (
                <>
                  <Btn href={`/session/${next.id}`} variant="primary" size="md">
                    <Icon.video className="w-4 h-4" /> ვიდეო-ოთახში შესვლა
                  </Btn>
                  <Link href={`/tutor/bookings/${next.id}`} className="h-11 px-4 rounded-btn bg-white/10 hover:bg-white/15 backdrop-blur text-white font-display font-medium text-[13px] inline-flex items-center transition-colors">
                    დეტალები
                  </Link>
                </>
              ) : (
                <>
                  <Btn href={`/tutor/bookings/${next.id}`} variant="primary" size="md">დეტალები</Btn>
                  <Link href={`/session/${next.id}`} className="h-11 px-4 rounded-btn bg-white/10 hover:bg-white/15 backdrop-blur text-white font-display font-medium text-[13px] inline-flex items-center gap-1.5 transition-colors">
                    <Icon.video className="w-4 h-4" /> ვიდეო-ოთახი
                  </Link>
                </>
              )}
            </div>
          </div>

          {live ? (
            <div className="relative bg-white/[0.06] border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col justify-center">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/50 mb-2.5">ახლა</div>
              <div className="inline-flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-400 motion-safe:animate-pulse-soft" />
                <span className="font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-white">მიმდინარეობს</span>
              </div>
            </div>
          ) : (
            <div className="relative bg-white/[0.06] border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col justify-center">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/50 mb-2.5">დაიწყება</div>
              <div className="flex items-baseline gap-1.5">
                {cd.d > 0 && (
                  <>
                    <span className="font-display text-[40px] font-bold leading-none tabular-nums tracking-[-0.04em]">{cd.d}</span>
                    <span className="font-display text-[14px] font-semibold text-white/60 mr-1.5">დღე</span>
                  </>
                )}
                <span className="font-display text-[40px] font-bold leading-none tabular-nums tracking-[-0.04em]">{String(cd.h).padStart(2, '0')}</span>
                <span className="font-display text-[14px] font-semibold text-white/60">სთ</span>
                <span className="font-display text-[28px] font-bold leading-none tabular-nums tracking-[-0.04em] ml-1">{String(cd.m).padStart(2, '0')}</span>
                <span className="font-display text-[14px] font-semibold text-white/60">წთ</span>
              </div>
            </div>
          )}
        </div>
      </article>

      {todayRest.length > 0 && (
        <div className="mt-3 rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            კიდევ დღეს
          </div>
          <ul className="divide-y divide-ink-100">
            {todayRest.map(b => (
              <li key={b.id}>
                <Link href={`/tutor/bookings/${b.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/60 transition-colors">
                  <span className="font-mono text-[12.5px] tabular-nums text-ink-700 shrink-0 w-12">{fmtKaTime(new Date(b.startAt))}</span>
                  <Avatar src={b.student?.avatarUrl ?? undefined} name={b.student?.fullName} size={28} />
                  <span className="font-display text-[13px] font-semibold text-ink-900 truncate shrink-0 max-w-[160px]">{b.student?.fullName ?? '—'}</span>
                  <span className="text-[12.5px] text-ink-500 truncate flex-1">{b.topic}</span>
                  <StatusPill tone={isBookingLive(b) ? 'live' : toneOf(b.status)} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
