'use client'
// Home (/) — composes the sections, each of which lives in `app/_home/`.
// That folder is underscore-prefixed on purpose: App Router treats it as a
// private folder, so nothing in it is ever mistaken for a route.
// `Landing` stays the default export — app/page.tsx imports it by that name.
//
// ⚠️ REBUILT 2026-08-21 FROM THE DESIGN CANVAS („მცოდნე — მთავარი გვერდი").
// The page is FIVE sections where it was eight, and the order is the canvas's:
//
//     hero (+ topic rail)  →  ახლა ხელმისაწვდომია  →  კატეგორიები
//                          →  როგორ მუშაობს  →  შენი სერვისი — შენი ფასი
//
// What left the composition, and where each thing went:
//
//   · <RequestBand> — the second way in, „აღწერე რა გჭირდება". It was the
//     owner's own call on 2026-08-17 (the Angi shape: both paths visible at
//     once) and this canvas is the owner's own call four days later, so it is a
//     supersession rather than a removal. ⚠️ THE DOOR IS NOT CLOSED: „მოთხოვნის
//     გაგზავნა" is still the header's one filled action on every page including
//     this one, /request is untouched, and the flag that governs it
//     (`requestsOn`) is read where it always was. What is gone is a full band on
//     the home page asking the visitor to describe a job before the site has
//     shown them a single price. The FILE is untouched at app/_home/request.tsx.
//
//   · <ServiceRail> as a section — it is INSIDE the hero now (app/_home/hero),
//     riding the band's bottom edge, and it carries topics rather than expert
//     cards. See app/_home/rail for why the roster moved out of it.
//
//   · <IllustrationBand> — the page's closing drawing, which lived inside
//     <ClosingBand>. See app/_home/cta.
//
// ⚠️ THE DATA IS SERVER-RESOLVED. Every section here is a pure renderer: the
// roster and the spheres arrive as props from app/page.tsx, so the first HTML
// carries six real cards and six real counts rather than skeletons a crawler
// will never see resolve. No section on this page fetches.

import { Footer } from '@/components/Footer'
import { PublicTopBar } from '@/components/PublicTopBar'
import { type Me } from '@/lib/me'
import type { CatalogueCardItem } from '@/components/home/CatalogueGrid'
import { Categories } from './_home/categories'
import { ClosingBand } from './_home/cta'
import { HomeCat } from './_home/data'
import { FeaturedExperts } from './_home/experts'
import { HomeHero } from './_home/hero'
import { HowItWorks } from './_home/how'

export type LandingProps = {
  categories?: HomeCat[]
  items?: CatalogueCardItem[]
  initialUser?: Me | null
}

const HomeView = ({ categories, items }: { categories: HomeCat[]; items: CatalogueCardItem[] }) => (
  <>
    {/* The hero owns the topic rail — it is the band's bottom edge, not a
        section under it. */}
    <HomeHero />
    {/* WHAT IS ON SALE, before anything explains itself. Six real cards with
        real prices answer „is this site for me?" faster than any sentence, and
        the whole page is arranged around getting the reader here. */}
    <FeaturedExperts items={items} />
    {/* …then the same catalogue by sphere, with the number of people behind
        each one. */}
    <Categories categories={categories} />
    {/* …then, and only then, how it works. Nobody reads three steps before they
        believe there is anything to buy. */}
    <HowItWorks />
    {/* The supply side closes the page, gated inside — an existing provider is
        never invited to become one. */}
    <ClosingBand />
  </>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

export default function Landing({ categories = [], items = [], initialUser }: LandingProps) {
  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      {/* initialUser is server-resolved (app/page.tsx). Without it the header
          fell back to the client probe, and for a signed-in EXPERT that meant
          „დაარეგისტრირე სერვისი" rendered, then vanished a beat later once
          /api/me landed — the header visibly rearranging on the busiest page on
          the site. Free to fix: this page is already force-dynamic. */}
      <PublicTopBar initialUser={initialUser} />
      {/* main landmark — the skip link and SR navigation need it; home was
          the one page without it. */}
      <main id="main"><HomeView categories={categories} items={items} /></main>
      <Footer />
    </div>
  )
}
