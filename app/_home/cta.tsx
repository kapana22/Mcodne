'use client'
// Home — the closing band: „გააზიარე შენი ცოდნა“ (gated for existing experts)
// with the illustration that ends the page beneath it. One section, one
// component (`ClosingBand`) — 2026-08-19 the two were merged so the home page
// carries six sections instead of seven; the copy, links and gate are unchanged.

import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { IllustrationBand } from '@/components/Illustration'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'

/* Testimonials removed (Phase 0.2): the previous section showed invented
   people with i.pravatar.cc stock faces and fabricated outcomes. It returns
   only when real outcome-story reviews accumulate (role-attributed, quantified
   quotes pulled from the Reviews system) — never seeded. */

/* ───── „გახდი ექსპერტი" ─────
   The page's SECONDARY path, and it now looks like one. It used to close the
   home with a lg:py-24 band, a bespoke pill-in-a-pill badge, three big cards
   with 40px numerals, and two buttons that both went to /apply — more visual
   weight than the expert row it follows, for the smaller audience. Same copy,
   same honesty branches, a third of the height. */
/* `border-b`, NOT `border-y`. The section immediately above (#how) already ends
   in `border-b border-ink-200`, so a top border here landed a second 1px rule on
   the exact same y — two hairlines stacked, in slightly different tints because
   the backgrounds differ (bg-ink-50 vs bg-ink-50/50). It read as one thick,
   smudged, misaligned divider.
   Rule for this page: a section owns its BOTTOM edge only — EXCEPT this one,
   the last before the footer, which now owns neither: the footer draws its own
   full-bleed hairline, so the two sat 80px apart with nothing between them.
   That pair is the „two lines above the footer" you can see from across the
   room. The footer's rule is canonical — it is on every page, including those
   that do not end in a bordered section.
   (A `{/* … *\/}` here is a SYNTAX error — a JSX comment cannot be the first
   thing inside an arrow function's parenthesised return. Keep it a /* *\/ block
   above the arrow.) */
const ExpertCta = () => (
  <div className="relative grain">
    <Container className="relative z-10 pt-12 sm:pt-16 pb-8 sm:pb-10">
      {/* ⚠️ ONE CENTRED COLUMN — THE STATS LATTICE IS GONE (2026-08-19).
          Owner, holding a screenshot of this band: „მარჯვენა მხარე მოვაშოროთ,
          15 საკომისიო და ეგ ქარდი სრულად, და მარცხნივ რაც წარწერაა, ის ლამაზად
          ცენტრში იქნება ფოტოსი."

          The lattice printed „15% საკომისიო / 85% შენი ნაწილი / 60 წუთი სესია"
          beside the invitation — so the first hard number an expert met on the
          home page was what we take, stated in the same stat type as what they
          keep, in the block whose job is to make them want to apply. The
          commission is not hidden by removing it: it is in the help centre
          (`COMMISSION_PCT`, pinned by tests/helpTopics) and in the terms, which
          is where somebody looks for it, and it is stated before anybody is
          asked to price anything.

          What the removal leaves is the actual invitation, and a two-column
          grid with one column left in it is not a layout — so the copy is now
          one centred column over the full width, reading straight down into the
          drawing that closes the page. `max-w` is the measure, not the grid: a
          centred `text-display` line that runs the full 1280 is a banner, not a
          sentence. */}
      <Reveal className="mx-auto max-w-[680px] flex flex-col items-center text-center">
        {/* Canon section-header pattern (eyebrow + heading), replacing the
            bespoke badge — whose „ხელით მოდერაცია" tail also repeated the
            „ყოველი ჯავშანი მოიცავს" cell directly above this section. */}
        <Eyebrow className="mb-3"><SiteText k="home.expertCta.eyebrow" /></Eyebrow>
        <h2 className="font-display text-h2 sm:text-display font-bold leading-[1.08] tracking-[-0.02em] text-ink-900 text-balance">
          <SiteText k="home.expertCta.title" /><br />
          {/* ⚠️ WAS „გასამრჯელო — სესიის შემდეგ." (2026-08-20). A „session" is
              what a CONSULTATION produces; a plumber finishes a job. The band
              recruits both halves of one catalogue, so its promise has to hold
              for both — and the one that does is the one the model is built on:
              the provider names the price. Hardcoded rather than a SiteText
              key on purpose — the first line beside it is editable, and two
              editable halves of one sentence drift apart. */}
          <span className="text-brand-600">ფასს შენ წერ.</span>
        </h2>
        <p className="text-body-lg text-ink-700 mt-5 max-w-[520px] leading-relaxed text-pretty">
          {/* The commission clause was removed 2026-08-05 (owner) — with it
              went the PAYMENTS_LIVE branch and the COMMISSION_PCT template,
              which is exactly why this paragraph is editable now. */}
          <SiteText k="home.expertCta.body" />
        </p>
        {/* One CTA. The „როგორ მუშაობს" button next to it pointed at /apply
            too — the same destination twice reads as a choice and isn't one. */}
        <Link href="/join" className="tap-shrink mt-7 h-12 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
          <SiteText k="home.expertCta.cta" />
        </Link>
      </Reveal>
    </Container>
  </div>
)

/* ───── The page's closing image ─────
   Full-bleed, no copy, no CTA: the drawing's own left→right story — questions
   and half-written notes resolving into a booked video consultation — is the
   whole product in one picture, which is why it closes the page rather than
   explaining any one section.

   Placement is the owner's call (2026-08-08): it shipped above „როგორ მუშაობს"
   first and was moved here, under „გააზიარე შენი ცოდნა". Note the one hard
   constraint if it ever moves again — it CANNOT go inside `#how`; that band is
   bg-ink-900 and this art is thin dark-teal line work, verified by screenshot
   to be nearly invisible there.

   `bg-ink-75` is not a guess: the artwork was colour-shifted at export so its
   paper measures #F8F6F2 exactly, which is why the empty left half reads as the
   drawing's own paper continuing rather than as a background behind an image.
   Change this class and the band grows a vertical seam — see the PAPER note in
   components/Illustration. No border either side: the footer below draws its
   own full-bleed hairline, and the tone step above IS the divider.

   The illustration sits OUTSIDE `<ApplyCtaGate>` deliberately — an existing
   expert doesn't see the „გახდი ექსპერტი" block, but the page still needs
   something between the dark band and the footer. Both live in ONE section
   (`bg-ink-75` — the paper tone the art was exported to, see above), so the
   expert copy and the drawing read as one closing band, not two. */
export const ClosingBand = () => (
  <section className="bg-ink-75">
    {/* „გახდი ექსპერტი“ is meaningless for an existing expert/admin. */}
    <ApplyCtaGate><ExpertCta /></ApplyCtaGate>
    <IllustrationBand name="consultationJourney" />
  </section>
)