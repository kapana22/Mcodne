'use client'
// The home page's SERVICE RAIL — one slow, continuous pass of what is actually
// on sale, under the hero.
//
// ⚠️ WHY A RAIL AND NOT A CAROUSEL, because the difference is the whole point.
// A carousel SWAPS content on a timer: NN/g's work on them is blunt — auto
// advancing draws banner blindness and almost nobody sees past the first slide,
// so two thirds of what you put in it is shown to nobody. A rail hides nothing.
// Every card is on screen and reachable; the track simply drifts, and the
// reader's eye takes what it wants at the speed it wants.
//
// It is also the one piece of PERIPHERAL motion this page has. That is what
// separates a page that feels alive from one that feels animated at: 38 seconds
// for a full pass is slow enough that it never pulls the eye off a sentence,
// present enough that the page is never dead. Owner, 2026-08-20, on the
// entrance-only draft that preceded it: „ძალიან მოძველებული დიზაინი".
//
// ⚠️ THE TRACK HOLDS THE LIST TWICE. `.marquee-track` translates -50%, so the
// second copy is exactly where the first was when the cycle restarts — that is
// what makes the seam invisible. Halve the list and the rail jumps.
//
// ⚠️ PAUSES ON HOVER. Motion under a cursor that is trying to read a price is
// the one place a rail becomes hostile, and it is also where somebody has
// decided to look. The whole track stops while a pointer is on it.
//
// It shows the SERVICE side first (a job with a price) and falls back to the
// bookable half — CLAUDE.md rule 4: wherever both appear, the service is first.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Container } from '@/components/Container'
import { Card } from '@/components/Card'
import { primaryPriceLabel, offerPriceLabel, SERVICE_SUFFIX } from '@/components/booking/slots'

/** How many cards one pass carries. Twelve is two full screens at 390px and
 *  three at 1440 — enough that the rail never looks like a short loop, few
 *  enough that the DOM cost stays at two dozen nodes. */
const RAIL_MAX = 12

type RailItem = { id: string; slug: string | null; name: string; cat: string; priceLabel: string; priceSuffix: string }

export function ServiceRail() {
  // ⚠️ IT FETCHES ITS OWN LIST, and that is deliberate rather than lazy: the
  // home shell holds no expert state (every section that needs one fetches it),
  // so threading a prop through HomeClient would put a piece of this rail's
  // model two files away from it. Same endpoint and same resolver the grid
  // below uses — one price for one expert, everywhere.
  const [experts, setExperts] = useState<RailItem[] | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/tutors?limit=24')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        setExperts(rows.map(t => {
          const tiers = Array.isArray(t?.consultations) ? t.consultations : []
          const offer = primaryPriceLabel(tiers, t?.price ?? 80, t?.consultationDurationMin ?? 60)
          return {
            id: t?.id ?? '',
            slug: t?.slug ?? null,
            name: t?.user?.fullName ?? '',
            cat: t?.category?.name ?? '',
            priceLabel: offerPriceLabel(offer),
            priceSuffix: offer.isService ? SERVICE_SUFFIX : `${offer.minutes} წთ`,
          }
        }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Nothing loaded yet, or nothing priced: draw NOTHING. An empty rail is a
  // moving grey bar, which reads as broken rather than as loading — and the
  // hero above it already stands on its own.
  const items = (experts ?? []).filter(e => e.priceLabel && e.name).slice(0, RAIL_MAX)
  if (items.length < 4) return null

  // The list twice — see the note above. `key` carries the pass so React does
  // not reconcile the two copies into one.
  const track = [...items, ...items]

  return (
    <div className="relative border-b border-ink-100 bg-ink-75/40 overflow-hidden group">
      {/* The edges fade into the section colour rather than cutting the cards
          off at a hard line — the seam is the one thing that gives a rail away. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-16 sm:w-24 z-10 pointer-events-none
                   bg-gradient-to-r from-ink-75 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-16 sm:w-24 z-10 pointer-events-none
                   bg-gradient-to-l from-ink-75 to-transparent"
      />

      <Container className="py-4">
        <div className="marquee-track gap-3 group-hover:[animation-play-state:paused]">
          {track.map((e, i) => (
            /* `Card as={Link}` rather than a hand-built shell: it spreads the
               rest of the props through, so the href and the a11y attributes
               reach the anchor while the border, radius and background stay the
               one definition every card on the site shares. */
            <Card
              as={Link}
              key={`${e.id ?? e.name}-${i}`}
              padding="none"
              href={`/experts/${e.slug || e.id}`}
              // aria-hidden on the SECOND copy: it is the same twelve cards
              // again, and a screen reader that reads them twice is reading a
              // rendering trick out loud.
              aria-hidden={i >= items.length}
              tabIndex={i >= items.length ? -1 : undefined}
              className="shrink-0 w-[248px] px-4 py-3 hover:border-brand-300 transition-colors duration-fast"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  aria-hidden
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block font-display text-small font-bold text-ink-900 truncate">{e.name}</span>
                  {e.cat && <span className="block text-meta text-ink-500 truncate">{e.cat}</span>}
                </span>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-ink-100 flex items-baseline gap-1.5">
                <span className="font-display text-body-lg font-bold text-ink-900 tabular-nums tracking-tight">
                  {e.priceLabel}
                </span>
                <span className="text-meta text-ink-500">· {e.priceSuffix}</span>
              </div>
            </Card>
          ))}
        </div>
      </Container>
    </div>
  )
}
