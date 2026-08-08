import type { ReactNode, ElementType } from 'react'

/* The one eyebrow/section-label. Locks the canon values (text-micro = 11px,
   semibold, uppercase) so the 190+ hand-rolled spans across the app (which
   drifted across 10 different tracking values) converge to one.
   TRACKING IS DELIBERATELY NOT SET HERE: the single source is globals.css's
   `[class*="uppercase"] { letter-spacing: 0.14em }` rule, which wins the
   cascade over ANY `tracking-*` utility on an uppercase element (same
   specificity, later in source order). A tracking utility here would be dead
   code — this component carried `tracking-[0.18em]` for weeks while the site
   rendered 0.14em. Retune tracking in globals.css, never here.
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
    <Tag className={`font-display text-micro font-semibold uppercase ${color} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
