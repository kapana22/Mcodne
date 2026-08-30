'use client'
// /tutor/profile — the small building blocks every tab reuses: the hidden-not-
// unmounted tab panel, the „დამატება" disclosure, the labelled field, and the
// service-type + availability block.

import { useState } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import type { TutorProfile } from './_types'

export function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div role="tabpanel" hidden={!active} className={active ? 'space-y-6' : undefined}>
      {children}
    </div>
  )
}

/* Progressive disclosure for the credential add-forms: collapsed behind a
   "+ დამატება" row once the list has entries; auto-open while empty so the
   first item has zero extra clicks. Form stays mounted (state survives). */
export function AddDisclosure({ label, forceOpen, children }: { label: string; forceOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const show = forceOpen || open
  return (
    <div>
      {!show && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full min-h-[44px] pt-3 border-t border-ink-100 inline-flex items-center justify-center gap-2 font-display text-small font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast"
        >
          <Icon.plus className="w-4 h-4" /> {label}
        </button>
      )}
      <div hidden={!show}>{children}</div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Eyebrow as="span" tone="muted" className="block mb-1.5">{label}</Eyebrow>
      {children}
    </label>
  )
}

/* ⚠️ `ServiceTypeAndAvailability` WAS HERE AND WENT WITH THE BOOKING PRODUCT
   (2026-08-24). It set the DEFAULT session length (15/30/60) and the
   „available now" switch — two controls about a calendar. The visibility
   switch itself survives on /work/services, where the rest of what a provider
   publishes is edited. */
