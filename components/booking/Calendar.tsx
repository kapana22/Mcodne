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

  // Roving-tabindex anchor. Preference order — the selected day, then today,
  // then the first day that can actually be booked, then day 1. Whichever it
  // lands on is the cell a Tab into the grid reaches, so it should be the one
  // the user would most likely act on.
  const dayRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const preferredIdx = React.useMemo(() => {
    const idxOf = (pred: (d: Date) => boolean) => cells.findIndex(c => c !== null && pred(c))
    if (selected) { const i = idxOf(d => sameDay(d, selected)); if (i >= 0) return i }
    const t = idxOf(d => sameDay(d, today)); if (t >= 0) return t
    const open = idxOf(d => d.getTime() >= today.getTime() && (startsByDay.get(dayKey(d))?.length ?? 0) > 0)
    if (open >= 0) return open
    return Math.max(0, cells.findIndex(c => c !== null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, selected?.getTime(), startsByDay])
  const [activeIdx, setActiveIdx] = React.useState(preferredIdx)
  // A date the arrows asked for that lives in the month we are paging TO. It
  // cannot be focused until that month has rendered, so it waits here.
  const pendingFocus = React.useRef<number | null>(null)
  // Paging the month rebuilds `cells`, so the old index would point at an
  // unrelated day (or past the end).
  React.useEffect(() => {
    const want = pendingFocus.current
    if (want !== null) {
      pendingFocus.current = null
      const i = cells.findIndex(c => c !== null && c.getTime() === want)
      // Keyboard paging keeps the keyboard: land on the day the user was
      // steering toward, not back at the month's default cell.
      if (i >= 0) { setActiveIdx(i); dayRefs.current[i]?.focus(); return }
    }
    setActiveIdx(preferredIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredIdx])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="წინა თვე"
          className="w-11 h-11 rounded-btn hover:bg-ink-100 text-ink-600 inline-flex items-center justify-center transition-colors duration-fast disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon.chevL className="w-4 h-4" />
        </button>
        <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{KA_MONTHS_FULL[month]} {year}</div>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="შემდეგი თვე"
          className="w-11 h-11 rounded-btn hover:bg-ink-100 text-ink-600 inline-flex items-center justify-center transition-colors duration-fast disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon.chevR className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEK_HEADERS.map(w => (
          <Eyebrow key={w} tone="muted" className="text-center py-1">{w}</Eyebrow>
        ))}
      </div>

      {/* KEYBOARD GRID (2026-07-30). The month used to be mouse-only: day cells
          carried no arrow handling, and the unavailable ones were `disabled`, so
          they were not even focusable — the most important step in the whole
          product could not be done from the keyboard.

          Roving tabindex: exactly ONE cell is in the tab order, arrows move
          which. That is the standard date-picker pattern and it also keeps the
          calendar from costing 30 Tab presses to step over.

          Unavailable days are now `aria-disabled` rather than `disabled` so the
          arrows can pass ACROSS them — a grid you cannot traverse is worse than
          one with dead cells. Enter on such a day does nothing, deliberately. */}
      <div
        role="grid"
        aria-label="აირჩიე დღე"
        onKeyDown={e => {
          // Movement is by DATE, not by cell index. Indices stop at the month
          // edge; dates don't — pressing ↓ on 31 July has to reach 7 August,
          // the way every real date picker behaves. Clamping there was the
          // first version and it felt broken at exactly the moment someone is
          // looking for the next free slot.
          const moveDays = (delta: number) => {
            e.preventDefault()
            const from = cells[activeIdx]
            if (!from) return
            const target = new Date(from.getFullYear(), from.getMonth(), from.getDate() + delta)
            const i = cells.findIndex(c => c !== null && c.getTime() === target.getTime())
            if (i >= 0) { setActiveIdx(i); dayRefs.current[i]?.focus(); return }
            // Off the visible month: page there and land on the target date
            // once it exists (pendingFocus, applied in the effect below). If
            // paging is not allowed we simply stay — there is nothing bookable
            // in that direction anyway.
            if (delta > 0 && canNext) { pendingFocus.current = target.getTime(); onNext() }
            else if (delta < 0 && canPrev) { pendingFocus.current = target.getTime(); onPrev() }
          }
          switch (e.key) {
            case 'ArrowLeft':  moveDays(-1); break
            case 'ArrowRight': moveDays(1); break
            case 'ArrowUp':    moveDays(-7); break
            case 'ArrowDown':  moveDays(7); break
            // Start / end of the displayed WEEK row.
            case 'Home':       moveDays(-(activeIdx % 7)); break
            case 'End':        moveDays(6 - (activeIdx % 7)); break
            case 'PageUp':     if (canPrev) { e.preventDefault(); onPrev() } break
            case 'PageDown':   if (canNext) { e.preventDefault(); onNext() } break
          }
        }}
        // gap-0.5 below sm: seven cells + six gaps have to fit a 360px phone,
        // where the old gap-1 left each day 36px against the 40px tap floor.
        className="grid grid-cols-7 gap-0.5 sm:gap-1"
      >
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
              ref={el => { dayRefs.current[i] = el }}
              type="button"
              // aria-disabled, NOT disabled — see the grid note above. The click
              // guard is what actually prevents selecting a dead day.
              aria-disabled={disabled || undefined}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              tabIndex={i === activeIdx ? 0 : -1}
              onFocus={() => setActiveIdx(i)}
              onClick={() => { if (!disabled) onSelect(d) }}
              className={`relative aspect-square min-h-[40px] rounded-btn flex flex-col items-center justify-center font-display font-semibold transition-colors duration-fast ${disabled ? 'cursor-not-allowed' : ''} ${
                isSelected
                  ? 'bg-brand-600 text-white'
                  : isToday
                    ? 'bg-white text-brand-800 ring-1 ring-brand-300'
                    : disabled
                      ? 'text-ink-300'
                      : 'bg-brand-50 text-brand-900 hover:bg-brand-100'
              }`}
            >
              <span className="text-body tabular-nums leading-none">{d.getDate()}</span>
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

      <div className="mt-6 pt-4 border-t border-ink-100 space-y-2 text-meta text-ink-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="relative w-5 h-5 rounded-btn bg-brand-50 inline-flex items-center justify-center">
              <span aria-hidden className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full bg-brand-500" />
            </span>
            <span>თავისუფალი დროები</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Same 20px rounded-btn plate as the „თავისუფალი დროები" swatch and
                as a real day cell. It used to be a 10px `rounded-sm` outline,
                which at that size read as an empty checkbox rather than as the
                today ring it is describing. */}
            <span className="w-5 h-5 rounded-btn bg-white ring-1 ring-brand-300 inline-block" />
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
