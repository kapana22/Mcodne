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

// POST /api/messages caps `fileUrl` at 3M chars (see the zod schema there) —
// attachments are stored inline as base64 data URLs, not in a bucket. Images
// come back downscaled and land far under it; a PDF is stored byte-for-byte, so
// anything over ~2 MB blows the cap. Checking the encoded length here turns a
// confusing generic „INVALID" from the send into an honest message at attach
// time, before the user has typed anything.
const MAX_STORED_URL_CHARS = 3_000_000

/* An earlier pre-booking („შეკითხვა ჯავშნამდე") conversation with the same
   partner. The inbox suppresses that thread once a booking exists (one person =
   one row), so its history has no entry point of its own — the booking thread
   surfaces this link instead. Present only when the API found one in this space,
   and only on the initial (non-`since`) load. */
export type ThreadPre = { userId: string; href: string }

export type ThreadPair = {
  // tutorProfileId + price are present only when the peer is an EXPERT (TUTOR) —
  // they drive the price + „დაჯავშნე" CTA on the student-side pre-booking header.
  otherUser: { id: string; fullName: string; avatarUrl?: string | null; role: string; tutorProfileId?: string | null; price?: number | null }
}

/* Append a server row exactly ONCE. The 20s poll and the POST/call response can
   deliver the same message, so a blind append (or a tmp→real rename while the
   real row is already in the list) leaves two bubbles sharing one id — React
   then warns on the duplicate key and the user sees their message twice. When
   the id is already present the incoming row is dropped and any optimistic
   `tmpId` is simply removed instead of renamed. */
const upsert = (prev: ChatMessage[], row: ChatMessage, tmpId?: string): ChatMessage[] => {
  const rest = tmpId ? prev.filter(m => m.id !== tmpId) : prev
  return rest.some(m => m.id === row.id) ? rest : [...rest, row]
}

