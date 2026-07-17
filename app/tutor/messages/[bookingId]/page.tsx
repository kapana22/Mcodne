'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { BookingChat } from '@/components/chat/BookingChat'
import { ThreadHeader } from '@/components/chat/ThreadHeader'
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
  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    fetch(`/api/messages?bookingId=${bookingId}`)
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
        <div className="font-display text-[15px] font-semibold text-ink-800">მიმოწერა ვერ მოიძებნა</div>
        <p className="text-[12.5px] text-ink-500 mt-1">შესაძლოა წაიშალა, ან არ არის შენი.</p>
        <div className="mt-4"><Btn variant="secondary" size="sm" href="/tutor/messages">მიმოწერების სია</Btn></div>
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
      header={booking => <ThreadHeader booking={booking} />}
      onActivity={() => window.dispatchEvent(new Event('mcodne:threads-refresh'))}
    />
  )
}
