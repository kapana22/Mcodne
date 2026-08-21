'use client'
// /tutor/bookings/[id] — the booking shape the expert's view reads, its
// status tone, and the time formatting/countdown it needs.

import { useEffect, useState } from 'react'
import { fmtDateTime as fmtInTz, TBILISI } from '@/lib/tz'
import { type ChatMessage as Message } from '@/components/chat/useBookingThread'

export type BookingStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'


type ReschedulePayload = {
  proposedBy: 'USER' | 'PROVIDER'
  newStartAt: string
  reason: string | null
  proposedAt: string
}

export type BookingReview = {
  id: string
  rating: number
  body: string
  createdAt: string
  anonymous?: boolean
  tutorResponse?: string | null
  respondedAt?: string | null
}

export type Booking = {
  id: string
  ref: string
  topic: string
  status: BookingStatus
  startAt: string
  durationMin: number
  price: number
  meetingUrl?: string | null
  // A BOG/TBC payment page the expert (or an admin) pasted. Display only — no
  // checkout, no webhook, PAYMENTS_LIVE untouched. See app/api/bookings/[id].
  paymentLinkUrl?: string | null
  // Request-based booking: the CLIENT named this time, so it is deliberately
  // not in the expert's published schedule…
  proposedByStudent?: boolean
  // …and these are the other times they said would also work.
  proposedAlternates?: { startAt: string }[] | null
  studentNotes?: string | null
  tutorNotes?: string | null
  student: { id: string; fullName: string; avatarUrl?: string | null; email: string }
  tutor: { id: string; userId: string; user: { id: string; fullName: string; avatarUrl?: string | null } }
  messages: Message[]
  review?: BookingReview | null
  rescheduleRequest?: ReschedulePayload | null
}

export type Me = { id: string; fullName: string; avatarUrl?: string | null; role: string } | null

export const toneOf = (s: BookingStatus) =>
  s === 'PREPARING' ? 'preparing'
  : s === 'CONFIRMED' ? 'confirmed'
  : s === 'LIVE' ? 'live'
  : s === 'COMPLETED' ? 'completed'
  : s === 'CANCELED' ? 'canceled'
  : 'noshow' as const

// SSR-safe: default to Tbilisi so first paint matches server. The page
// re-formats after mount when it learns the user's browser tz.
export const fmtDateTime = (iso: string, tz: string = TBILISI) => {
  const { local } = fmtInTz(iso, {
    weekday: 'short', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
  }, tz)
  return local
}

const fmtTime = (iso: string, tz: string = TBILISI) => {
  const { local } = fmtInTz(iso, { hour: '2-digit', minute: '2-digit' }, tz)
  return local
}

/* Coarse countdown label — ticks every 60s. Same semantics as the student page:
   "დაწყებულია" while in-flight, "დასრულებულია" after end, else formatted delta. */
export const useRemainingLabel = (startAtIso: string, durationMin: number): string => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const start = new Date(startAtIso).getTime()
  if (Number.isNaN(start)) return ''
  const end = start + durationMin * 60_000
  if (now >= end) return 'დასრულებულია'
  if (now >= start) return 'დაწყებულია'
  const diff = start - now
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff / 3_600_000) % 24)
  const mins = Math.max(1, Math.floor((diff / 60_000) % 60))
  if (days > 0) return `${days} დღე · ${hours} სთ`
  if (hours > 0) return `${hours} სთ · ${mins} წთ`
  const totalMin = Math.max(1, Math.ceil(diff / 60_000))
  return `${totalMin} წუთი`
}

// Stale-while-revalidate cache per booking id (same pattern as lib/me.ts) —
// `/api/bookings/[id]` is the slowest endpoint, so re-opening a booking renders
// instantly from cache while a fresh copy loads.
export const tutorBookingCache = new Map<string, Booking>()