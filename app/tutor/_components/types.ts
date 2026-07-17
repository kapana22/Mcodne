export type BookingStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'

export type ReschedulePayload = {
  proposedBy: 'STUDENT' | 'TUTOR'
  newStartAt: string
  reason: string | null
  proposedAt: string
}

export type DashBooking = {
  id: string
  ref: string
  topic: string
  status: BookingStatus
  startAt: string
  durationMin: number
  price: number
  student: { id: string; fullName: string; avatarUrl?: string | null } | null
  rescheduleRequest?: ReschedulePayload | null
}

export const toneOf = (s: BookingStatus) =>
  s === 'PREPARING' ? 'preparing'
  : s === 'CONFIRMED' ? 'confirmed'
  : s === 'LIVE' ? 'live'
  : s === 'COMPLETED' ? 'completed'
  : s === 'CANCELED' ? 'canceled'
  : 'noshow' as const

/** Booking end has passed but it's still CONFIRMED/LIVE — needs a
    complete / no-show decision from the expert. */
export const awaitsClosure = (b: DashBooking, now: number) =>
  (b.status === 'CONFIRMED' || b.status === 'LIVE') &&
  new Date(b.startAt).getTime() + b.durationMin * 60_000 < now

/** Reschedule proposal from the client, waiting on the expert's answer. */
export const awaitsRescheduleAnswer = (b: DashBooking) =>
  (b.status === 'PREPARING' || b.status === 'CONFIRMED') &&
  b.rescheduleRequest?.proposedBy === 'STUDENT'
