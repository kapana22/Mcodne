import type { ServiceType } from '@prisma/client'

// Session-length options an expert may pick for their consultation.
export const CONSULTATION_DURATIONS = [15, 30, 60] as const
export type ConsultationDuration = (typeof CONSULTATION_DURATIONS)[number]

// Kept for backward compatibility only. The product no longer branches the
// student-facing UX by ServiceType — a tutor is bookable "instantly" when
// live now, otherwise via published calendar slots. These helpers still
// return the raw column value for the few internal / analytics callers that
// need it (e.g. Booking.serviceType snapshot).
export const isConsultation = (t?: ServiceType | null): boolean => t === 'CONSULTATION'
export const isRecurring    = (t?: ServiceType | null): boolean => t === 'RECURRING' || !t
