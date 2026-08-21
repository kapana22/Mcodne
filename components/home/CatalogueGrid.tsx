'use client'
import React from 'react'
// next-view-transitions' Link is a drop-in for next/link that runs the
// navigation inside document.startViewTransition — this is what animates
// the card→profile morph. Unsupported browsers get plain navigation.
import { Link } from 'next-view-transitions'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { Reveal } from '@/components/Reveal'
import { Icon } from '@/components/Icon'

/**
 * ONE CARD FOR THE WHOLE CATALOGUE — the home page's „ახლა ხელმისაწვდომია".
 *
 * ⚠️ IT REPLACES `components/home/ExpertGrid` (2026-08-21). That component was
 * expert-shaped by its type as well as its layout — `rate`, `reviews`,
 * `sessions`, a „დაჯავშნე" button — so a PROVIDER could not appear in it at
 * all, and the home page's roster silently showed only the consulting half of a
 * catalogue the canon says is one list („One catalogue, one card, one
 * namespace"). The rule that both halves appear, service first, cannot be
 * honoured by a grid that can only render one of them.
 *
 * ⚠️ THE CARD IS COMPACT ON PURPOSE — it comes from the design canvas
 * („მცოდნე — მთავარი გვერდი"): a 52px face, a name, ONE badge, ONE line of what
 * they do, and the price on its own strip at the foot. The card it replaces was
 * a 96px portrait over five stacked facts and a booking button — a browse card
 * doing a profile's job, three-up on a home page. Six of these fit the fold;
 * six of those did not.
 *
 * What survives from the old grid, because it was never about the format:
 *  - ONLY facts that exist. No „0 სესია", no „★ 0.0", and 🔒 never a price
 *    somebody did not name — a provider who quotes per job says so in words.
 *  - The FLAGSHIP price and duration from the SAME tier (the caller resolves it
 *    through `primaryPriceLabel`), never the profile's flat rate beside another
 *    tier's clock.
 *  - <Avatar>, never a raw <img>: an avatarUrl that is present but unusable
 *    renders a broken-image glyph, and several are.
 */

export type CatalogueCardItem = {
  /** The row id — the href falls back to it when there is no slug yet. */
  id: string
  /** Public address's last segment. Preferred over the id: a cuid href 308s to
   *  the slug, and that redirect downgrades the navigation to a full load,
   *  killing the photo morph. */
  slug?: string | null
  name: string
  /**
   * The ONE label under the name — a profession („ბუღალტერი"), a trade
   * („დალაგება"), or the sphere when neither exists. Never the literal type of
   * the offer: „a კონსულტაცია/სერვისი badge on a name" is one of the three
   * things CLAUDE.md says must not come back.
   */
  badge: string
  /** One line in their own words. Empty is fine — the row goes away. */
  blurb: string
  /** „₾64-დან" — already formatted by `offerPriceLabel`, or null for „ask". */
  priceLabel: string | null
  /** The half-line after the price — „სერვისი" or „45 წთ". */
  priceSuffix: string
  photo: string | null
  verified?: boolean
}

/** Six is the grid: 3×2 on desktop, 2×3 on tablet, a single column on a phone. */
export const CATALOGUE_GRID_SIZE = 6

const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5'

