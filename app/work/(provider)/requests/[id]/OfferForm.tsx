'use client'
// The offer form: an amount, what KIND of amount it is, what it covers, and an
// optional note.
//
// ⚠️ REDRAWN FROM THE OWNER'S DESIGN CANVAS (2026-09-01, „Expert Jobs" → screen
// 3, and „Request Room v2" → the provider panel, which draws the identical
// control set). Three things changed and each is a product decision, not a
// restyle:
//
//   1. THE THIRD PRICE KIND IS „საათში", not „ადგილზე შევაფასებ". ON_SITE is
//      still storable and still renders (lib/requests → ALL_OFFER_PRICE_KINDS);
//      the form simply stops offering it.
//   2. „რას მოიცავს ფასი" IS REQUIRED AND `message` IS NOT. The client compares
//      offers on the first; the second is the provider's own note. Both
//      artboards placeholder the textarea „არასავალდებულო".
//   3. THE AMOUNT BOX IS NAMED BY THE KIND — „ფასი" / „ფასი იწყება" /
//      „საათობრივი", with the unit inside the box. One label for three meanings
//      is how „90" gets read as a total when it was an hourly rate.
//
// Validated with `RequestOfferInput` from lib/requests — the SAME zod object
// POST /api/provider/offers parses the body with, so a message that is long
// enough here is long enough there.
//
// ⚠️ IT CAN FAIL FOR A REASON THAT IS NOBODY'S MISTAKE. The place is claimed
// server-side (`offerCount < offerLimit`, atomically), so a provider who was
// looking at „1 ადგილი" when somebody else submitted gets NOT_OPEN. That is a
// correct outcome and the copy says so plainly.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import {
  RequestOfferInput, offerTemplateFor, kindOf,
  OFFER_PRICE_KINDS, OFFER_PRICE_KIND_LABEL, OFFER_PRICE_FIELD, type OfferPriceKind,
} from '@/lib/requests'
import { validationIssueMessage } from '@/lib/validationMessages'
import { FIELD_ERROR_BORDER, useFault } from '@/components/FieldError'
import { OFFER_FREE_NOTE } from '@/lib/credits'
import { actionError, SEND_FAILED } from '@/lib/actionErrors'

type Status = 'idle' | 'sending' | 'error'

/** Server codes → Georgian. Never surface a raw code to a reader. */
const errText = (code?: string) => actionError(code, {
  // The claim lost. One code for „full", „no longer verified" and „gone",
  // because telling a provider WHICH would be a way to enumerate requests
  // they are not allowed to see.
  NOT_OPEN: 'ადგილი აღარ არის — მოთხოვნა დაიხურა.',
  ALREADY_OFFERED: 'ამ მოთხოვნაზე უკვე გაქვს შეთავაზება.',
}, SEND_FAILED)

