// Skeleton primitive — content-shaped placeholder for slow API loads.
// Uses `bg-ink-100` with a subtle pulse. Wrapped in `motion-safe:` so users
// with `prefers-reduced-motion: reduce` see a static tile (no animation).
//
// API (function-with-attached-statics, so both call styles work):
//   <Skeleton className="h-6 w-24" />                 // raw block
//   <Skeleton.Card />                                 // card-sized preset
//   <Skeleton.Avatar size={40} />                     // circular avatar
//   <Skeleton.Line width={60} />                      // one text line
//
// Legacy named exports (SkeletonLine / SkeletonKpi / SkeletonRow) kept for
// existing dashboards that already import them by name.

import type { CSSProperties } from 'react'

type BaseProps = {
  className?: string
  rounded?: string
}

function SkeletonBase({ className = '', rounded = 'rounded-btn' }: BaseProps) {
  return <div className={`shimmer-bg bg-ink-100 ${rounded} ${className}`} aria-hidden="true" />
}

// Card-sized preset — mirrors the tutor-card / kpi-card outer shell so it
// slots into result grids without collapsing column widths.
function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-card border border-ink-200 bg-white p-5 ${className}`} aria-hidden="true">
      <div className="flex items-center gap-3 mb-4">
        <div className="shimmer-bg bg-ink-100 h-12 w-12 rounded-full" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="shimmer-bg bg-ink-100 h-3.5 w-1/2 rounded-btn" />
          <div className="shimmer-bg bg-ink-100 h-3 w-1/3 rounded-btn" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="shimmer-bg bg-ink-100 h-3 w-full rounded-btn" />
        <div className="shimmer-bg bg-ink-100 h-3 w-4/5 rounded-btn" />
        <div className="shimmer-bg bg-ink-100 h-3 w-2/3 rounded-btn" />
      </div>
      <div className="mt-5 flex items-center justify-between">
        <div className="shimmer-bg bg-ink-100 h-4 w-16 rounded-btn" />
        <div className="shimmer-bg bg-ink-100 h-8 w-24 rounded-btn" />
      </div>
    </div>
  )
}

// Circular avatar placeholder. `size` is in pixels — matches Avatar component.
function SkeletonAvatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size }
  return (
    <div
      className={`shimmer-bg bg-ink-100 rounded-full shrink-0 ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

// One text-line placeholder. `width` accepts a percent (number 0–100) or any
// Tailwind width class via `className`. Defaults to full width.
function SkeletonLinePreset({ width, className = '' }: { width?: number; className?: string }) {
  const style: CSSProperties | undefined = typeof width === 'number' ? { width: `${width}%` } : undefined
  return (
    <div
      className={`shimmer-bg bg-ink-100 h-3.5 rounded-btn ${width == null ? 'w-full' : ''} ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

type SkeletonComponent = typeof SkeletonBase & {
  Card: typeof SkeletonCard
  Avatar: typeof SkeletonAvatar
  Line: typeof SkeletonLinePreset
}

export const Skeleton = SkeletonBase as SkeletonComponent
Skeleton.Card = SkeletonCard
Skeleton.Avatar = SkeletonAvatar
Skeleton.Line = SkeletonLinePreset

// Legacy named-export helpers used by existing dashboards. Keep intact.
function SkeletonLine({ className = '' }: { className?: string }) {
  return <SkeletonBase className={`h-3.5 w-full ${className}`} />
}

export function SkeletonKpi({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-card border border-ink-200 bg-white p-4 ${className}`}>
      <SkeletonBase className="h-3 w-16 mb-3" />
      <SkeletonBase className="h-7 w-14 mb-2" />
      <SkeletonBase className="h-3 w-24" />
    </div>
  )
}

export function SkeletonRow({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 sm:p-5 flex items-center gap-3 ${className}`}>
      <SkeletonBase className="h-10 w-10 rounded-full" rounded="" />
      <div className="flex-1 min-w-0 space-y-2">
        <SkeletonBase className="h-3.5 w-1/3" />
        <SkeletonBase className="h-3 w-2/3" />
      </div>
      <SkeletonBase className="h-8 w-20" />
    </div>
  )
}
