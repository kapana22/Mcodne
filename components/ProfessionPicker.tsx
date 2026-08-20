'use client'
/* TWO LEVELS, BOTH VISIBLE — the sphere, then its professions.  2026-08-11
 *
 * WHAT THE FOUR EARLIER ATTEMPTS GOT WRONG. A wall of 16 chips, a
 * search-and-drill list, a bare <select>, and a single combobox over all 91
 * professions. The last one was the worst of the four and it is worth saying
 * why, because it looked like progress:
 *
 *   · it FLATTENED a structure the owner had deliberately defined. 16 spheres
 *     with their own professions became one 91-row list in which the sphere was
 *     a grey heading — the hierarchy stopped being visible at all;
 *   · it made the SPHERE a footnote. „სფერო: X" in 12px grey under the field,
 *     for the single most consequential value on the form: `categoryId` decides
 *     browse, the filter, /categories/*, the counts and the SEO;
 *   · and it was justified with the wrong research. Baymard's autocomplete
 *     rules are about SEARCH SUGGESTIONS. Search is a shortcut for somebody who
 *     already knows the word; it is not how you present a taxonomy to somebody
 *     deciding where they belong.
 *
 * SO: two numbered, labelled controls, both on screen at once, the relationship
 * carried by layout instead of by explanation.
 *
 *   ① სფერო      — one, a native <select>. The OS owns its scrolling, it is one
 *                  h-11 field like every other, and the chosen value IS the
 *                  field. It is control number one because it is the decision
 *                  that matters most.
 *   ② პროფესია   — several, as CHECKBOXES, and every one of them visible:
 *                  the largest sphere holds 9, which fits two columns without
 *                  a scrollbar anywhere on the step. Multi-select is a fact you
 *                  can see rather than a behaviour you have to discover.
 *
 * Picks made under a DIFFERENT sphere are kept and listed separately rather
 * than dropped — switching spheres to add „ბუღალტერი" must not silently
 * discard „მარკეტოლოგი".
 *
 * Prototyped in claude-design/two-level.html and agreed before shipping.
 *
 * SHARED, in components/ rather than app/apply/: /apply asks this question of a
 * new applicant and /tutor/profile asks it of an existing expert. Two screens
 * asking the same question with two controls is exactly how the category
 * vocabulary drifted apart before — one component, one behaviour.
 */

import { Icon } from '@/components/Icon'
import { MAX_PROFESSIONS, PROFESSIONS } from '@/lib/professions'

export type PickerSphere = { slug: string; name: string }

