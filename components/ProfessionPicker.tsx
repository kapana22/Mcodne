'use client'
/* ONE QUESTION, ONE CONTROL — THE PROFESSION.  2026-08-21
 *
 * Owner, looking at the two-step version: „ორი ჩასაწერი არ უნდა იყოს სერვისის
 * დამატება — უფრო კომფორტული და მარტივი უნდა იყოს."
 *
 * WHAT THIS REPLACED, and why the two steps were never the applicant's problem
 * to solve. The control asked ① კატეგორია and ② პროფესია as two required
 * fields, and step ② was dead until step ① was answered. But the file itself
 * already knew the truth, in the comment above the search field:
 *
 *     „A person knows their JOB TITLE. The category is OUR taxonomy's need,
 *      not theirs."
 *
 * That was written to justify a SHORTCUT past step ① — a search that sets the
 * category on the applicant's behalf. If the shortcut is the honest path, the
 * step it goes around is not a question, it is a form asking somebody to do our
 * filing. So the category stopped being a control. It is now DERIVED from the
 * profession (`sphereOfProfessions`, first pick wins) and shown back on the
 * answer, and there is exactly one thing to do on this screen.
 *
 * ⚠️ THIS IS NOT THE 91-ROW COMBOBOX OF 2026-08-11, and the difference is the
 * whole design. That attempt was recorded here as „the worst of the four" for
 * two reasons, and a single field only earns its place by fixing both:
 *
 *   1. IT FLATTENED THE TAXONOMY and made the sphere a footnote — while
 *      `categoryId` decides browse, the filter, /categories/*, the counts and
 *      the SEO. → Here the categories are still on screen and still in the
 *      owner's launch order: they are the GROUP HEADINGS the professions sit
 *      under. The hierarchy is visible as structure. What is gone is only the
 *      obligation to fill it in. And the chosen category is printed on the
 *      answer chip („სანტექნიკოსი · სახლის რემონტი"), so it is confirmed to the
 *      applicant rather than filed silently behind them.
 *
 *   2. IT REQUIRED TYPING — 97 professions in one flat list is not something
 *      you browse unless you already know the word. → The list here is open by
 *      default, grouped, and the launch set (6 categories, 32 professions) is
 *      what a new applicant meets. The other fourteen categories sit behind one
 *      line, exactly as they did. Nobody has to type anything.
 *
 * Ticks are SQUARE and multi-select, up to MAX_PROFESSIONS. There is no longer
 * a round „one of" tick anywhere on the control, because there is no longer a
 * one-of question — which is the point.
 *
 * SHARED, in components/ rather than in one screen's folder: the door
 * (`app/join/_door/DoorQuestion`), the expert wizard (`app/join/_expert/_steps`)
 * and an existing expert's profile (`app/work/(expert)/profile/_tabProfile`)
 * all ask this one question. Two screens asking it with two controls is exactly
 * how the category vocabulary drifted apart before.
 */

import { Icon } from '@/components/Icon'
import { useState } from 'react'
import { ALL_PROFESSIONS, MAX_PROFESSIONS, PROFESSIONS, sphereOfProfessions } from '@/lib/professions'
import { isLaunchCategory, launchFirst } from '@/lib/launchTaxonomy'

type PickerSphere = { slug: string; name: string }

