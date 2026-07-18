'use client'
import { useEffect, useRef, useState } from 'react'
import { sendErrorText } from '@/lib/msgText'

export type ChatUser = { id: string; fullName: string; avatarUrl?: string | null }

export type ChatMessage = {
  id: string
  fromId: string
  body: string
  createdAt: string
  from: ChatUser
  fileUrl?: string | null
  fileName?: string | null
}

export type ThreadBooking = {
  id: string
  ref: string
  topic: string
  status: string
  startAt: string
  durationMin: number
  student: ChatUser
  tutorUser: ChatUser
}

export type Attachment = { url: string; name: string; type: string; size: number }

export type ThreadPair = {
  otherUser: { id: string; fullName: string; avatarUrl?: string | null; role: string }
}

/* All thread logic for one conversation — either a booking-scoped thread
   (`bookingId`) OR a pre-booking pair thread (`withUser`, messages with
   bookingId:null between a student and an expert-user). Whichever id is set
   drives the fetch (GET ?bookingId / ?withUser) and the send (POST bookingId /
   toUserId). 15s visibility-gated polling (the GET also stamps read receipts
   server-side), true-optimistic send with rollback + draft restore, and
   attachment upload. UI-free — the BookingChat component renders on top. */
export function useBookingThread({
  bookingId,
  withUser,
  me,
  initialMessages,
  onActivity,
}: {
  bookingId?: string
  withUser?: string
  me: ChatUser | null
  initialMessages?: ChatMessage[]
  onActivity?: () => void
}) {
  const [msgs, setMsgs] = useState<ChatMessage[]>(initialMessages ?? [])
  const [booking, setBooking] = useState<ThreadBooking | null>(null)
  const [pair, setPair] = useState<ThreadPair | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(!!initialMessages)
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashError = (text: string) => {
    setError(text)
    if (errTimer.current) clearTimeout(errTimer.current)
    errTimer.current = setTimeout(() => setError(null), 4000)
  }

  // Poll while visible. Keeps in-flight optimistic bubbles (tmp-*) — a poll
  // landing between append and the POST response must not wipe them.
  useEffect(() => {
    if (!bookingId && !withUser) return
    // Booking mode keeps the exact `/api/messages?bookingId=` URL; pair mode
    // targets the ?withUser endpoint. Whichever id is set drives the poll.
    const url = withUser
      ? `/api/messages?withUser=${withUser}`
      : `/api/messages?bookingId=${bookingId}`
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(url)
        if (!res.ok || cancelled) return
        const j = await res.json().catch(() => null)
        if (!cancelled && j?.ok && Array.isArray(j.messages)) {
          setMsgs(prev => {
            const next = [...j.messages, ...prev.filter((m: ChatMessage) => m.id.startsWith('tmp-'))]
            if (next.length > prev.length && onActivity) onActivity()
            return next
          })
          if (j.booking) setBooking(j.booking)
          if (j.pair) setPair(j.pair)
          setLoaded(true)
        }
      } catch {}
    }
    tick()
    const id = setInterval(tick, 15_000)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, withUser])

  useEffect(() => () => { if (errTimer.current) clearTimeout(errTimer.current) }, [])

  const attach = async (f: File) => {
    if (f.size > 8 * 1024 * 1024) { flashError('ფაილი 8 MB-ზე დიდია'); return }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', f)
      form.append('kind', 'attachment')
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        flashError(j?.error === 'TOO_LARGE' ? 'ფაილი დიდია' : j?.error === 'BAD_TYPE' ? 'ფაილის ტიპი დაუშვებელია' : 'ატვირთვა ვერ მოხერხდა')
        return
      }
      setAttachment({ url: j.url, name: j.fileName ?? f.name, type: f.type, size: f.size })
    } catch {
      flashError('ქსელის შეცდომა ატვირთვის დროს')
    } finally { setUploading(false) }
  }

  const send = async () => {
    // `me` may be null if /api/me failed — bail rather than throw on me.id
    // when building the optimistic message row below.
    if (!me || (!draft.trim() && !attachment) || sending) return
    setSending(true)
    try {
      const body: any = {
        // Exactly one of bookingId / toUserId — matches the API contract.
        ...(withUser ? { toUserId: withUser } : { bookingId }),
        body: draft.trim() || (attachment ? `📎 ${attachment.name}` : ''),
      }
      if (attachment) { body.fileUrl = attachment.url; body.fileName = attachment.name }
      // TRUE optimistic append — bubble shows instantly; the temp row is
      // replaced by the server row on success, rolled back on failure with the
      // draft restored (the POST takes seconds on the remote-DB dev setup).
      const tempId = `tmp-${Date.now()}`
      const sentText = draft
      const sentAttachment = attachment
      setMsgs(prev => [...prev, {
        id: tempId,
        fromId: me.id,
        body: body.body,
        createdAt: new Date().toISOString(),
        fileUrl: sentAttachment?.url ?? null,
        fileName: sentAttachment?.name ?? null,
        from: { id: me.id, fullName: me.fullName, avatarUrl: me.avatarUrl },
      }])
      setDraft(''); setAttachment(null)
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setMsgs(prev => prev.filter(m => m.id !== tempId))
        setDraft(sentText); setAttachment(sentAttachment)
        flashError(sendErrorText(j?.error, j?.retryInSec))
        return
      }
      setMsgs(prev => prev.map(m => (m.id === tempId ? {
        id: j.message.id,
        fromId: j.message.fromId,
        body: j.message.body,
        createdAt: j.message.createdAt,
        fileUrl: j.message.fileUrl,
        fileName: j.message.fileName,
        from: { id: me.id, fullName: me.fullName, avatarUrl: me.avatarUrl },
      } : m)))
      onActivity?.()
    } finally {
      setSending(false)
    }
  }

  return {
    msgs, booking, pair, loaded,
    draft, setDraft,
    attachment, setAttachment, attach, uploading,
    send, sending,
    error,
  }
}
