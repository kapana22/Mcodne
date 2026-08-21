'use client'
// Home — „ახლა ხელმისაწვდომია": six real cards off the ONE catalogue.
//
// ⚠️ IT TAKES ITS ROWS AS A PROP AND DOES NOT FETCH (2026-08-21). The section
// it replaces fetched `/api/tutors` in a useEffect, which cost the home page
// two things at once: the initial HTML carried six skeletons rather than six
// experts (a crawler reads that HTML and may never run the effect), and the
// merged catalogue was unreachable from here — a provider lives in a second
// table that has no list endpoint at all. `app/page.tsx` resolves both halves
// server-side through the SAME queries /experts uses, so what a crawler reads
// is what a reader sees, and rule 4 („wherever both appear, the service comes
// first") can actually be honoured by an ORDER rather than by a hope.
//
// ⚠️ THE SPHERE CHIPS ARE GONE with the fetch. They re-laid this grid in place
// from a set of eight filters — a second, weaker copy of the catalogue's own
// filter rail, on a page whose job is to get somebody TO that catalogue. The
// design canvas replaces them with one honest link („ყველა →"), which is the
// same journey with one fewer decision on the way.

import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { CatalogueGrid, type CatalogueCardItem } from '@/components/home/CatalogueGrid'

export const FeaturedExperts = ({ items }: { items: CatalogueCardItem[] }) => {
  // An empty catalogue draws NOTHING. A heading that says „available now" over
  // six dashed boxes is the site describing a stage it is in as though it were
  // a loading failure — and the hero above stands on its own.
  if (items.length === 0) return null

  return (
    <section className="bg-white">
      <Container className="py-11 sm:py-12 lg:py-14">
        <Reveal className="mb-5 flex items-baseline justify-between gap-4 sm:mb-6">
          <h2 className="font-display text-h2 font-bold tracking-[-0.022em] text-ink-900 sm:text-h1">
            <SiteText k="home.now.title" />
          </h2>
          {/* The whole list, named as such. h-11 so it clears the tap floor on
              a phone — a 20px text line is half a touch target. */}
          <Link
            href="/experts"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 font-display text-body font-semibold text-brand-700 transition-colors duration-fast hover:text-brand-800
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-btn"
          >
            <SiteText k="home.now.allCta" />
            <span aria-hidden>→</span>
          </Link>
        </Reveal>

        <CatalogueGrid items={items} />
      </Container>
    </section>
  )
}
