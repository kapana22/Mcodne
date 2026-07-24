'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/* A thin top progress bar for client-side navigation. App Router exposes no
   navigation-start event, so we start the bar when an internal <a> is clicked
   and finish it when the pathname settles. It "trickles" toward 88% while the
   next page loads, then snaps to 100% and fades — clear "it's loading" feedback,
   which matters because some reads are still a few seconds. Purely decorative
   (aria-hidden); it never blocks interaction (pointer-events: none). */
export function NavProgress() {
  const pathname = usePathname()
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const running = useRef(false)

  const clearTrickle = () => { if (trickle.current) { clearInterval(trickle.current); trickle.current = null } }

  const start = () => {
    if (running.current) return
    running.current = true
    if (hideT.current) clearTimeout(hideT.current)
    setVisible(true)
    setWidth(12)
    trickle.current = setInterval(() => setWidth(w => (w < 88 ? w + (88 - w) * 0.12 : w)), 300)
  }

  const finish = () => {
    if (!running.current) return
    running.current = false
    clearTrickle()
    setWidth(100)
    hideT.current = setTimeout(() => { setVisible(false); setWidth(0) }, 260)
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      const href = a?.getAttribute('href')
      if (!a || !href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || a.getAttribute('target') === '_blank') return
      if (href === window.location.pathname) return // same page — no nav
      start()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Pathname changed → the navigation resolved. finish() no-ops if idle (so the
  // initial mount doesn't flash the bar).
  useEffect(() => { finish() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname])
  useEffect(() => () => { clearTrickle(); if (hideT.current) clearTimeout(hideT.current) }, [])

  return (
    <div aria-hidden className={`fixed top-0 inset-x-0 z-[100] h-[3px] pointer-events-none transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div
        className="h-full bg-brand-500 shadow-[0_0_10px_rgba(47,156,134,0.55)] transition-[width] duration-300 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
