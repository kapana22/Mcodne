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

export function Card({
  as: Tag = 'div',
  padding = 'default',
  interactive = false,
  className = '',
  children,
  ...rest
}: {
  as?: ElementType
  padding?: Padding
  /** Adds the canon hover warm-up (lift). Use for whole-card links/buttons. */
  interactive?: boolean
  className?: string
  children?: ReactNode
  [prop: string]: any
}) {
  return (
    <Tag
      className={`rounded-card border border-ink-200 bg-white ${PAD[padding]} ${interactive ? 'hover-lift transition-shadow duration-fast' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
