'use client'
// Global banner shown to any signed-in session where an admin is currently
// impersonating another user. Polls /api/admin/impersonate/status every 15s
// (also on visibility change so tab switches back-check quickly).
// Clicking "exit" restores the admin's original session and redirects to /admin.

import { useEffect, useState } from 'react'
import { broadcastSessionChange } from '@/lib/sessionSignal'

export function ImpersonationBanner() {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/admin/impersonate/status', { cache: 'no-store' })
        if (!res.ok) return
        const d = await res.json()
        if (!cancelled) setActive(!!d.impersonating)
      } catch {}
    }
    check()
    const iv = setInterval(check, 15_000)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelled = true; clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const exit = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/impersonate/exit', { method: 'POST' })
      const d = await res.json().catch(() => ({} as any))
      // Restored to the admin identity — reload other tabs off the impersonated
      // shell before this tab navigates back to /admin.
      broadcastSessionChange()
      window.location.href = (res.ok && d?.redirect) ? d.redirect : '/admin'
    } catch {
      broadcastSessionChange()
      window.location.href = '/admin'
    }
  }

  if (!active) return null

  return (
    <div className="sticky top-0 z-[60] bg-warning-100 border-b border-warning-300 text-warning-900 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-[12.5px] font-display font-semibold">
      <span className="inline-flex items-center gap-2 min-w-0">
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v5M12 18h0" /></svg>
        <span className="truncate">ადმინის მიერ სხვის სახელით ხარ ავტორიზებული.</span>
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className="h-8 px-3 rounded-btn bg-warning-900 hover:bg-ink-900 disabled:opacity-60 text-white font-display font-semibold text-[11.5px] inline-flex items-center gap-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-warning-100"
      >
        {busy ? '…' : 'გამოსვლა'}
      </button>
    </div>
  )
}
