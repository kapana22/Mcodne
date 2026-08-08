'use client'
// Step 1 of the booking flow for multi-tier experts: choose the session type
// (DESIGN_FIX_PROMPT 1.2 — session types as named products). Rendered only
// when the expert has 2+ consultation tiers; single/no-tier experts skip
// straight to the slot step.
//
// NB: no „პოპულარული" tag here — the API payload carries no per-tier booking
// counts, so a most-booked signal would be fabricated. When a real signal
// ships in /api/tutors/[id], it can gate the tag.
import React from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { orderedTiers, tierPriceLabel, isFreeTier, type ConsultationItem } from './slots'

export const TierStep = ({
  consultations,
  selected,
  onSelect,
}: {
  consultations: ConsultationItem[]
  selected: ConsultationItem | null
  onSelect: (c: ConsultationItem) => void
}) => (
  // p-5 below sm so the content lines up with the sheet's own px-5 gutter.
  <div className="p-5 sm:p-7 lg:p-10">
    <Eyebrow className="mb-2">სესიის ტიპი</Eyebrow>
    <h3 className="font-display text-h2 font-bold text-ink-900 tracking-tight leading-tight">აირჩიე სერვისი</h3>
    <p className="mt-1 text-small text-ink-600 leading-[1.55]">ფასი ფიქსირებულია — რასაც ხედავ, იმას იხდი.</p>

    {/* Shared ordering: flagship (longest PAID) first, free intro last — the
        same order the profile's „განრიგი" chips and services grid use, so the
        visitor never sees the tiers rearrange between surfaces. */}
    <div className="mt-6 grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="სესიის ტიპი">
      {orderedTiers(consultations).map(c => {
        const on = selected?.id === c.id
        const free = isFreeTier(c)
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(c)}
            className={`relative text-left rounded-card border p-5 transition-all duration-fast flex flex-col motion-safe:active:scale-[0.99] ${
              on
                ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-200'
                : 'border-ink-200 bg-white hover:border-brand-400'
            }`}
          >
            <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight leading-tight pr-6">{c.title}</div>
            {c.description && (
              <p className="text-small text-ink-600 mt-1.5 leading-[1.55] flex-1">{c.description}</p>
            )}
            <div className="mt-4 pt-3.5 border-t border-ink-100 flex items-baseline justify-between">
              <Eyebrow as="span" tone="muted" className="tabular-nums">{c.minutes} წუთი</Eyebrow>
              {/* „უფასო", never „₾0" — see tierPriceLabel. */}
              <span className={`font-display text-h3 font-bold tabular-nums tracking-tight leading-none ${free ? 'text-brand-700' : 'text-ink-900'}`}>{tierPriceLabel(c)}</span>
            </div>
            {on && (
              <span className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full bg-brand-500 inline-flex items-center justify-center">
                <Icon.check className="w-3 h-3 text-white" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  </div>
)
