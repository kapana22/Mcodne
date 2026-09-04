// /preview/request-start — A DRAFT OF THE INTAKE'S FIRST SCREEN. Not the funnel.
//
// ⚠️ THIS IS A PREVIEW ROUTE AND IT IS MEANT TO BE DELETED. Owner, 2026-09-04:
// „რაიმე ცარიელ გვერდზე ჯერ" — the proposal below changes the first screen of
// the only funnel this product has, so it gets looked at on its own address
// before it goes anywhere near /request. Nothing links here; it is `noindex,
// nofollow`; and it writes nothing. When the decision is made this file goes,
// whichever way the decision falls.
//
// ── WHAT IT PROPOSES, AND WHY ───────────────────────────────────────────────
// Measured on the live /request first screen: an h1, one sentence, a 48px
// search field and a 40px button — 362px of page in total, and the categories
// are BEHIND that button. So somebody who does not know what to type sees an
// empty field and has to work out that a second control exists.
//
// The reference products answer this the same way: servisebi.ge puts a category
// carousel with icons directly under its search, and Airtasker and Fiverr put
// popular services in the same place.
//
// ⚠️ IT WAS THREE ADDITIONS AND IT IS ONE. A row of profession chips and a
// „ასე წერენ ხოლმე" block of example phrasings were drawn here too, both
// argued from reference products, and the owner cut both on sight („ეს
// წაშალე"). The reasoning is kept at the point where they stood.
//
// ⚠️ EVERY PIECE HERE ALREADY EXISTS. The photographs are the seventeen in
// /public/category-photos, the icons are `lib/categoryMarks` (fifteen slugs),
// and the price floors are the measured `priceFrom` the home tiles already
// print. No new asset, no new colour, no new token.
import type { Metadata } from 'next'
import Image from 'next/image'
import { prisma } from '@/lib/prisma'
import { Container } from '@/components/Container'
import { Icon } from '@/components/Icon'
import { expertCountsByCategory, priceFloorsByCategory } from '@/lib/categoryCounts'
import { categoryIcon, categoryPhoto } from '@/lib/categoryMarks'
import { tileHue } from '@/app/_home/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'დრაფტი — მოთხოვნის პირველი ეკრანი',
  robots: { index: false, follow: false },
}

/** The home page's own rule, applied to the same query: VISIBLE spheres that
 *  actually have somebody in them, busiest first. A tile that opens „ვერ
 *  ვიპოვეთ" is the dead end app/page.tsx already refuses. */
async function tiles() {
  const all = await prisma.category.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, name: true, status: true, parentId: true },
  })
  const [counts, floors] = await Promise.all([
    expertCountsByCategory(all),
    priceFloorsByCategory(all),
  ])
  return all
    .filter(c => c.status === 'VISIBLE')
    .map(c => ({
      slug: c.slug,
      name: c.name,
      expertCount: counts.get(c.id) ?? 0,
      priceFrom: floors.get(c.id) ?? null,
    }))
    .filter(c => c.expertCount > 0)
    .sort((a, b) => b.expertCount - a.expertCount || a.name.localeCompare(b.name, 'ka'))
}

