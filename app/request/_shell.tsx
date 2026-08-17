// The chrome for the request space — and there is deliberately almost none.
//
// ⚠️ THIS IS NOT A PAGE OF THE SITE, and it must not read as one. No site
// header, no footer, no bottom nav, no help bubble (AppShell suppresses those
// three on these paths). What is left is a logo that goes home and, on the
// wizard, a progress bar — because the two questions somebody has here are
// „where am I" and „how much is left", and nothing else.
//
// A person lands on this URL because they were sent it. They have one job. Any
// control that is not part of that job is an invitation to abandon it, and a
// four-step form is exactly the shape that gets abandoned.

import Link from 'next/link'
import { Container } from '@/components/Container'

export function RequestShell({
  progress,
  step,
  children,
}: {
  /** 0..1. Omit on pages that are not a wizard — the bar is then absent
   *  rather than drawn at zero. */
  progress?: number
  /**
   * „3 / 5", when the run's length is settled.
   *
   * ⚠️ THIS USED TO BE REFUSED ON PRINCIPLE, and the principle was half right.
   * The old note said a denominator that shrinks mid-flight reads as the form
   * growing under you — true, and the reason the bar exists. But the length
   * only moves ONCE, at the first screen, where picking a topic decides whether
   * the „აირჩიე ტიპი" screen and the clarifiers exist at all. From the second
   * screen onward `stepsFor` returns the same list every time.
   *
   * So the counter is shown from step two, and never on step one. „How much is
   * left" is the first thing anybody wants from a multi-step form, and refusing
   * to answer it because the answer is unknown for one screen was the wrong
   * trade. Omit the prop and only the bar draws.
   */
  step?: { index: number; total: number }
  children: React.ReactNode
}) {
  const showBar = typeof progress === 'number'
  const pct = showBar ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : 0

  return (
    // `min-h-dvh` and not `min-h-screen`: on a phone the URL bar eats 100vh and
    // the last field of a form ends up under it, which is the one place this
    // costs somebody a submission.
    <div className="min-h-dvh bg-ink-50/40 flex flex-col">
      <header className="border-b border-ink-200 bg-white">
        <Container size="content" className="h-16 flex items-center justify-between gap-4">
          <Link href="/" className="shrink-0" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>

          {/* `text-micro` is the numeric-counter tier the canon reserves for
              exactly this, and `tabular-nums` so the digits do not shift the
              line as the number grows. */}
          {step && (
            <span className="shrink-0 text-micro font-bold tabular-nums text-ink-500">
              {step.index} / {step.total}
            </span>
          )}
        </Container>
        {showBar && (
          // A real <progress> semantic, drawn by hand so it can carry the brand
          // colour. `duration-mid` because the bar MOVES and the user watches
          // it arrive — that is the token's whole definition.
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="შევსების პროგრესი"
            className="h-1 bg-ink-100"
          >
            <div
              className="h-full bg-brand-600 transition-[width] duration-mid ease-out-quart"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </header>

      {/* The extra bottom padding is for the cookie consent banner: wizard
          steps are SHORT, so their bottom controls land exactly where the
          fixed banner floats on a first visit, and a button under an overlay
          is a button that does not work. Long pages absorb this by scrolling;
          a short step needs the room reserved. */}
      <main className="flex-1 py-8 sm:py-12 pb-28 sm:pb-32">
        <Container size="content">{children}</Container>
      </main>

      {/* One line, and it is the only thing on the page that is not the task.
          It exists because a form asking for a phone number owes the reader a
          sentence about what happens to it. */}
      <footer className="border-t border-ink-100 py-5">
        <Container size="content">
          <p className="text-meta text-ink-500">
            მოთხოვნას ჯერ ჩვენ ვამოწმებთ. ნომერს მხოლოდ იმ ექსპერტს ვაძლევთ, რომელსაც შენ აირჩევ.
          </p>
        </Container>
      </footer>
    </div>
  )
}
