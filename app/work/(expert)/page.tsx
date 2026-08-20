'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { useToast } from '@/components/ToastProvider'
import { isBookingLive } from '@/lib/bookingLive'
import { subtractIntervals } from '@/lib/availability'
import { fmtKaDate, KA_WEEKDAYS_LONG } from '@/lib/kaDate'
import { PageHeader } from '@/components/PageHeader'
import { AlertsStack } from '../_components/AlertsStack'
import { PendingRequests } from '../_components/PendingRequests'
import { ProfileSignal } from '../_components/ProfileSignal'
import { SnapshotRow } from '../_components/SnapshotRow'
import { TodayHero } from '../_components/TodayHero'
import { MonthSchedule, type ScheduleLesson } from '../_components/MonthSchedule'
import type { DashBooking } from '../_components/types'

// Auth redirect helper — preserves the return URL so the user lands back
// on this page after signing in.
const redirectToSignin = () => {
  if (typeof window === 'undefined') return
  window.location.href = '/signin?redirect=' + encodeURIComponent(window.location.pathname + window.location.search)
}

type Me = { id: string; fullName: string; avatarUrl?: string | null } | null

const fmtGreeting = () => {
  const h = new Date().getHours()
  if (h < 5) return 'ღამე მშვიდობისა'
  if (h < 12) return 'დილა მშვიდობისა'
  if (h < 17) return 'დღე მშვიდობისა'
  return 'საღამო მშვიდობისა'
}

