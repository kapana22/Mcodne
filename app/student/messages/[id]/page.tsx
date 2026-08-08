'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { BookingChat } from '@/components/chat/BookingChat'
import { ThreadHeader, PreThreadLink } from '@/components/chat/ThreadHeader'
import type { ChatUser } from '@/components/chat/useBookingThread'
import { useMe } from '@/lib/me'

/* One conversation, full-height — the right pane of the student messages center
   (mobile: full-screen). Mirrors the tutor thread page: BookingChat owns the
   polling/read-marking and its header slot renders the booking-context
   ThreadHeader (peer = the expert). After sends/receives we ping the layout's
   ConversationList so previews/unread stay in sync without a second poll loop. */
export default function StudentMessageThreadPage() {
  const params = useParams<{ id: string }>()
  const bookingId = params?.id
  const { me: rawMe } = useMe()
  const me: ChatUser | null = rawMe ? { id: rawMe.id, fullName: rawMe.fullName, avatarUrl: rawMe.avatarUrl } : null
  const [denied, setDenied] = useState(false)

  // Cheap membership probe so a foreign/deleted booking shows a clear state
  // instead of an eternally-loading chat (BookingChat polls silently on 403).
  // `&probe=1` runs the SAME guards but returns just `{ ok }` — without it this
  // re-fetched the entire thread (up to 200 messages, attachments included) that
  // BookingChat is already fetching, purely to read a status code.
  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    fetch(`/api/messages?bookingId=${bookingId}&probe=1`)
      .then(r => { if (!cancelled && (r.status === 403 || r.status === 404)) setDenied(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [bookingId])

  if (!bookingId) return null

  if (denied) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ink-100 text-ink-500 mb-3">
          <Icon.warn className="w-6 h-6" />
        </span>
        <div className="font-display text-body-lg font-semibold text-ink-800">მიმოწერა ვერ მოიძებნა</div>
        <p className="text-small text-ink-500 mt-1">წაიშალა, ან არ არის შენი.</p>
        <div className="mt-4"><Btn variant="secondary" size="sm" href="/student/messages">სიაში დაბრუნება</Btn></div>
      </div>
    )
  }

  return (
    <BookingChat
      key={bookingId}
      bookingId={bookingId}
      me={me}
      variant="fill"
      autoFocus
      emptyState={{ title: 'დაიწყე საუბარი', body: 'დასვი კითხვა ან დააზუსტე დეტალები კონსულტაციამდე.' }}
      header={(booking, _pair, preThread) => (
        <>
          <ThreadHeader
            booking={booking}
            peer={booking?.tutorUser}
            backHref="/student/messages"
            bookingHref={booking ? `/student/bookings/${booking.id}` : undefined}
          />
          {/* The pre-booking Q&A with this expert, if there was one — the inbox
              folds it into this thread, so this is its only entry point. */}
          {preThread && <PreThreadLink href={preThread.href} />}
        </>
      )}
      onActivity={() => window.dispatchEvent(new Event('mcodne:threads-refresh'))}
    />
  )
}
