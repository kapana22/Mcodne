'use client'
import { useState } from 'react'
// The last screen — who to call. And it IS the registration, whole: name and
// phone, no password, no account (owner: „რეგისტრაცია სულ ბოლოს და მარტივად").
// The publicRef link on the thanks screen is the client's key; asking for a
// sign-up before help may be asked for is the reference products' own
// anti-pattern, and this flow simply does not have the step.

import { PhoneInput } from '@/components/PhoneInput'
import { FIELD_ERROR_BORDER, type useFault } from '@/components/FieldError'
import {
  kindOf, KIND, budgetLabel, bandOf, timingLabel, topicLabel,
} from '@/lib/requests'
import type { Draft } from './_model'

const INPUT =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

// ⚠️ A REAL `<label htmlFor>`, NOT A SPAN INSIDE ONE (2026-08-31). Every field
// here was wrapped in `<label className="block">` with the hint AND the error
// message inside it, and an implicit label names its control with ALL the text
// it contains: a screen reader read the phone field as „ტელეფონის ნომერინომერს
// მხოლოდ ჩვენ ვიყენებთ — მოთხოვნის გადასამოწმებლად." — label and hint run
// together with no separator, and `aria-describedby` then read the hint again.
// The label NAMES; the hint DESCRIBES, and they are two different attributes.
const Label = ({ children, optional, htmlFor }: { children: React.ReactNode; optional?: boolean; htmlFor: string }) => (
  <label htmlFor={htmlFor} className="block text-small font-display font-semibold text-ink-800 mb-1.5">
    {children}
    {optional && <span className="ml-1 font-normal text-ink-400">არასავალდებულო</span>}
  </label>
)

/** Under the field, not above it: a hint is read when the cursor is already
 *  there, and a line between the label and the input pushes the two apart. */
const Hint = ({ children, id }: { children: React.ReactNode; id?: string }) => (
  <span id={id} className="block mt-1.5 text-meta text-ink-500">{children}</span>
)

