'use client'
// ─────────────────────────────────────────────────────────────────────────
// The ONE wizard step strip. Extracted 2026-08-19 from three hand-rolled
// copies (the /apply top row, the /apply side rail's circle, the /request
// stage row) so „where am I in this run" is drawn one way site-wide.
//
//   variant="dots"  →  numbered circles joined by a 3px bar; each step is a
//                      button (the /apply strip). `completed` marks the ticked
//                      ones, `onSelect` receives the tap.
//   variant="list"  →  an <ol> of plain labels joined by a hairline (the
//                      /request stage row). Not tappable — you cannot jump to
//                      „კონტაქტი" without answering what comes before it, and a
//                      control that looks tappable and refuses is worse than
//                      plain text. Done = every step before `current`.
//
// Both mark the live step with aria-current="step". Classes are byte-for-byte
// what the call sites carried before the extraction — do not restyle here
// without re-checking every wizard.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react'
import { Icon } from '@/components/Icon'

type StepState = 'done' | 'active' | 'todo'

export type Step<Id extends string | number> = { id: Id; label: string }

/** The circle. Shared by the horizontal strip AND the /apply side rail
 *  (`app/apply/_chrome.tsx → ProgressNav`), which draws the same dot next to
 *  a step icon instead of a number. `group-hover:` expects the tappable
 *  wrapper to carry `group`. */
export function stepDotClass(state: StepState) {
  return state === 'done' ? 'bg-brand-600 text-white shadow-xs' :
    state === 'active' ? 'bg-brand-600 text-white ring-4 ring-brand-500/15 shadow-sm' :
    'bg-white border-2 border-ink-200 text-ink-400 group-hover:border-ink-300'
}

export function StepIndicator<Id extends string | number>({
  steps,
  current,
  completed,
  onSelect,
  variant = 'dots',
  className = '',
}: {
  steps: readonly Step<Id>[]
  /** The live step. */
  current: Id
  /** dots only — the ticked steps. A step that is both completed and current
   *  draws as done (the tick wins), exactly as the /apply strip always did. */
  completed?: ReadonlySet<Id>
  /** dots only — the tap. */
  onSelect?: (id: Id) => void
  variant?: 'dots' | 'list'
  className?: string
}) {
  if (variant === 'list') {
    const here = steps.findIndex(s => s.id === current)
    return (
      <ol className={`flex items-center gap-2 sm:gap-3 ${className}`}>
        {steps.map((s, i) => {
          const state: StepState = i < here ? 'done' : i === here ? 'active' : 'todo'
          return (
            <li key={s.id} className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span
                aria-current={state === 'active' ? 'step' : undefined}
                className={`text-meta font-display truncate ${
                  state === 'active' ? 'font-bold text-ink-900'
                    : state === 'done' ? 'font-semibold text-brand-700'
                    : 'text-ink-400'
                }`}
              >
                {s.label}
              </span>
              {/* A hairline between, not a chevron: three chevrons in a
                  16px row is more ink than the words they separate. */}
              {i < steps.length - 1 && (
                <span aria-hidden className="w-4 sm:w-6 h-px bg-ink-200 shrink-0" />
              )}
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {steps.map((s, i) => {
        const isDone = completed?.has(s.id) ?? false
        const isActive = current === s.id
        const state: StepState = isDone ? 'done' : isActive ? 'active' : 'todo'
        return (
          <React.Fragment key={s.id}>
            <button
              type="button"
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onSelect?.(s.id)}
              className="group flex items-center gap-2 min-h-[44px]"
            >
              <span className={`w-9 h-9 sm:w-7 sm:h-7 shrink-0 rounded-full inline-flex items-center justify-center font-display text-small sm:text-meta font-bold tabular-nums transition-all duration-fast ${stepDotClass(state)}`}>
                {isDone ? <Icon.check className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> : s.id}
              </span>
              <span className={`hidden lg:inline font-display text-meta font-semibold tracking-tight transition-colors duration-fast ${isActive ? 'text-brand-800' : isDone ? 'text-ink-900' : 'text-ink-500'}`}>{s.label}</span>
            </button>
            {i < steps.length - 1 && <span className={`flex-1 h-[3px] rounded-full transition-colors duration-fast ${isDone ? 'bg-brand-400' : 'bg-ink-100'}`} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}
