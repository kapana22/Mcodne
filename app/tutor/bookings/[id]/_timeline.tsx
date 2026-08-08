'use client'
// /tutor/bookings/[id] — the session status timeline.

import { Icon } from '@/components/Icon'
import { BookingStatus } from './_model'

/* Minimal 4-step lifecycle trail. Canceled/no-show render a terminal state
   instead of fake progress. Pure presentation from status + clock. */
export function SessionTimeline({ status, startAt, durationMin }: { status: BookingStatus; startAt: string; durationMin: number }) {
  if (status === 'CANCELED' || status === 'NO_SHOW') {
    return (
      <div className="rounded-card border border-ink-200 bg-ink-50/60 px-5 py-3.5 flex items-center gap-2.5">
        <Icon.x className="w-4 h-4 text-ink-400 shrink-0" />
        <span className="text-small text-ink-500">
          {status === 'CANCELED' ? 'ჯავშანი გაუქმდა.' : 'სესია არ შედგა.'}
        </span>
      </div>
    )
  }
  const ended = new Date(startAt).getTime() + durationMin * 60_000 < Date.now()
  const doneCount =
    status === 'COMPLETED' ? 4
    : ended ? 3
    : status !== 'PREPARING' ? 2
    : 1
  const STEPS = ['მოთხოვნა', 'დადასტურება', 'სესია', 'დასრულება']
  return (
    <div className="rounded-card border border-ink-200 bg-white shadow-xs px-5 py-4">
      <ol className="flex items-center" aria-label="ჯავშნის ეტაპები">
        {STEPS.map((label, i) => {
          const done = i < doneCount
          const current = i === doneCount
          return (
            <li key={label} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
              {i > 0 && <span className={`flex-1 h-px mx-2 ${done ? 'bg-brand-400' : 'bg-ink-200'}`} aria-hidden />}
              <span className="flex flex-col items-center gap-1.5 shrink-0">
                <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center border ${
                  done ? 'bg-brand-600 border-brand-600 text-white'
                  : current ? 'bg-white border-brand-400 text-brand-600'
                  : 'bg-white border-ink-300 text-transparent'
                }`}>
                  {/* Canon bans status dots — the current step is carried by
                      the ring color + the bolder label underneath. */}
                  {done ? <Icon.check className="w-3 h-3" /> : null}
                </span>
                <span className={`font-display text-micro font-semibold uppercase ${done || current ? 'text-ink-800' : 'text-ink-400'}`}>
                  {label}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
