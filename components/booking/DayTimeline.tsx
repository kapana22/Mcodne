'use client'
// Per-day time picker (band-grouped) — moved verbatim from
// app/tutors/[id]/client.tsx (DESIGN_FIX_PROMPT 1.1). Times render in the
// viewer's local tz; the Calendar footer carries the honest tz label.
import React from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { KA_MONTHS_LONG as KA_MONTHS_FULL } from '@/lib/kaDate'
import { DAY_NAMES_FULL, TIME_BANDS, isoWeekday, fmtHM, type TimeChoice } from './slots'

export const DayTimeline = ({
  date,
  selected,
  onSelect,
  duration,
  price,
  timeChoices,
}: {
  date: Date
  selected: Date | null
  onSelect: (t: Date) => void
  duration: number
  price: string
  timeChoices: TimeChoice[]
}) => {
  const dayLabel = DAY_NAMES_FULL[isoWeekday(date)]
  const free = timeChoices.filter(s => !s.taken).length

  if (timeChoices.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
        <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
          <Icon.cal className="w-5 h-5" />
        </div>
        <div className="font-display text-[15px] font-bold text-ink-900">ამ დღეს თავისუფალი დრო არ არის</div>
        <p className="text-[13px] text-ink-500 mt-2 max-w-[280px]">აირჩიე სხვა დღე კალენდარში.</p>
      </div>
    )
  }

  const bands = TIME_BANDS.map(b => ({
    ...b,
    slots: timeChoices.filter(s => {
      const h = s.start.getHours()
      return h >= b.from && h < b.to
    }),
  })).filter(b => b.slots.length > 0)

  return (
    <div>
      <div className="mb-6">
        <Eyebrow tone="muted" className="mb-1.5">არჩეული დღე</Eyebrow>
        <h3 className="font-display text-[20px] font-bold text-ink-900 tracking-tight">{dayLabel}, {date.getDate()} {KA_MONTHS_FULL[date.getMonth()]}</h3>
        <p className="text-[13px] text-ink-600 mt-1 tabular-nums">{timeChoices.length} დრო · {free} თავისუფალი · {timeChoices.length - free} დაჯავშნული</p>
      </div>

      <div className="space-y-6">
        {bands.map(b => {
          const bandFree = b.slots.filter(s => !s.taken).length
          return (
            <div key={b.id}>
              <div className="flex items-baseline justify-between mb-2.5">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-display text-[14px] font-bold text-ink-900 tracking-tight">{b.l}</span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-500">{b.range}</span>
                </div>
                <Eyebrow as="span" className="tabular-nums">{bandFree} თავისუფალი</Eyebrow>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {b.slots.map((s, i) => {
                  const active = selected != null && s.start.getTime() === selected.getTime() && !s.taken
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={s.taken}
                      onClick={() => onSelect(s.start)}
                      className={`p-3 rounded-card text-left border transition-all disabled:cursor-not-allowed motion-safe:active:scale-[0.98] ${
                        s.taken
                          ? 'border-ink-200 bg-ink-50/60'
                          : active
                            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                            : 'border-ink-200 bg-white hover:border-brand-400 hover:bg-brand-50/40'
                      }`}
                    >
                      <div className={`font-display text-[14px] font-bold tabular-nums tracking-tight ${s.taken ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{fmtHM(s.start)} – {fmtHM(s.end)}</div>
                      <div className="text-[11.5px] mt-0.5">
                        {s.taken ? (
                          <span className="text-ink-400 font-display font-medium">დაჯავშნული</span>
                        ) : active ? (
                          <span className="text-brand-700 font-display font-semibold">არჩეული · {duration} წუთი</span>
                        ) : (
                          <span className="text-ink-600 tabular-nums">{duration} წთ · {price}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