export default async function Page() {
  const cats = await tiles()

  return (
    <div className="min-h-dvh bg-ink-50">
      {/* The one thing that is NOT part of the proposal. */}
      <div className="bg-ink-900 py-2.5 text-center text-white">
        <Container size="narrow">
          <p className="text-meta">
            <span className="font-display font-bold">დრაფტი</span>
            {' · '}ეს არ არის ცოცხალი ფორმა — არაფერი იგზავნება
          </p>
        </Container>
      </div>

      <header className="sticky top-0 z-chrome border-b border-ink-100 bg-ink-50/90 backdrop-blur-md">
        <Container size="narrow" className="flex h-16 items-center justify-between gap-4">
          <nav aria-label="ეტაპები" className="min-w-0">
            <ol className="flex items-center gap-1.5 text-meta">
              <li className="min-w-0 truncate font-display font-bold text-brand-700">რა გჭირდება</li>
              <li aria-hidden className="text-ink-300">·</li>
              <li className="min-w-0 truncate font-display font-semibold text-ink-400">დეტალები</li>
              <li aria-hidden className="text-ink-300">·</li>
              <li className="min-w-0 truncate font-display font-semibold text-ink-400">კონტაქტი</li>
            </ol>
          </nav>
        </Container>
        <div className="h-0.5 bg-ink-100">
          <div className="h-full w-[16%] rounded-r-pill bg-brand-600" />
        </div>
      </header>

      <Container as="main" size="narrow" className="pb-24 pt-8">
        <h1 className="font-display text-h2 font-bold tracking-[-0.01em] text-ink-900">
          რაში გჭირდება დახმარება?
        </h1>
        <p className="mt-2 text-body text-ink-600">
          დაწერე შენი სიტყვებით — ექსპერტები შემოგთავაზებენ.
        </p>

        {/* The field, unchanged: 52px, the same shape the wizard already draws.
            The owner's one condition was that the search stays. */}
        <div className="mt-5 flex h-[52px] items-center gap-3 rounded-field border border-ink-200 bg-white px-4">
          <Icon.search aria-hidden className="h-[18px] w-[18px] shrink-0 text-ink-400" />
          <span className="text-body text-ink-400">მოძებნე სერვისი</span>
        </div>

        {/* ── 1. THE CATEGORIES COME OUT FROM BEHIND THE BUTTON ───────────── */}
        <h2 className="mt-8 font-display text-small font-semibold text-ink-600">
          ან აირჩიე კატეგორია
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cats.map((c, i) => {
            const hue = tileHue(i)
            const photo = categoryPhoto(c.slug)
            return (
              <li key={c.slug}>
                <span
                  style={{ backgroundColor: hue.bg, borderColor: hue.border }}
                  className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-card border text-ink-900 transition-[transform,box-shadow] duration-mid ease-out-quart hover:shadow-card-hover motion-safe:hover:-translate-y-1"
                >
                  <span className="relative block h-[84px] overflow-hidden bg-white/40">
                    {photo && (
                      <>
                        <Image src={photo} alt="" aria-hidden fill sizes="200px" className="object-cover" />
                        <span aria-hidden style={{ backgroundColor: hue.bg }} className="absolute inset-0 opacity-[0.22]" />
                      </>
                    )}
                    <span
                      aria-hidden
                      style={{ color: hue.ink }}
                      className="absolute bottom-2 left-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-xs"
                    >
                      {categoryIcon(c.slug, 'w-4 h-4')}
                    </span>
                  </span>
                  <span className="block px-3 pb-3 pt-2.5">
                    <span className="block font-display text-small font-bold leading-snug">{c.name}</span>
                    {typeof c.priceFrom === 'number' && c.priceFrom > 0 && (
                      <span className="mt-0.5 block text-meta tabular-nums text-ink-500">
                        {c.priceFrom}₾-დან
                      </span>
                    )}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>

        {/* ⚠️ TWO MORE BLOCKS STOOD HERE AND THE OWNER CUT THEM (2026-09-04).
            One was a row of ten profession chips from `lib/professionSeo`; the
            other was „ასე წერენ ხოლმე", three example phrasings for somebody
            staring at an empty field (Thumbtack's answer to the same problem).
            Both were argued from reference products and both were removed on
            sight: „ეს წაშალე."

            Worth keeping the reason findable rather than the code. The screen
            asks ONE question — what do you need — and every block added under
            it is a second way to answer the same question. Three ways to start
            is not three times the help; it is a choice about how to choose,
            made before the first tap. The search and the categories already
            cover the two real cases: somebody who knows the words, and
            somebody who wants to browse. */}
      </Container>
    </div>
  )
}
