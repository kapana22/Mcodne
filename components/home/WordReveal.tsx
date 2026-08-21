'use client'
import React from 'react'
import { useSiteText } from '@/components/SiteTextProvider'

/**
 * A headline line whose WORDS are typeset one after another.
 *
 * The word-level version of LineReveal, and it exists for exactly one place —
 * the home hero (approved 2026-08-01 as part of the animation pass). Same
 * mechanics: every word sits in its own `overflow-clip` mask and rises out of
 * its baseline with the shared `line-rise` keyframe, ~70ms apart, so the
 * sentence reads as being SET, not as blocks arriving. One transform per word,
 * no listeners, no layout reads.
 *
 * Takes a SiteText KEY, not children: the words must be real strings to split,
 * and resolving the admin override here (useSiteText) keeps the admin's
 * „ტექსტები" tab in charge of the copy — the animation must never freeze the
 * words it happened to ship with.
 *
 * Wrapping: masks are `inline-block`, so lines break BETWEEN words and every
 * mask keeps a box to clip against (a masked inline has none and the effect
 * silently dies — LineReveal's note).
 *
 * Reduced motion: `motion-safe:` only — the text is simply there.
 */
function WordReveal({
  k,
  delay = 0,
  step = 70,
  className = '',
}: {
  /** siteTextDefs key holding the line's copy. */
  k: string
  /** ms before the first word. */
  delay?: number
  /** ms between words. */
  step?: number
  className?: string
}) {
  const text = useSiteText(k)
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <span className={className}>
      {words.map((w, i) => (
        <React.Fragment key={`${w}-${i}`}>
          {i > 0 && ' '}
          <span className="inline-block overflow-clip align-bottom">
            <span
              className="inline-block motion-safe:animate-line-rise"
              style={{ animationDelay: `${delay + i * step}ms` }}
            >
              {w}
            </span>
          </span>
        </React.Fragment>
      ))}
    </span>
  )
}
