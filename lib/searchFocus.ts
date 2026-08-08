/**
 * A one-slot registry so a global key handler can reach the page's search box
 * without prop-drilling through the shell.
 *
 * WHY A REGISTRY AND NOT A SELECTOR. Querying `input[type=search]` from the
 * shortcut handler would silently attach to whatever input happened to match
 * first — a filter field, a chat composer, a future admin search. The page that
 * OWNS the search declares itself; everything else gets the navigate-to-browse
 * fallback. One slot, not a list: two visible site searches on one page would
 * itself be the bug.
 */

let current: HTMLInputElement | null = null

/** Call from the search input's ref callback. Pass null on unmount. */
export function registerSearchInput(el: HTMLInputElement | null): void {
  // Only clear if WE are the one leaving — otherwise a slow unmount could wipe
  // an input that has already registered in its place.
  if (el === null) { if (current) current = null; return }
  current = el
}

/**
 * Focus + select the registered search box.
 * @returns false when this page has none, so the caller can navigate instead.
 */
export function focusSearchInput(): boolean {
  const el = current
  if (!el || !el.isConnected) return false
  // preventScroll: the field can sit below the fold on a long browse page, and
  // yanking the viewport is disorienting when the user only pressed a key.
  // scrollIntoView afterwards puts it on screen deliberately and smoothly.
  el.focus({ preventScroll: true })
  el.select()
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return true
}

/** Where `/` sends someone whose current page has no search box. */
export const SEARCH_FALLBACK_HREF = '/tutors?focus=search'