export function ProfessionPicker({
  spheres, sphere, onSphere, value, onChange,
}: {
  /** Every sphere, in the admin's display order, from /api/categories. */
  spheres: PickerSphere[]
  /** The chosen sphere's NAME (that is what `specialty` carries), or ''. */
  sphere: string
  onSphere: (name: string) => void
  /** The chosen professions, in the order they were ticked. */
  value: string[]
  onChange: (next: string[]) => void
}) {
  const current = spheres.find(s => s.name === sphere)
  const jobs = current ? (PROFESSIONS[current.slug] ?? []) : []
  const full = value.length >= MAX_PROFESSIONS

  /* Ticks that belong to some OTHER sphere. They are not shown among the
     checkboxes (those are this sphere's), so without this block they would be
     invisible while still being submitted — the worst of both. */
  const elsewhere = value.filter(j => !jobs.includes(j))

  const toggle = (job: string) => {
    if (value.includes(job)) onChange(value.filter(v => v !== job))
    else if (!full) onChange([...value, job])
  }

  return (
    <div className="grid gap-5">
      {/* ── ① the sphere ─────────────────────────────────────────────────── */}
      <div>
        <StepLabel n={1} on={!!sphere}>კატეგორია</StepLabel>
        {/* A GRID, NOT A <select>. Seventeen spheres in a native dropdown is a
            list you scroll blind: macOS paints it as an overlay across the
            page, a phone as a wheel, and either way you cannot see the options
            you are choosing between — which is the entire job of step ①.
            All seventeen fit here in nine rows and are chosen in one tap.

            It is deliberately the SAME control as the professions grid below:
            same container, same row, same tick. Two steps of one question
            should not look like two different mechanisms — the only difference
            is the tick's shape, round for „one of", square for „any of", which
            is the one convention that tells them apart without a word. */}
        <div
          role="radiogroup"
          aria-label="კატეგორია"
          className="grid sm:grid-cols-2 gap-1 rounded-card border border-ink-200 bg-ink-50/40 p-2"
        >
          {spheres.map(sp => {
            const on = sphere === sp.name
            return (
              <button
                key={sp.slug}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onSphere(on ? '' : sp.name)}
                className={`min-w-0 min-h-11 px-2.5 py-2 flex items-center gap-2.5 text-left rounded-btn border transition-colors duration-fast ${
                  on
                    ? 'border-brand-500 bg-brand-50 text-brand-800 font-display font-semibold'
                    : 'border-transparent bg-white text-ink-900 hover:border-ink-200'
                }`}
              >
                <span className={`w-[18px] h-[18px] shrink-0 rounded-full border-[1.5px] inline-flex items-center justify-center ${
                  on ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-300 bg-white'
                }`}>
                  {on && <Icon.check className="w-3 h-3" />}
                </span>
                {/* Wraps, never truncates — „არქიტექტურა და მშენებლობა" is
                    two words long and a cut label is not a choice. */}
                <span className="min-w-0 flex-1 text-body leading-snug">{sp.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── ② its professions ────────────────────────────────────────────── */}
      <div>
        <StepLabel
          n={2}
          on={value.length > 0}
          right={value.length > 0 ? `${value.length}/${MAX_PROFESSIONS}` : undefined}
        >
          პროფესია
        </StepLabel>

        {!current ? (
          <p className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-4 py-6 text-center text-small text-ink-500">
            ჯერ კატეგორია აირჩიე — მერე აქ მისი პროფესიები გამოჩნდება.
          </p>
        ) : jobs.length === 0 ? (
          // A sphere the admin added that has no professions listed yet. Say so;
          // the applicant can still finish (the sphere alone is a valid answer).
          <p className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-4 py-6 text-center text-small text-ink-500">
            ამ კატეგორიის პროფესიები ჯერ არ აქვს — კატეგორია საკმარისია.
          </p>
        ) : (
          /* ONE BLOCK. Loose rows on a bare background read as a scattered list;
             the hairline container makes the set read as ONE answer to ONE
             question rather than nine unrelated switches. Nine is the largest
             sphere, so it never scrolls at any width.
             TWO columns, not three: at three, „შრომითი სამართლის სპეციალისტი"
             and „ინტელექტუალური საკუთრების იურისტი" no longer fit on one line. */
          <div className="grid sm:grid-cols-2 gap-1 rounded-card border border-ink-200 bg-ink-50/40 p-2">
            {jobs.map(job => {
              const on = value.includes(job)
              return (
                <button
                  key={job}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(job)}
                  disabled={!on && full}
                  className={`min-w-0 min-h-11 px-2.5 py-2 flex items-center gap-2.5 text-left rounded-btn border transition-colors duration-fast disabled:opacity-45 disabled:cursor-not-allowed ${
                    on
                      ? 'border-brand-500 bg-brand-50 text-brand-800 font-display font-semibold'
                      : 'border-transparent bg-white text-ink-900 hover:border-ink-200'
                  }`}
                >
                  <span className={`w-[18px] h-[18px] shrink-0 rounded border-[1.5px] inline-flex items-center justify-center ${
                    on ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-300 bg-white'
                  }`}>
                    {on && <Icon.check className="w-3 h-3" />}
                  </span>
                  {/* WRAPS, never truncates. `truncate` here cost twice: a label
                      cut to „…სპეცი…" is not a choice, and inside a grid item
                      (min-width:auto) whitespace-nowrap widened the track past
                      the card on a 390px screen. */}
                  <span className="min-w-0 flex-1 text-body leading-snug">{job}</span>
                </button>
              )
            })}
          </div>
        )}

        {elsewhere.length > 0 && (
          <div className="mt-3 pt-3 border-t border-ink-100">
            <p className="mb-1.5 text-meta text-ink-500">სხვა კატეგორიიდან არჩეული:</p>
            <div className="flex flex-wrap gap-1.5">
              {elsewhere.map(job => (
                <span key={job} className="inline-flex items-center gap-1.5 h-7 pl-3 pr-1 rounded-pill border border-ink-200 bg-ink-50 text-meta text-ink-700">
                  <b className="font-display font-semibold text-ink-900">{job}</b>
                  <button
                    type="button"
                    onClick={() => onChange(value.filter(v => v !== job))}
                    aria-label={`${job} — მოხსნა`}
                    className="w-6 h-6 rounded-full inline-flex items-center justify-center text-ink-500 hover:text-danger-700 transition-colors duration-fast"
                  >
                    <Icon.x className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {full && (
          <p className="mt-2 text-meta text-ink-500">
            {MAX_PROFESSIONS} პროფესია მაქსიმუმია — მოხსენი ერთი, თუ სხვის დამატება გინდა.
          </p>
        )}
      </div>
    </div>
  )
}

/* The number is not decoration: it says these two are ONE question in order,
   which is the relationship the previous designs kept failing to show. */
const StepLabel = ({ n, on, right, children }: { n: number; on: boolean; right?: string; children: React.ReactNode }) => (
  <div className="mb-2 flex items-center gap-2">
    <span className={`w-5 h-5 shrink-0 rounded inline-flex items-center justify-center font-display text-micro font-bold transition-colors duration-fast ${
      on ? 'bg-brand-600 text-white' : 'bg-ink-900 text-white'
    }`}>{n}</span>
    <span className="font-display text-micro font-semibold uppercase text-ink-500">{children}</span>
    <span className="text-danger-500" aria-hidden>*</span>
    {/* A SIBLING of the label, not part of its text. Nested inside it, `ml-auto`
        had no flex parent to push against and the counter rendered glued to the
        word: „პროფესია2/5". */}
    {right && (
      <span className="ml-auto font-display text-meta font-semibold tabular-nums text-brand-700">{right}</span>
    )}
  </div>
)
