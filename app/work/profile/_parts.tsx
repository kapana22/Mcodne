'use client'
// One labelled field. What is left of a file that held four building blocks.
//
// ⚠️ `TabPanel` WENT WITH THE TABS (2026-08-30). /work/profile drew a bar
// („პროფილი / ანგარიში") that did not cover its own page — the work photos
// stood BELOW it, in neither tab, with a second save button and a second
// unsaved-changes guard. A tab bar that describes part of a screen is worse
// than none: it tells the reader they have seen everything when they have not.
// One page, one column, one save.
//
// ⚠️ `AddDisclosure` WENT WITH THE CREDENTIALS TAB (2026-08-29). It hid the
// certificate, education and job add-forms behind „+ დამატება"; all three lists
// are gone. Owner: „რითი დაგიჯერებს აღარ გვჭირდება, ეს ხომ სერვისებს ყიდის."
//
// ⚠️ `ServiceTypeAndAvailability` WENT WITH THE BOOKING PRODUCT (2026-08-24).

import { Eyebrow } from '@/components/Eyebrow'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Eyebrow as="span" tone="muted" className="block mb-1.5">{label}</Eyebrow>
      {children}
    </label>
  )
}
