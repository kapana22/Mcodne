'use client'
// THE LAYOUT TOGGLE — two icon buttons in the results header (2026-08-19).
//
// ⚠️ IT IS NOT A FILTER AND NOT THE CATALOGUE SWITCH. It changes nothing about
// WHICH results are shown, so it sits with the sort control in the results
// header rather than in the filter rail; and it is a pair of BUTTONS with
// `aria-pressed` rather than a pair of LINKS with `aria-current`: nothing here
// navigates, it only toggles state a screen reader must hear as pressed. (The
// pair of links it is being contrasted with was components/VerticalSwitch,
// deleted with the /services door in stage 10, 2026-08-19.)
//
// 40×40 each: the canon's blessed icon-button size and the tap floor exactly.
// Icon-only, so each carries its own name — „ბადე" and „სია".

import { Icon } from '@/components/Icon'
import type { CatalogView } from './useCatalogView'

const OPTS: { key: CatalogView; label: string; icon: typeof Icon.grid }[] = [
  { key: 'grid', label: 'ბადე', icon: Icon.grid },
  { key: 'list', label: 'სია', icon: Icon.list },
]

export function ViewToggle({ view, onChange, className = '' }: {
  view: CatalogView
  onChange: (v: CatalogView) => void
  className?: string
}) {
  return (
    <div role="group" aria-label="განლაგება" className={`inline-flex items-center gap-1 shrink-0 ${className}`}>
      {OPTS.map(o => {
        const on = o.key === view
        const Mark = o.icon
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.key)}
            className={`w-10 h-10 rounded-btn border inline-flex items-center justify-center transition-colors duration-fast ${
              on
                ? 'border-brand-500 bg-brand-50/40 text-brand-700'
                : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:text-ink-800'
            }`}
          >
            <Mark aria-hidden className="w-4 h-4" />
          </button>
        )
      })}
    </div>
  )
}
