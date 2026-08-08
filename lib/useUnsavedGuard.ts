'use client'
import { useEffect } from 'react'

/**
 * Warn before losing unsaved edits.
 *
 * WHY. `/tutor/profile` is a long editor with a manual save button and a
 * `dirty` flag — and nothing whatsoever guarding it. Closing the tab, hitting
 * reload, or clicking any link in the sidebar discarded the work silently. Ten
 * minutes of writing a bio could vanish to one stray click, with no undo and no
 * draft anywhere.
 *
 * TWO ESCAPE ROUTES, TWO MECHANISMS — a page can be left in ways that share
 * nothing technically:
 *  1. LEAVING THE DOCUMENT (tab close, reload, external link, Back out of the
 *     app): only `beforeunload` can intervene, and the browser shows its own
 *     generic dialog. Custom text is ignored by every modern browser; the point
 *     is the pause, not the wording.
 *  2. IN-APP NAVIGATION (any <Link>): never touches `beforeunload`, because the
 *     document never unloads. The App Router exposes no navigation guard, so we
 *     intercept the click in the CAPTURE phase — before Next's router sees it —
 *     and confirm. This is the route people actually take, so omitting it would
 *     leave the common case unguarded.
 *
 * Deliberately NOT guarded: modifier-clicks (⌘/Ctrl/middle open a new tab and
 * leave this one alone), same-page anchors, downloads, and anything outside the
 * app. Guarding those would nag without protecting anything.
 */
export function useUnsavedGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy assignment kept: some browsers still require a truthy value on
      // the event for the prompt to appear at all.
      e.returnValue = message
      return message
    }

    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      // Not a plain left click → the browser is opening this elsewhere.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      if (a.target && a.target !== '_self') return
      if (a.hasAttribute('download')) return
      const href = a.getAttribute('href') || ''
      // In-page anchors and non-navigations don't lose anything.
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return          // external → beforeunload handles it
      if (url.pathname === window.location.pathname) return      // staying put
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) return                        // let it through
      e.preventDefault()
      e.stopPropagation()
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    // Capture phase: Next's Link handler runs on bubble, so this must intercept
    // first or the navigation is already under way by the time we ask.
    document.addEventListener('click', onClickCapture, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [dirty, message])
}
