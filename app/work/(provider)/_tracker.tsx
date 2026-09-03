// THE THREE STEPS OF WINNING ONE JOB — drawn on the job page and again on the
// „chosen" screen, from the owner's design canvas (2026-09-01, „Expert Jobs").
//
// ⚠️ WHY A TRACKER EARNS ITS SPACE HERE, when most do not. The provider's side
// of this flow has a genuine ordering problem: answering is free, being chosen
// is somebody else's decision, and the money is spent at a third moment that
// used to come FIRST. A provider who paid before bidding under the old order
// and meets the new one has to be told, in one glance, that the fee is at the
// end and not at the start. Three dots do that; a paragraph does not.
//
// ⚠️ THE STEPS ARE THE PROVIDER'S, NOT THE REQUEST'S. „დადასტურების მიღება" is
// the client accepting, which is the one step this person cannot perform — and
// that is exactly why it is drawn: the wait is the product, and a wait nobody
// named reads as a broken screen.
//
// ⚠️ NO FOURTH STEP FOR „დასრულდა". The canvas draws three and stops, and so
// does this: completion lives on /work/jobs with its own list, and a step that
// points off this screen would be a promise the tracker cannot keep.

import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'

/** The canvas's three, in its own words. Exported so a test can pin the labels
 *  without re-typing them. */
export const JOB_STEPS = ['შეთავაზების გაგზავნა', 'დადასტურების მიღება', 'სამუშაოს დაწყება'] as const

export function JobTracker({ active, className = '' }: {
  /** 0-based: which step the provider is ON. Everything before it is done. */
  active: 0 | 1 | 2
  className?: string
}) {
  return (
    <Card className={className}>
      {/* ⚠️ AN ORDERED LIST, BECAUSE THAT IS WHAT IT IS. The dots and rules are
          decoration a screen reader has no use for; the sequence and which one
          is current are the content, so the marks are `aria-hidden` and the
          state is said in words instead. */}
      <ol className="flex items-start gap-3 overflow-x-auto">
        {JOB_STEPS.map((label, i) => {
          const done = i < active
          const on = i <= active
          return (
            <li
              key={label}
              aria-current={i === active ? 'step' : undefined}
              className="flex min-w-[130px] flex-1 flex-col items-center gap-2.5 text-center"
            >
              <span className="flex w-full items-center gap-2" aria-hidden>
                <span className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : on ? 'bg-brand-600' : 'bg-ink-200'}`} />
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border font-display text-small font-extrabold ${
                    on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-500'
                  }`}
                >
                  {done ? <Icon.check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={`h-0.5 flex-1 ${i === JOB_STEPS.length - 1 ? 'bg-transparent' : done ? 'bg-brand-600' : 'bg-ink-200'}`} />
              </span>
              <span className={`font-display text-small font-semibold leading-snug ${on ? 'text-ink-900' : 'text-ink-500'}`}>
                {label}
                {/* Said only where it is true, and only to a reader who cannot
                    see the filled dot. */}
                {i === active && <span className="sr-only"> — მიმდინარე ეტაპი</span>}
                {done && <span className="sr-only"> — დასრულებული</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
