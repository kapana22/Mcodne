'use client'
// Inline availability for the profile's „განრიგი" section (DESIGN_FIX_PROMPT
// 1.6): the SAME Calendar + DayTimeline the booking flow uses, rendered
// in-page so availability is visible before any commitment. Viewer-local tz
// with the honest CalendarTzLabel; tapping a time hands the start to the
// parent, which opens the booking Sheet with that slot preselected.
//
// Empty calendar: never a dead end — compact fallback with a real, existing
// request path (email to the team, same channel the /tutors helper strip
// uses; pre-booking chat does not exist yet).
import React, { useState, useMemo } from 'react'
import { Icon } from '@/components/Icon'
import {
  groupSlotsByDay, enumerateTimes, computeNextFreeStart, startOfDay,
  type ApiSlot, type BusySlot,
} from './slots'
import { Calendar } from './Calendar'
import { DayTimeline } from './DayTimeline'

export const InlineAvailability = ({
  availability,
  busySlots,
  sessionMin,
  priceLabel,
  tutorName,
  onPickSlot,
}: {
  availability: ApiSlot[]
  busySlots: BusySlot[]
  sessionMin: number
  /** Price string for the slot cards — the flat price, or the honest
      „₾N-დან“ from-price when tiers differ. */
  priceLabel: string
  tutorName: string
  onPickSlot: (start: Date) => void
}) => {
  const slotsByDay = useMemo(() => groupSlotsByDay(availability), [availability])
  const nextFree = useMemo(
    () => computeNextFreeStart(availability, busySlots, sessionMin),
    [availability, busySlots, sessionMin],
  )
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [viewMonth, setViewMonth] = useState<Date | null>(null)

  // Seed with the first actually-bookable day once (data arrives async).
  const effectiveDate = selectedDate ?? (nextFree ? startOfDay(nextFree) : null)
  const effectiveMonth = viewMonth ?? (effectiveDate
    ? new Date(effectiveDate.getFullYear(), effectiveDate.getMonth(), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  if (nextFree === null) {
    // Compact empty state (canon: icon + one line + one action).
    return (
      <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-6 py-8 text-center">
        <div className="w-11 h-11 mx-auto rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-3">
          <Icon.cal className="w-5 h-5" />
        </div>
        <div className="font-display text-[15px] font-bold text-ink-900">თავისუფალი დროები ჯერ არ არის</div>
        <p className="text-[12.5px] text-ink-500 mt-1.5 max-w-[360px] mx-auto leading-snug">
          მოგვწერე შენი შეკითხვა — გუნდი ექსპერტს დაუკავშირდება და დრო ხშირად ინდივიდუალურად იხსნება.
        </p>
        <a
          href={`mailto:hi@mcodne.ge?subject=${encodeURIComponent(`დროის მოთხოვნა — ${tutorName}`)}`}
          className="mt-4 inline-flex h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide items-center gap-1.5 transition-colors"
        >
          მოგვწერე <Icon.arrow className="w-3.5 h-3.5" />
        </a>
      </div>
    )
  }

  const timeChoices = effectiveDate
    ? enumerateTimes(effectiveDate, availability, busySlots, sessionMin)
    : []

  return (
    <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="grid lg:grid-cols-[360px_1fr]">
        <div className="border-b lg:border-b-0 lg:border-r border-ink-100 p-4 sm:p-6">
          <Calendar
            viewMonth={effectiveMonth}
            selected={effectiveDate}
            slotsByDay={slotsByDay}
            onSelect={(d) => setSelectedDate(d)}
            onPrev={() => setViewMonth(new Date(effectiveMonth.getFullYear(), effectiveMonth.getMonth() - 1, 1))}
            onNext={() => setViewMonth(new Date(effectiveMonth.getFullYear(), effectiveMonth.getMonth() + 1, 1))}
          />
        </div>
        <div className="p-4 sm:p-6">
          {effectiveDate ? (
            <DayTimeline
              date={effectiveDate}
              selected={null}
              onSelect={onPickSlot}
              duration={sessionMin}
              price={priceLabel}
              timeChoices={timeChoices}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
              <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
                <Icon.cal className="w-5 h-5" />
              </div>
              <div className="font-display text-[15px] font-bold text-ink-900">აირჩიე დღე კალენდარში</div>
              <p className="text-[13px] text-ink-500 mt-2 max-w-[280px]">შემდეგ გამოჩნდება ხელმისაწვდომი დროები.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
