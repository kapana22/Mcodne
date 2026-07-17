'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { TutorAppBar } from '@/components/TutorAppBar'
import { Footer } from '@/components/Footer'
import { Avatar } from '@/components/Avatar'
import { StatusPill } from '@/components/StatusPill'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { SkeletonKpi, SkeletonRow } from '@/components/Skeleton'
import { useToast } from '@/components/ToastProvider'
import { signOut as doSignOut } from '@/lib/signout'
import { CountUp } from '@/components/CountUp'
import { FEATURE_PAYMENTS_V2 } from '@/lib/flags'
import { isBookingLive } from '@/lib/bookingLive'
import { ProfileCompleteness, type ProfileForCompleteness } from '@/components/ProfileCompleteness'

// Auth redirect helper — preserves the return URL so the user lands back
// on this page after signing in.
const redirectToSignin = () => {
  if (typeof window === 'undefined') return
  window.location.href = '/signin?redirect=' + encodeURIComponent(window.location.pathname + window.location.search)
}

type BookingStatus = 'PREPARING' | 'CONFIRMED' | 'LIVE' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'
type Booking = {
  id: string
  ref: string
  topic: string
  status: BookingStatus
  startAt: string
  durationMin: number
  price: number
  student: { id: string; fullName: string; avatarUrl?: string | null } | null
}
type Me = { id: string; fullName: string; avatarUrl?: string | null } | null

// Georgian date/time helpers. Node's built-in ICU only ships en-US data, so
// `toLocaleDateString('ka-GE', ...)` returns English on the server and Georgian
// on the client — causing a React hydration mismatch on every load. To avoid
// that, all Georgian-formatted dates are computed manually here.
const KA_WEEKDAYS = ['კვირა','ორშ.','სამშ.','ოთხ.','ხუთ.','პარ.','შაბ.']
const KA_MONTHS = [
  'იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი',
  'ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი',
]
const KA_MONTHS_SHORT = ['იან.','თებ.','მარ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექ.','ოქტ.','ნოე.','დეკ.']

const fmtGreeting = () => {
  const h = new Date().getHours()
  if (h < 5) return 'ღამე მშვიდობისა'
  if (h < 12) return 'დილა მშვიდობისა'
  if (h < 17) return 'დღე მშვიდობისა'
  return 'საღამო მშვიდობისა'
}

const fmtDate = (d = new Date()) =>
  `${KA_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${KA_MONTHS[d.getMonth()]}`

const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return '' }
}

const fmtDateShort = (iso: string) => {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return `${d.getDate()} ${KA_MONTHS_SHORT[d.getMonth()]}`
  } catch { return '' }
}

const toneOf = (s: BookingStatus) =>
  s === 'PREPARING' ? 'preparing'
  : s === 'CONFIRMED' ? 'confirmed'
  : s === 'LIVE' ? 'live'
  : s === 'COMPLETED' ? 'completed'
  : s === 'CANCELED' ? 'canceled'
  : 'noshow' as const

