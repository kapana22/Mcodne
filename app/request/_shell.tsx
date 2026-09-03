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
import { STAGES, type StageId } from './_model'
import { REQUEST_ROUTE } from '@/lib/requests'
import { Footer } from '@/components/Footer'
import { PublicTopBar } from '@/components/PublicTopBar'

export function RequestShell({
  body = 'narrow',
  privacyLine = true,
  progress,
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
  privacyLine?: boolean
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
   * Omitted by the pages that are not a wizard, exactly like `progress` and
   * `stage`; the bar is then absent rather than drawn empty.
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
      {/* ⚠️ ONE BOTTOM EDGE, NOT TWO (2026-08-31, second pass). The header wore
          `border-b border-ink-100` AND drew the progress bar directly under it,
          so on the cream ground the two stacked into a faint grey hairline with
          a thick dark-green stub beneath it — measured live on /request, it read
          as a stray underline that stopped at 20% of the width rather than as a
          bar filling. The BAR is the edge whenever there is one; the border
          only stands in on the pages that are not a wizard. */}
      <header className={`sticky top-0 z-chrome bg-ink-50/90 backdrop-blur-md ${showBar ? '' : 'border-b border-ink-100'}`}>
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
          <span aria-hidden />

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
            ⚠️ IT NO LONGER USES <StepIndicator> (2026-08-31). That primitive
            draws numbered dots on a connector line, which is the right shape
            for a run whose steps are named destinations; these three are
            PROPORTIONS of one form, and a bar is what says so. The component is
            untouched and still serves its other call sites. */}
        {/* ⚠️ THE STAGES ARE SEGMENTED BARS NOW (2026-08-31, the canvas's
            shape), NOT a row of numbered dots. One bar per stage, filled for
            the ones behind you, half-tinted for the one you are in, plain for
            what is ahead — with the label under it. It answers „where am I" and
            „how much is left" in one control, which is what the two separate
            controls under this header used to do between them; the 1px
            percentage bar below is now the fine-grained half of the same
            answer and no longer the only one.
            ⚠️ A FINISHED STAGE IS A WAY BACK NOW (2026-09-01, owner: „ზევით
            რომ აქვს პროცესი ღილაკების… მანდ გადასვლა-გადმოსვლებიც უნდა ჰქონდეს
            კომფორტისთვის"). The rule this note used to state — „you cannot jump
            to „კონტაქტი" without answering what comes before it" — is about
            going FORWARD, and it still holds: `live` and `todo` stay plain
            text, exactly as before. Going BACK to something already answered
            was never unsafe; `Transcript` two hundred lines away has offered it
            since the wizard was written (`onEdit` → `setStepId`), so the rail
            was the one place on the screen where a completed answer looked
            unreachable.
            The stage row lands on the FIRST step of that stage, so „რა
            გჭირდება" reopens the question rather than some screen in the middle
            of it. Nothing is discarded on the way — the draft is untouched and
            walking forward again passes the answers already given.
            An `<ol>` because it IS an ordered list of three things and the
            order is the information. */}
        {stage && (
          <Container size="narrow" className="pb-3">
            <ol className="flex items-center gap-3">
              {stages.map((st, i) => {
                const at = stages.findIndex(x => x.id === stage)
                const done = i < at
                const live = i === at
                const bar = (
                  <span
                    aria-hidden
                    className={`block h-1.5 rounded-pill ${done ? 'bg-brand-700' : live ? 'bg-brand-200' : 'bg-ink-100'}`}
                  />
                )
                const label = (
                  <span className={`font-display text-meta font-semibold ${live || done ? 'text-ink-900' : 'text-ink-400'}`}>
                    {st.label}
                    {live && <span className="sr-only"> — მიმდინარე</span>}
                  </span>
                )
                return (
                  <li key={st.id} className="flex flex-1 flex-col">
                    {done && onStage ? (
                      // ⚠️ THE WHOLE COLUMN IS THE TARGET, bar included — a
                      // 12px word is not a tap target, and `py-1` carries the
                      // 1.5px bar and the label to the 40px floor together.
                      <button
                        type="button"
                        onClick={() => onStage(st.id)}
                        className="group flex flex-col gap-2 py-1 text-left transition-opacity duration-fast hover:opacity-70"
                      >
                        {bar}
                        <span className="underline decoration-transparent underline-offset-2 transition-colors duration-fast group-hover:decoration-current">
                          {label}
                        </span>
                        <span className="sr-only"> — დაბრუნება</span>
                      </button>
                    ) : (
                      <span className="flex flex-col gap-2 py-1">{bar}{label}</span>
                    )}
                  </li>
                )
              })}
            </ol>
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
            className="h-1 bg-ink-200"
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
          {/* ⚠️ REWRITTEN 2026-08-21, same day and same reason as the hint in
              _stepContact: „ნომერს მხოლოდ იმას ვაძლევთ, ვისაც შენ აირჩევ" was
              a promise the code stopped keeping when the number stopped being
              handed to anybody at all. One sentence, in both places, saying the
              same true thing. */}
          {privacyLine && (
            <p className="text-meta text-ink-500">
              ნომერს არავის ვაძლევთ — მიმოწერა პლატფორმაზეა.
            </p>
          )}
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
