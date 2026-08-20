'use client'
// /tutor/bookings/[id] — the expert's booking detail. Owns the fetch, the
// actions and the chat; the review block and timeline live beside it.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Avatar } from '@/components/Avatar'
import { StatusPill } from '@/components/StatusPill'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Sheet } from '@/components/Sheet'
import { RescheduleTimePicker } from '@/components/booking/RescheduleTimePicker'
import { useToast } from '@/components/ToastProvider'
import { FEATURE_ABROAD } from '@/lib/flags'
import { userTimezone, TBILISI } from '@/lib/tz'
import { BookingChat } from '@/components/chat/BookingChat'
import { refreshNavBadges } from '@/components/tutor/useNavBadges'
import { Booking, BookingStatus, Me, fmtDateTime, toneOf, tutorBookingCache, useRemainingLabel } from './_model'
import { ReviewBlock } from './_review'
import { SessionTimeline } from './_timeline'

export default function TutorBookingDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const bookingId = params?.id
  const [me, setMe] = useState<Me>(null)
  const [booking, setBooking] = useState<Booking | null>(() => (bookingId ? tutorBookingCache.get(bookingId) ?? null : null))
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
  // Payment link the expert pastes from their bank. Mirrored from the booking
  // on load, exactly like tutorNotes above.
  const [payLink, setPayLink] = useState('')
  const [payLinkSaving, setPayLinkSaving] = useState(false)
  // Detect user's browser tz on mount; SSR/first paint uses Tbilisi.
  const [tz, setTz] = useState<string>(TBILISI)
  useEffect(() => { setTz(userTimezone()) }, [])

  // Countdown label is derived from the current booking (or empty string when
  // still loading) — kept up top so the hook order stays stable across the
  // notFound / loading early-returns below.
  const remainingLabel = useRemainingLabel(booking?.startAt ?? '', booking?.durationMin ?? 0)

  useEffect(() => {
    if (!bookingId) return
    // Swap to the cached copy instantly (no spinner on revisit), then revalidate.
    setBooking(tutorBookingCache.get(bookingId) ?? null)
    setNotFound(false)
    let cancelled = false
    ;(async () => {
      try {
        const [meRes, bRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()),
          fetch(`/api/bookings/${bookingId}`),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        if (bRes.status === 401) { window.location.href = `/signin?redirect=/work/bookings/${bookingId}`; return }
        if (bRes.status === 404) { setNotFound(true); return }
        // Any other non-OK (403/500) → treat as not-found rather than storing an
        // error JSON as `booking` (which renders Invalid Date + undefined topic).
        if (!bRes.ok) { setNotFound(true); return }
        const data = await bRes.json()
        tutorBookingCache.set(bookingId, data)
        setBooking(data)
        setTutorNotes(data.tutorNotes ?? '')
        setPayLink(data.paymentLinkUrl ?? '')
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
          : j.error === 'TOO_EARLY' ? 'გამოუცხადებლობა დაწყებიდან 15 წუთის შემდეგ მოინიშნება — მიეცი კლიენტს დრო'
          : 'მოქმედება ვერ შესრულდა'
        showFlash('err', msg)
        return
      }
      // Merge the meetingUrl the accept response returns so the „გარე შეხვედრის
      // ბმული“ link appears immediately, without a full page reload.
      setBooking(b => b ? { ...b, status: j.status as BookingStatus, meetingUrl: j.meetingUrl ?? b.meetingUrl } : b)
      // Invalidate the server-cached tutor bookings list so navigating back
      // reflects the new status (e.g. accepted booking moves out of Pending).
      router.refresh()
      refreshNavBadges()
      const okMsg =
        action === 'accept' ? 'დადასტურდა'
        : action === 'decline' ? 'უარყოფილია'
        : action === 'no_show' ? 'აღინიშნა გამოუცხადებლობა'
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

  // Save (or clear) the payment link. Same PATCH shape as the summary above.
  // The server is the authority on what a payment link may be — https only —
  // so this only relays its verdict rather than duplicating the rule.
  const savePayLink = async () => {
    if (!booking) return
    setPayLinkSaving(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentLinkUrl: payLink.trim().slice(0, 2000) }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        showFlash('err', j?.error === 'BAD_PAYMENT_URL'
          ? 'ბმული უნდა იწყებოდეს https://-ით'
          : 'შენახვა ვერ მოხერხდა')
        return
      }
      setBooking(b => b ? { ...b, paymentLinkUrl: j.paymentLinkUrl ?? null } : b)
      setPayLink(j.paymentLinkUrl ?? '')
      showFlash('ok', j.paymentLinkUrl ? 'ბმული შენახულია — კლიენტს ეცნობა' : 'ბმული წაიშალა')
    } catch { showFlash('err', 'ქსელის შეცდომა') }
    finally { setPayLinkSaving(false) }
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
          : j?.error === 'NO_SLOT' ? 'ამ დროს სხვა ჯავშანი ემთხვევა — აირჩიე თავისუფალი დრო'
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

  // „This one works for me" on one of the times the CLIENT offered. Goes
  // through the ordinary propose endpoint — see the panel's comment for why it
  // is a proposal and not an immediate move.
  const proposeAlternate = async (iso: string) => {
    if (!booking || rescheduleBusy) return
    setRescheduleBusy('send')
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStartAt: new Date(iso).toISOString(), reason: 'შენ მიერ შემოთავაზებული დრო' }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        showFlash('err',
          j?.error === 'TOO_SOON' ? 'ეს დრო ძალიან ახლოსაა — მინიმუმ 1 საათი წინ'
          : j?.error === 'NO_SLOT' ? 'ამ დროს სხვა ჯავშანი ემთხვევა'
          : 'გაგზავნა ვერ მოხერხდა')
        return
      }
      setBooking(b => b ? { ...b, rescheduleRequest: j.rescheduleRequest, status: 'PREPARING' } : b)
      router.refresh()
      showFlash('ok', 'გაეგზავნა კლიენტს დასადასტურებლად')
    } catch { showFlash('err', 'ქსელის შეცდომა') }
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
        // Trust the server's resulting status — on reject it may be PREPARING
        // (restored), NOT always CONFIRMED. Falling back to CONFIRMED only if
        // the server didn't send it (older builds).
        const next: Booking = { ...b, rescheduleRequest: null, status: j.status ?? 'CONFIRMED' }
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
    } catch {
      // Without this, a rejected promise closed the modal, un-greyed the button
      // and said nothing — the expert believed the booking was cancelled while
      // it stayed CONFIRMED, and then no-showed a real client.
      showFlash('err', 'ქსელის შეცდომა')
    } finally {
      setBusy(null)
    }
  }

  if (notFound) {
    return (
      <Container size="content">
          <div className="p-12 rounded-card border border-ink-200 bg-white text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center mb-3">
              <Icon.warn className="w-6 h-6" />
            </div>
            <div className="font-display text-h3 font-semibold text-ink-800">ჯავშანი ვერ მოიძებნა</div>
            <div className="text-small text-ink-500 mt-1">წაიშალა, ან არ არის შენი.</div>
            <div className="mt-5"><Btn href="/work/jobs" variant="secondary" size="sm">სამუშაოები</Btn></div>
          </div>
      </Container>
    )
  }

  if (!booking) {
    return (
      <Container size="content">
          <div className="p-12 rounded-card border border-ink-200 bg-white flex items-center justify-center text-ink-400">
            <span aria-hidden className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full motion-safe:animate-spin" />
            <span className="ml-3 text-small">იტვირთება…</span>
          </div>
      </Container>
    )
  }

  const future = new Date(booking.startAt) > new Date()
  const canAcceptDecline = booking.status === 'PREPARING'
  // A not-yet-accepted request rejects via "decline" — offering "cancel" AND
  // "reschedule" there too gave an unanswered request four overlapping actions.
  // Cancel + reschedule belong to an already-CONFIRMED booking only.
  const canCancel = future && booking.status === 'CONFIRMED'
  const canComplete = booking.status === 'CONFIRMED' || booking.status === 'LIVE'
  // Join always goes through the in-app video room (/session/{id}) — same
  // surface as TodayHero and the bookings list. The CTA never disappears for
  // a CONFIRMED/LIVE session; an external meetingUrl, if set, rides along as
  // a quiet secondary link.
  const canJoin = booking.status === 'CONFIRMED' || booking.status === 'LIVE'
  // "Student didn't show up" — only after the 15-min grace past the start (the
  // server enforces the same window and returns TOO_EARLY otherwise). Gating the
  // button on the grace, not just `!future`, stops an enabled button that fails.
  const NO_SHOW_GRACE_MS = 15 * 60 * 1000
  const graceOver = Date.now() >= new Date(booking.startAt).getTime() + NO_SHOW_GRACE_MS
  const canMarkNoShow = graceOver && (booking.status === 'CONFIRMED' || booking.status === 'LIVE')
  const showRemainingPill = booking.status !== 'CANCELED' && booking.status !== 'NO_SHOW'
  const isLiveNow = canJoin && !future

  /* Status-driven action panel: ONE primary per state, quiet secondaries.
     Rendered twice — above the fold on mobile, in the sticky rail on lg —
     sharing the same handlers/busy state. */
  const actionPanel = (
    <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5">
      <Eyebrow tone="muted" className="mb-3">მოქმედებები</Eyebrow>
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
              className={`inline-flex items-center justify-center gap-2 font-display font-medium tracking-wide transition-colors duration-fast rounded-btn h-11 px-4 text-body w-full ${
                isLiveNow
                  ? 'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-brand-glow'
                  : canAcceptDecline
                  ? 'border border-ink-200 hover:bg-ink-50 text-ink-800'
                  : 'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-xs'
              }`}
            >
              <Icon.video className="w-4 h-4" /> ვიდეოოთახი
            </Link>
            {booking.meetingUrl && (
              <a
                href={booking.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 text-meta font-display font-semibold text-ink-500 hover:text-ink-800 transition-colors duration-fast min-h-[32px]"
              >
                <Icon.external className="w-3.5 h-3.5" /> გარე ბმული
              </a>
            )}
          </>
        )}
        {canComplete && !canAcceptDecline && !future && (
          <Btn variant="primary" size="md" onClick={() => act('complete')} disabled={busy !== null} className="w-full">
            {busy === 'complete' ? 'იგზავნება…' : 'დასრულება'}
          </Btn>
        )}
        {canMarkNoShow && (
          <Btn variant="secondary" size="md" onClick={() => setConfirming('no_show')} disabled={busy !== null} className="w-full">
            {busy === 'no_show' ? 'იგზავნება…' : 'არ გამოცხადდა'}
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
          <div className="text-small text-ink-500">ჯავშანი დასრულდა.</div>
        )}
        {booking.status === 'CANCELED' && (
          <div className="text-small text-ink-500">ჯავშანი გაუქმდა.</div>
        )}
        {booking.status === 'NO_SHOW' && (
          <div className="text-small text-danger-700">კლიენტი არ გამოცხადდა.</div>
        )}
      </div>
    </div>
  )

  return (
    <div>
        <div className="mb-5 flex items-center gap-3 text-small text-ink-500">
          <Link href="/work/jobs" className="hover:text-ink-800 inline-flex items-center gap-1 min-h-[40px] sm:min-h-0"><Icon.arrow className="w-3.5 h-3.5 rotate-180" /> სამუშაოები</Link>
          <span className="text-ink-300">·</span>
          <span className="font-mono text-meta text-ink-400">{booking.ref.slice(0, 12)}</span>
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
                <div className="font-display text-micro font-semibold uppercase text-warning-800 mb-1">
                  {iProposed ? 'გადადება გაგზავნილია' : 'კლიენტმა ითხოვა გადადება'}
                </div>
                <div className="font-display text-body-lg font-bold text-ink-900">
                  ახალი დრო: {fmtDateTime(req.newStartAt, tz)}
                  {tz !== TBILISI && (
                    <span className="ml-1 font-normal text-meta text-ink-500">
                      (თბილისის დროით: {fmtDateTime(req.newStartAt, TBILISI)})
                    </span>
                  )}
                </div>
                {req.reason && <p className="mt-1 text-small text-ink-700 whitespace-pre-wrap">„{req.reason}“</p>}
                {iProposed && <p className="mt-1 text-meta text-ink-500">ელოდება კლიენტის პასუხს.</p>}
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
                  <span className="text-meta text-warning-700 font-semibold">ელოდება პასუხს</span>
                )}
              </div>
              <h1 className="font-display text-h2 sm:text-h1 font-bold tracking-tight text-ink-900">{booking.topic}</h1>
              <div className="text-small text-ink-500 mt-2 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3.5 h-3.5" />{fmtDateTime(booking.startAt, tz)}</span>
                <span className="inline-flex items-center gap-1"><Icon.clock className="w-3.5 h-3.5" />{booking.durationMin} წუთი</span>
              </div>
              {tz !== TBILISI && (
                <div className="mt-1 text-meta text-ink-400">
                  (თბილისის დროით: {fmtDateTime(booking.startAt, TBILISI)})
                </div>
              )}
              {/* Same line the dashboard row carries: an out-of-schedule time
                  with nothing explaining it reads as a calendar bug. Shown
                  whether or not the client offered alternates. */}
              {booking.proposedByStudent && (
                <div className="mt-2 inline-flex items-center h-5 px-2 rounded-pill border border-ink-200 text-ink-700 font-display text-micro font-bold uppercase">
                  კლიენტის შემოთავაზებული დრო
                </div>
              )}
              {showRemainingPill && remainingLabel && (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-brand-50 border border-brand-200 text-meta font-display font-semibold text-brand-800">
                    <Icon.clock className="w-3 h-3" />
                    {remainingLabel === 'დაწყებულია' || remainingLabel === 'დასრულებულია'
                      ? remainingLabel
                      : <>დაწყებამდე დარჩა · <span className="tabular-nums">{remainingLabel}</span></>}
                  </span>
                </div>
              )}
            </div>

            {/* ── The client named these times ───────────────────────────────
                Request-based booking (FEATURE_REQUEST_BOOKING). The time above
                is the client's FIRST choice and is deliberately NOT in this
                expert's published schedule — say so, or it reads as a bug in
                the calendar. Their other choices sit here so the answer is one
                decision instead of a thread.

                Tapping one sends an ORDINARY reschedule proposal, which the
                client then accepts. It does NOT move the booking on the spot,
                and that is deliberate: the propose→respond machinery already
                exists, is already tested, and already handles the lead time,
                the overlap re-check, the notification and the email. Inventing
                a second, quieter path to move a booking would be a second state
                machine to keep honest. The client offered the time, so their
                „yes" is a formality — but it is a formality that leaves the
                system with exactly one way a session's time can change. */}
            {booking.proposedByStudent && (booking.proposedAlternates?.length ?? 0) > 0
              && (booking.status === 'PREPARING') && (
              <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5 sm:p-6">
                <Eyebrow tone="muted" className="mb-2">კლიენტის შემოთავაზებული დროები</Eyebrow>
                <p className="text-meta text-ink-500 leading-snug">
                  ეს დროები კლიენტმა დაასახელა — შენს გამოქვეყნებულ განრიგში არაა. დაადასტურე ზემოთ მოცემული დრო, ან შესთავაზე ერთ-ერთი ეს.
                </p>
                <ul className="mt-3 space-y-2">
                  {(booking.proposedAlternates ?? []).map((alt, i) => (
                    <li key={`${alt.startAt}-${i}`} className="flex items-center gap-3 flex-wrap">
                      <span className="flex-1 min-w-0 text-body text-ink-800">
                        {fmtDateTime(alt.startAt, tz)}
                        {tz !== TBILISI && (
                          <span className="ml-1.5 text-meta text-ink-400">
                            (თბილისის დროით: {fmtDateTime(alt.startAt, TBILISI)})
                          </span>
                        )}
                      </span>
                      <Btn
                        variant="secondary"
                        size="sm"
                        disabled={rescheduleBusy !== null}
                        onClick={() => proposeAlternate(alt.startAt)}
                      >
                        ეს დრო მაწყობს
                      </Btn>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions surface above the fold on mobile; rail owns them on lg */}
            <div className="lg:hidden">{actionPanel}</div>

            {/* Status trail — where this booking sits in its lifecycle */}
            <SessionTimeline status={booking.status} startAt={booking.startAt} durationMin={booking.durationMin} />

            {/* Notes */}
            {(booking.studentNotes || booking.status === 'COMPLETED') && (
              <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5 sm:p-6 space-y-5">
                {booking.studentNotes && (
                  <div>
                    <Eyebrow tone="muted" className="mb-2">კლიენტის შენიშვნა</Eyebrow>
                    <div className="p-3 rounded-btn bg-ink-50 border border-ink-200 text-small text-ink-700 whitespace-pre-wrap">
                      {booking.studentNotes}
                    </div>
                  </div>
                )}
                {booking.status === 'COMPLETED' && (
                  <div>
                    <Eyebrow className="mb-1">შემაჯამებელი</Eyebrow>
                    <h3 className="font-display text-body font-bold text-ink-900 tracking-tight">დაუტოვე გამოხმაურება</h3>
                    <p className="text-meta text-ink-500 mt-0.5">კლიენტი ნახავს თავის ჯავშანში.</p>
                    <textarea
                      value={tutorNotes}
                      onChange={(e) => setTutorNotes(e.target.value.slice(0, 1500))}
                      rows={5}
                      placeholder="რა გავიარეთ, რაზე იმუშაოს, რეკომენდაციები…"
                      className="mt-2 w-full p-3 rounded-field border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body resize-none leading-relaxed"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="font-mono text-meta tabular-nums text-ink-400">{tutorNotes.length} / 1500</span>
                      <Btn variant="primary" size="sm" onClick={saveTutorNotes} disabled={notesSaving}>
                        {notesSaving ? 'ინახება…' : 'შენახვა'}
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Client's review + the expert's public reply (PATCH /api/reviews).
                Compact: stars + body + date, reply as a quiet disclosure. */}
            {booking.status === 'COMPLETED' && booking.review && (
              <ReviewBlock
                bookingId={booking.id}
                review={booking.review}
                onUpdated={(tutorResponse, respondedAt) =>
                  setBooking(b => b && b.review ? { ...b, review: { ...b.review, tutorResponse, respondedAt } } : b)}
              />
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
              <Eyebrow tone="muted" className="mb-3">კლიენტი</Eyebrow>
              <div className="flex items-center gap-3">
                <Avatar src={booking.student.avatarUrl ?? undefined} name={booking.student.fullName} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-body-lg font-bold text-ink-900 truncate">{booking.student.fullName}</div>
                  <div className="text-meta text-ink-500 truncate">{booking.student.email}</div>
                </div>
              </div>
              <a href="#chat" className="mt-3 flex items-center justify-center gap-2 h-10 sm:h-9 rounded-btn border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.chat className="w-4 h-4" /> მიწერა
              </a>
            </div>

            <div className="hidden lg:block">{actionPanel}</div>

            {/* Payment / booking meta */}
            <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5">
              <Eyebrow tone="muted" className="mb-3">ფასი</Eyebrow>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-h1 font-bold text-ink-900 tabular-nums">₾{booking.price}</span>
                <span className="text-meta text-ink-500">{booking.durationMin} წთ</span>
              </div>
              <p className="mt-2 text-meta text-ink-500 leading-snug">
                ახლა ჯავშნა უფასოა — გადახდები მალე.
              </p>

              {/* ── Payment link ────────────────────────────────────────────
                  Not a platform checkout and not a step toward one: the expert
                  pastes the link their own bank generated, and the client gets
                  a button instead of a link read out in a message. Everything
                  about the platform's money model is unchanged — the line above
                  still says payments are not live, because they are not.
                  Hidden once the booking is terminal: asking a client to pay
                  for a canceled session is a bug, not a nudge. */}
              {/* FEATURE_ABROAD-gated. The field was added FOR the diaspora
                  vertical — a client abroad cannot hand over cash — so it
                  belongs to that flag like everything else the vertical added.
                  Without this gate it was the one change an existing expert
                  could see while the vertical was supposedly dark, which is
                  exactly the thing the flag exists to prevent. */}
              {FEATURE_ABROAD && booking.status !== 'CANCELED' && booking.status !== 'NO_SHOW' && (
                <div className="mt-4 pt-4 border-t border-ink-100">
                  <Eyebrow as="label" tone="muted" htmlFor="pay-link" className="block mb-2">
                    გადახდის ბმული
                  </Eyebrow>
                  <input
                    id="pay-link"
                    type="url"
                    inputMode="url"
                    value={payLink}
                    onChange={e => setPayLink(e.target.value)}
                    placeholder="https://…"
                    className="w-full h-11 px-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 text-body text-ink-900 transition-colors duration-fast"
                  />
                  <p className="mt-1.5 text-meta text-ink-500 leading-snug">
                    ჩასვი BOG-ის ან TBC-ის ბმული — კლიენტი მას ღილაკად დაინახავს. ცარიელი ველი ბმულს შლის.
                  </p>
                  <Btn
                    variant="secondary"
                    size="sm"
                    className="mt-2 w-full"
                    loading={payLinkSaving}
                    disabled={payLink.trim() === (booking.paymentLinkUrl ?? '')}
                    onClick={savePayLink}
                  >
                    შენახვა
                  </Btn>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-meta">
                <span className="text-ink-400 uppercase font-display font-semibold">Ref</span>
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
              className="font-display text-small font-semibold text-ink-500 hover:text-ink-800 disabled:opacity-40"
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
              <div className="text-meta text-ink-500">
                ამჟამინდელი: <span className="font-display font-semibold text-ink-900">
                  {fmtDateTime(booking.startAt, tz)}
                </span>
              </div>
              <RescheduleTimePicker tutorId={booking.tutor.id} durationMin={booking.durationMin} dateStr={rescheduleDate} timeStr={rescheduleTime} onDate={setRescheduleDate} onTime={setRescheduleTime} />
              <div>
                <Eyebrow as="label" tone="muted" className="block mb-2">
                  მიზეზი <span className="text-ink-400 font-normal normal-case tracking-normal">— არასავალდებულო</span>
                </Eyebrow>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="მოკლედ — რატომ…"
                  className="w-full p-3 rounded-field border border-ink-200 text-small focus:border-brand-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>
              {rescheduleErr && (
                <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-meta font-medium">
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
            ? 'კლიენტს თანხა სრულად უბრუნდება.'
            : confirming === 'decline'
            ? 'კლიენტის მოთხოვნა გაუქმდება.'
            : 'აღინიშნება გამოუცხადებლობა, თანხა დაუბრუნდება.'
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