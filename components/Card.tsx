import type { ReactNode, ElementType } from 'react'

// The one card surface. Retires the 187 hand-rolled `rounded-card border
// border-ink-200 bg-white …` shells whose padding ranged p-1…p-14 with no
// system — the direct cause of "dense here, loose there". Padding is one of
// four canon tiers; `interactive` adds the standard hover warm-up.
type Padding = 'none' | 'compact' | 'default' | 'section'

const PAD: Record<Padding, string> = {
  none:    '',
  compact: 'p-4',            // dense lists / rows
  default: 'p-5 sm:p-6',     // the canon default
  section: 'p-6 sm:p-8',     // hero / section cards
}

/**
 * ⚠️ THE EDGE IS A PROP AND NOT A `className` (added 2026-08-31, for the
 * owner's design canvas). A caller CANNOT override the border colour from
 * `className`: `border-ink-100` and `border-ink-200` are the same CSS property
 * and Tailwind resolves them by ITS emit order (ascending scale), so the base
 * class wins no matter which one you write last. The same trap the header of
 * tests/designTokens §F describes for font sizes.
 *
 * `hairline` is the canvas's card border (#EFEAE0 ≈ ink-100). It exists because
 * the ground became cream (#FBF9F5): a white card is now visibly LIFTED off the
 * paper and no longer needs a border to be a card, so the border went one step
 * quieter. `default` (ink-200) is untouched and stays the default — the site
 * has ~200 cards drawn against the old assumption and moving them all is a
 * separate decision, not a side effect of this prop existing.
 */
type Edge = 'default' | 'hairline'

const EDGE: Record<Edge, string> = {
  default:  'border-ink-200',
  hairline: 'border-ink-100',
}

export function Card({
  as: Tag = 'div',
  padding = 'default',
  edge = 'default',
  interactive = false,
  className = '',
  children,
  ...rest
}: {
  as?: ElementType
  padding?: Padding
  edge?: Edge
  /** Adds the canon hover warm-up (lift). Use for whole-card links/buttons. */
  interactive?: boolean
  className?: string
  children?: ReactNode
  [prop: string]: any
}) {
  return (
    <Tag
      className={`rounded-card border ${EDGE[edge]} bg-white ${PAD[padding]} ${interactive ? 'hover-lift transition-shadow duration-fast' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
