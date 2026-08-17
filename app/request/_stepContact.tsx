'use client'
// The last screen — who to call. And it IS the registration, whole: name and
// phone, no password, no account (owner: „რეგისტრაცია სულ ბოლოს და მარტივად").
// The publicRef link on the thanks screen is the client's key; asking for a
// sign-up before help may be asked for is the reference products' own
// anti-pattern, and this flow simply does not have the step.

import { PhoneInput } from '@/components/PhoneInput'
import {
  kindOf, KIND, budgetLabel, bandOf, timingLabel, topicLabel,
} from '@/lib/requests'
import type { Draft } from './_model'

const INPUT =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

const Label = ({ children, optional }: { children: React.ReactNode; optional?: boolean }) => (
  <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
    {children}
    {optional && <span className="ml-1 font-normal text-ink-400">არასავალდებულო</span>}
  </span>
)

/** Under the field, not above it: a hint is read when the cursor is already
 *  there, and a line between the label and the input pushes the two apart. */
const Hint = ({ children }: { children: React.ReactNode }) => (
  <span className="block mt-1.5 text-meta text-ink-500">{children}</span>
)

export function StepContact({ draft, patch, signedIn }: {
  draft: Draft
  patch: (p: Partial<Draft>) => void
  /** Changes ONE sentence — see the email hint. Everything else on this screen
   *  is identical for a guest and a member; the fields simply arrive filled. */
  signedIn: boolean
}) {
  const kind = kindOf(draft.kind)
  const band = draft.kind ? bandOf(kind, draft.budgetBand) : undefined

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
      <label className="block">
        <Label>სახელი</Label>
        <input
          type="text" required autoComplete="name"
          value={draft.contactName}
          onChange={e => patch({ contactName: e.target.value })}
          className={INPUT} placeholder="სახელი და გვარი"
        />
      </label>

      <label className="block">
        <Label>ტელეფონის ნომერი</Label>
        <PhoneInput value={draft.phone} onChange={v => patch({ phone: v })} className={INPUT} />
        <Hint>ამ ნომერზე დაგირეკავთ.</Hint>
      </label>

      <label className="block">
        {/* ⚠️ NO LONGER `optional` (2026-08-17). See ServiceRequestInput: every
            message this subsystem sends a client is an email, so an absent one
            meant the system never spoke to them again. */}
        <Label>ელფოსტა</Label>
        <input
          type="email" autoComplete="email" required
          value={draft.email}
          onChange={e => patch({ email: e.target.value })}
          className={INPUT} placeholder="you@example.ge"
        />
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
        <Hint>
          {signedIn
            ? 'შეთავაზებები ელფოსტაზე მოგივა.'
            : 'შეთავაზებები ელფოსტაზე მოგივა და ანგარიში თავისით შეიქმნება.'}
        </Hint>
      </label>

      <p className="pt-1 text-small text-ink-600">
        დაგირეკავთ, გადავამოწმებთ და ექსპერტებს გადავცემთ. უფასოა.
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
