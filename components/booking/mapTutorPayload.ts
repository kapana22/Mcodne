// Split out of BookingFlow.tsx so the profile page can import this tiny pure
// mapper WITHOUT pulling the whole (heavy) BookingFlow component + calendar /
// date-picker subtree into its initial bundle — BookingFlow itself is now lazy
// (next/dynamic). ONE mapping shared by both entry points (self-fetch + preload)
// so they can't resolve different fallbacks — see tests/tutor-mapping.
import { TUTOR_DEFAULTS, type ApiSlot, type BusySlot, type ConsultationItem } from './slots'

export type BookingTutorInfo = {
  id: string
  name: string
  specialty: string
  avatarUrl: string | null
  price: number
  sessionMin: number
  /** Required gap around a session, in minutes. 0 until the profile/payload
      carries it — an absent field must never break the derivation. */
  bufferMin: number
  availability: ApiSlot[]
  busySlots: BusySlot[]
  consultations: ConsultationItem[]
  /** Category slug. The flow needs it for ONE decision: whether the „propose a
      time" affordance may be offered (diaspora experts only — the server
      applies the same rule and is the authority, so this is purely about not
      showing a control that would be refused). Null when the expert has no
      category, which is itself a „no". */
  categorySlug: string | null
}

// Map the /api/tutors/[id] JSON to the flow's payload.
export function mapTutorPayload(d: any): BookingTutorInfo {
  return {
    id: d?.id ?? '',
    name: d?.user?.fullName ?? TUTOR_DEFAULTS.name,
    specialty: d?.specialty ?? 'კონსულტაცია',
    avatarUrl: d?.user?.avatarUrl ?? null,
    price: d?.price ?? TUTOR_DEFAULTS.price,
    sessionMin: typeof d?.consultationDurationMin === 'number' ? d.consultationDurationMin : TUTOR_DEFAULTS.durationMin,
    bufferMin: typeof d?.bufferMin === 'number' && d.bufferMin > 0 ? d.bufferMin : 0,
    availability: Array.isArray(d?.availability) ? d.availability : [],
    busySlots: Array.isArray(d?.busySlots) ? d.busySlots : [],
    consultations: Array.isArray(d?.consultations) ? d.consultations : [],
    categorySlug: typeof d?.category?.slug === 'string' ? d.category.slug : null,
  }
}
