'use client'
import { useEffect, useRef, type RefObject } from 'react'

/**
 * „The content under you just changed — come and look at it."
 *
 * WHY. Reported on /experts and reproduced: scrolled to the bottom of a list,
 * tapping a category chip swapped every card underneath while the viewport
 * stayed put. From where the reader was sitting the control simply did nothing.
 * The same shape exists on every surface where a tab or filter REPLACES a list
 * rather than appending to it — bookings buckets, the notification filter, the
 * discover chips. Today's accounts have too little data for it to show; a user
 * with forty bookings would hit it on the first tap.
 *
 * THE RULE THIS ENCODES — it is one-way:
 *   • if the reader is BELOW the top of the list, pull them up to it
 *   • if they are ABOVE it (still choosing filters), do nothing
 * Pushing someone DOWN mid-decision is its own bug, and it is the reason this
 * is not simply `scrollTo(0, 0)`.
 *
 * Skips the first run, so arriving on a page never yanks the viewport.
 *
 * NOT for „load more" / infinite append — there the content grows below and the
 * reader's position is already correct.
 */
export function useScrollIntoResults(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[],
  /** Extra clearance above the anchor, e.g. for a sticky header. */
  offset = 12,
) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    if (window.scrollY > top + 4) {
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
