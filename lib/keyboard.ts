/**
 * Shared keyboard helpers. Small on purpose — the rules below are the ones that
 * get forgotten, and forgetting any one of them turns a shortcut into a bug
 * that eats someone's typing.
 */

/**
 * True when the key event came from somewhere the user is TYPING (or from an
 * element that owns its own keys, like a `role="menu"`).
 *
 * Every bare-letter shortcut must consult this first. A `/` handler that skips
 * it makes the character impossible to type in any field on the site — the
 * classic way this feature ships broken.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  // A native <dialog>, a listbox or a menu is already handling arrows/letters.
  return !!el.closest?.('[role="menu"],[role="listbox"],[contenteditable="true"]')
}

/** ⌘ on macOS, Ctrl elsewhere — accept either rather than sniffing the platform. */
export function isCmdOrCtrl(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey
}

/**
 * Move an index inside a list of n, wrapping at both ends.
 * Wrapping (not clamping) is what makes a menu feel fast: one ArrowUp from the
 * first item lands on „გამოსვლა" instead of doing nothing.
 */
export function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0
  return ((i % n) + n) % n
}
