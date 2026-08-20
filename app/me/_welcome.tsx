'use client'
// /student — the top of the workspace: the greeting, the search box and the
// first-visit tour.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { deriveSummary } from '@/lib/bookings'
import { Container } from '@/components/Container'
import { KA_MONTHS_SHORT, KA_WEEKDAY_SHORT, MeData } from './_model'

/* ───── Search bar — dashboard primary CTA ───── */
const DashboardSearch = () => {
  const [q, setQ] = useState('')
  const go = () => {
    const trimmed = q.trim()
    window.location.href = trimmed ? `/experts?q=${encodeURIComponent(trimmed)}` : '/experts'
  }
  return (
    <form
      onSubmit={e => { e.preventDefault(); go() }}
      className="mt-5 max-w-[520px] flex items-center gap-2 rounded-card bg-white border border-ink-300 focus-within:border-ink-400 focus-within:ring-4 focus-within:ring-brand-100 transition-all duration-fast p-1.5"
    >
      <div className="relative flex-1 min-w-0">
        <Icon.search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ეძებე ექსპერტი, კატეგორია, თემა…"
          aria-label="ექსპერტის ძებნა"
          className="w-full h-11 pl-10 pr-3 bg-transparent text-body text-ink-900 placeholder:text-ink-400 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        ძებნა
      </button>
    </form>
  )
}

/* ───── Onboarding tour — first-run getting-started card ───── */
export const OnboardingTour = ({ userId, hasBookings, joinedAt }: { userId?: string; hasBookings: boolean; joinedAt?: string }) => {
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
    { n: 1, l: 'იპოვე ექსპერტი', d: 'აირჩიე საკითხი — საგადასახადო, სამართალი, ან სხვა.', href: '/experts' },
    { n: 2, l: 'აირჩიე დრო და დაჯავშნე', d: 'აირჩიე დრო კალენდარში — ექსპერტი ადასტურებს.', href: '/experts' },
    { n: 3, l: 'შედი ვიდეოოთახში', d: 'დანიშნულ დროზე ერთი დაწკაპუნებით — აპლიკაცია არ გჭირდება.', href: null as string | null },
  ]
  return (
    <Container as="section" className="mt-6 motion-safe:animate-scale-in">
      <div className="rounded-card bg-white border border-ink-200 p-5 sm:p-6 relative overflow-hidden">
        <button
          type="button"
          onClick={close}
          aria-label="დახურვა"
          className="absolute top-3 right-3 w-9 h-9 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast z-10"
        >
          <Icon.x className="w-4 h-4" />
        </button>
        <div className="relative">
          <Eyebrow className="mb-2 motion-safe:animate-rise-in">დასაწყისი</Eyebrow>
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>3 ნაბიჯი — და მზად ხარ</h2>
          <div className="mt-5 grid sm:grid-cols-3 gap-3 motion-safe:stagger">
            {steps.map(s => {
              // Solid, not translucent: an in-flow card is a surface you READ,
              // and the canon reserves glass for surfaces you look PAST
              // (.glass / .glass-bar). The old `bg-white/80 backdrop-blur-sm`
              // also paid for a compositor layer per card to tint the page
              // background by 20%.
              const inner = (
                <div className="p-4 rounded-card border border-ink-200 bg-white h-full flex flex-col hover:border-brand-300 hover-lift transition-colors duration-fast">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-600 text-white font-display font-bold text-small shadow-xs">{s.n}</span>
                    <span className="font-display text-body font-bold text-ink-900">{s.l}</span>
                  </div>
                  <p className="text-small text-ink-600">{s.d}</p>
                </div>
              )
              return s.href
                ? <Link key={s.n} href={s.href} className="block focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-card">{inner}</Link>
                : <div key={s.n}>{inner}</div>
            })}
          </div>
        </div>
      </div>
    </Container>
  )
}

/* ───── Booking derivation — single source of truth ─────
   Every dashboard counter (Welcome header) and every list badge (SessionsPanel,
   NextSession) derives from the shared pure helpers in `@/lib/bookings`, so the
   header numbers can never drift from the visible bookings — and the STUDENT and
   TUTOR dashboards now bucket identically (Asia/Tbilisi, same "upcoming" rule),
   which they previously did not. See lib/bookings.ts +
   tests/student-dashboard.test.ts. `TBILISI_TZ`, `UPCOMING_STATUSES`,
   `bucketBookings`, `deriveSummary`, `SummaryBooking` are imported at the top. */

export const Welcome = ({ me, bookings }: { me: MeData | null; bookings: any[] }) => {
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
      <Container className="pt-6 sm:pt-10 lg:pt-12 pb-6 sm:pb-8">
        <div className="min-w-0">
            <Eyebrow tone="muted" className="inline-flex items-center gap-2 mb-3">
              <span>{nowLabel || '—'}</span>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1">
                <Icon.globe className="w-3 h-3" />
                თბილისი
              </span>
            </Eyebrow>
            <h1 className="font-display text-h1 sm:text-display-lg lg:text-display-xl font-bold tracking-[-0.028em] leading-[1.02] text-ink-900 motion-safe:animate-rise-in">
              {firstName ? `გამარჯობა, ${firstName}.` : 'გამარჯობა.'}
            </h1>
            <p className="mt-3 text-body-lg text-ink-600 max-w-[560px] leading-[1.55] motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>
              {s.upcomingCount > 0
                ? <>დაჯავშნილი გაქვს <span className="font-display font-semibold text-ink-900">{s.upcomingCount} სესია</span>.</>
                : <>ჯერ არ გაქვს ჯავშანი — მოძებნე პირველი ექსპერტი.</>}
            </p>

            {/* Search bar — primary CTA on the dashboard */}
            <div className="motion-safe:animate-rise-in" style={{ animationDelay: '140ms' }}>
              <DashboardSearch />
            </div>

            {/* Secondary shortcuts — the search box above is the single primary
                "find expert" CTA, so these stay neutral and non-duplicative. */}
            <div className="mt-3 flex flex-wrap gap-2 motion-safe:stagger">
              <Link href="/me/bookings" className="inline-flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-btn bg-ink-50 hover:bg-ink-100 text-ink-800 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.cal className="w-3.5 h-3.5" /> ჩემი ჯავშნები
              </Link>
              <Link href="/experts" className="inline-flex items-center gap-1.5 h-10 sm:h-9 px-3 rounded-btn bg-ink-50 hover:bg-ink-100 text-ink-800 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.search className="w-3.5 h-3.5" /> ყველა ექსპერტი
              </Link>
            </div>
        </div>
      </Container>
    </section>
  )
}