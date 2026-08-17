'use client'
// /student — the „შემდეგი შეხვედრა“ card with its countdown.

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { bucketBookings } from '@/lib/bookings'
import { isBookingLive } from '@/lib/bookingLive'
import { TzNote } from '@/components/workspace/TzNote'
import { sessionDateTime } from '@/components/workspace/sessionTime'

/* ───── Next session hero ───── */
export const NextSession = ({ bookings, loading, onOpenDetail }: { bookings: any[]; loading: boolean; onOpenDetail: (id?: string) => void; onOpenExpert: () => void }) => {
  const [countdown, setCountdown] = useState<{ d: number; h: number; m: number } | null>(null)
  // Liveness is DERIVED from the clock (lib/bookingLive) — the DB never
  // contains status 'LIVE', so a raw status check is dead code. `joinable`
  // additionally opens 5 minutes before start, matching /session/[id]'s gate.
  const [live, setLive] = useState(false)
  const [joinable, setJoinable] = useState(false)
  // Same predicate/ordering as the header and the sessions list — one source —
  // EXCEPT a currently-running session: bucketBookings' upcoming rule drops
  // bookings once startAt passes, which would hide an in-progress session's
  // join button, so a live booking wins the hero slot.
  const next = useMemo(() => {
    const liveNow = bookings.find(b => isBookingLive(b))
    return liveNow ?? bucketBookings(bookings).upcoming[0] ?? null
  }, [bookings])

  useEffect(() => {
    if (!next) return
    const tick = () => {
      const diff = new Date(next.startAt).getTime() - Date.now()
      const isLive = isBookingLive(next)
      setLive(isLive)
      setJoinable(isLive || (next.status === 'CONFIRMED' && diff > 0 && diff <= 5 * 60_000))
      if (diff <= 0) { setCountdown({ d: 0, h: 0, m: 0 }); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setCountdown({ d, h, m })
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [next])

  if (loading) {
    return (
      <div className="rounded-card border border-ink-200 bg-white p-6 sm:p-8">
        <div className="motion-safe:animate-pulse space-y-3">
          <div className="h-3 w-32 bg-ink-100 rounded" />
          <div className="h-6 w-3/4 bg-ink-100 rounded" />
          <div className="h-4 w-1/2 bg-ink-100 rounded" />
        </div>
      </div>
    )
  }

  if (!next) {
    return (
      <EmptyState
        illustration="bookings"
        title="უახლოესი ჯავშანი არ არის"
        description="აირჩიე ექსპერტი და დაჯავშნე შენთვის მოსახერხებელი დრო."
        cta={{ label: 'ექსპერტები', href: '/tutors' }}
      />
    )
  }

  const tutorName = next.tutor?.user?.fullName ?? 'ექსპერტი'
  const tutorAvatar = next.tutor?.user?.avatarUrl
  // CATEGORY first, `specialty` only as the fallback — the reverse of what this
  // said until 2026-08-11. `specialty` is a frozen copy of the category NAME as
  // it read on approval day, so after a rename this line contradicted the same
  // expert's own card and profile („ბიზნესი" here, „ბიზნესი და ფინანსები"
  // there). The card and the profile show the category; so does this.
  const specialty = next.tutor?.category?.name ?? next.tutor?.specialty ?? ''
  // Same wording as the shared StatusPill so the hero never contradicts the
  // list below. "ცოცხალია" only when the CLOCK says the session is running
  // (derived via isBookingLive) — never from the dead raw 'LIVE' status.
  const statusLabel = live
    ? 'ცოცხალია'
    : next.status === 'CONFIRMED' || next.status === 'LIVE'
      ? 'დადასტურდა'
      : 'ელოდება დადასტურებას'

  // gradient-dark is the named token — no ad-hoc washes on top (design canon).
  return (
    <article className="relative overflow-hidden rounded-card bg-gradient-dark text-white">
      <div className="relative grid lg:grid-cols-[1fr_280px]">
        <div className="p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-6 font-display text-micro font-semibold uppercase">
            <span className="inline-flex items-center gap-1.5 text-white/75">
              <Icon.clock className="w-3 h-3" />
              {sessionDateTime(next.startAt)} · {next.durationMin} წთ
            </span>
            <TzNote className="text-white/50" />
            <span className="text-white/25">·</span>
            {/* escrow is only claimed once payments are actually live — until
                then the honest line is the flat price alone. */}
            <span className="inline-flex items-center gap-1.5 text-brand-300">
              {PAYMENTS_LIVE ? (
                <>
                  <Icon.shieldCheck className="w-3 h-3" />
                  დაცული გადახდა ₾{next.price}
                </>
              ) : (
                <>₾{next.price}</>
              )}
            </span>
            <span className="text-white/25">·</span>
            <span className="inline-flex items-center gap-1.5 text-white/75">{statusLabel}</span>
          </div>

          <div className="mb-5 max-w-[560px]">
            <div className="font-display text-micro font-semibold uppercase text-white/45 mb-2">თემა</div>
            <h2 className="font-display text-h2 sm:text-h1 font-bold tracking-[-0.022em] leading-[1.1] text-white">
              {next.topic}
            </h2>
          </div>

          <div className="inline-flex items-center gap-2.5">
            <div className="w-9 h-10 sm:h-9 rounded-full overflow-hidden ring-2 ring-white/15 bg-white/10 shrink-0">
              {tutorAvatar ? (
                <img src={tutorAvatar} alt={tutorName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full inline-flex items-center justify-center text-white font-display font-bold text-body">{tutorName.charAt(0)}</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-display font-semibold text-body text-white">{tutorName}</div>
              {specialty && <div className="text-meta text-white/55 mt-0.5">{specialty}</div>}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            {joinable && (
              <Link href={`/session/${next.id}`} className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
                <Icon.video className="w-4 h-4" />
                ვიდეოოთახში
              </Link>
            )}
            <button type="button" onClick={() => onOpenDetail(next.id)} className="h-11 px-4 rounded-btn bg-white/10 hover:bg-white/15 backdrop-blur text-white font-display font-medium text-small inline-flex items-center gap-1.5 transition-colors duration-fast">
              დეტალები
            </button>
          </div>
        </div>

        {live ? (
          <div className="relative bg-white/[0.06] border-t lg:border-t-0 lg:border-l border-white/10 p-6 sm:p-8 flex flex-col justify-center">
            <div className="font-display text-micro font-semibold uppercase text-white/50 mb-3">ახლა</div>
            <div className="inline-flex items-center gap-2.5">
              <span className="font-display text-h1 font-bold leading-none tracking-[-0.02em] text-white">მიმდინარეობს</span>
            </div>
          </div>
        ) : countdown && (
          <div className="relative bg-white/[0.06] border-t lg:border-t-0 lg:border-l border-white/10 p-6 sm:p-8 flex flex-col justify-center">
            <div className="font-display text-micro font-semibold uppercase text-white/50 mb-3">დაიწყება</div>
            {/* OFF-RAMP (56px, not a ramp step): the dd/hh/mm row is
                geometry-locked — at 390px the card leaves ~294px and the row
                already measures ~283px; the ramp's next step up (text-hero,
                64px) pushes it to ~303px and the minutes fall off the card. */}
            <div className="flex items-baseline gap-2">
              {countdown.d > 0 && (
                <>
                  <span className="font-display text-[56px] font-bold leading-none tabular-nums tracking-[-0.04em]">{String(countdown.d).padStart(2, '0')}</span>
                  <span className="font-display text-body-lg font-semibold text-white/60">დღე</span>
                </>
              )}
              <span className="font-display text-[56px] font-bold leading-none tabular-nums tracking-[-0.04em] ml-1">{String(countdown.h).padStart(2, '0')}</span>
              <span className="font-display text-body-lg font-semibold text-white/60">სთ</span>
              <span className="font-display text-display font-bold leading-none tabular-nums tracking-[-0.04em] ml-1">{String(countdown.m).padStart(2, '0')}</span>
              <span className="font-display text-body-lg font-semibold text-white/60">წთ</span>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}