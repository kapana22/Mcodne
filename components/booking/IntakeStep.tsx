'use client'
// Intake + details step (DESIGN_FIX_PROMPT 1.3): the mandatory pre-call
// intake. The „რისი განხილვა გინდა?" textarea is REQUIRED (≥ MIN_INTAKE_CHARS
// chars) — it raises session quality, sets expectations, and doubles as
// dispute evidence. The expert sees it on the request card and the booking
// detail page (Booking.studentNotes).
import React from 'react'
import { Icon } from '@/components/Icon'

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

// Intake starters spanning ALL 6 categories (ბიზნესი/ფინანსები/კარიერა/
// მარკეტინგი/სამართალი/ფსიქოლოგია) — tapping one seeds the textarea so the
// client only has to finish the sentence. Never startup-only examples.
export const INTAKE_STARTERS: { cat: string; text: string }[] = [
  { cat: 'ბიზნესი',    text: 'მაქვს ბიზნესი/იდეა და მინდა განვიხილო ' },
  { cat: 'ფინანსები',  text: 'მჭირდება რჩევა ფინანსურ საკითხზე — ' },
  { cat: 'კარიერა',    text: 'ვფიქრობ კარიერულ ნაბიჯზე და მინდა ' },
  { cat: 'მარკეტინგი', text: 'მინდა უკუკავშირი ჩემს მარკეტინგზე — ' },
  { cat: 'სამართალი',  text: 'მაქვს იურიდიული შეკითხვა: ' },
  { cat: 'ფსიქოლოგია', text: 'მინდა ვისაუბრო იმაზე, რაც ბოლო დროს მაწუხებს — ' },
]

export const MIN_INTAKE_CHARS = 10
export const MAX_INTAKE_CHARS = 500

export type DetailsState = { topic: string; goal: string; preCall: boolean }

export const IntakeStep = ({ value, onChange, summary }: { value: DetailsState; onChange: (v: DetailsState) => void; summary: React.ReactNode }) => {
  const goalLen = value.goal.trim().length
  const goalValid = goalLen >= MIN_INTAKE_CHARS
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6 sm:gap-7 lg:gap-10 p-4 sm:p-7 lg:p-10">
      <div className="space-y-7">
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <label className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">თემა</label>
            <span className="text-[11px] text-ink-500">აირჩიე ან „სხვა თემა"</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TOPIC_OPTIONS.map(t => {
              const on = value.topic === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ ...value, topic: t })}
                  className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-pill text-[12.5px] font-display font-medium tracking-wide transition-colors ${on ? 'bg-accent-600 text-white' : 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50'}`}
                >
                  {on && <Icon.check className="w-3 h-3" />}
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label htmlFor="booking-intake" className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">
              რისი განხილვა გინდა? <span className="text-danger-600" aria-hidden>*</span>
            </label>
            <span className="text-[11px] text-ink-500 tabular-nums">{value.goal.length} / {MAX_INTAKE_CHARS}</span>
          </div>
          <p className="mb-2.5 text-[12px] text-ink-600">ეს ეხმარება ექსპერტს მოემზადოს — რაც უფრო კონკრეტული ხარ, მით უკეთეს შედეგს მიიღებ.</p>

          {/* Starter chips — one per category, seed the textarea. */}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {INTAKE_STARTERS.map(s => (
              <button
                key={s.cat}
                type="button"
                onClick={() => onChange({ ...value, goal: s.text })}
                className="inline-flex items-center h-7 px-2.5 rounded-pill border border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50 text-[11.5px] font-display font-medium text-ink-600 hover:text-brand-800 transition-colors"
              >
                {s.cat}
              </button>
            ))}
          </div>

          <textarea
            id="booking-intake"
            value={value.goal}
            onChange={e => onChange({ ...value, goal: e.target.value.slice(0, MAX_INTAKE_CHARS) })}
            rows={5}
            required
            aria-required="true"
            placeholder="მაგ. მაქვს კონკრეტული სიტუაცია და მინდა გავიგო, როგორ მივუდგე — რა ნაბიჯები და რა რისკებია."
            className="w-full px-3.5 py-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors leading-[1.5] resize-none"
          />
          <div className="mt-2 flex items-center justify-between gap-3 text-[11.5px]">
            {goalValid ? (
              <span className="text-ink-500">ამ ტექსტს ექსპერტი სესიამდე ნახავს.</span>
            ) : (
              <span className="text-ink-500">სავალდებულოა — მინ. {MIN_INTAKE_CHARS} სიმბოლო{goalLen > 0 ? ` (დარჩა ${MIN_INTAKE_CHARS - goalLen})` : ''}.</span>
            )}
            <span className="inline-flex items-center gap-1 text-ink-500 shrink-0"><Icon.shieldCheck className="w-3 h-3" /> ხედავს მხოლოდ ექსპერტი</span>
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-card border border-ink-200 bg-white p-4 hover:border-ink-300 transition-colors">
          <span className={`mt-0.5 w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors ${value.preCall ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white'}`}>
            {value.preCall && <Icon.check className="w-3 h-3 text-white" />}
          </span>
          <input type="checkbox" checked={value.preCall} onChange={e => onChange({ ...value, preCall: e.target.checked })} className="sr-only" />
          <div>
            <div className="font-display text-[13px] font-bold text-ink-900">მასალის გაგზავნა სესიამდე</div>
            <p className="text-[12.5px] text-ink-600 mt-0.5 leading-[1.5]">გავუგზავნი დოკუმენტებს ან სხვა მასალას ექსპერტს დასათვალიერებლად სესიამდე. ფასი იგივეა.</p>
          </div>
        </label>
      </div>

      <div className="lg:sticky lg:top-0">
        {summary}
      </div>
    </div>
  )
}
