'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { TutorAppBar } from '@/components/TutorAppBar'
import { Footer } from '@/components/Footer'
import { Avatar } from '@/components/Avatar'
import { StatusPill } from '@/components/StatusPill'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { fmtDateTime as fmtInTz, userTimezone, TBILISI } from '@/lib/tz'
import { safeHttpUrl } from '@/lib/safeUrl'

type BookingStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'

type Message = {
  id: string
  fromId: string
  body: string
  createdAt: string
  from: { id: string; fullName: string; avatarUrl?: string | null }
  fileUrl?: string | null
  fileName?: string | null
}

type ReschedulePayload = {
  proposedBy: 'STUDENT' | 'TUTOR'
  newStartAt: string
  reason: string | null
  proposedAt: string
}

type Booking = {
  id: string
  ref: string
  topic: string
  status: BookingStatus
  startAt: string
  durationMin: number
  price: number
  meetingUrl?: string | null
  studentNotes?: string | null
  tutorNotes?: string | null
  student: { id: string; fullName: string; avatarUrl?: string | null; email: string }
  tutor: { id: string; userId: string; user: { id: string; fullName: string; avatarUrl?: string | null } }
  messages: Message[]
  rescheduleRequest?: ReschedulePayload | null
}

type Me = { id: string; fullName: string; avatarUrl?: string | null; role: string } | null

const toneOf = (s: BookingStatus) =>
  s === 'PREPARING' ? 'preparing'
  : s === 'CONFIRMED' ? 'confirmed'
  : s === 'LIVE' ? 'live'
  : s === 'COMPLETED' ? 'completed'
  : s === 'CANCELED' ? 'canceled'
  : 'noshow' as const

// SSR-safe: default to Tbilisi so first paint matches server. The page
// re-formats after mount when it learns the user's browser tz.
const fmtDateTime = (iso: string, tz: string = TBILISI) => {
  const { local } = fmtInTz(iso, {
    weekday: 'short', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
  }, tz)
  return local
}

const fmtTime = (iso: string, tz: string = TBILISI) => {
  const { local } = fmtInTz(iso, { hour: '2-digit', minute: '2-digit' }, tz)
  return local
}

/* Coarse countdown label — ticks every 60s. Same semantics as the student page:
   "დაწყებულია" while in-flight, "დასრულებულია" after end, else formatted delta. */
const useRemainingLabel = (startAtIso: string, durationMin: number): string => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const start = new Date(startAtIso).getTime()
  if (Number.isNaN(start)) return ''
  const end = start + durationMin * 60_000
  if (now >= end) return 'დასრულებულია'
  if (now >= start) return 'დაწყებულია'
  const diff = start - now
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff / 3_600_000) % 24)
  const mins = Math.max(1, Math.floor((diff / 60_000) % 60))
  if (days > 0) return `${days} დღე · ${hours} სთ`
  if (hours > 0) return `${hours} სთ · ${mins} წთ`
  const totalMin = Math.max(1, Math.ceil(diff / 60_000))
  return `${totalMin} წუთი`
}

