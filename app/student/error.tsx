'use client'
// Route-level error boundary for the student area (Next.js contract: must be
// a client component receiving { error, reset }). Without it, a render-time
// throw in any /student page took down the whole tree with the default
// unstyled crash screen. Compact per canon: icon + one line + one action.

import { useEffect } from 'react'
import { reportClientError } from '@/lib/reportError'

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError('render', error.message, error.stack, error.digest)
  }, [error])
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[420px] py-12 px-6 text-center rounded-card border border-ink-200 bg-white">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ink-100 text-ink-500 mb-4">
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M12 3 2 21h20L12 3Z" />
            <path d="M12 10v5M12 18h0" />
          </svg>
        </div>
        <div className="font-display text-[15.5px] font-bold text-ink-900 tracking-tight">რაღაც აირია</div>
        <p className="text-[12.5px] text-ink-500 mt-1.5">გვერდის ჩატვირთვა ვერ მოხერხდა — სცადე თავიდან.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        >
          სცადე თავიდან
        </button>
      </div>
    </div>
  )
}
