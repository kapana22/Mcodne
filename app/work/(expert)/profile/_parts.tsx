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

export function ServiceTypeAndAvailability({
  profile,
  servicesCount,
  onSaved,
}: {
  profile: NonNullable<TutorProfile>
  servicesCount: number
  onSaved: (next: NonNullable<TutorProfile>) => void
}) {
  const [duration, setDuration] = useState<number>(profile.consultationDurationMin ?? 30)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const save = async (patch: Record<string, any>) => {
    setBusy(true)
    setFlash(null)
    try {
      const res = await fetch('/api/me/tutor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const j = await res.json()
      if (j.ok) {
        onSaved(j.profile)
        setDuration(j.profile.consultationDurationMin ?? 30)
        setFlash('შენახულია')
        setTimeout(() => setFlash(null), 2500)
      } else {
        setFlash('შენახვა ვერ მოხერხდა')
      }
    } catch {
      setFlash('შენახვა ვერ მოხერხდა')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="p-6 rounded-card border border-ink-200 bg-white space-y-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <Eyebrow tone="muted">ნაგულისხმევი ხანგრძლივობა</Eyebrow>
          {/* This length is a DEFAULT, not a calendar grid: the schedule holds
              free WINDOWS and bookable starts are derived from the service the
              client picks (see lib/availability.ts). The old copy — and the old
              behavior — implied it chopped the calendar into fixed pieces. */}
          <p className="text-small text-ink-500 mt-1 max-w-[520px] leading-snug">
            {servicesCount > 0
              ? 'ტიპები თავად განსაზღვრავს ხანგრძლივობასა და ფასს. ეს ნაგულისხმევი მხოლოდ მათ გარეშე მოქმედებს.'
              : 'ერთი სესიის ნაგულისხმევი ხანგრძლივობა. ტიპების დამატებისას აღარ იმოქმედებს.'}
          </p>
        </div>
        {flash && <span className="text-meta font-display font-semibold text-success-700">{flash}</span>}
      </div>

      <div>
        <div className="inline-flex rounded-btn border border-ink-200 overflow-hidden">
          {[15, 30, 60].map(d => (
            <button key={d} type="button"
              onClick={() => save({ consultationDurationMin: d })}
              disabled={busy}
              className={`h-11 px-4 font-display text-small font-semibold transition-colors duration-fast ${
                duration === d ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}>
              {d} წუთი
            </button>
          ))}
        </div>
        <p className="text-meta text-ink-500 mt-2 max-w-[520px] leading-snug">
          გრაფიკს არ ჭრის — შენ თავისუფალ შუალედებს აქვეყნებ, დაწყების დროები კი კლიენტის არჩეული სერვისის ხანგრძლივობით გამოითვლება.
        </p>
      </div>

      {/* „შესვენება სესიებს შორის" (0/5/10/15/30 წთ) was removed 2026-08-11 on
          the owner's call — a setting nobody needed, on the screen where an
          expert is trying to get published.

          `TutorProfile.bufferMin` and the booking engine that honours it are
          deliberately left in place: the column is read on the write path
          (app/api/bookings, enrollments/*, computeNextFreeStart) and ripping it
          out is a change to the booking path, not to this form. With no way to
          set it, every profile stays at the 0 it already has. */}
      <div className="pt-4 border-t border-ink-100 text-small text-ink-500">
        თავისუფალი შუალედები იმართება <a href="/work/schedule" className="font-display font-semibold text-brand-700 hover:text-brand-800">გრაფიკის</a> გვერდზე.
      </div>
    </section>
  )
}

