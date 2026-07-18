'use client'
import { useEffect, useRef, useState } from 'react'

// CountUp — animates from the previous value up (or down) to the current
// target over `duration` ms. Respects `prefers-reduced-motion` by snapping
// directly to the target with no animation.
//
// Usage:
//   <CountUp value={42} />
//   <CountUp value={128.5} decimals={1} suffix="ჰ" />
//   <CountUp value={950} prefix="₾" />
//   <CountUp value={20} from={0} />  — count up from 0 on mount (scroll-reveal)

export function CountUp({
  value,
  from,
  duration = 600,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}: {
  value: number
  from?: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const [display, setDisplay] = useState<number>(from ?? value)
  const prevRef = useRef<number>(from ?? value)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      prevRef.current = value
      setDisplay(value)
      return
    }
    const from = prevRef.current
    const to = value
    if (from === to) {
      setDisplay(to)
      return
    }
    const start = performance.now()
    // Ease-out-quart for a natural deceleration.
    const ease = (t: number) => 1 - Math.pow(1 - t, 4)
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = ease(t)
      setDisplay(from + (to - from) * eased)
      if (t < 1) frameRef.current = requestAnimationFrame(step)
      else prevRef.current = to
    }
    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  const formatted = display.toFixed(decimals)
  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}
