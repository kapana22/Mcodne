'use client'
// Home (/) — composes the sections, each of which lives in `app/_home/`.
// That folder is underscore-prefixed on purpose: App Router treats it as a
// private folder, so nothing in it is ever mistaken for a route.
// `Landing` stays the default export — app/page.tsx imports it by that name.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
// რედიზაინი" → Home). The order is the canvas's, and it INVERTS the page:
//
//     hero (describe it + როგორ მუშაობს)  →  კატეგორიები
//                         →  ან პირდაპირ აირჩიე  →  ექსპერტებისთვის
//
// ⚠️ THE INTAKE IS THE FIRST ACTION AGAIN, and that is the substantive change
// rather than a restyle. The 2026-08-21 canvas made this page a catalogue with
// a search box and carried the request door in the header only; this one puts
// „დაწერე, რა გჭირდება" in the largest type on the site and demotes browsing to
// „ან პირდაპირ აირჩიე" halfway down. That is the commerce model the product
// actually runs on — a client describes, providers offer — stated by the page
// for the first time. `app/_home/request.tsx` (the old band) is NOT what came
// back: the hero itself is the field now, and that file stays uncomposed.
//
// ⚠️ THE STEPS ARE NOT A SECTION HERE ANY MORE (2026-08-31). „როგორ მუშაობს"
// used to come after the cards, then above them; the owner's reference draws
// them INSIDE the green card, under the field, and there are four now. So the
// hero composes `FlowSteps` and this file no longer names it — a section that
// is half of another section's surface cannot be ordered independently of it,
// and pretending otherwise is how the seam gets drawn back in.
//
// ⚠️ THE DATA IS SERVER-RESOLVED. Every section here is a pure renderer: the
// roster, the spheres, their counts and their price floors, and the two
// measured activity numbers all arrive as props from app/page.tsx, so the first
// HTML carries real cards and real counts rather than skeletons a crawler will
// never see resolve. No section on this page fetches.

import { Footer } from '@/components/Footer'
import { PublicTopBar } from '@/components/PublicTopBar'
import { type Me } from '@/lib/me'
import type { CatalogueCardItem } from '@/components/home/CatalogueGrid'
import { Categories } from './_home/categories'
import { ClosingBand, type SupplyFacts } from './_home/cta'
import { HomeCat } from './_home/data'
import { FeaturedExperts } from './_home/experts'
import { HomeHero } from './_home/hero'

export type LandingProps = {
  categories?: HomeCat[]
  items?: CatalogueCardItem[]
  initialUser?: Me | null
  /** `/request`, or null when the subsystem is off for this deployment. The
   *  flag is read in app/page.tsx — `requestsOn()` is an env var and a client
   *  component cannot see it. */
  requestHref?: string | null
  facts?: SupplyFacts
}

const NO_FACTS: SupplyFacts = { requestsThisWeek: 0 }

export default function Landing({
  categories = [],
  items = [],
  initialUser,
  requestHref = null,
  facts = NO_FACTS,
}: LandingProps) {
  return (
    <div className="font-sans bg-ink-50 text-ink-900 antialiased">
      {/* initialUser is server-resolved (app/page.tsx). Without it the header
          fell back to the client probe, and for a signed-in EXPERT that meant
          „დაარეგისტრირე სერვისი" rendered, then vanished a beat later once
          /api/me landed — the header visibly rearranging on the busiest page on
          the site. Free to fix: this page is already force-dynamic. */}
      <PublicTopBar initialUser={initialUser} />
      {/* main landmark — the skip link and SR navigation need it; home was
          the one page without it. */}
      <main id="main" className="pb-16 sm:pb-20">
        {/* The one field, and the loudest thing on the page — and, since
            2026-08-31, the four steps that answer „what happens after I press
            that button" on the same green card (app/_home/how.tsx, composed by
            the hero rather than here). */}
        <HomeHero requestHref={requestHref} />
        {/* WHAT PEOPLE ASK FOR, with the number of providers behind each and
            the cheapest price any of them names. */}
        <Categories categories={categories} requestHref={requestHref} />
        {/* …then the other door, for somebody who would rather choose than
            describe. */}
        <FeaturedExperts items={items} />
        {/* The supply side closes the page, gated inside — an existing provider
            is never invited to become one. */}
        <ClosingBand facts={facts} />
      </main>
      <Footer />
    </div>
  )
}
