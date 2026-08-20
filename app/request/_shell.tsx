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
import { StepIndicator } from '@/components/StepIndicator'
import { STAGES, type StageId } from './_model'

export function RequestShell({
  progress,
  step,
  stage,
  stages = STAGES,
  to,
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
  /**
   * ⚠️ WHICH OF THE THREE STAGES IS LIVE (2026-08-18).
   *
   * Owner, holding a screenshot of the budget question: „სამ ეტაპიანი
   * გავაკეთოთ." What that screen was missing is not fewer questions — it is any
   * sense of where in the run you are. „ბიუჯეტი — ერთ გაკვეთილზე" arrived with
   * a 1px percentage bar and no name for the part of the journey it belonged
   * to, so seven taps felt unbounded. An unbounded form is one you can quit
   * without losing anything.
   *
   * The bar stays: it answers „how much is left" to the pixel, which three
   * labels cannot. The labels answer „where am I", which the bar cannot. They
   * are two different questions and the header has room for both.
   *
   * Omitted on the pages that are not a wizard, exactly like `progress`.
   */
  stage?: StageId
  /** The stages this run actually has — `_model → stagesFor`. Defaulted to all
   *  three so the pages that are not a wizard need not think about it; a run
   *  that starts on „დეტალები" hands over two. */
  stages?: readonly { id: StageId; label: string }[]
  /**
   * ⚠️ WHO THIS IS BEING WRITTEN TO (2026-08-19) — one line, and it is the
   * whole reason `?to=` exists on this URL.
   *
   * Somebody who tapped „გამოაგზავნე მოთხოვნა" on a person's profile has to be
   * able to see, while they answer, that the answers are going to THAT person.
   * Without it the wizard looks identical to the one you reach from the header,
   * i.e. it looks like shouting into the void — which is exactly what the
   * feature exists to stop.
   *
   * It is a STATEMENT, not a control: there is nothing to change here, and the
   * way to write to somebody else is to open their profile.
   */
  to?: { name: string; photoSrc?: string | null } | null
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
        {/* ⚠️ `narrow`, MATCHING THE WIZARD'S OWN COLUMN (2026-08-18).
            RequestWizard centres its questions in a 560px column inside this
            820px shell — so the logo, the stage row, the „n/7" counter and the
            footer were all left-aligned 98px to the LEFT of the question they
            belong to. Measured at 1440: the stage row began at x=340 and the
            question at x=440. It reads as a broken layout on the first screen
            anybody sees, and it is one token, not four. */}
        <Container size="narrow" className="h-16 flex items-center justify-between gap-4">
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

        {/* ── The three stages ─────────────────────────────────────────────
            An `<ol>` (StepIndicator's `list` variant), because it IS an ordered
            list of three things and the order is the information. Not links and
            not buttons: you cannot jump to „კონტაქტი" without answering what
            comes before it, and a control that looks tappable and refuses is
            worse than plain text.

            The live one is the only one that carries weight and colour. „done"
            stays legible rather than greying out — it is a stage you completed,
            and dimming it says the opposite. */}
        {stage && (
          <Container size="narrow" className="pb-3">
            <StepIndicator variant="list" steps={stages} current={stage} />
          </Container>
        )}

        {/* The recipient. Under the stages and above the bar, because it is
            context for the whole run rather than for any one screen — and it
            stays put while the questions change. */}
        {to && (
          <Container size="narrow" className="pb-3">
            <p className="flex items-center gap-2 text-meta text-ink-600">
              {to.photoSrc && (
                // `alt=""` — the name is right beside it, so a second reading
                // of the same fact is noise in a screen reader.
                <img src={to.photoSrc} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
              )}
              <span className="truncate">
                მოთხოვნა გაეგზავნება: <span className="font-display font-semibold text-ink-900">{to.name}</span>
              </span>
            </p>
          </Container>
        )}

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
        <Container size="narrow">{children}</Container>
      </main>

      {/* One line, and it is the only thing on the page that is not the task.
          It exists because a form asking for a phone number owes the reader a
          sentence about what happens to it. */}
      <footer className="border-t border-ink-100 py-5">
        <Container size="narrow">
          {/* ⚠️ TWO LIES IN ONE SENTENCE, BOTH FIXED (2026-08-18).
              „მოთხოვნას ჯერ ჩვენ ვამოწმებთ" stopped being true the day triage
              started releasing clean requests on arrival — most senders are now
              in front of providers within seconds and nobody reads their
              request first. The same screen was showing „ვამოწმებთ ✓" as a
              COMPLETED station in the status track directly above this line
              claiming it had not happened yet.

              And „ექსპერტს" is the other product's word. Somebody having a tap
              fixed is not choosing an expert. The half that IS true — and is
              the only promise on this page worth making — is what happens to
              the phone number, so that is what it now says. */}
          <p className="text-meta text-ink-500">
            ნომერს მხოლოდ იმას ვაძლევთ, ვისაც შენ აირჩევ.
          </p>
        </Container>
      </footer>
    </div>
  )
}