export default function TutorHome() {
  const { toast } = useToast()
  const [me, setMe] = useState<Me>(null)
  const [bookings, setBookings] = useState<DashBooking[] | null>(null)
  const [earnings, setEarnings] = useState<{ totalEarned: number; pendingPayout: number; completedCount: number } | null>(null)
  // Profile completeness — loaded in parallel with dashboard data; the widget
  // hides itself once the score hits 100%, so the extra fetch is cheap and
  // never renders a stale nag.
  // Published availability WINDOWS (raw rows) + the server's cap-proof count of
  // upcoming ones. A row is a window, possibly hours long, and nothing writes
  // the legacy `booked` flag any more — so counting rows answers nothing. What
  // decides whether this expert is bookable is how much free TIME is left:
  // windows − active bookings (derived below, same as /tutor/schedule).
  // null = not loaded yet.
  const [slots, setSlots] = useState<{ startAt: string; endAt: string }[] | null>(null)
  const [serverFreeCount, setServerFreeCount] = useState<number | null>(null)
  // Server has UTC clock; client has the visitor's local clock. Rendering
  // greeting/date during SSR causes a hydration mismatch (server picks a
  // different time-of-day bucket than the browser). Defer to a client-only
  // effect so first paint matches the browser's time.
  const [clientNow, setClientNow] = useState<Date | null>(null)
  useEffect(() => { setClientNow(new Date()) }, [])
  // The month grid's data. Fetched separately from `bookings` on purpose: that
  // one is „what needs attention" (paginated, urgency-sorted), this is a whole
  // date range with only the four fields a calendar cell draws.
  const [schedule, setSchedule] = useState<ScheduleLesson[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/tutor/schedule')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j?.items) setSchedule(j.items) })
      // A failed calendar must not take the dashboard down with it — the grid
      // simply does not render.
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const load = async () => {
    try {
      const [meRes, bRes, eRes] = await Promise.all([
        fetch('/api/me'),
        fetch('/api/tutor/bookings'),
        fetch('/api/tutor/earnings'),
      ])
      // Any 401 across the three parallel calls → session expired.
      if (meRes.status === 401 || bRes.status === 401 || eRes.status === 401) {
        redirectToSignin()
        return
      }
      // Any 5xx → surface Georgian error toast instead of silently hiding.
      if (meRes.status >= 500 || bRes.status >= 500 || eRes.status >= 500) {
        toast('სერვერის შეცდომა — სცადე თავიდან', 'error')
        setBookings([])
        return
      }
      const meJson = await meRes.json().catch(() => ({}))
      const bJson = await bRes.json().catch(() => ({ bookings: [] }))
      const eJson = eRes.ok ? await eRes.json().catch(() => null) : null
      setMe(meJson?.user ?? null)
      setBookings(bJson?.bookings ?? [])
      if (eJson) setEarnings({ totalEarned: eJson.totalEarned, pendingPayout: eJson.pendingPayout, completedCount: eJson.completedCount })
    } catch {
      setBookings([])
      toast('ქსელის შეცდომა — შეამოწმე კავშირი', 'error')
    }
  }
  useEffect(() => { load() }, [])

  // Published availability, for the „nobody can book you" alert. (Profile/
  // credential fetches that once fed a dashboard completeness widget were
  // removed — completeness now lives once, in the persistent sidebar.)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const aRes = await fetch('/api/tutor/availability').then(r => r.ok ? r.json() : null).catch(() => null)
        if (cancelled) return
        // /api/tutor/availability returns the raw window list (array or {slots}).
        const slotList: any[] = Array.isArray(aRes) ? aRes : (Array.isArray(aRes?.slots) ? aRes.slots : [])
        setSlots(slotList.map(s => ({ startAt: s?.startAt, endAt: s?.endAt })))
        if (typeof aRes?.upcomingFreeCount === 'number') setServerFreeCount(aRes.upcomingFreeCount)
      } catch { /* stay silent — the alert simply doesn't render */ }
    })()
    return () => { cancelled = true }
  }, [])

  const now = Date.now()
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + 7)

  const pending = useMemo(() => (bookings ?? []).filter(b => b.status === 'PREPARING'), [bookings])
  const todaySessions = useMemo(() => (bookings ?? []).filter(b => {
    const d = new Date(b.startAt)
    return d >= startOfToday && d < startOfTomorrow && (b.status === 'CONFIRMED' || b.status === 'LIVE')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [bookings])
  // „მოსალოდნელი" counts only sessions that will actually happen — CONFIRMED
  // or already LIVE. PREPARING is still an unanswered request, not a session.
  const upcomingWeek = useMemo(() => (bookings ?? []).filter(b => {
    const d = new Date(b.startAt)
    return d >= startOfToday && d < endOfWeek && (b.status === 'CONFIRMED' || b.status === 'LIVE')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [bookings])
  const nextSession = useMemo(() => (bookings ?? [])
    .filter(b => (b.status === 'CONFIRMED' || b.status === 'LIVE') &&
      (isBookingLive(b) || new Date(b.startAt).getTime() >= now))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0] ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings])
  // Today's confirmed sessions minus the one already in the hero.
  const todayRest = useMemo(
    () => todaySessions.filter(b => b.id !== nextSession?.id),
    [todaySessions, nextSession],
  )

  const loading = bookings === null

  /* ── Is anyone able to book this expert at all? ──────────────────────────
   * Free availability is a DURATION, not a row count: one 3-hour window is not
   * „1 თავისუფალი დრო", and a window with a session inside it is not free.
   * Bookings are already in hand (loaded above), so the honest figure costs no
   * extra fetch — it is exactly the subtraction /tutor/schedule shows, and the
   * client-facing picker does server-side (lib/availability.ts). */
  const freeMinutes = useMemo(() => {
    if (slots === null) return null
    const nowMs = Date.now()
    const windows = slots.map(s => ({ start: new Date(s.startAt), end: new Date(s.endAt) }))
    const busy = (bookings ?? [])
      .filter(b => b.status === 'PREPARING' || b.status === 'CONFIRMED' || b.status === 'LIVE')
      .map(b => {
        const st = new Date(b.startAt)
        return { start: st, end: new Date(st.getTime() + b.durationMin * 60_000) }
      })
    let ms = 0
    for (const iv of subtractIntervals(windows, busy)) {
      const s = Math.max(iv.start.getTime(), nowMs)
      if (iv.end.getTime() > s) ms += iv.end.getTime() - s
    }
    return Math.round(ms / 60_000)
  }, [slots, bookings])

  // AlertsStack consults only the ZERO-ness of this number ("დროის გარეშე
  // ვერავინ დაგიჯავშნის"), so it gets the free-minutes figure rather than a
  // meaningless row count. The server count is the same safety net the schedule
  // banner uses — the row list is capped at 500 oldest-first, so a legacy expert
  // with hundreds of past rows must not be told they published nothing — which
  // also keeps this alert and the banner behind its CTA in agreement.
  const bookable = freeMinutes === null
    ? null
    : freeMinutes === 0 && (serverFreeCount ?? 0) === 0 ? 0 : Math.max(1, freeMinutes)

  return (
    <div>
      {/* Greeting — sign-out lives in the UserMenu now. Canonical PageHeader
          block; the date line rides the eyebrow slot (nbsp reserves the line
          pre-mount so the header doesn't jump when the client clock lands). */}
      <PageHeader
        className="mb-6 motion-safe:animate-rise-in"
        eyebrow={clientNow ? `${KA_WEEKDAYS_LONG[clientNow.getDay()]}, ${fmtKaDate(clientNow, { month: 'long' })}` : ' '}
        title={`${clientNow ? fmtGreeting() : 'გამარჯობა'}${me?.fullName ? `, ${me.fullName.split(' ')[0]}` : ''}`}
        sub={todaySessions.length > 0
          ? `${todaySessions.length} სესია დღეს${pending.length > 0 ? ` · ${pending.length} მოთხოვნა ელოდება` : ''}`
          : pending.length > 0
          ? `${pending.length} მოთხოვნა ელოდება`
          : 'დღეს სესია არ გაქვს'}
      />

      <AlertsStack bookings={bookings ?? []} upcomingSlots={bookable} />

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Left */}
        <div className="min-w-0 space-y-6">
          <TodayHero next={loading ? null : nextSession} todayRest={todayRest} noFreeTime={bookable === 0} />
          {(loading || pending.length > 0) && (
            <PendingRequests pending={pending} loading={loading} onChanged={load} />
          )}
          {/* „is my profile working?" — views vs bookings, with the reading
              that tells visibility apart from persuasion.
              WITH ZERO BOOKABLE TIME IT DOES NOT RENDER AT ALL: its only
              possible verdict then is „გამოაქვეყნე დრო", which the alert row
              above and the OpenTimeNudge modal already say. One screen was
              telling the expert the same thing four times; now it says it once,
              and this card comes back the moment there is time to analyse. */}
          {/* The month. Sits directly under „today" because a teacher's whole
              question is the SHAPE of the month, not the next single session.
              Renders for everyone — a consultant's month is just sparser — but
              only draws when there is something in the window. */}
          {schedule.length > 0 && <MonthSchedule lessons={schedule} loading={loading} />}
          {bookable !== 0 && <ProfileSignal freeMinutes={bookable} />}
          <SnapshotRow
            loading={loading}
            today={todaySessions.length}
            week={upcomingWeek.length}
            completed={earnings?.completedCount ?? 0}
            totalEarned={earnings?.totalEarned ?? 0}
            pendingPayout={earnings?.pendingPayout ?? 0}
          />
        </div>

        {/* Right rail — profile-completeness lives ONCE, in the persistent
            sidebar (it was duplicated here); payments-status lives ONCE, on the
            earnings page. This rail stays to just the quick actions. */}
        <aside className="space-y-4 lg:sticky lg:top-[84px]">
          <Card padding="none" className="p-5">
            <Eyebrow tone="muted" className="mb-3">მოქმედებები</Eyebrow>
            <div className="space-y-2">
              <Link href="/work/schedule" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.calendar className="w-4 h-4 text-ink-500" /> გრაფიკი
              </Link>
              <Link href="/work/profile" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.user className="w-4 h-4 text-ink-500" /> პროფილი
              </Link>
              <Link href="/experts" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.search className="w-4 h-4 text-ink-500" /> ექსპერტები
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
