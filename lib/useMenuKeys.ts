'use client'
import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { wrapIndex } from '@/lib/keyboard'

/**
 * Makes a `role="menu"` actually behave like one.
 *
 * WHY. UserMenu and NotifBell both announced `role="menu"` while handling no
 * keys at all: you had to Tab through every entry, and a screen reader was told
 * to expect arrow navigation that did not exist. Declaring the role is a
 * promise; this keeps it.
 *
 * Implements the standard menu pattern:
 *   ↑ / ↓      move, wrapping at both ends (wrapping is what makes it fast —
 *              one ↑ from the top reaches „გამოსვლა")
 *   Home / End first / last
 *   Escape     close, and return focus to the trigger, so you continue from
 *              where you were instead of at the top of the document
 *   Tab        close and let focus move on normally — a dropdown is not a
 *              dialog and must never trap
 *
 * Enter/Space need no handler: every item is a real <a>/<button>.
 *
 * Usage: spread `menuProps` on the element carrying role="menu"; the hook
 * focuses the first item whenever `open` flips true.
 */
export function useMenuKeys(open: boolean, close: () => void) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const items = useCallback((): HTMLElement[] => {
    const root = menuRef.current
    if (!root) return []
    return [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
      el => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true',
    )
  }, [])

  // Focus the first item on open. Without this the arrows have no anchor and
  // the first ↓ would appear to do nothing.
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => items()[0]?.focus({ preventScroll: true }), 0)
    return () => window.clearTimeout(t)
  }, [open, items])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const list = items()
    if (list.length === 0) return
    const at = list.indexOf(document.activeElement as HTMLElement)

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        list[wrapIndex(at + 1, list.length)]?.focus()
        break
      case 'ArrowUp':
        e.preventDefault()
        list[wrapIndex(at - 1, list.length)]?.focus()
        break
      case 'Home':
        e.preventDefault()
        list[0]?.focus()
        break
      case 'End':
        e.preventDefault()
        list[list.length - 1]?.focus()
        break
      case 'Escape':
        e.preventDefault()
        close()
        triggerRef.current?.focus()
        break
      case 'Tab':
        // Close but do NOT preventDefault — the browser's own focus move is
        // exactly the behaviour we want.
        close()
        break
    }
  }

  return {
    triggerRef,
    menuProps: { ref: menuRef, onKeyDown } as const,
  }
}
