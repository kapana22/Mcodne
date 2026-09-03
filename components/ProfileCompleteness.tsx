'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './Icon'
import { Eyebrow } from '@/components/Eyebrow'
import {
  creditTasks, earnedTasks, completeness, taskAnchor, gelLabel,
  type ProfileFacts,
} from '@/lib/credits'

/* ProfileCompleteness — the card beside the profile editor: what is still
   missing, and what finishing it pays.

   ⚠️ IT SCORED A DIFFERENT SIX THINGS UNTIL 2026-09-03, and that was the bug.
   It ran on `lib/profileScore` — services, price, bio, headline, avatar,
   languages, weighted to 100 — and printed „+15%" against each row, while the
   balance page listed the SIX TASKS THAT ACTUALLY PAY (professions, service,
   work photo, photo, bio, experience) with „+20₾" against each. Two lists, two
   scales, both called „finish your profile", 300px apart on the same screen.
   app/work/layout.tsx had already written down what that costs: „the bar could
   read 100% above a line promising 40₾ still to earn."

   Owner, on a screenshot of the percentages: „ვფიქრობ აქ ეგ კრედიტები ან
   ლარები უნდა ეწეროს." So the card moved onto the paying list. Relabelling the
   percentages as lari would have been the same defect with worse numbers — the
   rows were not the rows that pay.

   ⚠️ THE FACTS ARE THE CALLER'S, AND THEY COME FROM THE DRAFT. `earnedTasks`
   and `completeness` are pure (lib/credits), so the editor recomputes them from
   what is being typed and the checklist moves with the form rather than one
   save later. The GRANT is still the server's — this card promises, the ledger
   pays. */

type ProfileCompletenessProps = {
  /** What the profile currently contains — the same shape lib/creditsServer
   *  builds on the server, computed here from the draft so the card is live. */
  facts: ProfileFacts
  /** Optional visual variant. `card` = full section (used on profile page),
      `compact` = right-rail widget (used on dashboard). */
  variant?: 'card' | 'compact'
  /** When true, the card renders even at 100% — profile page always shows. */
  alwaysShow?: boolean
  className?: string
}

const scrollToAnchor = (anchor: string) => {
  if (typeof window === 'undefined' || !anchor.startsWith('#')) return
  const id = anchor.slice(1)
  const el = document.getElementById(id)
  if (!el) return
  // Ask any collapsed container (mobile accordion groups on /tutor/profile)
  // to reveal this section first — scrollIntoView is a no-op on a
  // display:none target. Scroll on the next frame so layout has settled.
  window.dispatchEvent(new CustomEvent('mcodne:reveal-section', { detail: id }))
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' })
  })
}

export function ProfileCompleteness({
  facts,
  variant = 'card',
  alwaysShow = false,
  className = '',
}: ProfileCompletenessProps) {
  const router = useRouter()
  const checks = useMemo(() => {
    const done = earnedTasks(facts)
    return creditTasks().map(t => ({
      id: t.key,
      label: t.label,
      tetri: t.tetri,
      done: done.includes(t.key),
      anchor: taskAnchor(t.key),
    }))
  }, [facts])

  const { percent, undone } = useMemo(
    () => ({ percent: completeness(facts), undone: checks.filter(c => !c.done) }),
    [facts, checks],
  )

  // Hide compact variant once profile is fully polished — dashboard shouldn't
  // nag when there's nothing to fix.
  if (!alwaysShow && percent >= 100 && variant === 'compact') return null

  const shownItems = undone.length > 0
    ? undone.slice(0, 5)
    : checks.slice(0, 3) // if none undone, show first 3 as "all-done" recap
  // ⚠️ IT WAS A TERNARY WITH TWO IDENTICAL BRANCHES (2026-08-30) — the compact
  // variant once said something shorter, the two converged, and the fork was
  // left behind reading as though a choice were still being made.
  const label = 'პროფილის სისრულე'

  return (
    <section
      aria-label="პროფილის სისრულის ინდიკატორი"
      className={`rounded-card border border-brand-200 bg-brand-50/40 ${variant === 'compact' ? 'p-4' : 'p-5 sm:p-6'} ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Eyebrow>
            {label}
          </Eyebrow>
          <div className={`font-display font-bold text-ink-900 tracking-tight mt-1 ${variant === 'compact' ? 'text-body' : 'text-body-lg'}`}>
            {percent >= 100 ? 'პროფილი 100% სრულია' : `დარჩენილია ${undone.length} ნაბიჯი`}
          </div>
        </div>
        <div className="font-display font-bold text-brand-700 tabular-nums leading-none text-h2">
          {percent}%
        </div>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`პროფილი შევსებულია ${percent} პროცენტით`}
        className="mt-3 h-2 w-full rounded-pill bg-white border border-brand-100 overflow-hidden"
      >
        <div
          className="h-full rounded-pill bg-gradient-to-r from-brand-500 to-brand-400 motion-safe:transition-[width] motion-safe:duration-slow motion-safe:ease-out-quart"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Checklist */}
      <ul className={`mt-4 space-y-1.5 ${variant === 'compact' ? 'text-meta' : 'text-small'}`}>
        {shownItems.map(item => (
          <li key={item.id}>
            <a
              href={item.anchor}
              onClick={e => {
                if (typeof window === 'undefined') return
                if (item.anchor.startsWith('#')) {
                  // In-page section: scroll instead of jumping the hash.
                  e.preventDefault()
                  scrollToAnchor(item.anchor)
                  history.replaceState(null, '', item.anchor)
                } else {
                  // Full route (e.g. /tutor/schedule): SPA-navigate there.
                  e.preventDefault()
                  router.push(item.anchor)
                }
              }}
              aria-label={item.done ? `დასრულებულია: ${item.label}` : `დაუსრულებელი: ${item.label} — გადადი შესაბამის სექციაზე`}
              className={`group flex items-start gap-2 rounded-btn px-2 py-1.5 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                item.done ? 'text-ink-500 hover:bg-white/60' : 'text-ink-900 hover:bg-white/80'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 inline-flex items-center justify-center shrink-0 w-4 h-4 rounded-full border ${
                  item.done
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-white border-ink-300 text-transparent group-hover:border-brand-400'
                }`}
              >
                {item.done && <Icon.check className="w-2.5 h-2.5" />}
              </span>
              <span className={`flex-1 leading-snug ${item.done ? 'line-through' : 'font-display font-semibold'}`}>
                {item.label}
              </span>
              {/* ⚠️ WHAT IT PAYS, NOT WHAT IT WEIGHS (2026-09-03). „+15%" was a
                  share of a completeness score nobody is paid for; „+20₾" is a
                  fact about the ledger, and it is the same figure the balance
                  page prints against the same task. Through `gelLabel`, so the
                  two screens cannot punctuate one amount two ways. */}
              {!item.done && (
                <span className="font-mono text-meta tabular-nums text-brand-700 shrink-0 mt-0.5">+{gelLabel(item.tetri)}</span>
              )}
            </a>
          </li>
        ))}
      </ul>

      {percent < 100 && variant === 'card' && (
        <p className="mt-4 text-meta text-ink-500 leading-snug">
          სრული პროფილი მეტ კლიენტს იზიდავს.
        </p>
      )}
    </section>
  )
}

export default ProfileCompleteness
