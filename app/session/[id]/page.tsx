'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Container } from '@/components/Container'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { ConfirmModal } from '@/components/ConfirmModal'
import { StatusPill } from '@/components/StatusPill'
import { useToast } from '@/components/ToastProvider'
import { copyToClipboard } from '@/lib/clipboard'
import { fmtDateTime as fmtInTz, userTimezone, TBILISI } from '@/lib/tz'

type BookingStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'

type Booking = {
  id: string
  ref: string
  topic: string
  status: BookingStatus
  startAt: string
  durationMin: number
  price: number
  meetingUrl?: string | null
  student: { id: string; fullName: string; avatarUrl?: string | null }
  tutor: { user: { id: string; fullName: string; avatarUrl?: string | null } }
}

type Me = { id: string; fullName: string; role: string } | null

const toneOf = (s: BookingStatus) =>
  s === 'PREPARING' ? 'preparing'
  : s === 'CONFIRMED' ? 'confirmed'
  : s === 'LIVE' ? 'live'
  : s === 'COMPLETED' ? 'completed'
  : s === 'CANCELED' ? 'canceled'
  : 'noshow' as const

// SSR-safe: format against a caller-supplied tz. Callers pass `userTimezone()`
// only after mount, otherwise we default to Tbilisi so first paint is stable.
const fmtDateTime = (iso: string, tz: string = TBILISI) => {
  const { local } = fmtInTz(iso, {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
  }, tz)
  return local
}

