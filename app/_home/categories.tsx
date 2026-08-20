'use client'
// Home — the category grid (DB-driven, with a static fallback).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { categoryMark, categoryIcon } from '@/lib/categoryMarks'
import { FALLBACK_CATS, HomeCat } from './data'

export const Categories = ({ initialCategories = [] }: { initialCategories?: HomeCat[] }) => {
  // Drive the grid from the live, admin-managed categories. Seed with the
  // fallback so SSR/first paint (and a failed fetch) still render the canonical
  // top-6 — the effect then replaces them with the DB set (hidden categories
  // drop out, renames propagate). Kept to 6 tiles so the 2×3 design is intact.
  // `initialCategories` is resolved SERVER-side (app/page.tsx) precisely so the
  // „ყველა სფერო" links below are in the HTML a crawler reads first. The
  // hardcoded FALLBACK_CATS only covers a DB blip.
  const [cats, setCats] = useState<HomeCat[]>(initialCategories.length ? initialCategories.slice(0, 6) : FALLBACK_CATS)
  const [allCats, setAllCats] = useState<HomeCat[]>(initialCategories.length ? initialCategories : FALLBACK_CATS)
  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return
        // Only categories that actually HAVE a visible expert. A tile that
        // leads to „ვერ ვიპოვეთ" is a dead end, and today 11 of 15 categories
        // are empty. If none are populated yet, fall through to the seeded
        // fallback rather than rendering an empty section.
        // `browsable` too — the endpoint also serves the not-yet-advertised
        // spheres so the application can offer them. See app/api/categories.
        const populated = rows.filter(r => r.browsable !== false && (r.expertCount ?? 0) > 0)
        if (populated.length === 0) return
        setCats(populated.map(r => ({ slug: r.slug, name: r.name })))
        // POPULATED ONLY — same predicate as the tiles (2026-08-02). This row
        // used to link every LIVE sphere on the SEO argument in the note below,
        // and the result was two rows on one screen contradicting each other:
        // the grid correctly showed spheres that have someone to book, and the
        // text row directly underneath it offered 7 more (career, product,
        // design, hr, real-estate, relocation, crypto — measured live) that all
        // land on „ამ სფეროში ჯერ არ არის ექსპერტი". A visitor whose field is
        // one of those learns we don't cover it AFTER a click, which is worse
        // than not seeing it. The SSR seed still carries every live sphere into
        // the first HTML (app/page.tsx has no counts to filter by), so the
        // crawl-depth argument keeps what it was actually worth.
        setAllCats(populated.map(r => ({ slug: r.slug, name: r.name })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // The six the grid renders, and whatever is left over. `cats` holds ALL
  // populated spheres (the grid slices to six), so the row's old
  // `allCats.length > cats.length` test compared a list against itself the
  // moment both were filtered the same way — and the row would have vanished
  // even when there WERE spheres the tiles couldn't fit. Compare against the
  // six actually on screen.
  const tileCats = cats.slice(0, 6)
  const untiledCats = allCats.filter(c => !tileCats.some(t => t.slug === c.slug))
  return (
    <section className="bg-white border-b border-ink-200">
      {/* Section padding trimmed 2026-07-31 (py-12/16/20 → py-10/12/16). Every
          seam on this page was a section's bottom padding plus the next one's
          top padding — 160px of nothing on desktop, measured as five dead bands
          of 150–210px down the page, each split by a single rule. Read at speed
          it looks like the content ran out. Boundaries are now ~128px: still
          generous, no longer a void. */}
      <Container className="py-10 sm:py-12 lg:py-16">
        <Reveal className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-7 sm:mb-9">
          <div className="max-w-[640px]">
            <Eyebrow className="mb-3"><SiteText k="home.categories.eyebrow" /></Eyebrow>
            {/* One section-heading scale for the whole page (24/32/36). It sits
                a clear step under the hero h1 — before, three sections outran it. */}
            <h2 className="font-display text-h2 sm:text-display font-bold text-ink-900 tracking-[-0.02em] leading-[1.08]"><SiteText k="home.categories.title" /></h2>
            <p className="hidden sm:block mt-4 text-body-lg text-ink-600 leading-[1.55]"><SiteText k="home.categories.subtitle" /></p>
          </div>
          {/* Only 6 of the 14 live spheres fit the grid — say where the rest are
              instead of leaving the row looking like the whole catalogue.
              HIDDEN <sm (2026-08-02): at 390px this link and the h2 shared one
              flex row, so „ყველა კატეგორია" sat jammed against „აირჩიე შენი კატეგორია"
              at the heading's own baseline — two different things reading as one
              broken line. Nothing is lost by dropping it there: the „ყველა
              კატეგორია" nav directly below the tiles carries the same links, and on
              mobile it is one thumb-flick away rather than a corner tap. */}
          <Link href="/experts" className="hidden sm:inline-flex font-display text-small font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast items-center h-11">
            ყველა კატეგორია
          </Link>
        </Reveal>
        {/* Tile = icon + name + one line. The two label strips that used to ride
            here are gone: „ხელით შერჩეული" repeated the hero's trust strip six
            times in one viewport, and the „ექსპერტების ნახვა" footer restated an
            affordance the whole-tile link already carries. Between them they cost
            ~45% of every tile's height and said nothing the user didn't know. */}
        <Reveal stagger className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
          {tileCats.map(c => {
            const meta = categoryMark(c.slug)
            return (
              /* flex-col until sm: at 390px the 2-up grid leaves a ~166px column,
                 and an icon sitting beside the text cut the text box to ~105px —
                 narrow enough that Georgian compounds („გადასახადები",
                 „მარკეტინგი") broke mid-word. Stacked, the name gets the full
                 column; from sm the row has the width to go horizontal. */
              /* → /experts?category=<slug> (stage 8, 2026-08-19): /categories/*
                 was retired and 308s to exactly this — the catalogue's own
                 filter is the sphere page now. */
              <Link key={c.slug} href={`/experts?category=${c.slug}`} className="group relative overflow-hidden rounded-card border border-ink-200 bg-white p-4 sm:p-5 shadow-xs hover:border-brand-200 hover-lift motion-safe:active:scale-[0.99] flex flex-col sm:flex-row items-start gap-2.5 sm:gap-3.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
                {/* Brand accent hairline — reveals on hover. */}
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand-500 transition-transform duration-mid ease-out-quart group-hover:scale-x-100" />
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-btn flex items-center justify-center shrink-0 bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-900/[0.04] shadow-xs transition-all duration-mid ease-out-quart group-hover:text-brand-700 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-105">
                  {categoryIcon(c.slug, 'w-5 h-5 sm:w-6 sm:h-6')}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-body-lg sm:text-h2 font-bold text-ink-900 leading-[1.15] tracking-tight transition-colors duration-fast group-hover:text-brand-700 break-words">{c.name}</h3>
                  <p className="mt-1 text-meta sm:text-small text-ink-600 leading-[1.4] line-clamp-2">{meta.description}</p>
                </div>
              </Link>
            )
          })}
        </Reveal>

        {/* Every sphere as plain text, under the six tiles.
            TWO reasons, and the second is the one that matters:
            · a visitor whose field isn't among the six populated tiles can still
              reach it in one click instead of concluding we don't cover it;
            · the home page linked only 4–6 category pages, so the other 9–11
              were reachable ONLY from /categories. Google draws sitelinks from
              what the home page points at, and it crawls what the home page
              points at FIRST — those pages were effectively second-class on
              their own site. findme.ge, the direct competitor, links 12 from its
              home page and has the sitelinks to show for it.
            Deliberately text, not more tiles: the 2×3 grid is a design decision
            (see the tile note above) and 15 tiles would bury the six that
            actually have someone to book.
            SCOPE (2026-08-02): populated spheres only — see the setAllCats note
            above. „ყველა" now means every sphere you can actually book in. */}
        {untiledCats.length > 0 && (
          <nav aria-label="ყველა კატეგორია" className="mt-6 sm:mt-8">
            <Eyebrow tone="muted" className="mb-2.5"><SiteText k="home.categories.allEyebrow" /></Eyebrow>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {allCats.map(c => (
                <li key={c.slug}>
                  <Link
                    href={`/experts?category=${c.slug}`}
                    // min-h-[40px] below sm: these are real navigation links and
                    // a 20px-tall text line is half the minimum touch target.
                    className="text-small text-ink-600 hover:text-brand-700 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-sm inline-flex items-center min-h-[40px] sm:min-h-0"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </Container>
    </section>
  )
}