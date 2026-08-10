'use client'
// Home — the closing pair: „გააზიარე შენი ცოდნა“ and the illustration band
// that ends the page beneath it.

import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { Reveal } from '@/components/Reveal'
import { CountUp } from '@/components/CountUp'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { IllustrationBand } from '@/components/Illustration'

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
export const ExpertCta = () => (
  <section className="relative bg-ink-50/50 grain">
    <Container className="relative z-10 py-10 sm:py-12 lg:py-16">
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-12 items-center">
        <Reveal>
          {/* Canon section-header pattern (eyebrow + heading), replacing the
              bespoke badge — whose „ხელით მოდერაცია" tail also repeated the
              „ყოველი ჯავშანი მოიცავს" cell directly above this section. */}
          <Eyebrow className="mb-3"><SiteText k="home.expertCta.eyebrow" /></Eyebrow>
          <h2 className="font-display text-h2 sm:text-display font-bold leading-[1.08] tracking-[-0.02em] text-ink-900">
            <SiteText k="home.expertCta.title" /><br />
            <span className="text-brand-600">{PAYMENTS_LIVE ? 'გასამრჯელო — სესიის შემდეგ.' : 'სრული თანხა შენია.'}</span>
          </h2>
          <p className="text-body-lg text-ink-700 mt-5 max-w-[520px] leading-relaxed">
            {/* The commission clause was removed 2026-08-05 (owner) — with it
                went the PAYMENTS_LIVE branch and the COMMISSION_PCT template,
                which is exactly why this paragraph is editable now. */}
            <SiteText k="home.expertCta.body" />
          </p>
          {/* One CTA. The „როგორ მუშაობს" button next to it pointed at /apply
              too — the same destination twice reads as a choice and isn't one. */}
          <Link href="/apply" className="tap-shrink mt-7 h-12 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
            <SiteText k="home.expertCta.cta" />
          </Link>
        </Reveal>
        {/* One hairline lattice instead of three shadowed cards — the same three
            facts, read as one object. Single-block reveal: the gap-px /
            overflow-hidden lattice would clip per-cell staggered motion. */}
        <Reveal delay={120} className="grid grid-cols-1 gap-px bg-ink-200 border border-ink-200 rounded-card overflow-hidden">
          {visible => (
            (PAYMENTS_LIVE
              // No percentage in EITHER branch (2026-08-05): the payout share
              // states the commission by subtraction (85% ⇒ 15%), which is the
              // very thing this section no longer advertises.
              ? [
                  { n: null as number | null, txt: 'მალე', l: 'გასამრჯელო', s: 'სესიის დასრულების შემდეგ' },
                  { n: null as number | null, txt: 'შენ', l: 'ადგენ ფასს', s: 'დროსა და თემას' },
                  { n: null as number | null, txt: '60', l: 'წუთი სესია', s: 'ხანგრძლივობასა და ფასს შენ ადგენ' },
                ]
              // Flag off = no charge and no deduction today. The commission
              // figure was removed from this cell 2026-08-05 (owner): the
              // sub-line said what WILL be withheld, which is a promise the
              // marketing surfaces no longer make. /terms still states it.
              : [
                  { n: null as number | null, txt: '0%', l: 'საკომისიო დღეს', s: 'მოგვიანებით 10–15%' },
                  { n: null as number | null, txt: '100%', l: 'შენი ნაწილი', s: 'სანამ გადახდები არ ამოქმედდება' },
                  // Was „მალე / შემოსავალი" — a stat cell whose figure is the
                  // word „soon". A number slot holding roadmap status is the
                  // emptiest thing on the page; this states what the expert
                  // actually controls today.
                  { n: null as number | null, txt: '60', l: 'წუთი სესია', s: 'ხანგრძლივობასა და ფასს შენ ადგენ' },
                ]
            ).map((s, i) => (
              <div key={i} className="bg-white px-5 py-4 flex items-baseline gap-4">
                <div className="font-display text-h1 font-bold text-brand-600 tabular-nums tracking-tight leading-none shrink-0 min-w-[68px]">
                  {/* Static number until scroll-enter (SSR/crawlers always see
                      the real value — never a fake 0%), then CountUp 0→n. */}
                  {s.n !== null
                    ? (visible ? <CountUp value={s.n} from={0} duration={900} suffix="%" /> : <span className="tabular-nums">{s.n}%</span>)
                    : s.txt}
                </div>
                <div className="min-w-0">
                  <Eyebrow>{s.l}</Eyebrow>
                  <div className="text-meta text-ink-600 mt-1 leading-snug">{s.s}</div>
                </div>
              </div>
            ))
          )}
        </Reveal>
      </div>
    </Container>
  </section>
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

   OUTSIDE `<ApplyCtaGate>` deliberately — an existing expert doesn't see the
   „გახდი ექსპერტი" section, but the page still needs something between the
   dark band and the footer. */
export const JourneyBand = () => (
  <section className="bg-ink-75">
    <IllustrationBand name="consultationJourney" />
  </section>
)