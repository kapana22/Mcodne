'use client'
import React from 'react'

// Dependency-free SVG charts for the admin dashboard. viewBox + width:100% makes
// them fluid; preserveAspectRatio="none" fills the card and `vector-effect:
// non-scaling-stroke` keeps line/bar strokes crisp despite the x-stretch.

const W = 320
const H = 88
const PAD = 6

/**
 * THE chart palette — the one place a chart colour is written down.
 *
 * SVG `fill`/`stroke` cannot take a Tailwind class, so a chart is the rare
 * place a literal hex is unavoidable. „Unavoidable" is not „unowned": the same
 * brand green was typed at three separate call sites, which is how a palette
 * drifts. Import the name, never the value.
 *
 * ⚠️ These MIRROR tailwind.config.js → BRAND_SCALE / INK_SCALE. If a token
 * moves there, move it here — nothing enforces the pairing.
 *   brand: BRAND_SCALE[500], the wordmark green.
 *   ink:   INK_SCALE[800]. The neutral series used to be #1c1a17, which is on
 *          no scale at all — a hair off ink-800 and invisible to the eye, but
 *          it was a fourth colour system with one member.
 */
export const CHART = {
  brand: '#2F9C86',
  ink: '#1D1B15',
} as const

/** The 30-day series every trend row on this panel reads. Declared here, beside
 *  the component that draws it — it used to live in `_analytics.tsx`, which made
 *  the overview tab import a type from a sibling tab it had nothing else to do
 *  with, and kept that file alive purely as a type holder. */
export type SeriesData = { days: string[]; signups: number[]; bookings: number[]; revenue: number[] }

type Props = {
  title: string
  data: number[]
  labels: string[]
  kind?: 'area' | 'bar'
  color?: string
  format?: (n: number) => string
}

export function MiniChart({ title, data, labels, kind = 'area', color = CHART.brand, format = (n) => String(n) }: Props) {
  const max = Math.max(1, ...data)
  const n = data.length
  const total = data.reduce((a, b) => a + b, 0)
  const gid = 'cg-' + title.replace(/[^a-zA-Z0-9]/g, '')

  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD)

  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = data.length ? `${line} L${W},${H} L0,${H} Z` : ''

  return (
    <div className="p-4 rounded-card border border-ink-200 bg-white">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-micro font-semibold text-ink-500 uppercase">{title}</span>
        <span className="font-display text-h2 font-bold text-ink-900 tabular-nums leading-none">{format(total)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={title} className="block overflow-visible">
        {kind === 'area' ? (
          <>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.20" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill={`url(#${gid})`} />}
            <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : (
          data.map((v, i) => {
            const bw = (W / n) * 0.64
            const bx = (i / n) * W + (W / n - bw) / 2
            const bh = Math.max(v > 0 ? 2 : 0, (v / max) * (H - 2 * PAD))
            return <rect key={i} x={bx} y={H - bh} width={bw} height={bh} rx={1.5} fill={color} opacity={0.85} />
          })
        )}
      </svg>
      <div className="flex justify-between mt-1.5 text-meta text-ink-400 tabular-nums font-mono">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  )
}
