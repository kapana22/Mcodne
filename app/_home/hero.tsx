'use client'
// Home — the hero: where we work, the one sentence, and ONE field.
//
// ⚠️ REBUILT 2026-08-21 FROM THE DESIGN CANVAS („მცოდნე — მთავარი გვერდი").
// What it replaces was a two-door hero with a rotating expert preview card, a
// live avatar stack and three counted stats — 466 lines whose job was to prove
// the marketplace was real before the visitor had asked it anything. The canvas
// answers the same doubt with the six real cards directly underneath, and gives
// this band the single thing a marketplace hero is for: a way in.
//
// ⚠️ THE FIELD IS BACK, AND IT IS A REVERSAL. Stage 9 (2026-08-19) removed the
// hero search deliberately („No search field"), because at the time the only
// thing under it was a browse list a visitor could not usefully query. It
// returns because the catalogue now merges both halves and answers `?q=` across
// them, and because the chip rail underneath TEACHES the field what to expect —
// eight real topics, so nobody is left guessing what this box wants. A search
// box with worked examples beside it is not the same control as a bare one.
//
// ⚠️ ONE ENTRANCE. The rule stage 9 wrote („იყოს ამ ეტაპზე ექსპერტები მხოლოდ")
// is untouched: submitting lands on /experts, and so does every chip. The
// intake keeps its door in the header, where an action belongs.
//
// ⚠️ THE LIGHTS ARE 13–15% STOPS, NOT A WASH. `.glow-brand` / `.glow-brand-soft`
// with `.aurora-a` / `.aurora-b` drift — the palette canon forbids a decorative
// saturated fill competing with content, and this is not one: it is light you
// register as depth, never as colour. `.grain` at 3.5% is what stops a large
// pale area reading as flat paper.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SiteText, useSiteText } from '@/components/SiteTextProvider'
import { Container } from '@/components/Container'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { CITIES } from '@/lib/requestTopics'
import { ServiceRail } from './rail'

/**
 * THE TWO LIGHTS' OWN GRADIENTS — hero-only, and not `.glow-brand`.
 *
 * ⚠️ WHY NOT THE SHARED TOKEN. `.glow-brand` peaks at 0.13 alpha and
 * `.glow-brand-soft` at 0.15, with a LINEAR `closest-side` falloff. Measured
 * A/B in Chrome at 1440: re-centring those two over the band moved the mean
 * pixel by 5.4 and the peak by 21 — i.e. the owner looked at the result and
 * correctly said the background was unchanged („ფონი იგივეა"). 0.13 stretched
 * across an 890px circle on a near-white ground is not a light, it is a rumour
 * of one. The token stays exactly as it is: app/NotFoundClient and app/error
 * use it behind a short message, where that weight is right.
 *
 * ⚠️ WHAT CHANGED IS THE CURVE, NOT JUST THE NUMBER. Three explicit stops give
 * a DENSE core that still reaches zero well inside the rim, so the band gets a
 * light with a middle instead of a uniform tint. Same two palette hues —
 * brand-500 (47,156,134) and brand-300 (127,199,180) — so no new colour enters
 * the page; only its concentration changed.
 */
const LIGHT_A =
  'radial-gradient(circle at center,' +
  ' rgba(47,156,134,0.30) 0%,' +
  ' rgba(47,156,134,0.13) 42%,' +
  ' rgba(47,156,134,0) 72%)'
const LIGHT_B =
  'radial-gradient(circle at center,' +
  ' rgba(127,199,180,0.32) 0%,' +
  ' rgba(127,199,180,0.14) 44%,' +
  ' rgba(127,199,180,0) 74%)'

/** Where we actually work, read off the taxonomy rather than typed here — the
 *  day a second city opens, the badge says so without an edit. */
const WHERE = CITIES.map(c => c.label).join(' · ')

