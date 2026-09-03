'use client'
// The catalogue filter rail folds on a phone (M2, 2026-08-18; shared by both
// catalogues 2026-08-19 — it was app/masters/_collapse.tsx).
//
// Below `lg` the rail has no column to live in and stacks ABOVE the results, so
// the whole panel — every category, every language — sat between the page title
// and the first card. On a 390px screen that is the first card pushed below the
// fold: a catalogue whose first screen shows no catalogue.
//
// ⚠️ AND IT REPLACED /experts' DRAWER (2026-08-19). That page had a `Sheet` with
// its own header, footer and „ნახე N ექსპერტი" button holding a SECOND copy of
// the same refinements, opened from a `lg:hidden` trigger in the results bar.
// Two surfaces writing one state is two chances to disagree; one panel at both
// breakpoints cannot.
//
// ⚠️ THE BUTTON LEFT THIS FILE ON 2026-09-01, AND THE STATE LEFT WITH IT — this
// is now the fold and nothing else. Owner, sent a screenshot of the phone:
// „ტელეფონის დიზაინსაც მიხედე." Measured on that screenshot, a phone showed
// THREE stacked full-width bars between the search band and the first card —
// the switch (52px), this button (44px) and the sort row (44px) — roughly 230px
// of chrome, which is the exact failure this file was written to prevent, grown
// back one control at a time. The trigger now sits in the results header beside
// the sort and the layout toggle (app/experts/_results → ResultsBar), where the
// other two controls that describe the list already are, and the three share one
// 44px row.
//
// It is STILL one surface and one state: the trigger is a button in one place,
// the panel is a div in another, and `open` is owned once by the container
// (app/experts/client). What the drawer did wrong in 2026-08 was rendering the
// REFINEMENTS twice; a button that opens the one panel is not a second copy of
// anything.

import { type ReactNode } from 'react'

export function MobileCollapse({ panelId, open, children }: {
  /** The id the results header's trigger controls — unique per page. */
  panelId: string
  /** Owned by the container, so the trigger and the panel cannot disagree.
   *  Ignored from `lg` up, where the rail is simply always there. */
  open: boolean
  children: ReactNode
}) {
  return (
    <div id={panelId} className={`${open ? 'block' : 'hidden'} lg:block`}>
      {children}
    </div>
  )
}
