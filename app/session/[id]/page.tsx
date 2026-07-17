'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
    ;(async () => {
      try {
        const [meRes, bRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()).catch(() => null),
          fetch(`/api/bookings/${bookingId}`),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        if (bRes.status === 404) { setNotFound(true); return }
        if (bRes.status === 401) {
          // Preserve the current URL so the sign-in flow can bounce the user
          // back to the exact session they were trying to open.
          const ret = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/signin?redirect=${ret}`
          return
        }
        setBooking(await bRes.json())
      } catch {
        if (!cancelled) setNotFound(true)
      }
    })()
    return () => { cancelled = true }
  }, [bookingId, router])

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
      if (res.status >= 500) { setCompleteErr('სერვერის შეცდომა. სცადე მოგვიანებით.'); return }
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { setCompleteErr('დასრულების აღნიშვნა ვერ მოხერხდა'); return }
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
          <h1 className="font-display text-[22px] font-bold text-ink-900">სესია ვერ მოიძებნა</h1>
          <p className="text-[13.5px] text-ink-500 mt-2">შესაძლოა ჯავშანი წაიშალა, ან თქვენ არ ხართ მისი მონაწილე.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Btn variant="secondary" href="/student/bookings">ჩემი ჯავშნები</Btn>
            <Btn variant="primary" href="/tutors">ექსპერტების ძებნა</Btn>
          </div>
        </div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center">
        <span className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const startMs = new Date(booking.startAt).getTime()
  const msUntil = startMs - now
  const isBefore = msUntil > 5 * 60 * 1000
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
        <div className="max-w-[900px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>
          <Link href={backHref} className="text-[13px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
            <Icon.arrow className="w-3.5 h-3.5 rotate-180" /> ჯავშნის დეტალები
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-10 max-w-[900px] w-full mx-auto">
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-ink-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <StatusPill tone={toneOf(booking.status)} />
                  <span className="text-[11.5px] text-ink-500 font-mono">{booking.ref.slice(0, 12)}</span>
                </div>
                <h1 className="font-display text-[22px] sm:text-[26px] font-bold tracking-tight text-ink-900 motion-safe:animate-rise-in">{booking.topic}</h1>
                <div className="text-[13px] text-ink-500 mt-2">
                  {fmtDateTime(booking.startAt, tz)} · {booking.durationMin} წუთი
                  {tz !== TBILISI && (
                    <span className="ml-1.5 text-[11px] text-ink-400">(თბილისის დროით: {fmtDateTime(booking.startAt, TBILISI)})</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={booking.tutor.user.avatarUrl ?? undefined} name={booking.tutor.user.fullName} size={44} />
                <div className="min-w-0">
                  <div className="text-[11.5px] text-ink-500 font-semibold uppercase tracking-wide">ექსპერტი</div>
                  <div className="font-display text-[14px] font-bold text-ink-900 truncate">{booking.tutor.user.fullName}</div>
                </div>
              </div>
              <div className="h-8 w-px bg-ink-200 hidden sm:block" />
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={booking.student.avatarUrl ?? undefined} name={booking.student.fullName} size={44} />
                <div className="min-w-0">
                  <div className="text-[11.5px] text-ink-500 font-semibold uppercase tracking-wide">კლიენტი</div>
                  <div className="font-display text-[14px] font-bold text-ink-900 truncate">{booking.student.fullName}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {booking.status === 'CANCELED' && (
              <div className="p-4 rounded-btn bg-ink-50 border border-ink-200 text-[13px] text-ink-700 text-center">
                ეს სესია გაუქმებულია.
              </div>
            )}

            {booking.status === 'COMPLETED' && (
              <div className="p-4 rounded-btn bg-success-50 border border-success-200 text-[13px] text-success-800 text-center">
                სესია წარმატებით დასრულდა.
                {!isTutor && (
                  <div className="mt-3">
                    <Link
                      href={`/student/bookings/${booking.id}?review=1`}
                      className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] transition-colors"
                    >
                      შეაფასე სესია
                    </Link>
                  </div>
                )}
              </div>
            )}

            {booking.status === 'PREPARING' && (
              <div className="p-4 rounded-btn bg-warning-50 border border-warning-200 text-[13px] text-warning-800 text-center">
                ჯავშანი ჯერ არ დადასტურდა ექსპერტის მიერ. როცა დადასტურდება — გაიხსნება ვიდეო-ლინკი.
              </div>
            )}

            {(booking.status === 'CONFIRMED' || booking.status === 'LIVE') && (
              <>
                {isBefore || !booking.meetingUrl ? (
                  <div className="text-center py-8 motion-safe:animate-fade-in">
                    <div className={`text-[11.5px] font-semibold uppercase tracking-wide mb-3 ${msUntil < 5 * 60_000 ? 'text-brand-700' : 'text-ink-500'}`}>
                      {msUntil < 5 * 60_000 ? 'იწყება ახლა' : 'დაიწყება'}
                    </div>
                    <div className={`font-display text-[42px] font-bold tabular-nums leading-none motion-safe:animate-scale-in ${msUntil < 5 * 60_000 ? 'text-brand-700 motion-safe:animate-pulse-soft' : 'text-ink-900'}`}>
                      {humanCountdown(msUntil)}
                    </div>
                    <p className="text-[13px] text-ink-500 mt-4 max-w-[420px] mx-auto leading-relaxed motion-safe:animate-rise-in" style={{ animationDelay: '120ms' }}>
                      ვიდეო-ოთახი გაიხსნება სესიის დაწყებამდე 5 წუთით ადრე. Jitsi Meet — ბრაუზერშივე იხსნება, აპლიკაცია არ სჭირდება.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-[11.5px] text-success-700 font-semibold uppercase tracking-wide mb-3 motion-safe:animate-pulse-soft">მზადაა შესვლა</div>
                    <div className="inline-flex items-center gap-2">
                      <a
                        href={booking.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 h-14 px-8 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-bold text-[16px] tracking-wide shadow-brand-glow hover:shadow-[0_10px_32px_rgba(21,154,130,0.4)] transition-all duration-fast"
                      >
                        <Icon.video className="w-5 h-5" /> ვიდეო-ოთახში შესვლა
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
                        className="h-14 w-14 inline-flex items-center justify-center rounded-btn bg-white border border-ink-200 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 text-ink-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                          <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                          <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-[12.5px] text-ink-500 mt-4">
                      გაიხსნება ახალ ტაბში.
                    </p>
                    {isTutor && (
                      <div className="mt-6 pt-6 border-t border-ink-100">
                        <div className="text-[12px] text-ink-500 mb-3">როცა სესია დასრულდება, აღნიშნე ის დასრულებულად — კლიენტს გაეხსნება შეფასების საშუალება.</div>
                        {completeErr && (
                          <div role="alert" className="mb-3 mx-auto max-w-[380px] rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[12.5px] px-3 py-2">
                            {completeErr}
                          </div>
                        )}
                        <Btn variant="secondary" size="md" onClick={() => setCompleteConfirmOpen(true)} disabled={completing}>
                          {completing ? 'იგზავნება…' : 'დასრულებულად აღნიშვნა'}
                        </Btn>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-4 text-center text-[12px] text-ink-400">
          ვიდეო-ზარის შემდეგ — <Link href={backHref} className="text-brand-700 hover:text-brand-800 font-semibold">ჯავშნის დეტალები და მიმოწერა</Link>
        </div>
      </main>

      <ConfirmModal
        open={completeConfirmOpen}
        title="სესიის დასრულება?"
        body="სესია დასრულებულად აღინიშნება და კლიენტს გაეხსნება შეფასების საშუალება."
        tone="brand"
        confirmLabel="დასრულებულად აღნიშვნა"
        cancelLabel="უკან"
        onConfirm={complete}
        onCancel={() => setCompleteConfirmOpen(false)}
        busy={completing}
      />
    </div>
  )
}
