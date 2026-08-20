'use client'
// The catalogue filter rail folds on a phone (M2, 2026-08-18; shared by both
// catalogues 2026-08-19 — it was app/masters/_collapse.tsx).
//
// Below `lg` the rail has no column to live in and stacks ABOVE the results, so
// the whole panel — every trade, every city, or on /experts every category and
// language — sat between the page title and the first card. On a 390px screen
// that is the first card pushed below the fold: a catalogue whose first screen
// shows no catalogue.
//
// This wrapper is the ONLY client piece of /experts' filters (the panel itself
// stays a server-rendered list of links — every refinement is an address). One
// button, one boolean, and a class swap. On `lg` and up the button is not drawn
// and the panel is always shown, so the desktop rail is exactly what it was.
// Opens by itself when a filter is already active, because a person who arrived
// on „ელექტრიკოსი თბილისში" should see what is ticked without a tap.
//
// ⚠️ AND IT REPLACED /experts' DRAWER (2026-08-19). That page had a `Sheet` with
// its own header, footer and „ნახე N ექსპერტი" button holding a SECOND copy of
// the same refinements, opened from a `lg:hidden` trigger in the results bar.
// Two surfaces writing one state is two chances to disagree; one panel at both
// breakpoints cannot.

import { useState, type ReactNode } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'

export function MobileCollapse({ panelId, activeCount, children }: {
  /** The id the button controls — unique per page. */
  panelId: string
  activeCount: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(activeCount > 0)
  return (
    <>
      <Btn
        variant="secondary"
        className="lg:hidden w-full justify-between"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        iconLeft={<Icon.sliders aria-hidden className="w-4 h-4 text-brand-600" />}
        iconRight={<Icon.chevD aria-hidden className={`w-4 h-4 text-ink-500 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />}
      >
        <span className="flex-1 text-left">
          ფილტრი{activeCount > 0 && <span className="ml-1.5 text-ink-500 tabular-nums">· {activeCount}</span>}
        </span>
      </Btn>
      <div id={panelId} className={`${open ? 'block mt-3' : 'hidden'} lg:block lg:mt-0`}>
        {children}
      </div>
    </>
  )
}
