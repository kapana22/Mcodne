'use client'
// Month calendar for the booking flow — moved verbatim from
// app/tutors/[id]/client.tsx (DESIGN_FIX_PROMPT 1.1). Viewer-local dates.
import React from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { KA_MONTHS_LONG as KA_MONTHS_FULL } from '@/lib/kaDate'
import { WEEK_HEADERS, isoWeekday, startOfDay, sameDay, dayKey, type StartsByDay } from './slots'
import { CalendarTzLabel } from './TzLabels'

export const Calendar = ({
  viewMonth,
  selected,
  startsByDay,
  onSelect,
  onPrev,
  onNext,
}: {
  viewMonth: Date
  selected: Date | null
  /** Already-derived bookable starts per day (openStartsByDay) — the calendar
      never re-reads raw rows, so its availability marks agree with the time
      picker by construction, for the CHOSEN service length. */
  startsByDay: StartsByDay
  onSelect: (d: Date) => void
  onPrev: () => void
  onNext: () => void
}) => {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startPad = isoWeekday(first)
  const today = startOfDay(new Date())

  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i))

  // Bound month nav so users can't scroll to arbitrary past months.
  const canPrev = new Date(year, month, 1).getTime() > new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  // …and symmetric forward: no paging past the last month that still holds a
  // BOOKABLE start (nothing to see there — every further page is empty).
  let lastSlotMs = 0
  for (const arr of startsByDay.values()) {
    const last = arr[arr.length - 1]
    if (last && last.getTime() > lastSlotMs) lastSlotMs = last.getTime()
  }
  const canNext = lastSlotMs > 0 && new Date(year, month + 1, 1).getTime() <= lastSlotMs

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="წინა თვე"
          className="w-11 h-11 rounded-btn hover:bg-ink-100 text-ink-600 inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon.chevL className="w-4 h-4" />
        </button>
        <div className="font-display text-[15px] font-bold text-ink-900 tracking-tight">{KA_MONTHS_FULL[month]} {year}</div>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="შემდეგი თვე"
          className="w-11 h-11 rounded-btn hover:bg-ink-100 text-ink-600 inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon.chevR className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEK_HEADERS.map(w => (
          <Eyebrow key={w} tone="muted" className="text-center py-1">{w}</Eyebrow>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="aspect-square" />
          const isToday = sameDay(d, today)
          const isSelected = selected != null && sameDay(d, selected)
          const isPast = d.getTime() < today.getTime()
          // Derived starts only — already past-, busy- and length-filtered by
          // lib/availability, so a marked day can never lead to a dead-end tap.
          const slots = startsByDay.get(dayKey(d))?.length ?? 0
          const disabled = isPast || slots === 0
          // Status dots are banned by canon, but "this day is bookable" is real
          // information — so an open day gets a brand tint plus an underline
          // accent whose WIDTH carries the density the dot-count used to
          // (more free time → longer rule). Reads at a glance, no dots.
          const barW = slots >= 6 ? 'w-5' : slots >= 4 ? 'w-4' : slots >= 2 ? 'w-3' : 'w-2'

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(d)}
              className={`relative aspect-square rounded-btn flex flex-col items-center justify-center font-display font-semibold transition-colors disabled:cursor-not-allowed ${
                isSelected
                  ? 'bg-brand-500 text-white'
                  : isToday
                    ? 'bg-white text-brand-800 ring-1 ring-brand-300'
                    : disabled
                      ? 'text-ink-300'
                      : 'bg-brand-50 text-brand-900 hover:bg-brand-100'
              }`}
            >
              <span className="text-[13.5px] tabular-nums leading-none">{d.getDate()}</span>
              {!disabled && (
                <span
                  aria-hidden
                  className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 h-[2px] rounded-full ${barW} ${
                    isSelected ? 'bg-white/80' : 'bg-brand-500'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-ink-100 space-y-2 text-[11px] text-ink-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="relative w-5 h-5 rounded-btn bg-brand-50 inline-flex items-center justify-center">
              <span aria-hidden className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full bg-brand-500" />
            </span>
            <span>თავისუფალი დროები</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-white ring-1 ring-brand-300" />
            <span>დღეს</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon.globe className="w-3.5 h-3.5 text-ink-400" />
          <CalendarTzLabel />
        </div>
      </div>
    </div>
  )
}
