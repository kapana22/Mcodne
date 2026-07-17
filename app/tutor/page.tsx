'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/ToastProvider'
import { FEATURE_PAYMENTS_V2 } from '@/lib/flags'
import { isBookingLive } from '@/lib/bookingLive'
import { fmtKaDate, KA_WEEKDAYS_LONG } from '@/lib/kaDate'
import { ProfileCompleteness, type ProfileForCompleteness } from '@/components/ProfileCompleteness'
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
  const [tutorProfile, setTutorProfile] = useState<ProfileForCompleteness>(null)
  const [credCounts, setCredCounts] = useState<{ cert: number; edu: number; exp: number } | null>(null)
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
        toast('სერვერის შეცდომა — სცადეთ თავიდან', 'error')
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
      toast('ქსელის შეცდომა — შეამოწმეთ კავშირი', 'error')
    }
  }
  useEffect(() => { load() }, [])

  // Fetch tutor profile + credential counts for the completeness widget.
  // Failures are silent — the widget just renders nothing.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [pRes, cRes, eRes, xRes, aRes] = await Promise.all([
          fetch('/api/me/tutor').then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/me/tutor/certificates').then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/me/tutor/education').then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/me/tutor/experience').then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/tutor/availability').then(r => r.ok ? r.json() : null).catch(() => null),
        ])
        if (cancelled) return
        setTutorProfile(pRes?.profile ?? null)
        setCredCounts({
          cert: Array.isArray(cRes?.items) ? cRes.items.length : 0,
          edu: Array.isArray(eRes?.items) ? eRes.items.length : 0,
          exp: Array.isArray(xRes?.items) ? xRes.items.length : 0,
        })
        // /api/tutor/availability returns the raw slot list (array or {slots}).
        const slotList: any[] = Array.isArray(aRes) ? aRes : (Array.isArray(aRes?.slots) ? aRes.slots : [])
        const nowMs = Date.now()
        setUpcomingSlots(slotList.filter(s => !s?.booked && new Date(s?.startAt).getTime() > nowMs).length)
      } catch { /* keep widget invisible on failure */ }
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

        {/* Right rail */}
        <aside className="space-y-4 lg:sticky lg:top-[84px]">
          {credCounts === null ? (
            <div className="rounded-card border border-brand-200 bg-brand-50/40 p-4 animate-pulse">
              <div className="h-3 w-24 rounded-pill bg-brand-100" />
              <div className="h-4 w-40 rounded-pill bg-brand-100 mt-2" />
              <div className="h-2 w-full rounded-pill bg-brand-100 mt-3" />
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded-pill bg-brand-100" />
                <div className="h-3 w-5/6 rounded-pill bg-brand-100" />
                <div className="h-3 w-4/6 rounded-pill bg-brand-100" />
              </div>
            </div>
          ) : (
            tutorProfile && (
              <ProfileCompleteness
                profile={tutorProfile}
                certificates={credCounts.cert}
                education={credCounts.edu}
                experience={credCounts.exp}
                avatarUrl={me?.avatarUrl ?? null}
                variant="compact"
              />
            )
          )}
          <div className="rounded-card border border-ink-200 bg-white p-5">
            <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-3">სწრაფი მოქმედებები</div>
            <div className="space-y-2">
              <Link href="/tutor/schedule" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.calendar className="w-4 h-4 text-ink-500" /> გრაფიკის რედაქტ.
              </Link>
              <Link href="/tutor/profile" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.user className="w-4 h-4 text-ink-500" /> პროფილის რედაქტ.
              </Link>
              <Link href="/tutors" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.search className="w-4 h-4 text-ink-500" /> ექსპერტების კატალოგი
              </Link>
            </div>
          </div>

          <div className="rounded-card border border-ink-200 bg-brand-50/40 p-5">
            <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-2">გადახდები</div>
            <p className="text-[12.5px] text-ink-700 leading-[1.55]">
              {FEATURE_PAYMENTS_V2
                ? 'გადახდის ინტეგრაცია მალე დაემატება — ამჟამად ჯავშნები ტარდება უფასოდ.'
                : 'ამჟამად ჯავშნები ტარდება უფასოდ. გადახდები მალე დაემატება.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
