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
  backHref = '/tutor/messages',
}: {
  booking: ThreadBooking | null
  counterparty?: { fullName: string; avatarUrl?: string | null } | null
  backHref?: string
}) {
  const other = booking?.student ?? counterparty ?? null
  return (
    <div className="px-3 sm:px-5 py-3 border-b border-ink-100 bg-white flex items-center gap-3">
      <Link
        href={backHref}
        aria-label="უკან, მიმოწერების სია"
        className="lg:hidden shrink-0 w-9 h-9 -ml-1 rounded-btn inline-flex items-center justify-center text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
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
        </div>
        {booking && (
          <div className="text-[12px] text-ink-500 truncate mt-0.5">
            {booking.topic} · {fmtKaDateTime(new Date(booking.startAt))}
          </div>
        )}
      </div>
      {booking && (
        <Btn variant="ghost" size="sm" href={`/tutor/bookings/${booking.id}`} className="shrink-0">
          <span className="hidden sm:inline">ჯავშნის ნახვა</span>
          <Icon.external className="w-4 h-4 sm:hidden" />
        </Btn>
      )}
    </div>
  )
}
