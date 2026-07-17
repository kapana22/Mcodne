'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { NotifBell } from '@/components/NotifBell'
import { ConfirmModal } from '@/components/ConfirmModal'
import { CountUp } from '@/components/CountUp'
import { EmptyState } from '@/components/EmptyState'
import { FEATURE_PAYMENTS_V2 } from '@/lib/flags'
import { TBILISI_TZ, bucketBookings, deriveSummary } from '@/lib/bookings'
import { fmtKaDate, fmtKaTime, fmtKaDateTime, KA_WEEKDAYS_SHORT } from '@/lib/kaDate'
import { StatusPill } from '@/components/StatusPill'
import { signOut } from '@/lib/signout'

/* ───── Icons ───── */
const Icon = {
  search:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  arrow:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>,
  chevD:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6" /></svg>,
  chevR:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 6 6 6-6 6" /></svg>,
  check:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m4 12 5 5L20 6" /></svg>,
  star:      (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>,
  video:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="m15.5 10 6-3v10l-6-3" /></svg>,
  cal:       (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  clock:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  chat:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.6 8.6 0 0 1-3.5-.7L3 21l1.7-5.5A8.5 8.5 0 1 1 21 11.5Z" /></svg>,
  bell:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3V9Z" /><path d="M10 19a2 2 0 1 0 4 0" /></svg>,
  heart:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20s-7-4.4-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.6 12 20 12 20Z" /></svg>,
  heartF:    (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 20s-7-4.4-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.6 12 20 12 20Z" /></svg>,
  shield:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  spark:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>,
  doc:       (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>,
  download:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 4v12m0 0 5-5m-5 5-5-5M4 20h16" /></svg>,
  more:      (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>,
  plus:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>,
  card:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19" /></svg>,
  globe:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" /></svg>,
  user:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
  settings:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>,
  logout:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h12" /></svg>,
  x:         (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  trend:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 17 9 11l4 4 8-9M14 4h7v7" /></svg>,
  menu:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  pause:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 5v14M16 5v14" /></svg>,
  refresh:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 0 1 15.5-6L21 4M21 4v6h-6M21 12a9 9 0 0 1-15.5 6L3 20M3 20v-6h6" /></svg>,
  filter:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M6 12h12M10 18h4" /></svg>,
  warn:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v5M12 18h0" /></svg>,
  send:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>,
  attach:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m21 11-9 9a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.5 5.5L9 16a2 2 0 0 1-3-3l8-8" /></svg>,
}

const Logo = () => (
  <Link href="/" className="inline-flex items-center transition-transform duration-fast hover:scale-[1.03] active:scale-[0.98]" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className="h-8 w-auto object-contain select-none" draggable={false} />
  </Link>
)

type MeData = { id: string; fullName: string; email: string; avatarUrl?: string | null }

const VerifiedMark = ({ size = 16 }: { size?: number }) => (
  <span title="გადამოწმებული" className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

/* ───── Top bar (logged in) ───── */
const TopBar = ({ me }: { me: MeData | null; onOpenMenu?: () => void; menuOpen?: boolean }) => {
  const [mobOpen, setMobOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-ink-100">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-7 lg:gap-10 min-w-0">
          <Logo />
          <nav className="hidden lg:flex items-center gap-1">
            {[
              { id: 'home',     l: 'ჩემი სივრცე',    href: '/student',            active: true },
              { id: 'experts',  l: 'ექსპერტები',      href: '/tutors' },
              { id: 'bookings', l: 'ჩემი ჯავშნები',  href: '/student/bookings' },
              { id: 'saved',    l: 'შენახული',        href: '/student/favorites' },
              { id: 'messages', l: 'მესიჯები',        href: '/student/messages' },
            ].map(it => (
              <a key={it.id} href={it.href} className={`h-11 px-3.5 rounded-btn font-display text-[12px] font-semibold uppercase tracking-[0.06em] inline-flex items-center gap-1.5 transition-colors duration-fast ${
                it.active ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100/70 hover:text-ink-900'
              }`}>
                {it.l}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/tutors" className="hidden md:inline-flex items-center gap-2 h-9 pl-3 pr-2 rounded-pill bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 transition-colors group">
            <Icon.search className="w-3.5 h-3.5 text-ink-500 group-hover:text-brand-600 transition-colors" />
            <span className="font-display text-[12px] text-ink-500 mr-2">ექსპერტი, თემა…</span>
            <kbd className="font-mono text-[10px] text-ink-500 bg-ink-50 border border-ink-200 rounded px-1.5 py-0.5 leading-none">⌘K</kbd>
          </Link>
          <NotifBell />
          <a href="/student/profile" aria-label="ჩემი პროფილი" className="ml-1 inline-flex items-center justify-center">
            {me?.avatarUrl ? (
              <img src={me.avatarUrl} alt="პროფილი" className="w-9 h-9 rounded-full object-cover ring-2 ring-ink-200 hover:ring-brand-300 transition-all" />
            ) : (
              <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-display font-bold inline-flex items-center justify-center ring-2 ring-ink-200">
                {me?.fullName ? me.fullName.slice(0, 1) : '·'}
              </span>
            )}
          </a>
          <button type="button" onClick={() => setMobOpen(o => !o)} aria-label="მენიუ" aria-expanded={mobOpen} className="lg:hidden w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-900 hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center transition-colors">
            {mobOpen ? <Icon.x className="w-5 h-5" /> : <Icon.menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {mobOpen && (
        <>
          <button type="button" aria-label="დახურვა" onClick={() => setMobOpen(false)} className="lg:hidden fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm" />
          <aside className="lg:hidden fixed top-0 right-0 bottom-0 z-[51] w-[300px] max-w-[85vw] bg-white shadow-float flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-ink-200 shrink-0">
              <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.22em] text-ink-500">მენიუ</span>
              <button type="button" onClick={() => setMobOpen(false)} aria-label="დახურვა" className="w-10 h-10 rounded-btn text-ink-700 hover:bg-ink-100 inline-flex items-center justify-center transition-colors">
                <Icon.x className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-5 py-2 flex flex-col">
              {[
                { l: 'ჩემი სივრცე',   href: '/student',            active: true },
                { l: 'ექსპერტები',    href: '/tutors' },
                { l: 'ჩემი ჯავშნები', href: '/student/bookings' },
                { l: 'შენახული',      href: '/student/favorites' },
                { l: 'მესიჯები',      href: '/student/messages' },
                { l: 'პროფილი',       href: '/student/profile' },
              ].map(it => (
                <a key={it.l} href={it.href} onClick={() => setMobOpen(false)} className={`h-12 flex items-center justify-between text-[15px] font-display font-medium border-b border-ink-100 last:border-b-0 ${it.active ? 'text-brand-700' : 'text-ink-800'}`}>
                  <span className="inline-flex items-center gap-2">{it.l}</span>
                  <Icon.chevR className="w-4 h-4 text-ink-300" />
                </a>
              ))}
            </nav>
            <div className="px-5 py-4 border-t border-ink-200 shrink-0 bg-ink-50/40">
              <div className="flex items-center gap-3 mb-3">
                {me?.avatarUrl ? (
                  <img src={me.avatarUrl} alt={me.fullName} className="w-10 h-10 rounded-full object-cover ring-2 ring-white" />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 font-display font-bold inline-flex items-center justify-center ring-2 ring-white">
                    {me?.fullName ? me.fullName.slice(0, 1) : '·'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight truncate">{me?.fullName ?? '—'}</div>
                  <div className="text-[11.5px] text-ink-500 truncate">{me?.email ?? ''}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a href="/student/profile" onClick={() => setMobOpen(false)} className="h-10 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[12.5px] inline-flex items-center justify-center gap-1.5 transition-colors">
                  <Icon.settings className="w-3.5 h-3.5" /> ანგარიში
                </a>
                <button type="button" onClick={() => { setMobOpen(false); signOut() }} className="h-10 rounded-btn bg-white border border-ink-200 hover:bg-danger-50 hover:border-danger-200 text-ink-800 hover:text-danger-700 font-display font-semibold text-[12.5px] inline-flex items-center justify-center gap-1.5 transition-colors">
                  <Icon.logout className="w-3.5 h-3.5" /> გასვლა
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </header>
  )
}

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
  const nextToday = s.today[0]
  const nextTodayLabel = nextToday
    ? `${new Date(nextToday.startAt).toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit', timeZone: TBILISI_TZ })} · ${nextToday.tutor?.user?.fullName?.split(' ')[0] ?? ''}`
    : '—'

  return (
    <section className="border-b border-ink-100 bg-white">
      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 pt-6 sm:pt-10 lg:pt-12 pb-6 sm:pb-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
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

          <div className="grid grid-cols-3 sm:flex sm:items-stretch gap-3 sm:gap-5 text-[12px] text-ink-600 shrink-0 motion-safe:animate-fade-in" style={{ animationDelay: '260ms' }}>
            <div className="sm:min-w-[88px]">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-1">დღეს</div>
              <div className="font-display text-[18px] sm:text-[20px] font-bold text-ink-900 tabular-nums leading-tight">
                <CountUp value={s.todayCount} /> სესია
              </div>
              <div className="text-[10.5px] sm:text-[11px] text-ink-500 mt-0.5 truncate">{nextTodayLabel}</div>
            </div>
            <span className="hidden sm:block w-px bg-ink-200" />
            <div className="sm:min-w-[88px]">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-1">კვირაში</div>
              <div className="font-display text-[18px] sm:text-[20px] font-bold text-ink-900 tabular-nums leading-tight">
                <CountUp value={s.weekCount} /> ჯავშანი
              </div>
              <div className="text-[10.5px] sm:text-[11px] text-ink-500 mt-0.5 truncate">{s.weekConfirmed} დადასტ. · {s.weekPending} ელოდ.</div>
            </div>
            <span className="hidden sm:block w-px bg-ink-200" />
            <div className="sm:min-w-[88px]">
              <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-1">ჯამში</div>
              <div className="font-display text-[18px] sm:text-[20px] font-bold text-ink-900 tabular-nums leading-tight">
                <CountUp value={s.completedCount} /> · <CountUp value={s.totalHours} decimals={1} suffix="სთ" />
              </div>
              <div className="text-[10.5px] sm:text-[11px] text-ink-500 mt-0.5 truncate">{s.uniqueTutors} ექსპერტი</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───── Next session hero ───── */
const NextSession = ({ bookings, loading, onOpenDetail }: { bookings: any[]; loading: boolean; onOpenDetail: (id?: string) => void; onOpenExpert: () => void }) => {
  const [countdown, setCountdown] = useState<{ d: number; h: number; m: number } | null>(null)
  // Same predicate/ordering as the header and the sessions list — one source.
  const next = useMemo(() => bucketBookings(bookings).upcoming[0] ?? null, [bookings])

  useEffect(() => {
    if (!next) return
    const tick = () => {
      const diff = new Date(next.startAt).getTime() - Date.now()
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
  // Same wording as the shared StatusPill so the hero never contradicts the list below.
  const statusLabel = next.status === 'CONFIRMED' ? 'დადასტურდა' : next.status === 'LIVE' ? 'ცოცხალია' : 'მზადდება'

  return (
    <article className="relative overflow-hidden rounded-card bg-gradient-dark text-white">
      <div className="absolute inset-0 opacity-[0.18] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, rgba(12,172,151,.55), transparent 55%), radial-gradient(circle at 15% 100%, rgba(31,196,174,.45), transparent 60%)' }} />
      <div className="relative grid lg:grid-cols-[1fr_280px]">
        <div className="p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-6 font-display text-[10.5px] font-semibold uppercase tracking-[0.18em]">
            <span className="inline-flex items-center gap-1.5 text-white/75">
              <Icon.clock className="w-3 h-3" />
              {fmtKaDateTime(startDate, { weekday: true })} · {next.durationMin} წთ
            </span>
            <span className="text-white/25">·</span>
            <span className="inline-flex items-center gap-1.5 text-brand-300">
              <Icon.shield className="w-3 h-3" />
              escrow ₾{next.price}
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
            {next.status === 'LIVE' && (
              <button type="button" onClick={() => { window.location.href = `/session/${next.id}` }} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-400 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center gap-2 transition-colors">
                <Icon.video className="w-4 h-4" />
                ოთახში შესვლა
                <Icon.arrow className="w-3.5 h-3.5" />
              </button>
            )}
            <button type="button" onClick={() => onOpenDetail(next.id)} className="h-11 px-4 rounded-btn bg-white/10 hover:bg-white/15 backdrop-blur text-white font-display font-medium text-[13px] inline-flex items-center gap-1.5 transition-colors">
              სესიის დეტალები
            </button>
          </div>
        </div>

        {countdown && (
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

/* ───── Wishlist ───── */
type WishItem = {
  id: string
  name: string
  photo: number
  cat: string
  headline: string
  rating: number
  reviews: number
  price: number
  next: string
  match: number
  langs: string[]
}

const Wishlist = ({ onBook, onQuickView }: { onBook: (w: WishItem) => void; onQuickView: (w: WishItem) => void }) => {
  const [items, setItems] = useState<WishItem[]>([])
  const [compare, setCompare] = useState(false)
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
        const mapped: WishItem[] = data.map((f, i) => ({
          id: f.tutor?.id ?? String(i),
          name: f.tutor?.user?.fullName ?? 'ექსპერტი',
          photo: 11 + i,
          cat: f.tutor?.category?.name ?? f.tutor?.specialty ?? '',
          headline: f.tutor?.headline ?? '',
          rating: f.tutor?.rating ?? 0,
          reviews: f.tutor?.reviewsCount ?? 0,
          price: f.tutor?.price ?? 0,
          next: 'შეთანხმებით',
          match: 90,
          langs: (f.tutor?.languages ?? ['ქარ']).slice(0, 2),
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

  const cheapest = items.reduce((a, b) => (a.price < b.price ? a : b), items[0])
  const soonest  = items[0]
  const topRated = items.reduce((a, b) => (a.rating > b.rating ? a : b), items[0])

  return (
    <section className="rounded-card border border-ink-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 sm:px-6 py-5 border-b border-ink-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 mb-1.5">
              <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700">მოკლე-სია</span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill bg-ink-900 text-white text-[10.5px] font-display font-bold tabular-nums">{items.length}</span>
            </div>
            <h2 className="font-display text-[18px] sm:text-[20px] font-bold text-ink-900 tracking-tight leading-tight">
              ვისაც <span className="text-brand-700">აკვირდები</span> — გადაწყვიტე და დაჯავშნე.
            </h2>
            <p className="text-[12.5px] text-ink-500 mt-1.5 max-w-[480px] leading-relaxed">
              ექსპერტთა კატალოგიდან რომ შენახე — შეადარე გვერდიგვერდ და დაჯავშნე სესია ხელით შერჩეულ ექსპერტთან.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCompare(c => !c)}
              className={`h-9 px-3.5 rounded-btn inline-flex items-center gap-1.5 font-display text-[12px] font-semibold tracking-wide transition-colors ${compare ? 'bg-ink-900 text-white' : 'bg-white border border-ink-200 hover:border-ink-300 text-ink-800'}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5" /></svg>
              გვერდიგვერდ შედარება
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!items.length) return
                if (!window.confirm('გავასუფთავო მოკლე-სია?')) return
                const prev = items
                setItems([])
                try {
                  await Promise.all(prev.map(w => fetch(`/api/favorites?tutorId=${w.id}`, { method: 'DELETE' })))
                } catch {
                  setItems(prev)
                }
              }}
              className="hidden sm:inline-flex h-9 px-3 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-50 font-display text-[12px] font-medium transition-colors"
            >
              გასუფთავება
            </button>
          </div>
        </div>

        {/* Smart insights */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="rounded-card border border-ink-100 bg-ink-50/50 px-3.5 py-2.5">
            <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-0.5">უსწრაფესი</div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[13.5px] font-bold text-ink-900 truncate">{soonest.name}</span>
              <span className="text-[11.5px] text-ink-500 tabular-nums whitespace-nowrap">· {soonest.next}</span>
            </div>
          </div>
          <div className="rounded-card border border-ink-100 bg-ink-50/50 px-3.5 py-2.5">
            <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-0.5">ხელსაყრელი ფასი</div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[13.5px] font-bold text-ink-900 truncate">{cheapest.name}</span>
              <span className="text-[11.5px] text-ink-500 tabular-nums whitespace-nowrap">· ₾{cheapest.price}</span>
            </div>
          </div>
          <div className="rounded-card border border-ink-100 bg-ink-50/50 px-3.5 py-2.5">
            <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-0.5">საუკეთესო რეიტინგი</div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[13.5px] font-bold text-ink-900 truncate">{topRated.name}</span>
              <span className="text-[11.5px] text-ink-500 tabular-nums whitespace-nowrap">· {topRated.rating.toFixed(2)} ★</span>
            </div>
          </div>
        </div>
      </div>

      {/* List — editorial numbered */}
      <ol className="divide-y divide-ink-100">
        {items.map((w, i) => (
          <li key={w.id} className="group grid grid-cols-[28px_auto_1fr_auto] sm:grid-cols-[36px_auto_1fr_auto_auto] items-center gap-3 sm:gap-4 px-5 sm:px-6 py-4 hover:bg-ink-50/40 transition-colors">
            <span className="font-display text-[12px] font-bold text-ink-300 tabular-nums tracking-wide">{String(i + 1).padStart(2, '0')}</span>

            <button type="button" onClick={() => onQuickView(w)} className="relative shrink-0 rounded-full hover:ring-2 hover:ring-brand-300 transition-all">
              <img src={`https://i.pravatar.cc/96?img=${w.photo}`} alt={w.name} className="w-10 h-10 rounded-full object-cover" />
              <span className="absolute -bottom-0.5 -right-0.5"><VerifiedMark size={13} /></span>
            </button>

            <button type="button" onClick={() => onQuickView(w)} className="min-w-0 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display text-[14.5px] font-bold text-ink-900 tracking-tight truncate group-hover:text-brand-800 transition-colors">{w.name}</h3>
                <span className="font-display text-[11.5px] font-semibold text-brand-700">{w.cat}</span>
                <span className="hidden md:inline-flex items-center gap-1 px-1.5 h-5 rounded-pill bg-info-50 border border-info-200 text-[10px] font-display font-bold uppercase tracking-[0.1em] text-info-700 tabular-nums">
                  {w.match}% match
                </span>
              </div>
              <div className="mt-1 inline-flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11.5px] text-ink-500">
                <span>{w.headline}</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-ink-600">
                  <Icon.star className="w-3 h-3 text-warning-500" />
                  <span className="font-display font-semibold tabular-nums">{w.rating.toFixed(2)}</span>
                  <span className="text-ink-400 tabular-nums">({w.reviews})</span>
                </span>
                <span className="inline-flex items-center gap-1 text-ink-600">
                  <Icon.clock className="w-3 h-3" />
                  <span className="tabular-nums">{w.next}</span>
                </span>
              </div>
            </button>

            <div className="hidden sm:flex items-baseline gap-1.5 shrink-0">
              <span className="font-display text-[16px] font-bold text-ink-900 tabular-nums tracking-tight">₾{w.price}</span>
              {/* Flat per-session price — durations vary per expert, so a hardcoded "60 წთ" lied for most. */}
              <span className="text-[10.5px] text-ink-500">/ სესია</span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => onBook(w)} className="h-9 px-3 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1.5 transition-colors">
                <Icon.cal className="w-3.5 h-3.5" />
                ჯავშანი
              </button>
              <button
                type="button"
                aria-label="წაშლა მოკლე-სიიდან"
                onClick={async () => {
                  const prev = items
                  setItems(p => p.filter(x => x.id !== w.id))
                  try {
                    const res = await fetch(`/api/favorites?tutorId=${w.id}`, { method: 'DELETE' })
                    if (!res.ok) setItems(prev)
                  } catch {
                    setItems(prev)
                  }
                }}
                className="h-9 w-9 rounded-btn text-ink-400 hover:text-danger-600 hover:bg-danger-50 inline-flex items-center justify-center transition-colors"
              >
                <Icon.x className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {/* Add slot */}
      <div className="px-5 sm:px-6 py-3.5 bg-ink-50/50 border-t border-ink-100 flex items-center justify-between flex-wrap gap-3">
        <Link href="/tutors" className="inline-flex items-center gap-1.5 font-display text-[12px] font-semibold text-ink-700 hover:text-brand-700 transition-colors">
          <Icon.plus className="w-3.5 h-3.5" />
          დაამატე ექსპერტი მოკლე-სიაში
        </Link>
        <span className="text-[11.5px] text-ink-500">
          <Icon.spark className="w-3 h-3 inline -mt-0.5 mr-1 text-brand-600" />
          ყველა აქ — ხელით შერჩეული და გადამოწმებული
        </span>
      </div>

      {/* Compare drawer (live, in same artboard) */}
      {compare && (
        <div className="border-t-2 border-ink-900 bg-ink-900 text-white">
          <div className="px-5 sm:px-6 py-4 flex items-baseline justify-between">
            <div className="font-display text-[13px] font-bold tracking-tight">გვერდიგვერდ — {items.length} ექსპერტი</div>
            <button type="button" onClick={() => setCompare(false)} className="text-[11px] text-white/60 hover:text-white inline-flex items-center gap-1">
              დახურვა <Icon.x className="w-3 h-3" />
            </button>
          </div>
          <div className="px-5 sm:px-6 pb-5 overflow-x-auto">
            <table className="w-full text-[12px] min-w-[540px]">
              <thead>
                <tr className="text-left text-white/40 font-display uppercase tracking-[0.14em] text-[10px]">
                  <th className="font-medium py-2 pr-3 w-[120px]">პარამეტრი</th>
                  {items.map(w => (
                    <th key={w.id} className="font-medium py-2 px-2">
                      <div className="inline-flex items-center gap-1.5 text-white normal-case tracking-normal">
                        <img src={`https://i.pravatar.cc/64?img=${w.photo}`} alt="" className="w-5 h-5 rounded-full" />
                        <span className="font-display text-[12px] font-bold">{w.name.split(' ')[0]}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-display tabular-nums">
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">ფასი / სესია</td>
                  {items.map(w => <td key={w.id} className={`py-2.5 px-2 font-bold ${w.price === cheapest.price ? 'text-brand-300' : 'text-white'}`}>₾{w.price}</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">რეიტინგი</td>
                  {items.map(w => <td key={w.id} className={`py-2.5 px-2 font-bold ${w.rating === topRated.rating ? 'text-brand-300' : 'text-white'}`}>{w.rating.toFixed(2)} ★</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">უახლოესი</td>
                  {items.map(w => <td key={w.id} className="py-2.5 px-2 text-white">{w.next}</td>)}
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-2.5 pr-3 text-white/60">ენები</td>
                  {items.map(w => <td key={w.id} className="py-2.5 px-2 text-white normal-case tracking-normal">{w.langs.join(' · ')}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
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
      <div className="px-5 sm:px-6 py-3 border-b border-ink-100 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
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
                      <Icon.star className="w-3 h-3 text-warning-500 self-center" />
                      <span className="font-display text-[12px] font-bold text-ink-900 tabular-nums">{t.rating.toFixed(2)}</span>
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
  return (
  <>
  <article onClick={() => onOpen(s)} className="cursor-pointer grid grid-cols-[auto_1fr_auto] sm:grid-cols-[64px_auto_1fr_auto] gap-4 sm:gap-5 items-center py-4 px-5 hover:bg-ink-50/50 transition-colors">
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
            <Icon.star className="w-2.5 h-2.5" />
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
        <span className="hidden sm:inline-flex items-center gap-1 text-ink-600">
          <Icon.shield className="w-3 h-3 text-success-600" />
          ₾{s.price} escrow
        </span>
      </div>
    </div>

    {/* Action */}
    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
      {s.status === 'confirmed' && (
        <>
          <Link href={`/student/bookings/${s.id}#chat`} aria-label="ჩატი" className="hidden md:inline-flex h-9 w-9 rounded-btn border border-ink-200 hover:border-ink-300 text-ink-600 items-center justify-center transition-colors">
            <Icon.chat className="w-4 h-4" />
          </Link>
          <Link href={`/session/${s.id}`} className="h-9 px-3.5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1.5 transition-colors">
            <Icon.video className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ოთახი</span>
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
              <Icon.star className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">შეაფასე</span>
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
            <span className="hidden sm:inline">დაჯავშნე ისევ</span>
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
    body={<>უქმდება <span className="font-display font-semibold">{s.topic}</span> — {s.date}, {s.time}. თანხა escrow-დან სრულად დაგიბრუნდება.</>}
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
      setFlash(data?.fullRefund ? 'სესია გაუქმდა · სრული დაბრუნება.' : 'სესია გაუქმდა.')
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
            <p className="text-[12px] text-ink-500 mt-0.5">ყველა შენი ჯავშანი ერთ ადგილას · escrow დაცული</p>
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

/* ───── Sidebar: Book again CTA ───── */
const BookAgain = ({ onBook }: { onBook: () => void }) => (
  <section className="rounded-card overflow-hidden border border-ink-200 bg-white p-5">
    <div className="inline-flex items-center gap-1.5 mb-2">
      <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-brand-700">სწრაფი ჯავშანი</span>
    </div>
    <h3 className="font-display text-[18px] font-bold text-ink-900 tracking-tight leading-tight">
      აირჩიე ექსპერტი —<br />დაჯავშნე ვიდეო-სესია.
    </h3>
    <p className="text-[12.5px] text-ink-600 mt-2 leading-relaxed">
      მოგვწერე თემა — ჩვენი matching gun-ი დაგიფიქსირებს 3 ვარიანტს.
    </p>
    <div className="mt-4 space-y-1.5">
      <button type="button" onClick={onBook} className="w-full h-10 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors">
        <Icon.plus className="w-4 h-4" />
        ახალი ჯავშანი
      </button>
      <button type="button" onClick={() => { window.location.href = '/tutors' }} className="w-full h-10 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors">
        ექსპერტების ძებნა
      </button>
    </div>
  </section>
)

/* ───── Sidebar: Wallet / escrow ─────
   Gated behind FEATURE_PAYMENTS_V2 — the wallet/escrow balance backend
   (Stripe/BOG/TBC ledger) hasn't shipped yet; showing mock values would
   mislead users. Component is retained so flipping the flag re-enables it. */
const Wallet = () => (
  FEATURE_PAYMENTS_V2 ? (
  <section className="rounded-card overflow-hidden border border-ink-200 bg-ink-900 text-white">
    <div className="p-5">
      <div className="inline-flex items-center gap-1.5 mb-3">
        <Icon.shield className="w-3.5 h-3.5 text-brand-400" />
        <span className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/60">escrow ბალანსი</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[34px] font-bold leading-none tabular-nums tracking-[-0.03em]">₾240</span>
        <span className="text-[11.5px] text-white/50">/ 3 აქტიური სესია</span>
      </div>
      <div className="mt-5 space-y-2.5 text-[11.5px]">
        <div className="flex items-center justify-between text-white/70">
          <span>დაცული TBC-ში</span>
          <span className="font-display font-semibold tabular-nums text-white">₾200</span>
        </div>
        <div className="flex items-center justify-between text-white/70">
          <span>დაცული BOG-ში</span>
          <span className="font-display font-semibold tabular-nums text-white">₾40</span>
        </div>
        <div className="h-px bg-white/10 my-2" />
        <div className="flex items-center justify-between text-white/55">
          <span>ბოლო შევსება · 6 ივნ.</span>
          <span className="font-display font-semibold tabular-nums text-white/80">+₾80</span>
        </div>
      </div>
    </div>
    <div className="border-t border-white/10 grid grid-cols-2 divide-x divide-white/10">
      <button type="button" className="h-11 font-display text-[12px] font-semibold text-white/85 hover:bg-white/5 transition-colors inline-flex items-center justify-center gap-1.5">
        <Icon.plus className="w-3.5 h-3.5" />
        შევსება
      </button>
      <button type="button" className="h-11 font-display text-[12px] font-semibold text-white/85 hover:bg-white/5 transition-colors inline-flex items-center justify-center gap-1.5">
        <Icon.doc className="w-3.5 h-3.5" />
        ისტორია
      </button>
    </div>
  </section>
  ) : null
)

/* ───── Modal shell ───── */
const Modal = ({ open, onClose, children, size = 'md' }: { open: boolean; onClose: () => void; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
  if (!open) return null
  const w = { sm: 'max-w-[460px]', md: 'max-w-[640px]', lg: 'max-w-[860px]', xl: 'max-w-[1040px]' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
      <div onClick={onClose} className="fixed inset-0 bg-ink-900/65 backdrop-blur-[3px]" />
      <div className={`relative w-full ${w} my-auto rounded-card bg-white shadow-float overflow-hidden`}>
        {children}
      </div>
    </div>
  )
}

const ModalHeader = ({ eyebrow, title, sub, onClose, accent }: { eyebrow?: string; title: string; sub?: string; onClose: () => void; accent?: boolean }) => (
  <div className={`px-6 sm:px-7 py-5 border-b border-ink-100 flex items-start justify-between gap-4 ${accent ? 'bg-ink-50/40' : ''}`}>
    <div className="min-w-0">
      {eyebrow && <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-1.5">{eyebrow}</div>}
      <h2 className="font-display text-[18px] sm:text-[20px] font-bold text-ink-900 tracking-tight leading-tight">{title}</h2>
      {sub && <p className="text-[12.5px] text-ink-500 mt-1 leading-snug">{sub}</p>}
    </div>
    <button type="button" onClick={onClose} aria-label="დახურვა" className="shrink-0 w-9 h-9 rounded-btn hover:bg-ink-100 text-ink-500 hover:text-ink-900 inline-flex items-center justify-center transition-colors">
      <Icon.x className="w-4 h-4" />
    </button>
  </div>
)


// SessionDetailModal was placeholder content (hardcoded topic/agenda/files) — replaced by
// direct navigation to /student/bookings/[id], which renders the real detail page.

/* ───── Expert quick modal ───── */
const ExpertQuickModal = ({ open, onClose, expert, onBook }: { open: boolean; onClose: () => void; expert: WishItem | null; onBook: (w: WishItem) => void }) => {
  if (!expert) return null
  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader
        eyebrow="ექსპერტი"
        title={expert.name}
        sub={expert.headline || expert.cat}
        onClose={onClose}
      />
      <div className="p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <img src={`https://i.pravatar.cc/200?img=${expert.photo}`} alt={expert.name} className="w-20 h-20 rounded-card object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
              <span className="inline-flex items-center gap-1"><Icon.star className="w-3.5 h-3.5 text-warning-500" /><span className="font-display font-bold tabular-nums">{expert.rating.toFixed(2)}</span><span className="text-ink-500">({expert.reviews})</span></span>
              <span className="text-ink-300">·</span>
              <span className="text-ink-700">{expert.langs.join(' · ')}</span>
            </div>
            <p className="mt-3 text-[13px] text-ink-700 leading-[1.55]">{expert.headline}</p>
          </div>
        </div>

        <div className="mt-5 text-center">
          <div className="rounded-card border border-ink-200 px-3 py-3">
            <div className="font-display text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1">ფასი</div>
            <div className="font-display text-[16px] font-bold text-ink-900 tabular-nums leading-none">₾{expert.price}<span className="text-[11px] font-medium text-ink-500 ml-1">/ სესია</span></div>
          </div>
        </div>
      </div>
      <div className="px-6 sm:px-7 py-4 border-t border-ink-100 flex items-center justify-between gap-3">
        <Link href={`/tutors/${expert.id}`} onClick={() => onClose()} className="font-display text-[12.5px] font-semibold text-ink-700 hover:text-ink-900 inline-flex items-center gap-1">
          სრული პროფილი
          <Icon.arrow className="w-3 h-3" />
        </Link>
        <button type="button" onClick={() => onBook(expert)} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
          <Icon.cal className="w-4 h-4" />
          ჯავშნა
        </button>
      </div>
    </Modal>
  )
}

/* ───── Footer (compact) ───── */
const Footer = () => (
  <footer className="mt-20 lg:mt-24 bg-white border-t border-ink-200">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <Logo />
        <span className="text-[12px] text-ink-500">© 2026 · ყველა უფლება დაცულია.</span>
      </div>
      <div className="flex items-center gap-5 text-[12px] text-ink-500">
        <Link href="/help" className="hover:text-ink-900">დახმარება</Link>
        <Link href="/terms" className="hover:text-ink-900">წესები</Link>
        <Link href="/privacy" className="hover:text-ink-900">კონფიდენციალურობა</Link>
      </div>
    </div>
  </footer>
)

/* ───── User menu (popover) ───── */
const UserMenu = ({ open, onClose, me }: { open: boolean; onClose: () => void; me: MeData | null }) => {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40" />
      <div className="absolute right-6 sm:right-8 top-[68px] z-50 w-[260px] rounded-card border border-ink-200 bg-white shadow-float overflow-hidden">
        <div className="px-4 py-4 border-b border-ink-100 flex items-center gap-3">
          {me?.avatarUrl ? (
            <img src={me.avatarUrl} alt={me.fullName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <span className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 font-display font-bold inline-flex items-center justify-center">{me?.fullName ? me.fullName.slice(0, 1) : '·'}</span>
          )}
          <div className="min-w-0">
            <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight truncate">{me?.fullName ?? '—'}</div>
            <div className="text-[11.5px] text-ink-500 truncate">{me?.email ?? ''}</div>
          </div>
        </div>
        <div className="py-1.5">
          {[
            { l: 'პროფილი', i: Icon.user, href: '/student/profile' },
            { l: 'პარამეტრები', i: Icon.settings, href: '/settings' },
            ...(FEATURE_PAYMENTS_V2 ? [{ l: 'გადახდის მეთოდები', i: Icon.card, href: '/settings#payments' }] : []),
            { l: 'ექსპერტი გავხდე', i: Icon.spark, href: '/apply', accent: true },
          ].map(it => (
            <a key={it.l} href={it.href} onClick={onClose} className={`flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-ink-50 ${it.accent ? 'text-brand-700 font-display font-semibold' : 'text-ink-800'}`}>
              <it.i className="w-4 h-4" />
              {it.l}
            </a>
          ))}
        </div>
        <div className="border-t border-ink-100 py-1.5">
          {/* fetch + navigate (NOT a native form POST): the signout endpoint
              returns JSON, so a form submit would render {"ok":true} as a page. */}
          <button type="button" onClick={() => signOut()} className="flex items-center gap-3 px-4 py-2 text-[13px] text-ink-700 hover:bg-ink-50 w-full text-left">
            <Icon.logout className="w-4 h-4" />
            გასვლა
          </button>
        </div>
      </div>
    </>
  )
}

/* ───── Page ───── */
/* ───── Dashboard "home" section — wraps the original main content ───── */
const HomeSection = ({ me, bookings, bookingsLoading, bookingsError, reload, openBookingFor, openBookingGeneric, onOpenDetail, onOpenExpert }: { me: MeData | null; bookings: any[]; bookingsLoading: boolean; bookingsError: string | null; reload: () => Promise<void> | void; openBookingFor: (w: WishItem) => void; openBookingGeneric: () => void; onOpenDetail: (id?: string) => void; onOpenExpert: (w: WishItem) => void }) => (
  <>
    <Welcome me={me} bookings={bookings} />
    <OnboardingTour userId={me?.id} hasBookings={bookings.length > 0} joinedAt={(me as any)?.createdAt} />
    <main className="max-w-[1280px] mx-auto px-6 sm:px-8 py-8 lg:py-10">
      <div className="mb-6">
        <NextSession bookings={bookings} loading={bookingsLoading} onOpenDetail={onOpenDetail} onOpenExpert={() => {}} />
      </div>
      {/* Primary: the user's own sessions (+ quick-book rail) come FIRST —
          discovery (recommendations, shortlist) follows below. */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-6 xl:gap-8 items-start mb-8">
        <div className="min-w-0 space-y-6">
          <SessionsPanel bookings={bookings} loading={bookingsLoading} loadError={bookingsError} reload={reload} onOpenSession={s => onOpenDetail(s.id)} />
        </div>
        <aside className="space-y-5 lg:sticky lg:top-[80px]">
          <BookAgain onBook={openBookingGeneric} />
        </aside>
      </div>
      <div className="mb-8">
        <Discover onOpen={(t) => { window.location.href = `/tutors/${t.id}` }} />
      </div>
      <div>
        <Wishlist onBook={openBookingFor} onQuickView={onOpenExpert} />
      </div>
    </main>
  </>
)

export default function Dashboard() {
  const [userMenu, setUserMenu] = useState(false)
  const [expertOpen, setExpertOpen] = useState<WishItem | null>(null)
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

  // Go straight to the expert's profile where the real booking modal lives —
  // no intermediate (non-submitting) sheet. ?rebook=1 auto-opens the picker.
  const openBookingFor = (w: WishItem) => { window.location.href = `/tutors/${w.id}?rebook=1` }
  const openBookingGeneric = () => { window.location.href = '/tutors' }

  // Neutral gate while we confirm the session — no authed chrome, no redirect
  // flash. On failure this becomes a visible dead-end-free error card with a
  // retry, never an indefinite spinner.
  if (authState !== 'authed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-ink-50/40 text-ink-900 px-6">
        <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain opacity-90 select-none" draggable={false} />
        {authState === 'checking' ? (
          <div className="inline-flex items-center gap-2 text-[12.5px] text-ink-500">
            <svg viewBox="0 0 24 24" className="w-5 h-5 animate-spin text-ink-400" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
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
      <TopBar me={me} onOpenMenu={() => setUserMenu(o => !o)} menuOpen={userMenu} />
      <UserMenu open={userMenu} onClose={() => setUserMenu(false)} me={me} />

      <HomeSection
        me={me}
        bookings={bookings}
        bookingsLoading={bookingsLoading}
        bookingsError={bookingsError}
        reload={loadBookings}
        openBookingFor={openBookingFor}
        openBookingGeneric={openBookingGeneric}
        onOpenDetail={(id) => { if (id) window.location.href = `/student/bookings/${id}` }}
        onOpenExpert={setExpertOpen}
      />

      <Footer />

      {/* Modals */}
      <ExpertQuickModal open={!!expertOpen} onClose={() => setExpertOpen(null)} expert={expertOpen} onBook={(w) => { setExpertOpen(null); openBookingFor(w) }} />
    </div>
  )
}


