'use client'
// Pre-booking PAIR thread — /student/messages/u/[userId].
//
// A prospect (or a dual-role expert acting as a CLIENT) messaging an expert
// BEFORE booking a session — the objection handler for high-stakes one-off
// consultations. Points BookingChat at the ?withUser pair endpoint (bookingId:
// null messages between this user and the expert-user). Mirrors the tutor twin
// (app/tutor/messages/u/[userId]/page.tsx) and the booking thread
// (app/student/messages/[id]/page.tsx): it returns BookingChat directly and lets
// the messages layout own the height — it must NOT set its own h-[100dvh], or
// the composer is pushed past the layout's overflow-hidden frame and clipped.
// BottomNav hides itself on this focused route so the composer owns the bottom.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { BookingChat } from '@/components/chat/BookingChat'
import { ThreadHeader } from '@/components/chat/ThreadHeader'
import type { ChatUser } from '@/components/chat/useBookingThread'

export default function StudentPairThreadPage() {
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

  // Cheap membership probe — a foreign/invalid pair shows a clear state instead
  // of an eternally-loading chat (BookingChat polls silently on a 403/404 and
  // never flips out of its skeleton without this). `&probe=1` runs the same
  // role/relationship guards and returns just `{ ok }`, so this no longer
  // duplicates the full thread fetch BookingChat fires on mount.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetch(`/api/messages?withUser=${userId}&probe=1`)
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
        <div className="font-display text-body-lg font-semibold text-ink-800">მიმოწერა ვერ მოიძებნა</div>
        <p className="text-small text-ink-500 mt-1">წაიშალა, ან არ არის შენი.</p>
        <div className="mt-4"><Btn variant="secondary" size="sm" href="/student/messages">სიაში დაბრუნება</Btn></div>
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
      header={(_booking, pair) => <ThreadHeader booking={null} counterparty={pair?.otherUser} backHref="/student/messages" alwaysBack showBookCta />}
      emptyState={{
        title: 'დაიწყე საუბარი',
        body: 'აღწერე საკითხი ან დასვი კითხვა დაჯავშნამდე.',
      }}
      onActivity={() => window.dispatchEvent(new Event('mcodne:threads-refresh'))}
    />
  )
}
