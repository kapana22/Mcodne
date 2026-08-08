'use client'
// Intake + details step. The „რისი განხილვა გინდა?" textarea is OPTIONAL as of
// 2026-08-04 (owner's call). It was required at ≥10 chars, on the reasoning that
// it raises session quality and doubles as dispute evidence — both still true,
// which is why the field, the placeholder and the „only the expert sees this"
// reassurance all stay. What changed is that it no longer BLOCKS: the booking
// funnel already lost 8 of 10 people between choosing a time and submitting,
// and a required essay at the last step is friction we chose not to pay for.
// The server never required it either (studentNotes is `.optional()`).
import React from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'

// Category-agnostic topic chips — the flow serves every expert sphere
// (business, law, psychology, …), so these must read naturally for all of
// them rather than assuming a VC/startup context. Feeds the required
// Booking.topic field.
export const TOPIC_OPTIONS = [
  'კონკრეტული პრობლემის განხილვა',
  'სტრატეგია და მიმართულება',
  'უკუკავშირი ჩემს გეგმაზე',
  'გადაწყვეტილების მიღება',
  'სხვა თემა',
]

export const MAX_INTAKE_CHARS = 500

export type DetailsState = { topic: string; goal: string }

// The last option ("სხვა თემა") switches the topic to a free-text field so the
// client can name their OWN topic instead of being forced into a preset.
const PRESET_TOPICS = TOPIC_OPTIONS.slice(0, -1)
const OTHER_TOPIC = TOPIC_OPTIONS[TOPIC_OPTIONS.length - 1]

export const IntakeStep = ({ value, onChange, summary }: { value: DetailsState; onChange: (v: DetailsState) => void; summary: React.ReactNode }) => {
  const goalLen = value.goal.trim().length
  // "Other" mode = the topic isn't one of the presets (custom string, or empty
  // right after tapping "სხვა თემა"). Then we show a text input to type it.
  const otherMode = !PRESET_TOPICS.includes(value.topic)
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-5 sm:gap-7 lg:gap-10 p-5 sm:p-7 lg:p-10">
      <div className="space-y-7">
        <div>
          <div className="mb-3">
            <label className="font-display text-micro font-semibold uppercase text-ink-700">თემა</label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TOPIC_OPTIONS.map(t => {
              const isOtherChip = t === OTHER_TOPIC
              const on = isOtherChip ? otherMode : value.topic === t
              return (
                <button
                  key={t}
                  type="button"
                  // Tapping "სხვა თემა" clears topic → the input below appears so
                  // the client types their own. Preset chips set the topic directly.
                  onClick={() => onChange({ ...value, topic: isOtherChip ? (otherMode ? value.topic : '') : t })}
                  className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-pill text-small font-display font-medium tracking-wide transition-colors duration-fast ${on ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50'}`}
                >
                  {on && <Icon.check className="w-3 h-3" />}
                  {t}
                </button>
              )
            })}
          </div>
          {otherMode && (
            <input
              type="text"
              value={value.topic}
              onChange={e => onChange({ ...value, topic: e.target.value.slice(0, 120) })}
              autoFocus
              placeholder="ჩაწერე შენი თემა"
              className="mt-2.5 w-full h-11 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body text-ink-900 placeholder:text-ink-400 transition-colors duration-fast"
            />
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="booking-intake" className="inline-flex items-center gap-2 font-display text-micro font-semibold uppercase text-ink-700">
              რისი განხილვა გინდა?
              <span className="text-meta font-normal normal-case tracking-normal text-ink-400 no-caps">სურვილისამებრ</span>
            </label>
            <span className="text-meta text-ink-500 tabular-nums">{value.goal.length} / {MAX_INTAKE_CHARS}</span>
          </div>

          <textarea
            id="booking-intake"
            value={value.goal}
            onChange={e => onChange({ ...value, goal: e.target.value.slice(0, MAX_INTAKE_CHARS) })}
            rows={5}
            placeholder="მაგ. მაქვს კონკრეტული სიტუაცია — მინდა გავიგო, როგორ მივუდგე."
            className="w-full px-3.5 py-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body text-ink-900 placeholder:text-ink-400 transition-colors duration-fast leading-[1.5] resize-none"
          />
          {/* Stacked below sm: side by side, the `shrink-0` privacy note took
              its full width and squeezed the left sentence into three ragged
              lines on a 375px screen. */}
          <div className="mt-2 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 text-meta">
            {goalLen > 0 ? (
              <span className="inline-flex items-center gap-1 text-brand-700"><Icon.check className="w-3 h-3" /> მზადაა</span>
            ) : (
              // Not an error any more — a reason. „Why bother" is the only thing
              // left that can persuade someone to fill an optional field.
              <span className="text-ink-500">ორი წინადადებაც კი ეხმარება ექსპერტს მომზადებაში.</span>
            )}
            <span className="inline-flex items-center gap-1 text-ink-500 shrink-0"><Icon.shieldCheck className="w-3 h-3" /> ხედავს მხოლოდ ექსპერტი</span>
          </div>
        </div>

      </div>

      {/* The summary card is ~300px tall and, below lg, it repeats what the
          sheet footer already restates (service · day · time · length · price)
          on the SAME screen. Expanded it was the single biggest reason this
          step's textarea — the step's whole point — sat below the fold at
          375×667. So on a phone it becomes a disclosure: nothing is removed,
          it just stops spending the porthole by default. Desktop is unchanged
          (sticky rail beside the form). The trigger reuses the card's own
          heading string rather than introducing a new one. */}
      <details className="lg:hidden group">
        <summary className="h-11 px-4 rounded-btn border border-ink-200 bg-white flex items-center justify-between gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:border-ink-300 transition-colors duration-fast">
          <Eyebrow tone="muted">დაჯავშნის შეჯამება</Eyebrow>
          <Icon.chevD className="w-4 h-4 shrink-0 text-ink-500 group-open:rotate-180 transition-transform duration-fast" />
        </summary>
        {/* The card carries the same heading the trigger above does; inside a
            disclosure that reads as the label printed twice. Hidden here only
            (OrderSummary is unchanged, and the desktop rail still shows it). */}
        <div className="mt-3 [&>div>*:first-child]:hidden">{summary}</div>
      </details>
      <div className="hidden lg:block lg:sticky lg:top-0">
        {summary}
      </div>
    </div>
  )
}
