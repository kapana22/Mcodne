'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { BookingChat } from '@/components/chat/BookingChat'
import { ThreadHeader } from '@/components/chat/ThreadHeader'
import type { ChatUser } from '@/components/chat/useBookingThread'

/* Pre-booking PAIR thread in the tutor messages center — a prospect who
   messaged this expert BEFORE booking (bookingId:null). Mirrors the
   booking thread page but points BookingChat at the ?withUser endpoint; the
   header renders the pre-inquiry ThreadHeader (no booking context). Tutors can
   only reply here (the API rejects cold tutor→student initiations). */
export default function TutorPairThreadPage() {
  const params = useParams<{ userId: string }>()
  const userId = params?.userId
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

  // Cheap membership probe — a foreign/invalid pair shows a clear state
  // instead of an eternally-loading chat.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetch(`/api/messages?withUser=${userId}`)
      .then(r => { if (!cancelled && (r.status === 403 || r.status === 404)) setDenied(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  if (!userId) return null

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
      key={userId}
      withUser={userId}
      me={me}
      variant="fill"
      autoFocus
      header={(_booking, pair) => <ThreadHeader booking={null} counterparty={pair?.otherUser} backHref="/tutor/messages" />}
      emptyState={{
        title: 'პროსპექტმა დაგისვა შეკითხვა',
        body: 'უპასუხე დაჯავშნამდე — სწრაფი პასუხი კონსულტაციის დაჯავშნის ალბათობას ზრდის.',
      }}
      onActivity={() => window.dispatchEvent(new Event('mcodne:threads-refresh'))}
    />
  )
}
