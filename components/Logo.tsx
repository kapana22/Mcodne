'use client'
import Link from 'next/link'

type Size = 'sm' | 'md' | 'lg'

// Refined nav-scale heights — the wordmark is wide (2.6:1), so ~28px tall
// reads premium; the old 56–80px sizes dominated every bar they sat in.
const HEIGHTS: Record<Size, string> = {
  sm: 'h-6',
  md: 'h-7',
  lg: 'h-9',
}

/* `href` behaviour:
   - omitted (undefined) → the public landing „/“ (the main page) for EVERYONE,
     signed-in or not. Users expect "click the logo → go to the main page"
     (2026-07-24: reverted from role-aware workspace-home — felt less comfortable).
   - explicit string → that path.
   - null → no link (brand mark only, e.g. the auth screen). */
export function Logo({ size = 'md', href }: { size?: Size; href?: string | null }) {
  const inner = (
    <span className="inline-flex items-center transition-transform duration-fast ease-out-quart hover:scale-[1.03] active:scale-[0.98]">
      <img
        src="/logo.svg"
        alt="მცოდნე"
        className={`${HEIGHTS[size]} w-auto object-contain select-none`}
        draggable={false}
      />
    </span>
  )
  if (href === null) return inner
  const dest = href ?? '/'
  return (
    // items-center + a 40px floor below sm: the wordmark itself renders 28px
    // tall, so the home link was the one control on the page you could miss with
    // a thumb. The mark does not grow — only its hit area does.
    <Link href={dest} aria-label="მცოდნე — მთავარზე" className="inline-flex items-center min-h-[40px] sm:min-h-0 rounded-btn hover:opacity-80 transition-opacity duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
      {inner}
    </Link>
  )
}
