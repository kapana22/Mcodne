'use client'
// Per-day time picker (band-grouped) — moved verbatim from
// app/experts/[slug]/client.tsx (DESIGN_FIX_PROMPT 1.1). Times render in the
// viewer's local tz; the Calendar footer carries the honest tz label.
//
// Every `timeChoices` entry is BOOKABLE: openness is derived (windows − busy −
// service length), so a taken time simply yields no start. The old
// struck-through „დაჯავშნული" tile is gone with the `taken` flag — on a 15-min
// grid it would have painted a wall of dead tiles around every booking.
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
  dayNamedByHost = false,
}: {
  date: Date
  selected: Date | null
  onSelect: (t: Date) => void
  duration: number
  price: string
  timeChoices: TimeChoice[]
  /** The host already names this day right above the list (the booking sheet's
      collapsed day trigger, below lg). Printing „არჩეული დღე" + the same date
      again underneath cost ~85px of the shortest scroll area in the product,
      to say a thing the user had just tapped. Hidden below lg only — the
      profile's in-page schedule has no such trigger and keeps the heading. */
  dayNamedByHost?: boolean
}) => {
  /* NO internal scroll and NO „show more" (2026-08-02, user's call, and it is
   * the right one): the list simply renders every bookable start and the
   * section grows to fit. A capped pane cut both ways — 30 starts hid behind a
   * nested scrollbar, and a 5-start day left ~300px of empty pane below the
   * chips. What actually fixed the height was the compact chip grid, not the
   * cap. Don't reintroduce a scroll container here. */
  const dayLabel = DAY_NAMES_FULL[isoWeekday(date)]
  const free = timeChoices.length

  if (timeChoices.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
        <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
          <Icon.cal className="w-5 h-5" />
        </div>
        <div className="font-display text-body-lg font-bold text-ink-900">ამ დღეს თავისუფალი დრო არ არის</div>
        <p className="text-small text-ink-500 mt-2 max-w-[280px]">აირჩიე სხვა დღე.</p>
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
      <div className="mb-4">
        <div className={dayNamedByHost ? 'hidden lg:block' : ''}>
          <Eyebrow tone="muted" className="mb-1.5">არჩეული დღე</Eyebrow>
          <h3 className="font-display text-h2 font-bold text-ink-900 tracking-tight">{dayLabel}, {date.getDate()} {KA_MONTHS_FULL[date.getMonth()]}</h3>
        </div>
        {/* Duration and price live HERE, once. They used to repeat on every
            single tile — the same seven characters printed 29 times down a
            column, which is most of why this section grew so tall. */}
        <p className="text-small text-ink-600 mt-1 tabular-nums">
          {free} თავისუფალი დრო <span className="text-ink-400">·</span> {duration} წთ <span className="text-ink-400">·</span> {price}
        </p>
      </div>

      {/* Arrow movement across the whole day, ACROSS bands (2026-07-30): after
          picking a day with the calendar's arrows you would otherwise have to
          Tab through every time to reach the late ones. Deliberately additive —
          every time stays in the tab order, so this can only add a way to move,
          never take one away. The DOM order is chronological, so „next button"
          and „next time" are the same thing and no index bookkeeping is needed. */}
      <div
        className="space-y-5"
        onKeyDown={e => {
          const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
            : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1
            : 0
          if (!dir) return
          const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
          const at = all.indexOf(document.activeElement as HTMLButtonElement)
          if (at < 0) return
          const next = all[at + dir]
          if (!next) return // stop at the ends — wrapping a time list reads as a glitch
          e.preventDefault()
          next.focus()
        }}
      >
        {bands.map(b => {
          const bandFree = b.slots.length
          return (
            <div key={b.id}>
              <div className="flex items-baseline justify-between mb-2">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-display text-body font-bold text-ink-900 tracking-tight">{b.l}</span>
                  <span className="font-mono text-meta tabular-nums text-ink-500">{b.range}</span>
                </div>
                <Eyebrow as="span" className="tabular-nums">{bandFree} თავისუფალი</Eyebrow>
              </div>
              {/* Columns track the PANE's width, not the page's: an auto-fill
                  track keeps a chip ~150–190px wide, so the label sits in a box
                  its own size instead of floating in the middle of a 240px
                  slab. `gap-2` matches that scale — 6px gutters around wide
                  tiles read as unrelated blocks, not a set. 118px is measured,
                  not guessed: „10:00 – 11:00" renders 80px wide and `px-3` adds
                  24, so 118 is the narrowest honest track — it fits three
                  columns in the profile's 394px pane (≈22px of air per side,
                  instead of 75).

                  Lowered 118 → 106 on 2026-08-04. 118 was measured against the
                  394px profile pane and never re-checked against the booking
                  sheet on a phone, where the pane is ~350px: 3×118+2×8 = 370
                  did not fit, so auto-fill fell back to TWO columns and the
                  time list rendered twice as tall as it needed to inside the
                  shortest scroll area in the flow. 106 is still ≥ the widest
                  measured label („10:00 – 11:00" is 78px + 24px of px-3 = 102),
                  it fits three columns from 334px up, and `1fr` still stretches
                  them — so the 394px pane is byte-identical at three columns. */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(106px,1fr))] gap-2">
                {b.slots.map((s, i) => {
                  const active = selected != null && s.start.getTime() === selected.getTime()
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onSelect(s.start)}
                      aria-pressed={active}
                      aria-label={`${fmtHM(s.start)}–${fmtHM(s.end)}, ${duration} წუთი, ${price}`}
                      className={`h-11 px-3 rounded-btn border inline-flex items-baseline justify-center gap-1.5 transition-all duration-fast motion-safe:active:scale-[0.97] ${
                        active
                          ? 'bg-brand-600 text-white border-brand-500 shadow-xs'
                          : 'border-ink-200 bg-white hover:border-brand-400 hover:bg-brand-50/40'
                      }`}
                    >
                      <span className={`font-display text-body font-bold tabular-nums tracking-tight ${active ? 'text-white' : 'text-ink-900'}`}>{fmtHM(s.start)}</span>
                      {/* Solid: white/75 on brand-600 is 3.43:1. */}
                      <span className={`text-meta tabular-nums ${active ? 'text-white' : 'text-ink-500'}`}>– {fmtHM(s.end)}</span>
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
