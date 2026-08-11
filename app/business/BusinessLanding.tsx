// The /business landing itself. Mounted by ./page.tsx, which owns the metadata
// and the canSeeB2B gate — this file assumes it is allowed to render.
//
// AUDIENCE: somebody who buys on behalf of a company — an owner, an HR lead, a
// finance manager. That decides the shape:
//   • it answers „how does paying work" first, because that is the only thing
//     genuinely different from the ordinary site, and the only reason this page
//     exists rather than a link to /tutors;
//   • no prices and no promises about response time. We do not have a B2B price
//     list, and inventing an SLA on a landing page is how support inherits a
//     commitment nobody agreed to;
//   • one form, at the bottom, and nothing else to click.
//
// ⚠️ THE COPY IS PLACEHOLDER AND THE OWNER REPLACES IT. CLAUDE.md: „Copy is the
// owner's, and it is PLAIN." Everything here is the plainest sentence that
// works, written to be overwritten. It is deliberately NOT wired to SiteText —
// unlike /abroad, which needed same-day tuning while ads were running. Adding
// ~15 CMS keys for a page nobody can open yet would put a group of dead fields
// in the admin panel today to save an edit later; wire it up when the vertical
// goes 'public' and the wording starts to matter.

import { Container } from '@/components/Container'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { LeadForm } from './LeadForm'

/* How it works — three steps, in the order they happen. Written as facts about
   the mechanism, not as benefits: the reader is deciding whether this fits
   their accounting, and „ერთი ანგარიშფაქტურა" answers that where „მოქნილი
   გადაწყვეტა" does not. */
const STEPS: { icon: keyof typeof Icon; title: string; body: string }[] = [
  {
    icon: 'wallet',
    title: 'ბალანსს ავსებთ ერთხელ',
    body: 'თანხას ჩვენთან ერთი გადარიცხვით ათავსებთ. ბალანსი კომპანიის ანგარიშზეა.',
  },
  {
    icon: 'users',
    title: 'თანამშრომლები ჯავშნიან',
    body: 'ჯავშნისას თანამშრომელი ირჩევს კომპანიის ბალანსს. ბარათი არავის სჭირდება.',
  },
  {
    icon: 'doc',
    title: 'ხედავთ, რაზე დაიხარჯა',
    body: 'ყოველი ჩამოჭრა ცალკე ჩანაწერია — თარიღი, თანხა და ჯავშანი.',
  },
]

export function BusinessLanding() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <Container as="main" className="py-16 lg:py-24">
        <div className="max-w-[680px]">
          <Eyebrow className="mb-3">ბიზნესისთვის</Eyebrow>
          <h1 className="font-display text-display lg:text-display-xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            ექსპერტები თქვენი გუნდისთვის
          </h1>
          <p className="mt-6 text-body-lg text-ink-600">
            კომპანია ავსებს ბალანსს, თანამშრომლები კი ჯავშნიან კონსულტაციებს — იურიდიულს,
            საფინანსოს, მარკეტინგულს და სხვას.
          </p>
        </div>

        {/* How it works. A plain three-column list, not cards with icons in
            plates — the page has one thing to explain and does not need
            decoration to hold attention for three sentences. */}
        <section className="mt-14 lg:mt-20 grid sm:grid-cols-3 gap-8 lg:gap-10">
          {STEPS.map(s => {
            const Glyph = Icon[s.icon]
            return (
              <div key={s.title}>
                <Glyph className="w-5 h-5 text-brand-700" aria-hidden="true" />
                <h2 className="mt-3 font-display text-h3 font-bold text-ink-900 tracking-tight">{s.title}</h2>
                <p className="mt-1.5 text-body text-ink-600">{s.body}</p>
              </div>
            )
          })}
        </section>

        {/* The form. `id` so a future „დაგვიკავშირდით" button anywhere on this
            page can jump to it — nothing links to it yet, and nothing outside
            this route may (tests/b2b.test.ts scans for that). */}
        <section id="form" className="mt-16 lg:mt-24 scroll-mt-24">
          <div className="max-w-[680px]">
            <Eyebrow tone="muted" className="mb-1">განაცხადი</Eyebrow>
            <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">
              დაგვიტოვეთ კონტაქტი
            </h2>
            <p className="mt-2 text-body text-ink-600">
              შეავსეთ ფორმა და დაგიკავშირდებით.
            </p>
          </div>
          <div className="mt-6 max-w-[680px]">
            <LeadForm />
          </div>
        </section>
      </Container>

      <Footer />
    </div>
  )
}
