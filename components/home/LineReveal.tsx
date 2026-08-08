import React from 'react'

/**
 * A headline line that rises out of its own baseline.
 *
 * The page's entrances were all `fade` or `rise` on whole blocks — the same
 * motion every SaaS template ships. A MASKED line reads differently: the text
 * appears to be uncovered rather than flown in, which is the one motion that
 * looks like typesetting instead of animation. It is also the cheapest possible
 * effect — one transform on one element, no scroll listener, no layout read.
 *
 * The mask is `overflow: clip` on the outer span, so the inner span can start
 * fully below its own box. Each line takes its own `delay`, which is what makes
 * a two-line headline read as one sentence being set rather than two blocks
 * arriving.
 *
 * `inline-block` on both halves, because a masked INLINE element has no box to
 * clip against and the effect silently does nothing.
 *
 * Reduced motion: the animation is `motion-safe:` only, so the text is simply
 * there — no opacity trick that could leave it invisible if a class is dropped.
 */
export function LineReveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  /** ms. Stagger sibling lines by ~90ms — enough to read as a sequence. */
  delay?: number
  className?: string
}) {
  return (
    <span className={`inline-block overflow-clip align-bottom ${className}`}>
      <span
        className="inline-block motion-safe:animate-line-rise"
        style={{ animationDelay: `${delay}ms` }}
      >
        {children}
      </span>
    </span>
  )
}
