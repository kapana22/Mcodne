'use client'
import React, { useEffect, useRef, useState } from 'react'

// Reveal — scroll-entrance wrapper. Adds `.reveal` (or `.reveal-stagger`) and
// flips `.is-visible` once the element enters the viewport; the actual motion
// lives in globals.css inside the `prefers-reduced-motion: no-preference`
// block, so reduced-motion users (and no-IO browsers) see content instantly.
//
//   <Reveal>…</Reveal>                          — single block rises in
//   <Reveal stagger className="grid …">…</Reveal> — children cascade in
//   <Reveal>{visible => …}</Reveal>             — drive CountUp etc. on enter
export function Reveal({
  stagger = false,
  delay = 0,
  className = '',
  children,
}: {
  stagger?: boolean
  delay?: number
  className?: string
  children: React.ReactNode | ((visible: boolean) => React.ReactNode)
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      // Fire slightly before the block fully clears the fold so the motion is
      // already underway as the user arrives — feels alive, never laggy.
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${stagger ? 'reveal-stagger' : 'reveal'} ${visible ? 'is-visible' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {typeof children === 'function' ? children(visible) : children}
    </div>
  )
}
