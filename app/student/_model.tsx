'use client'
// /student — the workspace's shared shapes: the viewer, a saved expert, a
// discover row, a session and its tab grouping.

import { KA_MONTHS_SHORT_DOT } from '@/lib/kaDate'
import { StatusPill } from '@/components/StatusPill'

export type MeData = { id: string; fullName: string; email: string; avatarUrl?: string | null }

/* ───── Welcome strip ───── */
export const KA_MONTHS_SHORT = KA_MONTHS_SHORT_DOT
export const KA_WEEKDAY_SHORT = ['კვ.','ორშ.','სამშ.','ოთხ.','ხუთ.','პარ.','შაბ.']

/* ───── Saved experts — compact strip. The full list (and the side-by-side
   compare tool) lives at /student/favorites; here the shortlist only reminds
   and links out, so the dashboard stays about the user's sessions. ───── */
export type SavedExpert = {
  id: string
  name: string
  avatar: string | null
  cat: string
  /** The FLAGSHIP price, already formatted — the same field DiscoverTutor
   *  carries, and for the same reason. It was a raw `price` (the flat rate
   *  typed at /apply) while the „რეკომენდებული" strip six rows above it on the
   *  SAME screen resolved the flagship, so one expert could be quoted twice at
   *  two figures without scrolling. */
  priceLabel: string
  rating: number
}

export type FavState = 'loading' | 'ready' | 'error'

/* ───── Discover experts — real API, shown even when wishlist empty ───── */
export type DiscoverTutor = {
  id: string
  name: string
  avatar: string | null
  headline: string
  specialty: string
  category: string
  rating: number
  reviews: number
  /** Already-resolved FLAGSHIP price label („₾80" / „უფასო"), not a raw number —
   *  a free flagship has to be able to say „უფასო", which a number cannot. */
  priceLabel: string
  verified: boolean
}

/* ───── Session data ───── */
export type SessionStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled'

export type Session = {
  id: string
  /** Underlying TutorProfile.id — required for the rebook link. Optional
      because a booking whose tutor was deleted carries no tutor id; the
      rebook CTA falls back to /tutors when missing. */
  tutorId?: string
  expert: { name: string; avatarUrl: string | null; cat: string; headline: string }
  topic: string
  /** Raw ISO start instant — the display strings below are pre-formatted, so
      the cancel-policy math (time-to-start vs CANCEL_CUTOFF_HOURS) needs this. */
  startAt: string
  date: string
  day: string
  time: string
  duration: number
  price: number
  status: SessionStatus
  reviewed?: boolean
}

/* ───── Session row ───── */
export const StatusBadge = ({ s }: { s: SessionStatus }) => {
  // Delegate to the shared <StatusPill> so a given booking state carries the
  // exact same label AND tone here, on /student/bookings, and on the tutor
  // side — the previous local copy had drifted ("ელოდება დადასტურებას" vs
  // the canonical "მზადდება").
  const tone = { confirmed: 'confirmed', pending: 'preparing', completed: 'completed', cancelled: 'canceled' } as const
  return <StatusPill tone={tone[s]} />
}

/* ───── Sessions panel with tabs ───── */
export type Tab = 'upcoming' | 'past' | 'cancelled'

// Bucket upcoming sessions into day-relative groups so a long list stays
// scannable (the pattern top scheduling apps use — Time2book, Jobber). Only
// non-empty groups are returned, in chronological order.
export function groupUpcoming(rows: Session[]): { key: string; label: string; items: Session[] }[] {
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const today0 = startOfDay(new Date()).getTime()
  const dayDiff = (iso: string) => Math.round((startOfDay(new Date(iso)).getTime() - today0) / 86_400_000)
  const groups = [
    { key: 'today',    label: 'დღეს',         items: [] as Session[] },
    { key: 'tomorrow', label: 'ხვალ',         items: [] as Session[] },
    { key: 'week',     label: 'ამ კვირაში',   items: [] as Session[] },
    { key: 'later',    label: 'მოგვიანებით',  items: [] as Session[] },
  ]
  for (const s of rows) {
    const d = dayDiff(s.startAt)
    if (d <= 0) groups[0].items.push(s)
    else if (d === 1) groups[1].items.push(s)
    else if (d <= 7) groups[2].items.push(s)
    else groups[3].items.push(s)
  }
  return groups.filter(g => g.items.length > 0)
}