export function CatalogueGrid({
  items,
  loading,
}: {
  items: CatalogueCardItem[]
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className={GRID} aria-busy="true">
        {Array.from({ length: CATALOGUE_GRID_SIZE }, (_, i) => (
          <Card key={i} padding="none" className="motion-safe:animate-pulse">
            <div className="flex gap-3 p-4">
              {/* Shape + size mirror the real <Avatar> below (round, 52px) — a
                  rounded-SQUARE placeholder resolving into a circle is a
                  visible pop, and it was one for as long as the old skeleton
                  existed. */}
              <div className="h-[52px] w-[52px] shrink-0 rounded-full bg-ink-100" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-2/3 rounded bg-ink-100" />
                <div className="mt-2.5 h-5 w-20 rounded-pill bg-ink-100" />
                <div className="mt-2.5 h-3 w-full rounded bg-ink-100" />
              </div>
            </div>
            <div className="border-t border-ink-100 px-4 py-3">
              <div className="h-5 w-24 rounded bg-ink-100" />
            </div>
          </Card>
        ))}
      </div>
    )
  }

  /* `<Reveal stagger>` IS the grid element, not a wrapper around it: the
     cascade selector is `.reveal-stagger > *`, so the cards have to be its
     DIRECT children. Wrapping the grid instead would stagger a list of one. */
  return (
    <Reveal stagger className={GRID}>
      {items.map(e => (
        /* WHOLE-CARD LINK, and it is the whole card because there is nothing
           else on it to press. The old grid needed a stretched overlay only
           because it carried a „დაჯავშნე" anchor inside — a real <a> cannot
           wrap another one. With the button gone the card IS the link, which
           is both simpler markup and one focus stop instead of two. */
        <Card
          as={Link}
          key={e.id}
          padding="none"
          // ⚠️ NOT `interactive`, AND THAT IS THE MOTION, NOT AN OMISSION.
          // `interactive` adds `.hover-lift` — a 2px raise. The canvas lifts a
          // card 4px into a wider shadow and warms its border to brand-200, and
          // the two cannot be combined: `.hover-lift:hover` and a
          // `hover:-translate-y-*` utility have identical specificity (0-2-0),
          // so which raise wins would be decided by stylesheet emit order.
          // Written out here, all three properties move together on ONE curve.
          href={`/experts/${e.slug || e.id}`}
          className="group flex flex-col overflow-hidden
                     transition-[transform,box-shadow,border-color] duration-mid ease-out-quart
                     hover:border-brand-200 hover:shadow-card-hover motion-safe:hover:-translate-y-1
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          <div className="flex flex-1 items-start gap-3 p-4">
            {/* Shared-element pair with the profile's own avatar — the face
                morphs across the navigation rather than cutting. */}
            <span
              style={{ viewTransitionName: `vt-photo-${e.id}` }}
              className="inline-block shrink-0"
            >
              <Avatar src={e.photo ?? undefined} name={e.name} size={52} className="h-[52px] w-[52px]" />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate font-display text-body-lg font-bold tracking-tight text-ink-900 transition-colors duration-mid group-hover:text-brand-700">
                  {e.name}
                </h3>
                {e.verified && (
                  <span
                    aria-label="გადამოწმებული"
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
                  >
                    <Icon.check className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>

              {e.badge && (
                <p className="mt-1.5">
                  <span className="inline-flex h-6 items-center rounded-pill border border-ink-200 bg-ink-75 px-2 text-meta text-ink-500">
                    {e.badge}
                  </span>
                </p>
              )}

              {e.blurb && (
                <p className="mt-2 line-clamp-2 text-meta leading-[1.45] text-ink-500">{e.blurb}</p>
              )}
            </div>
          </div>

          {/* THE PRICE STRIP. Its own ground, so the number reads as the card's
              conclusion rather than as one more line of the paragraph above it. */}
          <div className="flex items-baseline gap-1.5 border-t border-ink-100 bg-gradient-to-b from-ink-75/40 to-ink-75/80 px-4 py-3">
            {e.priceLabel ? (
              <>
                <span className="font-display text-h2 font-bold tabular-nums tracking-tight text-ink-900">
                  {e.priceLabel}
                </span>
                <span className="text-meta text-ink-500">· {e.priceSuffix}</span>
              </>
            ) : (
              /* 🔒 NEVER INVENT A NUMBER. Somebody who quotes per job is working
                 normally, not leaving a blank (lib/serviceProfile → priceHint) —
                 so the strip says what actually happens next instead of
                 printing a ₾0 that would read as free. */
              <span className="text-small text-ink-500">ფასი შეთანხმებით</span>
            )}
          </div>
        </Card>
      ))}
    </Reveal>
  )
}
