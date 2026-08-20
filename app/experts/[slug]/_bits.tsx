'use client'
// /experts/[slug] — the small visual atoms shared across the profile:
// verified mark, star row, the round photo, a certificate thumbnail.

import { useState, useEffect } from 'react'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Icon } from '@/components/Icon'

// Canon: ONE icon source (components/Icon) — the check used to be a page-local
// svg. The glyph never drops below the 12px icon floor, even on the compact
// 16px badge the certificate chips use.
export const VerifiedMark = ({ size = 20, title = 'გადამოწმებული ექსპერტი' }: { size?: number; title?: string }) => {
  const glyph = Math.max(12, Math.round(size * 0.6))
  return (
    <span title={title} className="inline-flex items-center justify-center rounded-full bg-brand-600 text-white shrink-0" style={{ width: size, height: size }}>
      <Icon.check style={{ width: glyph, height: glyph }} />
    </span>
  )
}

export const Stars = ({ n }: { n: number }) => (
  <div className="inline-flex items-center gap-0.5 group">
    {Array.from({ length: 5 }).map((_, i) => (
      <Icon.star
        key={i}
        className={`w-3.5 h-3.5 transition-all duration-fast ${
          i < n
            ? 'text-warning-500 group-hover:drop-shadow-[0_0_6px_rgba(197,151,47,0.4)] group-hover:scale-110'
            : 'text-ink-200'
        }`}
        style={{ transitionDelay: `${i * 30}ms` }}
      />
    ))}
  </div>
)

/**
 * A certificate thumbnail that degrades instead of breaking. `hasFile` says a
 * row HAS bytes, not that they are still fetchable, so a stored-then-lost scan
 * rendered the browser's broken-image glyph inside a trust section. On failure
 * we fall back to the neutral document mark — the card stays, the frame stays,
 * only the promise of a preview is withdrawn.
 */
/**
 * Profile portrait with a state-backed fallback — the identity-header twin of
 * <ExpertPhoto> on the browse card. See the note at its call site for why the
 * fallback cannot be a DOM write inside `onError`.
 */
export const ProfilePhoto = ({ src, name }: { src?: string | null; name: string }) => {
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  const shown = !src || failed ? DEFAULT_AVATAR : src
  const real = !!src && !failed

  // Esc closes, and the page behind must not scroll under the overlay.
  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [zoom])

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shown}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  )

  // Only a REAL photo is worth opening. The placeholder silhouette enlarges to
  // nothing, and a control that does nothing is worse than no control.
  if (!real) return img

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label={`${name} — ფოტოს გადიდება`}
        className="block rounded-full overflow-hidden cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {img}
      </button>
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setZoom(false)}
          // z-sheet, not a hand-written number: this is a page-level modal and
          // must sit under a destructive confirm and a toast (see the stacking
          // order in CLAUDE.md).
          className="fixed inset-0 z-sheet bg-ink-900/85 p-6 flex items-center justify-center motion-safe:animate-fade-in-fast cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shown}
            alt={name}
            onClick={e => e.stopPropagation()}
            className="max-w-[min(680px,92vw)] max-h-[86dvh] w-auto h-auto object-contain rounded-card shadow-float cursor-default"
          />
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="დახურვა"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/95 text-ink-800 hover:bg-white inline-flex items-center justify-center shadow-sm transition-colors duration-fast"
          >
            <Icon.close className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  )
}

export const CertThumb = ({ src, alt }: { src: string; alt: string }) => {
  const [failed, setFailed] = useState(false)
  if (failed) return <Icon.doc className="w-7 h-7 text-ink-300" />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  )
}