export default function TutorBookingDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const bookingId = params?.id
  const [me, setMe] = useState<Me>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [msgs, setMsgs] = useState<Message[]>([])
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Post-session summary state — mirrored from the booking on first load.
  const [tutorNotes, setTutorNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  // Reschedule proposal drawer + response state.
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleBusy, setRescheduleBusy] = useState<'accept' | 'reject' | 'send' | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('14:00')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [rescheduleErr, setRescheduleErr] = useState<string | null>(null)
  // Detect user's browser tz on mount; SSR/first paint uses Tbilisi.
  const [tz, setTz] = useState<string>(TBILISI)
  useEffect(() => { setTz(userTimezone()) }, [])

  // Countdown label is derived from the current booking (or empty string when
  // still loading) — kept up top so the hook order stays stable across the
  // notFound / loading early-returns below.
  const remainingLabel = useRemainingLabel(booking?.startAt ?? '', booking?.durationMin ?? 0)

  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    ;(async () => {
      try {
        const [meRes, bRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()),
          fetch(`/api/bookings/${bookingId}`),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        if (bRes.status === 401) { window.location.href = `/signin?redirect=/tutor/bookings/${bookingId}`; return }
        if (bRes.status === 404) { setNotFound(true); return }
        // Any other non-OK (403/500) → treat as not-found rather than storing an
        // error JSON as `booking` (which renders Invalid Date + undefined topic).
        if (!bRes.ok) { setNotFound(true); return }
        const data = await bRes.json()
        setBooking(data)
        setMsgs(data.messages ?? [])
        setTutorNotes(data.tutorNotes ?? '')
      } catch {
        if (!cancelled) setFlash({ kind: 'err', text: 'მონაცემების ჩატვირთვა ვერ მოხერხდა' })
      }
    })()
    return () => { cancelled = true }
  }, [bookingId])

  useEffect(() => {
    if (window.location.hash === '#chat') {
      setTimeout(() => document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
    }
  }, [booking?.id])

  // Poll the thread while the tab is visible — the client's messages used to
  // appear only on a full page reload. The endpoint also stamps read receipts
  // (we're looking at the thread), which clears inbox unread dots.
  useEffect(() => {
    if (!bookingId || !booking) return
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`/api/messages?bookingId=${bookingId}`)
        if (!res.ok || cancelled) return
        const j = await res.json().catch(() => null)
        // Keep any in-flight optimistic bubbles (tmp-*) — a poll landing
        // between append and the POST response must not wipe them.
        if (!cancelled && j?.ok && Array.isArray(j.messages)) {
          setMsgs(prev => [...j.messages, ...prev.filter(m => m.id.startsWith('tmp-'))])
        }
      } catch {}
    }
    tick()
    const id = setInterval(tick, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [bookingId, booking?.id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length])

  const showFlash = (kind: 'ok' | 'err', text: string) => {
    setFlash({ kind, text })
    setTimeout(() => setFlash(null), 3500)
  }

  const act = async (action: 'accept' | 'decline' | 'complete' | 'no_show') => {
    if (!booking) return
    setBusy(action)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        const msg =
          j.error === 'BAD_STATE' ? 'ჯავშნის სტატუსი ამას აღარ უშვებს'
          : j.error === 'TOO_EARLY' ? 'სესია ჯერ არ დაწყებულა — no-show ჯერ ვერ მოინიშნება'
          : 'მოქმედება ვერ შესრულდა'
        showFlash('err', msg)
        return
      }
      setBooking(b => b ? { ...b, status: j.status as BookingStatus } : b)
      // Invalidate the server-cached tutor bookings list so navigating back
      // reflects the new status (e.g. accepted booking moves out of Pending).
      router.refresh()
      const okMsg =
        action === 'accept' ? 'დადასტურდა'
        : action === 'decline' ? 'უარყოფილია'
        : action === 'no_show' ? 'აღინიშნა როგორც no-show'
        : 'დასრულებულია'
      showFlash('ok', okMsg)
    } catch {
      showFlash('err', 'ქსელის შეცდომა')
    } finally {
      setBusy(null)
    }
  }

  // Persist the tutor's post-session summary. Guarded server-side to COMPLETED
  // bookings only — a client-side status check here is just a UX prefilter.
  const saveTutorNotes = async () => {
    if (!booking || notesSaving) return
    setNotesSaving(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorNotes: tutorNotes.slice(0, 1500) }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        showFlash('err', j?.error === 'BAD_STATE' ? 'ჯავშანი არ არის დასრულებული' : 'შენახვა ვერ მოხერხდა')
        return
      }
      setBooking(b => b ? { ...b, tutorNotes: j.tutorNotes ?? null } : b)
      router.refresh()
      showFlash('ok', 'შემაჯამებელი შენახულია')
    } catch { showFlash('err', 'ქსელის შეცდომა') }
    finally { setNotesSaving(false) }
  }

  // Propose a new time. Server validates lead time + tutor availability slot.
  const openReschedule = () => {
    if (!booking) return
    // Seed with a plausible default: tomorrow at the same time as the current
    // booking so the tutor typically only needs to nudge the date.
    const t = new Date(booking.startAt)
    t.setDate(t.getDate() + 1)
    setRescheduleDate(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)
    setRescheduleTime(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`)
    setRescheduleReason('')
    setRescheduleErr(null)
    setRescheduleOpen(true)
  }

  const submitReschedule = async () => {
    if (!booking || rescheduleBusy) return
    const target = new Date(`${rescheduleDate}T${rescheduleTime}:00`)
    if (Number.isNaN(target.getTime()) || target.getTime() < Date.now()) {
      setRescheduleErr('აირჩიე მომავალი დრო'); return
    }
    setRescheduleBusy('send'); setRescheduleErr(null)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStartAt: target.toISOString(), reason: rescheduleReason.trim() || undefined }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setRescheduleErr(
          j?.error === 'TOO_SOON' ? 'დრო ძალიან ახლოსაა — მინიმუმ 1 საათი წინ'
          : j?.error === 'NO_SLOT' ? 'ხელმისაწვდომობის სლოტი აქ არ არის'
          : j?.error === 'BAD_STATE' ? 'ჯავშნის სტატუსი ამას აღარ უშვებს'
          : 'გაგზავნა ვერ მოხერხდა',
        )
        return
      }
      setBooking(b => b ? { ...b, rescheduleRequest: j.rescheduleRequest, status: 'PREPARING' } : b)
      setRescheduleOpen(false)
      router.refresh()
      showFlash('ok', 'გადადების მოთხოვნა გაიგზავნა')
    } catch { setRescheduleErr('ქსელის შეცდომა') }
    finally { setRescheduleBusy(null) }
  }

  // Accept or reject the counter-party's proposal.
  const respondReschedule = async (accept: boolean) => {
    if (!booking || rescheduleBusy) return
    setRescheduleBusy(accept ? 'accept' : 'reject')
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { showFlash('err', 'მოქმედება ვერ შესრულდა'); return }
      // Clear the pending request locally; if accepted, patch startAt too.
      setBooking(b => {
        if (!b) return b
        const next: Booking = { ...b, rescheduleRequest: null, status: 'CONFIRMED' }
        if (accept && j.newStartAt) next.startAt = j.newStartAt
        return next
      })
      router.refresh()
      showFlash('ok', accept ? 'გადადება დადასტურდა' : 'გადადება უარყოფილია')
    } catch { showFlash('err', 'ქსელის შეცდომა') }
    finally { setRescheduleBusy(null) }
  }

  const cancelBooking = async () => {
    if (!booking) return
    if (!confirm('დაადასტურე ჯავშნის გაუქმება')) return
    setBusy('cancel')
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, { method: 'POST' })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        showFlash('err', 'გაუქმება ვერ მოხერხდა')
        return
      }
      setBooking(b => b ? { ...b, status: 'CANCELED' } : b)
      router.refresh()
      showFlash('ok', 'ჯავშანი გაუქმდა')
    } finally {
      setBusy(null)
    }
  }

  const pickFile = () => fileInputRef.current?.click()

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 8 * 1024 * 1024) { showFlash('err', 'ფაილი 8 MB-ზე დიდია'); return }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', f)
      form.append('kind', 'attachment')
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        showFlash('err', j?.error === 'TOO_LARGE' ? 'ფაილი დიდია' : j?.error === 'BAD_TYPE' ? 'ფაილის ტიპი დაუშვებელია' : 'ატვირთვა ვერ მოხერხდა')
        return
      }
      setAttachment({ url: j.url, name: j.fileName ?? f.name, type: f.type, size: f.size })
    } catch {
      showFlash('err', 'ქსელის შეცდომა ატვირთვის დროს')
    } finally { setUploading(false) }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    // `me` may be null if /api/me failed — bail rather than throw on me!.id
    // when building the optimistic message row below.
    if (!me || !booking || (!msgText.trim() && !attachment) || sending) return
    setSending(true)
    try {
      const body: any = {
        bookingId: booking.id,
        body: msgText.trim() || (attachment ? `📎 ${attachment.name}` : ''),
      }
      if (attachment) { body.fileUrl = attachment.url; body.fileName = attachment.name }
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        showFlash('err', 'შეტყობინება ვერ გაიგზავნა')
        return
      }
      setMsgs(prev => [...prev, {
        id: j.message.id,
        fromId: j.message.fromId,
        body: j.message.body,
        createdAt: j.message.createdAt,
        fileUrl: j.message.fileUrl,
        fileName: j.message.fileName,
        from: { id: me!.id, fullName: me!.fullName, avatarUrl: me!.avatarUrl },
      }])
      setMsgText(''); setAttachment(null)
      // Bubble the mutation up so `/tutor/messages` (server-rendered inbox)
      // reflects the new thread on next navigation instead of a stale cache.
      router.refresh()
    } finally {
      setSending(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-ink-50 flex flex-col">
        <TutorAppBar user={me ? { name: me.fullName, avatar: me.avatarUrl ?? undefined } : undefined} />
        <main className="flex-1 px-6 py-8 max-w-[720px] w-full mx-auto">
          <div className="p-12 rounded-card border border-ink-200 bg-white text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center mb-3">
              <Icon.warn className="w-6 h-6" />
            </div>
            <div className="font-display text-[17px] font-semibold text-ink-800">ჯავშანი ვერ მოიძებნა</div>
            <div className="text-[13px] text-ink-500 mt-1">შესაძლოა წაიშალა, ან არ არის თქვენი.</div>
            <div className="mt-5"><Btn href="/tutor/bookings" variant="secondary" size="sm">ჯავშნების სია</Btn></div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-ink-50 flex flex-col">
        <TutorAppBar user={me ? { name: me.fullName, avatar: me.avatarUrl ?? undefined } : undefined} />
        <main className="flex-1 px-6 py-8 max-w-[900px] w-full mx-auto">
          <div className="p-12 rounded-card border border-ink-200 bg-white flex items-center justify-center text-ink-400">
            <span className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-[13px]">იტვირთება…</span>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const future = new Date(booking.startAt) > new Date()
  const canAcceptDecline = booking.status === 'PREPARING'
  const canCancel = future && (booking.status === 'CONFIRMED' || booking.status === 'PREPARING')
  const canComplete = booking.status === 'CONFIRMED' || booking.status === 'LIVE'
  const canJoin = (booking.status === 'CONFIRMED' || booking.status === 'LIVE') && booking.meetingUrl
  // "Student didn't show up" — only after the session's scheduled start.
  const canMarkNoShow = !future && (booking.status === 'CONFIRMED' || booking.status === 'LIVE')
  const showRemainingPill = booking.status !== 'CANCELED' && booking.status !== 'NO_SHOW'

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <TutorAppBar user={me ? { name: me.fullName, avatar: me.avatarUrl ?? undefined } : undefined} />

      <main className="flex-1 px-6 py-8 max-w-[900px] w-full mx-auto">
        <div className="mb-5 flex items-center gap-3 text-[13px] text-ink-500">
          <Link href="/tutor/bookings" className="hover:text-ink-800 inline-flex items-center gap-1"><Icon.arrow className="w-3.5 h-3.5 rotate-180" /> ჯავშნების სია</Link>
          <span className="text-ink-300">·</span>
          <span className="font-mono text-[11.5px] text-ink-400">{booking.ref.slice(0, 12)}</span>
        </div>

        {flash && (
          <div className={`mb-4 p-3 rounded-btn text-[13px] border ${flash.kind === 'ok' ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>
            {flash.text}
          </div>
        )}

        {/* Pending reschedule proposal — banner drives the accept/reject
            decision when the other party proposed. Otherwise renders as a
            passive "waiting" note. */}
        {booking.rescheduleRequest && (() => {
          const req = booking.rescheduleRequest
          // On the tutor page, "iProposed" means we (the tutor) sent it.
          const iProposed = req.proposedBy === 'TUTOR'
          return (
            <div className="mb-4 rounded-card border border-warning-200 bg-warning-50 p-5 flex items-start gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-warning-800 mb-1">
                  {iProposed ? 'გადადების მოთხოვნა გაგზავნილია' : 'კლიენტმა ითხოვა გადადება'}
                </div>
                <div className="font-display text-[14.5px] font-bold text-ink-900">
                  ახალი დრო: {fmtDateTime(req.newStartAt, tz)}
                  {tz !== TBILISI && (
                    <span className="ml-1 font-normal text-[11.5px] text-ink-500">
                      (თბილისის დროით: {fmtDateTime(req.newStartAt, TBILISI)})
                    </span>
                  )}
                </div>
                {req.reason && <p className="mt-1 text-[13px] text-ink-700 leading-[1.5] whitespace-pre-wrap">„{req.reason}"</p>}
                {iProposed && <p className="mt-1 text-[12px] text-ink-500">ველოდებით კლიენტის დადასტურებას.</p>}
              </div>
              {!iProposed && (
                <div className="flex items-center gap-2 shrink-0">
                  <Btn variant="secondary" size="md" onClick={() => respondReschedule(false)} disabled={rescheduleBusy !== null}>
                    {rescheduleBusy === 'reject' ? '…' : 'უარი'}
                  </Btn>
                  <Btn variant="primary" size="md" onClick={() => respondReschedule(true)} disabled={rescheduleBusy !== null}>
                    {rescheduleBusy === 'accept' ? '…' : 'დადასტურება'}
                  </Btn>
                </div>
              )}
            </div>
          )
        })()}

        <div className="rounded-card border border-ink-200 bg-white shadow-xs overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-ink-100">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <StatusPill tone={toneOf(booking.status)} />
                  {booking.status === 'PREPARING' && (
                    <span className="text-[11.5px] text-warning-700 font-semibold">ელოდება თქვენს პასუხს</span>
                  )}
                </div>
                <h1 className="font-display text-[22px] sm:text-[26px] font-bold tracking-tight text-ink-900">{booking.topic}</h1>
                <div className="text-[13px] text-ink-500 mt-2 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3.5 h-3.5" />{fmtDateTime(booking.startAt, tz)}</span>
                  <span className="inline-flex items-center gap-1"><Icon.clock className="w-3.5 h-3.5" />{booking.durationMin} წუთი</span>
                  <span className="font-display font-bold text-ink-800">₾{booking.price}</span>
                </div>
                {tz !== TBILISI && (
                  <div className="mt-1 text-[11.5px] text-ink-400">
                    (თბილისის დროით: {fmtDateTime(booking.startAt, TBILISI)})
                  </div>
                )}
                {showRemainingPill && remainingLabel && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-brand-50 border border-brand-200 text-[12px] font-display font-semibold text-brand-800">
                      <Icon.clock className="w-3 h-3" />
                      {remainingLabel === 'დაწყებულია' || remainingLabel === 'დასრულებულია'
                        ? remainingLabel
                        : <>დაწყებამდე დარჩა · <span className="tabular-nums">{remainingLabel}</span></>}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {canJoin && (
                  <a href={booking.meetingUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 font-display font-medium tracking-wide transition-colors rounded-btn h-10 px-4 text-sm bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white shadow-xs">
                    <Icon.video className="w-4 h-4" /> ვიდეო-ოთახი
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 border-b border-ink-100">
            <div className="text-[11.5px] text-ink-500 font-semibold uppercase tracking-wide mb-3">კლიენტი</div>
            <div className="flex items-center gap-3">
              <Avatar src={booking.student.avatarUrl ?? undefined} name={booking.student.fullName} size={56} />
              <div className="min-w-0 flex-1">
                <div className="font-display text-[15px] font-bold text-ink-900 truncate">{booking.student.fullName}</div>
                <div className="text-[12.5px] text-ink-500 truncate">{booking.student.email}</div>
              </div>
            </div>
            {booking.studentNotes && (
              <div className="mt-4 p-3 rounded-btn bg-ink-50 border border-ink-200 text-[13px] text-ink-700 whitespace-pre-wrap">
                <div className="text-[11.5px] text-ink-500 font-semibold uppercase tracking-wide mb-1.5">კლიენტის შენიშვნა</div>
                {booking.studentNotes}
              </div>
            )}
          </div>

          <div className="p-5 sm:p-6 flex flex-wrap gap-2">
            {canAcceptDecline && (
              <>
                <Btn variant="primary" size="md" onClick={() => act('accept')} disabled={busy !== null}>
                  {busy === 'accept' ? 'იგზავნება…' : 'დადასტურება'}
                </Btn>
                <Btn variant="secondary" size="md" onClick={() => act('decline')} disabled={busy !== null}>
                  {busy === 'decline' ? 'იგზავნება…' : 'უარი'}
                </Btn>
              </>
            )}
            {canComplete && !canAcceptDecline && (
              <Btn variant="primary" size="md" onClick={() => act('complete')} disabled={busy !== null}>
                {busy === 'complete' ? 'იგზავნება…' : 'დასრულებულად მონიშვნა'}
              </Btn>
            )}
            {canCancel && (
              <Btn variant="danger" size="md" onClick={cancelBooking} disabled={busy !== null}>
                {busy === 'cancel' ? 'უქმდება…' : 'გაუქმება'}
              </Btn>
            )}
            {canCancel && !booking.rescheduleRequest && (
              <Btn variant="secondary" size="md" onClick={openReschedule} disabled={busy !== null}>
                გადადება
              </Btn>
            )}
            {canMarkNoShow && (
              <Btn
                variant="danger"
                size="md"
                onClick={() => {
                  if (confirm('დაადასტურე: კლიენტი არ გამოცხადდა?')) act('no_show')
                }}
                disabled={busy !== null}
              >
                {busy === 'no_show' ? 'იგზავნება…' : 'კლიენტი არ გამოცხადდა'}
              </Btn>
            )}
            {booking.status === 'COMPLETED' && (
              <div className="text-[13px] text-ink-500">ეს ჯავშანი დასრულებულია.</div>
            )}
            {booking.status === 'COMPLETED' && (
              <div className="w-full mt-4 pt-4 border-t border-ink-100">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-1">სესიის შემაჯამებელი</div>
                <h3 className="font-display text-[14px] font-bold text-ink-900 tracking-tight">დაუტოვე კლიენტს გამოხმაურება</h3>
                <p className="text-[12px] text-ink-500 mt-0.5">კლიენტი ნახავს ამ ჩანაწერს თავის ბუკინგის გვერდზე.</p>
                <textarea
                  value={tutorNotes}
                  onChange={(e) => setTutorNotes(e.target.value.slice(0, 1500))}
                  rows={5}
                  placeholder="რა გავიარეთ, რაზე უნდა იმუშაოს, რეკომენდაციები..."
                  className="mt-2 w-full p-3 rounded-field border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[13.5px] resize-none leading-relaxed"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-[10.5px] tabular-nums text-ink-400">{tutorNotes.length} / 1500</span>
                  <Btn variant="primary" size="sm" onClick={saveTutorNotes} disabled={notesSaving}>
                    {notesSaving ? 'ინახება…' : 'შენახვა'}
                  </Btn>
                </div>
              </div>
            )}
            {booking.status === 'CANCELED' && (
              <div className="text-[13px] text-ink-500">ეს ჯავშანი გაუქმებულია.</div>
            )}
            {booking.status === 'NO_SHOW' && (
              <div className="text-[13px] text-danger-700">აღინიშნა: კლიენტი არ გამოცხადდა.</div>
            )}
          </div>
        </div>

        <section id="chat" className="mt-6 rounded-card border border-ink-200 bg-white shadow-xs overflow-hidden scroll-mt-24">
          <div className="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between">
            <div className="font-display text-[15px] font-bold tracking-tight text-ink-900">მიმოწერა კლიენტთან</div>
            <div className="text-[11.5px] text-ink-500 font-mono tabular-nums">{msgs.length}</div>
          </div>
          <div className="max-h-[420px] min-h-[220px] overflow-y-auto p-5 sm:p-6 space-y-3 bg-ink-50/40">
            {msgs.length === 0 ? (
              <div className="text-center text-[13px] text-ink-400 py-8">მიმოწერა ჯერ არ არის. დაწერე პირველი შეტყობინება.</div>
            ) : (
              msgs.map(m => {
                const isMine = me?.id && m.fromId === me.id
                // Never render an attachment href with an unsafe scheme (guards
                // legacy rows predating the server-side scheme check).
                const safeFile = safeHttpUrl(m.fileUrl)
                return (
                  <div key={m.id} className={`flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    {!isMine && <Avatar src={m.from.avatarUrl ?? undefined} name={m.from.fullName} size={28} />}
                    <div className={`max-w-[75%] rounded-card px-3 py-2 text-[13.5px] ${isMine ? 'bg-brand-500 text-white' : 'bg-white border border-ink-200 text-ink-800'}`}>
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      {safeFile && (
                        <div className={`mt-2 pt-2 border-t ${isMine ? 'border-white/25' : 'border-ink-200'}`}>
                          {safeFile.startsWith('data:image/') ? (
                            <a href={safeFile} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={safeFile} alt={m.fileName ?? 'attachment'} className="max-h-[200px] rounded-md object-cover" />
                              {m.fileName && <div className={`mt-1 text-[11px] ${isMine ? 'text-white/85' : 'text-ink-500'} font-mono truncate`}>{m.fileName}</div>}
                            </a>
                          ) : (
                            <a
                              href={safeFile}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={m.fileName ?? undefined}
                              className={`inline-flex items-center gap-2 text-[12.5px] ${isMine ? 'text-white hover:text-white' : 'text-brand-700 hover:text-brand-800'} font-display font-semibold underline underline-offset-2 decoration-dotted`}
                            >
                              📎 {m.fileName ?? 'ფაილი'}
                            </a>
                          )}
                        </div>
                      )}
                      <div className={`text-[10.5px] mt-1 font-mono tabular-nums ${isMine ? 'text-white/70' : 'text-ink-400'}`}>{fmtTime(m.createdAt, tz)}</div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendMessage} className="p-3 sm:p-4 border-t border-ink-100 bg-white flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={onFileChosen}
              className="sr-only"
            />
            {attachment && (
              <div className="flex items-center gap-2 rounded-btn border border-ink-200 bg-ink-50/40 px-3 py-2 text-[12.5px]">
                <span className="flex-1 truncate font-display font-semibold text-ink-800">📎 {attachment.name}</span>
                <span className="font-mono text-[10.5px] text-ink-500 tabular-nums shrink-0">{(attachment.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={() => setAttachment(null)} aria-label="ფაილის მოხსნა" className="w-6 h-6 rounded-btn hover:bg-ink-100 text-ink-500 hover:text-danger-600 inline-flex items-center justify-center">
                  ×
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={pickFile}
                disabled={uploading}
                aria-label="ფაილის მიბმა"
                title="ფაილის მიბმა (PDF/JPG/PNG · max 8 MB)"
                className="h-11 w-11 rounded-btn border border-ink-200 bg-white hover:border-ink-300 disabled:opacity-50 text-ink-600 hover:text-ink-900 inline-flex items-center justify-center transition-colors shrink-0"
              >
                {uploading ? <span className="inline-block w-4 h-4 border-2 border-ink-500 border-t-transparent rounded-full animate-spin" /> : '📎'}
              </button>
              <textarea
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as any) } }}
                placeholder={attachment ? 'დაწერე შეტყობინება ან უბრალოდ გააგზავნე ფაილი…' : 'დაწერე შეტყობინება…'}
                rows={2}
                maxLength={4000}
                className="flex-1 resize-none rounded-btn border border-ink-200 px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <Btn type="submit" variant="primary" size="md" disabled={sending || uploading || (!msgText.trim() && !attachment)}>
                {sending ? '…' : <><Icon.arrow className="w-4 h-4" /> გაგზავნა</>}
              </Btn>
            </div>
          </form>
        </section>
      </main>

      {/* Reschedule proposal modal — tutor picks a new date/time; server
          validates lead time and availability slot before writing the JSONB
          proposal blob. */}
      {rescheduleOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setRescheduleOpen(false)}
            className="absolute inset-0 bg-accent-900/55 backdrop-blur-sm"
          />
          <div role="dialog" className="relative w-full sm:max-w-[520px] bg-white sm:rounded-card shadow-float overflow-hidden">
            <div className="px-6 py-4 border-b border-ink-100">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-1">გადადება</div>
              <h2 className="font-display text-[18px] font-bold text-ink-900 tracking-tight">აირჩიე ახალი დრო</h2>
              <div className="text-[12px] text-ink-500 mt-1">
                ამჟამინდელი: <span className="font-display font-semibold text-ink-900">
                  {fmtDateTime(booking.startAt, tz)}
                </span>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">თარიღი</label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full h-11 px-3 rounded-field border border-ink-200 text-[13.5px] focus:border-brand-500 focus:outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">დრო</label>
                  <input
                    type="time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="w-full h-11 px-3 rounded-field border border-ink-200 text-[13.5px] focus:border-brand-500 focus:outline-none tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">
                  მიზეზი <span className="text-ink-400 font-normal normal-case tracking-normal">— სურვილისამებრ</span>
                </label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="მოკლედ ახსენი კლიენტს რატომ..."
                  className="w-full p-3 rounded-field border border-ink-200 text-[13px] focus:border-brand-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>
              {rescheduleErr && (
                <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12px] font-medium">
                  {rescheduleErr}
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-ink-50/40 border-t border-ink-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRescheduleOpen(false)}
                disabled={rescheduleBusy !== null}
                className="font-display text-[12.5px] font-semibold text-ink-500 hover:text-ink-800 disabled:opacity-40"
              >
                გაუქმება
              </button>
              <Btn variant="primary" size="md" onClick={submitReschedule} disabled={rescheduleBusy !== null}>
                {rescheduleBusy === 'send' ? 'იგზავნება…' : 'გაგზავნა'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
