import Image from 'next/image'

type Dot = 'success' | 'warning' | 'danger' | 'brand'

const DOT: Record<Dot, string> = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger:  'bg-danger-500',
  brand:   'bg-brand-500',
}

export function Avatar({
  src,
  name,
  size = 40,
  dot,
  interactive = false,
  className = '',
}: {
  src?: string | null
  name?: string
  size?: number
  dot?: Dot
  // When true, the avatar responds to hover: subtle scale + brand ring reveal.
  // Use for clickable avatars (menu triggers, profile links).
  interactive?: boolean
  className?: string
}) {
  const s = { width: size, height: size }
  const initial = (name?.trim()?.slice(0, 1) ?? 'მ').toUpperCase()
  const dotSize = Math.max(8, Math.round(size * 0.25))
  const hoverCls = interactive
    ? 'transition-[transform,box-shadow] duration-fast ease-out-quart hover:scale-[1.06] hover:shadow-[0_0_0_3px_rgba(21,154,130,0.16)]'
    : ''

  return (
    <span className={`relative inline-block ${hoverCls} ${className}`} style={s}>
      {src ? (
        <Image
          src={src}
          alt={name ?? ''}
          width={size}
          height={size}
          className="rounded-full object-cover ring-2 ring-white motion-safe:animate-fade-in-fast"
        />
      ) : (
        <span
          className="rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-800 flex items-center justify-center font-display font-semibold ring-2 ring-white motion-safe:animate-fade-in-fast"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
        >
          {initial}
        </span>
      )}
      {dot && (
        <span
          aria-hidden
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-white ${DOT[dot]} ${
            dot === 'success' || dot === 'brand' ? 'motion-safe:animate-pulse-soft' : ''
          }`}
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </span>
  )
}

export function VerifiedMark({ size = 18 }: { size?: number }) {
  const inner = Math.round(size * 0.55)
  return (
    <span
      role="img"
      aria-label="გადამოწმებული"
      title="გადამოწმებული"
      className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white motion-safe:animate-scale-in"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: inner, height: inner }}
      >
        <path d="m4 12 5 5L20 6" />
      </svg>
    </span>
  )
}
