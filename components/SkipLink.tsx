'use client'
// Skip-to-content link (visible only when keyboard-focused), mounted once from
// the root layout.
//
// It resolves its target at CLICK time instead of relying on a static
// `href="#main"` anchor. Every route renders its OWN header inside `{children}`
// — the layout has no element that sits after the nav — so a layout-level
// anchor target could never actually skip anything, and only three of ~25 route
// files ever declared `id="main"`, which left the anchor dead everywhere else.
// Looking the landmark up in the DOM works on every route, including the ones
// that get their <main> from a workspace shell, with no per-page change.
//
// Order: the page's <main> landmark → an explicit id="main" → the first
// heading. If none exists we let the browser follow the href rather than trap
// focus somewhere arbitrary.
export function SkipLink() {
  const jumpToContent = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el =
      document.querySelector<HTMLElement>('main, [role="main"]') ||
      document.getElementById('main') ||
      document.querySelector<HTMLElement>('h1')
    if (!el) return
    e.preventDefault()
    // A landmark isn't focusable on its own; -1 makes it programmatically
    // focusable without adding it to the tab order.
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'start' })
  }

  return (
    <a
      href="#main"
      onClick={jumpToContent}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-skip focus:h-11 focus:px-4 focus:rounded-btn focus:bg-brand-600 focus:text-white focus:font-display focus:font-semibold focus:text-small focus:inline-flex focus:items-center focus:shadow-float"
    >
      გადადი მთავარ შიგთავსზე
    </a>
  )
}
