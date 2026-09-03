'use client'
import React from 'react'
// next-view-transitions' Link is a drop-in for next/link that runs the
// navigation inside document.startViewTransition — this is what animates
// the card→profile morph. Unsupported browsers get plain navigation.
import { Link } from 'next-view-transitions'
import { Avatar } from '@/components/Avatar'
import { Reveal } from '@/components/Reveal'
import { Icon } from '@/components/Icon'

/**
 * ONE CARD FOR THE WHOLE CATALOGUE — the home page's „ან პირდაპირ აირჩიე".
 *
 * ⚠️ IT REPLACES `components/home/ExpertGrid` (2026-08-21). That component was
 * expert-shaped by its type as well as its layout — `rate`, `reviews`,
 * `sessions`, a „დაჯავშნე" button — so a PROVIDER could not appear in it at
 * all, and the home page's roster silently showed only the consulting half of a
 * catalogue the canon says is one list („One catalogue, one card, one
 * namespace").
 *
 * ⚠️ RE-CUT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
 * რედიზაინი" → Home). Four things moved, and each is a fact the card could not
 * carry before:
 *
 *   · THE FACE IS 64px AND ITS SHAPE IS THE IDENTITY. A person is a circle, a
 *     firm is a rounded square (components/Avatar → `shape`). That distinction
 *     was in the data (`isCompany`) and on the /experts card, and missing here.
 *   · THE PRICE MOVED OFF ITS OWN STRIP and onto the card's foot rule, beside
 *     the one word that says what the click does. The strip was a second plate
 *     on a card that is already a plate on paper.
 *   · A REPLY CHIP, and it is MEASURED (lib/responseStats). The canvas prints
 *     „პასუხობს 2 საათში" on every card; that number does not exist as a stored
 *     column, so it is derived from the offer journal and printed only above
 *     `MIN_RESPONSE_SAMPLE`. 🔒 Most cards will show nothing here for a while,
 *     and that is the correct look for a young marketplace.
 *   · NO PLACEHOLDER STATE. The canvas has „ახალი პროფილი" where the reply chip
 *     would be. It reads as a warning label on the newest people on the site —
 *     the ones who most need the first job — so an unmeasured card simply omits
 *     the row.
 *
 * What survives, because it was never about the format: ONLY facts that exist —
 * no „0 სესია", no „★ 0.0", and 🔒 never a price somebody did not name.
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
  /** „თბილისი" — where they work. Empty when they named no city. */
  area: string
  /** One line in their own words. Empty is fine — the row goes away. */
  blurb: string
  /** „₾64-დან" — already formatted by the caller, or null for „ask". */
  priceLabel: string | null
  /** The half-line after the price — „სერვისი". */
  priceSuffix: string
  photo: string | null
  verified?: boolean
  /** A firm, not a person — decides the face's shape. */
  isCompany?: boolean
  /** „პასუხობს ~2 საათში", MEASURED, or null. See lib/responseStats. */
  reply?: string | null
}

/** Six is the grid: 3×2 on desktop, 2×3 on tablet, a single column on a phone. */
const CATALOGUE_GRID_SIZE = 6

const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

const SHELL =
  'flex flex-col gap-4 rounded-card border border-ink-100 bg-white p-5'

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
          <div key={i} className={`${SHELL} motion-safe:animate-pulse`}>
            <div className="flex items-center gap-3.5">
              {/* Shape + size mirror the real <Avatar> below (round, 64px) — a
                  rounded-SQUARE placeholder resolving into a circle is a
                  visible pop, and it was one for as long as the old skeleton
                  existed. */}
              <div className="h-16 w-16 shrink-0 rounded-full bg-ink-100" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-2/3 rounded bg-ink-100" />
                <div className="mt-2.5 h-3 w-24 rounded bg-ink-100" />
              </div>
            </div>
            <div className="h-3.5 w-full rounded bg-ink-100" />
            <div className="mt-auto border-t border-ink-100 pt-3.5">
              <div className="h-5 w-24 rounded bg-ink-100" />
            </div>
          </div>
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
           else on it to press. With no button inside, the card IS the link —
           simpler markup and one focus stop instead of two. */
        <Link
          key={e.id}
          href={`/experts/${e.slug || e.id}`}
          className={`group ${SHELL}
                     transition-[transform,box-shadow,border-color] duration-mid ease-out-quart
                     hover:border-brand-200 hover:shadow-card-hover motion-safe:hover:-translate-y-1
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2`}
        >
          <div className="flex items-center gap-3.5">
            {/* Shared-element pair with the profile's own avatar — the face
                morphs across the navigation rather than cutting. */}
            <span
              style={{ viewTransitionName: `vt-photo-${e.id}` }}
              className="inline-block shrink-0"
            >
              <Avatar
                src={e.photo ?? undefined}
                name={e.name}
                size={64}
                shape={e.isCompany ? 'card' : 'circle'}
                className="h-16 w-16"
              />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <h3 className="truncate font-display text-body-lg font-bold tracking-[-0.01em] text-ink-900 transition-colors duration-mid group-hover:text-brand-700">
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
              </span>
              {/* „ბუღალტერი · თბილისი" — what they do and where, in one quiet
                  line. The canvas's card carries both; the old one carried the
                  first inside a bordered chip, which gave a label the weight of
                  a control. */}
              {(e.badge || e.area) && (
                <span className="mt-0.5 block truncate text-meta text-ink-500">
                  {[e.badge, e.area].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </div>

          {e.blurb && (
            <p className="line-clamp-2 text-small leading-[1.55] text-ink-600">{e.blurb}</p>
          )}

          {/* 🔒 MEASURED OR ABSENT — see the header. */}
          {e.reply && (
            <span className="inline-flex h-[26px] shrink-0 items-center self-start rounded-pill border border-brand-100 bg-brand-50 px-2.5 text-meta font-semibold text-brand-700">
              {e.reply}
            </span>
          )}

          <span className="mt-auto flex flex-wrap items-baseline justify-between gap-3 border-t border-ink-100 pt-3.5">
            {e.priceLabel ? (
              <span className="font-display text-h3 font-extrabold tabular-nums tracking-[-0.01em] text-ink-900">
                {e.priceLabel}
                <span className="ml-1.5 text-meta font-normal text-ink-500">· {e.priceSuffix}</span>
              </span>
            ) : (
              /* 🔒 NEVER INVENT A NUMBER. Somebody who quotes per job is working
                 normally, not leaving a blank (lib/serviceProfile → priceHint) —
                 so the line says what actually happens next instead of printing
                 a ₾0 that would read as free. */
              <span className="text-small text-ink-500">ფასი შეთანხმებით</span>
            )}
            <span className="font-display text-meta font-semibold text-brand-700">პროფილი</span>
          </span>
        </Link>
      ))}
    </Reveal>
  )
}
