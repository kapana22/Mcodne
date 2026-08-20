'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { BookingChat } from '@/components/chat/BookingChat'
import { ThreadHeader, PreThreadLink } from '@/components/chat/ThreadHeader'
import type { ChatUser } from '@/components/chat/useBookingThread'

/* One conversation, full-height. BookingChat owns the polling/read-marking;
   its header slot renders the booking-context ThreadHeader from the same
   thread GET. After sends/receives we ping the layout's ConversationList so
   previews/unread stay in sync without a second poll loop. */
export default function TutorMessageThreadPage() {
  const params = useParams<{ bookingId: string }>()
  const bookingId = params?.bookingId
  const [me, setMe] = useState<ChatUser | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => r.json())
      .then(j => { if (!cancelled) setMe(j?.user ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Cheap membership probe so a foreign/deleted booking shows a clear state
  // instead of an eternally-loading chat (BookingChat polls silently on 403).
  // `&probe=1` runs the SAME guards but returns just `{ ok }` — without it this
  // re-fetched the entire thread that BookingChat is already fetching, purely to
  // read a status code.
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
        <div className="mt-4"><Btn variant="secondary" size="sm" href="/work/messages">სიაში დაბრუნება</Btn></div>
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
      header={(booking, _pair, preThread) => (
        <>
          <ThreadHeader booking={booking} />
          {/* This client's pre-booking inquiry, if there was one — the inbox
              folds it into this thread, so this is its only entry point. */}
          {preThread && <PreThreadLink href={preThread.href} />}
        </>
      )}
      onActivity={() => window.dispatchEvent(new Event('mcodne:threads-refresh'))}
    />
  )
}
