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
  availability: ApiSlot[]
  busySlots: BusySlot[]
  consultations: ConsultationItem[]
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
    availability: Array.isArray(d?.availability) ? d.availability : [],
    busySlots: Array.isArray(d?.busySlots) ? d.busySlots : [],
    consultations: Array.isArray(d?.consultations) ? d.consultations : [],
  }
}
