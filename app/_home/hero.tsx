'use client'
// Home — the hero: one green band, one sentence, and the field that starts a
// request.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
// რედიზაინი" → Home). What it replaces was a pale, full-bleed band with a
// single search box that submitted to /experts — a hero whose one action was
// „browse". The canvas inverts the page: the loudest thing on it is now
// „დაწერე, რა გჭირდება" and the catalogue is the SECOND door, further down
// („ან პირდაპირ აირჩიე"). That is the commerce model the product actually runs
// on (CLAUDE.md: „a client describes what they need, providers write offers"),
// stated by the page for the first time.
//
// ⚠️ IT IS A CARD, NOT A BAND, and that is what the cream ground bought. The
// old hero had to be pale because it ran edge to edge and the page under it was
// white; a 36px rounded card floating on warm paper can be as dark as it likes.
// Everything else in the canvas follows from the same move.
//
// ⚠️ THE GRADIENT STARTS AT brand-600, NOT brand-500 — the one place this file
// departs from the canvas by a measurable amount. The canvas's first stop is
// #2F9C86 and white text on it measures 3.38:1, under AA; `tests/designTokens`
// computes exactly that and CLAUDE.md's rule 2 („a filled brand surface is
// brand-600, never brand-500") is one of the six that protect a person rather
// than a preference. #26806E is 4.78:1 and, at 8% of the way across a radial
// that reaches brand-900, is not a visible difference — it is the same picture,
// legible.
//
// ⚠️ THE BADGE AND THE SUB-LINE ARE GONE (2026-08-31, the owner: „ესეც
// წაშალე", twice). The badge was a measured one — `app/page.tsx` counted both
// numbers against the real tables and drew the sentence only when both were
// non-zero, because 🔒 rule 6 („never invent a number") forbids the canvas's
// placeholder „214 · 96". It printed 8 and 1. Being measured is what made it
// unpublishable: the site's loudest surface opened by reporting how little had
// happened on it. Removing the reader removed the queries too.
//
// What is left in the card is a headline, a field, and the four steps — which
// is the reference the owner sent, and nothing else.
//
// ⚠️ AND THE PILL COLLAPSES TO ONE ROW UNDER `sm` (2026-08-31, the owner's
// „Mobile" canvas → frame 1 „მთავარი", which is this hero drawn at 390×844).
// The desktop pill is three things — field · city · a wide worded button — and
// under `sm` they were simply stacked, so the site's one action was ~186px of
// chrome on the smallest screen it has. The canvas answers with a single field
// and a round 48px dark disc, and the two rows that disappear are handled
// individually below rather than dropped. Everything from `sm` up is byte-for-
// byte the layout that was here.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SiteText, useSiteText } from '@/components/SiteTextProvider'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { FlowSteps } from './how'

/** Where we actually work, read off the taxonomy rather than typed here — the
 *  day a second city opens, the badge says so without an edit. */

/** The canvas's radial, with the first stop lifted to brand-600. See above. */
const HERO_GRADIENT =
  'radial-gradient(120% 140% at 12% 8%, #26806E 0%, #1E6656 42%, #123A31 100%)'

