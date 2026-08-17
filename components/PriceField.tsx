'use client'

import { useId } from 'react'
import { Eyebrow } from '@/components/Eyebrow'
import { COMMISSION_PCT, PAYMENTS_LIVE, TUTOR_PAYOUT_PCT } from '@/lib/flags'

/* The one price control an expert types into — used by BOTH /apply (the pricing
   step) and the expert workspace profile editor, so the two can never drift apart.

   Pricing is manual on purpose: the expert types any number they want. The
   chips only PREFILL the same input — they are shortcuts, not options, and
   nothing here judges or blocks the number.

   There is NO RECOMMENDED range and NO COMPARISON TO OTHER EXPERTS, and there
   must never be one again. Two versions have now been removed:

     • „ჩვენი რჩევა ₾60–₾150" with a below/within/above verdict — it told a new
       expert pricing low that they were „რჩევაზე დაბალი", and pricing low to
       win the first clients is the rational move at this stage.
     • „სხვა ექსპერტები: ₾30–₾80 · მედიანა ₾50" — the real p25–p75 distribution
       from /api/tutors/stats (removed 2026-08-11, owner's call). It was framed
       as a fact rather than a verdict, but on a screen where someone is
       choosing their own number a peer band is read as one anyway. The anchor
       problem it was meant to fix belongs to the PRE-FILL, and that is already
       gone — the field starts empty.

   The endpoint still exists and is still used by the home hero; only this
   screen stopped reading it. */

/* Chip values are scaled linearly by the service duration and rounded to ₾5,
   so a 30-minute service offers half the hour's shortcuts. */
// Shortcuts only — NOT a recommended range. They deliberately start low: at
// this stage of the marketplace a new expert pricing at ₾20 to win their first
// clients is making a rational move, and the product must not argue with it.
const HOUR_CHIPS = [20, 40, 60, 100]

const MIN_PRICE = 1
const MAX_PRICE = 10000

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

/* A missing/absurd duration falls back to the 60-minute anchor rather than
   producing a nonsense band while the expert is still typing the minutes. */
const safeMinutes = (m: number) => (Number.isFinite(m) && m >= 5 && m <= 240 ? m : 60)

export function PriceField({
  value,
  onChange,
  minutes,
  disabled = false,
  required = false,
  label = 'ფასი',
  className = '',
}: {
  value: number
  onChange: (price: number) => void
  /** Duration of the service in minutes — scales the shortcut chips. */
  minutes: number
  /** Free services keep the field locked exactly as before (and skip the guidance). */
  disabled?: boolean
  required?: boolean
  label?: string
  className?: string
}) {
  const id = useId()
  const mins = safeMinutes(minutes)
  const factor = mins / 60

  const chips = Array.from(new Set(HOUR_CHIPS.map(c => round5(c * factor)))).sort((a, b) => a - b)

  const price = Number.isFinite(value) ? value : 0
  const hasPrice = price >= MIN_PRICE
  const net = (price * TUTOR_PAYOUT_PCT) / 100

  /* Clamp only on blur: clamping while typing would fight anyone who clears
     the field to retype it. A paid service at ₾0 is a mistake, so the floor is
     ₾1 — but a service explicitly marked free stays untouched. */
  const clamp = () => {
    if (disabled) return
    if (price < MIN_PRICE) onChange(MIN_PRICE)
    else if (price > MAX_PRICE) onChange(MAX_PRICE)
  }

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <Eyebrow as="label" tone="muted" htmlFor={id}>{label}</Eyebrow>
        <span className="text-meta text-ink-500">ფასს შენ ადგენ</span>
      </div>

      {/* The prominent (h-12) tier — price outranks every other field in this
          form, and the ₾ lives inside the control so the number reads clean. */}
      <div className="relative">
        <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 font-display text-body-lg font-semibold text-ink-400 pointer-events-none">₾</span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          required={required}
          min={disabled ? 0 : MIN_PRICE}
          max={MAX_PRICE}
          step={1}
          /* 0 renders EMPTY, never as a literal „0". The apply form now starts
             with no price (the ₾80 pre-fill was an anchor half the roster
             accepted verbatim), and a field showing „0" would just be a
             different number to argue with — plus the expert would have to
             clear it before typing. */
          value={value > 0 ? value : ''}
          placeholder="0"
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value) || 0)}
          onBlur={clamp}
          className="w-full h-12 pl-9 pr-4 rounded-field border border-ink-200 bg-white font-display text-h3 font-bold tabular-nums text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-ink-50 disabled:text-ink-500 disabled:hover:border-ink-200 transition-[border-color,box-shadow] duration-fast"
        />
      </div>


      {!disabled && (
        <>
          {/* Shortcuts, not options: each one just fills the input above — which
              is why they sit against it, before anything that only describes it.

              NO recommended range and no verdict on the price. It used to show
              „ჩვენი რჩევა ₾60–₾150" with a below/within/above read-out, which
              told a new expert pricing at ₾20 that they were „რჩევაზე დაბალი".
              Cheap first prices create bookings, bookings create reviews,
              reviews create trust — guidance that pushes prices UP suppresses
              all three. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-meta text-ink-500 mr-0.5">სწრაფი არჩევანი</span>
            {chips.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                className={`h-11 sm:h-9 px-3.5 rounded-pill border font-display text-meta font-semibold tabular-nums transition-colors duration-fast ${
                  price === c
                    ? 'border-brand-500 text-brand-700 bg-brand-50/50'
                    : 'border-ink-200 text-ink-700 hover:border-brand-400 hover:text-brand-700'
                }`}
              >
                ₾{c}
              </button>
            ))}
          </div>

          {/* Reference, not a control. One line, behind one divider.

              Take-home, and the commission beside it — always, whatever
              PAYMENTS_LIVE says. This is the one screen where the expert
              decides a number, and until 2026-08-10 it answered „მიიღებ ₾{the
              full price}" with „საკომისიოს ჯერ არ ვიღებთ" next to it. Someone
              pricing a service against that figure was being told the wrong
              one. The flag governs whether money MOVES; it was never a licence
              to quote a take-home that will not arrive. */}
          <div className="mt-3 pt-3 border-t border-ink-100 text-meta">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-600">
                {!hasPrice ? 'მიუთითე ფასი'
                  : <>მიიღებ <span className="font-display font-bold text-brand-700 tabular-nums">₾{net.toFixed(2)}</span></>}
              </span>
              {hasPrice && <span className="text-ink-500 tabular-nums">{COMMISSION_PCT}% საკომისიო</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
