'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { focusSearchInput, SEARCH_FALLBACK_HREF } from '@/lib/searchFocus'
import { isTypingTarget, isCmdOrCtrl } from '@/lib/keyboard'

/**
 * Site-wide keyboard shortcuts, mounted once in the shell.
 *
 * WHY. On a laptop the whole browse → profile → book path required reaching for
 * the trackpad at every step; there was no way to get to the search box from
 * anywhere, and nothing told you shortcuts existed. This is the fast lane.
 *
 * THE RULES THAT KEEP IT FROM BREAKING TYPING
 *  - bare-letter shortcuts (`/`, `?`) are ignored while the user is in a field
 *    (isTypingTarget). Without that, `/` becomes untypeable site-wide.
 *  - ⌘K / Ctrl+K works EVERYWHERE, including inside a field: it is a modified
 *    chord, so it cannot collide with typing, and „jump to search while I'm
 *    mid-sentence" is exactly when you want it.
 *  - anything with a modifier we don't own is left alone, so browser shortcuts
 *    (⌘L, ⌘F, ⌘1…) keep working.
 *  - the overlay closes on Escape and never traps: it is a cheat sheet, not a
 *    dialog you have to defeat.
 */

type Shortcut = { keys: string[]; label: string }

const SHORTCUTS: Shortcut[] = [
  { keys: ['/'], label: 'ძებნაზე გადასვლა' },
  { keys: ['⌘', 'K'], label: 'ძებნაზე გადასვლა (ველშიც მუშაობს)' },
  { keys: ['Esc'], label: 'დახურვა — ფანჯარა, მენიუ, ძებნა' },
  { keys: ['↑', '↓'], label: 'მენიუსა და სიაში გადაადგილება' },
  { keys: ['←', '→'], label: 'კალენდარში დღე' },
  { keys: ['⇞', '⇟'], label: 'კალენდარში თვე' },
  { keys: ['Enter'], label: 'არჩევა' },
  { keys: ['?'], label: 'ეს სია' },
]

const Key = ({ k }: { k: string }) => (
  <kbd className="inline-flex items-center justify-center min-w-[26px] h-7 px-2 rounded-btn border border-ink-200 bg-ink-50 font-display text-meta font-bold text-ink-700">
    {k}
  </kbd>
)

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return

      // ⌘K / Ctrl+K — the one chord that also fires while typing.
      if (isCmdOrCtrl(e) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (!focusSearchInput()) router.push(SEARCH_FALLBACK_HREF)
        return
      }

      // Everything below is a BARE key. Never steal it from a field, and never
      // from a browser/OS chord.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      if (e.key === '/') {
        e.preventDefault()
        if (!focusSearchInput()) router.push(SEARCH_FALLBACK_HREF)
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setOpen(v => !v)
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, open])

  if (!open) return null

  return (
    // Not a focus-trapping dialog on purpose — see the header note. Click
    // anywhere or press Escape.
    <div
      className="fixed inset-0 z-toast bg-ink-900/40 flex items-center justify-center p-6 motion-safe:animate-fade-in-fast"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="კლავიატურის მალსახმობები"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[420px] bg-white rounded-card border border-ink-200 shadow-float overflow-hidden"
      >
        <div className="px-5 pt-4 pb-3 border-b border-ink-100 flex items-center justify-between gap-3">
          <Eyebrow tone="muted">მალსახმობები</Eyebrow>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="დახურვა"
            className="w-8 h-8 -mr-1 rounded-btn hover:bg-ink-100 text-ink-500 inline-flex items-center justify-center transition-colors duration-fast"
          >
            <Icon.x className="w-4 h-4" />
          </button>
        </div>
        <ul className="p-2">
          {SHORTCUTS.map(s => (
            <li key={s.label} className="flex items-center justify-between gap-4 px-3 py-2">
              <span className="text-small text-ink-700 leading-snug">{s.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {s.keys.map(k => <Key key={k} k={k} />)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