export const HomeHero = () => {
  const router = useRouter()
  const [q, setQ] = useState('')
  const placeholder = useSiteText('home.hero.searchPlaceholder')

  // An empty field is not an error — it is „just show me everybody", which is
  // exactly what /experts unfiltered is. Never block the one entrance on a
  // validation message.
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    router.push(term ? `/experts?q=${encodeURIComponent(term)}` : '/experts')
  }

  return (
    <section className="relative overflow-hidden border-b border-ink-100 bg-gradient-to-b from-ink-75/60 to-ink-75 grain">
      {/* THE TWO LIGHTS. `overflow-hidden` on the section clips them, so they can
          drift past the edge without ever growing the page's scroll width.

          ⚠️ EACH LIGHT IS TWO ELEMENTS, AND BOTH ARE LOAD-BEARING.
          · the OUTER div carries the static centring translate;
          · the INNER span carries the drift animation.
          They cannot be one element: `.aurora-a` animates `transform`, which
          overwrites a `-translate-x-1/2` utility outright — the light would
          jump half its own width the moment the animation's first frame lands.

          ⚠️ POSITIONED BY THEIR CENTRES, WHICH IS THE FIX (2026-08-21). They
          used to be placed by EDGE (`-left-[18%]`, `-right-[14%]`), and measured
          in Chrome at 1440 that put the two cores at 6% and 91% of the width —
          outside the column the copy actually occupies. A radial-gradient peaks
          at 0.13–0.15 alpha in the middle and reaches ZERO at the rim, so all
          the band ever showed was two faded tails: the owner's „სიცოცხლე აკლია
          ბექრაუნდზე". The canvas puts the cores at 22% / 81% of the width and
          just under the top edge, with radii ~31% / ~27% of it — those are the
          numbers below, and they are why the light now reads as light. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[22%] top-[100px] -translate-x-1/2 -translate-y-1/2">
          <span
            style={{ backgroundImage: LIGHT_A }}
            className="aurora-a block h-[560px] w-[560px] rounded-full sm:h-[760px] sm:w-[760px] lg:h-[880px] lg:w-[880px]"
          />
        </div>
        <div className="absolute left-[81%] top-[40px] -translate-x-1/2 -translate-y-1/2">
          <span
            style={{ backgroundImage: LIGHT_B }}
            className="aurora-b block h-[500px] w-[500px] rounded-full sm:h-[680px] sm:w-[680px] lg:h-[780px] lg:w-[780px]"
          />
        </div>
      </div>

      {/* ⚠️ THE ENTRANCE IS A CASCADE, NOT FOUR HAND-TIMED ANIMATIONS.
          `.stagger` pins every DIRECT child to `riseIn` and steps the delay by
          40ms (globals.css) — badge → h1 → sub → field — which is the canvas's
          e1/e2/e3/e4 expressed in the site's own scale instead of four new
          off-scale durations.

          ⚠️ IT IS `stagger`, NOT `motion-safe:stagger`, AND THE PREFIX IS THE
          BUG. `.stagger` is a hand-written rule in globals.css, not a Tailwind
          utility, so Tailwind cannot build a variant of it: `motion-safe:stagger`
          compiles to nothing and leaves the element wearing a literal class name
          that no selector matches. Measured in Chrome 2026-08-21 —
          `animationName` came back `none` on all four children. The rule already
          lives INSIDE the `prefers-reduced-motion: no-preference` block, so the
          contract (CLAUDE.md §3, 🔒) is kept by the stylesheet rather than by
          the call site. ⚠️ Nine other call sites across /work, /me and
          /me/favorites still write the prefixed form and are silently dead;
          they are not this page's to change.

          ⚠️ EVERY CHILD OF THIS <Container> ANIMATES. Add a fifth and it joins
          the cascade at 160ms; add a wrapper div and the cascade collapses to
          one step, because the selector is `>`. */}
      <Container className="stagger relative z-10 pt-12 text-center sm:pt-14 lg:pt-16">
        {/* WHERE, first and small. A marketplace that serves one city has to say
            so before it takes anybody's search — the alternative is a visitor in
            Batumi reading the whole page and finding out at the results. */}
        <p className="inline-flex h-8 items-center gap-2 rounded-pill border border-ink-200 bg-white/80 px-3.5 text-meta text-ink-500 backdrop-blur-sm">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-brand-500 ring-4 ring-brand-500/20"
          />
          {WHERE}
        </p>

        {/* The line break is the design's, not the copy's: both halves stay
            separately editable (they always have been), and the <br> is what
            keeps „იპოვე ექსპერტი," on its own line at every width the balance
            algorithm would otherwise break differently. */}
        <h1 className="mt-4 font-display text-h1 font-bold leading-[1.02] tracking-[-0.035em] text-ink-900 text-balance sm:mt-5 sm:text-display-lg lg:text-display-xl">
          <SiteText k="home.hero.line1" />
          <br />
          <SiteText k="home.hero.line2" />
        </h1>

        <p className="mx-auto mt-4 max-w-[460px] text-body-lg leading-[1.6] text-ink-500 text-pretty sm:mt-5">
          <SiteText k="home.hero.subtitle" /> <SiteText k="home.hero.subtitleEmphasis" />
        </p>

        {/* THE ONE FIELD. `role="search"` + a real label, because a placeholder
            is not a label: it disappears the moment somebody types, and a
            screen reader that announces „edit text, blank" is describing a
            control nobody can use. */}
        <form
          role="search"
          onSubmit={submit}
          // h-14 is the FIELD SHELL, not a control tier — the tappable things
          // inside it are the input and a canon h-11 <Btn>. The focus ring
          // lives here too (`focus-within`), because the glow belongs to the
          // whole field rather than to the bare <input> sitting inside it.
          className="mx-auto mt-7 flex h-14 max-w-[552px] items-center gap-2.5 rounded-field border border-ink-200 bg-white/95 pl-4 pr-1.5 shadow-pop backdrop-blur-sm
                     transition-[border-color,box-shadow] duration-mid ease-out-quart
                     focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-500/10
                     sm:pl-5 sm:pr-[7px]"
        >
          <label htmlFor="home-search" className="sr-only">
            <SiteText k="home.hero.searchLabel" />
          </label>
          <Icon.search aria-hidden className="h-[18px] w-[18px] shrink-0 text-ink-400" />
          <input
            id="home-search"
            name="q"
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            // `text-start` is load-bearing: the hero is centred, and an input
            // inherits `text-align` from it — the caret would sit in the middle
            // of an empty box.
            // ⚠️ `focus:!shadow-none` — AND THE `!` IS LOAD-BEARING. globals.css
            // draws a 4px brand glow on every focused text input, which is right
            // for a bordered field standing on its own and wrong here: measured
            // in Chrome at 1440 it painted a SECOND rounded rectangle inside the
            // shell that already owns the focus state (the shell's
            // `focus-within:ring`). Plain `focus:shadow-none` loses — the global
            // selector is `input[type="search"]:focus` (0-2-1) against a utility
            // class at 0-2-0, so specificity, not order, decides it.
            className="min-w-0 flex-1 bg-transparent text-start text-body-lg text-ink-900 outline-none placeholder:text-ink-400 focus:!shadow-none
                       [&::-webkit-search-cancel-button]:appearance-none"
          />
          {/* `variant="hero"` is the canvas's `.cta`: it rests on the brand glow
              and deepens it on hover, where `primary` rests flat. The lift is
              the other half — BASE already transitions `transform`, so this is
              one utility rather than a new animation. */}
          <Btn
            type="submit"
            size="md"
            variant="hero"
            className="shrink-0 whitespace-nowrap motion-safe:hover:-translate-y-px"
          >
            <SiteText k="home.hero.searchCta" />
          </Btn>
        </form>
      </Container>

      {/* The periphery — eight real topics, drifting. See ./rail.
          It sits OUTSIDE the container (it is full-bleed), so it cannot be a
          stagger child — the 160ms is the fifth step of the cascade above,
          written out rather than inherited. Same keyframe, same curve. */}
      <div className="motion-safe:animate-rise-in motion-safe:[animation-delay:160ms]">
        <ServiceRail />
      </div>
    </section>
  )
}
