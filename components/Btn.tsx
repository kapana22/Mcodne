import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'

type Variant = 'primary' | 'hero' | 'cta' | 'dark' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 font-display font-semibold tracking-tight rounded-btn select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out-quart ' +
  // Tactile press feedback — applies to BOTH <button> and <Link> variants
  // (the global CSS tap-shrink only covers <button>). Gated by motion-safe so
  // reduced-motion users get an instant, non-animated state change.
  'motion-safe:active:scale-[0.97] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-400 ' +
  'disabled:opacity-50 disabled:pointer-events-none'

const SIZES: Record<Size, string> = {
  // THE LABEL SIZES ARE THE HIERARCHY. Measured on production 2026-07-30: the
  // site's primary action („დაჯავშნე", „ძებნა", „შესვლა") rendered at 14px while
  // 50+ secondary chips sat at 13px — the most important control on the page was
  // one pixel bigger than a filter. The fix was NOT a global bump (that raises
  // everything and changes no relationship); it was giving the strongest visual
  // treatment, `bg-gradient-cta`, the largest label at 16px (`text-body-lg`).
  // If you add a gradient CTA, give it `text-body-lg` — the gradient and the
  // size travel together.
  // h-10 below sm, h-9 from sm up. `sm` is 36px — four pixels under this
  // project's own 40px tap floor — and it is the size used for „ყველა
  // წაკითხულად", „CSV ექსპორტი", „ავატარის შეცვლა", filter toggles and every
  // other compact action, so ONE token change lifts a dozen controls that were
  // each individually missable by a thumb. Desktop keeps the compact 36px.
  sm: 'h-10 sm:h-9 px-3.5 text-small',
  md: 'h-11 px-5 text-body',
  lg: 'h-12 px-6 text-body-lg',
}

// Each variant carries hover AND active tints so the press reads as a real,
// physical state change rather than a flat color the whole time.
const VARIANTS: Record<Variant, string> = {
  primary:   'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-xs hover:shadow-sm',
  // ⚠️ THE NEAR-BLACK FILL (2026-08-31, from the owner's design canvas
  // „mcodne.ge პროფილის რედიზაინი"). The canvas gives the page's LOUDEST
  // action — „დაწყება" in the header, „მიიღე შეთავაზებები" in the hero — an ink
  // fill rather than a green one, and reserves green for the second-loudest.
  // That is a hierarchy the palette could not express before: every filled
  // control was brand-600, so a page with two of them had no way to say which
  // came first.
  //   · ink-900 on white measures 18.6:1 — it cannot fail contrast.
  //   · It is NOT a replacement for `primary`. A screen with one action keeps
  //     the green; `dark` is for a screen where green is already spoken for.
  dark:      'bg-ink-900 hover:bg-ink-800 active:bg-ink-950 text-white shadow-xs hover:shadow-sm',
  hero:      'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)]',
  // The gradient-cta token as a component variant — pages should reach for
  // this instead of hand-rolling `bg-gradient-cta …` button classes.
  cta:       'bg-gradient-cta text-white shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] hover:brightness-[1.04] active:brightness-95',
  secondary: 'bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 active:bg-ink-100 text-ink-900',
  ghost:     'text-ink-800 hover:bg-ink-100 active:bg-ink-200',
  danger:    'bg-white border border-danger-300 text-danger-600 hover:bg-danger-50 active:bg-danger-100',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  href?: string
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  children?: ReactNode
}

export function Btn({
  variant = 'primary',
  size = 'md',
  href,
  loading = false,
  iconLeft,
  iconRight,
  className = '',
  children,
  disabled,
  type,
  ...props
}: Props) {
  const cls = `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`
  const content = (
    <>
      {loading ? (
        <span
          aria-hidden
          className="motion-safe:animate-spin inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        iconLeft
      )}
      {/* inline-flex + items-center so an icon placed INSIDE children (next to
          the label, not via iconLeft/iconRight) still centers vertically
          instead of sitting on the text baseline — fixes icon-in-label buttons
          everywhere at once. Harmless for plain-text labels. */}
      <span className={`inline-flex items-center gap-2 ${loading ? 'opacity-70' : ''}`}>{children}</span>
      {!loading && iconRight}
    </>
  )
  if (href) {
    // A link that declares itself disabled/loading must not stay clickable.
    // `disabled:` utilities only match a real :disabled element, so the link
    // branch renders a non-interactive control instead of a live <a> that
    // silently ignores its own state.
    if (disabled || loading) {
      return (
        <span role="link" aria-disabled="true" tabIndex={-1} className={`${cls} opacity-50 pointer-events-none`}>
          {content}
        </span>
      )
    }
    // Forward the rest of the props (onClick, aria-*, data-*, target/rel, …) —
    // they used to be dropped on the floor here, which broke every call site
    // that combined `href` with a handler (EmptyState's CTA among them).
    // The cast only re-keys React's element-typed handlers (HTMLButtonElement →
    // HTMLAnchorElement); the component's public API stays ButtonHTMLAttributes
    // so no existing call site has to change.
    const anchorProps = props as unknown as Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>
    return <Link href={href} className={cls} {...anchorProps}>{content}</Link>
  }
  return (
    // Default to type="button" so a <Btn> dropped inside a <form> never submits
    // it by accident — callers opt into submit explicitly with type="submit".
    <button type={type ?? 'button'} className={cls} disabled={disabled || loading} {...props}>
      {content}
    </button>
  )
}
