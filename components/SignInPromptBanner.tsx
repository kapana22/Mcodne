'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

// Soft inline "you need to sign in" banner. Used in place of a hard redirect
// when an anonymous visitor first touches an auth-required action (book /
// favorite / message). The API 401 → redirect path stays unchanged.

export function SignInPromptBanner({
  onDismiss,
  className = '',
}: {
  onDismiss?: () => void
  className?: string
}) {
  const pathname = usePathname()
  const params = useSearchParams()

  const here = React.useMemo(() => {
    const qs = params?.toString()
    const p = pathname || '/'
    return qs ? `${p}?${qs}` : p
  }, [pathname, params])
  const enc = encodeURIComponent(here)

  return (
    <div
      role="status"
      aria-live="polite"
      className={`bg-brand-50 border border-brand-200 rounded-card p-4 text-brand-900 flex flex-wrap items-center gap-x-3 gap-y-2 motion-safe:transition-opacity motion-safe:duration-fast ${className}`}
    >
      <span className="font-display text-body font-semibold tracking-tight">
        შედი რომ დაიჯავშნო
      </span>
      <span className="text-brand-400" aria-hidden="true">·</span>
      <Link
        href={`/signin?redirect=${enc}`}
        className="font-display text-small font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300"
      >
        შესვლა
      </Link>
      <span className="text-brand-400" aria-hidden="true">·</span>
      <Link
        href={`/signup?redirect=${enc}`}
        className="font-display text-small font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300"
      >
        რეგისტრაცია
      </Link>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="დახურვა"
          className="ml-auto w-9 h-9 -m-1 inline-flex items-center justify-center rounded-full text-brand-700 hover:bg-brand-100 motion-safe:transition-colors motion-safe:duration-fast"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
