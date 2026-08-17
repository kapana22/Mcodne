'use client'
// A page that keeps itself current — the poll, written once.
//
// WHY POLLING AND NOT A SOCKET. The two screens that need liveness (a client
// waiting for offers, a provider watching the queue) change on a HUMAN
// timescale — minutes, not milliseconds. router.refresh() every half-minute
// re-renders the server component with fresh data through the exact same code
// path as a manual reload, so liveness costs zero new endpoints, zero
// connection state and zero infrastructure. A websocket would be a second
// delivery path to keep correct for data that changes a few times an hour.
//
// VISIBILITY-AWARE, both ways: a hidden tab polls nothing (battery, and a
// server not asked to render pages nobody is looking at), and the moment the
// tab returns it refreshes IMMEDIATELY — the catch-up is the moment the person
// is actually looking, and it is exactly when a fixed interval would be
// mid-wait.
//
// The label is the contract made visible: „this page updates itself" replaces
// the reader's urge to hammer reload. TEXT ONLY, deliberately — the first
// draft paired it with a pulsing dot, and the canon's „no status dots" rule
// (2026-07-19) exists precisely so state is carried by words, not ornaments.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh({
  intervalMs = 30_000,
  label = 'ახლდება ავტომატურად',
  className = '',
}: {
  intervalMs?: number
  label?: string
  className?: string
}) {
  const router = useRouter()

  useEffect(() => {
    let last = Date.now()
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      last = Date.now()
      router.refresh()
    }
    const id = window.setInterval(tick, intervalMs)
    const onVisible = () => {
      // Returning to a tab that sat hidden past a whole interval → catch up
      // now instead of waiting out the remainder.
      if (document.visibilityState === 'visible' && Date.now() - last > intervalMs) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router, intervalMs])

  return (
    <span className={`inline-flex items-center text-meta text-ink-400 ${className}`}>
      {label}
    </span>
  )
}
