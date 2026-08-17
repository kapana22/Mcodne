'use client'
// The optional free-text screen — LAST question before the contact.
//
// Optional BY DESIGN, and the skip is not a shrug: the structured taps before
// this screen already carry a quotable request, and the admin's verification
// call fills any gap a sentence would have. The reference products make their
// free text skippable for the same reason — the essay requirement is where
// intake forms die.

import { templateFor, kindOf } from '@/lib/requests'
import type { Draft } from './_model'

const TEXTAREA =
  'w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'resize-y transition-colors duration-fast'

export function StepDetails({ draft, patch }: {
  draft: Draft
  patch: (p: Partial<Draft>) => void
}) {
  const kind = kindOf(draft.kind)
  return (
    <div>
      <textarea
        rows={6}
        maxLength={4000}
        value={draft.description}
        onChange={e => patch({ description: e.target.value })}
        className={TEXTAREA}
        placeholder={
          kind === 'LEARNING'
            ? 'ვინ ისწავლის, რა დონეა და რა არის მიზანი'
            : kind === 'CONSULTATION'
              ? 'რა კითხვა გაქვს და რა სიტუაციაა'
              : 'რა უნდა გაკეთდეს და რა შედეგს ელი'
        }
        autoFocus
      />
      {/* The insert-on-tap scaffold — see lib/requestTopics → TEMPLATES.
          Offered only while empty; inserting must never destroy typed text. */}
      {draft.description === '' && (
        <button
          type="button"
          onClick={() => patch({ description: templateFor(kind, draft.topic) })}
          className="mt-2 text-small font-display font-semibold text-brand-700 underline underline-offset-2"
        >
          შაბლონით დაწყება
        </button>
      )}
    </div>
  )
}
