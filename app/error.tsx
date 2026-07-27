'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { reportClientError } from '@/lib/reportError'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

// Per-segment error boundary. Renders whenever any client-side page throws.
// Reset re-mounts the segment, preserving parent layout state.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Page error boundary caught:', error)
    reportClientError('render', error.message, error.stack, error.digest)
  }, [error])

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 bg-ink-50 overflow-hidden">
      {/* Soft halo behind content. Same recipe as globals.css `.glow-brand` — a
          radial gradient, never `blur-3xl` (Safari renders large blur() filters
          as a hard-edged square stain) — but on the danger hue, which has no
          named utility; the color still comes from the palette, not a raw hex. */}
      <span aria-hidden className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[560px] h-[560px] bg-[radial-gradient(closest-side,theme(colors.danger.500/10%),transparent)] pointer-events-none" />

      <div className="relative max-w-[520px] w-full text-center">
        <div className="font-display font-bold tabular-nums leading-none tracking-[-0.03em] text-[120px] sm:text-[160px] bg-danger-500 bg-clip-text text-transparent motion-safe:animate-scale-in">
          500
        </div>

        <h1 className="mt-2 font-display text-[24px] sm:text-[28px] font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '80ms' }}>
          დროებითი ხარვეზი
        </h1>
        <p className="mt-3 text-[14px] text-ink-600 leading-relaxed max-w-[420px] mx-auto motion-safe:animate-rise-in" style={{ animationDelay: '140ms' }}>
          ჩვენს მხარეს რაღაც ხარვეზი მოხდა. ცოტა ხანში სცადე თავიდან, ან დაუბრუნდი მთავარს.
        </p>
        {error.digest && (
          <p className="mt-4 inline-block font-mono text-[11px] text-ink-500 bg-ink-100 px-2.5 py-1 rounded-btn motion-safe:animate-fade-in" style={{ animationDelay: '200ms' }}>
            ID: {error.digest}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2 motion-safe:animate-rise-in" style={{ animationDelay: '260ms' }}>
          <button
            type="button"
            onClick={reset}
            className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] tracking-tight inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast"
          >
            თავიდან ცდა
          </button>
          <Link
            href="/"
            className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-100 text-ink-800 font-display font-semibold text-[13.5px] tracking-tight inline-flex items-center transition-colors duration-fast"
          >
            მთავარი
          </Link>
        </div>

        <div className="mt-8 text-[12.5px] text-ink-500 motion-safe:animate-fade-in" style={{ animationDelay: '340ms' }}>
          თუ პრობლემა გრძელდება — {' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2">
            მოგვწერე
          </a>
        </div>
      </div>
    </main>
  )
}
