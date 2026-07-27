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
import type { ConsultationItem } from './slots'

export const TierStep = ({
  consultations,
  selected,
  onSelect,
}: {
  consultations: ConsultationItem[]
  selected: ConsultationItem | null
  onSelect: (c: ConsultationItem) => void
}) => (
  <div className="p-4 sm:p-7 lg:p-10">
    <Eyebrow className="mb-2">სესიის ტიპი</Eyebrow>
    <h3 className="font-display text-[20px] font-bold text-ink-900 tracking-tight leading-tight">აირჩიე სერვისი</h3>
    <p className="mt-1 text-[13px] text-ink-600 leading-[1.55]">ფასი ფიქსირებულია — რასაც ხედავ, იმას იხდი.</p>

    <div className="mt-6 grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="სესიის ტიპი">
      {consultations.map(c => {
        const on = selected?.id === c.id
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(c)}
            className={`relative text-left rounded-card border p-5 transition-all flex flex-col motion-safe:active:scale-[0.99] ${
              on
                ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-200'
                : 'border-ink-200 bg-white hover:border-brand-400'
            }`}
          >
            <div className="font-display text-[15px] font-bold text-ink-900 tracking-tight leading-tight pr-6">{c.title}</div>
            {c.description && (
              <p className="text-[12.5px] text-ink-600 mt-1.5 leading-[1.55] flex-1">{c.description}</p>
            )}
            <div className="mt-4 pt-3.5 border-t border-ink-100 flex items-baseline justify-between">
              <Eyebrow as="span" tone="muted" className="tabular-nums">{c.minutes} წუთი</Eyebrow>
              <span className="font-display text-[18px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">₾{c.price}</span>
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
