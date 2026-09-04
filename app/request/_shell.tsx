// The chrome for the request space — and there is deliberately almost none.
//
// ⚠️ THIS IS NOT A PAGE OF THE SITE, and it must not read as one. No site
// header, no footer, no bottom nav, no help bubble (AppShell suppresses those
// three on these paths). What is left is one row: the three stages and „3 / 6"
// — because the two questions somebody has here are „where am I" and „how much
// is left", and nothing else. Both are answered on that row, once each. It used
// to take three controls and 126px; see the header.
//
// A person lands on this URL because they were sent it. They have one job. Any
// control that is not part of that job is an invitation to abandon it, and a
// four-step form is exactly the shape that gets abandoned.

import Link from 'next/link'
import { Container } from '@/components/Container'
import { Icon } from '@/components/Icon'
import { STAGES, type StageId } from './_model'
import { REQUEST_ROUTE } from '@/lib/requests'
import { Footer } from '@/components/Footer'
import { PublicTopBar } from '@/components/PublicTopBar'

export function RequestShell({
  progress,
  body = 'narrow',
  step,
  stage,
  onStage,
  stages = STAGES,
  to,
  action,
  children,
}: {
  /**
   * ⚠️ THE BODY'S WIDTH, AND IT IS A ROUTE'S DECISION (2026-09-01).
   *
   * Everything this shell wraps was a focused FORM — one question at a time —
   * and 560px is the right measure for that, which is why it was hard-coded.
   * The client's request room is not a form: it is a list of offers beside the
   * conversation about them, and at 560 the two panes stack, which pushes the
   * thread and its message box below the fold. Owner: „კლიენტის მხარეს მესიჯის
   * ჩათი ძალიან არაკომფორტული და არაპრაქტიკულად არის დამალული და დაკარგული…
   * უნდა იყოს როგორც შემსრულებლის მხარეს."
   *
   * ⚠️ THE HEADER, THE STAGE RAIL AND THE FOOTER STAY NARROW. They belong to
   * the run, not to the screen, and a stage rail stretched to 1280 stops
   * reading as three steps. Only `children` moves.
   */
  body?: 'narrow' | 'content' | 'wide'
  /**
   * ⚠️ THE „ნომერს არავის ვაძლევთ" LINE, AND WHY IT IS NOW A SWITCH
   * (2026-09-03). Its own note below says it plainly: „that sentence is about
   * this screen" — the INTAKE, where the reader is deciding whether to type
   * their number into a form. On the request ROOM, which wears the same shell,
   * the second half („მიმოწერა პლატფორმაზეა") now sits a few hundred pixels
   * under a „დარეკვა" button, and a page that promises one thing and offers the
   * opposite is worse than a page that promises nothing.
   *
   * ⚠️ SWITCHED OFF, NOT REWRITTEN, AND DELIBERATELY SO. The copy is the
   * owner's (CLAUDE.md) and no replacement sentence has been written for the
   * room — inventing one here would put words in their mouth on the screen
   * where the promise matters most. What the room needs saying about contact is
   * an OPEN question for the owner; until it is answered the room says nothing
   * rather than something untrue.
   */
  /** 0..1. Omit on pages that are not a wizard — the bar is then absent
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
   * Omitted on the pages that are not a wizard; the row is then a spacer.
   */
  /** 0..1 — how far through the run this screen is. Drawn as the header's own
   *  bottom edge, so it costs 2px and not a block. Omitted by the pages that
   *  are not a wizard; the edge is then a plain hairline. */
  progress?: number
  stage?: StageId
  onStage?: (id: StageId) => void
  /** The stages this run actually has — `_model → stagesFor`. Defaulted to all
   *  three so the pages that are not a wizard need not think about it; a run
   *  that starts on „დეტალები" hands over two. */
  stages?: readonly { id: StageId; label: string }[]
  /** Go back to a stage already finished. Absent → the rail is plain text, as
   *  it is on every surface that is not the wizard. */
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
  /**
   * ⚠️ THE RUN'S PRIMARY ACTION, PINNED TO THE BOTTOM EDGE (2026-08-31, from
   * the owner's „Mobile" canvas → frame 2 „მოთხოვნა", which is this wizard
   * drawn at 390×844: a bar across the foot of the phone with a top hairline,
   * a white ground and one full-width control in it).
   *
   * WHY A BAR AND NOT A BUTTON UNDER THE QUESTION. A wizard step is short —
   * that is the whole design — so its one control lands somewhere in the
   * middle of the viewport, and „where do I go next" is answered by a button
   * that is nowhere the eye rests. Pinned to the edge it is in the same place
   * on every screen of the run, which is the only property that makes a
   * multi-step form feel bounded. It is also the half of the fix the
   * `pb-28 sm:pb-32` on <main> below could never be: padding moves content,
   * and the complaint was never that the button was covered — it was that it
   * had to be found.
   *
   * ⚠️ IT IS A SLOT, NOT A BUTTON. The shell does not know what the step's
   * action is called, whether it is disabled, or whether there are two of them
   * (the photo step carries a skip beside its continue) — the caller passes
   * the node and keeps every behaviour it already had. Nothing here changes
   * what a tap does.
   *
   * Omitted by the pages that are not a wizard, exactly like `stage`.
   *
   * ⚠️ NOBODY PASSES IT YET, AND THAT IS A HALF-DONE PORT, NOT A DARK FEATURE.
   * The wizard's primary action still renders in flow at the foot of the
   * question (RequestWizard, the `mt-6 flex items-center justify-between` row
   * near the end) — the bar goes live the moment that <Btn> is handed to this
   * prop instead, `className="w-full"` so it fills the bar as the canvas draws
   * it. The step's own controls are unchanged either way; only where they are
   * drawn moves. Wire it or delete this — a slot with no caller is a control
   * that lies.
   */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const showBar = typeof progress === 'number'
  const pct = showBar ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : 0

  return (
    // `min-h-dvh` and not `min-h-screen`: on a phone the URL bar eats 100vh and
    // the last field of a form ends up under it, which is the one place this
    // costs somebody a submission.
    <div className="min-h-dvh bg-ink-50 flex flex-col">
      {/* ⚠️ THE SITE HEADER IS ON THE INTAKE NOW (2026-09-02), AND THIS FILE
          USED TO OPEN BY FORBIDDING IT — „THIS IS NOT A PAGE OF THE SITE, and
          it must not read as one. No site header."

          Owner, three times, on this screen: „ჰედერი საერთოდ არ გაქვს, არც
          ფუტერი, არც უკან დაბრუნება" … „აქ ჰედერი არაა, იკარგება" … „რატომ
          იკარგავ მოთხოვნის გაგზავნისას, თითქოს ცალკე ფორმის შესავსები ველია".

          The old rule is the funnel argument and it is not silly — Airbnb's
          listing flow and Typeform strip the nav for a reason, because a nav
          bar on a form is twelve ways to leave it. But Airtasker, which is the
          closest thing to this product, keeps its FULL nav through the whole
          create-listing flow; and the version here had no exit of any kind, not
          even Airbnb's „Save and exit" — one 73×28 logo. „ცალკე ფორმის
          შესავსები ველი" is exactly what that reads as: a form somebody sent
          you, not a page of a site you are on.

          ⚠️ `PublicTopBar`, NOT `PublicHeader`. The latter is an async server
          component that reads the session; RequestWizard is `'use client'` and
          this shell is in its bundle, so the server one cannot be imported
          here. The bar's own header documents this exact fallback — „client-only
          pages render <PublicTopBar/> directly and fall back to the deduped
          client probe" — which is what the home page does.

          `activeHref` marks „მოთხოვნის გაგზავნა" as the current page rather
          than offering it as somewhere to go, so the bar cannot advertise the
          screen you are standing on. */}
      <PublicTopBar activeHref={REQUEST_ROUTE} />
      {/* ⚠️ CREAM GROUND, GLASS HEADER (2026-08-31, from the owner's design
          canvas → Request + Offers). It was `bg-ink-50/40` under a solid white
          header — a 40% tint of a colour that WAS white, i.e. a white page with
          a white bar on it. With the ground at #FBF9F5 the two are different
          materials again: the questions sit on paper and the chrome floats. */}
      {/* ⚠️ ONE BOTTOM EDGE, AND NOW IT IS ALWAYS THE BORDER (2026-08-31,
          settled 2026-09-03). The header once wore `border-b border-ink-100`
          AND drew a progress bar directly under it, so on the cream ground the
          two stacked into a faint grey hairline with a thick dark-green stub
          beneath it — measured live on /request, it read as a stray underline
          that stopped at 20% of the width rather than as a bar filling. The
          fix then was „the bar IS the edge whenever there is one", which meant
          the border was conditional. There is no bar any more, so the
          condition had exactly one branch left and the border is plain. */}
      <header className="sticky top-0 z-chrome bg-ink-50/90 backdrop-blur-md">
        {/* ⚠️ `narrow`, MATCHING THE WIZARD'S OWN COLUMN (2026-08-18).
            RequestWizard centres its questions in a 560px column inside this
            820px shell — so the logo, the stage row, the „n/7" counter and the
            footer were all left-aligned 98px to the LEFT of the question they
            belong to. Measured at 1440: the stage row began at x=340 and the
            question at x=440. It reads as a broken layout on the first screen
            anybody sees, and it is one token, not four. */}
        <Container size="narrow" className="h-16 flex items-center justify-between gap-4">
          {/* ⚠️ THE LINK IS 40px TALL, THE MARK IS 28 (2026-09-02). The anchor
              wrapped the image and nothing else, so the only way back to the
              site from the intake was a 73×28 target — under the 40px floor,
              and the smallest control on the screen. `-ml-1 px-1` keeps the
              mark optically flush with the container edge while the box that
              receives the tap is bigger than the thing you can see. */}
          {/* ⚠️ THE LOGO LEFT THIS ROW WITH THE SITE BAR'S ARRIVAL (2026-09-02).
              `PublicTopBar` above carries the mark, and two logos 64px apart is
              the „one thing drawn twice" this whole run has been about. The
              spacer keeps the counter on the right where it has always been. */}
          {/* ── THE STAGES, ON ONE LINE (2026-09-03) ────────────────────────
              ⚠️ THEY HAD A BLOCK OF THEIR OWN AND TWO BARS. Measured on the
              live funnel: this header was 126px — a 64px row, a 58px segmented
              rail under it, and a 4px percentage bar under that — and the
              question itself did not start until y=307 on an 832px viewport.
              37% of the screen was spent before the reader saw what was being
              asked.

              ⚠️ AND THE TWO BARS ANSWERED ONE QUESTION TWICE, differently. The
              three segments sat in a 512px column; the thin bar ran 581px edge
              to edge; one was `brand-200`, the other `brand-600`. „Where am I"
              and „how much is left" are the same question to the person asking
              it, and every reference product answers it once — Airtasker and
              Bark with a counter, and nothing else.

              ⚠️ A THIRD DEFECT WENT WITH THEM, and it is the one the owner
              could see: the segments were not on one line. Measured 132 · 132 ·
              136. A DONE stage was a <button> (46px tall) and the live one a
              <span> (39px), and the <ol> centred them — so the current stage's
              bar sat 4px low, on every screen of the funnel. Two elements that
              must align cannot be two different tags under `items-center`.

              What is kept is the thing the owner asked for on 2026-09-01
              („მანდ გადასვლა-გადმოსვლებიც უნდა ჰქონდეს კომფორტისთვის"): a
              finished stage is still a way back. It is a text button now, and
              the 40px floor is carried by `py-3 -my-3` rather than by a box
              that has to be drawn — the line box is 17px, so it takes 12px a
              side to clear 40, and `py-2` measured 33 live. The negative
              margin hands the row back its original height, so the hit area
              grows and the layout does not.

              Saved: 62px on every screen of the run. */}
          {stage && stages.length > 0 ? (
            /* ⚠️ STILL A nav > ol > li, WHICH IS THE BREADCRUMB PATTERN AND
               NOT DECORATION. The rail it replaces argued its own `<ol>` on
               the grounds that three stages ARE an ordered list and the order
               is the information — that did not stop being true when the bars
               went. `<nav>` around it is what the pattern adds: this row is
               now the only way back through the run, so it is navigation and
               a screen reader should be able to reach it as such. */
            <nav aria-label="ეტაპები" className="min-w-0">
              <ol className="flex items-center gap-1.5 text-meta">
              {stages.map((st, i) => {
                const at = stages.findIndex(x => x.id === stage)
                const done = i < at
                const live = i === at
                const name = (
                  <>
                    {st.label}
                    {live && <span className="sr-only"> — მიმდინარე</span>}
                  </>
                )
                return (
                  <li key={st.id} className="flex items-center gap-1.5 min-w-0">
                    {i > 0 && <span aria-hidden className="text-ink-300">·</span>}
                    {done && onStage ? (
                      /* ⚠️ THE CHECK IS THE ONLY THING THAT CELEBRATES, AND IT
                         FIRES TWICE PER RUN (2026-09-04). The bar below is
                         flat now; the acknowledgement a step change needed had
                         been answered with ornament on the bar, which is the
                         wrong place — a percentage moving 20% is not an event.
                         FINISHING A STAGE is, and there are three stages, so
                         this happens twice in a five-screen run rather than
                         five times. Rare enough to read as a moment.
                         No key is needed for the entrance: a stage going
                         live → done swaps a <span> for this <button>, so React
                         mounts a fresh node and `scale-in` plays exactly once,
                         at exactly the right time. */
                      <button
                        type="button"
                        onClick={() => onStage(st.id)}
                        className="flex items-center gap-1 truncate py-3 -my-3 font-display font-semibold text-ink-500 underline decoration-ink-200 underline-offset-4 transition-colors duration-fast hover:text-ink-900 hover:decoration-ink-400"
                      >
                        <Icon.check aria-hidden className="w-3 h-3 shrink-0 text-brand-600 motion-safe:animate-scale-in" />
                        <span className="truncate">{name}</span>
                        <span className="sr-only"> — დაბრუნება</span>
                      </button>
                    ) : (
                      /* ⚠️ THE LIVE STAGE IS BRAND, NOT INK (2026-09-03). The
                         fill on the edge below is `brand-600` and it stops
                         under the stage you are in; colouring the name to
                         match is what makes those two marks read as ONE
                         indicator rather than as a bar and, separately, some
                         bold text. It is also the only colour on the row, so
                         „where am I" is answered before anything is read.
                         `key={st.id}` on the live one so React remounts it
                         when the stage changes and the entrance replays — the
                         stage row is otherwise the one part of the screen that
                         does not move between steps, and a step change that
                         nothing acknowledges is what „არაფრის მომცემია" was
                         about. `fade-in` is the existing token; the keyframe
                         library is closed (lib/design/README §4) and did not
                         need opening for this. */
                      <span
                        key={live ? `live-${st.id}` : st.id}
                        className={`truncate font-display transition-colors duration-mid ${live ? 'font-bold text-brand-700 motion-safe:animate-fade-in' : 'font-semibold text-ink-400'}`}
                      >
                        {name}
                      </span>
                    )}
                  </li>
                )
              })}
              </ol>
            </nav>
          ) : (
            <span aria-hidden />
          )}

          {/* `text-micro` is the numeric-counter tier the canon reserves for
              exactly this, and `tabular-nums` so the digits do not shift the
              line as the number grows. */}
          {step && (
            <span className="shrink-0 text-micro font-bold tabular-nums text-ink-500">
              {step.index} / {step.total}
            </span>
          )}
        </Container>

        {/* ⚠️ THE SEGMENTED RAIL STOOD HERE AND IT WENT ON 2026-09-03. Three
            filled bars with a label under each, plus the percentage bar below
            — 62px of chrome answering the question the counter beside the
            stage names already answers. The stages did not stop being shown;
            they moved UP, onto the header's own row, which was carrying a
            spacer and a counter and nothing else. The header's full reasoning
            is on that row. */}

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

        {/* ── THE EDGE IS THE BAR ──────────────────────────────────────────
            ⚠️ THE BAR CAME BACK THE SAME DAY IT WENT (2026-09-03). Removing the
            segmented rail was right — two controls, 126px, one question — but
            removing the percentage bar WITH it left a header on which nothing
            ever moved. Owner: „სადა ანიმაცია, რაღაცა რომ შევსებულია… ძალიან
            სადა, არაფრის მომცემია." A form that never shows itself advancing
            is a form you cannot tell you are winning.

            ⚠️ IT COSTS 2px, NOT 62, BECAUSE IT IS THE BORDER. The header needs
            a bottom edge either way — it was `border-b border-ink-100`, a 1px
            hairline — so the track simply IS that edge, at 2px, and the fill
            runs over it. That is also the 2026-08-31 rule („the BAR is the
            edge whenever there is one") finally holding with no exception:
            there is no second hairline to stack with, because the border is
            gone from the header's own class list.

            `duration-slow` and not `mid`: this is the one element on the
            screen the eye follows to a destination, and 360ms is the length at
            which it reads as travel rather than a jump. `rounded-r-pill` gives
            the fill a leading edge, so what you see is a thing arriving rather
            than a rectangle resizing.

            `motion-safe:` on the transition, and the width is still correct
            without it — a reduced-motion reader gets the same bar, placed
            rather than animated. */}
        {/* ── THE EDGE IS THE BAR ──────────────────────────────────────────
            ⚠️ FLAT, AND THAT IS THE THIRD ANSWER TO THIS (2026-09-04). The
            first was two controls in 126px; the second was one 2px line, which
            the owner read as „ძალიან სადა, არაფრის მომცემია"; the third was a
            gradient with a light sweeping over it and a glowing bead riding
            the head, which the owner read as „არაპროფესიონალური, საიტს არ
            უხდება". They were right, and the reasons are worth keeping so this
            does not get re-invented:

            · THE BEAD WAS THE ONLY LIGHT SOURCE ON THE SITE. Six rungs on the
              shadow ladder and every one of them casts DOWNWARD — a card
              lifting off paper. A radial glow had nothing to belong to.
            · THE SWEEP SAID THE WRONG WORD. A light travelling over a bar is
              the universal „loading, wait". Nothing is loading; the bar
              reports POSITION. The animation contradicted the meaning.
            · IT PULLED THE EYE INTO THE CHROME. This whole run has been about
              getting a reader past ~310px of furniture to the question. Moving
              light in the part you are trying to make people ignore is a
              regression against the goal that started the work.
            · THE GRADIENT WAS INVISIBLE ANYWAY. Three stops across 4px of
              height and, on the early screens, ~150px of width.

            So: `brand-600`, flat, 2px, and the transition is the whole of the
            motion. `duration-slow` because this is the one element the eye
            follows to a destination and 360ms reads as travel rather than a
            jump. What acknowledges a step now is the QUESTION arriving
            (RequestWizard animates it) and, twice per run, a stage completing
            — see the check on the row above. Rare enough to be an event. */}
        <div
          role={showBar ? 'progressbar' : undefined}
          aria-valuemin={showBar ? 0 : undefined}
          aria-valuemax={showBar ? 100 : undefined}
          aria-valuenow={showBar ? pct : undefined}
          aria-label={showBar ? 'შევსების პროგრესი' : undefined}
          className={showBar ? 'h-0.5 bg-ink-100' : 'h-px bg-ink-100'}
        >
          {showBar && (
            <div
              className="h-full rounded-r-pill bg-brand-600 motion-safe:transition-[width] motion-safe:duration-slow motion-safe:ease-out-quart"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </header>

      {/* The extra bottom padding is for the cookie consent banner: wizard
          steps are SHORT, so their bottom controls land exactly where the
          fixed banner floats on a first visit, and a button under an overlay
          is a button that does not work. Long pages absorb this by scrolling;
          a short step needs the room reserved. */}
      <main className="flex-1 py-8 sm:py-12 pb-28 sm:pb-32">
        <Container size={body}>{children}</Container>
      </main>

      {/* One line, and it is the only thing on the page that is not the task.
          It exists because a form asking for a phone number owes the reader a
          sentence about what happens to it. */}
      {/* ⚠️ THE SITE FOOTER IS BACK UNDER THE INTAKE (2026-09-02). Owner: „როცა
          მოთხოვნის ველზე ხარ, ჰედერი საერთოდ არ გაქვს, არც ფუტერი, არც უკან
          დაბრუნება."

          They were right about all three. `AppShell` suppresses BottomNav,
          BackToTop and HelpWidget for every path `isRequestPath` matches, and
          this page renders no `PublicHeader` and no `Footer` of its own — so
          the intake had exactly ONE route back to the site: a 73×28 logo. A
          person who opened /request from a category page and then wanted to
          look at the catalogue first had nowhere to go, and a person who got
          stuck had no help bubble either, on the one screen where being stuck
          costs a request.

          ⚠️ THE FOCUSED HEADER STAYS, and that is not the half being argued
          with. Stripping the nav from a funnel is what Airbnb's listing flow
          and Typeform do, and the reason is real — a nav bar on a form is
          twelve ways to leave it. What those flows ALSO have, and this one did
          not, is a visible way out: Airbnb keeps „Save and exit" in the bar.
          The footer is that way out here, and it costs the funnel nothing
          because it is below the fold of every step.

          It goes UNDER the wizard's own privacy line rather than replacing it:
          that sentence is about this screen („ნომერს არავის ვაძლევთ"), the
          footer is about the site. */}
      <footer className="py-5">
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
          {/* ⚠️ THE PRIVACY LINE IS GONE (2026-09-04). Owner, pointing at the
              contact screen's version of it: „აი ასე ჩაშლილად არ დაწერო
              არსად, წაშალე საერთოდ ეს ზედმეტი ინფო."

              It read „ნომერს არავის ვაძლევთ — მიმოწერა პლატფორმაზეა", and it
              was the THIRD wording of the same promise: first „only the expert
              you choose will see it" (true until 2026-08-21), then „only we
              use it", then this. Each rewrite followed the code moving under
              it, and the code moved again — a client who presses „დარეკვა" on
              an offer now opens the provider's number and the platform charges
              them for it (app/api/requests/[ref]/call), and the request SMS
              carries the client's own number to reach them.
              A sentence that has needed rewriting three times in three weeks
              is not a promise, it is a moving target. It went rather than
              becoming a fourth version. */}
        </Container>
      </footer>

      <Footer />

      {/* ── The action bar ───────────────────────────────────────────────────
          LAST IN THE COLUMN, AFTER THE FOOTER LINE, and that ordering is the
          decision. The privacy sentence is context and scrolls away with the
          questions it is about; the way forward is chrome and does not. Put the
          bar above the footer instead and the one thing that never moves has a
          paragraph appearing underneath it at the end of every scroll.

          `sticky`, not `fixed`: it belongs to this column, so it inherits the
          page's width and gutter instead of restating them, and it lands in
          flow at the foot of a short screen rather than floating over its own
          blank space.

          ⚠️ `z-chrome` IS ENOUGH HERE ONLY BECAUSE THE WIZARD ALREADY LIFTS THE
          COOKIE BANNER. The banner is `z-consent` (50) — ten above this — and
          on a phone it is a full-width strip on the same edge. RequestWizard
          sets `body[data-mobile-cta="lift"]`, which globals.css answers by
          moving the banner 132px clear; without that this bar would need
          `z-overlay`, and would then be painting over the banner's own buttons.
          The lift is the correct half of that pair: both controls stay visible
          AND tappable. If a future caller passes `action` from a route that
          does not set the attribute, it needs to.

          The safe-area inset is the same expression CookieConsent uses — on an
          iPhone the home indicator sits in the last ~34px and a button that
          ends there is a button the thumb argues with. */}
      {action && (
        <div
          className="sticky bottom-0 z-chrome border-t border-ink-100 bg-white pt-3.5
                     pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
        >
          <Container size="narrow">{action}</Container>
        </div>
      )}
    </div>
  )
}
