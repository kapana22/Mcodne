// EmptyState — shared "nothing here yet" card. Rounded card, brand-accented
// icon medallion with subtle glow, Georgian copy, and an optional CTA.
//   default — solid white card with dashed border (used for search results,
//             inbox, session lists)
//   inline  — flush inside an existing panel (no outer border/background)

import type { ReactNode, MouseEventHandler } from 'react'
import Link from 'next/link'

type Cta = {
  label: string
  href?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
}

type Props = {
  icon?: ReactNode
  title: string
  description?: ReactNode
  cta?: Cta
  variant?: 'default' | 'inline'
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
  variant = 'default',
  className = '',
}: Props) {
  const shell =
    variant === 'inline'
      ? 'py-10 text-center motion-safe:animate-fade-in'
      : 'py-12 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white motion-safe:animate-fade-in'

  const ctaCls =
    'mt-5 h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 shadow-xs hover:shadow-brand-glow transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2'

  return (
    <div className={`${shell} ${className}`}>
      {icon && (
        <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 text-brand-600 mb-4 motion-safe:animate-scale-in">
          <span aria-hidden className="absolute inset-0 rounded-full bg-brand-500/10 motion-safe:animate-pulse-soft" />
          <span className="relative">{icon}</span>
        </div>
      )}
      <div className="font-display text-[15.5px] font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>
        {title}
      </div>
      {description && (
        <p
          className="text-[12.5px] text-ink-500 mt-1.5 max-w-[420px] mx-auto leading-relaxed motion-safe:animate-rise-in"
          style={{ animationDelay: '120ms' }}
        >
          {description}
        </p>
      )}
      {cta && (cta.href
        ? <Link href={cta.href} className={ctaCls}>{cta.label}</Link>
        : <button type="button" onClick={cta.onClick} className={ctaCls}>{cta.label}</button>
      )}
    </div>
  )
}
