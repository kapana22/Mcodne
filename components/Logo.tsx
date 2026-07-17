import Link from 'next/link'

type Size = 'sm' | 'md' | 'lg'

// Refined nav-scale heights — the wordmark is wide (2.6:1), so ~28px tall
// reads premium; the old 56–80px sizes dominated every bar they sat in.
const HEIGHTS: Record<Size, string> = {
  sm: 'h-6',
  md: 'h-7',
  lg: 'h-9',
}

export function Logo({ size = 'md', href = '/' }: { size?: Size; href?: string | null }) {
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
  if (!href) return inner
  return (
    <Link href={href} aria-label="მცოდნე" className="inline-flex rounded-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
      {inner}
    </Link>
  )
}
