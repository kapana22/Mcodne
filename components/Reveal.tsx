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
    // Already on screen at mount (above-the-fold, anchor jump, restored
    // scroll) → reveal immediately; only genuinely below-fold blocks wait
    // for the observer. This is the "can never look broken" guarantee.
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight && r.bottom > 0) {
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
      // Any visible pixel triggers (threshold 0) — a ratio threshold can
      // NEVER fire for sections taller than the viewport. Small negative
      // bottom margin so the motion starts just after the edge appears.
      { threshold: 0, rootMargin: '0px 0px -6% 0px' },
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
