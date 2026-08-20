'use client'
import React from 'react'
// next-view-transitions' Link is a drop-in for next/link that runs the
// navigation inside document.startViewTransition — this is what animates
// the card→profile morph. Unsupported browsers get plain navigation.
import { Link } from 'next-view-transitions'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'

/**
 * The experts, as cards — the homepage's main section.
 *
 * HISTORY, so nobody re-litigates it: this slot held a card grid, was replaced
 * on 2026-07-31 by a numbered index of QUESTIONS (to stop the page leaning on a
 * nine-person roster), and the user reverted it the same day — with the reason
 * that matters more than the theory: **a visitor understands what this site IS
 * faster from six faces with prices and a booking button than from four
 * sentences.** They are right. The questions taught what was askable; the cards
 * show what you get. On a marketplace the second wins.
 *
 * What survives from that detour, because it was never about the format:
 *  - ONLY facts that exist. No „0 სესია", no „★ 0.0", no „ახალი ექსპერტი"
 *    stamped where a number should be. If an expert has nothing yet, the row of
 *    stats simply isn't rendered.
 *  - The FLAGSHIP duration (longest paid tier), never the profile default —
 *    every card used to read „30 წთ" while the real offer is an hour.
 *  - <Avatar>, never a raw <img>: three of nine have an avatarUrl that is
 *    present but unusable, and a raw img renders a broken-image glyph.
 */

export type GridExpert = {
  id?: string
  /** Expert URL slug — used for hrefs so the 308 cuid→slug redirect never
      downgrades the navigation to a full load (it kills the photo morph). */
  urlSlug?: string | null
  /** Category slug — the home rail filters on this. */
  slug?: string
  name: string
  cat: string
  headline: string
  price: number
  priceLabel: string
  /** The half-line after the price — „60-წუთიანი სესია" or „სერვისი". A job has
   *  no clock, so this is a STRING and not a number of minutes; see
   *  components/booking/slots → HeadlineOffer. */
  priceSuffix: string
  photo: string
  rate: number
  reviews: number
  sessions: number
  yearsExp?: number
  verified?: boolean
}

function Facts({ e }: { e: GridExpert }) {
  const bits: React.ReactNode[] = []
  if (e.rate > 0 && e.reviews > 0) bits.push(
    <span key="r" className="inline-flex items-center gap-1 text-ink-800">
      <Icon.star className="w-3.5 h-3.5 text-warning-500" />
      <span className="font-display font-bold tabular-nums">{e.rate.toFixed(1)}</span>
      <span className="text-ink-400 tabular-nums">({e.reviews})</span>
    </span>)
  if (e.sessions > 0) bits.push(
    <span key="s" className="text-ink-600"><span className="font-display font-semibold text-ink-800 tabular-nums">{e.sessions}</span> სესია</span>)
  if (bits.length === 0 && e.yearsExp && e.yearsExp > 0) bits.push(
    <span key="y" className="text-ink-600"><span className="font-display font-semibold text-ink-800 tabular-nums">{e.yearsExp}</span> წლის გამოცდილება</span>)
  if (bits.length === 0) return null
  return (
    <div className="mt-3 flex items-center gap-3 text-meta flex-wrap">
      {bits.map((b, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden className="w-px h-3.5 bg-ink-200" />}
          {b}
        </React.Fragment>
      ))}
    </div>
  )
}

