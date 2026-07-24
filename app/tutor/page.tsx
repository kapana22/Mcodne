'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { useToast } from '@/components/ToastProvider'
import { isBookingLive } from '@/lib/bookingLive'
import { fmtKaDate, KA_WEEKDAYS_LONG } from '@/lib/kaDate'
import { PageHeader } from '@/components/tutor/PageHeader'
import { AlertsStack } from './_components/AlertsStack'
import { PendingRequests } from './_components/PendingRequests'
import { SnapshotRow } from './_components/SnapshotRow'
import { TodayHero } from './_components/TodayHero'
import type { DashBooking } from './_components/types'

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
  // Count of upcoming, still-free availability slots. Since booking REQUIRES
  // a published slot, an expert with zero upcoming slots is invisible — the
  // alerts stack nags them to publish availability. null = not loaded yet.
  const [upcomingSlots, setUpcomingSlots] = useState<number | null>(null)
  // Server has UTC clock; client has the visitor's local clock. Rendering
  // greeting/date during SSR causes a hydration mismatch (server picks a
  // different time-of-day bucket than the browser). Defer to a client-only
  // effect so first paint matches the browser's time.
  const [clientNow, setClientNow] = useState<Date | null>(null)
  useEffect(() => { setClientNow(new Date()) }, [])

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

  // Upcoming free-slot count for the snapshot. (Profile/credential fetches that
  // once fed a dashboard completeness widget were removed — completeness now
  // lives once, in the persistent sidebar.)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const aRes = await fetch('/api/tutor/availability').then(r => r.ok ? r.json() : null).catch(() => null)
        if (cancelled) return
        // /api/tutor/availability returns the raw slot list (array or {slots}).
        const slotList: any[] = Array.isArray(aRes) ? aRes : (Array.isArray(aRes?.slots) ? aRes.slots : [])
        const nowMs = Date.now()
        setUpcomingSlots(slotList.filter(s => !s?.booked && new Date(s?.startAt).getTime() > nowMs).length)
      } catch { /* leave the snapshot at 0 on failure */ }
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
          ? `დღეს გაქვს ${todaySessions.length} სესია${pending.length > 0 ? `, ${pending.length} მოთხოვნა ელოდება პასუხს` : ''}.`
          : pending.length > 0
          ? `დღეს სესია არ გაქვს — ${pending.length} მოთხოვნა ელოდება პასუხს.`
          : 'დღეს სესია და ახალი მოთხოვნა არ გაქვს.'}
      />

      <AlertsStack bookings={bookings ?? []} upcomingSlots={upcomingSlots} />

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Left */}
        <div className="min-w-0 space-y-6">
          <TodayHero next={loading ? null : nextSession} todayRest={todayRest} />
          {(loading || pending.length > 0) && (
            <PendingRequests pending={pending} loading={loading} onChanged={load} />
          )}
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
            <Eyebrow tone="muted" className="mb-3">სწრაფი მოქმედებები</Eyebrow>
            <div className="space-y-2">
              <Link href="/tutor/schedule" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.calendar className="w-4 h-4 text-ink-500" /> გრაფიკის რედაქტ.
              </Link>
              <Link href="/tutor/profile" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.user className="w-4 h-4 text-ink-500" /> პროფილის რედაქტ.
              </Link>
              <Link href="/tutors" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.search className="w-4 h-4 text-ink-500" /> ექსპერტები
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