/* All thread logic for one conversation — either a booking-scoped thread
   (`bookingId`) OR a pre-booking pair thread (`withUser`, messages with
   bookingId:null between a student and an expert-user). Whichever id is set
   drives the fetch (GET ?bookingId / ?withUser) and the send (POST bookingId /
   toUserId). 20s visibility-gated polling (the GET also stamps read receipts
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
  const [preThread, setPreThread] = useState<ThreadPre | null>(null)
  /** ⚠️ HOW FAR THE OTHER SIDE HAS READ (2026-08-21) — an ISO stamp, not a flag
   *  per message, because the incremental `?since` poll only ever carries NEW
   *  rows: „they read what you sent an hour ago" is a change to an old row and
   *  can only arrive as its own value. `/api/messages` answers it on every
   *  response; anything of mine created at or before it has been read. */
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null)
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

  // Latest msgs snapshot for the poller (avoids re-subscribing the interval on
  // every message) + a flag marking the first full fetch as done.
  const msgsRef = useRef<ChatMessage[]>(msgs)
  useEffect(() => { msgsRef.current = msgs }, [msgs])
  const fetchedRef = useRef(false)

  // Poll while visible. Keeps in-flight optimistic bubbles (tmp-*) — a poll
  // landing between append and the POST response must not wipe them.
  useEffect(() => {
    if (!bookingId && !withUser) return
    fetchedRef.current = false // fresh thread → next fetch is a full load
    // Booking mode keeps the exact `/api/messages?bookingId=` URL; pair mode
    // targets the ?withUser endpoint. Whichever id is set drives the poll.
    const base = withUser
      ? `/api/messages?withUser=${withUser}`
      : `/api/messages?bookingId=${bookingId}`
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        // After the first full fetch, request ONLY messages newer than the
        // latest real one we hold — a poll with nothing new is a few bytes, not
        // the whole thread. Optimistic tmp-* rows don't count toward `since`.
        const reals = msgsRef.current.filter(m => !m.id.startsWith('tmp-'))
        const since = fetchedRef.current && reals.length ? reals[reals.length - 1].createdAt : null
        const res = await fetch(since ? `${base}&since=${encodeURIComponent(since)}` : base)
        if (!res.ok || cancelled) return
        const j = await res.json().catch(() => null)
        if (cancelled || !j?.ok || !Array.isArray(j.messages)) return
        if (since) {
          // Incremental: append only genuinely-new rows; keep optimistic bubbles.
          if (j.messages.length) {
            setMsgs(prev => {
              const have = new Set(prev.map((m: ChatMessage) => m.id))
              const fresh = j.messages.filter((m: ChatMessage) => !have.has(m.id))
              if (!fresh.length) return prev
              const tmp = prev.filter((m: ChatMessage) => m.id.startsWith('tmp-'))
              const real = prev.filter((m: ChatMessage) => !m.id.startsWith('tmp-'))
              if (onActivity) onActivity()
              return [...real, ...fresh, ...tmp]
            })
          }
        } else {
          setMsgs(prev => {
            const next = [...j.messages, ...prev.filter((m: ChatMessage) => m.id.startsWith('tmp-'))]
            if (next.length > prev.length && onActivity) onActivity()
            return next
          })
        }
        // Header (booking/pair) only arrives on the initial full fetch.
        if (j.booking) setBooking(j.booking)
        if (j.pair) setPair(j.pair)
        // Present on every response, incremental included — and `null` is a
        // real answer („they have read nothing yet"), so the key is tested
        // rather than the value.
        if ('peerReadAt' in (j ?? {})) setPeerReadAt(j.peerReadAt ?? null)
        // Booking mode, initial load only. `null` is a meaningful answer (no
        // earlier pre-booking thread), so only overwrite when the key is present.
        if ('preThread' in (j ?? {})) setPreThread(j.preThread ?? null)
        fetchedRef.current = true
        setLoaded(true)
      } catch {}
    }
    tick()
    const id = setInterval(tick, 20_000)
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
      // A PDF is stored as-is, so an otherwise-legal 8 MB file can still exceed
      // the API's stored-URL cap and would only fail later, on send, with a
      // generic error. Refuse it here instead.
      if (typeof j.url === 'string' && j.url.length > MAX_STORED_URL_CHARS) {
        flashError('ფაილი მიბმისთვის ძალიან დიდია — სცადე შეკუმშული ვერსია (PDF-ისთვის მაქს. 2 MB).')
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
    // TRUE optimistic append — bubble shows instantly; the temp row is
    // replaced by the server row on success, rolled back on failure with the
    // draft restored (the POST takes seconds on the remote-DB dev setup).
    const tempId = `tmp-${Date.now()}`
    const sentText = draft
    const sentAttachment = attachment
    // ONE rollback for BOTH failure paths. An error status and a fetch that
    // REJECTS (offline, dropped connection) must look identical to the user:
    // without this, a rejection escaped the try/finally, the optimistic bubble
    // stayed forever (both poll branches deliberately preserve tmp-* rows), the
    // composer had already been cleared — and the message was silently lost
    // while the UI showed it as sent.
    const rollback = (text: string) => {
      setMsgs(prev => prev.filter(m => m.id !== tempId))
      setDraft(sentText); setAttachment(sentAttachment)
      flashError(text)
    }
    try {
      const body: any = {
        // Exactly one of bookingId / toUserId — matches the API contract.
        ...(withUser ? { toUserId: withUser } : { bookingId }),
        body: draft.trim() || (attachment ? `📎 ${attachment.name}` : ''),
      }
      if (attachment) { body.fileUrl = attachment.url; body.fileName = attachment.name }
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
        rollback(sendErrorText(j?.error, j?.retryInSec))
        return
      }
      // Swap tmp → server row. If a poll already delivered that row, `upsert`
      // drops the duplicate and just removes the optimistic bubble.
      setMsgs(prev => upsert(prev, {
        id: j.message.id,
        fromId: j.message.fromId,
        body: j.message.body,
        createdAt: j.message.createdAt,
        fileUrl: j.message.fileUrl,
        fileName: j.message.fileName,
        from: { id: me.id, fullName: me.fullName, avatarUrl: me.avatarUrl },
      }, tempId))
      onActivity?.()
    } catch {
      // The fetch itself failed (offline / connection dropped) — same rollback
      // as an error response, so the draft is never lost with nothing sent.
      rollback('ქსელის შეცდომა — შეტყობინება ვერ გაიგზავნა. სცადე თავიდან.')
    } finally {
      setSending(false)
    }
  }

  // Instant call: post a video-call invite into the thread (booking threads
  // only). The server mints/reuses the room URL; we append the returned invite
  // message so the sender sees it immediately (the recipient gets it on the
  // next 20s poll + a bell notification).
  const [calling, setCalling] = useState(false)
  const requestCall = async () => {
    if (!me || !bookingId || calling) return
    setCalling(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/call`, { method: 'POST' })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        flashError(j?.error === 'RATE_LIMIT' ? 'ცოტა ხანში სცადე ხელახლა.' : 'ზარის მოთხოვნა ვერ გაიგზავნა.')
        return
      }
      // Same id-dedupe as send(): a poll can land the invite row before this
      // response does, and appending blind would show the card twice.
      setMsgs(prev => upsert(prev, {
        id: j.message.id,
        fromId: j.message.fromId,
        body: j.message.body,
        createdAt: j.message.createdAt,
        fileUrl: j.message.fileUrl,
        fileName: j.message.fileName,
        from: { id: me.id, fullName: me.fullName, avatarUrl: me.avatarUrl },
      }))
      onActivity?.()
    } finally {
      setCalling(false)
    }
  }

  return {
    msgs, booking, pair, preThread, loaded, peerReadAt,
    draft, setDraft,
    attachment, setAttachment, attach, uploading,
    send, sending,
    requestCall, calling,
    error,
  }
}
