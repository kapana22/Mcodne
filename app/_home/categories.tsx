'use client'
// Home — „კატეგორიები": six tiles, each carrying the number of people behind it.
//
// ⚠️ IT NO LONGER FETCHES (2026-08-21). It used to seed from a hardcoded top-6,
// then re-fetch `/api/categories` in an effect to learn which spheres actually
// had somebody in them — so the first paint printed six names that could each
// be replaced a beat later, and the counts the design canvas puts on the tiles
// were not available at all until after hydration. `app/page.tsx` resolves the
// spheres AND their counts server-side (the same `expertCountsByCategory` the API
// route uses), so the tiles are correct in the HTML a crawler reads.
//
// ⚠️ POPULATED CATEGORIES ONLY, and that filter is the whole reason the count is
// on the tile. A tile that leads to „ვერ ვიპოვეთ" is a dead end the visitor
// built for us; printing „7" beside the name is the same promise made checkable
// before the click. The filter lives in app/page.tsx with the query — see there.
//
// ⚠️ THE „ყველა კატეგორია" TEXT ROW IS GONE with the redesign. It existed to
// link every live sphere from the home page for crawl depth, back when the six
// tiles were a hardcoded subset. The tiles are now the real, populated set, and
// the row underneath them listed the SAME slugs a second time in a smaller
// font — one address, twice, in one screen. Everything it linked is one click
// away in the catalogue's own filter, which is where a sphere lives now.

import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { categoryIcon } from '@/lib/categoryMarks'
import { HomeCat } from './data'

export const Categories = ({ categories }: { categories: HomeCat[] }) => {
  // Kept to six so the 3×2 grid is intact — the catalogue is where the rest are.
  const tiles = categories.slice(0, 6)
  // Nothing populated yet: draw nothing rather than a heading over an empty
  // grid. Same rule as the roster above it.
  if (tiles.length === 0) return null

  return (
    <section className="bg-white">
      <Container className="pb-11 sm:pb-12 lg:pb-14">
        <Reveal>
          <h2 className="mb-5 font-display text-h2 font-bold tracking-[-0.022em] text-ink-900 sm:mb-6 sm:text-h1">
            <SiteText k="home.spheres.title" />
          </h2>
        </Reveal>

        <Reveal stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map(c => (
            /* → /experts?category=<slug> (stage 8, 2026-08-19): /categories/*
               was retired and 308s to exactly this — the catalogue's own filter
               is the sphere page now. */
            <Link
              key={c.slug}
              href={`/experts?category=${c.slug}`}
              className="group flex min-h-[64px] items-center gap-3.5 rounded-card border border-ink-200 bg-ink-75/60 px-4 py-4 text-left
                         transition-[background-color,border-color,transform] duration-fast ease-out-quart
                         hover:border-brand-300 hover:bg-white motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.99]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              <span aria-hidden className="shrink-0 text-brand-600">
                {categoryIcon(c.slug, 'w-5 h-5')}
              </span>
              <span className="min-w-0 flex-1 font-display text-body font-semibold leading-snug text-ink-900">
                {c.name}
              </span>
              {/* THE COUNT IS THE POINT — it is what turns a label into a
                  promise. `expertCount` is measured (lib/categoryCounts), never
                  a rounded-up marketing number, and a sphere with none of them
                  never reaches this list. */}
              {typeof c.expertCount === 'number' && c.expertCount > 0 && (
                <span className="shrink-0 font-display text-small font-semibold tabular-nums text-ink-400">
                  {c.expertCount}
                </span>
              )}
            </Link>
          ))}
        </Reveal>
      </Container>
    </section>
  )
}