export function StepContact({ draft, patch, signedIn, fault }: {
  draft: Draft
  patch: (p: Partial<Draft>) => void
  /** Changes ONE sentence — see the email hint. Everything else on this screen
   *  is identical for a guest and a member; the fields simply arrive filled. */
  signedIn: boolean
  /** ⚠️ OWNED BY THE WIZARD, NOT BY THIS SCREEN. The rules live in
   *  `ServiceRequestInput` and the container is what runs them (see the note on
   *  `submit` there), so the fault has to be created where the submit is. This
   *  screen only draws it — which is the whole point: the sentence appears on
   *  the box rather than in a strip under the button, where three fields' worth
   *  of refusals used to land. */
  fault: ReturnType<typeof useFault>
}) {
  const { props, bad, error } = fault
  /** `props(field)` sets `aria-describedby` only WHILE the field is wrong, and
   *  points it at the message. A hint is permanent, so the two have to be
   *  joined rather than one overwriting the other — a control may be described
   *  by several ids, in the order they are read. */
  const describedBy = (field: string, hintId?: string) =>
    [hintId, props(field)['aria-describedby']].filter(Boolean).join(' ') || undefined
  const kind = kindOf(draft.kind)
  const band = draft.kind ? bandOf(kind, draft.budgetBand) : undefined
  /** Opened by the reader, never by us. A textarea that appears on its own is
   *  the screen this replaced. */
  const [open, setOpen] = useState(false)
  /** The same per-kind scaffold the old details screen used, kept as the
   *  PLACEHOLDER rather than inserted text: a pre-filled box reads as already
   *  answered and gets submitted with the blanks still in it. */
  const placeholder =
    kind === 'LEARNING' ? 'ვინ ისწავლის, რა დონეა და რა არის მიზანი'
    : kind === 'MEETING' ? 'რა კითხვა გაქვს და რა სიტუაციაა'
    : kind === 'SERVICE' ? 'რა პრობლემაა, სართული და ლიფტი'
    : 'რა უნდა გაკეთდეს და რა შედეგს ელი'

  return (
    // No width of its own — RequestWizard caps the whole run at 560 (see the
    // note there). This screen used to set 440 and was the only one that did,
    // so the column narrowed on the last tap.
    <div className="space-y-5">
      {/* ⚠️ THE SUMMARY LINE LIVED HERE AND IS GONE (2026-08-17). It was one
          compressed line — kind · topic · budget · timing — because a form's
          last screen has to show what is about to be sent and there was nowhere
          else for it. The transcript above now carries all four AS BUBBLES, in
          order, each with its own „შეცვლა" — which is strictly more than the
          line did: it was read-only, and the edit story was „press უკან four
          times". Keeping both put every one of those facts on this screen
          twice, three lines apart.

          ⚠️ Do not restore it as a „confirmation". The transcript IS the
          confirmation, and it is the version somebody can act on. */}

      {/* ⚠️ THE FIELDS COME FIRST. The reassurance used to sit above them and
          pushed all three below the fold at 390px — on the last screen before
          a submit, where the only job is three inputs. What people need before
          pressing they need AT the button, and that is where it now is. */}
      <div className="block">
        <Label htmlFor="req-contact-name">სახელი</Label>
        <input
          id="req-contact-name"
          type="text" required autoComplete="name"
          value={draft.contactName}
          onChange={e => patch({ contactName: e.target.value })}
          {...props('contactName')}
          className={`${INPUT} ${bad('contactName') ? FIELD_ERROR_BORDER : ''}`} placeholder="სახელი და გვარი"
        />
        {error('contactName')}
      </div>

      <div className="block">
        <Label htmlFor="req-contact-phone">ტელეფონის ნომერი</Label>
        <PhoneInput id="req-contact-phone" value={draft.phone} onChange={v => patch({ phone: v })} className={`${INPUT} ${bad('phone') ? FIELD_ERROR_BORDER : ''}`} required field={{ ...props('phone'), 'aria-describedby': describedBy('phone', 'req-contact-phone-hint') }} />
        {error('phone')}
        {/* ⚠️ THE ANSWER TO „WHO WILL SEE IT" CHANGED ON 2026-08-21, so this
            line had to. It said „ნომერს მხოლოდ ის ექსპერტი ნახავს, ვისაც შენ
            აირჩევ" — true until that day, and false the moment the number
            stopped being released to anybody (owner: „არ უჩანდეს ეგრევე
            ტელეფონი"; see lib/requests → clientIdentityOpen). A promise about
            somebody's phone number is the last sentence on a site allowed to
            drift out of date, so it now says the one thing that is still true:
            we are the only ones who use it, to check the request is real. */}
        <Hint id="req-contact-phone-hint">ნომერს მხოლოდ ჩვენ ვიყენებთ — მოთხოვნის გადასამოწმებლად.</Hint>
      </div>

      <div className="block">
        {/* ⚠️ NO LONGER `optional` (2026-08-17). See ServiceRequestInput: every
            message this subsystem sends a client is an email, so an absent one
            meant the system never spoke to them again. */}
        <Label htmlFor="req-contact-email">ელფოსტა</Label>
        <input
          id="req-contact-email"
          type="email" autoComplete="email" required
          value={draft.email}
          onChange={e => patch({ email: e.target.value })}
          {...props('email')}
          aria-describedby={describedBy('email', 'req-contact-email-hint')}
          className={`${INPUT} ${bad('email') ? FIELD_ERROR_BORDER : ''}`} placeholder="you@example.ge"
        />
        {error('email')}
        {/* The account is made from this field — said HERE, where it is typed,
            rather than as a checkbox or a step. See lib/requestAccount: an
            email is the only thing that makes an account reachable, so it is
            the only thing that creates one.
            ⚠️ …which is why the sentence CANNOT be the same when somebody is
            already signed in. lib/requestAccount returns SIGNED_IN for them and
            creates nothing, so „ანგარიში თავისით შეიქმნება" would be promising
            a thing that will not happen to a person who already has it. */}
        {/* ⚠️ „ელფოსტაზეც" BECAME „ელფოსტაზე" (2026-08-17), one letter, and it
            is the difference between a courtesy and the channel. „-ც" implied a
            second route alongside some first one; there is no first one — this
            is where offers and replies are announced, and nowhere else. */}
        <Hint id="req-contact-email-hint">
          {signedIn
            ? 'შეთავაზებები ელფოსტაზე მოგივა.'
            : 'შეთავაზებები ელფოსტაზე მოგივა და ანგარიში თავისით შეიქმნება.'}
        </Hint>
      </div>

      {/* ── The description, no longer worth a screen of its own ───────────
          It WAS one — „დაამატებ დეტალებს?", a full step with a textarea and a
          skip button. Measured on 19 real requests: 8 carried a description, so
          58% walked through a whole screen to skip it. A step most people
          advance past without typing is not an optional question, it is a tax
          on everybody for the benefit of two in five.

          Here it costs nothing when unused: one line, and the box only exists
          once somebody asks for it. Whoever typed their need as a sentence on
          step one already has it filled — `onFreeText` writes straight into
          `description` — so for them it opens showing their own words. */}
      {open || draft.directTo || draft.description.trim() !== '' ? (
        <div className="block">
          <label htmlFor="req-description" className="block text-small font-display font-semibold text-ink-800 mb-1.5">
            {draft.directTo
              /* ⚠️ WRITING TO ONE PERSON, THE MESSAGE IS THE REQUEST (2026-08-19).
                 With nobody chosen the structured taps carry a quotable request
                 and this field is a nicety; with a provider named, the taps are
                 gone and this sentence is the only thing they receive. */
              ? 'რა გჭირდება?'
              : <>დეტალები <span className="font-normal text-ink-400">არასავალდებულო</span></>}
          </label>
          <textarea
            id="req-description"
            rows={4}
            maxLength={4000}
            value={draft.description}
            onChange={e => patch({ description: e.target.value })}
            placeholder={placeholder}
            {...props('description')}
            className={`w-full px-3.5 py-3 rounded-field border bg-white text-body text-ink-900 placeholder-ink-400 focus:ring-2 outline-none resize-y transition-colors duration-fast ${bad('description') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'}`}
          />
          {error('description')}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start text-small font-display font-semibold text-brand-700 underline underline-offset-2"
        >
          დეტალების დამატება
        </button>
      )}

      <p className="pt-1 text-small text-ink-600">
        გადავამოწმებთ და ექსპერტებს გადავცემთ. უფასოა.
      </p>

      {/* ── The honeypot — see the schema comment in lib/requests ──
          `user-select: none` on top of the off-screen position: the field is
          invisible, but a select-all still put „ვებგვერდი" in the clipboard
          and it read as a stray visible input (owner, 2026-08-17). Bots read
          the DOM and are unaffected. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', left: '-9999px', width: 1, height: 1,
          overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none',
        }}
      >
        <label>
          ვებგვერდი
          <input
            type="text" tabIndex={-1} autoComplete="off"
            value={draft.website}
            onChange={e => patch({ website: e.target.value })}
          />
        </label>
      </div>
    </div>
  )
}
