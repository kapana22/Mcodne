'use client'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { StatusPill } from '@/components/StatusPill'
import { fmtKaDateTime } from '@/lib/kaDate'
import type { ThreadBooking } from './useBookingThread'

const toneOf = (s: string) =>
  s === 'PREPARING' ? 'preparing'
  : s === 'CONFIRMED' ? 'confirmed'
  : s === 'LIVE' ? 'live'
  : s === 'COMPLETED' ? 'completed'
  : s === 'CANCELED' ? 'canceled'
  : 'noshow' as const

/* Booking-context header for a chat thread in the messages center: client
   identity + topic/time + status, with a link out to the booking's
   operational page. Back chevron only below lg (mobile full-screen thread). */
export function ThreadHeader({
  booking,
  counterparty,
  peer,
  backHref = '/tutor/messages',
  bookingHref,
  alwaysBack = false,
}: {
  booking: ThreadBooking | null
  counterparty?: { fullName: string; avatarUrl?: string | null } | null
  /** Explicit peer to show — the party across the conversation. The tutor side
      defaults to `booking.student`; the student side passes `booking.tutorUser`
      here (its `booking.student` is the viewer themselves). */
  peer?: { fullName: string; avatarUrl?: string | null } | null
  backHref?: string
  /** Where „ჯავშნის ნახვა" points — defaults to the tutor booking page. */
  bookingHref?: string
  /** Show the back chevron at every width (standalone full-screen thread).
      Default hides it on lg where a conversation list sits beside the pane. */
  alwaysBack?: boolean
}) {
  const other = peer ?? booking?.student ?? counterparty ?? null
  // Pre-booking pair thread: no booking context. Show a subtle pre-inquiry
  // label in place of the StatusPill so the tutor knows this is a prospect who
  // hasn't booked yet, not a client with a live session.
  const isPre = !booking && !!counterparty
  return (
    <div className="px-3 sm:px-5 py-3 border-b border-ink-100 bg-white flex items-center gap-3">
      <Link
        href={backHref}
        aria-label="უკან, მიმოწერების სია"
        className={`${alwaysBack ? '' : 'lg:hidden'} shrink-0 w-9 h-9 -ml-1 rounded-btn inline-flex items-center justify-center text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors`}
      >
        <Icon.chevR className="w-4.5 h-4.5 rotate-180" />
      </Link>
      <Avatar src={other?.avatarUrl ?? undefined} name={other?.fullName} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-[14px] font-bold text-ink-900 truncate">
            {other?.fullName ?? '—'}
          </span>
          {booking && <StatusPill tone={toneOf(booking.status)} />}
          {isPre && (
            <span className="inline-flex items-center h-5 px-2 rounded-pill bg-ink-100 text-ink-600 font-display text-[10.5px] font-semibold">
              წინასწარი შეკითხვა
            </span>
          )}
        </div>
        {booking && (
          <div className="text-[12px] text-ink-500 truncate mt-0.5">
            {booking.topic} · {fmtKaDateTime(new Date(booking.startAt))}
          </div>
        )}
      </div>
      {booking && (
        <Btn variant="ghost" size="sm" href={bookingHref ?? `/tutor/bookings/${booking.id}`} className="shrink-0">
          <span className="hidden sm:inline">ჯავშნის ნახვა</span>
          <Icon.external className="w-4 h-4 sm:hidden" />
        </Btn>
      )}
    </div>
  )
}