export function OfferForm({ requestId, kind, budgetMin, budgetMax, onSent }: {
  requestId: string
  kind: string
  budgetMin: number
  budgetMax: number | null
  /** Where to go once it lands. The canvas moves the provider on to „შერჩეული";
   *  in the product the next true state is the job page, which then shows
   *  „უკვე გაქვს გაგზავნილი" — so the default is a refresh of whatever mounted
   *  this. */
  onSent?: () => void
}) {
  const router = useRouter()
  const [price, setPrice] = useState('')
  /** ⚠️ WHAT THE NUMBER MEANS. A single integer made honest tradespeople either
   *  invent a figure or not bid at all — see lib/requests → OFFER_PRICE_KINDS. */
  const [priceKind, setPriceKind] = useState<OfferPriceKind>('FIXED')
  const [includes, setIncludes] = useState('')
  const [days, setDays] = useState('')
  const [daysOpen, setDaysOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const { fault, fail, props, bad, clearField, reset: clearFault, error } = useFault('offer')

  const field = OFFER_PRICE_FIELD[priceKind]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return

    // Number(''), Number('abc') → NaN and 0 respectively, and both would reach
    // the server as a body zod then rejects with a generic INVALID. Parsed here
    // so the person is told before a round-trip.
    const body = {
      requestId,
      priceKind,
      priceGel: Number(price),
      priceIncludes: includes,
      daysEstimate: days.trim() === '' ? null : Number(days),
      message,
    }
    const parsed = RequestOfferInput.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = typeof issue?.path[0] === 'string' ? issue.path[0] : ''
      const text = validationIssueMessage(issue, errText('INVALID'))
      if (field) { fail(field, text); return }
      setStatus('error'); setErrorText(text); return
    }

    setStatus('sending')
    setErrorText(null); clearFault()
    try {
      const res = await fetch('/api/provider/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        const field = typeof j?.field === 'string' ? j.field : ''
        if (field && j?.message) { setStatus('idle'); fail(field, j.message); return }
        setStatus('error'); setErrorText(j?.message ?? errText(j?.error)); return
      }
      // Re-render from the server: the page then shows „უკვე გაქვს გაგზავნილი"
      // instead of an empty form, and the place count is the real one.
      if (onSent) onSent()
      else router.refresh()
    } catch {
      setStatus('error'); setErrorText(errText())
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="rounded-card border border-ink-200 bg-white p-5 sm:p-7 flex flex-col gap-5">

        {/* ── The amount, and what kind of amount it is ──────────────────────
            ⚠️ ONE ROW, ALIGNED ON THEIR BASELINES (the canvas). The box and the
            chips are one decision — the chips rename the box and change what
            rides after the number — so putting them on separate rows would be
            two controls where there is one.

            ⚠️ THE CHIPS ARE A SEGMENTED CONTROL, NOT THREE PILLS. Three
            separate pills is the grammar the KIND filter on the queue uses for
            a filter over a list; this is one field with three values, and a
            joined control is what says „pick exactly one of these".

            ⚠️ THE SELECTED SEGMENT IS NO LONGER `bg-ink-900` (2026-09-03), AND
            THIS IS THE SITE'S OWN RULE RATHER THAN TASTE. components/Btn calls
            the ink fill „the page's LOUDEST action… and reserves green for the
            second-loudest" — the owner's 2026-08-31 canvas made that a
            hierarchy the palette can express. This form then wore it on a
            THREE-WAY DEFAULT: „ფიქსირებული" is selected before the provider
            touches anything, and at 18.6:1 on white it out-shouted „გაგზავნა",
            the one action on the screen, which sits at brand-600's 4.8:1. The
            eye landed on a value nobody had chosen. Owner: „რაღაც ძალიან
            არაპროფესიონალურია."

            So the control takes the grammar every segmented control uses — a
            recessed `ink-75` track, the chosen segment raised on white — and
            the only saturated thing left on the card is the submit button.
            Selected is told THREE ways, not by the surface alone: the white
            lift, `font-bold` against `font-medium`, and ink-900 against
            ink-500. A shadow alone is invisible at high contrast settings and
            says nothing to a screen reader — `aria-checked` is what carries it
            there, and it did before and still does. */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="shrink-0">
            <span className="mb-1.5 block font-display text-small font-bold text-ink-900">{field.label}</span>
            {/* ⚠️ ONE FOCUS LANGUAGE ON THE WHOLE FORM (2026-09-03). Border +
                ring is what 14 fields across the site already do; this box and
                the two below said it with a border alone, so focus moved
                between three fields and changed shape twice on the way. */}
            <span className={`flex h-12 w-[190px] items-center gap-1.5 rounded-field border bg-white px-4 transition-[border-color,box-shadow] duration-fast focus-within:ring-2 focus-within:ring-brand-100 ${bad('priceGel') ? FIELD_ERROR_BORDER : 'border-ink-200 focus-within:border-brand-500'}`}>
              <input
                type="number" required min={1} max={1000000} step={1} inputMode="numeric"
                value={price} onChange={e => { setPrice(e.target.value); clearField('priceGel') }}
                aria-label={field.label}
                {...props('priceGel')}
                /* `placeholder-ink-400`, not a lighter one: the placeholder is a
                   real hint (the client's own budget floor), and ink-300
                   measures about 2:1 — a suggestion nobody with ordinary eyes
                   can read is not a suggestion. */
                /* ⚠️ `text-right`, SO THE NUMBER AND ITS UNIT ARE ONE TOKEN
                   (2026-09-03). Left-aligned in a 190px box, „100" sat at one
                   end and „₾" at the other with 90px of white between them —
                   the note below says the unit is inside the box so that „90"
                   and „₾/სთ" are ONE READING, and they were not. Right-aligned
                   they touch, which is also how every amount field is set:
                   digits grow leftwards off a fixed decimal edge. */
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right font-display text-h3 font-bold text-ink-900 tabular-nums placeholder-ink-400 outline-none"
                placeholder={String(budgetMin || 100)}
              />
              {/* The unit INSIDE the box, so „90" and „₾/სთ" are one reading.
                  It was a hint line underneath, which put the thing that says
                  what the number means below the fold of the eye. */}
              <span className="shrink-0 text-small text-ink-500">{field.suffix}</span>
            </span>
          </label>

          <div
            role="radiogroup"
            aria-label="ფასის ტიპი"
            className="flex h-12 min-w-[220px] flex-1 items-center gap-1 rounded-field border border-ink-200 bg-ink-75 p-1"
          >
            {OFFER_PRICE_KINDS.map(k => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={priceKind === k}
                onClick={() => setPriceKind(k)}
                className={`h-full flex-1 whitespace-nowrap rounded-[calc(theme(borderRadius.field)-3px)] px-2 font-display text-small transition-colors duration-fast ${
                  priceKind === k
                    ? 'bg-white font-bold text-ink-900 shadow-xs'
                    : 'font-medium text-ink-500 hover:text-ink-800'
                }`}
              >
                {OFFER_PRICE_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        {error('priceGel')}

        {/* ── What the price covers ─────────────────────────────────────────
            ⚠️ THE REQUIRED FIELD ON THIS FORM, and the only one the CLIENT'S
            LIST prints (see prisma/schema → RequestOffer.priceIncludes). One
            line, because three offers have to be comparable at a glance. */}
        <label className="block">
          <span className="mb-1.5 block font-display text-small font-bold text-ink-900">რას მოიცავს ფასი</span>
          <input
            type="text" required maxLength={120}
            value={includes} onChange={e => { setIncludes(e.target.value); clearField('priceIncludes') }}
            {...props('priceIncludes')}
            className={`h-12 w-full rounded-field border bg-white px-4 text-body text-ink-900 placeholder-ink-400 outline-none transition-[border-color,box-shadow] duration-fast focus:ring-2 focus:ring-brand-100 ${bad('priceIncludes') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500'}`}
            placeholder="მაგ. მასალა და ტრანსპორტი ფასში შედის"
          />
          {error('priceIncludes')}
          {/* Said once, where it is decided — not as a running counter. The
              client sees this line under the price, so „what will they read"
              is the useful fact, never „how many characters are left". */}
          <span className="mt-1.5 block text-meta text-ink-500">კლიენტს ფასის ქვეშ უჩანს.</span>
        </label>

        {/* Folded away: a deadline is a real answer and most replies do not
            carry one. A field nobody fills is a field everybody reads past. */}
        {daysOpen || days !== '' ? (
          <label className="flex items-center gap-2">
            <span className="font-display text-small font-bold text-ink-900">ვადა</span>
            <input
              type="number" min={1} max={365} step={1} inputMode="numeric"
              value={days} onChange={e => { setDays(e.target.value); clearField('daysEstimate') }}
              aria-label="ვადა, დღე"
              {...props('daysEstimate')}
              className={`h-11 w-24 rounded-field border bg-white px-3.5 text-body text-ink-900 tabular-nums placeholder-ink-400 outline-none transition-[border-color,box-shadow] duration-fast focus:ring-2 focus:ring-brand-100 ${bad('daysEstimate') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500'}`}
              placeholder="10"
            />
            <span className="text-small text-ink-600">დღე</span>
            {error('daysEstimate')}
          </label>
        ) : (
          /* ⚠️ A BUTTON THAT LOOKS LIKE A BUTTON (2026-09-03). It was green
             underlined text, and so was „შაბლონით დაწყება" below it — two
             underlined links inside a form, at two different sizes, for two
             controls that do the same KIND of thing (reveal something that is
             folded away). An underline is the web's mark for „this navigates";
             neither of these leaves the page, and the pair read as leftover
             markup between the fields rather than as part of the form.
             Same geometry as the template button below, deliberately: they are
             a matched pair and now look like one. */
          <button
            type="button"
            onClick={() => setDaysOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 self-start rounded-btn border border-ink-200 bg-white px-3.5 font-display text-small font-semibold text-ink-800 transition-colors duration-fast hover:border-ink-300 hover:bg-ink-50"
          >
            <Icon.plus aria-hidden className="h-4 w-4" />
            ვადის მითითება
          </button>
        )}

        {/* ── The note ─────────────────────────────────────────────────────
            ⚠️ OPTIONAL, AND LABELLED (2026-09-01). It was the required field
            with a 20-character floor and no label at all — the argument on
            2026-08-18 being that „ტექსტი" over a box you are already typing in
            is a word for the form's benefit. The canvas labels it, and now that
            it is one of THREE fields rather than the only one, an unlabelled
            box is the odd one out rather than the plain one. */}
        <label className="block">
          {/* ⚠️ „არასავალდებულო" SITS ON THE LABEL ROW (2026-09-03). It was on
              the line UNDER the box, 12px from „შაბლონით დაწყება" — so a fact
              about the FIELD read as a caption on the BUTTON („starting from a
              template is optional"), which is not what it says. The right-hand
              end of a field's own label is where every form on the web puts
              „optional", and it is the first thing read rather than the last.
              The 2026-09-02 note below still holds and is what this preserves:
              it is a fact about the field, never advice to skip it — which is
              why it is `ink-500` beside a bold label and not a chip. */}
          <span className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="font-display text-small font-bold text-ink-900">შეტყობინება</span>
            <span className="shrink-0 text-meta font-normal text-ink-500">არასავალდებულო</span>
          </span>
          <textarea
            /* ⚠️ `bg-white`, NOT `bg-ink-50` (2026-09-03). ink-50 is the PAGE
               GROUND (tailwind.config: „ink-50 IS THE GROUND, bg-white IS A
               CARD"), so inside a white card this box was painted the colour of
               the paper behind it and read as a hole rather than a field —
               beside two white inputs that are the same kind of thing.
               `rows={4}`: the drag handle is a browser default nobody styles,
               and the way not to see it used is to make the box big enough
               that nobody reaches for it. */
            rows={4} maxLength={4000}
            value={message} onChange={e => { setMessage(e.target.value); clearField('message') }}
            {...props('message')}
            className={`w-full resize-y rounded-tile border bg-white px-4 py-3.5 text-body text-ink-900 placeholder-ink-400 outline-none transition-[border-color,box-shadow] duration-fast focus:ring-2 ${bad('message') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
            /* ⚠️ AN EXAMPLE, NOT „არასავალდებულო" (2026-09-02).
               This is the field that WINS THE JOB — the research quoted at
               `OFFER_TEMPLATE` (lib/requestTopics) is blunt about it: on a
               thumbtack-model marketplace the first good reply takes ~78% of
               clients. And the one word standing in it told the provider they
               could skip it. The screen was arguing against its own file.

               It also contradicted the control directly underneath: „skip me"
               over „here is how to write me". Two instructions, opposite
               directions, 6px apart.

               The example is the template's OWN first line, so the placeholder
               and the button that fills the box speak with one voice — and it
               is per KIND for the same reason the template is. Nothing new was
               written: this string already existed one file away.

               „არასავალდებულო" survives, moved to the line below where it is a
               FACT about the field rather than advice about what to do with
               it — beside the button that offers the alternative. */
            placeholder={`მაგ. ${offerTemplateFor(kindOf(kind)).split('\n')[0]}`}
          />
          {error('message')}
          {/* The same insert-on-tap scaffold the client's description field
              carries: the empty box is where replies get slow and vague, and
              the winning reply's structure is known. Offered only while empty;
              inserting must never destroy typed text. */}
          {message === '' && (
            <button
              type="button"
              onClick={() => setMessage(offerTemplateFor(kindOf(kind)))}
              /* ⚠️ h-10, AND THAT IS CLAUDE.md §3 RATHER THAN A LOOK. It was
                 `text-meta` with no height — about 17px of tappable target, the
                 smallest control on the form, on the screen a provider works
                 from a phone. Everything tappable is ≥40px. */
              className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-btn border border-ink-200 bg-white px-3.5 font-display text-small font-semibold text-ink-800 transition-colors duration-fast hover:border-ink-300 hover:bg-ink-50"
            >
              <Icon.plus aria-hidden className="h-4 w-4" />
              შაბლონით დაწყება
            </button>
          )}
        </label>

        {/* ── The budget-fit line — answered WHILE typing ─────────────────
            The client named a band and the provider is quoting against it; the
            comparison is arithmetic the provider would otherwise do in their
            head, wrongly or late. Above-band is a WARNING (gold — a genuine
            caution: the research says out-of-budget quotes mostly lose), never
            a block: an expert worth more than the band should still be able to
            say so, with the price making the argument.

            ⚠️ NOT DRAWN ON AN HOURLY RATE. A budget band is a total for the
            job; „90₾/სთ is above your 120₾ budget" compares two different
            quantities and would be wrong roughly always. */}
        {(() => {
          if (priceKind === 'HOURLY') return null
          const n = Number(price)
          if (!price.trim() || !Number.isFinite(n) || n <= 0) return null
          const fit = budgetMax === null
            ? (n >= budgetMin ? 'in' : 'below')
            : n > budgetMax ? 'above' : n >= budgetMin ? 'in' : 'below'
          return (
            <p className={`text-small ${
              fit === 'in' ? 'text-brand-700 font-semibold'
              : fit === 'above' ? 'text-warning-700 font-semibold' : 'text-ink-600'
            }`}>
              {fit === 'in' && 'კლიენტის ბიუჯეტშია ✓'}
              {fit === 'above' && `კლიენტის ბიუჯეტს აღემატება${budgetMax !== null ? ` (მაქს. ${budgetMax}₾)` : ''}`}
              {fit === 'below' && 'კლიენტის ბიუჯეტზე დაბალია'}
            </p>
          )
        })()}
      </div>

      {/* Left for what has no field: the lost claim (NOT_OPEN), an existing
          offer, a rate limit, a dropped network. */}
      {status === 'error' && errorText && !fault && (
        <div role="alert" className="rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {errorText}
        </div>
      )}

      {/* ⚠️ THE FOOTER SITS OUTSIDE THE CARD (the canvas), and it says only what
          lib/credits says. „გაგზავნა უფასოა" is the whole of it: the FEE is
          stated on the job card this form was opened from, and a second copy of
          a number the owner has said will move is how a re-price and a screen
          stop agreeing. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="min-w-0 text-meta text-ink-500 leading-snug">{OFFER_FREE_NOTE}</p>
        <Btn type="submit" size="lg" disabled={status === 'sending'} aria-busy={status === 'sending'}>
          {status === 'sending' ? 'იგზავნება…' : 'გაგზავნა'}
        </Btn>
      </div>
    </form>
  )
}
