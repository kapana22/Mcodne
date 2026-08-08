'use client'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { StatusPill } from '@/components/StatusPill'
import { fmtKaDateTime } from '@/lib/kaDate'
import type { ThreadBooking } from './useBookingThread'

/* Quiet doorway back into the pre-booking („შეკითხვა ჯავშნამდე") conversation
   with this same partner. Once a booking exists the inbox suppresses that thread
   so one person never occupies two rows — which left its Q&A history reachable
   only by hand-typing /…/messages/u/<id>. This is the explicit way in, rendered
   directly under the thread header (only when such a thread actually exists, so
   it never advertises an empty conversation) and deliberately understated: a
   hairline strip, not a CTA. */
export function PreThreadLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-ink-100 bg-ink-50/60 hover:bg-ink-100/70 transition-colors duration-fast group"
    >
      <Icon.chat className="w-3.5 h-3.5 text-ink-400 shrink-0" />
      <span className="text-meta text-ink-600 truncate">ჯავშნამდე უკვე მიწერეთ ერთმანეთს</span>
      <span className="ml-auto shrink-0 font-display text-meta font-semibold text-brand-700 group-hover:text-brand-800">
        ნახე
      </span>
    </Link>
  )
}

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
  showBookCta = false,
}: {
  booking: ThreadBooking | null
  counterparty?: { fullName: string; avatarUrl?: string | null; price?: number | null; tutorProfileId?: string | null } | null
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
  /** Student side only: when the pre-booking peer is an EXPERT, show their
      session price + a „დაჯავშნე" button. Left off on the tutor side (the
      expert must never see their own price/CTA in the prospect thread). */
  showBookCta?: boolean
}) {
  const other = peer ?? booking?.student ?? counterparty ?? null
  // Pre-booking pair thread: no booking context. Show a subtle pre-inquiry
  // label in place of the StatusPill so the tutor knows this is a prospect who
  // hasn't booked yet, not a client with a live session.
  const isPre = !booking && !!counterparty
  // Only in a pre-booking thread where the peer is an expert (has a profile id +
  // price) AND the viewer is the student side (showBookCta). Never on the tutor
  // side or a non-expert peer.
  const bookHref = isPre && showBookCta && counterparty?.tutorProfileId
    ? `/tutors/${counterparty.tutorProfileId}` : null
  const bookPrice = bookHref && typeof counterparty?.price === 'number' ? counterparty.price : null
  return (
    <div className="px-3 sm:px-5 py-3 border-b border-ink-100 bg-white flex items-center gap-3">
      <Link
        href={backHref}
        aria-label="უკან, მიმოწერების სია"
        className={`${alwaysBack ? '' : 'lg:hidden'} shrink-0 w-9 h-10 sm:h-9 -ml-1 rounded-btn inline-flex items-center justify-center text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors duration-fast`}
      >
        <Icon.chevR className="w-4.5 h-4.5 rotate-180" />
      </Link>
      <Avatar src={other?.avatarUrl ?? undefined} name={other?.fullName} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* h2, not a bare span and not an h1: a thread had NO heading at all
              (mobile outline landed on an untitled document), but on desktop the
              two-pane layout already owns the page h1 „მიმოწერა" — making this
              an h1 too produced two. The layout owns the title; the person you
              are talking to is the section beneath it. */}
          <h2 className="font-display text-body font-bold text-ink-900 truncate">
            {other?.fullName ?? '—'}
          </h2>
          {booking && <StatusPill tone={toneOf(booking.status)} />}
          {isPre && (
            <span className="inline-flex items-center h-5 px-2 rounded-pill bg-ink-100 text-ink-600 font-display text-meta font-semibold">
              შეკითხვა ჯავშნამდე
            </span>
          )}
        </div>
        {booking && (
          <div className="text-meta text-ink-500 truncate mt-0.5">
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
      {bookHref && (
        <div className="shrink-0 flex items-center gap-2.5">
          {bookPrice != null && (
            <span className="font-display text-small font-semibold text-ink-500 tabular-nums whitespace-nowrap">
              ₾{bookPrice}<span className="hidden sm:inline"> · სესია</span>
            </span>
          )}
          <Btn variant="primary" size="sm" href={bookHref} className="shrink-0">დაჯავშნე</Btn>
        </div>
      )}
    </div>
  )
}
