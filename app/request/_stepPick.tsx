'use client'
// The generic single-question screen: a title (the shell renders it), a column
// of large option rows, one tap = the answer AND the advance.
//
// ROWS, NOT A PILL CLOUD — the reference pattern. A screen that asks exactly
// one question can afford full-width targets: five rows read top-to-bottom in
// one glance, every target is the full card width (well past the 40px floor),
// and the selected state has room to say so. Pills earn their keep only where
// many options share a screen, which is precisely the layout this refactor
// removed.
//
// The skip affordance belongs to the SCREEN, not the option list: „გამოტოვება"
// under the rows, quiet, only where the model says the question is optional.

export type PickOption = { id: string; label: string; hint?: string }

export function StepPick({ options, value, onPick, onSkip, numbered = false }: {
  options: readonly PickOption[]
  value: string
  onPick: (id: string) => void
  /** Present only on skippable screens — see _model → StepDef.skippable. */
  onSkip?: () => void
  /**
   * Show the number key that answers this row.
   *
   * ⚠️ ONLY WHERE A KEYBOARD IS NEARLY CERTAIN. The badge is drawn at `lg:` and
   * up and is invisible below it — a key hint on a phone is a symbol for a
   * thing that does not exist, and it would sit in the one column of a 390px
   * row that the label needs. The shortcut itself works wherever a keyboard is
   * plugged in; the badge is only how somebody FINDS OUT, and a person on a
   * laptop is who finds out.
   *
   * Off on a list that is not the live question — see the format screen.
   */
  numbered?: boolean
}) {
  return (
    <div>
      <div className="grid gap-2.5">
        {options.map((o, i) => {
          const on = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o.id)}
              // ⚠️ THE PRESS IS THE POINT. Until 2026-08-17 the only state
              // change here was the border going green — and since a tap also
              // advances the screen, the answer never visibly landed: you
              // pressed, and the next question appeared. `active:scale-[0.99]`
              // is the value the home + /categories cards already press at
              // (0.97 is the BUTTON tier and moves a 560px row 17px, which
              // reads as a jolt), and the selected row now carries a fill, not
              // just an outline — an outline alone is the weakest possible
              // „chosen" and is the first thing lost on a dim phone screen.
              className={`group w-full text-left rounded-card border px-5 py-4 flex items-center gap-4 transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.99] ${
                on
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span // ⚠️ `no-caps` (2026-08-18). globals.css turns on the „case" feature for
              // every `button`, and an option row IS a button — so „სანტექნიკა"
              // rendered as „ᲡᲐᲜᲢᲔᲥᲜᲘᲙᲐ" here while the same word on /experts
              // (an <a> pill, outside that selector) rendered normally. Six rows
              // of shouted Georgian is markedly slower to scan, and the type
              // note is explicit that mtavruli is for SHORT labels — these are
              // sentences („ოთხი ან მეტი ოთახი").
              className="block font-display text-body font-semibold text-ink-900 no-caps">{o.label}</span>
                {o.hint && <span className="block text-small text-ink-500 mt-0.5">{o.hint}</span>}
              </span>
              {/* The key that answers this row. `text-micro` is the uppercase +
                  tracked + numeric tier the canon reserves for exactly this —
                  a counter, not reading text. aria-hidden because a screen
                  reader announcing „1" before every label is noise for somebody
                  who is already navigating by keyboard. */}
              {numbered && i < 9 && (
                <span
                  aria-hidden
                  className={`hidden lg:inline-flex shrink-0 w-5 h-5 items-center justify-center rounded-field border text-micro font-bold tabular-nums transition-colors duration-fast ${
                    on
                      ? 'border-brand-300 text-brand-700'
                      : 'border-ink-200 text-ink-400 group-hover:border-ink-300 group-hover:text-ink-600'
                  }`}
                >
                  {i + 1}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-4 text-small font-display font-semibold text-ink-500 underline underline-offset-2 hover:text-ink-700 transition-colors duration-fast"
        >
          გამოტოვება
        </button>
      )}
    </div>
  )
}
