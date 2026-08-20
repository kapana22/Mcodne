'use client'
// /student/bookings/[id] — the booking detail container. Owns the fetch,
// the tab state and the actions; every part lives in a `_*.tsx` beside it.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/components/ToastProvider'
import { copyToClipboard } from '@/lib/clipboard'
import { PAYMENTS_LIVE, CANCEL_CUTOFF_HOURS } from '@/lib/flags'
import { Icon } from '@/components/Icon'
import { BookingBody, RescheduleBanner } from './_body'
import { Breadcrumb, Hero } from './_hero'
import { MobileActionBar } from './_mobile'
import { DisputeModal, RescheduleModal } from './_modals'
import { Booking, bookingCache, NO_SHOW_GRACE_MIN } from './_model'
import { InlineReviewCard } from './_review'

export default function BookingDetail() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [booking, setBooking] = useState<Booking | null>(() => (params?.id ? bookingCache.get(params.id) ?? null : null))
  const [meId, setMeId] = useState<string | null>(null)
  // Header identity for the shared StudentAppBar (avatar + user menu).
  const [me, setMe] = useState<{ name: string; avatar?: string | null } | null>(null)
  const [notFound, setNotFound] = useState(false)
  // A failed load is a first-class state: a 5xx, a non-JSON body or a hung
  // request must land on a visible retry card — never an eternal spinner (this
  // page is opened straight from email links, so an API blip used to leave the
  // student staring at a spinning circle forever).
  const [loadError, setLoadError] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduledOk, setRescheduledOk] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeSent, setDisputeSent] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [noShowBusy, setNoShowBusy] = useState(false)
  const [noShowConfirmOpen, setNoShowConfirmOpen] = useState(false)
  const { toast } = useToast()

  // Monotonic request token — guards against out-of-order responses when the
  // route id changes (tap booking A then B: A's late response must not overwrite B).
  const loadSeqRef = useRef(0)
  const load = async () => {
    if (!params?.id) return
    const seq = ++loadSeqRef.current
    const idAtCall = params.id
    setLoadError(false)
    // Guarantees even a request that never returns settles into the retry
    // state instead of wedging the page on a spinner.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const [meRes, bRes] = await Promise.all([
        fetch('/api/me').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/bookings/${idAtCall}`, { signal: ctrl.signal }),
      ])
      // Drop stale responses.
      if (seq !== loadSeqRef.current) return
      setMeId(meRes?.user?.id ?? null)
      setMe(meRes?.user ? { name: meRes.user.fullName, avatar: meRes.user.avatarUrl } : null)
      // 404/403 are permanent answers („არ არსებობს / არ ხარ მონაწილე"), not a
      // blip — they get the dead-end-free notFound card, not a retry.
      if (bRes.status === 404 || bRes.status === 403) { setNotFound(true); return }
      if (bRes.status === 401) {
        const ret = encodeURIComponent(window.location.pathname + window.location.search)
        router.push(`/signin?redirect=${ret}`)
        return
      }
      if (!bRes.ok) { setLoadError(true); return }
      const b = await bRes.json()
      if (seq !== loadSeqRef.current) return
      bookingCache.set(idAtCall, b)
      setBooking(b)
    } catch {
      if (seq === loadSeqRef.current) setLoadError(true)
    } finally {
      clearTimeout(timer)
    }
  }

  // Called after any mutation on this booking. In addition to refreshing the
  // local booking payload, we invalidate the server-component cache so the
  // parent list (`/me/bookings`) reflects the change on next navigation.
  const reload = async () => {
    await load()
    router.refresh()
  }

  useEffect(() => {
    // On id change, swap to the new booking's cached copy instantly (or clear
    // to the loading state) so B never flashes A's content, then revalidate.
    if (params?.id) { setBooking(bookingCache.get(params.id) ?? null); setNotFound(false); setLoadError(false) }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id])

  // ?review=1 (from session-row CTA) scrolls to the inline review card — the
  // one and only review surface; the old duplicate ReviewModal is gone.
  // Guarded by a ref so the post-submit reload() can't re-trigger the scroll.
  const reviewAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined' || reviewAutoOpenedRef.current) return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('review') === '1' && booking && booking.status === 'COMPLETED') {
      reviewAutoOpenedRef.current = true
      // Next frame: the inline card mounts in the same render pass.
      requestAnimationFrame(() => {
        document.getElementById('leave-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [booking])

  const cancelBooking = () => {
    if (!booking || cancelBusy) return
    setCancelConfirmOpen(true)
  }

  const confirmCancel = async () => {
    if (!booking || cancelBusy) return
    setCancelBusy(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, { method: 'POST' })
      // Same error vocabulary as the dashboard's cancel flow — a BAD_STATE
      // response means the session already finished or was cancelled, which
      // deserves a specific message, not the generic one.
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        toast(data?.error === 'BAD_STATE' ? 'ეს სესია უკვე დასრულებული ან გაუქმებულია.' : 'გაუქმება ვერ მოხერხდა', 'error')
        return
      }
      setCancelConfirmOpen(false)
      await load()
      // Invalidate the server-cached bookings list so navigating back
      // shows the freshly cancelled booking in the CANCELED tab, not the
      // stale UPCOMING snapshot.
      router.refresh()
      toast('ჯავშანი გაუქმდა', 'success')
    } finally {
      setCancelBusy(false)
    }
  }

  // Client's half of the symmetric no-show flow. PATCH { action:
  // 'expert_no_show' } marks the session as not held and refunds the client —
  // the exact mirror of the expert's own `no_show`. The server re-checks role,
  // status and the grace window, so the button state is only an offer.
  const confirmExpertNoShow = async () => {
    if (!booking || noShowBusy) return
    setNoShowBusy(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'expert_no_show' }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        toast(
          data?.error === 'TOO_EARLY' ? `ჯერ ადრეა — დაწყებიდან ${NO_SHOW_GRACE_MIN} წუთი უნდა გავიდეს.` :
          data?.error === 'BAD_STATE' ? 'ეს სესია უკვე დახურულია — განაახლე გვერდი.' :
          'აღნიშვნა ვერ მოხერხდა — სცადე თავიდან',
          'error',
        )
        return
      }
      setNoShowConfirmOpen(false)
      await reload()
      toast('აღვნიშნეთ — სესია არ შედგა', 'success')
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally {
      setNoShowBusy(false)
    }
  }

  const copyRef = async () => {
    if (!booking) return
    const ok = await copyToClipboard(booking.ref)
    toast(ok ? 'დაკოპირდა' : 'ვერ დაკოპირდა', ok ? 'success' : 'error')
  }

  const enterRoom = () => {
    if (!booking) return
    router.push(`/session/${booking.id}`)
  }

  if (notFound) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-[480px] w-full text-center">
            <h1 className="font-display text-h2 font-bold text-ink-900">ჯავშანი ვერ მოიძებნა</h1>
            <p className="text-body text-ink-500 mt-2">შესაძლოა წაიშალა, ან შენ არ ხარ მისი მონაწილე.</p>
            <Link href="/me/bookings" className="tap-shrink mt-6 inline-flex h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body items-center gap-2">
              ჩემი ჯავშნები
            </Link>
          </div>
      </div>
    )
  }

  // Failed load with nothing cached to fall back on — compact retry card
  // (icon + one line + one action), plus a quiet way out because BottomNav is
  // hidden on this route.
  if (!booking && loadError) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-[360px] w-full text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 text-ink-500 inline-flex items-center justify-center mb-3">
            <Icon.warn className="w-6 h-6" />
          </div>
          <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">ვერ ჩაიტვირთა</div>
          <p className="text-small text-ink-500 mt-1.5 leading-relaxed">შეამოწმე ინტერნეტი და სცადე თავიდან.</p>
          <button
            type="button"
            onClick={() => { setLoadError(false); load() }}
            className="mt-4 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.refresh className="w-3.5 h-3.5" />
            სცადე თავიდან
          </button>
          <div className="mt-3">
            <Link href="/me/bookings" className="font-display text-meta font-semibold text-ink-500 hover:text-ink-900 transition-colors duration-fast">ჩემი ჯავშნები</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center">
        {/* The ring carries the motion; the LABEL is what still says "working"
            once `motion-safe:` removes the spin for reduced-motion users — a
            frozen arc alone is indistinguishable from a decorative circle. */}
        <div role="status" className="inline-flex items-center gap-3 text-ink-500">
          <span aria-hidden className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full motion-safe:animate-spin" />
          <span className="text-small">იტვირთება…</span>
        </div>
      </div>
    )
  }

  // Hours until the session starts — drives the honest cancellation-policy
  // sentence in the confirm dialog (CANCEL_CUTOFF_HOURS is the canonical
  // free-cancellation window shared with the server).
  const hoursToStart = (new Date(booking.startAt).getTime() - Date.now()) / 3_600_000

  return (
    <>
      <Breadcrumb status={booking.status} ref={booking.ref} />
      <Hero booking={booking} onEnterRoom={enterRoom} onCopyRef={copyRef} />
      {/* Inline review card — highest signal CTA post-session. Auto-collapses to
          a read-only summary once the student has submitted, with a small edit
          link (30-day window). */}
      {booking.status === 'COMPLETED' && (
        <InlineReviewCard
          booking={booking}
          existing={booking.review ?? null}
          onSaved={reload}
        />
      )}
      {/* Reschedule proposal banner — shown while a request is pending. */}
      {booking.rescheduleRequest && (
        <RescheduleBanner
          booking={booking}
          meRole="STUDENT"
          onResolved={reload}
        />
      )}
      <BookingBody
        booking={booking}
        meId={meId}
        onRefresh={reload}
        onReschedule={() => setRescheduleOpen(true)}
        onCancel={cancelBooking}
        onDispute={() => setDisputeOpen(true)}
        onReportNoShow={() => setNoShowConfirmOpen(true)}
      />

      <MobileActionBar
        booking={booking}
        onReschedule={() => setRescheduleOpen(true)}
        onCancel={cancelBooking}
      />

      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        onSent={() => { setRescheduleOpen(false); setRescheduledOk(true); setTimeout(() => setRescheduledOk(false), 3000); reload() }}
        booking={booking}
      />
      <DisputeModal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        bookingId={booking.id}
        onSent={() => { setDisputeOpen(false); setDisputeSent(true); setTimeout(() => setDisputeSent(false), 3000); reload() }}
      />
      {rescheduledOk && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-confirm inline-flex items-center gap-2 px-4 py-2.5 rounded-pill bg-success-600 text-white font-display text-small font-semibold shadow-float">
          <Icon.check className="w-3.5 h-3.5" /> გაიგზავნა — ექსპერტმა უნდა დაადასტუროს
        </div>
      )}
      {disputeSent && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-confirm inline-flex items-center gap-2 px-4 py-2.5 rounded-pill bg-danger-600 text-white font-display text-small font-semibold shadow-float">
          <Icon.check className="w-3.5 h-3.5" /> საჩივარი გაიგზავნა
        </div>
      )}
      <ConfirmModal
        open={cancelConfirmOpen}
        title="ჯავშნის გაუქმება?"
        body={
          PAYMENTS_LIVE
            ? (hoursToStart >= CANCEL_CUTOFF_HOURS
                ? `სესიის დაწყებამდე ${CANCEL_CUTOFF_HOURS} საათზე მეტია დარჩენილი — დაცული თანხა სრულად დაგიბრუნდება.`
                : `სესიის დაწყებამდე ${CANCEL_CUTOFF_HOURS} საათზე ნაკლებია დარჩენილი — სრული დაბრუნება გარანტირებული აღარ არის.`)
            : 'გაუქმება უფასოა — ჯერ არაფერი გადაგიხდია. დრო გათავისუფლდება და ექსპერტს ეცნობება.'
        }
        tone="danger"
        confirmLabel="გაუქმება"
        cancelLabel="უკან"
        onConfirm={confirmCancel}
        onCancel={() => setCancelConfirmOpen(false)}
        busy={cancelBusy}
      />
      {/* Expert no-show — last-resort, irreversible, so it goes through the same
          alertdialog primitive as cancellation and says plainly what follows. */}
      <ConfirmModal
        open={noShowConfirmOpen}
        title="სესია არ შედგა?"
        body={
          <>
            სესია აღინიშნება, როგორც არშემდგარი.{' '}
            {PAYMENTS_LIVE
              ? 'დაცული თანხა სრულად დაგიბრუნდება — ექსპერტს არაფერი გადაეცემა.'
              : 'გადასახდელი არაფერია — ექსპერტს თანხა არ გადაეცემა.'}{' '}
            ექსპერტს ეცნობება და, თუ არ დაეთანხმება, საკითხს გუნდი გადახედავს.
          </>
        }
        tone="danger"
        confirmLabel="აღნიშვნა"
        cancelLabel="უკან"
        onConfirm={confirmExpertNoShow}
        onCancel={() => setNoShowConfirmOpen(false)}
        busy={noShowBusy}
      />
    </>
  )
}