export function ExpertGrid({ experts, loading }: { experts: GridExpert[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5" aria-busy="true">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-[20px] border border-ink-200 bg-white p-5 motion-safe:animate-pulse">
            {/* Shape + size must mirror the real <Avatar> below (round, 96px) —
                a rounded-SQUARE placeholder that resolves into a circle is a
                visible pop, and it was one for as long as this skeleton existed. */}
            <div className="w-24 h-24 rounded-full bg-ink-100" />
            <div className="mt-4 h-4 w-2/3 bg-ink-100 rounded" />
            <div className="mt-2 h-3 w-full bg-ink-100 rounded" />
            <div className="mt-6 h-11 bg-ink-100 rounded-btn" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
      {experts.map((e, i) => (
        <article
          key={e.id ?? i}
          className="group relative rounded-[20px] border border-ink-200 bg-white overflow-hidden hover-lift transition-[border-color,box-shadow] duration-mid hover:border-brand-200 hover:shadow-card flex flex-col"
        >
          {/* The card's one accent — and the only thing that says at a glance
              this is OUR card and not a generic profile tile. Draws itself in
              on hover, matching the rules on the rest of the page. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-brand-500 via-brand-400 to-brand-500/0 transition-transform duration-slow ease-out-quart group-hover:scale-x-100"
          />

          {/* WHOLE-CARD LINK (2026-08-02). The card already behaved like one —
              it lifts, its border warms, the name turns brand — but only the
              „დაჯავშნე" button navigated, so a click on the face or the name
              did nothing. A stretched overlay (`absolute inset-0`) is the fix
              that keeps the markup legal: a real <a> cannot wrap the CTA <a>,
              so the overlay is a SIBLING under the content and the CTA sits
              above it on `relative z-10`. The overlay goes to the profile; the
              CTA keeps ?rebook=1. Both are next-view-transitions Links, so the
              photo morph works whichever one is clicked. */}
          {e.id && (
            <Link
              href={`/experts/${e.urlSlug || e.id}`}
              aria-label={`${e.name} — პროფილი`}
              className="absolute inset-0 z-10 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            />
          )}

          <div className="p-5 flex-1">
            {/* A plain circle — the shape every avatar on this site already
                uses (browse cards, hero stack, profile, chat). Forcing
                `!rounded-card` here made the OUTER span a rounded square while
                Avatar's own clip stayed `rounded-full ring-2 ring-white`
                inside it: two frames around one face, and a shape that
                appeared nowhere else on the site. Avatar owns its ring; adding
                a second one is what produced the double outline. */}
            {/* Same shared-element pair as the browse card — the home avatar
                morphs into the profile avatar on navigation. */}
            <span style={e.id ? { viewTransitionName: `vt-photo-${e.id}` } : undefined} className="inline-block">
              {/* 80 → 96 (2026-08-05): the photo is what the card is actually
                  selling, and it was the smallest element in a 5-line stack. */}
              <Avatar src={e.photo} name={e.name} size={96} className="w-24 h-24" />
            </span>
            <div className="mt-4 flex items-center gap-1.5">
              <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight truncate transition-colors duration-mid group-hover:text-brand-700">
                {e.name}
              </h3>
              {e.verified && (
                <span aria-label="გადამოწმებული" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-600 text-white shrink-0">
                  <Icon.check className="w-2.5 h-2.5" />
                </span>
              )}
            </div>
            {e.headline && (
              <p className="mt-1.5 text-small text-ink-600 leading-snug line-clamp-2">{e.headline}</p>
            )}
            {/* `cat` is '' for an expert with no category (the mappers no
                longer fall back to their free-text `specialty`) — the row goes
                away rather than reserving space for nothing. */}
            {e.cat && <div className="mt-1.5 text-meta text-ink-500">{e.cat}</div>}
            <Facts e={e} />
          </div>

          <div className="px-5 pb-5 pt-4 border-t border-ink-200 flex items-end justify-between gap-3">
            <div>
              <span className="block font-display text-h2 font-bold text-ink-900 tabular-nums tracking-tight leading-none">{e.priceLabel}</span>
              <span className="mt-1 block text-meta text-ink-500 tabular-nums">{e.priceSuffix}</span>
            </div>
            {/* ?rebook=1 opens the booking flow on arrival, so the label is
                honest — it books, it does not merely view. */}
            <Link
              href={e.id ? `/experts/${e.urlSlug || e.id}?rebook=1` : '/experts'}
              // z-20: above the whole-card overlay, so „დაჯავშნე" still books.
              className="relative z-20 shrink-0 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 motion-safe:active:scale-[0.97] transition-all duration-fast"
            >
              დაჯავშნე
            </Link>
          </div>
        </article>
      ))}
    </div>
  )
}
