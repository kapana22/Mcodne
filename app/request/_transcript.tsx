'use client'
// THE CONVERSATION SO FAR — every screen already answered, kept on the page.
//
// ⚠️ WHY THE WIZARD KEEPS ITS ANSWERS (2026-08-17). It used to replace one
// question with the next, which is what a form does and what made it read like
// one: seven screens, each erasing the last, and no sense of having got
// anywhere. Owner: „ეს ფორმასავით შემოდის და პირდაპირ ლაივ ჩათი რომ ეხსნებოდეს
// ეს უკვე სხვა ლეველია." A transcript is the cheap half of that — the run
// becomes something you are IN rather than something you are filling — and it
// runs straight into the real thread with us on the last screen.
//
// ⚠️ WHAT DID NOT CHANGE, deliberately: the controls. The chips, the option
// rows, the search box are all exactly what they were, because they are what
// makes this answerable in one tap. A „chat" that asks you to TYPE what you
// could tap is a downgrade wearing a costume — the bubbles are the framing, the
// taps are the interface.
//
// ⚠️ AND NO FAKE TYPING. No „…" delay before our question appears, no staged
// reveal. The answer is already known and the person is mid-task; a simulated
// pause is a wait we invented to look human, and it is felt as slowness by
// everybody who has used the form twice.

import type { Draft, StepDef } from './_model'
import { answerLabel } from './_model'

/**
 * Ours: the question.
 *
 * Exported because the CURRENT question renders through it too — the live
 * question used to be a `text-h1` heading sitting on top of a column of
 * bubbles, i.e. two visual languages with a seam across the middle of the
 * screen (owner, 2026-08-17: „ძალიან არაპროფესიონალურად ჩანს"). One component,
 * so the conversation cannot develop two voices.
 */
export function Ask({ children, as: Tag = 'div' }: {
  children: React.ReactNode
  /** „h1" for the live question — it is still the page's heading and what a
   *  screen reader announces on arrival. The bubble is styling, not semantics. */
  as?: 'div' | 'h1'
}) {
  return (
    <div className="flex justify-start">
      <Tag className="max-w-[85%] rounded-card bg-ink-75 text-ink-900 px-3.5 py-2 font-display text-body font-semibold leading-relaxed">
        {children}
      </Tag>
    </div>
  )
}

/**
 * Theirs: the answer, restated — AND the control that changes it.
 *
 * ⚠️ THE BUBBLE IS THE BUTTON. It used to be a bubble with the word „შეცვლა"
 * underlined beside it, and with three answers on screen that was three
 * identical underlined links, each starting at a different x because the
 * bubbles are different widths — a ragged column that was the loudest thing on
 * the page and the reason the screen read as unfinished. The affordance did not
 * need its own text: pressing the thing you said to change the thing you said
 * is the most direct mapping available, and it costs zero pixels.
 *
 * WHAT REPLACES THE LOST LABEL, because „it is obvious" is not a plan:
 *   · the accessible name spells it out — „შეცვლა: ინგლისური"
 *   · a pointer gets the word back on hover/focus, in a slot that is ALWAYS
 *     reserved, so nothing shifts when it appears
 *   · touch, which has no hover, gets one quiet line under the whole
 *     transcript — see Transcript. One line for the run, not one per answer.
 */
function Said({ children, onEdit }: { children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`შეცვლა: ${typeof children === 'string' ? children : ''}`}
        className="group max-w-[85%] flex items-center gap-2 text-left rounded-card motion-safe:active:scale-[0.99] transition-transform duration-fast"
      >
        {/* Reserved, not conditional: rendering this only on hover would move
            the bubble sideways under the cursor at the moment of the hover. */}
        <span
          aria-hidden
          className="shrink-0 text-meta text-ink-500 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-fast"
        >
          შეცვლა
        </span>
        <span className="rounded-card bg-brand-600 text-white px-3.5 py-2 text-body leading-relaxed whitespace-pre-wrap group-hover:bg-brand-700 group-focus-visible:bg-brand-700 transition-colors duration-fast">
          {children}
        </span>
      </button>
    </div>
  )
}

export function Transcript({ steps, currentId, draft, onEdit }: {
  steps: StepDef[]
  currentId: string
  draft: Draft
  /** Jump back to a screen. The wizard owns navigation; this only names the
   *  destination — a transcript that could set state would be a second place
   *  the run's position lives. */
  onEdit: (stepId: string) => void
}) {
  const upto = steps.findIndex(s => s.id === currentId)
  // Defensive: a step id that is not in the list (a draft revived across a
  // vocabulary change) means „show nothing" rather than „show everything".
  const done = upto <= 0 ? [] : steps.slice(0, upto)

  const rows = done
    .map(s => ({ step: s, answer: answerLabel(s.id, draft) }))
    // A skipped screen leaves no pair. See answerLabel: „—" in a conversation
    // is a person who said nothing, and it is not worth a line.
    .filter(r => r.answer !== null)

  if (rows.length === 0) return null

  return (
    <div className="mb-6">
      <div className="space-y-2">
        {rows.map(({ step, answer }) => (
          <div key={step.id} className="space-y-2">
            <Ask>{step.title}</Ask>
            <Said onEdit={() => onEdit(step.id)}>{answer}</Said>
          </div>
        ))}
      </div>
      {/* ONE line for the whole run — the thing that replaced one „შეცვლა" per
          answer. It is the only way a touch reader learns the bubbles are
          pressable, and at three answers it is already two lines cheaper than
          what it replaced. */}
      <p className="mt-2.5 text-meta text-ink-500 text-right">
        პასუხზე დააჭირე, თუ შეცვლა გინდა.
      </p>
    </div>
  )
}
