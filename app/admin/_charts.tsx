'use client'
import React from 'react'

// Dependency-free SVG charts for the admin dashboard. viewBox + width:100% makes
// them fluid; preserveAspectRatio="none" fills the card and `vector-effect:
// non-scaling-stroke` keeps line/bar strokes crisp despite the x-stretch.

const W = 320
const H = 88
const PAD = 6

type Props = {
  title: string
  data: number[]
  labels: string[]
  kind?: 'area' | 'bar'
  color?: string
  format?: (n: number) => string
}

export function MiniChart({ title, data, labels, kind = 'area', color = '#2F9C86', format = (n) => String(n) }: Props) {
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
        <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-[0.08em]">{title}</span>
        <span className="font-display text-[19px] font-bold text-ink-900 tabular-nums leading-none">{format(total)}</span>
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
      <div className="flex justify-between mt-1.5 text-[10px] text-ink-400 tabular-nums font-mono">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  )
}
