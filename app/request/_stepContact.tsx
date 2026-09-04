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
        {/* ⚠️ THE HINT UNDER THIS FIELD IS GONE (2026-09-04). Owner: „აი ასე
            ჩაშლილად არ დაწერო არსად, წაშალე საერთოდ ეს ზედმეტი ინფო."

            It read „ნომერს მხოლოდ ჩვენ ვიყენებთ — მოთხოვნის გადასამოწმებლად",
            and it had already been rewritten once (2026-08-21) when the earlier
            promise — „only the expert you choose will see it" — stopped being
            true. The replacement was heading the same way: the number now
            reaches a provider the moment the client presses „დარეკვა", and it
            carries the request SMS, so „only we use it" was a sentence about to
            need its third version.
            A field labelled „ტელეფონის ნომერი" on a form that says who it is
            for does not need a paragraph explaining itself. The line went
            rather than getting rewritten a third time — which is also the
            general instruction: no spelled-out reassurance under fields. */}
      </div>

      {/* ⚠️ THE EMAIL FIELD IS GONE (2026-09-03). Owner: „კონტაქტის ველიდან
          ამოვიღოთ მელი." It was made REQUIRED on 2026-08-17 for one reason —
          every message this subsystem sent a client was an email, so an absent
          address meant the system never spoke to them again — and
          `ServiceRequestInput` said in the same breath what the real fix was:
          „THE HONEST FIX IS SMS, NOT THIS… When an SMS channel exists, this goes
          back to optional."

          It exists now: `request.received.client` texts the `MC-` code and
          `request.offerArrived.client` texts „somebody answered"
          (lib/smsTemplates). So the last screen before a submit is two fields
          again — a name and a number — which is where forms die and where every
          field removed is worth more than one added anywhere else.

          The account is no longer made here either: `lib/requestAccount` needs
          an address and there is none, so a request filed this way belongs to
          its `MC-` reference until somebody registers. That was already true of
          every request written before 2026-08-17. */}

      {/* ⚠️ THE DESCRIPTION FIELD LEFT THIS SCREEN (2026-09-04). It was a
          collapsed optional line here — „დეტალები არასავალდებულო", opened by a
          link — because on 2026-08-18 the measurement said 58% of people walked
          past a whole screen without typing. It is now a REQUIRED screen of its
          own before the budget (owner: „ცალკე უნდა იყოს ველი, დამატე,
          გაზარდე"), so a second box for the same column here would be the same
          question asked twice, and the second one would be the one nobody
          expects to matter. `draft.description` is unchanged; only where it is
          typed moved. */}

      <p className="pt-1 text-small text-ink-600">
        {/* ⚠️ „გადავამოწმებთ და" WENT ON 2026-09-03, and only that. A clean
            request is auto-verified — app/api/requests/route: „VERIFIED WITHOUT
            A HUMAN, when nothing was flagged" — so it reaches experts with
            nobody having looked at it first. The operator still phones every
            row; they simply no longer stand in front of it, which is not what
            „we will check it" promises to somebody about to press send.
            The same sentence was corrected on the wizard's own footer on
            2026-08-18 („მოთხოვნას ჯერ ჩვენ ვამოწმებთ" — „stopped being true
            the day triage started releasing clean requests on arrival") and
            these words were left standing here. */}
        ექსპერტებს გადავცემთ. უფასოა.
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
