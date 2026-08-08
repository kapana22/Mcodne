'use client'
// Home (/) — composes the sections, each of which lives in `app/_home/`.
// That folder is underscore-prefixed on purpose: App Router treats it as a
// private folder, so nothing in it is ever mistaken for a route.
// `Landing` stays the default export — app/page.tsx imports it by that name.

import { Footer } from '@/components/Footer'
import { PublicTopBar } from '@/components/PublicTopBar'
import { type Me } from '@/lib/me'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { Categories } from './_home/categories'
import { ExpertCta, JourneyBand } from './_home/cta'
import { HomeCat } from './_home/data'
import { FeaturedExperts } from './_home/experts'
import { HomeHero } from './_home/hero'
import { HowItWorks } from './_home/how'

const HomeView = ({ initialCategories = [] }: { initialCategories?: HomeCat[] }) => (
  <>
    <HomeHero />
    <Categories initialCategories={initialCategories} />
    <FeaturedExperts />
    {/* „როგორ მუშაობს" now also carries the former „რატომ მცოდნე" cells —
        see the note above HowItWorks for why those two sections merged. */}
    <HowItWorks />
    {/* „გახდი ექსპერტი“ section is meaningless for an existing expert/admin. */}
    <ApplyCtaGate><ExpertCta /></ApplyCtaGate>
    <JourneyBand />
  </>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

export default function Landing({ initialCategories = [], initialUser }: { initialCategories?: HomeCat[]; initialUser?: Me | null }) {
  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      {/* initialUser is server-resolved (app/page.tsx). Without it the header
          fell back to the client probe, and for a signed-in TUTOR that meant
          „გახდი ექსპერტი" rendered, then vanished a beat later once /api/me
          landed — the header visibly rearranging on the busiest page on the
          site. Free to fix: this page is already force-dynamic. */}
      <PublicTopBar initialUser={initialUser} />
      {/* main landmark — the skip link and SR navigation need it; home was
          the one page without it. */}
      <main id="main"><HomeView initialCategories={initialCategories} /></main>
      <Footer />
    </div>
  )
}
