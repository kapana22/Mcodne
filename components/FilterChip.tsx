import type { ReactNode } from 'react'

/* The pill filter chip — a tappable refinement in a horizontal rail (the /experts
   category rail below `lg`). h-11 because it is INTERACTIVE: the canon's tap
   floor is 40px, and the h-5/6/7/8 chip tiers are for inert badges only.
   On = brand hairline + wash; off = ink hairline on white. `shrink-0` so a
   scrolling rail never squeezes a label — the rail scrolls instead. */
export function FilterChip({
  on,
  onClick,
  className = '',
  children,
  ...rest
}: {
  on: boolean
  onClick: () => void
  className?: string
  children: ReactNode
  [prop: string]: any
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-11 px-3.5 rounded-pill border font-display text-small font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast ${on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-700'} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
