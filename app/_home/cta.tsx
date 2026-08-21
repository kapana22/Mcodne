'use client'
// Home — the closing band: the invitation to the SUPPLY side.
//
// ⚠️ THE PITCH IS THE SERVICE AND THE PRICE (CLAUDE.md rule 3): „the pitch to a
// provider is CLIENTS FOR THEIR SERVICE, never „share your knowledge". They set
// the price." The heading says exactly that in four words and the paragraph
// says what the client then sees. Nothing here mentions a commission, a
// consultation or a session — the first is in the help centre where somebody
// looks for it, and the second two are not what this band is selling.
//
// ⚠️ THE WORD AND THE ADDRESS COME FROM lib/capabilities, not from here. The
// header, the footer and this band are the site's three supply links and they
// must be the same string pointing at the same door; a hand-typed fourth
// wording is how „გახდი ექსპერტი" survived in one place after being retired in
// the others.
//
// ⚠️ IT IS GATED. An existing provider must never read an invitation to become
// one — <ApplyCtaGate> is the one place that rule is expressed, so a new supply
// surface inherits it instead of re-deriving it.
//
// ⚠️ THE CLOSING ILLUSTRATION BAND LEFT WITH THE REDESIGN (2026-08-21). It was
// a full-bleed drawing under this block, on `bg-ink-75` matched to the art's own
// paper. The design canvas ends the page on this band instead, and the drawing
// it replaces was doing the same job as the six real cards near the top —
// showing what the product is — a screen and a half later. The asset and
// <IllustrationBand> are untouched; nothing on the home page renders it.

import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { Btn } from '@/components/Btn'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { JOIN_DOOR_HREF, JOIN_DOOR_LABEL } from '@/lib/capabilities'

/* The band's own drawing: a profile card, a dashed run, and the „add" node it
   arrives at — the whole act of listing something, in one figure. Every stop is
   a palette value (brand-600/500/300/100, ink-50/75/100/200), so it carries no
   hue the rest of the page does not already have. Inline rather than a file: it
   is ~1 KB of geometry, it must recolour with the palette, and a request for it
   would land after the band it belongs to. */
const SupplyMark = () => (
  <svg
    width="230"
    height="150"
    viewBox="0 0 230 150"
    fill="none"
    aria-hidden
    className="h-auto w-[200px] shrink-0 lg:w-[230px]"
  >
    <defs>
      <linearGradient id="home-supply-plate" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#F8F6F2" />
      </linearGradient>
    </defs>
    <rect x="12" y="28" width="126" height="94" rx="14" fill="url(#home-supply-plate)" stroke="#DFD8CB" strokeWidth="1.5" />
    <circle cx="44" cy="58" r="15" fill="#D3ECE4" />
    <rect x="68" y="49" width="54" height="6" rx="3" fill="#DFD8CB" />
    <rect x="68" y="62" width="34" height="5" rx="2.5" fill="#EFECE5" />
    <rect x="26" y="88" width="52" height="18" rx="9" fill="#26806E" />
    <rect x="86" y="90" width="40" height="14" rx="7" fill="#EFECE5" />
    <path d="M152 75h40" stroke="#7FC7B4" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 7" />
    <circle cx="204" cy="75" r="19" fill="#2F9C86" />
    <path d="M196 75h16M204 67v16" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

export const ClosingBand = () => (
  <ApplyCtaGate>
    <section className="bg-white">
      <Container className="py-12 sm:py-14">
        <Reveal className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:gap-10 lg:gap-14">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-h2 font-bold tracking-[-0.022em] text-ink-900 sm:text-h1">
              <SiteText k="home.supply.title" />
            </h2>
            <p className="mt-3 max-w-[430px] text-body leading-[1.6] text-ink-500 text-pretty">
              <SiteText k="home.supply.body" />
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {/* Same treatment as the hero's search button — see there: `hero`
                  is the canvas's `.cta` (rests on the glow, deepens it), and the
                  1px lift is the other half of that rule. The two filled
                  actions on this page must not read as two different controls. */}
              <Btn
                href={JOIN_DOOR_HREF}
                size="md"
                variant="hero"
                className="motion-safe:hover:-translate-y-px"
              >
                {JOIN_DOOR_LABEL}
              </Btn>
              {/* How long it takes, beside the button that starts it — the one
                  fact that answers „not now" before it is thought. */}
              <span className="text-body text-ink-500"><SiteText k="home.supply.note" /></span>
            </div>
          </div>
          {/* Hidden below sm: at 390px the drawing would take a third of the
              screen to repeat what the sentence beside it already says. */}
          <div className="hidden shrink-0 sm:block">
            <SupplyMark />
          </div>
        </Reveal>
      </Container>
    </section>
  </ApplyCtaGate>
)
