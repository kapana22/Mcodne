'use client'
// Home — „ან პირდაპირ აირჩიე": six real cards off the ONE catalogue.
//
// ⚠️ IT IS THE SECOND DOOR NOW, AND THE HEADING SAYS SO (2026-08-31, from the
// owner's design canvas → Home). This section used to be the page's answer to
// „is this site real?" and stood directly under a hero whose only action was
// search. The canvas puts the intake first, so the roster's job changed: it is
// the alternative for somebody who would rather choose than describe. „ან"
// („or") is doing the whole load-bearing work in that heading.
//
// ⚠️ IT TAKES ITS ROWS AS A PROP AND DOES NOT FETCH. The section it replaced
// fetched `/api/tutors` in a useEffect, which cost the home page two things at
// once: the initial HTML carried six skeletons rather than six experts (a
// crawler reads that HTML and may never run the effect), and the merged
// catalogue was unreachable from here. `app/page.tsx` resolves it server-side
// through the SAME query /experts uses, so what a crawler reads is what a
// reader sees.

import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { CatalogueGrid, type CatalogueCardItem } from '@/components/home/CatalogueGrid'

export const FeaturedExperts = ({ items }: { items: CatalogueCardItem[] }) => {
  // An empty catalogue draws NOTHING. A heading that says „or just choose" over
  // six dashed boxes is the site describing a stage it is in as though it were
  // a loading failure — and the hero above stands on its own.
  if (items.length === 0) return null

  return (
    <section className="pt-14 sm:pt-16 lg:pt-[4.5rem]">
      <Container size="wide">
        <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-h2 font-extrabold tracking-[-0.02em] text-ink-900 sm:text-h1">
              <SiteText k="home.pick.title" />
            </h2>
            <p className="mt-2 text-body text-ink-500">
              <SiteText k="home.pick.sub" />
            </p>
          </div>
          {/* The whole list, named as such. h-11 so it clears the tap floor on
              a phone — a 20px text line is half a touch target. */}
          <Link
            href="/experts"
            className="inline-flex h-11 shrink-0 items-center rounded-field border border-ink-200 bg-white px-[18px] font-display text-body font-semibold text-ink-900
                       transition-colors duration-fast ease-out-quart hover:border-ink-300 hover:bg-ink-75
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <SiteText k="home.pick.allCta" />
          </Link>
        </Reveal>

        <CatalogueGrid items={items} />
      </Container>
    </section>
  )
}
