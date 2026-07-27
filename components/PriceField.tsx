'use client'

import { useId } from 'react'
import { Eyebrow } from '@/components/Eyebrow'
import { COMMISSION_PCT, PAYMENTS_LIVE, TUTOR_PAYOUT_PCT } from '@/lib/flags'

/* The one price control an expert types into — used by BOTH /apply (step 4)
   and the expert workspace profile editor, so the two can never drift apart.

   Pricing is manual on purpose: the expert types any number they want. The
   chips below only PREFILL the same input, and the recommended band is framed
   as OUR advice — we have no market data and must never imply we do. Nothing
   here blocks a price outside the band. */

/* Our recommendation, anchored to a 60-minute consultation, then scaled
   linearly by the service duration and rounded to ₾5 — so a 30-minute service
   suggests ₾30–₾75 rather than the hour band. Stated in the UI as a rule, not
   as a statistic. */
const HOUR_LO = 60
const HOUR_HI = 150
const HOUR_CHIPS = [60, 80, 100, 150]

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
  /** Duration of the service in minutes — scales the recommended band + chips. */
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

  const lo = round5(HOUR_LO * factor)
  const hi = round5(HOUR_HI * factor)
  const chips = Array.from(new Set(HOUR_CHIPS.map(c => round5(c * factor)))).sort((a, b) => a - b)

  const price = Number.isFinite(value) ? value : 0
  const hasPrice = price >= MIN_PRICE
  const net = (price * TUTOR_PAYOUT_PCT) / 100

  /* Where the typed price sits on the scale. The track runs 0 → a bit past the
     top of the band so an in-band price lands comfortably mid-track; a very
     high price stretches the track instead of pinning the marker to the edge. */
  const scaleMax = Math.max(hi * 1.6, price * 1.15, hi + 10)
  const pct = (n: number) => Math.min(100, Math.max(0, (n / scaleMax) * 100))

  const state: 'empty' | 'below' | 'within' | 'above' =
    !hasPrice ? 'empty' : price < lo ? 'below' : price > hi ? 'above' : 'within'
  const note =
    state === 'below' ? 'რჩევაზე დაბალია'
    : state === 'within' ? 'რეკომენდებულ დიაპაზონში'
    : 'რჩევაზე მაღალი — დაასაბუთე პროფილში'

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
        <span className="text-[11px] text-ink-500">ფასს შენ ადგენ</span>
      </div>

      {/* The prominent (h-12) tier — price outranks every other field in this
          form, and the ₾ lives inside the control so the number reads clean. */}
      <div className="relative">
        <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 font-display text-[15px] font-semibold text-ink-400 pointer-events-none">₾</span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          required={required}
          min={disabled ? 0 : MIN_PRICE}
          max={MAX_PRICE}
          step={1}
          value={value}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value) || 0)}
          onBlur={clamp}
          className="w-full h-12 pl-9 pr-4 rounded-field border border-ink-200 bg-white font-display text-[17px] font-bold tabular-nums text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-ink-50 disabled:text-ink-400 disabled:hover:border-ink-200 transition-[border-color,box-shadow] duration-fast"
        />
      </div>

      {!disabled && (
        <>
          {/* Live take-home. Payments aren't live yet and the platform takes no
              cut today, so we must NOT show a commission or a reduced amount —
              the expert gets the full price. The commission branch stays here
              (reading COMMISSION_PCT / TUTOR_PAYOUT_PCT, never a literal) so
              flipping PAYMENTS_LIVE restores the net line by itself. */}
          <div className="mt-2 flex items-center justify-between gap-3 text-[11.5px]">
            <span className="text-ink-600">
              {!hasPrice ? 'მიუთითე ფასი'
                : <>მიიღებ <span className="font-display font-bold text-brand-700 tabular-nums">₾{(PAYMENTS_LIVE ? net : price).toFixed(2)}</span></>}
            </span>
            {hasPrice && (
              PAYMENTS_LIVE
                ? <span className="text-ink-500 tabular-nums">{COMMISSION_PCT}% საკომისიო</span>
                : <span className="text-ink-500">სრულად შენია</span>
            )}
          </div>

          {/* Orientation band — our advice, scaled to the chosen duration.
              Deliberately quiet: hairline + one brand accent, never an alert. */}
          <div className="mt-3 pt-3 border-t border-ink-100">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <Eyebrow tone="muted">ჩვენი რჩევა</Eyebrow>
              <span className="font-display text-[11.5px] font-semibold text-ink-700 tabular-nums">{mins} წუთის კონსულტაცია — ₾{lo}–₾{hi}</span>
            </div>

            <div aria-hidden className="relative mt-2 h-1.5 rounded-pill bg-ink-100">
              <div className="absolute inset-y-0 rounded-pill bg-brand-500/25" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
              {hasPrice && (
                <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-3.5 rounded-pill bg-ink-900" style={{ left: `${pct(price)}%` }} />
              )}
            </div>

            <div className={`mt-1.5 text-[11.5px] ${state === 'within' ? 'text-brand-700' : 'text-ink-600'}`}>
              {hasPrice ? note : 'დიაპაზონი ორიენტირისთვისაა — ნებისმიერი ფასი შეგიძლია.'}
            </div>

            {/* Shortcuts, not options: each one just fills the input above. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-ink-500 mr-0.5">სწრაფად</span>
              {chips.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange(c)}
                  className={`h-10 sm:h-9 px-3.5 rounded-pill border font-display text-[12px] font-semibold tabular-nums transition-colors ${
                    price === c
                      ? 'border-brand-500 text-brand-700 bg-brand-50/50'
                      : 'border-ink-200 text-ink-700 hover:border-brand-400 hover:text-brand-700'
                  }`}
                >
                  ₾{c}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
