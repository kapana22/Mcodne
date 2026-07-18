'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { StatusPill } from '@/components/StatusPill'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/ToastProvider'
import { fmtDateTime as fmtInTz, userTimezone, TBILISI } from '@/lib/tz'
import { BookingChat } from '@/components/chat/BookingChat'
import { refreshNavBadges } from '@/components/tutor/useNavBadges'

type BookingStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'

import type { ChatMessage as Message } from '@/components/chat/useBookingThread'

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
  const [confirming, setConfirming] = useState<'cancel' | 'no_show' | 'decline' | null>(null)
  const { toast } = useToast()
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
        setTutorNotes(data.tutorNotes ?? '')
      } catch {
        if (!cancelled) toast('მონაცემების ჩატვირთვა ვერ მოხერხდა', 'error')
      }
    })()
    return () => { cancelled = true }
  }, [bookingId])

  useEffect(() => {
    if (window.location.hash === '#chat') {
      setTimeout(() => document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
    }
  }, [booking?.id])

  // Action feedback goes through the global toast host (same as the bookings
  // list) — kept behind the old showFlash signature to keep call sites small.
  const showFlash = (kind: 'ok' | 'err', text: string) => {
    toast(text, kind === 'ok' ? 'success' : 'error')
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
      refreshNavBadges()
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
      refreshNavBadges()
      showFlash('ok', 'ჯავშანი გაუქმდა')
    } finally {
      setBusy(null)
    }
  }

  if (notFound) {
    return (
      <div className="max-w-[720px] mx-auto">
          <div className="p-12 rounded-card border border-ink-200 bg-white text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center mb-3">
              <Icon.warn className="w-6 h-6" />
            </div>
            <div className="font-display text-[17px] font-semibold text-ink-800">ჯავშანი ვერ მოიძებნა</div>
            <div className="text-[13px] text-ink-500 mt-1">შესაძლოა წაიშალა, ან არ არის თქვენი.</div>
            <div className="mt-5"><Btn href="/tutor/bookings" variant="secondary" size="sm">ჯავშნების სია</Btn></div>
          </div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="max-w-[900px] mx-auto">
          <div className="p-12 rounded-card border border-ink-200 bg-white flex items-center justify-center text-ink-400">
            <span className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-[13px]">იტვირთება…</span>
          </div>
      </div>
    )
  }

  const future = new Date(booking.startAt) > new Date()
  const canAcceptDecline = booking.status === 'PREPARING'
  const canCancel = future && (booking.status === 'CONFIRMED' || booking.status === 'PREPARING')
  const canComplete = booking.status === 'CONFIRMED' || booking.status === 'LIVE'
  // Join always goes through the in-app video room (/session/{id}) — same
  // surface as TodayHero and the bookings list. The CTA never disappears for
  // a CONFIRMED/LIVE session; an external meetingUrl, if set, rides along as
  // a quiet secondary link.
  const canJoin = booking.status === 'CONFIRMED' || booking.status === 'LIVE'
  // "Student didn't show up" — only after the session's scheduled start.
  const canMarkNoShow = !future && (booking.status === 'CONFIRMED' || booking.status === 'LIVE')
  const showRemainingPill = booking.status !== 'CANCELED' && booking.status !== 'NO_SHOW'
  const isLiveNow = canJoin && !future

  /* Status-driven action panel: ONE primary per state, quiet secondaries.
     Rendered twice — above the fold on mobile, in the sticky rail on lg —
     sharing the same handlers/busy state. */
  const actionPanel = (
    <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5">
      <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-3">მოქმედებები</div>
      <div className="flex flex-col gap-2">
        {canAcceptDecline && (
          <>
            <Btn variant="primary" size="md" onClick={() => act('accept')} disabled={busy !== null} className="w-full">
              {busy === 'accept' ? 'იგზავნება…' : 'დადასტურება'}
            </Btn>
            <Btn variant="secondary" size="md" onClick={() => setConfirming('decline')} disabled={busy !== null} className="w-full">
              {busy === 'decline' ? 'იგზავნება…' : 'უარი'}
            </Btn>
          </>
        )}
        {canJoin && (
          <>
            <Link
              href={`/session/${booking.id}`}
              className={`inline-flex items-center justify-center gap-2 font-display font-medium tracking-wide transition-colors rounded-btn h-11 px-4 text-sm w-full ${
                isLiveNow
                  ? 'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white shadow-brand-glow'
                  : canAcceptDecline
                  ? 'border border-ink-200 hover:bg-ink-50 text-ink-800'
                  : 'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white shadow-xs'
              }`}
            >
              <Icon.video className="w-4 h-4" /> {isLiveNow ? 'ვიდეო-ოთახში შესვლა' : 'ვიდეო-ოთახი'}
            </Link>
            {booking.meetingUrl && (
              <a
                href={booking.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 text-[11.5px] font-display font-semibold text-ink-500 hover:text-ink-800 transition-colors min-h-[32px]"
              >
                <Icon.external className="w-3.5 h-3.5" /> გარე შეხვედრის ბმული
              </a>
            )}
          </>
        )}
        {canComplete && !canAcceptDecline && !future && (
          <Btn variant="primary" size="md" onClick={() => act('complete')} disabled={busy !== null} className="w-full">
            {busy === 'complete' ? 'იგზავნება…' : 'დასრულებულად მონიშვნა'}
          </Btn>
        )}
        {canMarkNoShow && (
          <Btn variant="secondary" size="md" onClick={() => setConfirming('no_show')} disabled={busy !== null} className="w-full">
            {busy === 'no_show' ? 'იგზავნება…' : 'კლიენტი არ გამოცხადდა'}
          </Btn>
        )}
        {canCancel && !booking.rescheduleRequest && (
          <Btn variant="secondary" size="md" onClick={openReschedule} disabled={busy !== null} className="w-full">
            გადადება
          </Btn>
        )}
        {canCancel && (
          <Btn variant="danger" size="md" onClick={() => setConfirming('cancel')} disabled={busy !== null} className="w-full">
            {busy === 'cancel' ? 'უქმდება…' : 'გაუქმება'}
          </Btn>
        )}
        {booking.status === 'COMPLETED' && (
          <div className="text-[13px] text-ink-500">ეს ჯავშანი დასრულებულია.</div>
        )}
        {booking.status === 'CANCELED' && (
          <div className="text-[13px] text-ink-500">ეს ჯავშანი გაუქმებულია.</div>
        )}
        {booking.status === 'NO_SHOW' && (
          <div className="text-[13px] text-danger-700">აღინიშნა: კლიენტი არ გამოცხადდა.</div>
        )}
      </div>
    </div>
  )

  return (
    <div>
        <div className="mb-5 flex items-center gap-3 text-[13px] text-ink-500">
          <Link href="/tutor/bookings" className="hover:text-ink-800 inline-flex items-center gap-1"><Icon.arrow className="w-3.5 h-3.5 rotate-180" /> ჯავშნების სია</Link>
          <span className="text-ink-300">·</span>
          <span className="font-mono text-[11.5px] text-ink-400">{booking.ref.slice(0, 12)}</span>
        </div>

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

        {/* ── Operational panel: main column + sticky action rail ── */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div className="min-w-0 space-y-5">

            {/* Session header */}
            <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5 sm:p-6">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <StatusPill tone={toneOf(booking.status)} />
                {booking.status === 'PREPARING' && (
                  <span className="text-[11.5px] text-warning-700 font-semibold">ელოდება თქვენს პასუხს</span>
                )}
              </div>
              <h1 className="font-display text-[21px] sm:text-[24px] font-bold tracking-tight text-ink-900">{booking.topic}</h1>
              <div className="text-[13px] text-ink-500 mt-2 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3.5 h-3.5" />{fmtDateTime(booking.startAt, tz)}</span>
                <span className="inline-flex items-center gap-1"><Icon.clock className="w-3.5 h-3.5" />{booking.durationMin} წუთი</span>
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

            {/* Actions surface above the fold on mobile; rail owns them on lg */}
            <div className="lg:hidden">{actionPanel}</div>

            {/* Status trail — where this booking sits in its lifecycle */}
            <SessionTimeline status={booking.status} startAt={booking.startAt} durationMin={booking.durationMin} />

            {/* Notes */}
            {(booking.studentNotes || booking.status === 'COMPLETED') && (
              <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5 sm:p-6 space-y-5">
                {booking.studentNotes && (
                  <div>
                    <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2">კლიენტის შენიშვნა</div>
                    <div className="p-3 rounded-btn bg-ink-50 border border-ink-200 text-[13px] text-ink-700 whitespace-pre-wrap">
                      {booking.studentNotes}
                    </div>
                  </div>
                )}
                {booking.status === 'COMPLETED' && (
                  <div>
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
              </div>
            )}

            {/* #chat is a public contract: DB-stored notification hrefs and the
                messages inbox deep-link to /tutor/bookings/{id}#chat forever. */}
            <section id="chat" className="scroll-mt-24">
              <BookingChat
                variant="embedded"
                bookingId={booking.id}
                me={me}
                counterparty={booking.student}
                initialMessages={booking.messages}
                onActivity={() => router.refresh()}
              />
            </section>
          </div>

          {/* Rail */}
          <aside className="space-y-4 lg:sticky lg:top-[84px]">
            {/* Client card */}
            <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-3">კლიენტი</div>
              <div className="flex items-center gap-3">
                <Avatar src={booking.student.avatarUrl ?? undefined} name={booking.student.fullName} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[14.5px] font-bold text-ink-900 truncate">{booking.student.fullName}</div>
                  <div className="text-[12px] text-ink-500 truncate">{booking.student.email}</div>
                </div>
              </div>
              <a href="#chat" className="mt-3 flex items-center justify-center gap-2 h-9 rounded-btn border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.chat className="w-4 h-4" /> მესიჯის მიწერა
              </a>
            </div>

            <div className="hidden lg:block">{actionPanel}</div>

            {/* Payment / booking meta */}
            <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-3">ღირებულება</div>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-[24px] font-bold text-ink-900 tabular-nums">₾{booking.price}</span>
                <span className="text-[12px] text-ink-500">{booking.durationMin} წთ</span>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-500 leading-snug">
                ამჟამად ჯავშნები ტარდება უფასოდ — გადახდები მალე დაემატება.
              </p>
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-[11px]">
                <span className="text-ink-400 uppercase tracking-[0.14em] font-display font-semibold">Ref</span>
                <span className="font-mono text-ink-500">{booking.ref.slice(0, 12)}</span>
              </div>
            </div>
          </aside>
        </div>

      {/* Reschedule proposal modal — tutor picks a new date/time; server
          validates lead time and availability slot before writing the JSONB
          proposal blob. */}
      <Sheet
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        size="md"
        busy={rescheduleBusy !== null}
        eyebrow="გადადება"
        title="აირჩიე ახალი დრო"
        footer={
          <>
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
          </>
        }
      >
            <div className="space-y-4">
              <div className="text-[12px] text-ink-500">
                ამჟამინდელი: <span className="font-display font-semibold text-ink-900">
                  {fmtDateTime(booking.startAt, tz)}
                </span>
              </div>
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
      </Sheet>

      <ConfirmModal
        open={confirming !== null}
        title={
          confirming === 'cancel' ? 'ჯავშნის გაუქმება?'
          : confirming === 'decline' ? 'უარი მოთხოვნაზე?'
          : 'კლიენტი არ გამოცხადდა?'
        }
        body={
          confirming === 'cancel'
            ? 'სესიის დაწყებამდე 12 საათზე გვიან გაუქმება კლიენტისთვის სრულად ბრუნდება. კლიენტი მიიღებს შეტყობინებას.'
            : confirming === 'decline'
            ? 'კლიენტის მოთხოვნა გაუქმდება და ის მიიღებს შეტყობინებას.'
            : 'ჯავშანი აღინიშნება როგორც no-show და თანხა კლიენტს დაუბრუნდება.'
        }
        tone={confirming === 'decline' ? 'warning' : 'danger'}
        confirmLabel={
          confirming === 'cancel' ? 'გაუქმება'
          : confirming === 'decline' ? 'უარყოფა'
          : 'დადასტურება'
        }
        busy={busy !== null}
        onConfirm={async () => {
          const kind = confirming
          setConfirming(null)
          if (kind === 'cancel') await cancelBooking()
          else if (kind === 'decline') await act('decline')
          else if (kind === 'no_show') await act('no_show')
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}

/* Minimal 4-step lifecycle trail. Canceled/no-show render a terminal state
   instead of fake progress. Pure presentation from status + clock. */
function SessionTimeline({ status, startAt, durationMin }: { status: BookingStatus; startAt: string; durationMin: number }) {
  if (status === 'CANCELED' || status === 'NO_SHOW') {
    return (
      <div className="rounded-card border border-ink-200 bg-ink-50/60 px-5 py-3.5 flex items-center gap-2.5">
        <Icon.x className="w-4 h-4 text-ink-400 shrink-0" />
        <span className="text-[12.5px] text-ink-500">
          {status === 'CANCELED' ? 'ჯავშანი გაუქმდა — პროცესი შეწყვეტილია.' : 'სესია არ შედგა (no-show).'}
        </span>
      </div>
    )
  }
  const ended = new Date(startAt).getTime() + durationMin * 60_000 < Date.now()
  const doneCount =
    status === 'COMPLETED' ? 4
    : ended ? 3
    : status !== 'PREPARING' ? 2
    : 1
  const STEPS = ['მოთხოვნა', 'დადასტურება', 'სესია', 'დასრულება']
  return (
    <div className="rounded-card border border-ink-200 bg-white shadow-xs px-5 py-4">
      <ol className="flex items-center" aria-label="ჯავშნის ეტაპები">
        {STEPS.map((label, i) => {
          const done = i < doneCount
          const current = i === doneCount
          return (
            <li key={label} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
              {i > 0 && <span className={`flex-1 h-px mx-2 ${done ? 'bg-brand-400' : 'bg-ink-200'}`} aria-hidden />}
              <span className="flex flex-col items-center gap-1.5 shrink-0">
                <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center border ${
                  done ? 'bg-brand-500 border-brand-500 text-white'
                  : current ? 'bg-white border-brand-400 text-brand-600'
                  : 'bg-white border-ink-300 text-transparent'
                }`}>
                  {done ? <Icon.check className="w-3 h-3" /> : <span className={`w-1.5 h-1.5 rounded-full ${current ? 'bg-brand-500' : ''}`} />}
                </span>
                <span className={`font-display text-[10px] font-semibold uppercase tracking-[0.08em] ${done || current ? 'text-ink-800' : 'text-ink-400'}`}>
                  {label}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
