'use client'
// THE CONVERSATION SO FAR — the last exchange in full, everything older as one
// line of chips.
//
// ⚠️ THIS WAS SIX STACKED BUBBLE PAIRS UNTIL 2026-08-17, AND THE NUMBERS ARE
// WHY IT IS NOT ANY MORE. Measured in the browser at 1440×900:
//
//     pairs 1 → live question at y=302, page  931px
//     pairs 3 → live question at y=489, page 1080px
//     pairs 6 → live question at y=769, page 1425px
//
// Every answer pushed the live question down 93px, so by the sixth there were
// 131px left under it on a laptop — less than the option rows or the textarea
// need. The wizard got HARDER TO USE THE FURTHER YOU GOT, which is backwards,
// and on a phone the bubbles wrap so it arrives sooner.
//
// ⚠️ THE TRANSCRIPT WAS NOT THE MISTAKE — THE LAYOUT WAS. Every product that
// runs a real chat transcript (Lemonade's Maya, Intercom, Drift) pins the
// composer to the bottom of a fixed-height pane and lets old messages scroll
// away BEHIND it; the live question never moves. Every product that keeps a
// document layout (Typeform, Bark, Thumbtack, Angi) shows ONE question and no
// transcript at all. What was built here was the second layout with the first
// one's content: a document that grows downwards forever.
//
// So the record stays — a person can still see and change what they said — but
// it stops being paid for in vertical space:
//   · the NEWEST exchange keeps its bubbles, so the seam into the live question
//     still reads as a conversation rather than a form
//   · everything older folds into one chip row, ~40px instead of ~520px
//   · each chip is still the edit control, so nothing is lost but the scroll
//
// ⚠️ AND THE HINT LINE IS GONE. „პასუხზე დააჭირე, თუ შეცვლა გინდა" was a line
// of instruction printed on every screen of the run. A row of chips that
// highlight under the cursor does not need to be told to somebody, and an
// instruction nobody reads is furniture.

import type { Draft, StepDef } from './_model'
import { answerLabel } from './_model'

/**
 * Ours: the question.
 *
 * Exported because the CURRENT question renders through it too — the live
 * question used to be a `text-h1` heading sitting on a column of bubbles, i.e.
 * two visual languages with a seam across the middle of the screen. One
 * component, so the conversation cannot develop two voices.
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
 * the page. Pressing the thing you said to change the thing you said is the
 * most direct mapping available, and it costs zero pixels.
 */
function Said({ children, onEdit }: { children: string; onEdit: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`შეცვლა: ${children}`}
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

/** One folded answer. The label only — the QUESTION is dropped, because at this
 *  size „დამწყები" is recognisable and „რა დონეა: დამწყები" is twice the width
 *  for a word the reader chose sixty seconds ago. */
function Chip({ label, onEdit }: { label: string; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`შეცვლა: ${label}`}
      className="text-meta text-ink-600 hover:text-ink-900 underline decoration-ink-200 hover:decoration-ink-400 underline-offset-4 transition-colors duration-fast"
    >
      {label}
    </button>
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
    // A skipped screen leaves no trace. „—" in a conversation is a person who
    // said nothing, and it is not worth a chip either.
    .filter((r): r is { step: StepDef; answer: string } => r.answer !== null)

  if (rows.length === 0) return null

  // The last exchange keeps its bubbles; the rest folds.
  const folded = rows.slice(0, -1)
  const last = rows[rows.length - 1]

  return (
    <div className="mb-5">
      {folded.length > 0 && (
        // ⚠️ ONE LINE, WRAPPING — not a grid and not a list. The whole point is
        // that six answers cost one line of height instead of six rows; a
        // layout that gives each its own row is the stack again with smaller
        // type. `·` is a separator, not a bullet: it is aria-hidden so a screen
        // reader hears six buttons and not six interpuncts.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4">
          {folded.map(({ step, answer }, i) => (
            <span key={step.id} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-ink-300">·</span>}
              <Chip label={answer} onEdit={() => onEdit(step.id)} />
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Ask>{last.step.title}</Ask>
        <Said onEdit={() => onEdit(last.step.id)}>{last.answer}</Said>
      </div>
    </div>
  )
}
