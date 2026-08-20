'use client'
// Inline availability for the profile's „განრიგი" section (DESIGN_FIX_PROMPT
// 1.6): the SAME Calendar + DayTimeline the booking flow uses, rendered
// in-page so availability is visible before any commitment. Viewer-local tz
// with the honest CalendarTzLabel; tapping a time hands the start to the
// parent, which opens the booking Sheet with that slot preselected.
//
// Empty calendar: never a dead end — compact fallback with a real, existing
// request path (email to the team, same channel the /experts helper strip
// uses; pre-booking chat does not exist yet).
import React, { useState, useMemo } from 'react'
import { Icon } from '@/components/Icon'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { FEATURE_REQUEST_BOOKING } from '@/lib/flags'
import { isAbroadCategory } from '@/lib/abroad'
import {
  openStartsByDay, startsOnDay, firstOpenDay, toTimeChoices,
  orderedTiers, primaryService, tierPriceLabel,
  type ApiSlot, type BusySlot, type ConsultationItem,
} from './slots'
import { Calendar } from './Calendar'
import { DayTimeline } from './DayTimeline'

export const InlineAvailability = ({
  availability,
  busySlots,
  sessionMin,
  bufferMin = 0,
  priceLabel,
  tutorName,
  tutorId,
  consultations = [],
  onPickSlot,
  categorySlug = null,
  onPropose,
}: {
  availability: ApiSlot[]
  busySlots: BusySlot[]
  /** Fallback service length, used only when the expert publishes no tiers. */
  sessionMin: number
  bufferMin?: number
  /** Price string used only in the no-tier case (flat price / „₾N-დან“). */
  priceLabel: string
  tutorName: string
  /** Expert's category — request-based booking is scoped to it server-side
   *  (lib/abroad), so the CTA must be scoped identically or the button 409s. */
  categorySlug?: string | null
  /** Opens the booking sheet, where the „შემომთავაზე დრო" form lives. */
  onPropose?: () => void
  /** Used to send the visitor to THIS expert's thread when there are no times. */
  tutorId?: string
  /** The expert's real tiers. With 2+ of them this section owns the choice. */
  consultations?: ConsultationItem[]
  /** Carries the CHOSEN TIER out with the time — see the note below. */
  onPickSlot: (start: Date, service: ConsultationItem | null) => void
}) => {
  // Same two terms the server uses (the flag + lib/abroad), so the button can
  // never appear anywhere the POST would refuse it.
  const canProposeHere = FEATURE_REQUEST_BOOKING && isAbroadCategory(categorySlug) && !!onPropose
  /* Duration is chosen BEFORE times here, and that ordering is the whole point
   * of this component. Times used to be derived from the shortest service and
   * the tier was answered afterwards in the sheet — so a start picked here
   * could stop being legal the moment the visitor chose what they actually
   * wanted, and the flow dropped it without a word. Now the grid always shows
   * times that fit the selected service, and the selection travels with the
   * tap, so nothing downstream can invalidate it. */
  const tiers = useMemo(() => orderedTiers(consultations), [consultations])
  const [tierId, setTierId] = useState<string | null>(null)
  const activeTier = useMemo(
    () => tiers.find(t => t.id === tierId) ?? primaryService(consultations),
    [tiers, tierId, consultations],
  )
  const activeMin = activeTier?.minutes ?? sessionMin
  const activePrice = activeTier ? tierPriceLabel(activeTier) : priceLabel

  // ONE derivation feeds both panes: windows − bookings − the ACTIVE service.
  const rules = useMemo(() => ({ bufferMin }), [bufferMin])
  const startsByDay = useMemo(
    () => openStartsByDay(availability, busySlots, activeMin, rules),
    [availability, busySlots, activeMin, rules],
  )
  const nextFree = useMemo(() => firstOpenDay(startsByDay), [startsByDay])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [viewMonth, setViewMonth] = useState<Date | null>(null)

  // Seed with the first actually-bookable day once (data arrives async).
  const effectiveDate = selectedDate ?? nextFree
  const effectiveMonth = viewMonth ?? (effectiveDate
    ? new Date(effectiveDate.getFullYear(), effectiveDate.getMonth(), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  /* Service switcher. Rendered ABOVE both the calendar and the empty state:
   * a 60-min service can be fully booked while a 15-min one still fits in the
   * gaps, so hiding the switcher on „no times" would strand the visitor on the
   * one duration that happens to be full. Only shown when there is a real
   * choice (2+ tiers). */
  const switcher = tiers.length >= 2 ? (
    <div className="mb-4">
      <div className="text-meta text-ink-500 mb-2">აირჩიე სესია — დროები მის მიხედვით ჩანს</div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="სესიის ტიპი">
        {tiers.map(t => {
          const on = activeTier?.id === t.id
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => setTierId(t.id)}
              className={`h-11 px-3.5 rounded-pill border font-display text-small font-semibold inline-flex items-center gap-2 transition-all duration-fast motion-safe:active:scale-[0.97] ${
                on ? 'bg-brand-600 text-white border-brand-500 shadow-xs' : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
              }`}
            >
              <span className="tabular-nums">{t.minutes} წთ</span>
              <span className={on ? 'text-white' : 'text-ink-500'}>·</span>
              <span className="tabular-nums">{tierPriceLabel(t)}</span>
            </button>
          )
        })}
      </div>
    </div>
  ) : null

  if (nextFree === null) {
    // Compact empty state (canon: icon + one line + one action).
    return (
      <div>
        {switcher}
        <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-6 py-8 text-center">
          <div className="w-11 h-11 mx-auto rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-3">
            <Icon.cal className="w-5 h-5" />
          </div>
          <div className="font-display text-body-lg font-bold text-ink-900">
            {tiers.length >= 2 && activeTier
              ? `${activeTier.minutes} წთ სესიისთვის თავისუფალი დრო არ არის`
              : 'თავისუფალი დროები ჯერ არ არის'}
          </div>
          {/* This said „მოგვწერე … ხშირად ცალკე დროსაც ვაწყობთ" and mailed
              SUPPORT — while the booking modal's identical empty state said
              „მიწერე — ხშირად ცალკე დროსაც ხსნიან" and opened the EXPERT's
              thread. Two screens, one situation, opposite instructions, and
              the support one promised a scheduling service nobody runs. The
              expert is the person who can actually open a time. */}
          <p className="text-small text-ink-500 mt-1.5 max-w-[360px] mx-auto leading-snug">
            {tiers.length >= 2
              ? 'სცადე უფრო მოკლე სესია — ან მიწერე ექსპერტს, ხშირად ცალკე დროსაც ხსნიან.'
              : 'მიწერე ექსპერტს — ხშირად ცალკე დროსაც ხსნიან.'}
          </p>
          {/* THE THIRD CTA SURFACE. „შემომთავაზე დრო" lives inside the booking
              sheet, and this empty state is what a slot-less expert's profile
              actually renders — so without this the whole feature is
              unreachable for exactly the experts it exists for (verified live
              on a slot-less profile, 2026-08-04). Same category scope as the
              server, or the button would 409. */}
          {canProposeHere && (
            <button
              type="button"
              onClick={onPropose}
              className="mt-4 inline-flex h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide items-center gap-1.5 transition-colors duration-fast"
            >
              შემომთავაზე დრო <Icon.arrow className="w-3.5 h-3.5" />
            </button>
          )}
          <a
            href={tutorId ? `/experts/${tutorId}?intent=message` : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`დროის მოთხოვნა — ${tutorName}`)}`}
            className={`mt-4 inline-flex h-11 px-5 rounded-btn font-display font-semibold text-small tracking-wide items-center gap-1.5 transition-colors duration-fast ${
              canProposeHere
                ? 'ml-2 bg-white border border-ink-200 hover:border-ink-300 text-ink-800'
                : 'bg-brand-600 hover:bg-brand-700 text-white'
            }`}
          >
            მიწერე ექსპერტს <Icon.arrow className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    )
  }

  const timeChoices = toTimeChoices(startsOnDay(startsByDay, effectiveDate), activeMin)

  return (
    <div>
      {switcher}
      <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="grid lg:grid-cols-[360px_1fr]">
        <div className="border-b lg:border-b-0 lg:border-r border-ink-100 p-3 sm:p-6">
          <Calendar
            viewMonth={effectiveMonth}
            selected={effectiveDate}
            startsByDay={startsByDay}
            onSelect={(d) => setSelectedDate(d)}
            onPrev={() => setViewMonth(new Date(effectiveMonth.getFullYear(), effectiveMonth.getMonth() - 1, 1))}
            onNext={() => setViewMonth(new Date(effectiveMonth.getFullYear(), effectiveMonth.getMonth() + 1, 1))}
          />
        </div>
        {/* Plain in-flow pane: the row is as tall as whichever side is taller,
            and the times list is never scrolled or clipped (2026-08-02 — the
            capped-pane version is gone, see the note in DayTimeline). */}
        <div className="p-4 sm:p-6">
          {effectiveDate ? (
            <DayTimeline
              date={effectiveDate}
              selected={null}
              // The tap carries the tier out with the time, so the sheet opens
              // with the service already answered and the start already legal.
              onSelect={(start) => onPickSlot(start, activeTier ?? null)}
              duration={activeMin}
              price={activePrice}
              timeChoices={timeChoices}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
              <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
                <Icon.cal className="w-5 h-5" />
              </div>
              <div className="font-display text-body-lg font-bold text-ink-900">აირჩიე დღე კალენდარში</div>
              <p className="text-small text-ink-500 mt-2 max-w-[280px]">გამოჩნდება თავისუფალი დროები.</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
