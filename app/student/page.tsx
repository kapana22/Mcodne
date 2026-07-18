'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { PAYMENTS_LIVE, CANCEL_CUTOFF_HOURS } from '@/lib/flags'
import { bucketBookings, deriveSummary } from '@/lib/bookings'
import { isBookingLive } from '@/lib/bookingLive'
import { fmtKaDate, fmtKaTime, fmtKaDateTime, KA_WEEKDAYS_SHORT } from '@/lib/kaDate'
import { StatusPill } from '@/components/StatusPill'
import { StudentAppBar } from '@/components/StudentAppBar'
import { VerifiedMark } from '@/components/Avatar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'


type MeData = { id: string; fullName: string; email: string; avatarUrl?: string | null }

/* ───── Search bar — dashboard primary CTA ───── */
const DashboardSearch = () => {
  const [q, setQ] = useState('')
  const go = () => {
    const trimmed = q.trim()
    window.location.href = trimmed ? `/tutors?q=${encodeURIComponent(trimmed)}` : '/tutors'
  }
  return (
    <form
      onSubmit={e => { e.preventDefault(); go() }}
      className="mt-5 max-w-[520px] flex items-center gap-2 rounded-card bg-white border border-ink-300 focus-within:border-ink-400 focus-within:ring-4 focus-within:ring-brand-100 transition-all p-1.5"
    >
      <div className="relative flex-1 min-w-0">
        <Icon.search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ეძებე ექსპერტი, სფერო, თემა..."
          aria-label="ექსპერტის ძებნა"
          className="w-full h-11 pl-10 pr-3 bg-transparent text-[14px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        ძებნა
      </button>
    </form>
  )
}

