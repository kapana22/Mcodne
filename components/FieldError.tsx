'use client'
// SAYING WHAT IS WRONG, NEXT TO THE THING THAT IS WRONG.
//
// ⚠️ WHY THIS EXISTS (2026-08-31). Owner: „ვალიდაციები არ მუშაობს." Measured
// that morning: 18 files render a form and 5 of them set `aria-invalid` at all.
// The other thirteen answered a failed submit with ONE sentence at the bottom
// of the card — or with a greyed-out button and nothing — so „which box do I
// fix" was the reader's problem to solve, and a screen reader was told nothing
// whatsoever.
//
// Four files had already grown most of the answer independently and they do not
// agree on any of it: ContactClient focuses through `data-contact-field`, the
// join form through `data-field`, LeadForm and OfferForm colour a border and
// print the sentence at the FOOT of the form — which, on the join form, is
// where `jumpTo` has just scrolled AWAY from. This is the fifth style only in
// the sense that it is the one the other four are being folded into; it invents
// no new markup, it just puts the pieces in one place:
//
//   • `aria-invalid` on the control, so assistive tech knows it is the wrong one
//   • `aria-describedby` → the message's own `id`, so it is READ OUT with the
//     field rather than found later by luck
//   • the message under the control, `role="alert"` so it is announced at all
//   • the cursor moved to the field on a failed submit
//
// THE COPY IS NEVER WRITTEN HERE. Every message arrives from the shared rule
// that refused the value — `lib/validationMessages → validationIssueMessage`
// for a zod issue, `lib/phone → phoneFormatError`, `lib/passwordPolicy →
// passwordError`, `lib/georgianText → georgianNameError` — or from the server's
// own `message` field. That is what keeps a client refusal and a server refusal
// saying the same sentence.
//
// SCOPE. `form` is a short, page-unique prefix („signin", „settings-pw"). It
// only exists to keep two forms on one page from minting the same element id;
// `aria-describedby` pointing at the wrong card's message is worse than
// pointing at nothing.

import { useCallback, useRef, useState } from 'react'
import { Icon } from './Icon'

/** The one field a submit stopped on, and why. Never a list: a person fixes
 *  one box at a time, and six red sentences at once is the wall this replaces. */
export type Fault = { field: string; message: string } | null

/** The border a control wears while it is the wrong one. Concatenated onto the
 *  screen's own input class rather than replacing it — every form on this site
 *  has its own height and radius and none of that is this file's business. */
export const FIELD_ERROR_BORDER = 'border-danger-500 focus:border-danger-500 focus:ring-danger-100'

/** One rule for the message's id, so `aria-describedby` and the element that
 *  answers it cannot disagree. */
export const fieldErrorId = (form: string, field: string) => `${form}-${field}-err`

/**
 * The sentence, under the control it is about.
 *
 * Renders nothing unless THIS field is the one at fault, so it can sit in the
 * markup permanently and costs nothing when the form is fine.
 */
export function FieldError({ form, field, fault }: { form: string; field: string; fault: Fault }) {
  if (!fault || fault.field !== field) return null
  // ⚠️ A <span>, NOT A <p>. Half the fields on this site live inside a <label>
  // (the signin/_fields `Field`, /settings, ContactClient), and <label> takes
  // phrasing content only — a <p> in there is invalid markup that browsers
  // silently reparent, which moves the message out of the label it describes.
  return (
    <span
      id={fieldErrorId(form, field)}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 text-meta text-danger-700 leading-[1.45]"
    >
      <Icon.warn className="w-3.5 h-3.5 shrink-0 mt-[3px]" />
      <span className="min-w-0 break-words">{fault.message}</span>
    </span>
  )
}

/**
 * The state, the aria wiring and the focus move — the whole per-field story of
 * one form.
 *
 * ```tsx
 * const { fault, props, error, fail, clearField, reset } = useFault('signin')
 * …
 * <input {...props('email')} className={`${INPUT} ${props('email')['aria-invalid'] ? FIELD_ERROR_BORDER : ''}`} />
 * <FieldError form="signin" field="email" fault={fault} />
 * ```
 *
 * `error(field)` is the same thing as the component, pre-bound, for call sites
 * that would rather not repeat `form=` on every field.
 */
export function useFault(form: string) {
  const [fault, setFault] = useState<Fault>(null)
  const hostRef = useRef<HTMLElement | null>(null)

  /**
   * Mark a field wrong, say why, and put the cursor in it.
   *
   * The focus is deferred a frame: React has not painted the message yet, and
   * focusing an element whose description does not exist is how a screen reader
   * announces a field with no reason attached.
   *
   * `focus: false` is for the case where the control is not focusable — a chip
   * row, an upload, a checkbox drawn as a span — and moving the viewport there
   * is all that can be done.
   */
  const fail = useCallback((field: string, message: string, opts?: { focus?: boolean }) => {
    setFault({ field, message })
    if (opts?.focus === false) return
    requestAnimationFrame(() => {
      const root = hostRef.current ?? document
      const el = root.querySelector<HTMLElement>(`[data-fault="${form}-${field}"]`)
      if (!el) return
      // `preventScroll` then an explicit scroll: the browser's own focus scroll
      // parks the field under a sticky header on several of these screens.
      el.focus({ preventScroll: true })
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [form])

  /** Everything a control needs to take part. Spread it onto the input. */
  const props = useCallback((field: string) => {
    const bad = fault?.field === field
    return {
      'data-fault': `${form}-${field}`,
      'aria-invalid': bad || undefined,
      'aria-describedby': bad ? fieldErrorId(form, field) : undefined,
    } as const
  }, [form, fault])

  /** True while this field is the one at fault — for the border class. */
  const bad = useCallback((field: string) => fault?.field === field, [fault])

  /** Clear the fault the moment they start fixing THAT field. An error sitting
   *  under a box they have already corrected is noise, and a form that keeps
   *  shouting after the fix is a form people stop reading. */
  const clearField = useCallback((field: string) => {
    setFault(f => (f && f.field === field ? null : f))
  }, [])

  const reset = useCallback(() => setFault(null), [])

  const error = useCallback(
    (field: string) => <FieldError form={form} field={field} fault={fault} />,
    [form, fault],
  )

  return { fault, fail, props, bad, clearField, reset, error, hostRef }
}
