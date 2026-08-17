'use client'
// THE CONVERSATION SO FAR — every screen already answered, kept on the page.
//
// ⚠️ WHY THE WIZARD KEEPS ITS ANSWERS NOW (2026-08-17). It used to replace one
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

/** Ours: the question. Full width, plain — it is the page's own voice. */
function Ask({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-card bg-ink-75 text-ink-900 px-3.5 py-2 text-body leading-relaxed">
        {children}
      </div>
    </div>
  )
}

/** Theirs: the answer, restated. Brand fill on the right, the same geometry the
 *  chat pane already uses (components/RequestChat) — one bubble language on the
 *  site, so the transcript and the live thread below it read as one surface. */
function Said({ children, onEdit }: { children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] flex items-center gap-2">
        {/* ⚠️ EDIT LIVES ON THE ANSWER, not in a summary table at the end. The
            wizard already walks backwards with „უკან", but that is a door out of
            the current question — this is the one thing a transcript can do that
            a form cannot: point at what you said and change THAT. */}
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-meta font-semibold text-ink-500 underline underline-offset-2 hover:text-ink-700 transition-colors duration-fast"
        >
          შეცვლა
        </button>
        <span className="rounded-card bg-brand-600 text-white px-3.5 py-2 text-body leading-relaxed whitespace-pre-wrap">
          {children}
        </span>
      </div>
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
    <div className="space-y-2 mb-6">
      {rows.map(({ step, answer }) => (
        <div key={step.id} className="space-y-2">
          <Ask>{step.title}</Ask>
          <Said onEdit={() => onEdit(step.id)}>{answer}</Said>
        </div>
      ))}
    </div>
  )
}