/* ───── Onboarding tour — first-run getting-started card ───── */
const OnboardingTour = ({ userId, hasBookings, joinedAt }: { userId?: string; hasBookings: boolean; joinedAt?: string }) => {
  const [dismissed, setDismissed] = useState(true) // start dismissed to avoid SSR flash
  useEffect(() => {
    if (!userId) return
    if (typeof window === 'undefined') return
    try {
      const key = `mcodne:onboarding-dismissed:${userId}`
      const isDismissed = localStorage.getItem(key) === '1'
      setDismissed(isDismissed)
    } catch {}
  }, [userId])
  if (dismissed || hasBookings) return null
  // Only show for accounts younger than 7 days.
  if (joinedAt) {
    const ageMs = Date.now() - new Date(joinedAt).getTime()
    if (ageMs > 7 * 24 * 60 * 60 * 1000) return null
  }
  const close = () => {
    if (userId && typeof window !== 'undefined') {
      try { localStorage.setItem(`mcodne:onboarding-dismissed:${userId}`, '1') } catch {}
    }
    setDismissed(true)
  }
  const steps = [
    { n: 1, l: 'იპოვე ექსპერტი', d: 'აირჩიე კონკრეტული საკითხი — საგადასახადო, სამართალი, ან რაც გჭირდება.', href: '/tutors' },
    { n: 2, l: 'აირჩიე დრო და დაჯავშნე', d: 'ექსპერტის კალენდრიდან აირჩიე თავისუფალი დრო — ის ადასტურებს მოთხოვნას.', href: '/tutors' },
    { n: 3, l: 'შედი ვიდეო-ოთახში', d: 'დანიშნულ დროზე ერთი კლიკით ხდები კავშირზე. აპლიკაცია არ სჭირდება.', href: null as string | null },
  ]
  return (
    <section className="max-w-[1280px] mx-auto px-6 sm:px-8 mt-6 motion-safe:animate-scale-in">
      <div className="rounded-card bg-gradient-to-br from-brand-50/70 via-white to-white border border-brand-200 p-5 sm:p-6 relative overflow-hidden">
        <span aria-hidden className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-brand-100/40 blur-3xl pointer-events-none" />
        <button
          type="button"
          onClick={close}
          aria-label="დახურვა"
          className="absolute top-3 right-3 w-8 h-8 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors z-10"
        >
          <Icon.x className="w-4 h-4" />
        </button>
        <div className="relative">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-2 motion-safe:animate-rise-in">დასაწყისი</div>
          <h2 className="font-display text-[20px] sm:text-[22px] font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>3 ბიჯი — და მზადა ხარ</h2>
          <div className="mt-5 grid sm:grid-cols-3 gap-3 motion-safe:stagger">
            {steps.map(s => {
              const inner = (
                <div className="p-4 rounded-card border border-ink-200 bg-white/80 backdrop-blur-sm h-full flex flex-col hover:border-brand-300 hover-lift transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-500 text-white font-display font-bold text-[13px] shadow-xs">{s.n}</span>
                    <span className="font-display text-[14px] font-bold text-ink-900">{s.l}</span>
                  </div>
                  <p className="text-[12.5px] text-ink-600 leading-[1.5]">{s.d}</p>
                </div>
              )
              return s.href
                ? <Link key={s.n} href={s.href} className="block focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-card">{inner}</Link>
                : <div key={s.n}>{inner}</div>
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───── Welcome strip ───── */
const KA_MONTHS_SHORT = ['იან.','თებ.','მარ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექტ.','ოქტ.','ნოე.','დეკ.']
const KA_WEEKDAY_SHORT = ['კვ.','ორშ.','სამშ.','ოთხ.','ხუთ.','პარ.','შაბ.']

/* ───── Booking derivation — single source of truth ─────
   Every dashboard counter (Welcome header) and every list badge (SessionsPanel,
   NextSession) derives from the shared pure helpers in `@/lib/bookings`, so the
   header numbers can never drift from the visible bookings — and the STUDENT and
   TUTOR dashboards now bucket identically (Asia/Tbilisi, same "upcoming" rule),
   which they previously did not. See lib/bookings.ts +
   tests/student-dashboard.test.ts. `TBILISI_TZ`, `UPCOMING_STATUSES`,
   `bucketBookings`, `deriveSummary`, `SummaryBooking` are imported at the top. */

const Welcome = ({ me, bookings }: { me: MeData | null; bookings: any[] }) => {
  // Render date client-side only to avoid SSR/CSR mismatch (Node ICU lacks ka-GE).
  const [nowLabel, setNowLabel] = useState<string>('')
  useEffect(() => {
    const upd = () => {
      const d = new Date()
      const dow = KA_WEEKDAY_SHORT[d.getDay()]
      const mon = KA_MONTHS_SHORT[d.getMonth()]
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      setNowLabel(`${dow} ${d.getDate()} ${mon} ${d.getFullYear()} · ${time}`)
    }
    upd()
    const t = setInterval(upd, 30_000)
    return () => clearInterval(t)
  }, [])

  const firstName = me?.fullName?.split(' ')[0] ?? ''
  // Single derivation shared with NextSession + SessionsPanel — see deriveSummary.
  const s = deriveSummary(bookings)

  return (
    <section className="border-b border-ink-100 bg-white">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 pt-6 sm:pt-10 lg:pt-12 pb-6 sm:pb-8">
        <div className="min-w-0">
            <div className="inline-flex items-center gap-2 mb-3 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
              <span>{nowLabel || '—'}</span>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1">
                <Icon.globe className="w-3 h-3" />
                თბილისი
              </span>
            </div>
            <h1 className="font-display text-[26px] sm:text-[42px] lg:text-[50px] font-bold tracking-[-0.028em] leading-[1.02] text-ink-900 motion-safe:animate-rise-in">
              {firstName ? `გამარჯობა, ${firstName}.` : 'გამარჯობა.'}
            </h1>
            <p className="mt-3 text-[14.5px] text-ink-600 max-w-[560px] leading-[1.55] motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>
              {s.upcomingCount > 0
                ? <>დარეზერვებული გაქვს <span className="font-display font-semibold text-ink-900">{s.upcomingCount} სესია</span>. ყველა ჯავშანი ერთ ადგილას.</>
                : <>ჯერ არ გაქვს დაჯავშნილი სესია — მოძებნე შენი პირველი ექსპერტი.</>}
            </p>

            {/* Search bar — primary CTA on the dashboard */}
            <div className="motion-safe:animate-rise-in" style={{ animationDelay: '140ms' }}>
              <DashboardSearch />
            </div>

            {/* Secondary shortcuts — the search box above is the single primary
                "find expert" CTA, so these stay neutral and non-duplicative. */}
            <div className="mt-3 flex flex-wrap gap-2 motion-safe:stagger">
              <Link href="/student/bookings" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-btn bg-ink-50 hover:bg-ink-100 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.cal className="w-3.5 h-3.5" /> ჩემი ჯავშნები
              </Link>
              <Link href="/tutors" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-btn bg-ink-50 hover:bg-ink-100 text-ink-800 font-display font-semibold text-[12.5px] transition-colors">
                <Icon.globe className="w-3.5 h-3.5" /> ყველა ექსპერტი
              </Link>
            </div>
        </div>
      </div>
    </section>
  )
}

/* ───── Next session hero ───── */
const NextSession = ({ bookings, loading, onOpenDetail }: { bookings: any[]; loading: boolean; onOpenDetail: (id?: string) => void; onOpenExpert: () => void }) => {
  const [countdown, setCountdown] = useState<{ d: number; h: number; m: number } | null>(null)
  // Liveness is DERIVED from the clock (lib/bookingLive) — the DB never
  // contains status 'LIVE', so a raw status check is dead code. `joinable`
  // additionally opens 5 minutes before start, matching /session/[id]'s gate.
  const [live, setLive] = useState(false)
  const [joinable, setJoinable] = useState(false)
  // Same predicate/ordering as the header and the sessions list — one source —
  // EXCEPT a currently-running session: bucketBookings' upcoming rule drops
  // bookings once startAt passes, which would hide an in-progress session's
  // join button, so a live booking wins the hero slot.
  const next = useMemo(() => {
    const liveNow = bookings.find(b => isBookingLive(b))
    return liveNow ?? bucketBookings(bookings).upcoming[0] ?? null
  }, [bookings])

  useEffect(() => {
    if (!next) return
    const tick = () => {
      const diff = new Date(next.startAt).getTime() - Date.now()
      const isLive = isBookingLive(next)
      setLive(isLive)
      setJoinable(isLive || (next.status === 'CONFIRMED' && diff > 0 && diff <= 5 * 60_000))
      if (diff <= 0) { setCountdown({ d: 0, h: 0, m: 0 }); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setCountdown({ d, h, m })
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [next])

  if (loading) {
    return (
      <div className="rounded-card border border-ink-200 bg-white p-6 sm:p-8">
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-32 bg-ink-100 rounded" />
          <div className="h-6 w-3/4 bg-ink-100 rounded" />
          <div className="h-4 w-1/2 bg-ink-100 rounded" />
        </div>
      </div>
    )
  }

  if (!next) {
    return (
      <EmptyState
        icon={<Icon.cal className="w-6 h-6" />}
        title="უახლოეს ჯავშანი არ არის"
        description="დაიწყე — აირჩიე ექსპერტი და დაჯავშნე ვიდეო-სესია."
        cta={{ label: 'ექსპერტების ძებნა', href: '/tutors' }}
      />
    )
  }

  const startDate = new Date(next.startAt)
  const tutorName = next.tutor?.user?.fullName ?? 'ექსპერტი'
  const tutorAvatar = next.tutor?.user?.avatarUrl
  const specialty = next.tutor?.specialty ?? next.tutor?.category?.name ?? ''
  // Same wording as the shared StatusPill so the hero never contradicts the
  // list below. "ცოცხალია" only when the CLOCK says the session is running
  // (derived via isBookingLive) — never from the dead raw 'LIVE' status.
  const statusLabel = live
    ? 'ცოცხალია'
    : next.status === 'CONFIRMED' || next.status === 'LIVE'
      ? 'დადასტურდა'
      : 'ელოდება დადასტურებას'

  // gradient-dark is the named token — no ad-hoc washes on top (design canon).
  return (
    <article className="relative overflow-hidden rounded-card bg-gradient-dark text-white">
      <div className="relative grid lg:grid-cols-[1fr_280px]">
        <div className="p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-6 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em]">
            <span className="inline-flex items-center gap-1.5 text-white/75">
              <Icon.clock className="w-3 h-3" />
              {fmtKaDateTime(startDate, { weekday: true })} · {next.durationMin} წთ
            </span>
            <span className="text-white/25">·</span>
            {/* escrow is only claimed once payments are actually live — until
                then the honest line is the flat price alone. */}
            <span className="inline-flex items-center gap-1.5 text-brand-300">
              {PAYMENTS_LIVE ? (
                <>
                  <Icon.shieldCheck className="w-3 h-3" />
                  დაცული გადახდა ₾{next.price}
                </>
              ) : (
                <>₾{next.price}</>
              )}
            </span>
            <span className="text-white/25">·</span>
            <span className="inline-flex items-center gap-1.5 text-white/75">{statusLabel}</span>
          </div>

          <div className="mb-5 max-w-[560px]">
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/45 mb-2">თემა</div>
            <h2 className="font-display text-[24px] sm:text-[28px] font-bold tracking-[-0.022em] leading-[1.1] text-white">
              {next.topic}
            </h2>
          </div>

          <div className="inline-flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-white/15 bg-white/10 shrink-0">
              {tutorAvatar ? (
                <img src={tutorAvatar} alt={tutorName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full inline-flex items-center justify-center text-white font-display font-bold text-[14px]">{tutorName.charAt(0)}</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-display font-semibold text-[13.5px] text-white">{tutorName}</div>
              {specialty && <div className="text-[11.5px] text-white/55 mt-0.5">{specialty}</div>}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            {joinable && (
              <Link href={`/session/${next.id}`} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-400 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center gap-2 transition-colors">
                <Icon.video className="w-4 h-4" />
                ვიდეო-ოთახში
                <Icon.arrow className="w-3.5 h-3.5" />
              </Link>
            )}
            <button type="button" onClick={() => onOpenDetail(next.id)} className="h-11 px-4 rounded-btn bg-white/10 hover:bg-white/15 backdrop-blur text-white font-display font-medium text-[13px] inline-flex items-center gap-1.5 transition-colors">
              სესიის დეტალები
            </button>
          </div>
        </div>

        {live ? (
          <div className="relative bg-white/[0.06] border-t lg:border-t-0 lg:border-l border-white/10 p-6 sm:p-8 flex flex-col justify-center">
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/50 mb-3">ახლა</div>
            <div className="inline-flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-400 motion-safe:animate-pulse-soft" />
              <span className="font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-white">მიმდინარეობს</span>
            </div>
          </div>
        ) : countdown && (
          <div className="relative bg-white/[0.06] border-t lg:border-t-0 lg:border-l border-white/10 p-6 sm:p-8 flex flex-col justify-center">
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/50 mb-3">დაიწყება</div>
            <div className="flex items-baseline gap-2">
              {countdown.d > 0 && (
                <>
                  <span className="font-display text-[56px] font-bold leading-none tabular-nums tracking-[-0.04em]">{String(countdown.d).padStart(2, '0')}</span>
                  <span className="font-display text-[16px] font-semibold text-white/60">დღე</span>
                </>
              )}
              <span className="font-display text-[56px] font-bold leading-none tabular-nums tracking-[-0.04em] ml-1">{String(countdown.h).padStart(2, '0')}</span>
              <span className="font-display text-[16px] font-semibold text-white/60">სთ</span>
              <span className="font-display text-[36px] font-bold leading-none tabular-nums tracking-[-0.04em] ml-1">{String(countdown.m).padStart(2, '0')}</span>
              <span className="font-display text-[16px] font-semibold text-white/60">წთ</span>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

/* ───── Saved experts — compact strip. The full list (and the side-by-side
   compare tool) lives at /student/favorites; here the shortlist only reminds
   and links out, so the dashboard stays about the user's sessions. ───── */
type SavedExpert = {
  id: string
  name: string
  avatar: string | null
  cat: string
  price: number
  rating: number
}

const SavedStrip = () => {
  const [items, setItems] = useState<SavedExpert[]>([])
  // 'error' is distinct from an empty list: a failed request must NOT render
  // as "your shortlist is empty" (which would lie), it gets its own retry card.
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    ;(async () => {
      try {
        const res = await fetch('/api/favorites')
        if (!res.ok) throw new Error('favorites failed')
        const data = await res.json()
        if (!Array.isArray(data)) throw new Error('bad shape')
        if (cancelled) return
        // Real API fields only — the old strip decorated favorites with stock
        // pravatar photos and a hardcoded "90% match" badge, which lied.
        const mapped: SavedExpert[] = data.map((f, i) => ({
          id: f.tutor?.id ?? String(i),
          name: f.tutor?.user?.fullName ?? 'ექსპერტი',
          avatar: f.tutor?.user?.avatarUrl ?? null,
          cat: f.tutor?.category?.name ?? f.tutor?.specialty ?? '',
          price: f.tutor?.price ?? 0,
          rating: f.tutor?.rating ?? 0,
        }))
        setItems(mapped)
        setLoadState('ready')
      } catch {
        if (!cancelled) setLoadState('error')
      }
    })()
    return () => { cancelled = true }
  }, [attempt])

  if (loadState === 'loading') return null
  // Failure/empty here is secondary content — render a compact single-row
  // notice, never a hero-sized card competing with the user's sessions.
  if (loadState === 'error') {
    return (
      <div role="alert" className="rounded-card border border-ink-200 bg-white px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap motion-safe:animate-fade-in">
        <Icon.warn className="w-4 h-4 text-ink-400 shrink-0" />
        <p className="flex-1 min-w-[220px] text-[12.5px] text-ink-600">
          <span className="font-display font-semibold text-ink-800">მოკლე-სია ვერ ჩაიტვირთა</span> — შენახული ექსპერტების სია ამჟამად მიუწვდომელია.
        </p>
        <button
          type="button"
          onClick={() => setAttempt(a => a + 1)}
          className="shrink-0 h-8 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1.5 transition-colors"
        >
          <Icon.refresh className="w-3.5 h-3.5" />
          სცადე თავიდან
        </button>
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="rounded-card border border-dashed border-ink-200 bg-white px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap motion-safe:animate-fade-in">
        <Icon.heart className="w-4 h-4 text-ink-400 shrink-0" />
        <p className="flex-1 min-w-[220px] text-[12.5px] text-ink-600">
          <span className="font-display font-semibold text-ink-800">მოკლე-სია ცარიელია</span> — შეინახე ექსპერტები კატალოგიდან შესადარებლად.
        </p>
        <Link
          href="/tutors"
          className="shrink-0 h-8 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1.5 transition-colors"
        >
          ექსპერტების დათვალიერება
          <Icon.arrow className="w-3 h-3" />
        </Link>
      </div>
    )
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-ink-100 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700">შენახული</span>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill bg-ink-900 text-white text-[10.5px] font-display font-bold tabular-nums">{items.length}</span>
          </div>
          <h2 className="font-display text-[18px] sm:text-[20px] font-bold text-ink-900 tracking-tight leading-tight">შენახული ექსპერტები</h2>
        </div>
        <Link href="/student/favorites" className="font-display text-[12px] font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
          ყველა · გვერდიგვერდ შედარება
          <Icon.arrow className="w-3 h-3" />
        </Link>
      </div>
      <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.slice(0, 4).map(w => (
          <Link key={w.id} href={`/tutors/${w.id}`} className="group rounded-card border border-ink-200 hover:border-ink-300 hover:shadow-card transition-all p-4 min-w-0 bg-white">
            <div className="flex items-center gap-3">
              {w.avatar ? (
                <img src={w.avatar} alt={w.name} className="w-11 h-11 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
              ) : (
                <span className="w-11 h-11 rounded-full bg-brand-100 text-brand-700 font-display font-bold inline-flex items-center justify-center ring-1 ring-ink-200 shrink-0">
                  {w.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0">
                <div className="font-display text-[13px] font-bold text-ink-900 truncate group-hover:text-brand-800 transition-colors">{w.name}</div>
                <div className="text-[11px] text-ink-500 truncate">{w.cat}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-[12px]">
              <span className="inline-flex items-center gap-1 text-ink-600">
                {w.rating > 0 && (
                  <>
                    <Icon.star aria-hidden className="w-3 h-3 text-warning-500" />
                    <span role="img" aria-label={`${w.rating.toFixed(1)} 5-დან`} className="font-display font-semibold tabular-nums">{w.rating.toFixed(1)}</span>
                  </>
                )}
              </span>
              <span className="font-display font-bold text-ink-900 tabular-nums">₾{w.price}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ───── Discover experts — real API, shown even when wishlist empty ───── */
type DiscoverTutor = {
  id: string
  name: string
  avatar: string | null
  headline: string
  specialty: string
  category: string
  rating: number
  reviews: number
  price: number
  verified: boolean
}

const Discover = ({ onOpen }: { onOpen: (t: DiscoverTutor) => void }) => {
  const [tutors, setTutors] = useState<DiscoverTutor[] | null>(null)
  // Distinct from an empty result — a failed request previously rendered as
  // "ამ კატეგორიაში ჯერ არ არის ექსპერტი", which is a lie on a network error.
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [cat, setCat] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    setTutors(null)
    setFailed(false)
    const params = new URLSearchParams({ limit: '18' })
    if (cat !== 'all') params.set('category', cat)
    ;(async () => {
      try {
        const res = await fetch(`/api/tutors?${params}`)
        if (!res.ok) throw new Error('tutors failed')
        const d = await res.json()
        if (!Array.isArray(d)) throw new Error('bad shape')
        if (cancelled) return
        setTutors(d.map((t: any) => ({
          id: t.id,
          name: t.user?.fullName ?? 'ექსპერტი',
          avatar: t.user?.avatarUrl ?? null,
          headline: t.headline ?? '',
          specialty: t.specialty ?? '',
          category: t.category?.name ?? '',
          rating: t.rating ?? 0,
          reviews: t.reviewsCount ?? 0,
          price: t.price ?? 0,
          verified: t.verified ?? false,
        })))
      } catch {
        if (!cancelled) { setTutors([]); setFailed(true) }
      }
    })()
    return () => { cancelled = true }
  }, [cat, attempt])

  const CATS = [
    { slug: 'all', label: 'ყველა' },
    { slug: 'business', label: 'ბიზნესი' },
    { slug: 'finance', label: 'ფინანსები' },
    { slug: 'career', label: 'კარიერა' },
    { slug: 'marketing', label: 'მარკეტინგი' },
    { slug: 'law', label: 'სამართალი' },
    { slug: 'psychology', label: 'ფსიქოლოგია' },
  ]

  return (
    <section className="rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-ink-100 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-1.5">გამოცადე</div>
          <h2 className="font-display text-[16px] sm:text-[17px] font-bold text-ink-900 tracking-tight leading-tight">
            რეკომენდებული ექსპერტები
          </h2>
          <p className="text-[12.5px] text-ink-500 mt-1.5 max-w-[480px] leading-relaxed">
            გადამოწმებული ექსპერტები, რომლებიც უახლოეს დროში ხელმისაწვდომია.
          </p>
        </div>
        <Link href="/tutors" className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors">
          ყველა ექსპერტი <Icon.arrow className="w-3 h-3" />
        </Link>
      </div>

      {/* Category chips */}
      <div className="px-5 sm:px-6 py-3 border-b border-ink-100 flex items-center gap-1.5 overflow-x-auto scrollbar-hide rail-fade-end">
        {CATS.map(c => {
          const on = cat === c.slug
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCat(c.slug)}
              className={`shrink-0 h-8 px-3 rounded-pill font-display text-[12px] font-semibold transition-colors ${
                on ? 'bg-brand-500 text-white' : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {tutors === null ? (
        // Skeleton cards — same grid/cell shape as the loaded state below.
        <div aria-busy="true" className="p-5 sm:p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-card border border-ink-200 bg-white p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-ink-100 shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-3.5 w-2/3 bg-ink-100 rounded" />
                  <div className="h-3 w-1/2 bg-ink-100 rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-ink-100 rounded mb-2" />
              <div className="h-3 w-4/5 bg-ink-100 rounded" />
            </div>
          ))}
        </div>
      ) : failed ? (
        // Compact single-row failure notice — retryable, never hero-sized.
        <div role="alert" className="px-5 sm:px-6 py-3.5 flex items-center gap-3 flex-wrap">
          <Icon.warn className="w-4 h-4 text-ink-400 shrink-0" />
          <p className="flex-1 min-w-[220px] text-[12.5px] text-ink-600">
            <span className="font-display font-semibold text-ink-800">ვერ ჩაიტვირთა</span> — ექსპერტების სია ამჟამად მიუწვდომელია.
          </p>
          <button
            type="button"
            onClick={() => setAttempt(a => a + 1)}
            className="shrink-0 h-8 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon.refresh className="w-3.5 h-3.5" />
            სცადე თავიდან
          </button>
        </div>
      ) : tutors.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={<Icon.search className="w-6 h-6" />}
          title="ამ კატეგორიაში ჯერ არ არის ექსპერტი"
          description="სცადე სხვა კატეგორია ან იხილე ყველა ექსპერტი."
        />
      ) : (
        <div className="p-5 sm:p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Cap the dashboard preview at 6 — full catalog lives behind
              the „ყველა ექსპერტი" link above. */}
          {tutors.slice(0, 6).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t)}
              className="text-left rounded-card border border-ink-200 hover:border-ink-300 hover:shadow-card transition-all bg-white p-4 min-w-0"
            >
              <div className="flex items-center gap-3 mb-3">
                {t.avatar ? (
                  <img src={t.avatar} alt={t.name} className="w-12 h-12 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
                ) : (
                  <span className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 font-display font-bold inline-flex items-center justify-center ring-1 ring-ink-200 shrink-0">
                    {t.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <div className="font-display text-[13.5px] font-bold text-ink-900 truncate">{t.name}</div>
                    {t.verified && <VerifiedMark size={12} />}
                  </div>
                  <div className="text-[11.5px] text-brand-700 font-display font-semibold truncate">{t.specialty}</div>
                </div>
              </div>
              <p className="text-[12px] text-ink-600 leading-snug line-clamp-2 min-h-[32px]">{t.headline}</p>
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-baseline justify-between">
                <div className="inline-flex items-baseline gap-1.5">
                  {t.rating > 0 && (
                    <>
                      <Icon.star aria-hidden className="w-3 h-3 text-warning-500 self-center" />
                      <span role="img" aria-label={`${t.rating.toFixed(2)} 5-დან`} className="font-display text-[12px] font-bold text-ink-900 tabular-nums">{t.rating.toFixed(2)}</span>
                      <span className="font-mono text-[10.5px] text-ink-400 tabular-nums">({t.reviews})</span>
                    </>
                  )}
                </div>
                <span className="font-display text-[13px] font-bold text-ink-900 tabular-nums">₾{t.price}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* ───── Session data ───── */
type SessionStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled'

type Session = {
  id: string
  /** Underlying TutorProfile.id — required for the rebook link. Optional
      because a booking whose tutor was deleted carries no tutor id; the
      rebook CTA falls back to /tutors when missing. */
  tutorId?: string
  expert: { name: string; avatarUrl: string | null; cat: string; headline: string }
  topic: string
  /** Raw ISO start instant — the display strings below are pre-formatted, so
      the cancel-policy math (time-to-start vs CANCEL_CUTOFF_HOURS) needs this. */
  startAt: string
  date: string
  day: string
  time: string
  duration: number
  price: number
  status: SessionStatus
  reviewed?: boolean
}

/* ───── Session row ───── */
const StatusBadge = ({ s }: { s: SessionStatus }) => {
  // Delegate to the shared <StatusPill> so a given booking state carries the
  // exact same label AND tone here, on /student/bookings, and on the tutor
  // side — the previous local copy had drifted ("ელოდება დადასტურებას" vs
  // the canonical "მზადდება").
  const tone = { confirmed: 'confirmed', pending: 'preparing', completed: 'completed', cancelled: 'canceled' } as const
  return <StatusPill tone={tone[s]} />
}

const SessionRow = ({ s, onOpen, onCancel, cancelling }: { s: Session; onOpen: (s: Session) => void; onCancel?: (s: Session) => void; cancelling?: boolean }) => {
  // In-app confirm sheet instead of window.confirm — the native dialog is
  // jarring on mobile and inconsistent with the rest of the product.
  const [askCancel, setAskCancel] = useState(false)
  // Cancellation policy shown BEFORE confirming, derived from the canonical
  // CANCEL_CUTOFF_HOURS window and this row's actual time-to-start (the modal
  // only mounts on click, so Date.now() here never runs during hydration).
  const freeCancel = new Date(s.startAt).getTime() - Date.now() >= CANCEL_CUTOFF_HOURS * 3_600_000
  return (
  <>
  {/* Mobile: 2-col grid (avatar + text), actions wrap to their own full-width
      row below — buttons squeezing the text column made 390px unreadable. */}
  <article onClick={() => onOpen(s)} className="cursor-pointer grid grid-cols-[auto_1fr] sm:grid-cols-[64px_auto_1fr_auto] gap-x-4 gap-y-3 sm:gap-5 items-center py-4 px-5 hover:bg-ink-50/50 transition-colors">
    {/* Date pill (desktop) */}
    <div className="hidden sm:flex flex-col items-center justify-center w-16 h-16 rounded-card bg-white border border-ink-200">
      <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">{s.day}</span>
      <span className="font-display text-[22px] font-bold leading-none text-ink-900 tabular-nums mt-1">{s.date.split(' ')[0]}</span>
      <span className="font-display text-[9.5px] uppercase tracking-[0.14em] text-ink-500 mt-1">{s.date.split(' ')[1]?.slice(0, 3)}</span>
    </div>

    {/* Expert avatar */}
    <div className="relative shrink-0">
      {s.expert.avatarUrl ? (
        <img src={s.expert.avatarUrl} alt={s.expert.name} className="w-11 h-11 rounded-full object-cover" />
      ) : (
        <span className="w-11 h-11 rounded-full bg-brand-100 text-brand-700 font-display font-bold inline-flex items-center justify-center">{s.expert.name.slice(0, 1)}</span>
      )}
      <span className="absolute -bottom-0.5 -right-0.5"><VerifiedMark size={13} /></span>
    </div>

    {/* Topic + meta */}
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-display text-[14.5px] font-bold text-ink-900 tracking-tight truncate">{s.expert.name}</h3>
        <span className="font-display text-[11.5px] font-semibold text-brand-700">{s.expert.cat}</span>
        <StatusBadge s={s.status} />
        {s.status === 'completed' && !s.reviewed && (
          <span className="inline-flex items-center gap-1 px-2 h-5 rounded-pill bg-warning-50 border border-warning-200 text-[10.5px] font-display font-bold uppercase tracking-[0.12em] text-warning-700">
            <Icon.star aria-hidden className="w-2.5 h-2.5" />
            შეფასების მოლოდინში
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-700 leading-snug line-clamp-1">{s.topic}</p>
      <div className="mt-1.5 inline-flex items-center gap-3 text-[11.5px] text-ink-500">
        <span className="inline-flex items-center gap-1 sm:hidden">
          <Icon.cal className="w-3 h-3" />
          {s.date}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon.clock className="w-3 h-3" />
          {s.time} · {s.duration} წთ
        </span>
        {/* escrow is only asserted once payments are live — free era shows the
            flat price with no held-funds claim. */}
        <span className="hidden sm:inline-flex items-center gap-1 text-ink-600">
          {PAYMENTS_LIVE ? (
            <>
              <Icon.shieldCheck className="w-3 h-3 text-success-600" />
              ₾{s.price} დაცული
            </>
          ) : (
            <>₾{s.price}</>
          )}
        </span>
      </div>
    </div>

    {/* Action */}
    <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1.5 shrink-0 flex-wrap" onClick={e => e.stopPropagation()}>
      {s.status === 'confirmed' && (
        <>
          <Link href={`/student/bookings/${s.id}#chat`} aria-label="ჩატი" className="hidden md:inline-flex h-9 w-9 rounded-btn border border-ink-200 hover:border-ink-300 text-ink-600 items-center justify-center transition-colors">
            <Icon.chat className="w-4 h-4" />
          </Link>
          <Link href={`/session/${s.id}`} className="h-9 px-3.5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1.5 transition-colors">
            <Icon.video className="w-3.5 h-3.5" />
            <span>ოთახი</span>
          </Link>
          {onCancel && (
            <button type="button" disabled={cancelling} onClick={() => setAskCancel(true)} className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:text-danger-700 text-ink-700 font-display font-semibold text-[12px] tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {cancelling ? 'უუქმდება…' : 'გაუქმება'}
            </button>
          )}
        </>
      )}
      {s.status === 'pending' && (
        <>
          <button type="button" onClick={() => onOpen(s)} className="h-9 px-3.5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12px] tracking-wide transition-colors">
            დეტალები
          </button>
          {onCancel && (
            <button type="button" disabled={cancelling} onClick={() => setAskCancel(true)} className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:text-danger-700 text-ink-700 font-display font-semibold text-[12px] tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {cancelling ? 'უუქმდება…' : 'გაუქმება'}
            </button>
          )}
        </>
      )}
      {s.status === 'completed' && (
        <>
          {!s.reviewed && (
            <Link href={`/student/bookings/${s.id}?review=1`} className="h-9 px-3.5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1.5 transition-colors">
              <Icon.star aria-hidden className="w-3.5 h-3.5" />
              <span>შეაფასე</span>
            </Link>
          )}
          {/* Rebook mini-CTA — jumps back to the tutor profile with
              topic/duration/price prefilled, and auto-opens the booking modal. */}
          <Link
            href={
              s.tutorId
                ? `/tutors/${s.tutorId}?topic=${encodeURIComponent(s.topic)}&duration=${s.duration}&price=${s.price}&rebook=1`
                : '/tutors'
            }
            className="h-9 px-3.5 rounded-btn bg-brand-50 border border-brand-200 hover:bg-brand-500 hover:text-white hover:border-brand-500 text-brand-800 font-display font-semibold text-[12px] tracking-wide transition-colors inline-flex items-center gap-1.5"
          >
            <Icon.refresh className="w-3.5 h-3.5" />
            <span>დაჯავშნე ისევ</span>
          </Link>
        </>
      )}
      {s.status === 'cancelled' && (
        <Link href="/tutors" className="h-9 px-3.5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-700 font-display font-medium text-[12px] tracking-wide transition-colors inline-flex items-center">
          ხელახლა
        </Link>
      )}
      <button type="button" onClick={() => onOpen(s)} aria-label="მეტი" className="h-9 w-9 rounded-btn hover:bg-ink-100 text-ink-500 inline-flex items-center justify-center transition-colors">
        <Icon.more className="w-4 h-4" />
      </button>
    </div>
  </article>
  <ConfirmModal
    open={askCancel}
    title="სესიის გაუქმება"
    body={<>
      უქმდება <span className="font-display font-semibold">{s.topic}</span> — {s.date}, {s.time}.{' '}
      {PAYMENTS_LIVE ? (
        freeCancel
          ? <>დაწყებამდე {CANCEL_CUTOFF_HOURS} საათზე მეტია დარჩენილი — თანხა სრულად დაგიბრუნდება.</>
          : <>დაწყებამდე {CANCEL_CUTOFF_HOURS} საათზე ნაკლებია დარჩენილი — თანხის სრული დაბრუნება გარანტირებული აღარ არის.</>
      ) : (
        <>გაუქმება უფასოა — დრო ისევ ექსპერტს დაუბრუნდება.</>
      )}
    </>}
    confirmLabel="გაუქმება"
    cancelLabel="დარჩეს"
    tone="danger"
    busy={cancelling}
    onConfirm={() => { setAskCancel(false); onCancel?.(s) }}
    onCancel={() => setAskCancel(false)}
  />
  </>
  )
}

/* ───── Sessions panel with tabs ───── */
type Tab = 'upcoming' | 'past' | 'cancelled'

const SessionsPanel = ({ bookings, loading, loadError, reload, onOpenSession }: { bookings: any[]; loading: boolean; loadError: string | null; reload: () => Promise<void> | void; onOpenSession: (s: Session) => void }) => {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const mapSession = (b: any): Session => {
    const dt = new Date(b.startAt)
    const statusMap: Record<string, SessionStatus> = { CONFIRMED: 'confirmed', PREPARING: 'pending', LIVE: 'confirmed', COMPLETED: 'completed', CANCELED: 'cancelled', NO_SHOW: 'cancelled' }
    return {
      id: b.id,
      tutorId: b.tutor?.id,
      // Guard every tutor dereference — a booking whose tutor was deleted has
      // `tutor: null`, which previously threw inside data.map and dumped the
      // user into the fake-fixture fallback below.
      expert: { name: b.tutor?.user?.fullName ?? 'ექსპერტი', avatarUrl: b.tutor?.user?.avatarUrl ?? null, cat: b.tutor?.specialty ?? '', headline: b.tutor?.headline ?? '' },
      topic: b.topic,
      startAt: b.startAt,
      date: fmtKaDate(dt, { month: 'long' }),
      day: KA_WEEKDAYS_SHORT[dt.getDay()],
      time: fmtKaTime(dt),
      duration: b.durationMin,
      price: b.price,
      status: statusMap[b.status] ?? 'pending',
      // A booking with a persisted review (or reviewedAt timestamp) is done —
      // stop showing the "awaiting review" badge / CTA for it.
      reviewed: b.review != null || b.reviewedAt != null,
    }
  }

  const handleCancel = async (s: Session) => {
    if (cancellingId) return
    setCancellingId(s.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/bookings/${s.id}/cancel`, { method: 'POST' })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setFlash(data?.error === 'BAD_STATE' ? 'ეს სესია უკვე დასრულებული ან გაუქმებულია.' : 'გაუქმება ვერ მოხერხდა.')
        return
      }
      // Refund wording only once payments are live — free-era bookings never
      // held money, so "სრული დაბრუნება" would assert a refund that never was.
      setFlash(PAYMENTS_LIVE && data?.fullRefund ? 'სესია გაუქმდა · სრული დაბრუნება.' : 'სესია გაუქმდა.')
      await reload()
    } catch {
      setFlash('ქსელის შეცდომა.')
    } finally {
      setCancellingId(null)
    }
  }

  // Derived from the SAME bucketBookings() the header uses, so the "მომავალი"
  // badge (upcoming = future confirmed/pending/live) always matches the header's
  // upcoming count. On an API failure the parent passes [] + loadError, so we
  // show the error banner + true empty state — never fabricated demo sessions.
  const data: Record<Tab, Session[]> = useMemo(() => {
    const { upcoming, past, cancelled } = bucketBookings(bookings)
    return {
      upcoming: upcoming.map(mapSession),
      past: past.map(mapSession),
      cancelled: cancelled.map(mapSession),
    }
  }, [bookings])
  const tabs: { id: Tab; l: string; c: number }[] = [
    { id: 'upcoming', l: 'მომავალი', c: data.upcoming.length },
    { id: 'past',     l: 'დასრულებული', c: data.past.length },
    { id: 'cancelled', l: 'გაუქმებული', c: data.cancelled.length },
  ]
  const rows = data[tab]
  return (
    <section className="rounded-card border border-ink-200 bg-white overflow-hidden">
      {/* Header with tabs */}
      <div className="px-5 sm:px-6 pt-5 border-b border-ink-100">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-1">ჩემი აქტივობა</div>
            <h2 className="font-display text-[20px] sm:text-[22px] font-bold text-ink-900 tracking-tight">ჩემი სესიები</h2>
            <p className="text-[12px] text-ink-500 mt-0.5">{PAYMENTS_LIVE ? 'ყველა შენი ჯავშანი ერთ ადგილას · დაცული გადახდით' : 'ყველა შენი ჯავშანი ერთ ადგილას · დაჯავშნა უფასოა'}</p>
          </div>
          <Link href="/student/bookings" className="font-display text-[12px] font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
            მთლიანი ისტორია
            <Icon.arrow className="w-3 h-3" />
          </Link>
        </div>

        <div className="mt-5 -mb-px flex items-center gap-1">
          {tabs.map(t => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative inline-flex items-center gap-2 pb-3 px-1 mr-4 font-display text-[13px] font-semibold tracking-wide transition-colors ${on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'}`}
              >
                {t.l}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-[10.5px] font-bold tabular-nums ${on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600'}`}>{t.c}</span>
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink-900 rounded-full" />}
              </button>
            )
          })}
        </div>
      </div>

      {(flash || loadError) && (
        <div role="alert" className={`px-5 sm:px-6 py-2.5 text-[12.5px] font-medium ${loadError ? 'bg-danger-50 text-danger-800 border-b border-danger-200' : 'bg-success-50 text-success-800 border-b border-success-200'}`}>
          {loadError ? (
            <span className="inline-flex items-center gap-3 flex-wrap">
              <span>{loadError}</span>
              {/* A failed load must never dead-end — retry re-runs the parent fetch. */}
              <button type="button" onClick={() => reload()} className="font-display font-semibold underline underline-offset-2 hover:text-danger-900 transition-colors">
                სცადე თავიდან
              </button>
            </span>
          ) : flash}
        </div>
      )}

      {/* Body */}
      <div className="divide-y divide-ink-100">
        {loading ? (
          // Skeleton rows mirroring the real SessionRow grid — the layout is
          // known, so no spinner and no jump when data lands.
          <div aria-busy="true" className="divide-y divide-ink-100">
            {[0, 1, 2].map(i => (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[64px_auto_1fr_auto] gap-4 sm:gap-5 items-center py-4 px-5 animate-pulse">
                <div className="hidden sm:block w-16 h-16 rounded-card bg-ink-100" />
                <div className="w-11 h-11 rounded-full bg-ink-100" />
                <div className="min-w-0 space-y-2">
                  <div className="h-3.5 w-2/5 bg-ink-100 rounded" />
                  <div className="h-3 w-3/5 bg-ink-100 rounded" />
                </div>
                <div className="h-9 w-24 bg-ink-100 rounded-btn" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          // Per-tab empty copy: what's (not) here, why, and — where an action
          // exists — where to go next. Never a dead end.
          <EmptyState
            variant="inline"
            icon={<Icon.cal className="w-6 h-6" />}
            title={tab === 'past' ? 'დასრულებული სესია ჯერ არ გაქვს' : tab === 'cancelled' ? 'გაუქმებული ჯავშანი არ არის' : 'მომავალი სესია არ გაქვს'}
            description={
              tab === 'past'
                ? 'როცა კონსულტაცია დასრულდება, აქ გამოჩნდება — შეფასების საშუალებით.'
                : tab === 'cancelled'
                  ? 'კარგი ამბავია — არცერთი ჯავშანი არ გაგიუქმებია.'
                  : 'აირჩიე ექსპერტი და დაჯავშნე კონსულტაცია — დადასტურებული ჯავშნები აქ გამოჩნდება.'
            }
            cta={tab === 'upcoming' ? { label: 'იპოვე ექსპერტი', href: '/tutors' } : undefined}
          />
        ) : (
          rows.map(s => <SessionRow key={s.id} s={s} onOpen={onOpenSession} onCancel={handleCancel} cancelling={cancellingId === s.id} />)
        )}
      </div>

      {rows.length > 0 && (
        <div className="px-5 sm:px-6 py-3.5 bg-ink-50/40 border-t border-ink-100 flex items-center justify-between">
          <span className="text-[12px] text-ink-500"><span className="font-display font-semibold text-ink-700 tabular-nums">{rows.length}</span> სესია</span>
          <Link href="/student/bookings" className="font-display text-[12px] font-semibold text-ink-700 hover:text-ink-900 inline-flex items-center gap-1">
            სრული სიის ნახვა
            <Icon.chevR className="w-3 h-3" />
          </Link>
        </div>
      )}
    </section>
  )
}

/* ───── Page ───── */
/* ───── Dashboard "home" section — wraps the original main content ───── */
const HomeSection = ({ me, bookings, bookingsLoading, bookingsError, reload, onOpenDetail }: { me: MeData | null; bookings: any[]; bookingsLoading: boolean; bookingsError: string | null; reload: () => Promise<void> | void; onOpenDetail: (id?: string) => void }) => (
  <>
    <Welcome me={me} bookings={bookings} />
    <OnboardingTour userId={me?.id} hasBookings={bookings.length > 0} joinedAt={(me as any)?.createdAt} />
    <main className="max-w-[1280px] mx-auto px-6 sm:px-8 py-8 lg:py-10">
      {/* Primary: the user's own sessions come FIRST, full-width — the old
          quick-book sidebar duplicated the hero search and is gone.
          Discovery (recommendations, saved strip) follows below. */}
      <div className="mb-6">
        <NextSession bookings={bookings} loading={bookingsLoading} onOpenDetail={onOpenDetail} onOpenExpert={() => {}} />
      </div>
      <div className="mb-8">
        <SessionsPanel bookings={bookings} loading={bookingsLoading} loadError={bookingsError} reload={reload} onOpenSession={s => onOpenDetail(s.id)} />
      </div>
      <div className="mb-8">
        <Discover onOpen={(t) => { window.location.href = `/tutors/${t.id}` }} />
      </div>
      <div>
        <SavedStrip />
      </div>
    </main>
  </>
)

export default function Dashboard() {
  const [me, setMe] = useState<MeData | null>(null)
  // 'checking' until /api/me resolves — we render a neutral loader, never the
  // authed shell, so unauthenticated visitors don't flash logged-in UI before
  // the redirect. The parent layout gates the initial server render, but that
  // guard does NOT re-run on client-side nav, so this re-verifies per mount.
  // 'error' is a first-class state: a hung request, 5xx, or non-JSON body must
  // land on a visible retry card — NEVER an eternal spinner, and NEVER a bogus
  // bounce of a still-authed user to /signin.
  const [authState, setAuthState] = useState<'checking' | 'authed' | 'error'>('checking')
  const [bookings, setBookings] = useState<any[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [bookingsError, setBookingsError] = useState<string | null>(null)

  // Canonical signed-out destination — same param requireUser() uses, so
  // sign-in returns the user straight back here.
  const goSignin = useCallback(() => {
    window.location.replace(`/signin?redirect=${encodeURIComponent('/student')}`)
  }, [])

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true)
    setBookingsError(null)
    try {
      const res = await fetch('/api/student/bookings')
      // Session died between page load and this call — the API now 401s
      // (JSON) instead of 307-ing to /signin HTML; route to signin ourselves.
      if (res.status === 401) { goSignin(); return }
      if (!res.ok) throw new Error('load failed')
      const d = await res.json()
      if (!Array.isArray(d)) throw new Error('bad shape')
      setBookings(d)
    } catch {
      setBookingsError('სესიების ჩატვირთვა ვერ მოხერხდა.')
    } finally {
      setBookingsLoading(false)
    }
  }, [goSignin])

  // Retryable session check. Every path settles authState: signed-out
  // redirects, success renders, and anything else (network drop, 5xx,
  // non-JSON 200) shows the retry card. The abort timer guarantees even a
  // request that never returns settles instead of wedging on „იტვირთება…".
  const checkAuth = useCallback(async () => {
    setAuthState('checking')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const res = await fetch('/api/me', { cache: 'no-store', signal: ctrl.signal })
      if (res.status === 401) { goSignin(); return }
      if (!res.ok) throw new Error(`me ${res.status}`)
      const d = await res.json()
      // /api/me returns 200 { user: null } (not 401) when the session is gone,
      // so a missing user is "signed out", not an error.
      if (!d?.user) { goSignin(); return }
      setMe(d.user)
      setAuthState('authed')
    } catch {
      setAuthState('error')
    } finally {
      clearTimeout(timer)
    }
  }, [goSignin])

  useEffect(() => {
    checkAuth()
    // Bookings load in PARALLEL with the session check — no waterfall behind
    // /api/me. If the session is actually gone this call 401s and redirects
    // exactly like checkAuth would.
    loadBookings()
  }, [checkAuth, loadBookings])

  // Neutral gate while we confirm the session — no authed chrome, no redirect
  // flash. On failure this becomes a visible dead-end-free error card with a
  // retry, never an indefinite spinner.
  if (authState !== 'authed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-ink-50/40 text-ink-900 px-6">
        <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain opacity-90 select-none" draggable={false} />
        {authState === 'checking' ? (
          <div className="inline-flex items-center gap-2 text-[12.5px] text-ink-500">
            <svg aria-hidden viewBox="0 0 24 24" className="w-5 h-5 animate-spin text-ink-400" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
            იტვირთება…
          </div>
        ) : (
          <div className="text-center max-w-[360px]">
            <div className="font-display text-[16px] font-bold text-ink-900 tracking-tight">ვერ ჩაიტვირთა</div>
            <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed">კავშირი სერვერთან ვერ შედგა. შეამოწმე ინტერნეტი და სცადე თავიდან.</p>
            <button
              type="button"
              onClick={() => { checkAuth(); if (bookingsError) loadBookings() }}
              className="mt-4 h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors"
            >
              <Icon.refresh className="w-3.5 h-3.5" />
              სცადე თავიდან
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="font-sans bg-ink-50/40 text-ink-900 antialiased min-w-0">
      <StudentAppBar user={me ? { name: me.fullName, avatar: me.avatarUrl } : undefined} />

      <HomeSection
        me={me}
        bookings={bookings}
        bookingsLoading={bookingsLoading}
        bookingsError={bookingsError}
        reload={loadBookings}
        onOpenDetail={(id) => { if (id) window.location.href = `/student/bookings/${id}` }}
      />

      <WorkspaceFooter />
    </div>
  )
}