export const HomeHero = ({
  requestHref,
}: {
  /** Where the field submits. `/request` when the subsystem is on (resolved in
   *  app/page.tsx — a client component cannot read the env var), otherwise the
   *  catalogue, so the field is never a door onto a 404. */
  requestHref: string | null
}) => {
  const router = useRouter()
  const [q, setQ] = useState('')
  const placeholder = useSiteText('home.ask.placeholder')
  // The SAME key the wide button prints, read as a string because the phone's
  // button has no room for the words and needs them as its accessible name.
  // One key, two renderings — the copy is the owner's and is not retyped here.
  const cta = useSiteText('home.ask.cta')

  // An empty field is not an error. On the intake it means „I'll describe it on
  // the next screen"; on the catalogue it means „show me everybody". Never
  // block the one entrance on a validation message.
  const go = (term: string) => {
    const t = term.trim()
    const base = requestHref ?? '/experts'
    router.push(t ? `${base}?q=${encodeURIComponent(t)}` : base)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    go(q)
  }

  return (
    /* ⚠️ EVERY SECTION ON THIS PAGE IS A <Container size="wide">, INCLUDING THIS
       ONE. The canvas is drawn at 1440 with a flat 40px gutter and no maximum,
       which is the same picture as a 1280 column at that width and a very
       different one at 2560. One column for the whole page also means the hero
       card's edge and the tiles' edge below it are the same line — they are
       not, the moment two sections resolve their own gutters. */
    <section className="pt-4 sm:pt-6 lg:pt-7">
      <Container size="wide">
      <div
        style={{ backgroundImage: HERO_GRADIENT }}
        className="relative overflow-hidden rounded-band px-6 py-9 text-white sm:px-10 sm:py-11 lg:px-14 lg:py-12"
      >
        {/* ⚠️ THE TWO LIGHTS ARE GONE (2026-08-31). Owner: „წრები მოაშორე
            შიგნით რომ ხატია ჰეროუში." They were the canvas's — a white circle
            top-right and a warm one bottom-right, placed by their centres so
            the card read as lit rather than flat. What the card actually needed
            them for it already has: HERO_GRADIENT is a radial, so the light and
            its falloff are in the background itself, and two hard-edged discs
            on top of it were a second, competing source. `overflow-hidden`
            stays — it is what rounds the corners.

            The warm accent left with them, and that is a simplification rather
            than a loss: #EFD48A was the one hex in this file that belonged to
            neither of the site's two colours (docs/design-system.md), kept only
            because decoration means nothing. Nothing decorative is left to
            justify it. */}
        <div className="relative max-w-[840px]">
          {/* ⚠️ THE BADGE WAS HERE AND THE OWNER DELETED IT (2026-08-31):
              „ამ კვირაში 8 მოთხოვნა · 1 ექსპერტმა უპასუხა — ესეც წაშალე."
              It was measured and it was honest, and that is exactly why it had
              to go: measured against a marketplace this young it prints 8 and
              1, and the first thing the loudest surface on the site said about
              itself was how little had happened on it. Its fallback („თბილისი")
              went with it rather than being left behind alone — the field two
              lines down already carries the city, with a pin beside it.

              The two counts are no longer computed either (app/page.tsx): a
              query whose only reader is deleted is a page paying for an answer
              nobody asks for. */}
          <h1 className="mt-0 font-display text-h1 font-extrabold leading-[1.02] tracking-[-0.03em] text-balance sm:text-display lg:text-display-lg">
            <SiteText k="home.ask.line1" />
            <br />
            <SiteText k="home.ask.line2" />
          </h1>

          {/* ⚠️ THE SUB-LINE WENT TOO, SAME INSTRUCTION („ერთი წინადადება კმარა.
              მოთხოვნა უფასოა და არაფერს გავალდებულებს. — ესეც წაშალე"). The
              headline and the field say it faster, and the four steps under
              them are the answer it was reaching for. `home.ask.sub` is retired
              in lib/siteTextDefs rather than deleted — a row may hold copy
              somebody typed under that key. */}
        </div>

        {/* ── THE FIELD ────────────────────────────────────────────────────
            `role="search"` + a real label, because a placeholder is not a
            label: it disappears the moment somebody types, and a screen reader
            that announces „edit text, blank" is describing a control nobody can
            use.

            ⚠️ IT IS A PILL ON A DARK CARD, so the focus ring cannot be the
            site's usual brand glow — green on green is invisible. The shell
            takes a white ring instead, which is the only high-contrast option
            against the gradient and reads as the same gesture. */}
        <form
          role="search"
          onSubmit={submit}
          /* ⚠️ NO `max-w` — THE FIELD IS AS WIDE AS THE CARD (2026-08-31).
             Owner: „ეს სერჩი ბოლომდე გაშალე კონტეინერზე რაც არის ჩარჩოებში,
             კიდებზე არ მიტანო ბოლომდე." It was capped at 940px inside a card
             whose content box is 1104px at `lg` (Container wide 1280 − 64
             gutter − 2×56 card padding), so the page's one action stopped
             164px short of the frame it sits in and read as unfinished.
             „Not to the edges" is the CARD'S padding doing the work — px-6 /
             sm:px-10 / lg:px-14 — not a width of its own. */
          /* ⚠️ ONE ROW AT EVERY WIDTH SINCE 2026-08-31 — the owner's „Mobile"
             canvas, frame 1 („მთავარი"), which is this same hero drawn at 390.
             Under `sm` the pill was `flex-col`, so it stacked field → city →
             wide button and stood ~186px tall: three rows of chrome on the one
             screen where the whole card, the headline and the four steps that
             explain it have to share 844px. The canvas draws the phone pill as
             ONE row — the field, and a round 48px dark button carrying a
             chevron — and that is the right call, because the two things the
             column bought (a full-width button, a city on its own line) are
             both cheaper elsewhere: the button loses its words, the city loses
             the white ground. See below for each.
             `rounded-[28px]` went with the column. A one-row pill is a pill at
             every width, which is also what the canvas draws (9999px). From
             `sm` up NOTHING here changed: `flex items-center` is what
             `sm:flex-row sm:items-center` already resolved to. */
          className="relative mt-7 flex items-center gap-2 rounded-pill bg-white p-2 shadow-[0_24px_60px_rgba(9,32,27,0.28)]
                     transition-shadow duration-mid ease-out-quart
                     focus-within:ring-4 focus-within:ring-white/40
                     sm:mt-7"
        >
          {/* h-12 on a phone, matching the canvas's 48px field and the 48px
              disc beside it; the desktop's 54 is untouched. */}
          <label htmlFor="home-ask" className="flex h-12 min-w-0 flex-1 items-center gap-3 px-4 sm:h-[54px] sm:flex-[2.2] sm:px-[18px]">
            <span className="sr-only"><SiteText k="home.ask.label" /></span>
            <Icon.search aria-hidden className="h-5 w-5 shrink-0 text-ink-400" />
            <input
              id="home-ask"
              name="q"
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              // ⚠️ `focus:!shadow-none` — AND THE `!` IS LOAD-BEARING.
              // globals.css draws a 4px brand glow on every focused text input,
              // which is right for a bordered field standing on its own and
              // wrong here: the SHELL owns the focus state. Plain
              // `focus:shadow-none` loses — the global selector is
              // `input[type="search"]:focus` (0-2-1) against a utility class at
              // 0-2-0, so specificity, not order, decides it.
              className="min-w-0 flex-1 bg-transparent text-body-lg text-ink-900 outline-none placeholder:text-ink-400 focus:!shadow-none
                         [&::-webkit-search-cancel-button]:appearance-none"
            />
          </label>

          {/* ⚠️ THERE IS NO CITY IN THIS PILL, AND THAT IS THE OWNER'S CALL
              (2026-09-01): „ეს თბილისი საერთოდ წაშალე". What stood here was a
              STATEMENT, never an input — a field you can type into promises the
              answer changes something and with `CITIES` at one entry it cannot.
              The argument for keeping the statement is recorded below where the
              phone's copy used to be; it lost. One field, one button. */}
          {/* ⚠️ THE PHONE'S BUTTON IS A ROUND 48px DISC WITH NO WORDS IN IT
              (2026-08-31, the canvas). „ფასის მოთხოვნა" is eleven characters
              and beside a search field at 390px it cannot share a row — that
              single fact is what stacked the pill. A disc carrying the
              direction of travel fits, and it is the same `type="submit"`
              running the same handler; only its shape changed.

              ⚠️ IT KEEPS THE WORDS AS ITS ACCESSIBLE NAME, from the SAME
              SiteText key the wide button prints. An icon-only control with no
              name announces as „button", and a hero whose one action is
              unnameable to a screen reader has no entrance at all. 48px is
              also over the 40px tap floor with room to spare (CLAUDE.md → 3). */}
          <button
            type="submit"
            aria-label={cta}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-ink-900 text-white
                       transition-[background-color,transform] duration-fast ease-out-quart
                       hover:bg-ink-800 motion-safe:active:scale-[0.97]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800
                       sm:hidden"
          >
            <Icon.chevR aria-hidden className="h-5 w-5" />
          </button>

          {/* The near-black fill: this is the page's loudest action and green is
              already spoken for by the card it sits on. See components/Btn.
              `hidden sm:block` — the disc above is this same button at phone
              width, and two submits drawn at once would be two answers to one
              question. `block` and not `inline-flex`: as a flex item this
              button was ALREADY blockified from its default `inline-block`, and
              a <button> centres its own label vertically only while it is not
              itself a flex container. Same computed display as before, so from
              `sm` up the pixel is unchanged. */}
          <button
            type="submit"
            className="hidden h-[54px] shrink-0 rounded-pill bg-ink-900 px-7 font-display text-body-lg font-bold text-white
                       transition-[background-color,transform] duration-fast ease-out-quart
                       hover:bg-ink-800 motion-safe:active:scale-[0.97]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800
                       sm:block"
          >
            <SiteText k="home.ask.cta" />
          </button>
        </form>

        {/* ⚠️ THE CITY IS GONE FROM THIS PAGE ENTIRELY (2026-09-01), BY THE
            OWNER: „ეს თბილისი საერთოდ წაშალე". Both the pill's statement and
            the phone's line under it were removed in the same edit.

            THE ARGUMENT THAT LOST IS KEPT HERE ON PURPOSE, because it is about
            a person rather than a layout: with nothing naming the one city, a
            reader in Batumi finds out at the RESULTS, after typing out their
            job. If that turns up in feedback, the cheap repair is to name the
            city where a result already is — the results header or the empty
            state — rather than putting a row back above the field, which is
            the thing the owner did not want. `CITIES` still holds the answer
            (lib/requestTopics), so nothing has to be re-derived to do it. */}
        {/* ⚠️ THE „მაგალითად:" CHIPS WERE HERE AND THE OWNER DELETED THEM
            (2026-08-31): „ხელშეკრულება / დეკლარაცია / ლოგო და ბრენდბუქი /
            რემონტის დაგეგმვა ეს წაშალე და ხაზი." They were four
            `SUGGESTED_TOPICS` that filled the field, and they cost the card
            ~60px between the one action and the four steps that explain it —
            on a 1440×800 laptop that was the difference between the card
            ending on screen and being cut. `SUGGESTED_TOPICS` is unchanged and
            still opens the intake's what-step (lib/requestTopics), which is
            where somebody who needs examples now meets them: one screen later,
            after they have already started. */}

        {/* ⚠️ THE FOUR STEPS ARE PART OF THIS CARD (2026-08-31), not a section
            under it. They were a white plate two sections down the page until
            the owner sent one picture of the whole green surface — headline,
            field, then 01 → 02 → 03 → 04. On its own the field asks somebody to
            describe a job to strangers and says nothing about what happens
            next; the answer to that question belongs on the same screen as the
            question, and a chapter break between the two was the seam. */}
        <FlowSteps />
      </div>
      </Container>
    </section>
  )
}
