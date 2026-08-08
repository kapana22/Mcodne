import React from 'react'

/**
 * An oversized Georgian letterform, outlined, bleeding off the edge of the hero.
 *
 * WHY THIS AND NOT AN ILLUSTRATION. The homepage read as "any marketplace in any
 * country" — the layout, the cards and the icons could belong to a US freelance
 * site. The one asset that is ours and no one else's is the script: mkhedruli.
 * Nobody in this market designs *with* the letterform, and it costs no data, no
 * imagery budget and no runtime — it is a glyph in a font we already ship.
 *
 * Outlined, not filled, and at ~4% opacity: it must read as paper texture behind
 * the headline, never as a second thing to read. `aria-hidden` + `select-none`
 * because it carries no meaning — it is the page's watermark.
 *
 * Desktop only. At 390px there is no margin to bleed into; the same glyph would
 * sit under the headline and fight it.
 */
export function GlyphBackdrop({
  char = 'მ',
  className = '',
}: {
  /** Single mkhedruli letter. „მ" — the initial of მცოდნე. */
  char?: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none select-none absolute hidden lg:block font-display font-bold leading-[0.75] ${className}`}
      style={{
        // Stroke, no fill. A filled glyph at any opacity turns into a grey
        // shape; the outline stays a drawing.
        WebkitTextStroke: '1.5px rgba(47, 156, 134, 0.13)',
        color: 'transparent',
      }}
    >
      {char}
    </span>
  )
}
