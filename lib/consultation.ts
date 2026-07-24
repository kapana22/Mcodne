// Session-length options an expert may pick for their consultation.
export const CONSULTATION_DURATIONS = [15, 30, 60] as const
export type ConsultationDuration = (typeof CONSULTATION_DURATIONS)[number]