export default function TutorHome() {
  const { toast } = useToast()
  const [me, setMe] = useState<Me>(null)
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [earnings, setEarnings] = useState<{ totalEarned: number; pendingPayout: number; completedCount: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Profile completeness — loaded in parallel with dashboard data; the widget
  // hides itself once the score hits 100%, so the extra fetch is cheap and
  // never renders a stale nag.
  const [tutorProfile, setTutorProfile] = useState<ProfileForCompleteness>(null)
  const [credCounts, setCredCounts] = useState<{ cert: number; edu: number; exp: number } | null>(null)
  // Count of upcoming, still-free availability slots. Since booking now REQUIRES
  // a published slot, an expert with zero upcoming slots is invisible/unbookable
  // — the dashboard nags them to publish availability. null = not loaded yet.
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
  }), [bookings])
  const upcomingWeek = useMemo(() => (bookings ?? []).filter(b => {
    const d = new Date(b.startAt)
    return d >= startOfToday && d < endOfWeek && (b.status === 'CONFIRMED' || b.status === 'PREPARING')
  }), [bookings])
  const nextSession = useMemo(() => (bookings ?? [])
    .filter(b => (b.status === 'CONFIRMED' || b.status === 'LIVE') && new Date(b.startAt).getTime() >= now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0] ?? null,
    [bookings, now])

  const decide = async (bookingId: string, action: 'accept' | 'decline') => {
    setBusy(bookingId + action)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.status === 401) { redirectToSignin(); return }
      if (res.status >= 500) { toast('სერვერის შეცდომა — სცადეთ თავიდან', 'error'); return }
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { toast('მოქმედება ვერ შესრულდა', 'error'); return }
      toast(action === 'accept' ? 'დადასტურდა' : 'უარყოფილია', 'success')
      await load()
    } catch {
      toast('ქსელის შეცდომა — შეამოწმეთ კავშირი', 'error')
    } finally {
      setBusy(null)
    }
  }

  const [signingOut, setSigningOut] = useState(false)
  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    // Shared helper: fetch-POST signout, then hard `replace` to the landing —
    // same behavior/destination as every other logout surface.
    await doSignOut('/')
    setSigningOut(false)
  }

  const loading = bookings === null

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <TutorAppBar user={me ? { name: me.fullName, avatar: me.avatarUrl ?? undefined } : undefined} />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-8 lg:py-10">
        <div className="mb-8 flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-[12px] text-ink-500 mb-1 min-h-[18px]" suppressHydrationWarning>{clientNow ? fmtDate(clientNow) : ''}</div>
            <h1 className="font-display text-[28px] font-bold tracking-tight text-ink-900 motion-safe:animate-rise-in" suppressHydrationWarning>
              {clientNow ? fmtGreeting() : 'გამარჯობა'}{me?.fullName ? `, ${me.fullName.split(' ')[0]}` : ''}
            </h1>
            <p className="text-[13.5px] text-ink-500 mt-1 motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>
              {todaySessions.length > 0
                ? `დღეს გაქვს ${todaySessions.length} სესია${pending.length > 0 ? `, ${pending.length} მოთხოვნა ელოდება პასუხს` : ''}.`
                : pending.length > 0
                ? `დღეს სესია არ გაქვს — ${pending.length} მოთხოვნა ელოდება პასუხს.`
                : 'დღეს სესია და ახალი მოთხოვნა არ გაქვს.'}
            </p>
          </div>
          <button type="button" onClick={signOut} disabled={signingOut} className="text-[12.5px] text-ink-500 hover:text-ink-900 underline decoration-ink-300 underline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {signingOut ? 'გამოდის…' : 'გათიშვა'}
          </button>
        </div>

        {/* Activation nag — booking now REQUIRES a published slot, so an expert
            with zero upcoming slots is invisible to clients. This is the single
            most important thing they must do to receive bookings. */}
        {upcomingSlots === 0 && (
          <div className="mb-8 rounded-card border border-warning-300 bg-warning-50 p-4 sm:p-5 flex items-start sm:items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-9 h-9 rounded-btn bg-warning-100 text-warning-700 inline-flex items-center justify-center shrink-0">
                <Icon.calendar className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[14px] font-bold text-ink-900">ჯერ ხელმისაწვდომი დრო არ გამოგიქვეყნებია</div>
                <p className="text-[12.5px] text-ink-600 mt-0.5 leading-snug">კლიენტი მხოლოდ გამოცხადებულ დროზე დაგიჯავშნის. სანამ სლოტს არ დაამატებ, ძებნის სიაში ბოლოში ხარ და ჯავშანს ვერ მიიღებ.</p>
              </div>
            </div>
            <Btn href="/tutor/schedule" variant="primary" size="sm">დროების გამოქვეყნება</Btn>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Left */}
          <div className="min-w-0 space-y-6">

            {/* Pending requests — needs a decision, so it leads the column */}
            <section className="rounded-card border border-ink-200 bg-white overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-ink-100 flex items-center justify-between">
                <div>
                  <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">ჯავშნა-მოთხოვნები</div>
                  <div className="font-display text-[15px] font-bold text-ink-900 mt-0.5">{loading ? '—' : `${pending.length} მოთხოვნა`}</div>
                </div>
                <button type="button" onClick={load} className="text-[12px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><Icon.arrow className="w-3.5 h-3.5" /> განახლება</button>
              </div>
              {loading ? (
                <div className="divide-y divide-ink-100">
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : pending.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-ink-500">ახალი მოთხოვნები ჯერ არ არის.</div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {pending.slice(0, 6).map(b => (
                    <li key={b.id} className="p-4 sm:p-5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Avatar src={b.student?.avatarUrl ?? undefined} name={b.student?.fullName} size={40} />
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-[14px] font-bold text-ink-900 truncate">{b.student?.fullName ?? 'უცნობი'}</div>
                          <div className="text-[12.5px] text-ink-600 truncate">{b.topic}</div>
                          <div className="text-[11.5px] text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
                            <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3 h-3" />{fmtDateShort(b.startAt)}</span>
                            <span className="inline-flex items-center gap-1"><Icon.clock className="w-3 h-3" />{fmtTime(b.startAt)} · {b.durationMin} წთ</span>
                            <span className="font-display font-bold text-ink-800">₾{b.price}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Btn variant="secondary" size="sm" onClick={() => decide(b.id, 'decline')} disabled={busy === b.id + 'decline'}>
                            {busy === b.id + 'decline' ? '…' : 'უარი'}
                          </Btn>
                          <Btn variant="primary" size="sm" onClick={() => decide(b.id, 'accept')} disabled={busy === b.id + 'accept'}>
                            {busy === b.id + 'accept' ? '…' : 'დადასტურება'}
                          </Btn>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {pending.length > 6 && (
                <div className="px-5 py-3 border-t border-ink-100 text-center">
                  <Link href="/tutor/bookings?tab=PREPARING" className="text-[12.5px] text-brand-700 hover:text-brand-800 font-semibold">დანარჩენი {pending.length - 6} მოთხოვნის ნახვა →</Link>
                </div>
              )}
            </section>

            {/* Next session */}
            <section className="rounded-card border border-ink-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">უახლოესი სესია</div>
                <Link href="/tutor/bookings" className="text-[12px] text-brand-700 hover:text-brand-800 font-semibold">ყველა →</Link>
              </div>
              {!nextSession ? (
                <div className="text-center py-8">
                  <div className="mx-auto w-10 h-10 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center mb-3">
                    <Icon.calendar className="w-5 h-5" />
                  </div>
                  <div className="text-[13.5px] text-ink-600">დადასტურებული სესია არ გაქვს.</div>
                  <div className="mt-4"><Btn href="/tutor/schedule" variant="secondary" size="sm">გრაფიკის რედაქტ.</Btn></div>
                </div>
              ) : (
                <div className="flex items-start gap-4 flex-wrap">
                  <Avatar src={nextSession.student?.avatarUrl ?? undefined} name={nextSession.student?.fullName} size={56} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display text-[15px] font-bold text-ink-900 truncate">{nextSession.student?.fullName ?? 'უცნობი'}</span>
                      {isBookingLive(nextSession) ? (
                        <StatusPill tone="live" label="მიმდინარეობს ახლა" />
                      ) : (
                        <StatusPill tone={toneOf(nextSession.status)} />
                      )}
                    </div>
                    <div className="text-[13px] text-ink-700 truncate mt-0.5">{nextSession.topic}</div>
                    <div className="text-[12.5px] text-ink-500 mt-1.5 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Icon.calendar className="w-3.5 h-3.5" />{fmtDateShort(nextSession.startAt)}</span>
                      <span className="inline-flex items-center gap-1"><Icon.clock className="w-3.5 h-3.5" />{fmtTime(nextSession.startAt)} · {nextSession.durationMin} წთ</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {isBookingLive(nextSession) ? (
                      <>
                        <Btn href={`/session/${nextSession.id}`} variant="primary" size="sm">ვიდეო-ოთახში შესვლა</Btn>
                        <Btn href={`/tutor/bookings/${nextSession.id}`} variant="secondary" size="sm">დეტალები</Btn>
                      </>
                    ) : (
                      <>
                        <Btn href={`/tutor/bookings/${nextSession.id}`} variant="primary" size="sm">დეტალები</Btn>
                        <Btn href={`/session/${nextSession.id}`} variant="secondary" size="sm">ვიდეო-ოთახი</Btn>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* KPI stats — secondary info, kept below the actionable sections */}
            <section aria-label="სტატისტიკა">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-3">სტატისტიკა</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 motion-safe:stagger">
                {loading ? (
                  <>
                    <SkeletonKpi />
                    <SkeletonKpi />
                    <SkeletonKpi />
                    <SkeletonKpi />
                  </>
                ) : (
                  <>
                    <KpiCard label="დღეს" valueNum={todaySessions.length} sub="სესია" />
                    <KpiCard label="ეს კვირა" valueNum={upcomingWeek.length} sub="მოსალოდნელი" />
                    <KpiCard label="ჯამში დამუშავდა" valueNum={earnings?.completedCount ?? 0} sub="სესია" />
                    <KpiCard
                      label="სულ ნაშოვნი"
                      valueNum={earnings?.totalEarned ?? 0}
                      valuePrefix="₾"
                      sub={FEATURE_PAYMENTS_V2 ? (earnings?.pendingPayout ? `₾${earnings.pendingPayout} მოლოდინში` : 'ყველა გადახდილი') : 'გადახდები მალე'}
                    />
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Right rail */}
          <aside className="space-y-4 lg:sticky lg:top-[80px]">
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
                {FEATURE_PAYMENTS_V2 && (
                  <Link href="/tutor/earnings" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                    <Icon.wallet className="w-4 h-4 text-ink-500" /> შემოსავლები
                  </Link>
                )}
                <Link href="/tutor/messages" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                  <Icon.chat className="w-4 h-4 text-ink-500" /> მესიჯები
                </Link>
              </div>
            </div>

            {FEATURE_PAYMENTS_V2 ? (
              <div className="rounded-card border border-ink-200 bg-brand-50/40 p-5">
                <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-2">გადახდები</div>
                <p className="text-[12.5px] text-ink-700 leading-[1.55]">
                  გადახდის ინტეგრაცია მალე დაემატება — ამჟამად ჯავშნები ტარდება უფასოდ.
                </p>
              </div>
            ) : (
              /* TODO: replace with real payout card once payments V2 ships */
              <div className="rounded-card border border-ink-200 bg-brand-50/40 p-5">
                <div className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-2">გადახდები</div>
                <p className="text-[12.5px] text-ink-700 leading-[1.55]">
                  ამჟამად ჯავშნები ტარდება უფასოდ. გადახდები მალე დაემატება.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  )
}

function KpiCard({ label, valueNum, valuePrefix, sub }: { label: string; valueNum: number; valuePrefix?: string; sub?: string }) {
  return (
    <div className="rounded-card border border-ink-200 bg-white p-4 hover-lift">
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">{label}</div>
      <div className="font-display text-[24px] font-bold text-ink-900 tabular-nums mt-1 leading-none">
        <CountUp value={valueNum} prefix={valuePrefix ?? ''} />
      </div>
      {sub && <div className="text-[11.5px] text-ink-500 mt-1.5">{sub}</div>}
    </div>
  )
}
