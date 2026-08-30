'use client'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'

/* „შენახვა" — the one control that can put a provider on a client's shortlist.
 *
 * ⚠️ WHY IT DID NOT EXIST UNTIL 2026-08-26, WHICH IS THE POINT. The shortlist
 * itself was never gone: /me/favorites renders it, „შენახული" holds a slot in
 * the bottom nav, in the top bar and in the client-room menu, and `clientRoom`
 * on /api/me counts „saved" as one of the three things that make somebody a
 * client at all. But `POST /api/favorites` had NO CALLER anywhere in the app —
 * the heart went with a catalogue redesign and nothing replaced it — so the
 * room could only ever be empty, and the only way in was a row created before
 * the button disappeared. A door into a room nobody can fill is the same defect
 * as a button that leads nowhere; it just fails quietly.
 *
 * WHERE IT LIVES, and why not on the card. The card grid is rendered from
 * /experts, the home page, the trade landings and the profession landings, and
 * a heart on every card asks a visitor to sort before they have read anything.
 * The PROFILE is where somebody has actually formed an opinion — Baymard's
 * shortlist research is consistent on this: saving is a comparison behaviour and
 * it belongs where the comparison is being made, next to the primary action and
 * visibly secondary to it.
 *
 * WHO SEES IT. Only a signed-in client: the endpoint 403s a provider or an
 * admin („saving is a CLIENT feature — a provider/admin has no surface for
 * it"), so rather than render a control that will refuse, the probe below
 * decides. 401/403 → this component renders nothing at all, and a signed-out
 * visitor simply sees the one CTA, exactly as before.
 */
export function SaveProviderBtn({ providerId }: { providerId: string }) {
  // null = we do not yet know (or must never show). Nothing renders until the
  // probe answers, so the button never appears and then vanishes.
  const [saved, setSaved] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/favorites?providerId=${encodeURIComponent(providerId)}`)
        if (!res.ok) return                       // 401 / 403 → not for this viewer
        const d = await res.json()
        if (!cancelled && d?.ok) setSaved(!!d.saved)
      } catch { /* offline: no control is better than a lying one */ }
    })()
    return () => { cancelled = true }
  }, [providerId])

  if (saved === null) return null

  const toggle = async () => {
    if (busy) return
    const next = !saved
    setBusy(true)
    setSaved(next)                                 // optimistic: the tap IS the feedback
    try {
      const res = await fetch('/api/favorites', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      })
      if (!res.ok) setSaved(!next)                 // put it back; the row never changed
    } catch {
      setSaved(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      // h-11 keeps it past the 40px floor on every breakpoint (CLAUDE.md §3).
      className="mt-3 w-full h-11 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 disabled:opacity-60 text-ink-700 font-display font-semibold text-small inline-flex items-center justify-center gap-2 transition-colors duration-fast"
    >
      {saved
        ? <><Icon.heartFilled className="w-4 h-4 text-brand-600" /> შენახულია</>
        : <><Icon.heart className="w-4 h-4" /> შეინახე</>}
    </button>
  )
}
