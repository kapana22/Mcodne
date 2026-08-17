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

/* ⚠️ THE BUBBLES ARE GONE (2026-08-17, second pass), AND THIS IS THE WHOLE
 * REDESIGN.
 *
 * There used to be two more components here: `Ask`, a grey bubble carrying the
 * live question, and `Said`, a brand-600 filled bubble carrying the newest
 * answer. With the option rows below them that put FOUR visual languages on one
 * screen — underlined chip, grey bubble, green bubble, outlined card — and the
 * hierarchy came out backwards. Measured: the question rendered at `text-body`
 * (14px) and every option label rendered at `text-body` (14px) as well, so the
 * question was not merely weaker than the choices, it was IDENTICAL to them and
 * sitting on a quieter ground. The loudest thing on the screen was the filled
 * green bubble — the answer the person had already given.
 *
 * The conversational feel was the right instinct and the bubbles were the wrong
 * carrier. Bubbles work where the composer is pinned to the bottom of a fixed
 * pane and old turns scroll away behind it (Lemonade, Intercom). This is a
 * document that grows downwards, and every reference product with that layout —
 * Typeform, Bark, Thumbtack, Angi — shows one loud question and a quiet record.
 * So: ONE language, the form. The record is chips, the question is the page's
 * heading, and the conversation is carried by rhythm rather than by colour.
 */

/** One answered step. The label only — the QUESTION is dropped, because at this
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

  return (
    // ⚠️ EVERY ANSWER IS A CHIP NOW, INCLUDING THE NEWEST. It used to keep the
    // last exchange as a pair of bubbles „so the seam into the live question
    // still reads as a conversation" — and that seam was exactly the problem:
    // it put a second visual language directly above the question, and the
    // filled bubble outshouted it. One row, one language, ~40px for the whole
    // record however many answers it holds.
    //
    // ONE LINE, WRAPPING — not a grid and not a list. Six answers cost one line
    // of height instead of six rows; a layout that gives each its own row is
    // the stack again with smaller type. `·` is a separator, not a bullet: it
    // is aria-hidden so a screen reader hears six buttons and not six
    // interpuncts.
    <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {rows.map(({ step, answer }, i) => (
        <span key={step.id} className="inline-flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-ink-300">·</span>}
          <Chip label={answer} onEdit={() => onEdit(step.id)} />
        </span>
      ))}
    </div>
  )
}
