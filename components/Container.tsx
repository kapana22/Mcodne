import type { ReactNode, ElementType } from 'react'

// ─────────────────────────────────────────────────────────────────────────
// The ONE page grid. Every page/section content column goes through <Container>
// so the horizontal gutter and max-width are identical site-wide — text and
// elements line up on the same left/right edge on every page. Never hand-write
// `max-w-… mx-auto px-…` shells again; reach for this.
//
//   size="wide"    →  1280px  · listings, dashboards, marketing (default)
//   size="content" →   820px  · prose, help articles, messages, forms-with-context
//   size="narrow"  →   560px  · auth, focused forms
//
// Gutter is ALWAYS px-6 sm:px-8 (24 → 32px), regardless of size, so narrower
// tiers stay centered within — and edge-aligned to — the wide column.
// ─────────────────────────────────────────────────────────────────────────

type Size = 'wide' | 'content' | 'narrow'

const MAX: Record<Size, string> = {
  wide:    'max-w-[1280px]',
  content: 'max-w-[820px]',
  narrow:  'max-w-[560px]',
}

export function Container({
  size = 'wide',
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}: {
  size?: Size
  as?: ElementType
  className?: string
  children?: ReactNode
  // Forward any element attributes (id, role, aria-*, style, data-*) so a shell
  // like `<div id="main" …>` can become `<Container id="main">` losslessly.
  [prop: string]: any
}) {
  // `w-full` is load-bearing: inside a `flex flex-col` parent (the workspace
  // shells), a child with only `max-w-… mx-auto` collapses to its content's
  // intrinsic width instead of filling the column (a flexbox `margin:auto`
  // quirk). `w-full` forces it to fill up to max-width. In plain block parents
  // it's a no-op (block elements are already 100% wide).
  return <Tag className={`${MAX[size]} w-full mx-auto px-6 sm:px-8 ${className}`} {...rest}>{children}</Tag>
}
