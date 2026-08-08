'use client'
// /student/bookings/[id] — the sticky mobile action bar.

import { useEffect } from 'react'
import Link from 'next/link'
import { isBookingLive } from '@/lib/bookingLive'
import { Icon } from '@/components/Icon'
import { Booking, fmtDate, fmtTime, useCountdown } from './_model'

/* ───── Mobile sticky action bar ─────
   Phones had no persistent CTA — the primary action lived far up in the Hero
   rail. Fixed to the viewport bottom (lg:hidden) and flags the body with
   data-mobile-cta so the cookie banner lifts above it (globals.css), same
   convention as the tutor-profile booking bar. Terminal statuses (COMPLETED /
   CANCELED / NO_SHOW) get a "back to bookings" bar instead of nothing:
   BottomNav hides all five tabs on this route, so without it a finished
   booking has NO persistent way out at 390px. */
export const MobileActionBar = ({ booking, onReschedule, onCancel }: { booking: Booking; onReschedule: () => void; onCancel: () => void }) => {
  const status = booking.status
  const start = new Date(booking.startAt)
  // 1s tick — keeps the countdown hint and the live/joinable switch fresh.
  const cd = useCountdown(status === 'PREPARING' || status === 'CONFIRMED' ? start : null)
  const live = isBookingLive(booking)
  const joinable = live || (status === 'CONFIRMED' && cd !== null && cd.diff <= 5 * 60_000)
  const terminal = status === 'COMPLETED' || status === 'CANCELED' || status === 'NO_SHOW'
  const backHref = `/student/bookings?tab=${status === 'CANCELED' ? 'canceled' : 'past'}`

  useEffect(() => {
    document.body.setAttribute('data-mobile-cta', '1')
    // globals.css only lifts the COOKIE BANNER for [data-mobile-cta]; nothing
    // reserves page space, so this fixed bar used to sit on top of
    // WorkspaceFooter. Reserve it here (mobile only) and clean up on unmount.
    const mq = window.matchMedia('(max-width: 1023.98px)')
    const apply = () => {
      if (!mq.matches) { document.body.style.paddingBottom = ''; return }
      document.body.style.paddingBottom = 'calc(76px + env(safe-area-inset-bottom, 0px))'
      // Older engines may reject env() from the CSSOM — fall back to a flat value.
      if (!document.body.style.paddingBottom) document.body.style.paddingBottom = '88px'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => {
      document.body.removeAttribute('data-mobile-cta')
      document.body.style.paddingBottom = ''
      mq.removeEventListener('change', apply)
    }
  }, [])

  const hint = cd
    ? cd.d > 0 ? `${cd.d} დღე ${cd.h} სთ` : cd.h > 0 ? `${cd.h} სთ ${cd.m} წთ` : `${Math.max(1, cd.m)} წთ`
    : ''

  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-overlay bg-white border-t border-ink-200 shadow-[0_-4px_20px_rgba(46,42,33,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="px-4 py-3 flex items-center gap-2.5">
        {status === 'PREPARING' ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-display text-small font-bold text-ink-900 leading-tight truncate">ელოდება დადასტურებას</div>
              <div className="mt-0.5 text-meta text-ink-500 tabular-nums truncate">{fmtDate(start)} · {fmtTime(start)}</div>
            </div>
            <button type="button" onClick={onReschedule} className="shrink-0 h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small transition-colors duration-fast">
              გადადება
            </button>
            <button type="button" onClick={onCancel} className="shrink-0 h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-danger-50 hover:border-danger-200 text-ink-600 hover:text-danger-700 font-display font-semibold text-small transition-colors duration-fast">
              გაუქმება
            </button>
          </>
        ) : joinable ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-display text-small font-bold text-brand-800 leading-tight truncate">{live ? 'სესია მიმდინარეობს' : 'იწყება ახლა'}</div>
              <div className="mt-0.5 text-meta text-ink-500 truncate">{booking.topic}</div>
            </div>
            <Link href={`/session/${booking.id}`} className="tap-shrink shrink-0 h-12 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg inline-flex items-center gap-2 transition-colors duration-fast">
              <Icon.video className="w-4 h-4" /> ვიდეოოთახში
            </Link>
          </>
        ) : terminal ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-display text-small font-bold text-ink-900 leading-tight truncate">
                {status === 'COMPLETED' ? 'სესია დასრულდა' : status === 'CANCELED' ? 'ჯავშანი გაუქმდა' : 'სესია არ შედგა'}
              </div>
              <div className="mt-0.5 text-meta text-ink-500 truncate">{booking.topic}</div>
            </div>
            <Link href={backHref} className="shrink-0 h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small inline-flex items-center gap-1.5 transition-colors duration-fast">
              <Icon.chevL className="w-3.5 h-3.5" /> ჯავშნებში დაბრუნება
            </Link>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-display text-small font-bold text-ink-900 leading-tight truncate">დაწყებამდე დარჩა <span className="tabular-nums">{hint}</span></div>
              <div className="mt-0.5 text-meta text-ink-500 truncate">გაიხსნება 5 წუთით ადრე</div>
            </div>
            <button type="button" disabled className="shrink-0 h-12 px-5 rounded-btn bg-ink-200 text-ink-500 font-display font-semibold text-body inline-flex items-center gap-2 cursor-not-allowed">
              <Icon.video className="w-4 h-4" /> ვიდეოოთახში
            </button>
          </>
        )}
      </div>
    </div>
  )
}