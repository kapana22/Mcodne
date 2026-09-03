'use client'
// Home — the closing band: the invitation to the SUPPLY side.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
// რედიზაინი" → Home). It was a white section with a small inline drawing; the
// canvas makes it the page's one dark surface — a near-black band with four
// numbers stacked beside the pitch. The drawing went with the redesign: the
// numbers do its job (showing that this is a working marketplace) with facts
// instead of a picture.
//
// ⚠️ EVERY NUMBER IN THE BAND IS EITHER MEASURED OR A CONSTANT, and none is
// typed here. The canvas's four are 214 / 0% / 1₾ / 2 წთ:
//   · 214 → counted this request, and the tile is DROPPED in a quiet week
//     rather than printing a zero (🔒 rule 6).
//   · 0% → GONE. Owner, 2026-08-31: „საკომისიოები არასდ [არასდროს] დაწერო."
//     Its place is taken by the roster size, which is measured and is the
//     other thing a provider wants to know.
//   · 1₾ → `contactCostRangeLabel()` (lib/credits), so the band and the
//     provider's own balance screen cannot disagree about the price of a lead.
//   · 2 წთ → `home.supply.note`, the owner's own copy, unchanged.
//
// ⚠️ THE PITCH IS THE SERVICE AND THE PRICE. „The pitch to a provider is
// CLIENTS FOR THEIR SERVICE, never „share your knowledge". They set the price."
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

import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { Btn } from '@/components/Btn'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { JOIN_DOOR_HREF, JOIN_DOOR_LABEL } from '@/lib/capabilities'
import { contactCostRangeLabel } from '@/lib/credits'

export type SupplyFacts = {
  /** Requests filed in the last seven days. 0 ⇒ the tile is not drawn. */
  requestsThisWeek: number
}

export const ClosingBand = ({ facts }: { facts: SupplyFacts }) => {
  const stats: { v: string; k: string }[] = []
  if (facts.requestsThisWeek > 0) {
    stats.push({ v: String(facts.requestsThisWeek), k: 'მოთხოვნა ამ კვირაში' })
  }
  /* ⚠️ „N ექსპერტი პლატფორმაზე" WAS THE SECOND TILE AND IS GONE (2026-09-02).
     Owner: „არასად არ ეწეროს ეგ ინფო, არასაჭიროა."

     It is also the tile with the weakest claim on the band: the other three
     answer a question the reader has — how much work is coming in, what a lead
     costs, how long signing up takes — and the roster size answers „how many
     competitors are already here", which is not a reason to join. The header
     above still explains why the tile it replaced („0% საკომისიო") went; this
     one goes for the owner's reason, and the band keeps three. */
  /* ⚠️ A RANGE SINCE 2026-09-03. It was one figure while a contact cost one
     figure; the price is 1–10₾ by the size of the job now (lib/credits →
     contactCostTetri), and a single „3₾" on the landing page would be the
     „home page advertising a lead at 1₾ while the ledger charged 3₾" this
     file's own header was written to prevent. */
  stats.push({ v: contactCostRangeLabel(), k: 'ერთი კლიენტის კონტაქტი' })
  stats.push({ v: '2 წთ', k: 'რეგისტრაცია' })

  return (
    <ApplyCtaGate>
      <section className="pt-14 sm:pt-16 lg:pt-[4.5rem]">
        <Container size="wide">
          <Reveal className="relative flex flex-wrap items-center gap-10 overflow-hidden rounded-band bg-ink-900 p-7 text-white sm:p-10 lg:gap-12 lg:p-12">
            {/* The band's one light, in the brand green — the same gesture as
                the hero's, so the page opens and closes on the same material. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -right-16 h-[300px] w-[300px] rounded-full bg-brand-500/[0.22]"
            />

            <div className="relative min-w-[300px] flex-1">
              <span className="inline-flex h-8 items-center rounded-pill bg-white/[0.12] px-3 font-display text-micro font-bold uppercase">
                <SiteText k="home.supply2.eyebrow" />
              </span>
              <h2 className="mt-4 font-display text-h1 font-extrabold leading-[1.1] tracking-[-0.02em] text-balance">
                <SiteText k="home.supply2.title" />
              </h2>
              <p className="mt-3.5 max-w-[520px] text-body leading-[1.65] text-white/[0.74] text-pretty">
                <SiteText k="home.supply2.body" />
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {/* brand-600, not brand-500: white on 500 measures 3.38 and
                    fails AA (CLAUDE.md rule 2). The canvas paints this one
                    #2F9C86 — this is the same button, legible. */}
                <Btn href={JOIN_DOOR_HREF} size="lg" variant="primary">
                  {JOIN_DOOR_LABEL}
                </Btn>
                {/* How long it takes, beside the button that starts it — the
                    one fact that answers „not now" before it is thought. */}
                <span className="text-meta text-white/60">
                  რეგისტრაცია <SiteText k="home.supply.note" />
                </span>
              </div>
            </div>

            <div className="relative grid min-w-[300px] flex-1 grid-cols-2 gap-3">
              {stats.map(s => (
                <div key={s.k} className="rounded-tile bg-white/[0.07] p-5">
                  <div className="font-display text-h2 font-extrabold tabular-nums tracking-[-0.02em]">
                    {s.v}
                  </div>
                  <div className="mt-1 text-meta leading-[1.45] text-white/[0.66]">{s.k}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </Container>
      </section>
    </ApplyCtaGate>
  )
}