export function ProfessionPicker({
  spheres, sphere, onSphere, value, onChange,
}: {
  /** Every sphere, in the admin's display order, from /api/categories. */
  spheres: PickerSphere[]
  /** The resolved category NAME (that is what `specialty` carries), or ''.
   *  ⚠️ NO LONGER CHOSEN — derived from `value`. Still a prop because the
   *  three parents each store it in their own shape (`cats[0]`, `categoryId`,
   *  the draft) and are the ones who submit it. */
  sphere: string
  onSphere: (name: string) => void
  /** The chosen professions, in the order they were ticked. */
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [showRest, setShowRest] = useState(false)
  const q = query.trim().toLowerCase()
  const searching = q.length >= 2
  const full = value.length >= MAX_PROFESSIONS

  const nameOfSlug = (slug: string) => spheres.find(s => s.slug === slug)?.name ?? ''

  /** The offer: every sphere the API knows that has professions behind it,
   *  launch set first. A sphere with none is not a group — it is an empty
   *  heading, which is the „dead step ②" of the old design by another route. */
  const groups = launchFirst(spheres)
    .map(sp => ({ ...sp, jobs: PROFESSIONS[sp.slug] ?? [] }))
    .filter(g => g.jobs.length > 0)

  /**
   * ⚠️ THE SEARCH READS PROFESSIONS, and it is now the only thing it needs to
   * read, because a profession IS the answer. Kept from the two-step version:
   * the one word an applicant is certain of („ბუღალტერი", „იურისტი") has to
   * find them. A category name still matches too — typing „სამართალი" opens
   * that group whole — so the taxonomy is searchable without being a step.
   */
  const jobHits = searching
    ? ALL_PROFESSIONS.filter(p => p.job.toLowerCase().includes(q) && spheres.some(sp => sp.slug === p.slug))
    : []

  const shown = groups
    .map(g => (!searching || g.name.toLowerCase().includes(q))
      ? g
      : { ...g, jobs: g.jobs.filter(j => j.toLowerCase().includes(q)) })
    .filter(g => g.jobs.length > 0)

  /* ⚠️ A SEARCH MAY NOW HIDE A TICKED ROW, and that is safe here — it was not
     before. The old grid was the only place an answer was visible, so filtering
     it read as „your answer was lost". Every pick now has a permanent chip
     above the field, outside the filter, so the answer is on screen whatever
     the search is doing. */
  const launch = shown.filter(g => isLaunchCategory(g.slug))
  const rest = shown.filter(g => !isLaunchCategory(g.slug))
  const restOpen = showRest || searching || rest.some(g => g.jobs.some(j => value.includes(j)))

  /**
   * Tick a profession, and let the category follow.
   *
   * ⚠️ FIRST PICK WINS (`sphereOfProfessions`), not „the one just clicked".
   * Picking across categories is legitimate but rare — a lawyer who is also an
   * accountant — and the category is what they LED with. Having it jump to
   * whatever was tapped last would rewrite the applicant's headline answer as a
   * side effect of adding a second trade.
   */
  function pick(job: string) {
    const next = value.includes(job)
      ? value.filter(v => v !== job)
      : full ? value : [...value, job]
    if (next === value) return
    onChange(next)
    const slug = sphereOfProfessions(next)
    onSphere(slug ? nameOfSlug(slug) : '')
  }

  return (
    <div className="grid gap-3">
      {/* ── the answer, always on screen ──────────────────────────────────
          The category is printed ON the chip rather than in a field of its
          own: „სანტექნიკოსი · სახლის რემონტი" is the applicant reading back
          both the thing they said and the thing we filed. */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="არჩეული">
          {value.map(job => {
            const cat = nameOfSlug(sphereOfProfessions([job]) ?? '')
            return (
              <span key={job} className="inline-flex items-center gap-2 min-h-11 pl-3.5 pr-1.5 rounded-pill border border-brand-200 bg-brand-50 text-brand-800">
                <span className="text-body leading-snug">
                  <b className="font-display font-semibold">{job}</b>
                  {cat && <span className="text-brand-700"> · {cat}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => pick(job)}
                  aria-label={`${job} — მოხსნა`}
                  className="w-8 h-8 shrink-0 rounded-full inline-flex items-center justify-center text-brand-700 hover:bg-white hover:text-danger-700 transition-colors duration-fast"
                >
                  <Icon.x className="w-3.5 h-3.5" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* An existing profile whose category was set before this control asked
          for professions. Say what is on file rather than showing nothing —
          removing every profession is what clears it, and that is visible. */}
      {value.length === 0 && !!sphere && (
        <p className="text-small text-ink-500">კატეგორია: <b className="font-display font-semibold text-ink-900">{sphere}</b></p>
      )}

      <div>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="მოძებნე პროფესია — სანტექნიკოსი, ბუღალტერი, იურისტი…"
          aria-label="მოძებნე პროფესია"
          className="w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition-[border-color,box-shadow] duration-fast"
        />

        <div className="mt-2 rounded-card border border-ink-200 bg-ink-75 p-2" role="group" aria-label="პროფესია">
          {shown.length === 0 && (
            <p className="px-2.5 py-4 text-center text-small text-ink-500">
              ვერაფერი მოიძებნა — მოხსენი ძებნა და გადახედე სიას.
            </p>
          )}

          {launch.map(g => (
            <Group key={g.slug} name={g.name} jobs={g.jobs} value={value} full={full} onPick={pick} />
          ))}

          {rest.length > 0 && !restOpen && (
            <button
              type="button"
              onClick={() => setShowRest(true)}
              aria-expanded={false}
              className="w-full mt-1 pt-3 min-h-11 px-2.5 border-t border-ink-100 inline-flex items-center gap-1.5 rounded-btn text-small font-display font-semibold text-ink-600 hover:text-ink-900 transition-colors duration-fast"
            >
              სხვა კატეგორიები ({rest.length})
              <Icon.chevD className="w-4 h-4" aria-hidden />
            </button>
          )}
          {restOpen && rest.map(g => (
            <Group key={g.slug} name={g.name} jobs={g.jobs} value={value} full={full} onPick={pick} />
          ))}
        </div>

        {/* The limit is stated ONLY once it binds. „მაქსიმუმ 5" printed under an
            empty control is a rule about a problem nobody has yet. */}
        {full && (
          <p className="mt-2 text-meta text-ink-500">
            {MAX_PROFESSIONS} პროფესია მაქსიმუმია — მოხსენი ერთი, თუ სხვის დამატება გინდა.
          </p>
        )}
      </div>
    </div>
  )
}

/* ONE CATEGORY, AS A HEADING. This is the whole answer to „the 2026-08-11
   combobox flattened the taxonomy": the sphere is still here, still in the
   owner's order, still naming itself — it is simply not a field. */
const Group = ({ name, jobs, value, full, onPick }: {
  name: string
  jobs: readonly string[]
  value: string[]
  full: boolean
  onPick: (job: string) => void
}) => (
  <div className="mb-1 last:mb-0">
    <p className="px-2.5 pt-2 pb-1 font-display text-micro font-semibold uppercase text-ink-500">{name}</p>
    <div className="grid sm:grid-cols-2 gap-1">
      {jobs.map(job => {
        const on = value.includes(job)
        return (
          <button
            key={job}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onPick(job)}
            disabled={!on && full}
            className={`min-w-0 min-h-11 px-2.5 py-2 flex items-center gap-2.5 text-left rounded-btn border transition-colors duration-fast disabled:opacity-45 disabled:cursor-not-allowed ${
              on
                ? 'border-brand-500 bg-brand-50 text-brand-800'
                : 'border-transparent text-ink-900 hover:bg-white hover:border-ink-200'
            }`}
          >
            <span className={`w-[18px] h-[18px] shrink-0 rounded border-[1.5px] inline-flex items-center justify-center ${
              on ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-300 bg-white'
            }`}>
              {on && <Icon.check className="w-3 h-3" />}
            </span>
            {/* WRAPS, never truncates. `truncate` here cost twice: a label cut
                to „…სპეცი…" is not a choice, and inside a grid item
                (min-width:auto) whitespace-nowrap widened the track past the
                card on a 390px screen. */}
            <span className="min-w-0 flex-1 text-body leading-snug">{job}</span>
          </button>
        )
      })}
    </div>
  </div>
)