export default function SessionRoom() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const bookingId = params?.id
  const { toast } = useToast()
  const [me, setMe] = useState<Me>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [notFound, setNotFound] = useState(false)
  // Any other non-OK response (403 is folded into notFound, 5xx/garbage body
  // lands here). Previously an error body was fed straight into `setBooking`,
  // so `booking.ref.slice()` threw and the error boundary replaced the page.
  const [loadErr, setLoadErr] = useState(false)
  // Bumped by the retry button to re-run the load effect.
  const [retryKey, setRetryKey] = useState(0)
  const [completing, setCompleting] = useState(false)
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false)
  const [completeErr, setCompleteErr] = useState<string | null>(null)
  const [now, setNow] = useState<number>(Date.now())
  // Client-only browser tz; empty until the effect runs so SSR keeps Tbilisi.
  const [tz, setTz] = useState<string>(TBILISI)
  useEffect(() => { setTz(userTimezone()) }, [])

  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    setLoadErr(false)
    // An unbounded request would otherwise leave the room on a spinner forever.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    ;(async () => {
      try {
        const [meRes, bRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()).catch(() => null),
          fetch(`/api/bookings/${bookingId}`, { signal: ctrl.signal }),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        // 403 = not a participant — same honest answer as 404.
        if (bRes.status === 404 || bRes.status === 403) { setNotFound(true); return }
        if (bRes.status === 401) {
          // Preserve the current URL so the sign-in flow can bounce the user
          // back to the exact session they were trying to open.
          const ret = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/signin?redirect=${ret}`
          return
        }
        if (!bRes.ok) { setLoadErr(true); return }
        const b = await bRes.json().catch(() => null)
        if (cancelled) return
        // Shape guard: a 200 with an unexpected body must not reach the render
        // path (booking.ref / booking.tutor are dereferenced unconditionally).
        if (!b?.id || typeof b?.ref !== 'string' || !b?.tutor?.user) { setLoadErr(true); return }
        setBooking(b)
      } catch {
        // A network drop is transient — offer a retry, don't claim „ვერ მოიძებნა".
        if (!cancelled) setLoadErr(true)
      } finally {
        clearTimeout(timer)
      }
    })()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [bookingId, router, retryKey])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Actual PATCH — fired from the ConfirmModal's confirm button (the native
  // confirm() dialog was replaced by the app's shared modal for consistency).
  const complete = async () => {
    if (!booking || completing) return
    setCompleting(true)
    setCompleteErr(null)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })
      if (res.status === 401) {
        const ret = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/signin?redirect=${ret}`
        return
      }
      if (res.status >= 500) { setCompleteErr('სერვერის შეცდომა.'); return }
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { setCompleteErr('ვერ მოინიშნა'); return }
      setBooking(b => b ? { ...b, status: 'COMPLETED' } : b)
      // Invalidate the server-cached bookings list so parent routes see
      // the new COMPLETED status without a hard reload.
      router.refresh()
    } catch {
      setCompleteErr('ქსელის შეცდომა')
    } finally {
      setCompleting(false)
      // Close the dialog either way — success shows the COMPLETED banner,
      // failure surfaces the inline error alert under the join button.
      setCompleteConfirmOpen(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-ink-50 flex flex-col items-center justify-center px-6 py-10">
        <div className="max-w-[560px] w-full text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-ink-100 text-ink-500 inline-flex items-center justify-center mb-4">
            <Icon.warn className="w-7 h-7" />
          </div>
          <h1 className="font-display text-h2 font-bold text-ink-900">სესია ვერ მოიძებნა</h1>
          <p className="text-body text-ink-500 mt-2">ჯავშანი წაიშალა ან შენ არ ხარ მონაწილე.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Btn variant="secondary" href="/student/bookings">ჩემი ჯავშნები</Btn>
            <Btn variant="primary" href="/tutors">ექსპერტები</Btn>
          </div>
        </div>
      </div>
    )
  }

  // Transient failure — compact retry state (icon + one line + one action)
  // instead of the crash the raw error body used to cause.
  if (loadErr && !booking) {
    return (
      <div className="min-h-screen bg-ink-50 flex flex-col items-center justify-center px-6 py-10">
        <div className="max-w-[360px] w-full text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 text-ink-500 inline-flex items-center justify-center mb-3">
            <Icon.warn className="w-6 h-6" />
          </div>
          <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">ვერ ჩაიტვირთა</div>
          <p className="text-small text-ink-500 mt-1.5 leading-relaxed">შეამოწმე ინტერნეტი და სცადე თავიდან.</p>
          <div className="mt-4">
            <Btn variant="primary" size="md" onClick={() => { setLoadErr(false); setRetryKey(k => k + 1) }}>
              <Icon.refresh className="w-3.5 h-3.5" /> სცადე თავიდან
            </Btn>
          </div>
          <div className="mt-3">
            <Link href="/student/bookings" className="font-display text-meta font-semibold text-ink-500 hover:text-ink-900 transition-colors duration-fast">ჩემი ჯავშნები</Link>
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

  const startMs = new Date(booking.startAt).getTime()
  const msUntil = startMs - now
  // Open the room as soon as the countdown reads „5 წთ" (which spans 5:00–5:59
  // because the label floors minutes) — i.e. at ≤ 6 min out. Previously the gate
  // was a hard 5:00, so the room looked "not open yet" the whole time it said
  // „5 წთ". (Instant-call bypasses this gate entirely.)
  const isBefore = msUntil > 6 * 60 * 1000
  // Same cutoff as the API's meetingUrl masking: scheduled end + 30 minutes.
  // Past it, a never-completed CONFIRMED/LIVE booking gets a terminal state
  // instead of a dead countdown/join surface.
  const isPastCutoff = now > startMs + (booking.durationMin + 30) * 60_000
  const isTutor = me?.id === booking.tutor.user.id
  const backHref = isTutor ? `/tutor/bookings/${booking.id}` : `/student/bookings/${booking.id}`

  const humanCountdown = (ms: number) => {
    if (ms <= 0) return 'ახლა'
    const totalMin = Math.floor(ms / 60_000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    if (h >= 24) {
      const d = Math.floor(h / 24)
      return `${d} დღე ${h % 24} სთ`
    }
    if (h > 0) return `${h} სთ ${m} წთ`
    return `${m} წთ`
  }

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <header className="bg-white border-b border-ink-200">
        <Container size="content" className="h-14 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>
          <Link href={backHref} className="text-small text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
            <Icon.arrow className="w-3.5 h-3.5 rotate-180" /> ჯავშნის დეტალები
          </Link>
        </Container>
      </header>

      <Container as="main" size="content" className="flex-1 py-10 w-full">
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-ink-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <StatusPill tone={toneOf(booking.status)} />
                  <span className="text-meta text-ink-500 font-mono">{booking.ref.slice(0, 12)}</span>
                </div>
                <h1 className="font-display text-h2 sm:text-h1 font-bold tracking-tight text-ink-900 motion-safe:animate-rise-in">{booking.topic}</h1>
                <div className="text-small text-ink-500 mt-2">
                  {fmtDateTime(booking.startAt, tz)} · {booking.durationMin} წუთი
                  {tz !== TBILISI && (
                    <span className="ml-1.5 text-meta text-ink-400">(თბილისის დროით: {fmtDateTime(booking.startAt, TBILISI)})</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={booking.tutor.user.avatarUrl ?? undefined} name={booking.tutor.user.fullName} size={44} />
                <div className="min-w-0">
                  <div className="text-meta text-ink-500 font-semibold uppercase">ექსპერტი</div>
                  <div className="font-display text-body font-bold text-ink-900 truncate">{booking.tutor.user.fullName}</div>
                </div>
              </div>
              <div className="h-8 w-px bg-ink-200 hidden sm:block" />
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={booking.student.avatarUrl ?? undefined} name={booking.student.fullName} size={44} />
                <div className="min-w-0">
                  <div className="text-meta text-ink-500 font-semibold uppercase">სტუდენტი</div>
                  <div className="font-display text-body font-bold text-ink-900 truncate">{booking.student.fullName}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {booking.status === 'CANCELED' && (
              <div className="p-4 rounded-btn bg-ink-50 border border-ink-200 text-small text-ink-700 text-center">
                სესია გაუქმდა.
              </div>
            )}

            {booking.status === 'NO_SHOW' && (
              <div className="p-4 rounded-btn bg-ink-50 border border-ink-200 text-small text-ink-700 text-center">
                მხარე არ გამოცხადდა.
              </div>
            )}

            {booking.status === 'COMPLETED' && (
              <div className="p-4 rounded-btn bg-success-50 border border-success-200 text-small text-success-800 text-center">
                სესია დასრულდა.
                {!isTutor && (
                  <div className="mt-3">
                    <Link
                      href={`/student/bookings/${booking.id}?review=1`}
                      className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body transition-colors duration-fast"
                    >
                      შეაფასე
                    </Link>
                  </div>
                )}
              </div>
            )}

            {booking.status === 'PREPARING' && (
              <div className="p-4 rounded-btn bg-warning-50 border border-warning-200 text-small text-warning-800 text-center">
                ექსპერტს ჯერ არ დაუდასტურებია — დადასტურების შემდეგ ბმული გაიხსნება.
              </div>
            )}

            {(booking.status === 'CONFIRMED' || booking.status === 'LIVE') && isPastCutoff && (
              <div className="text-center py-8">
                <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 text-ink-500 inline-flex items-center justify-center mb-3">
                  <Icon.clock className="w-6 h-6" />
                </div>
                <div className="font-display text-h3 font-bold text-ink-900">სესია დასრულდა</div>
                <p className="text-small text-ink-500 mt-1">ვიდეოოთახი დაიხურა.</p>
                <div className="mt-5">
                  <Btn variant="secondary" size="md" href={backHref}>ჯავშნის დეტალები</Btn>
                </div>
              </div>
            )}

            {(booking.status === 'CONFIRMED' || booking.status === 'LIVE') && !isPastCutoff && (
              <>
                {isBefore || !booking.meetingUrl ? (
                  <div className="text-center py-8 motion-safe:animate-fade-in">
                    <div className={`text-meta font-semibold uppercase mb-3 ${msUntil < 5 * 60_000 ? 'text-brand-700' : 'text-ink-500'}`}>
                      {msUntil < 5 * 60_000 ? 'იწყება ახლა' : 'დაიწყება'}
                    </div>
                    <div className={`font-display text-display-lg font-bold tabular-nums leading-none motion-safe:animate-scale-in ${msUntil < 5 * 60_000 ? 'text-brand-700 motion-safe:animate-pulse-soft' : 'text-ink-900'}`}>
                      {humanCountdown(msUntil)}
                    </div>
                    <p className="text-small text-ink-500 mt-4 max-w-[420px] mx-auto leading-relaxed motion-safe:animate-rise-in" style={{ animationDelay: '120ms' }}>
                      ვიდეოოთახი გაიხსნება დაწყებამდე 5 წუთით ადრე, პირდაპირ ბრაუზერში.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-meta text-success-700 font-semibold uppercase mb-3 motion-safe:animate-pulse-soft">მზადაა შესვლა</div>
                    <div className="flex flex-wrap items-center justify-center gap-2 max-w-full">
                      <a
                        href={booking.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 h-12 px-8 max-w-full rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-bold text-body-lg tracking-wide shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.4)] transition-all duration-fast"
                      >
                        <Icon.video className="w-5 h-5" /> ვიდეოოთახში შესვლა
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!booking.meetingUrl) return
                          const ok = await copyToClipboard(booking.meetingUrl)
                          toast(ok ? 'ბმული დაკოპირდა' : 'ვერ დაკოპირდა', ok ? 'success' : 'error')
                        }}
                        aria-label="ბმულის კოპირება"
                        title="დააკოპირე ბმული"
                        className="h-12 w-12 inline-flex items-center justify-center rounded-btn bg-white border border-ink-200 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 text-ink-600 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                          <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                          <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-small text-ink-500 mt-4">
                      გაიხსნება ახალ ტაბში.
                    </p>
                    {isTutor && (
                      <div className="mt-6 pt-6 border-t border-ink-100">
                        <div className="text-meta text-ink-500 mb-3">სესიის ბოლოს მონიშნე დასრულებულად — სტუდენტი შეგაფასებს.</div>
                        {completeErr && (
                          <div role="alert" className="mb-3 mx-auto max-w-[380px] rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small px-3 py-2">
                            {completeErr}
                          </div>
                        )}
                        <Btn variant="secondary" size="md" onClick={() => setCompleteConfirmOpen(true)} disabled={completing}>
                          {completing ? 'იგზავნება…' : 'დასრულება'}
                        </Btn>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-4 text-center text-meta text-ink-400">
          ვიდეოზარის შემდეგ — <Link href={backHref} className="text-brand-700 hover:text-brand-800 font-semibold">ჯავშნის დეტალები და მიმოწერა</Link>
        </div>
      </Container>

      <ConfirmModal
        open={completeConfirmOpen}
        title="სესიის დასრულება?"
        body="სესია დასრულდება და სტუდენტი შეგაფასებს."
        tone="brand"
        confirmLabel="დასრულება"
        cancelLabel="უკან"
        onConfirm={complete}
        onCancel={() => setCompleteConfirmOpen(false)}
        busy={completing}
      />
    </div>
  )
}
