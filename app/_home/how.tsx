'use client'
// Home — „როგორ მუშაობს": three steps on one rule.
//
// ⚠️ IT IS NO LONGER THE PAGE'S DARK BAND (2026-08-21). It was `bg-ink-900`
// from 2026-07-31, on a good argument: the page was one uninterrupted white
// sheet and needed a chapter break. The design canvas splits the page a
// different way — the hero and this band are the warm ink-75 grounds, the
// roster and the tiles are white — so the alternation is still there and no
// section has to shout to make it. What went with the dark ground: the on-dark
// step illustrations (they were drawn for #0F0E0A and are invisible on paper)
// and the brand-400 eyebrow that only existed to clear contrast on it.
//
// ⚠️ THE STEPS DESCRIBE BROWSING, NOT THE INTAKE, and that is the substantive
// change rather than a restyle. They used to read „აღწერე რა გჭირდება →
// მიიღე შეთავაზებები → აირჩიე და შეთანხმდი", which is the request funnel; the
// page around them now opens with a search field and six priced cards, so the
// steps that follow have to be the ones that reader is actually taking.
// The old keys are RETIRED rather than reused (lib/siteTextDefs): a production
// SiteText row still holds the request wording, and reusing the key would print
// „აღწერე რა გჭირდება" under a heading about choosing from a list.
//
// ⚠️ THE CONNECTOR IS ONE ABSOLUTE RULE BEHIND THREE NUMERALS, and each numeral
// carries a 5px ring in the band's own colour so the line appears to pass
// BEHIND it rather than through it. It is `hidden lg:block`: at one and two
// columns the steps stack, and a horizontal rule across a vertical list points
// at nothing.

import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'

const STEPS = [
  { n: 1, tk: 'home.steps.s1.title', dk: 'home.steps.s1.desc' },
  { n: 2, tk: 'home.steps.s2.title', dk: 'home.steps.s2.desc' },
  { n: 3, tk: 'home.steps.s3.title', dk: 'home.steps.s3.desc' },
]

export const HowItWorks = () => (
  <section id="how" className="scroll-mt-24 border-y border-ink-100 bg-gradient-to-b from-ink-75/60 to-ink-75">
    <Container className="py-11 sm:py-12 lg:py-14">
      <Reveal>
        <h2 className="mb-8 text-center font-display text-h2 font-bold tracking-[-0.022em] text-ink-900 sm:mb-9 sm:text-h1">
          <SiteText k="home.steps.title" />
        </h2>
      </Reveal>

      <div className="relative">
        <span
          aria-hidden
          className="absolute left-[16%] right-[16%] top-4 hidden h-px bg-gradient-to-r from-transparent via-ink-300 to-transparent lg:block"
        />
        <Reveal stagger className="relative grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 lg:gap-8">
          {STEPS.map(s => (
            <div key={s.n} className="text-center">
              {/* `ring-[5px] ring-ink-75` is the mask that lets the rule pass
                  behind the numeral. It has to be the BAND's colour, not white —
                  a white ring on a warm ground is a visible white dot. */}
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 font-display text-body font-bold tabular-nums text-white shadow-brand-glow ring-[5px] ring-ink-75">
                {s.n}
              </span>
              <h3 className="mt-3.5 font-display text-h3 font-bold tracking-tight text-ink-900">
                <SiteText k={s.tk} />
              </h3>
              <p className="mx-auto mt-2 max-w-[280px] text-body leading-[1.55] text-ink-500 text-pretty">
                <SiteText k={s.dk} />
              </p>
            </div>
          ))}
        </Reveal>
      </div>
    </Container>
  </section>
)
