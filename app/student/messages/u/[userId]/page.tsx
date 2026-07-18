'use client'
// Pre-booking PAIR thread — /student/messages/u/[userId].
//
// A prospect messaging an expert BEFORE booking a session (the objection
// handler for high-stakes one-off consultations). Full-screen chat like the
// booking thread at /student/messages/[id], but pointed at the ?withUser pair
// endpoint (bookingId:null messages between this student and the expert-user).
// BottomNav hides itself on this focused route so the composer owns the bottom.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { BookingChat } from '@/components/chat/BookingChat'
import { ThreadHeader } from '@/components/chat/ThreadHeader'
import type { ChatUser } from '@/components/chat/useBookingThread'

export default function StudentPairThreadPage() {
  const params = useParams<{ userId: string }>()
  const userId = params?.userId
  const [me, setMe] = useState<ChatUser | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => r.json())
      .then(j => { if (!cancelled) setMe(j?.user ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!userId) return null

  return (
    <div className="h-[100dvh] bg-white flex flex-col font-sans text-ink-900 antialiased">
      <BookingChat
        key={userId}
        withUser={userId}
        me={me}
        variant="fill"
        autoFocus
        className="flex-1 min-h-0"
        header={(_booking, pair) => <ThreadHeader booking={null} counterparty={pair?.otherUser} backHref="/student/messages" alwaysBack />}
        emptyState={{
          title: 'დაიწყე საუბარი ექსპერტთან',
          body: 'აღწერე შენი საკითხი ან დასვი კითხვა დაჯავშნამდე — რაც უფრო კონკრეტულია, მით უკეთ მოგცემს პასუხს.',
        }}
      />
    </div>
  )
}
