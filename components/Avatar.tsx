import Image from 'next/image'

export function Avatar({
  src,
  name,
  size = 40,
  interactive = false,
  className = '',
}: {
  src?: string | null
  name?: string
  size?: number
  // When true, the avatar responds to hover: subtle scale + brand ring reveal.
  // Use for clickable avatars (menu triggers, profile links).
  interactive?: boolean
  className?: string
}) {
  const s = { width: size, height: size }
  // Any photo the account carries — an uploaded avatar (base64), a Google-SSO
  // photo, or a curated stock/demo image — is shown as-is. Only a truly empty
  // src falls back to our friendly default glyph (rendered below).
  const hasPhoto = !!src
  const hoverCls = interactive
    ? 'transition-[transform,box-shadow] duration-fast ease-out-quart hover:scale-[1.06] hover:shadow-[0_0_0_3px_rgba(47,156,134,0.16)]'
    : ''

  return (
    <span className={`relative inline-block ${hoverCls} ${className}`} style={s}>
      {/* The image lives inside an overflow-hidden rounded-full clip so a
          non-square photo (or any next/image intrinsic sizing) can NEVER show
          square corners outside the circle — the reported "photo escapes the
          frame" bug. The ring lives on the clip. */}
      <span className="block w-full h-full rounded-full overflow-hidden ring-2 ring-white" style={s}>
        {hasPhoto ? (
          <Image
            src={src!}
            alt={name ?? ''}
            width={size}
            height={size}
            // Base64 data-URI avatars can't be optimized by Next's loader —
            // skip it to avoid needless work/warnings; remote hosts still optimize.
            unoptimized={src!.startsWith('data:')}
            className="w-full h-full object-cover motion-safe:animate-fade-in-fast"
          />
        ) : (
          // Friendly on-brand default: a soft person glyph on the brand-green
          // wash. Shown for every photo-less user (incl. Google auto-avatars)
          // until they upload their own — no letter monogram, no stock face.
          <span
            aria-label={name ? `${name} — ავატარი` : 'ავატარი'}
            className="w-full h-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-end justify-center overflow-hidden motion-safe:animate-fade-in-fast"
          >
            <svg viewBox="0 0 40 40" className="w-full h-full" aria-hidden>
              <circle cx="20" cy="15.5" r="6.8" className="fill-brand-600" />
              <path d="M6.5 37c0-7.7 6-13 13.5-13s13.5 5.3 13.5 13z" className="fill-brand-600" />
            </svg>
          </span>
        )}
      </span>
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
