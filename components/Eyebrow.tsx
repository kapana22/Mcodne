import type { ReactNode, ElementType } from 'react'

/* The one eyebrow/section-label. Locks the canon values (10.5px, semibold,
   uppercase, tracking-0.18em) so the 190+ hand-rolled spans across the app
   (which drifted across 10 different tracking values) converge to one.
   `as` lets inline eyebrows stay inline (<span>) — the default block <div>
   would break eyebrows that sit inside a flex row or next to other inline text.
   Extra props (id, aria-*, …) pass through to the element. */
export function Eyebrow({
  as: Tag = 'div',
  tone = 'brand',
  className = '',
  children,
  ...rest
}: {
  as?: ElementType
  tone?: 'brand' | 'muted' | 'onDark'
  className?: string
  children: ReactNode
  [prop: string]: any
}) {
  const color = tone === 'onDark' ? 'text-white/55' : tone === 'muted' ? 'text-ink-500' : 'text-brand-700'
  return (
    <Tag className={`font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] ${color} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
