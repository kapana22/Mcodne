'use client'
import React, { useState, useEffect, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer as SharedFooter } from '@/components/Footer'
import { useToast } from '@/components/ToastProvider'
import { copyToClipboard } from '@/lib/clipboard'
import { safeHttpUrl } from '@/lib/safeUrl'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { pushRecentTutor } from '@/components/RecentTutorsStrip'
import { userTimezone, TBILISI } from '@/lib/tz'
import { CountUp } from '@/components/CountUp'
import { Sheet } from '@/components/Sheet'

/* ───── Icons ───── */
const Icon = {
  arrow: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>,
  chevD: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6" /></svg>,
  chevR: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 6 6 6-6 6" /></svg>,
  chevL: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 6-6 6 6 6" /></svg>,
  check: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m4 12 5 5L20 6" /></svg>,
  star: (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>,
  play: (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7L8 5Z" /></svg>,
  pause: (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>,
  shield: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  clock: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  globe: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" /></svg>,
  spark: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>,
  heart: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20s-7-4.4-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.6 12 20 12 20Z" /></svg>,
  heartFilled: (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 20s-7-4.4-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.6 12 20 12 20Z" /></svg>,
  share: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" /></svg>,
  flag: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 21V5a17 17 0 0 1 9 0 17 17 0 0 0 7 0v9a17 17 0 0 1-7 0 17 17 0 0 0-9 0" /></svg>,
  cal: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  video: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" /></svg>,
  x: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  thumb: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M7 11V20H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" /><path d="M7 11V8a4 4 0 0 1 4-4l1.5 5h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.2 20H7" /></svg>,
  file: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>,
  download: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></svg>,
  bell: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3V9Z" /><path d="M10 19a2 2 0 1 0 4 0" /></svg>,
  xC:       (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  menu:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  warn:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v5M12 18h0" /></svg>,
}

const Logo = () => (
  <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
  </Link>
)

const VerifiedMark = ({ size = 20 }: { size?: number }) => (
  <span title="გადამოწმებული ექსპერტი" className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

/* Local TopBar was orphan (never rendered) — page uses <PublicTopBar /> instead. Removed. */

/* ───── Breadcrumb ───── */
type TutorDetail = {
  id: string
  headline?: string | null
  bio?: string | null
  specialty?: string | null
  yearsExp?: number | null
  rating?: number | null
  reviewsCount?: number | null
  sessionsCount?: number | null
  price?: number | null
  verified?: boolean
  responseHours?: number | null
  languages?: string[] | null
  videoUrl?: string | null
  user: { id: string; fullName: string; avatarUrl?: string | null; bio?: string | null }
  category?: { id: string; slug: string; name: string; icon?: string | null } | null
}

const Breadcrumb = ({ tutor }: { tutor: TutorDetail | null }) => (
  <nav aria-label="ნავიგაცია" className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] flex items-center gap-2 text-ink-500">
    <Link href="/tutors" className="hover:text-ink-900 transition-colors">ექსპერტები</Link>
    {tutor?.category && (
      <>
        <Icon.chevR className="w-3 h-3 text-ink-300" />
        <Link href={`/tutors?category=${tutor.category.slug}`} className="hover:text-ink-900 transition-colors">{tutor.category.name}</Link>
      </>
    )}
    <Icon.chevR className="w-3 h-3 text-ink-300" />
    <span className="text-ink-900">{tutor?.user?.fullName ?? TUTOR_DEFAULTS.name}</span>
  </nav>
)

const LANG_LABEL: Record<string, string> = { ka: 'ქარ', en: 'ENG', ru: 'RUS', tr: 'TUR' }

// Flat, expert-authored price — MUST stay identical to the helper in
// app/tutors/page.tsx. `base` is the exact price the expert set for their
// consultation: what they enter is what the client pays. The system does NOT
// re-derive it from an hourly rate — `minutes` is only a display label. We keep
// the two-arg signature so existing call sites (which pass the duration for the
// "/ N წთ" label) stay unchanged.
function priceForDuration(base: number, _minutes: number): number {
  return Math.max(0, Math.round(base || 0))
}

// ───── Shared fallback defaults ─────
// These MUST stay identical to the TUTOR_DEFAULTS block in
// app/tutors/page.tsx so the search card and this detail page never disagree on
// price / duration / name for the same missing fields. Duration is aligned to
// the Prisma schema (`consultationDurationMin @default(30)`); price has no
// schema default, so we pick one shared fallback used by both surfaces.
// Covered by tests/tutor-mapping.test.ts.
const TUTOR_DEFAULTS = { price: 80, durationMin: 30, name: 'ექსპერტი', responseHours: 24 } as const

/* ───── Video hero — cover moment with overlapping avatar ───── */
const VideoHero = ({ tutorId, tutor, requireAuth }: { tutorId?: string; tutor: TutorDetail | null; requireAuth?: () => boolean }) => {
  const [saved, setSaved] = useState(false)
  const [savedBusy, setSavedBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const { toast } = useToast()
  const shareTutorLink = async () => {
    if (!tutorId) return
    const url = `https://mcodne.ge/tutors/${tutorId}`
    const ok = await copyToClipboard(url)
    toast(ok ? 'ბმული დაკოპირდა' : 'ვერ დაკოპირდა', ok ? 'success' : 'error')
  }

  useEffect(() => {
    if (!tutorId) return
    let cancelled = false
    ;(async () => {
      try {
        const meRes = await fetch('/api/me')
        if (!meRes.ok || cancelled) return
        // /api/me is 200 even for guests (user: null) — only probe the
        // favorites endpoint for signed-in users, otherwise every guest
        // visit logs a 401 in the console.
        const me = await meRes.json().catch(() => null)
        if (!me?.user || cancelled) return
        const res = await fetch('/api/favorites')
        if (!res.ok || cancelled) return
        const rows = await res.json()
        if (Array.isArray(rows)) setSaved(rows.some((r: any) => r.tutorId === tutorId))
      } catch {}
    })()
    return () => { cancelled = true }
  }, [tutorId])

  const toggleSave = async () => {
    if (!tutorId || savedBusy) return
    if (requireAuth && requireAuth()) return
    setSavedBusy(true)
    const wasSaved = saved
    setSaved(!wasSaved)
    try {
      const res = wasSaved
        ? await fetch(`/api/favorites?tutorId=${tutorId}`, { method: 'DELETE' })
        : await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tutorId }),
          })
      if (!res.ok) {
        if (res.status === 401) {
          const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/tutors/${tutorId}`
          window.location.href = `/signin?redirect=${encodeURIComponent(here)}`
          return
        }
        setSaved(wasSaved) // revert
      }
    } catch {
      setSaved(wasSaved)
    } finally {
      setSavedBusy(false)
    }
  }
  // Detect YouTube URLs — new tutors store canonical "youtu.be/{id}". Legacy
  // rows may still carry a raw `data:video/…` base64 blob from the old file
  // upload path; those render via <video> until the tutor swaps in a link.
  const ytId = ((): string | null => {
    const v = tutor?.videoUrl
    if (!v || v.startsWith('data:')) return null
    try {
      const url = v.startsWith('http') ? new URL(v) : new URL(`https://${v}`)
      const host = url.hostname.replace(/^www\./, '')
      if (host === 'youtu.be') {
        const id = url.pathname.slice(1).split('/')[0]
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
      }
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const q = url.searchParams.get('v')
        if (q && /^[a-zA-Z0-9_-]{11}$/.test(q)) return q
        const parts = url.pathname.split('/').filter(Boolean)
        if (['shorts', 'embed', 'live'].includes(parts[0]) && parts[1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[1])) {
          return parts[1]
        }
      }
      return null
    } catch { return null }
  })()

  return (
    <div>
      {/* Cover — YouTube embed if the tutor supplied a link, legacy base64
          video for old rows, else blurred avatar backdrop as a fallback. */}
      <div className="rounded-card overflow-hidden border border-ink-200 bg-ink-900 relative motion-safe:animate-scale-in">
        {ytId ? (
          playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1&autoplay=1`}
              title="Intro video"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full aspect-[16/9] sm:aspect-[21/9] border-0 bg-black"
            />
          ) : (
            // Click-to-load facade — a raw autoplaying embed rendered as a black
            // box before playback (looked broken); Preply shows a poster + play
            // button. This also defers the heavy YouTube iframe until intent.
            <button type="button" onClick={() => setPlaying(true)} aria-label="ჩართე ვიდეო-ვიზიტკა" className="group w-full aspect-[16/9] sm:aspect-[21/9] relative block bg-ink-900 overflow-hidden">
              <img src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-slow" loading="lazy" />
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/60 via-transparent to-ink-950/10" />
              <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 shadow-float inline-flex items-center justify-center group-hover:scale-110 group-hover:bg-white transition-all duration-fast">
                  <Icon.play className="w-6 h-6 sm:w-7 sm:h-7 text-brand-600 translate-x-0.5" />
                </span>
              </span>
              <span className="absolute top-4 left-4 sm:top-5 sm:left-5 inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-white/15 backdrop-blur-sm ring-1 ring-white/25 text-white text-[11.5px] font-display font-semibold">
                <Icon.video className="w-3.5 h-3.5" /> ვიდეო-ვიზიტკა
              </span>
            </button>
          )
        ) : tutor?.videoUrl ? (
          <video
            src={tutor.videoUrl}
            controls
            playsInline
            poster={tutor.user.avatarUrl ?? undefined}
            className="w-full aspect-[16/9] sm:aspect-[21/9] object-cover bg-black"
          />
        ) : (
          // Clean premium gradient cover — a stretched, blurred portrait cropped
          // the face and looked rough; the crisp circular avatar in the identity
          // card below carries the face instead.
          <div className="w-full aspect-[16/9] sm:aspect-[21/9] relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-ink-900">
            <div aria-hidden className="absolute -top-1/3 -right-[15%] w-[55%] h-[130%] rounded-full bg-brand-400/25 blur-3xl" />
            <div aria-hidden className="absolute -bottom-1/2 -left-[10%] w-[45%] h-[120%] rounded-full bg-ink-950/40 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-ink-950/15 to-transparent" />

            {/* Glassy stat badges — top-left of the cover (Preply-style), clear
                of the avatar which sits bottom-left. Real data only. */}
            <div className="absolute top-4 left-4 sm:top-5 sm:left-5 flex flex-wrap items-center gap-1.5 motion-safe:animate-rise-in">
              {typeof tutor?.rating === 'number' && tutor.rating > 0 && (
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-white/15 backdrop-blur-sm ring-1 ring-white/25 text-white text-[11.5px] font-display font-semibold tabular-nums">
                  <Icon.star className="w-3 h-3 text-warning-400" /> {tutor.rating.toFixed(2)}
                </span>
              )}
              {typeof tutor?.sessionsCount === 'number' && tutor.sessionsCount > 0 && (
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-white/15 backdrop-blur-sm ring-1 ring-white/25 text-white text-[11.5px] font-display font-semibold tabular-nums">
                  {tutor.sessionsCount} სესია
                </span>
              )}
              {typeof tutor?.responseHours === 'number' && tutor.responseHours > 0 && (
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-white/15 backdrop-blur-sm ring-1 ring-white/25 text-white text-[11.5px] font-display font-medium tabular-nums">
                  <Icon.clock className="w-3 h-3" /> &lt; {tutor.responseHours}სთ
                </span>
              )}
            </div>

            {/* Headline — lifted clear of the identity card's upward overlap. */}
            <div className="absolute left-4 right-4 sm:left-5 sm:right-5 bottom-20 sm:bottom-16 text-white motion-safe:animate-rise-in" style={{ animationDelay: '160ms' }}>
              <div className="font-display text-[18px] sm:text-[22px] lg:text-[26px] font-bold leading-tight tracking-tight">
                {tutor?.headline ?? tutor?.specialty ?? 'ექსპერტი'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Identity: overlapping card */}
      <div className="relative -mt-8 sm:-mt-12 mx-3 sm:mx-6 lg:mx-8 rounded-card bg-white border border-ink-200 shadow-card px-5 sm:px-7 pt-5 sm:pt-6 pb-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative shrink-0 -mt-12 sm:-mt-16">
            <div className="w-[88px] h-[88px] sm:w-[112px] sm:h-[112px] rounded-full overflow-hidden bg-brand-100 ring-4 ring-white shadow-card inline-flex items-center justify-center">
              {tutor?.user.avatarUrl ? (
                <img
                  src={tutor.user.avatarUrl}
                  alt={tutor.user.fullName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-display text-[36px] font-bold text-brand-700">{tutor?.user?.fullName?.slice(0, 1) ?? '?'}</span>
              )}
            </div>
          </div>

          {/* Actions top-right */}
          <div className="ml-auto shrink-0 flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleSave}
              disabled={savedBusy}
              aria-label={saved ? 'შენახული' : 'შენახვა'}
              className={`w-11 h-11 rounded-full border inline-flex items-center justify-center transition-colors disabled:opacity-60 ${saved ? 'border-danger-300 bg-danger-50 text-danger-600' : 'border-ink-200 bg-white hover:border-ink-300 text-ink-600'}`}
            >
              {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={shareTutorLink}
              aria-label="ბმულის კოპირება"
              title="დააკოპირე ბმული"
              className="h-11 px-3.5 rounded-pill border border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 text-ink-700 inline-flex items-center gap-1.5 font-display text-[12px] sm:text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
              </svg>
              <span className="hidden sm:inline">გაუზიარე</span>
            </button>
          </div>
        </div>

        {/* Identity content */}
        <div className="mt-3 sm:mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-[26px] sm:text-[32px] lg:text-[38px] font-bold text-ink-900 tracking-tight leading-[1.05]">
              {tutor?.user.fullName ?? TUTOR_DEFAULTS.name}
            </h1>
            {tutor?.verified && <VerifiedMark size={22} />}
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {tutor?.specialty && (
              <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-pill bg-brand-50 border border-brand-200 text-[12px] font-display font-semibold text-brand-800">
                {tutor.specialty}
              </span>
            )}
            {tutor?.category?.name && tutor.category.name !== tutor.specialty && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 h-7 rounded-pill bg-ink-50 border border-ink-200 text-[12px] font-display font-medium text-ink-700">
                {tutor.category.name}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            {typeof tutor?.rating === 'number' && tutor.rating > 0 && (
              <>
                <div className="inline-flex items-baseline gap-1.5">
                  <Icon.star className="w-3.5 h-3.5 text-warning-500 self-center" />
                  <span className="font-display font-bold text-ink-900 tabular-nums text-[15px]">{tutor.rating.toFixed(2)}</span>
                  {typeof tutor.reviewsCount === 'number' && tutor.reviewsCount > 0 && (
                    <span className="text-ink-500 tabular-nums">· {tutor.reviewsCount}</span>
                  )}
                </div>
                <span className="w-1 h-1 rounded-full bg-ink-300" />
              </>
            )}
            {typeof tutor?.sessionsCount === 'number' && tutor.sessionsCount > 0 && (
              <>
                <div className="inline-flex items-baseline gap-1.5">
                  <span className="font-display font-bold text-ink-900 tabular-nums text-[15px]">{tutor.sessionsCount}</span>
                  <span className="text-ink-500">სესია</span>
                </div>
                <span className="w-1 h-1 rounded-full bg-ink-300" />
              </>
            )}
            {tutor?.languages && tutor.languages.length > 0 && (
              <>
                <div className="inline-flex items-center gap-1.5 text-ink-700">
                  <Icon.globe className="w-3.5 h-3.5 text-ink-500" />
                  <span>{tutor.languages.map(l => LANG_LABEL[l] ?? l.toUpperCase()).join(' · ')}</span>
                </div>
                {typeof tutor.yearsExp === 'number' && tutor.yearsExp > 0 && <span className="w-1 h-1 rounded-full bg-ink-300" />}
              </>
            )}
            {typeof tutor?.yearsExp === 'number' && tutor.yearsExp > 0 && (
              <div className="inline-flex items-center gap-1.5 text-ink-700">
                <span>{tutor.yearsExp} წელი</span>
              </div>
            )}
            {typeof tutor?.responseHours === 'number' && tutor.responseHours > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-300" />
                <div className="inline-flex items-center gap-1.5 text-ink-700">
                  <Icon.clock className="w-3.5 h-3.5 text-ink-500" />
                  <span>პასუხის დრო · &lt; {tutor.responseHours}სთ</span>
                </div>
              </>
            )}
          </div>

          {(tutor?.headline || tutor?.bio) && (
            <p className="mt-4 text-[14px] text-ink-600 leading-[1.6] max-w-[560px]">
              {tutor?.headline ?? tutor?.bio}
            </p>
          )}

          {/* Trust row — reassurance before booking. On a high-ticket, first-time
              purchase these three signals remove the biggest objections. */}
          <div className="mt-5 pt-4 border-t border-ink-100 flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-display font-medium text-ink-700">
              <Icon.check className="w-4 h-4 text-brand-600" /> ხელით შერჩეული ექსპერტი
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-display font-medium text-ink-700">
              <Icon.shield className="w-4 h-4 text-brand-600" /> {PAYMENTS_LIVE ? 'Escrow-დაცული გადახდა' : 'უფასო დაჯავშნა · გადახდები მალე'}
            </span>
            {tutor?.verified && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-display font-medium text-ink-700">
                <Icon.star className="w-4 h-4 text-brand-600" /> ID გადამოწმებული
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───── Reviews ───── */
type ReviewItem = {
  id: string
  rating: number
  body: string
  createdAt: string
  // null = anonymous review — the API strips the reviewer's identity.
  student: { id: string; fullName: string; avatarUrl?: string | null } | null
}

const Stars = ({ n }: { n: number }) => (
  <div className="inline-flex items-center gap-0.5 group">
    {Array.from({ length: 5 }).map((_, i) => (
      <Icon.star
        key={i}
        className={`w-3.5 h-3.5 transition-all duration-fast ${
          i < n
            ? 'text-warning-500 group-hover:drop-shadow-[0_0_6px_rgba(197,151,47,0.4)] group-hover:scale-110'
            : 'text-ink-200'
        }`}
        style={{ transitionDelay: `${i * 30}ms` }}
      />
    ))}
  </div>
)

const REV_MONTHS = ['იან.','თებ.','მარ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექ.','ოქტ.','ნოე.','დეკ.']
const timeAgoGe = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days < 1) return 'დღეს'
  if (days < 7) return `${days} დღის წინ`
  if (days < 30) return `${Math.floor(days / 7)} კვირის წინ`
  if (days < 365) return `${Math.floor(days / 30)} თვის წინ`
  return `${d.getDate()} ${REV_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const Reviews = ({ reviews, rating, total, verified }: { reviews: ReviewItem[]; rating: number; total: number; verified: boolean }) => {
  const dist = [5, 4, 3, 2, 1].map(s => ({
    s,
    n: reviews.filter(r => Math.round(r.rating) === s).length,
  }))
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? reviews : reviews.slice(0, 6)

  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-3">შეფასებები</div>
      <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">
        {total > 0 ? 'რას ამბობს მომხმარებელი' : 'ჯერ არ არის შეფასება'}
      </h2>

      {total === 0 ? (
        <p className="mt-3 text-[13.5px] text-ink-500 max-w-[520px]">ამ ექსპერტს ჯერ არ ჰქონია სესია, რომელიც შეფასდა. იყავი პირველი — დაჯავშნე.</p>
      ) : (
        <>
          <div className="mt-7 rounded-card border border-ink-200 bg-ink-50/50 p-5 sm:p-6 grid sm:grid-cols-[auto_1fr] gap-6 sm:gap-10 items-center">
            <div className="flex items-baseline gap-4 pb-5 sm:pb-0 sm:pr-8 sm:border-r border-b sm:border-b-0 border-ink-200">
              <span className="font-display text-[56px] sm:text-[64px] font-bold text-ink-900 tabular-nums leading-none tracking-tight motion-safe:animate-scale-in">
                <CountUp value={rating} decimals={2} />
              </span>
              <div>
                <Stars n={Math.round(rating)} />
                <div className="mt-1.5 text-[12px] text-ink-500 tabular-nums">
                  <CountUp value={total} /> შეფასებიდან
                </div>
                {verified && rating >= 4.8 && (
                  <div className="mt-1 text-[11px] font-display font-semibold uppercase tracking-[0.14em] text-brand-700">Super expert</div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {dist.map(d => {
                const pct = reviews.length > 0 ? (d.n / reviews.length) * 100 : 0
                return (
                  <div key={d.s} className="grid grid-cols-[24px_1fr_40px] items-center gap-3 text-[12px]">
                    <span className="font-display font-semibold tabular-nums text-ink-700 inline-flex items-center gap-1">
                      {d.s}
                      <Icon.star className="w-3 h-3 text-warning-500" />
                    </span>
                    <div className="h-2 bg-white ring-1 ring-ink-100 rounded-pill overflow-hidden">
                      <div className="h-full bg-warning-500 rounded-pill motion-safe:transition-[width] motion-safe:duration-slow motion-safe:ease-out-quart" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-ink-500 tabular-nums text-right font-display font-medium">
                      <CountUp value={d.n} />
                    </span>
                  </div>
                )
              })}
              {/* The bars are computed from the LOADED reviews (API returns the
                  latest 8) while the big number/total are lifetime aggregates —
                  without this caption the two visibly disagree and read as a
                  fake rating. */}
              {reviews.length > 0 && reviews.length < total && (
                <div className="pt-1 text-[11px] text-ink-400">განაწილება ბოლო {reviews.length} შეფასების მიხედვით</div>
              )}
            </div>
          </div>

          <div className="mt-10 divide-y divide-ink-100">
            {shown.map(r => (
              <article key={r.id} className="py-6 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 mb-3">
                  {r.student?.avatarUrl ? (
                    <img src={r.student.avatarUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 inline-flex items-center justify-center font-display font-bold shrink-0">{r.student?.fullName?.slice(0, 1) ?? 'ა'}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[14px] font-bold text-ink-900 leading-tight truncate">{r.student?.fullName ?? 'ანონიმური კლიენტი'}</div>
                    <div className="mt-0.5 inline-flex items-center gap-2 text-[11.5px] text-ink-500">
                      <Stars n={Math.round(r.rating)} />
                      <span>·</span>
                      <span>{timeAgoGe(r.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <p className="text-[14px] text-ink-700 leading-[1.6] max-w-[680px] whitespace-pre-wrap">{r.body}</p>
              </article>
            ))}
          </div>

          {reviews.length > 6 && !showAll && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="h-11 px-5 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors"
              >
                ნახე ყველა {reviews.length} შეფასება
                <Icon.chevD className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/* Local Footer was orphan (had hardcoded fake nav) — replaced by shared components/Footer.tsx via SharedFooter. */

/* ───── Mobile sticky booking bar ───── */
const MobileBookingBar = ({ onBook, price, responseHours, sessionMin, signedIn, paused, availability = [], busySlots = [] }: { onBook: () => void; price: number; responseHours: number; sessionMin: number; signedIn?: boolean | null; paused?: boolean; availability?: ApiSlot[]; busySlots?: BusyInput }) => {
  // Flag the body while this mobile CTA bar is mounted so the cookie banner
  // lifts above it (see globals.css) instead of covering the primary CTA.
  useEffect(() => {
    document.body.setAttribute('data-mobile-cta', '1')
    return () => document.body.removeAttribute('data-mobile-cta')
  }, [])

  // Earliest actually-bookable start → "next available" hint. Uses the same
  // busy-aware enumeration the booking modal runs (computeNextFreeStart), so
  // the bar never advertises a time the modal then shows as taken. Mirrors the
  // desktop StickyBookingCard's hint.
  const nextFree = React.useMemo(
    () => computeNextFreeStart(availability, busySlots, sessionMin),
    [availability, busySlots, sessionMin],
  )

  // The bar has three states the button must communicate on its own —
  // the explanatory banners live far up the page on mobile:
  //   paused   → expert stepped out; booking closed
  //   noSlots  → live profile, but nothing bookable right now
  //   bookable → normal CTA
  const noSlots = !paused && nextFree === null
  const disabled = paused || noSlots
  return (
  <div
    className="lg:hidden fixed bottom-0 left-0 right-0 z-[65] bg-white/95 backdrop-blur-md border-t border-ink-200 shadow-[0_-4px_20px_rgba(46,42,33,0.06)] motion-safe:animate-slide-in-b"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[22px] font-bold text-ink-900 tabular-nums leading-none tracking-tight">₾{priceForDuration(price, sessionMin)}</span>
          <span className="text-[11.5px] text-ink-500">/ {sessionMin} წთ</span>
        </div>
        {!disabled && nextFree && (
          <div className="mt-1 text-[11px] text-ink-500 leading-none truncate">
            უახლოესი: <span className="font-display font-semibold text-ink-800">{DAY_NAMES_FULL[isoWeekday(nextFree)]}, {nextFree.getDate()} {KA_MONTHS_FULL[nextFree.getMonth()]}</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onBook}
        disabled={disabled}
        className="ml-auto shrink-0 h-12 px-5 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(21,154,130,0.36)] transition-all duration-fast disabled:bg-none disabled:bg-ink-200 disabled:text-ink-500 disabled:shadow-none disabled:cursor-not-allowed"
      >
        {paused ? 'პაუზაზეა' : noSlots ? 'დროები არ არის' : signedIn === false ? 'შესვლა და დაჯავშნა' : 'დაჯავშნა'}
        {!disabled && <Icon.arrow className="w-4 h-4" />}
      </button>
    </div>
    <div className="border-t border-ink-100 px-4 py-2 flex items-center justify-center gap-4 text-[10.5px] text-ink-500">
      {paused ? (
        <span>ჯავშნები დროებით შეჩერებულია — პროფილი აქტიური დარჩება</span>
      ) : noSlots ? (
        <span>ახალი დროები მალე დაემატება — შეინახე პროფილი ❤ ღილაკით</span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1">
            <Icon.shield className="w-3 h-3 text-success-600" />
            {PAYMENTS_LIVE ? 'Escrow დაცული' : 'უფასო დაჯავშნა'}
          </span>
          <span className="text-ink-300">·</span>
          <span className="inline-flex items-center gap-1">
            <Icon.clock className="w-3 h-3 text-ink-400" />
            რეაგ. ~ {responseHours} სთ
          </span>
        </>
      )}
    </div>
  </div>
  )
}

/* ───── Auth prompt sheet — shown at the point of tap ─────
 * When an anonymous visitor taps a booking CTA we open this bottom sheet
 * right where they are, instead of scrolling them to a banner at the top of
 * the page (disorienting on a long profile). After auth the redirect returns
 * to this profile; a booking intent adds ?rebook=1 so the modal reopens by
 * itself and the flow continues where it left off.
 */
const AuthPromptSheet = ({ tutorId, intent, onDismiss }: { tutorId: string; intent: 'book' | null; onDismiss: () => void }) => {
  // Escape / scroll-lock / focus trap come from the Sheet container.
  const target = `/tutors/${tutorId}${intent === 'book' ? '?rebook=1' : ''}`
  const q = `redirect=${encodeURIComponent(target)}`
  return (
    <Sheet
      open
      onClose={onDismiss}
      size="sm"
      ariaLabel="ავტორიზაცია საჭიროა"
      title={intent === 'book' ? 'შედი, რომ დაიჯავშნო' : 'შედი, რომ გააგრძელო'}
    >
        <p className="text-[13px] text-ink-600 leading-[1.55]">
          1 წუთში მორჩები — მერე ზუსტად აქ დაბრუნდები{intent === 'book' ? ' და ჯავშანი გაგრძელდება' : ''}.
        </p>
        <div className="mt-5 space-y-2.5">
          <Link href={`/signin?${q}`} className="w-full h-12 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow transition-all">
            შესვლა <Icon.arrow className="w-4 h-4" />
          </Link>
          <Link href={`/signup?${q}`} className="w-full h-12 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-75 text-ink-800 font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center transition-colors">
            რეგისტრაცია
          </Link>
        </div>
        <p className="mt-4 mb-2 text-[11px] text-ink-500 text-center inline-flex items-center gap-1.5 w-full justify-center">
          <Icon.shield className="w-3 h-3 text-success-600" />
          {PAYMENTS_LIVE ? 'გადახდა escrow-შია სესიის ბოლომდე' : 'დაჯავშნა უფასოა — გადახდები მალე'}
        </p>
    </Sheet>
  )
}

/* ───── Similar experts — fetches real tutors in the same category ───── */
type SimilarTutor = {
  id: string
  name: string
  avatar: string | null
  specialty: string
  categoryName: string
  rating: number
  sessions: number
  price: number
}

const SimilarExperts = ({ excludeId, categorySlug, categoryName }: { excludeId?: string; categorySlug?: string | null; categoryName?: string | null }) => {
  const [tutors, setTutors] = useState<SimilarTutor[] | null>(null)

  useEffect(() => {
    // Fetch with limit=5 so we can drop the current tutor and still show 4.
    const params = new URLSearchParams({ limit: '5' })
    if (categorySlug) params.set('category', categorySlug)
    fetch(`/api/tutors?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => {
        if (!Array.isArray(d)) { setTutors([]); return }
        const mapped = d
          .filter(t => t.id !== excludeId)
          .slice(0, 4)
          .map(t => ({
            id: t.id,
            name: t.user?.fullName ?? 'ექსპერტი',
            avatar: t.user?.avatarUrl ?? null,
            specialty: t.specialty ?? '',
            categoryName: t.category?.name ?? '',
            rating: t.rating ?? 0,
            sessions: t.sessionsCount ?? 0,
            price: t.price ?? 0,
          }))
        setTutors(mapped)
      })
      .catch(() => setTutors([]))
  }, [excludeId, categorySlug])

  if (tutors === null || tutors.length === 0) return null

  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-3">ასევე შესთავაზე</div>
          <h2 className="font-display text-[22px] lg:text-[26px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">მსგავსი ექსპერტები</h2>
        </div>
        <Link href={`/tutors${categorySlug ? `?category=${categorySlug}` : ''}`} className="text-[12px] text-ink-600 hover:text-ink-900 font-display font-semibold inline-flex items-center gap-1 transition-colors">
          {categoryName ? `ყველა · ${categoryName}` : 'ყველა ექსპერტი'}
          <Icon.chevR className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto sm:overflow-visible -mx-6 sm:mx-0 px-6 sm:px-0 pb-2 sm:pb-0 snap-x snap-mandatory sm:snap-none">
        {tutors.map(t => (
          <Link
            key={t.id}
            href={`/tutors/${t.id}`}
            className="shrink-0 sm:shrink w-[260px] sm:w-auto text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-4 snap-start"
          >
            <div className="flex items-start gap-3">
              {t.avatar ? (
                <img src={t.avatar} alt="" width={52} height={52} className="w-[52px] h-[52px] rounded-full object-cover shrink-0 ring-2 ring-ink-100" />
              ) : (
                <span className="w-[52px] h-[52px] rounded-full bg-brand-100 text-brand-700 inline-flex items-center justify-center font-display font-bold text-[18px] shrink-0 ring-2 ring-ink-100">{t.name.slice(0, 1)}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-display text-[14px] font-bold text-ink-900 tracking-tight truncate">{t.name}</div>
                <div className="text-[11.5px] text-ink-500 truncate mt-0.5">{t.specialty}</div>
                {t.categoryName && (
                  <div className="mt-1.5 inline-flex items-center gap-1 px-2 h-5 rounded-pill bg-brand-50 text-brand-800 font-display text-[10px] font-semibold uppercase tracking-[0.12em]">{t.categoryName}</div>
                )}
              </div>
            </div>
            <div className="mt-3.5 pt-3 border-t border-ink-100 flex items-center justify-between">
              <div className="inline-flex items-baseline gap-1 text-[12px]">
                {t.rating > 0 ? (
                  <>
                    <Icon.star className="w-3 h-3 text-warning-500 self-center" />
                    <span className="font-display font-bold text-ink-900 tabular-nums">{t.rating.toFixed(2)}</span>
                    {t.sessions > 0 && <span className="text-ink-500 tabular-nums">· {t.sessions}</span>}
                  </>
                ) : (
                  <span className="text-ink-400 text-[11px]">ახალი</span>
                )}
              </div>
              <div className="font-display text-[14px] font-bold text-ink-900 tabular-nums tracking-tight">₾{t.price}<span className="text-[11px] font-medium text-ink-500 tracking-normal">/ სესია</span></div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ───── Specs strip — compact stats row ───── */
const SpecsGrid = ({ tutor }: { tutor: TutorDetail | null }) => {
  if (!tutor) return null
  const items = [
    { n: typeof tutor.sessionsCount === 'number' ? String(tutor.sessionsCount) : '—', l: 'სესია ჩატარებული', icon: <Icon.video className="w-3.5 h-3.5" /> },
    { n: typeof tutor.responseHours === 'number' ? `~ ${tutor.responseHours} სთ` : '~ 24 სთ', l: 'რეაგირება', icon: <Icon.clock className="w-3.5 h-3.5" /> },
    { n: typeof tutor.yearsExp === 'number' ? `${tutor.yearsExp} წ.` : '—', l: 'გამოცდილება', icon: <Icon.thumb className="w-3.5 h-3.5" /> },
    // Bank names must not render before the gateway is live — until then the
    // honest spec is that booking costs nothing.
    PAYMENTS_LIVE
      ? { n: 'Escrow', l: 'TBC · BOG · SOLO', icon: <Icon.shield className="w-3.5 h-3.5" /> }
      : { n: 'უფასო', l: 'გადახდები მალე', icon: <Icon.shield className="w-3.5 h-3.5" /> },
  ]
  return (
    // Compact fact strip — these repeat identity-row facts, so on desktop they
    // act as quiet confirmation, not a second hero. Half the old height keeps
    // the About content (the real evaluation material) above the fold.
    <section className="mt-8 rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-ink-100">
        {items.map((it, i) => (
          <div key={i} className={`px-4 py-3 sm:px-5 ${i === 0 ? 'border-l-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
            <div className="inline-flex items-center gap-1.5 text-ink-500">
              {it.icon}
              <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.16em]">{it.l}</span>
            </div>
            <div className="mt-1 font-display text-[17px] sm:text-[19px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">{it.n}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ───── About ───── */
const AboutSection = ({ tutor }: { tutor: TutorDetail | null }) => {
  // A long bio is a wall of text on a phone. Below lg we clamp to ~8 lines
  // and offer an explicit expand; desktop keeps the full text (the right
  // rail balances it there). Hooks run unconditionally (before any return).
  const [bioExpanded, setBioExpanded] = useState(false)
  if (!tutor) return null
  const bio = tutor.bio ?? tutor.user.bio
  if (!bio && !tutor.headline) return null
  // Split bio into paragraphs by double newline or period-space+capital.
  const paragraphs = bio ? bio.split(/\n\n+/).filter(p => p.trim()) : []
  const isLong = (bio?.length ?? 0) > 420
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-4">ჩემ შესახებ</div>
      {tutor.headline && (
        <blockquote className="font-display text-[22px] lg:text-[26px] leading-[1.35] font-medium tracking-tight text-ink-800 mb-7 max-w-[640px]">
          „{tutor.headline}"
        </blockquote>
      )}
      {paragraphs.length > 0 && (
        <>
          <div className={`space-y-4 text-[14.5px] text-ink-700 leading-[1.65] max-w-[640px] whitespace-pre-wrap ${isLong && !bioExpanded ? 'max-lg:line-clamp-[8]' : ''}`}>
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {isLong && (
            <button
              type="button"
              onClick={() => setBioExpanded(v => !v)}
              className="lg:hidden mt-3 h-11 -ml-1 px-1 inline-flex items-center gap-1.5 font-display text-[13px] font-semibold text-brand-700 no-caps"
              aria-expanded={bioExpanded}
            >
              {bioExpanded ? 'ჩაკეცვა' : 'სრულად წაკითხვა'}
              <Icon.chevD className={`w-4 h-4 transition-transform ${bioExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </>
      )}
    </section>
  )
}

/* ───── Services — takes tutor.consultations from API ───── */
type ConsultationItem = {
  id: string
  tier: string
  title: string
  description: string | null
  minutes: number
  price: number
}

const ServicesSection = ({ consultations, onBook }: { consultations: ConsultationItem[]; onBook: (s: ConsultationItem) => void }) => {
  if (!consultations || consultations.length === 0) return null
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-3">სერვისები</div>
          <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">რას გავუკეთებ შენთვის</h2>
        </div>
        <span className="text-[11.5px] text-ink-500 font-display tabular-nums">{consultations.length} პროდუქტი · ფიქსირებული ფასი</span>
      </div>

      <div className="mt-7 grid sm:grid-cols-2 gap-3">
        {consultations.map((s, i) => (
          <article key={s.id} className="rounded-card border border-ink-200 bg-white p-5 hover:border-ink-300 hover-lift flex flex-col">
            <div className="font-display text-[11px] font-bold text-brand-700 tabular-nums mb-2">{String(i+1).padStart(2, '0')}</div>
            <h3 className="font-display text-[15px] lg:text-[16px] font-bold text-ink-900 tracking-tight leading-tight">{s.title}</h3>
            {s.description && <p className="text-[13px] text-ink-600 mt-2 leading-[1.55] flex-1">{s.description}</p>}
            <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between">
              <div>
                <div className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">{s.minutes} წუთი</div>
                <div className="font-display text-[18px] font-bold text-ink-900 tabular-nums leading-none mt-1">₾{s.price}</div>
              </div>
              <button type="button" onClick={() => onBook(s)} className="h-11 px-4 rounded-btn bg-brand-50 hover:bg-brand-500 hover:text-white border border-brand-200 hover:border-brand-500 text-brand-700 font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1 transition-colors">
                დაჯავშნა <Icon.arrow className="w-3 h-3" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ───── Certificates ───── */
type CertItem = { id: string; title: string; issuer: string; year: number; fileUrl: string | null; verified: boolean }
type EduItem = { id: string; school: string; degree: string; field: string | null; startYear: number; endYear: number | null }
type ExpItem = { id: string; company: string; role: string; startYear: number; endYear: number | null; description: string | null }

const CertificatesSection = ({ items }: { items: CertItem[] }) => {
  if (!items || items.length === 0) return null
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-3">სერტიფიკატები</div>
          <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">დიპლომები და სერტიფიკატები</h2>
        </div>
        <span className="text-[11.5px] text-ink-500 font-display inline-flex items-center gap-1.5">
          <Icon.shield className="w-3.5 h-3.5 text-brand-600" />
          ხელით გადამოწმებული
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {items.map(c => (
          <div key={c.id} className="inline-flex items-center gap-2 h-9 pl-3 pr-3.5 rounded-pill border border-ink-200 bg-white">
            <span className="font-display text-[12.5px] font-bold text-ink-900 truncate max-w-[280px]">{c.title}</span>
            <span className="text-[11px] text-ink-500 tabular-nums">· {c.issuer} · {c.year}</span>
            {c.verified && (
              <span className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white ml-0.5" style={{ width: 14, height: 14 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={8} height={8}><path d="m4 12 5 5L20 6" /></svg>
              </span>
            )}
            {safeHttpUrl(c.fileUrl) && (
              <a href={safeHttpUrl(c.fileUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-9 h-9 -my-2 -mr-1.5 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors" aria-label="ჩამოტვირთვა">
                <Icon.download className="w-4 h-4" />
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

const EducationSection = ({ items }: { items: EduItem[] }) => {
  if (!items || items.length === 0) return null
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-3">განათლება</div>
      <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">ფორმალური საფუძველი</h2>

      <ol className="mt-6 relative space-y-5 pl-6">
        <span className="absolute left-[7px] top-2 bottom-2 w-px bg-ink-200" aria-hidden />
        {items.map(e => (
          <li key={e.id} className="relative">
            <span className="absolute left-[-24px] top-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 ring-4 ring-white" />
            <div className="font-display text-[14.5px] font-bold text-ink-900 tracking-tight">{e.school}</div>
            <div className="text-[13px] text-ink-700 mt-0.5">{e.degree}{e.field ? ` · ${e.field}` : ''}</div>
            <div className="text-[11.5px] text-ink-500 tabular-nums mt-0.5">{e.startYear} – {e.endYear ?? 'დღემდე'}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}

const ExperienceSection = ({ items }: { items: ExpItem[] }) => {
  if (!items || items.length === 0) return null
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-3">გამოცდილება</div>
      <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">სამუშაო ისტორია</h2>

      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {items.map(x => (
          <article key={x.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="font-display text-[14px] font-bold text-ink-900 leading-snug">{x.role}</div>
            <div className="text-[12.5px] text-ink-700 mt-0.5">{x.company}</div>
            <div className="text-[11.5px] text-ink-500 tabular-nums mt-1">{x.startYear} – {x.endYear ?? 'ახლა'}</div>
            {x.description && <p className="mt-2 text-[12.5px] text-ink-600 leading-[1.55]">{x.description}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

/* Small hint chip next to the picker. `fmtHM` renders times in the browser's
   local zone (uses Date#getHours), so the label must reflect that or it lies.
   - Tbilisi visitors: show "GMT+4" (their local IS Tbilisi).
   - Remote visitors: show "შენს დროზე" — they see their local wall-clock, not
     Tbilisi time. Earlier copy said "თბილისის დროით" which was misleading. */
const TbilisiHint = () => {
  const [tz, setTz] = React.useState<string>(TBILISI)
  React.useEffect(() => { setTz(userTimezone()) }, [])
  if (tz === TBILISI) {
    return <span className="text-[11px] text-ink-400 tabular-nums">GMT+4</span>
  }
  return <span className="text-[11px] text-ink-400">შენს დროზე</span>
}

/* Longer variant for the Calendar footer strip. Same truthfulness rule as
   TbilisiHint — say "your zone" when the browser isn't Tbilisi. */
const CalendarTzLabel = () => {
  const [tz, setTz] = React.useState<string>(TBILISI)
  React.useEffect(() => { setTz(userTimezone()) }, [])
  if (tz === TBILISI) {
    return <span>დროის ზონა: თბილისი (GMT+4)</span>
  }
  return <span>დროის ზონა: შენი ({tz})</span>
}

/* ───── Sticky booking card — live picker → opens modal at Details ───── */
const StickyBookingCard = ({
  onOpen,
  availability = [],
  busySlots = [],
  tutorPrice = TUTOR_DEFAULTS.price,
  sessionMin = TUTOR_DEFAULTS.durationMin,
  responseHours = TUTOR_DEFAULTS.responseHours,
  sessionsCount = 0,
  rating = 0,
  reviewsCount = 0,
  signedIn,
}: {
  onOpen: () => void
  availability?: ApiSlot[]
  busySlots?: BusyInput
  tutorPrice?: number
  sessionMin?: number
  responseHours?: number
  sessionsCount?: number
  rating?: number
  reviewsCount?: number
  signedIn?: boolean | null
}) => {
  const duration = sessionMin
  const priceLabel = `₾${priceForDuration(tutorPrice, duration)}`
  const subLabel = `/ ${duration} წუთი`

  // Soonest actually-bookable start — powers the "next available" hint. Uses
  // the same busy-aware enumeration the booking modal runs, so the rail never
  // advertises a day whose windows the modal then shows as all taken. The full
  // day/time picker lives in the modal, so we only need the earliest here.
  const nextFree: Date | null = React.useMemo(
    () => computeNextFreeStart(availability, busySlots, sessionMin),
    [availability, busySlots, sessionMin],
  )

  return (
    <aside className="lg:sticky lg:top-[80px]">
      <div className="bg-white rounded-card border border-ink-200 shadow-card overflow-hidden">

        {/* Price + mode toggle */}
        <div className="px-6 pt-6 pb-5 border-b border-ink-100">
          {/* Honest popularity signal — derived from real completed sessions,
              not a fabricated "N bookings in 48h" figure. */}
          {sessionsCount >= 100 && (
            <div className="mb-3 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill bg-brand-50 text-brand-700 font-display text-[11px] font-semibold">
              <Icon.spark className="w-3 h-3" />
              პოპულარული · {sessionsCount} სესია ჩატარდა
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[34px] font-bold text-ink-900 tabular-nums leading-none tracking-tight">{priceLabel}</span>
            <span className="text-[13px] text-ink-500">{subLabel}</span>
          </div>

          {/* Stat-trio — Preply-signature. Stays visible on scroll (the card is
              sticky), so the trust numbers travel with the CTA. Real data only;
              cells with no value are dropped. */}
          {(rating > 0 || sessionsCount > 0 || responseHours > 0) && (
            <div className="mt-4 flex items-stretch rounded-card border border-ink-100 bg-ink-50/50 divide-x divide-ink-100 overflow-hidden">
              {rating > 0 && (
                <div className="flex-1 px-2 py-2.5 text-center">
                  <div className="font-display text-[15px] font-bold text-ink-900 tabular-nums leading-none inline-flex items-center gap-1">
                    <Icon.star className="w-3 h-3 text-warning-500" />{rating.toFixed(1)}
                  </div>
                  <div className="mt-1 text-[10px] text-ink-500 tabular-nums">{reviewsCount > 0 ? `${reviewsCount} შეფასება` : 'რეიტინგი'}</div>
                </div>
              )}
              {sessionsCount > 0 && (
                <div className="flex-1 px-2 py-2.5 text-center">
                  <div className="font-display text-[15px] font-bold text-ink-900 tabular-nums leading-none">{sessionsCount}</div>
                  <div className="mt-1 text-[10px] text-ink-500">სესია</div>
                </div>
              )}
              {responseHours > 0 && (
                <div className="flex-1 px-2 py-2.5 text-center">
                  <div className="font-display text-[15px] font-bold text-ink-900 tabular-nums leading-none">&lt;{responseHours}სთ</div>
                  <div className="mt-1 text-[10px] text-ink-500">პასუხი</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Availability hint + open-in-popup CTA. The full day/time picker lives
            inside the booking modal (opens on click) — the whole flow is one
            popup instead of an inline sidebar picker. */}
        <div className="px-6 pt-5 pb-4">
          {nextFree === null ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-3 py-4 text-center text-[12px] text-ink-500 mb-4">
              ექსპერტს ჯერ არ აქვს გამოცხადებული სლოტები.
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-[12.5px] text-ink-700 mb-4">
              <span className="w-7 h-7 rounded-full bg-brand-50 inline-flex items-center justify-center shrink-0">
                <Icon.cal className="w-3.5 h-3.5 text-brand-600" />
              </span>
              <span className="leading-snug">უახლოესი დრო: <span className="font-display font-bold text-ink-900">{DAY_NAMES_FULL[isoWeekday(nextFree)]}, {nextFree.getDate()} {KA_MONTHS_FULL[nextFree.getMonth()]}</span></span>
            </div>
          )}
          <button
            type="button"
            disabled={nextFree === null}
            onClick={onOpen}
            className="w-full h-12 rounded-btn bg-gradient-cta hover:brightness-105 disabled:bg-none disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-all shadow-brand-glow disabled:shadow-none"
          >
            {signedIn === false ? 'შესვლა და დაჯავშნა' : 'დაჯავშნე'} <Icon.arrow className="w-4 h-4" />
          </button>
          {/* Decision-point reassurance: what happens next + the cancel safety
              net — the two questions users ask right before clicking. */}
          <p className="mt-2.5 text-[11px] text-ink-500 text-center leading-snug">
            შემდეგ ეტაპზე აირჩევ ზუსტ დროს · გაუქმება უფასოა სესიამდე 24 სთ-ით ადრე
          </p>
        </div>

        {/* Bottom strip */}
        <div className="border-t border-ink-100 px-6 py-3 flex items-center justify-between gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-ink-600">
            <Icon.clock className="w-3 h-3 text-ink-400" />
            რეაგ. ~ {responseHours} სთ
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-600">
            <Icon.shield className="w-3 h-3 text-ink-400" />
            {PAYMENTS_LIVE ? 'Escrow დაცული' : 'უფასო დაჯავშნა'}
          </span>
        </div>
      </div>

    </aside>
  )
}

type BookingMode = 'paid'

const WEEK_HEADERS = ['ორშ', 'სამშ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვ']
const DAY_NAMES_FULL = ['ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი', 'კვირა']
const DAY_SHORT = ['ორშ.', 'სამშ.', 'ოთხ.', 'ხუთ.', 'პარ.', 'შაბ.', 'კვ.']
const KA_MONTHS_FULL = ['იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი','ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი']
const KA_MONTHS_SHORT = ['იან.','თებ.','მარტ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექტ.','ოქტ.','ნოე.','დეკ.']

// isoWeekday: Mon=0..Sun=6 (so it maps to WEEK_HEADERS index)
const isoWeekday = (d: Date) => (d.getDay() + 6) % 7
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export type ApiSlot = { id: string; startAt: string; endAt: string; booked: boolean }
type BusyInput = { startAt: string; endAt: string }[]
type TimeChoice = { start: Date; end: Date; taken: boolean }

// Group availability into per-day buckets (local time).
const groupSlotsByDay = (avail: ApiSlot[]): Map<string, ApiSlot[]> => {
  const map = new Map<string, ApiSlot[]>()
  for (const s of avail) {
    const start = new Date(s.startAt)
    const key = dayKey(start)
    const arr = map.get(key) ?? []
    arr.push(s)
    map.set(key, arr)
  }
  return map
}

// Enumerate the bookable start times on a given date for a given duration,
// stepping by `duration` within each availability slot that falls on that day.
// A time is "taken" if it overlaps any busy booking OR falls inside a
// booked availability slot.
const enumerateTimes = (
  date: Date,
  avail: ApiSlot[],
  busy: BusyInput,
  durationMin: number,
): TimeChoice[] => {
  const out: TimeChoice[] = []
  const now = Date.now()
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
  const busyMs = busy.map(b => ({ s: new Date(b.startAt).getTime(), e: new Date(b.endAt).getTime() }))

  const daySlots = avail.filter(s => sameDay(new Date(s.startAt), date))
  for (const slot of daySlots) {
    const slotStart = new Date(slot.startAt).getTime()
    const slotEnd = new Date(slot.endAt).getTime()
    // Step by duration, staying within the availability window and this day.
    for (let t = slotStart; t + durationMin * 60_000 <= Math.min(slotEnd, dayEnd.getTime()); t += durationMin * 60_000) {
      const start = new Date(t)
      const end = new Date(t + durationMin * 60_000)
      // Skip past times.
      if (end.getTime() < now) continue
      const overlaps = slot.booked || busyMs.some(b => b.s < end.getTime() && b.e > t)
      out.push({ start, end, taken: overlaps })
    }
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return out
}

// Earliest actually-bookable start across every published slot — runs the SAME
// enumeration the modal's picker uses (slot.booked + busy-overlap aware), so a
// "next available" hint can never advertise a time the modal then shows as
// taken. Returns null when nothing is bookable.
const computeNextFreeStart = (
  avail: ApiSlot[],
  busy: BusyInput,
  durationMin: number,
): Date | null => {
  const dayMap = new Map<string, Date>()
  for (const s of avail) {
    const day = startOfDay(new Date(s.startAt))
    const k = dayKey(day)
    if (!dayMap.has(k)) dayMap.set(k, day)
  }
  const days = Array.from(dayMap.values()).sort((a, b) => a.getTime() - b.getTime())
  for (const day of days) {
    const free = enumerateTimes(day, avail, busy, durationMin).find(t => !t.taken)
    if (free) return free.start
  }
  return null
}

const Calendar = ({
  viewMonth,
  selected,
  slotsByDay,
  onSelect,
  onPrev,
  onNext,
}: {
  viewMonth: Date
  selected: Date | null
  slotsByDay: Map<string, ApiSlot[]>
  onSelect: (d: Date) => void
  onPrev: () => void
  onNext: () => void
}) => {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startPad = isoWeekday(first)
  const today = startOfDay(new Date())

  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i))

  // Bound month nav so users can't scroll to arbitrary past months.
  const canPrev = new Date(year, month, 1).getTime() > new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  // …and symmetric forward: no paging past the last month that still contains
  // a published slot (nothing to see there — every further page is empty).
  let lastSlotMs = 0
  for (const arr of slotsByDay.values()) {
    for (const s of arr) {
      const t = new Date(s.startAt).getTime()
      if (t > lastSlotMs) lastSlotMs = t
    }
  }
  const canNext = lastSlotMs > 0 && new Date(year, month + 1, 1).getTime() <= lastSlotMs

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="წინა თვე"
          className="w-11 h-11 rounded-btn hover:bg-ink-100 text-ink-600 inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon.chevL className="w-4 h-4" />
        </button>
        <div className="font-display text-[15px] font-bold text-ink-900 tracking-tight">{KA_MONTHS_FULL[month]} {year}</div>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="შემდეგი თვე"
          className="w-11 h-11 rounded-btn hover:bg-ink-100 text-ink-600 inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon.chevR className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEK_HEADERS.map(w => (
          <div key={w} className="text-center font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500 py-1">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="aspect-square" />
          const isToday = sameDay(d, today)
          const isSelected = selected != null && sameDay(d, selected)
          const isPast = d.getTime() < today.getTime()
          const slots = slotsByDay.get(dayKey(d))?.filter(s => !s.booked).length ?? 0
          const disabled = isPast || slots === 0
          const dots = Math.min(Math.max(Math.ceil(slots / 2), slots > 0 ? 1 : 0), 4)

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(d)}
              className={`relative aspect-square rounded-btn flex flex-col items-center justify-center font-display font-semibold transition-colors disabled:cursor-not-allowed ${
                isSelected
                  ? 'bg-brand-500 text-white'
                  : isToday
                    ? 'bg-white text-brand-800 ring-1 ring-brand-300'
                    : disabled
                      ? 'text-ink-300'
                      : 'text-ink-800 hover:bg-ink-100'
              }`}
            >
              <span className="text-[13.5px] tabular-nums leading-none">{d.getDate()}</span>
              {!disabled && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {Array.from({ length: dots }).map((_, j) => (
                    <span key={j} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/75' : 'bg-brand-400'}`} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-ink-100 space-y-2 text-[11px] text-ink-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-brand-400" />
              <span className="w-1 h-1 rounded-full bg-brand-400" />
              <span className="w-1 h-1 rounded-full bg-brand-400" />
            </span>
            <span>თავისუფალი სლოტები</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-white ring-1 ring-brand-300" />
            <span>დღეს</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon.globe className="w-3.5 h-3.5 text-ink-400" />
          <CalendarTzLabel />
        </div>
      </div>
    </div>
  )
}

const TIME_BANDS = [
  { id: 'morning',   l: 'დილა',    range: '00:00 – 12:00', from: 0,  to: 12 },
  { id: 'afternoon', l: 'დღე',     range: '12:00 – 18:00', from: 12, to: 18 },
  { id: 'evening',   l: 'საღამო',  range: '18:00 – 24:00', from: 18, to: 24 },
] as const

const fmtHM = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const DayTimeline = ({
  date,
  selected,
  onSelect,
  duration,
  price,
  timeChoices,
}: {
  date: Date
  selected: Date | null
  onSelect: (t: Date) => void
  duration: number
  price: string
  timeChoices: TimeChoice[]
}) => {
  const dayLabel = DAY_NAMES_FULL[isoWeekday(date)]
  const free = timeChoices.filter(s => !s.taken).length

  if (timeChoices.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
        <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
          <Icon.cal className="w-5 h-5" />
        </div>
        <div className="font-display text-[15px] font-bold text-ink-900">ამ დღეს ხელმისაწვდომი სლოტი არ არის</div>
        <p className="text-[13px] text-ink-500 mt-2 max-w-[280px]">აირჩიე სხვა დღე კალენდარში მარცხნივ.</p>
      </div>
    )
  }

  const bands = TIME_BANDS.map(b => ({
    ...b,
    slots: timeChoices.filter(s => {
      const h = s.start.getHours()
      return h >= b.from && h < b.to
    }),
  })).filter(b => b.slots.length > 0)

  return (
    <div>
      <div className="mb-6">
        <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-1.5">არჩეული დღე</div>
        <h3 className="font-display text-[20px] font-bold text-ink-900 tracking-tight">{dayLabel}, {date.getDate()} {KA_MONTHS_FULL[date.getMonth()]}</h3>
        <p className="text-[13px] text-ink-600 mt-1 tabular-nums">{timeChoices.length} სლოტი · {free} თავისუფალი · {timeChoices.length - free} დაჯავშნული</p>
      </div>

      <div className="space-y-6">
        {bands.map(b => {
          const bandFree = b.slots.filter(s => !s.taken).length
          return (
            <div key={b.id}>
              <div className="flex items-baseline justify-between mb-2.5">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-display text-[14px] font-bold text-ink-900 tracking-tight">{b.l}</span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-500">{b.range}</span>
                </div>
                <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700 tabular-nums">{bandFree} თავისუფალი</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {b.slots.map((s, i) => {
                  const active = selected != null && s.start.getTime() === selected.getTime() && !s.taken
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={s.taken}
                      onClick={() => onSelect(s.start)}
                      className={`p-3 rounded-card text-left border transition-all disabled:cursor-not-allowed motion-safe:active:scale-[0.98] ${
                        s.taken
                          ? 'border-ink-200 bg-ink-50/60'
                          : active
                            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                            : 'border-ink-200 bg-white hover:border-brand-400 hover:bg-brand-50/40'
                      }`}
                    >
                      <div className={`font-display text-[14px] font-bold tabular-nums tracking-tight ${s.taken ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{fmtHM(s.start)} – {fmtHM(s.end)}</div>
                      <div className="text-[11.5px] mt-0.5">
                        {s.taken ? (
                          <span className="text-ink-400 font-display font-medium">დაჯავშნული</span>
                        ) : active ? (
                          <span className="text-brand-700 font-display font-semibold">არჩეული · {duration} წუთი</span>
                        ) : (
                          <span className="text-ink-600 tabular-nums">{duration} წთ · {price}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const Steps = ({ step, total }: { step: number; total: number }) => {
  const all = [
    { n: 1, l: 'დრო' },
    { n: 2, l: 'დეტალები' },
    { n: 3, l: 'გადახდა' },
  ]
  const items = all.slice(0, total)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {items.map((s, i) => {
        const done = step > s.n
        const active = step === s.n
        return (
          <React.Fragment key={s.n}>
            <div className={`inline-flex items-center gap-1.5 ${active ? 'text-brand-700' : done ? 'text-success-600' : 'text-ink-400'}`}>
              <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-display font-bold ${active ? 'bg-brand-500 text-white' : done ? 'bg-success-500 text-white' : 'bg-ink-100 text-ink-500'}`}>
                {done ? <Icon.check className="w-3 h-3" /> : s.n}
              </span>
              <span className="font-display text-[12px] font-semibold tracking-wide">{s.l}</span>
            </div>
            {i < items.length - 1 && <div className="w-6 h-px bg-ink-200" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ───── Step 2 — Details ───── */
// Category-agnostic starter topics — the modal serves every expert sphere
// (business, law, psychology, …), so these must read naturally for all of
// them rather than assuming a VC/startup context.
const TOPIC_OPTIONS = [
  'კონკრეტული პრობლემის განხილვა',
  'სტრატეგია და მიმართულება',
  'უკუკავშირი ჩემს გეგმაზე',
  'გადაწყვეტილების მიღება',
  'სხვა თემა',
]

type DetailsState = { topic: string; goal: string; preCall: boolean }

const Step2Details = ({ value, onChange, summary }: { value: DetailsState; onChange: (v: DetailsState) => void; summary: React.ReactNode }) => (
  <div className="grid lg:grid-cols-[1fr_280px] gap-6 sm:gap-7 lg:gap-10 p-4 sm:p-7 lg:p-10">
    <div className="space-y-7">
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <label className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">თემა</label>
          <span className="text-[11px] text-ink-500">აირჩიე ექსპერტის სერვისიდან ან „სხვა თემა"</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TOPIC_OPTIONS.map(t => {
            const on = value.topic === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...value, topic: t })}
                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-pill text-[12.5px] font-display font-medium tracking-wide transition-colors ${on ? 'bg-accent-600 text-white' : 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50'}`}
              >
                {on && <Icon.check className="w-3 h-3" />}
                {t}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">შენი ფოკუსი</label>
          <span className="text-[11px] text-ink-500 tabular-nums">{value.goal.length} / 320</span>
        </div>
        <textarea
          value={value.goal}
          onChange={e => onChange({ ...value, goal: e.target.value.slice(0, 320) })}
          rows={4}
          placeholder="მაგ. მაქვს კონკრეტული სიტუაცია და მინდა გავიგო, როგორ მივუდგე — რა ნაბიჯები და რა რისკებია."
          className="w-full px-3.5 py-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors leading-[1.5] resize-none"
        />
        <p className="mt-2 text-[11.5px] text-ink-500">რაც უფრო კონკრეტული, მით უფრო მომზადებული მოვა ექსპერტი სესიაზე.</p>
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-card border border-ink-200 bg-white p-4 hover:border-ink-300 transition-colors">
        <span className={`mt-0.5 w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors ${value.preCall ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white'}`}>
          {value.preCall && <Icon.check className="w-3 h-3 text-white" />}
        </span>
        <input type="checkbox" checked={value.preCall} onChange={e => onChange({ ...value, preCall: e.target.checked })} className="sr-only" />
        <div>
          <div className="font-display text-[13px] font-bold text-ink-900">pre-call მასალის გაგზავნა</div>
          <p className="text-[12.5px] text-ink-600 mt-0.5 leading-[1.5]">გავუგზავნი დოკუმენტებს ან სხვა მასალას ექსპერტს დასათვალიერებლად სესიამდე. დანახარჯი იგივეა.</p>
        </div>
      </label>
    </div>

    <div className="lg:sticky lg:top-0">
      {summary}
    </div>
  </div>
)

/* ───── Step 3 — Payment ───── */
type PaymentMethod = 'tbc' | 'bog' | 'solo' | 'card'

const METHODS: { id: PaymentMethod; l: string; sub: string; tone: 'ink' | 'brand' | 'accent' }[] = [
  { id: 'tbc',  l: 'TBC Pay',     sub: 'Open Banking',   tone: 'accent' },
  { id: 'bog',  l: 'BOG Pay',     sub: 'Open Banking',   tone: 'brand'  },
  { id: 'solo', l: 'SOLO',        sub: 'TBC-ის სოლო',    tone: 'ink'    },
  { id: 'card', l: 'ბარათი',      sub: 'Visa · MC · Amex', tone: 'ink'  },
]

type PaymentState = { method: PaymentMethod; cardName: string; cardNum: string; cardExp: string; cardCvv: string; save: boolean }

const Step3Payment = ({ value, onChange, summary }: { value: PaymentState; onChange: (v: PaymentState) => void; summary: React.ReactNode }) => (
  <div className="grid lg:grid-cols-[1fr_280px] gap-6 sm:gap-7 lg:gap-10 p-4 sm:p-7 lg:p-10">
    <div className="space-y-7">
      <div>
        <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-3">გადახდის მეთოდი</label>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map(m => {
            const on = value.method === m.id
            const toneCls = m.tone === 'brand' ? 'bg-brand-50 text-brand-700' : m.tone === 'accent' ? 'bg-accent-50 text-accent-700' : 'bg-ink-100 text-ink-700'
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange({ ...value, method: m.id })}
                className={`relative text-left p-3.5 rounded-card border transition-all ${on ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-200' : 'border-ink-200 bg-white hover:border-ink-400'}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-9 h-9 rounded-card font-display font-bold text-[12px] tracking-wider inline-flex items-center justify-center ${toneCls}`}>
                    {m.id === 'card' ? <Icon.cal className="w-4 h-4" /> : m.l.split(' ')[0].slice(0, 3).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-[13px] font-bold text-ink-900 truncate">{m.l}</div>
                    <div className="text-[11px] text-ink-500 truncate">{m.sub}</div>
                  </div>
                </div>
                {on && (
                  <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-brand-500 inline-flex items-center justify-center">
                    <Icon.check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {value.method === 'card' && (
        <div className="rounded-card border border-ink-200 bg-white p-5 space-y-4">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">ბარათის მონაცემები</div>
          <div>
            <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">მფლობელის სახელი</label>
            <input
              type="text"
              value={value.cardName}
              onChange={e => onChange({ ...value, cardName: e.target.value })}
              placeholder="GIORGI MELADZE"
              className="w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors uppercase tracking-wide"
            />
          </div>
          <div>
            <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">ბარათის ნომერი</label>
            <input
              type="text"
              value={value.cardNum}
              onChange={e => {
                const raw = e.target.value.replace(/\D/g, '').slice(0, 16)
                const formatted = raw.match(/.{1,4}/g)?.join(' ') ?? ''
                onChange({ ...value, cardNum: formatted })
              }}
              placeholder="0000 0000 0000 0000"
              inputMode="numeric"
              className="w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors tabular-nums tracking-wider"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">ვადა · MM/YY</label>
              <input
                type="text"
                value={value.cardExp}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, '').slice(0, 4)
                  const formatted = raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw
                  onChange({ ...value, cardExp: formatted })
                }}
                placeholder="12/28"
                inputMode="numeric"
                className="w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors tabular-nums"
              />
            </div>
            <div>
              <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">CVV</label>
              <input
                type="text"
                value={value.cardCvv}
                onChange={e => onChange({ ...value, cardCvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="•••"
                inputMode="numeric"
                className="w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors tabular-nums"
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
            <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center transition-colors ${value.save ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white'}`}>
              {value.save && <Icon.check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" checked={value.save} onChange={e => onChange({ ...value, save: e.target.checked })} className="sr-only" />
            <span className="text-[12.5px] text-ink-700">შემახსოვრე — შემდეგი ჯერ ერთი დაჭერით გადავიხდი</span>
          </label>
        </div>
      )}

      {value.method !== 'card' && (
        <div className="rounded-card border border-ink-200 bg-ink-50/40 p-5 grid grid-cols-[auto_1fr] gap-3 items-start">
          <Icon.shield className="w-4 h-4 mt-0.5 text-brand-700 shrink-0" />
          <div>
            <div className="font-display text-[13px] font-bold text-ink-900">გადახდის გაგრძელება ბანკში</div>
            <p className="text-[12.5px] text-ink-600 mt-1 leading-[1.5]">
              „გადახდა"-ს დაჭერით გადახვალ {METHODS.find(m => m.id === value.method)?.l}-ის უსაფრთხო გვერდზე ანგარიშის დასადასტურებლად. შემდეგ ავტომატურად დაბრუნდები აქ.
            </p>
          </div>
        </div>
      )}

    </div>

    <div className="lg:sticky lg:top-0">
      {summary}
    </div>
  </div>
)

/* ───── Order summary card ───── */
const OrderSummary = ({
  start,
  duration,
  topic,
  total,
  tutorName,
  tutorSpecialty,
  tutorAvatar,
  serviceTitle,
}: {
  start: Date | null
  duration: number
  topic: string
  total: string
  tutorName: string
  tutorSpecialty: string
  tutorAvatar?: string | null
  /** Title of the consultation tier the user tapped in ServicesSection —
      null for the generic flat-price flow. */
  serviceTitle?: string | null
}) => {
  const dayShort = start ? DAY_SHORT[isoWeekday(start)] : ''
  const dayLabel = start ? `${dayShort} ${start.getDate()} ${KA_MONTHS_FULL[start.getMonth()]}` : '— აირჩიე დღე'
  const timeLabel = start
    ? `${fmtHM(start)} · ${duration} წუთი`
    : '—'

  return (
    <div className="rounded-card border border-ink-200 bg-ink-50/50 p-5">
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-4">დაჯავშნის შეჯამება</div>

      <div className="flex items-center gap-3 pb-4 border-b border-ink-200">
        {tutorAvatar ? (
          <img src={tutorAvatar} alt="" width={40} height={40} className="w-10 h-10 rounded-card object-cover" />
        ) : (
          <span className="w-10 h-10 rounded-card bg-brand-100 text-brand-700 inline-flex items-center justify-center font-display font-bold text-[13px]">
            {tutorName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <div className="font-display text-[13.5px] font-bold text-ink-900 truncate">{tutorName}</div>
          <div className="text-[11.5px] text-ink-500 truncate">{tutorSpecialty}</div>
        </div>
      </div>

      <dl className="mt-4 space-y-3 text-[12.5px]">
        {serviceTitle && (
          <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
            <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">სერვისი</dt>
            <dd className="font-display font-bold text-ink-900 leading-snug">{serviceTitle}</dd>
          </div>
        )}
        <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">დღე</dt>
          <dd className="font-display font-bold text-ink-900 tabular-nums">{dayLabel}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">დრო</dt>
          <dd className="font-display font-bold text-ink-900 tabular-nums">{timeLabel}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">თემა</dt>
          <dd className="font-display font-medium text-ink-800 leading-snug">{topic || '— ჯერ არ არჩეული'}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">ფორმატი</dt>
          <dd className="font-display font-bold text-ink-900 inline-flex items-center gap-1.5">
            <Icon.video className="w-3.5 h-3.5" />
            ვიდეო · 1-on-1
          </dd>
        </div>
      </dl>

      <div className="mt-5 pt-4 border-t border-ink-200">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">ჯამი</span>
          <span className="font-display text-[22px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">{total}</span>
        </div>
      </div>

      <div className="mt-4 rounded-card bg-brand-50 border border-brand-100 p-3.5 grid grid-cols-[auto_1fr] gap-2.5 items-start">
        <Icon.shield className="w-4 h-4 mt-0.5 text-brand-700 shrink-0" />
        <div className="space-y-1">
          {PAYMENTS_LIVE ? (
            <>
              <p className="font-display text-[12px] font-bold text-brand-800 leading-snug">Escrow-ით დაცული გადახდა</p>
              <p className="text-[11.5px] text-ink-600 leading-[1.5]">
                თანხა ინახება უსაფრთხოდ და ექსპერტს გადაერიცხება მხოლოდ სესიის შემდეგ.
                თუ ექსპერტი არ გამოცხადდა — 100% ავტომატური დაბრუნება. გაუქმება უფასოა სესიამდე 24 საათით ადრე.
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-[12px] font-bold text-brand-800 leading-snug">დაჯავშნა უფასოა</p>
              <p className="text-[11.5px] text-ink-600 leading-[1.5]">
                გადახდის სისტემა მალე ჩაირთვება — ამჟამად ჯავშანი უფასოა. ექსპერტი დაგიდასტურებს მოთხოვნას; გაუქმება ნებისმიერ დროს შესაძლებელია.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type BusySlot = { startAt: string; endAt: string }
const BookingModal = ({
  open,
  onClose,
  mode,
  initialStep = 1,
  initialStart = null,
  initialTopic,
  tutorId,
  tutorPrice = TUTOR_DEFAULTS.price,
  tutorName = TUTOR_DEFAULTS.name,
  tutorSpecialty = 'კონსულტაცია',
  tutorAvatar,
  availability = [],
  busySlots = [],
  sessionMin = TUTOR_DEFAULTS.durationMin,
  service = null,
}: {
  open: boolean
  onClose: () => void
  mode: BookingMode
  initialStep?: number
  initialStart?: Date | null
  /** Pre-selected topic from ?topic= (rebook flow). Falls back to first
      TOPIC_OPTIONS entry when unset or empty. */
  initialTopic?: string | null
  tutorId?: string
  tutorPrice?: number
  tutorName?: string
  tutorSpecialty?: string
  tutorAvatar?: string | null
  availability?: ApiSlot[]
  busySlots?: BusySlot[]
  sessionMin?: number
  /** Consultation tier tapped in ServicesSection. When set, ITS minutes/price
      drive the slot enumeration + summary, and the POST carries
      consultationId so the server books the tier (its row is authoritative
      server-side). Null = the generic flat tutor price/duration flow. */
  service?: ConsultationItem | null
}) => {
  // Payments aren't live yet — skip the (fake) card step entirely. The flow is
  // just pick-time → details → confirm; the expert accepts and no charge is made.
  // Restoring the 3rd step is a one-line flip once PAYMENTS_LIVE goes true.
  const totalSteps = PAYMENTS_LIVE ? 3 : 2
  const [step, setStep] = useState<number>(initialStep)
  // Accessible-dialog plumbing: trap focus inside the panel, restore it on
  // close, close on Esc, and lock body scroll while open (mirrors ConfirmModal).
  const slotsByDay = React.useMemo(() => groupSlotsByDay(availability), [availability])
  const firstFreeDate = React.useMemo(() => {
    for (const s of availability) {
      if (s.booked) continue
      const d = new Date(s.startAt)
      if (d.getTime() > Date.now()) return d
    }
    return null
  }, [availability])
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    initialStart ? startOfDay(initialStart) : firstFreeDate ? startOfDay(firstFreeDate) : null
  )
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const anchor = initialStart ?? firstFreeDate ?? new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  })
  const [selectedStart, setSelectedStart] = useState<Date | null>(initialStart)
  // Seed topic from ?topic= when present so rebook flows land directly on
  // the previous session's topic. Free-form topics that aren't in
  // TOPIC_OPTIONS are still accepted — the Details step tolerates any string.
  const [details, setDetails] = useState<DetailsState>({
    topic: (initialTopic && initialTopic.trim()) || TOPIC_OPTIONS[0],
    goal: '',
    preCall: true,
  })
  const [payment, setPayment] = useState<PaymentState>({ method: 'tbc', cardName: '', cardNum: '', cardExp: '', cardCvv: '', save: true })
  const [submitted, setSubmitted] = useState(false)
  // Booking id from the POST response — powers the success screen's
  // "ჯავშნის ნახვა" deep link so the flow doesn't dead-end in the modal.
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitUnverified, setSubmitUnverified] = useState(false)
  const [resendingVerify, setResendingVerify] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  const resendVerify = async () => {
    if (resendingVerify) return
    setResendingVerify(true)
    setResendMsg(null)
    try {
      const meRes = await fetch('/api/me')
      const meData = await meRes.json().catch(() => ({} as any))
      const email = meData?.user?.email
      if (!email) { setResendMsg('სესია ვერ მოიძებნა.'); return }
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'verify' }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setResendMsg(data?.error === 'RATE_LIMITED' ? 'ხშირად ცდი — მოგვიანებით სცადე.' : 'გაგზავნა ვერ მოხერხდა.')
        return
      }
      setResendMsg('კოდი გაიგზავნა — შეამოწმე ინბოქსი.')
    } catch {
      setResendMsg('ქსელის შეცდომა.')
    } finally {
      setResendingVerify(false)
    }
  }

  useEffect(() => {
    if (open) {
      setStep(initialStep)
      const anchor = initialStart ?? firstFreeDate
      setSelectedDate(anchor ? startOfDay(anchor) : null)
      setSelectedStart(initialStart)
      setViewMonth(new Date((anchor ?? new Date()).getFullYear(), (anchor ?? new Date()).getMonth(), 1))
      setSubmitted(false)
      setCreatedId(null)
      setSubmitError(null)
      // Refresh the topic each time the modal opens so rebook flows always
      // land on the passed-in topic, even after a close/reopen cycle.
      if (initialTopic && initialTopic.trim()) {
        setDetails(d => ({ ...d, topic: initialTopic.trim() }))
      }
    }
  }, [open, initialStep, initialStart, firstFreeDate, initialTopic])

  // Accessible modal behavior (scroll lock, focus trap + restore, Escape)
  // now comes from the shared Sheet container.

  if (!open) return null

  // A tapped consultation tier overrides the flat defaults: its minutes drive
  // the slot enumeration step and its price is what the summary restates (the
  // server re-reads both from the Consultation row via consultationId anyway).
  const duration = service?.minutes ?? sessionMin
  // Flat, expert-set price — what the expert set is what the client pays. Kept
  // consistent with the /tutors QuickBookPopup via the shared priceForDuration
  // helper (duration is only a display label, not a multiplier).
  const priceNum = priceForDuration(service?.price ?? tutorPrice, duration)
  const price = `₾${priceNum}`
  const total = `₾${priceNum}`

  const timeChoices = selectedDate
    ? enumerateTimes(selectedDate, availability, busySlots, duration)
    : []

  const dayLabelFull = selectedStart
    ? `${DAY_SHORT[isoWeekday(selectedStart)]} ${selectedStart.getDate()} ${KA_MONTHS_FULL[selectedStart.getMonth()]}`
    : '— აირჩიე დღე'

  const submitBooking = async () => {
    if (!tutorId || submitting) return
    if (!selectedStart) {
      setSubmitError('აირჩიე კონკრეტული დრო.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitUnverified(false)
    setResendMsg(null)
    try {
      if (selectedStart.getTime() < Date.now()) {
        setSubmitError('არჩეული დრო წარსულშია. აირჩიე მომავალი დრო.')
        return
      }
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorId,
          // Booking a tapped tier: the server validates ownership and uses the
          // Consultation row's minutes/price as authoritative (undefined keys
          // are dropped by JSON.stringify, so the generic flow is unchanged).
          consultationId: service?.id,
          topic: details.topic || 'კონსულტაცია',
          studentNotes: details.goal || undefined,
          startAt: selectedStart.toISOString(),
          durationMin: duration,
          price: priceNum,
        }),
      })
      if (res.status === 401) {
        const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/tutors/${tutorId}`
        window.location.href = `/signin?redirect=${encodeURIComponent(here)}`
        return
      }
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        const code = data?.error as string | undefined
        if (code === 'EMAIL_NOT_VERIFIED') {
          setSubmitUnverified(true)
          setResendMsg(null)
          setSubmitError('დაჯავშნამდე დაადასტურე ელფოსტა.')
          return
        }
        const msg =
          code === 'SLOT_TAKEN' ? 'ეს დრო უკვე დაჯავშნილია. აირჩიე სხვა დრო.' :
          code === 'NO_AVAILABILITY' ? 'ექსპერტი ამ დროზე არ არის ხელმისაწვდომი. აირჩიე მისი გამოცხადებული სლოტიდან.' :
          code === 'PAST_DATE' ? 'არჩეული დრო წარსულშია.' :
          code === 'SELF_BOOKING' ? 'ვერ დაიჯავშნი საკუთარ თავს.' :
          code === 'TUTOR_NOT_FOUND' ? 'ექსპერტი ვერ მოიძებნა.' :
          code === 'RATE_LIMIT' ? 'ხშირად ცდი ჯავშანს — ცოტა ხანში სცადე თავიდან.' :
          code === 'INVALID' ? 'შეავსე ყველა აუცილებელი ველი.' :
          'დაჯავშნა ვერ შესრულდა. სცადე თავიდან.'
        setSubmitError(msg)
        return
      }
      setCreatedId(typeof data?.id === 'string' ? data.id : null)
      setSubmitted(true)
    } catch {
      setSubmitError('ქსელის შეცდომა. შეამოწმე კავშირი და სცადე თავიდან.')
    } finally {
      setSubmitting(false)
    }
  }

  const next = () => {
    if (step < totalSteps) setStep(step + 1)
    else {
      submitBooking()
    }
  }
  const back = () => { if (step > 1) setStep(step - 1) }

  const summary = (
    <OrderSummary
      start={selectedStart}
      duration={duration}
      topic={details.topic}
      total={total}
      tutorName={tutorName}
      tutorSpecialty={tutorSpecialty}
      tutorAvatar={tutorAvatar ?? null}
      serviceTitle={service?.title ?? null}
    />
  )

  const canAdvanceFromStep1 = selectedStart !== null

  // Gate the pay step: when the user chose the card method, require complete,
  // well-formed card details before the "pay" CTA activates. Redirect methods
  // (TBC / BOG) carry their own hosted flow, so they don't need this.
  const onPaymentStep = PAYMENTS_LIVE && step === totalSteps
  const cardValid =
    payment.method !== 'card' ||
    (payment.cardName.trim().length > 1 &&
      payment.cardNum.replace(/\s/g, '').length === 16 &&
      /^(0[1-9]|1[0-2])\/\d{2}$/.test(payment.cardExp) &&
      /^\d{3,4}$/.test(payment.cardCvv))

  const nextLabel =
    step < totalSteps
      ? step === 1
        ? 'შემდეგი — დეტალები'
        : 'შემდეგი — გადახდა'
      : PAYMENTS_LIVE
        ? `${total}-ის გადახდა`
        : 'დაჯავშნე'

  return (
    // Right-side sheet (desktop) / bottom sheet (mobile) via the shared Sheet
    // container — matches the /tutors listing's QuickBookPopup positioning so
    // the modal doesn't obscure the tutor profile the user is booking from.
    <Sheet
      open={open}
      onClose={onClose}
      variant="side"
      size="lg"
      busy={submitting}
      ariaLabel={`${tutorName} — დაჯავშნა`}
      eyebrow="სესიის დაჯავშნა"
      title={
        <>
          {/* When a service tier was tapped, name IT here — the user must see
              what they're booking from step 1 onward. */}
          <span className="text-[20px] lg:text-[22px]">{tutorName} · {service ? service.title : tutorSpecialty}</span>
          <div className="mt-4 font-sans font-normal tracking-normal">
            <Steps step={step} total={totalSteps} />
          </div>
        </>
      }
      footer={!submitted ? (
        <div className="w-full flex flex-col gap-3">
          {submitError && (
            <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12.5px] font-medium">
              {submitUnverified ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>დაჯავშნამდე დაადასტურე ელფოსტა</span>
                  <span>·</span>
                  <a href="/settings" className="underline font-semibold hover:text-danger-900">ბმული ვერიფიკაციაზე</a>
                  <button
                    type="button"
                    onClick={resendVerify}
                    disabled={resendingVerify}
                    className="ml-auto h-7 px-2 rounded-btn bg-white border border-danger-200 hover:border-danger-300 disabled:opacity-50 text-danger-700 font-display font-semibold text-[11.5px] transition-colors"
                  >
                    {resendingVerify ? 'იგზავნება…' : 'კოდის ხელახლა გაგზავნა'}
                  </button>
                  {resendMsg && <div className="w-full text-[11.5px] text-danger-700 mt-0.5">{resendMsg}</div>}
                </div>
              ) : submitError}
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="text-[13px]">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">არჩეული</div>
              <div className="font-display font-bold text-ink-900 mt-0.5">
                {selectedStart
                  ? <>{service ? `${service.title} · ` : ''}{dayLabelFull} · {fmtHM(selectedStart)} · <span className="tabular-nums">{duration}</span> წუთი · <span className="tabular-nums">{price}</span></>
                  : service
                    ? <>{service.title} · <span className="font-medium text-ink-500">აირჩიე დრო</span></>
                    : '— აირჩიე დრო'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {step > 1 ? (
                <button type="button" onClick={back} disabled={submitting} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <Icon.chevL className="w-3.5 h-3.5" />
                  უკან
                </button>
              ) : (
                <button type="button" onClick={onClose} disabled={submitting} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display font-semibold text-[13px] tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  გაუქმება
                </button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={submitting || (step === 1 && !canAdvanceFromStep1) || (onPaymentStep && !cardValid)}
                aria-busy={submitting}
                className="h-11 px-5 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(21,154,130,0.36)] transition-all duration-fast disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {submitting ? (
                  <>
                    <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent motion-safe:animate-spin" />
                    იგზავნება…
                  </>
                ) : (
                  <>
                    {nextLabel}
                    <Icon.arrow className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : undefined}
    >
        {/* Body — full-bleed inside Sheet's padded scroll area */}
        <div className="-mx-5 sm:-mx-6 -my-4">
          {submitted ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-7 py-14">
              <div className="relative w-20 h-20 rounded-full bg-success-100 inline-flex items-center justify-center text-success-700 mb-6 motion-safe:animate-scale-in">
                <span aria-hidden className="absolute inset-0 rounded-full bg-success-500/20 motion-safe:animate-pulse-soft" />
                <span aria-hidden className="absolute -inset-2 rounded-full border-2 border-success-200 motion-safe:animate-pulse-soft" />
                <Icon.check className="relative w-10 h-10" />
              </div>
              <h3 className="font-display text-[26px] font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '120ms' }}>
                დაჯავშნა გაიგზავნა
              </h3>
              <p className="text-[14px] text-ink-600 mt-3 max-w-[440px] leading-[1.55] motion-safe:animate-rise-in" style={{ animationDelay: '200ms' }}>
                {dayLabelFull}{selectedStart ? ` · ${fmtHM(selectedStart)}` : ''} · {total} · {tutorName}. ექსპერტი დაადასტურებს ჯავშანს — შემდეგ გაიგზავნება ვიდეო-ლინკი და ეს გამოჩნდება „ჩემი ჯავშნების" გვერდზე.
              </p>
              {/* Primary action leads to the created booking — closing into the
                  profile was a dead end. Plain close stays as the secondary. */}
              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-2 motion-safe:animate-rise-in" style={{ animationDelay: '280ms' }}>
                <Link
                  href={createdId ? `/student/bookings/${createdId}` : '/student/bookings'}
                  className="h-11 px-6 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(21,154,130,0.36)] transition-all duration-fast"
                >
                  ჯავშნის ნახვა <Icon.arrow className="w-4 h-4" />
                </Link>
                <button type="button" onClick={onClose} className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[13px] tracking-wide transition-colors">
                  დახურვა
                </button>
              </div>
            </div>
          ) : step === 1 ? (
            <div className="grid lg:grid-cols-[360px_1fr] h-full">
              <div className="border-b lg:border-b-0 lg:border-r border-ink-100 p-4 sm:p-6 overflow-y-auto">
                <Calendar
                  viewMonth={viewMonth}
                  selected={selectedDate}
                  slotsByDay={slotsByDay}
                  onSelect={(d) => { setSelectedDate(d); setSelectedStart(null) }}
                  onPrev={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  onNext={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                />
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto">
                {selectedDate ? (
                  <DayTimeline
                    date={selectedDate}
                    selected={selectedStart}
                    onSelect={(t) => { setSelectedStart(t); if (submitError) setSubmitError(null) }}
                    duration={duration}
                    price={price}
                    timeChoices={timeChoices}
                  />
                ) : availability.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
                    <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
                      <Icon.cal className="w-5 h-5" />
                    </div>
                    <div className="font-display text-[15px] font-bold text-ink-900">
                      ექსპერტს ჯერ არ აქვს გამოცხადებული სლოტები
                    </div>
                    <p className="text-[13px] text-ink-500 mt-2 max-w-[320px]">
                      მიწერე პირდაპირ — ექსპერტი ხშირად ხსნის ინდივიდუალურ დროს კონკრეტული მოთხოვნით.
                    </p>
                    <div className="mt-5 flex flex-col sm:flex-row gap-2 items-center">
                      <Link
                        href={`/signin?redirect=/tutors/${tutorId}`}
                        onClick={(e) => { e.preventDefault(); onClose(); if (tutorId) window.location.href = `/tutors/${tutorId}#contact` }}
                        className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors"
                      >
                        დაუკავშირდი ექსპერტს
                      </Link>
                      <Link
                        href="/tutors"
                        onClick={() => onClose()}
                        className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center transition-colors"
                      >
                        მსგავსი ექსპერტები
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
                    <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
                      <Icon.cal className="w-5 h-5" />
                    </div>
                    <div className="font-display text-[15px] font-bold text-ink-900">აირჩიე დღე კალენდარში</div>
                    <p className="text-[13px] text-ink-500 mt-2 max-w-[280px]">შემდეგ გამოჩნდება ხელმისაწვდომი დროები.</p>
                  </div>
                )}
              </div>
            </div>
          ) : step === 2 ? (
            <Step2Details value={details} onChange={setDetails} summary={summary} />
          ) : (
            <Step3Payment value={payment} onChange={setPayment} summary={summary} />
          )}
        </div>
    </Sheet>
  )
}

/* ───── Page ─────
   Wrapped in <Suspense> because `useSearchParams` (used inside for rebook
   query params) must be inside a Suspense boundary in Next 15. */
export default function ExpertProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <ExpertProfile />
    </Suspense>
  )
}

function ExpertProfile() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const tutorId = params?.id
  const [tutorData, setTutorData] = useState<any>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'not-found' | 'error'>('loading')
  // Bumping this refires the profile fetch — powers the error-state retry
  // button (the DB sits behind a remote proxy, so transient failures happen).
  const [loadAttempt, setLoadAttempt] = useState(0)

  // Rebook / pre-fill params from ?topic&duration&price&rebook — the
  // student/bookings/[id] "დაჯავშნე ისევ" CTA embeds these when jumping here.
  const rebookTopic = searchParams?.get('topic') ?? null
  // `duration` and `price` are accepted in the URL for future prefill hooks
  // but not yet applied — the booking modal derives duration from
  // free/paid mode and price from the tutor's rate. Reading them here keeps
  // the URL contract stable for the /student/bookings CTA.
  void searchParams?.get('duration')
  void searchParams?.get('price')
  const rebookAutoOpen = searchParams?.get('rebook') === '1'

  useEffect(() => {
    if (!tutorId) return
    setLoadState('loading')
    fetch(`/api/tutors/${tutorId}`)
      .then(async r => {
        if (r.status === 404) { setLoadState('not-found'); return null }
        if (!r.ok) { setLoadState('error'); return null }
        // Non-JSON body (proxy error page, dead dev server) must land in the
        // error branch — not throw into an uncaught rejection.
        return r.json().catch(() => { setLoadState('error'); return null })
      })
      .then(d => { if (d) { setTutorData(d); setLoadState('ok') } })
      .catch(() => setLoadState('error'))
  }, [tutorId, loadAttempt])

  // Push viewed tutor into local "recently viewed" cache (LRU, cap 5).
  useEffect(() => {
    if (!tutorData || !tutorId) return
    pushRecentTutor({
      id: tutorId,
      name: tutorData?.user?.fullName ?? 'ექსპერტი',
      avatar: tutorData?.user?.avatarUrl ?? null,
      specialty: tutorData?.specialty ?? tutorData?.category?.name ?? null,
      price: typeof tutorData?.price === 'number' ? tutorData.price : null,
    })
  }, [tutorData, tutorId])

  // Soft sign-in prompt: replaces hard redirect for anon interactions.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [authDismissed, setAuthDismissed] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me')
        if (!res.ok || cancelled) { if (!cancelled) setSignedIn(false); return }
        const body = await res.json().catch(() => ({}))
        if (!cancelled) setSignedIn(!!body?.user)
      } catch {
        if (!cancelled) setSignedIn(false)
      }
    })()
    return () => { cancelled = true }
  }, [])
  // Which flow the visitor was in when the auth gate fired. 'book' makes the
  // post-auth redirect carry ?rebook=1 so the booking modal reopens by itself.
  const [authIntent, setAuthIntent] = useState<'book' | null>(null)
  const requireAuth = React.useCallback((intent?: 'book') => {
    if (signedIn === false) {
      setAuthIntent(intent ?? null)
      setNeedsAuth(true)
      setAuthDismissed(false)
      // Deliberately NO scroll — the AuthPromptSheet opens at the point of
      // tap; yanking the user to the top of a long profile was disorienting.
      return true
    }
    return false
  }, [signedIn])

  // NB: the `loadState === 'not-found'` early-return lives BELOW, after every
  // hook. Returning here (before the useState/useEffect calls that follow)
  // changed the hook count between renders — React threw "Rendered fewer hooks
  // than expected" and the intended not-found screen crashed into the error
  // boundary. All hooks must run on every render.

  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingMode, setBookingMode] = useState<BookingMode>('paid')
  const [bookingInit, setBookingInit] = useState<{ step: number; start: Date | null }>({ step: 1, start: null })
  // Consultation tier tapped in ServicesSection — flows into BookingModal so
  // the modal books THAT tier's minutes/price (via consultationId). Null for
  // every generic CTA (sticky card, mobile bar), which books the flat default.
  const [selectedService, setSelectedService] = useState<ConsultationItem | null>(null)

  // No-op when the tutor is paused (available === false). The banner above
  // explains the state; silently swallowing the click prevents any of the
  // three booking entry points (sidebar, mobile bar, service cards) from
  // opening the modal for a tutor who's stepped out.
  const isPaused = tutorData?.available === false

  const openPaid = () => {
    if (isPaused) return
    if (requireAuth('book')) return
    setSelectedService(null)
    setBookingMode('paid'); setBookingInit({ step: 1, start: null }); setBookingOpen(true)
  }
  // Service-card entry point: same gates as openPaid, but carries the tapped
  // tier into the modal.
  const openServiceBooking = (s: ConsultationItem) => {
    if (isPaused) return
    if (requireAuth('book')) return
    setSelectedService(s)
    setBookingMode('paid'); setBookingInit({ step: 1, start: null }); setBookingOpen(true)
  }
  const continueFromSidebar = (start: Date, mode: BookingMode) => {
    if (isPaused) return
    if (requireAuth('book')) return
    setSelectedService(null)
    setBookingMode(mode)
    setBookingInit({ step: 2, start })
    setBookingOpen(true)
  }


  // Auto-open the booking modal when the caller passed ?rebook=1. Only fire
  // once — we track it with a guard state so React strict-mode double invokes
  // stay idempotent, and further modal opens/closes remain manual. Skip if
  // the tutor has paused their listing since the rebook link was generated.
  // Anonymous visitors go through requireAuth instead of straight into the
  // modal — the AuthPromptSheet's 'book' intent carries ?rebook=1 through
  // sign-in, so the flow resumes here after auth.
  const [rebookConsumed, setRebookConsumed] = useState(false)
  useEffect(() => {
    if (!rebookAutoOpen || rebookConsumed) return
    if (loadState !== 'ok') return
    if (isPaused) { setRebookConsumed(true); return }
    if (signedIn === null) return // wait for the /api/me probe to resolve
    if (requireAuth('book')) { setRebookConsumed(true); return }
    setBookingMode('paid')
    setBookingInit({ step: 1, start: null })
    setBookingOpen(true)
    setRebookConsumed(true)
  }, [rebookAutoOpen, rebookConsumed, loadState, isPaused, signedIn, requireAuth])

  // Safe now — every hook above has already run unconditionally.
  if (loadState === 'not-found') {
    return (
      <div className="font-sans bg-white text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar />
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-[480px] w-full text-center">
            <h1 className="font-display text-[22px] font-bold text-ink-900">ექსპერტი ვერ მოიძებნა</h1>
            <p className="text-[13.5px] text-ink-500 mt-2">შესაძლოა პროფილი წაიშალა ან ბმული არასწორია.</p>
            <Link href="/tutors" className="mt-6 inline-flex h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] items-center gap-2">
              ყველა ექსპერტი <Icon.arrow className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Error gate — a failed fetch must NEVER strand the user on an infinite
  // skeleton (the DB is behind a remote proxy; transient failures are real).
  // Say what happened and offer a retry.
  if (loadState === 'error') {
    return (
      <div className="font-sans bg-white text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar />
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-[480px] w-full text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-warning-50 border border-warning-200 inline-flex items-center justify-center text-warning-700 mb-5">
              <Icon.warn className="w-6 h-6" />
            </div>
            <h1 className="font-display text-[22px] font-bold text-ink-900">პროფილი ვერ ჩაიტვირთა</h1>
            <p className="text-[13.5px] text-ink-500 mt-2 leading-relaxed">დროებითი ქსელური ხარვეზია — ექსპერტის მონაცემები ვერ მოვიდა. სცადე თავიდან.</p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setLoadAttempt(a => a + 1)}
                className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors"
              >
                სცადე თავიდან
              </button>
              <Link href="/tutors" className="h-11 px-5 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[13px] tracking-wide inline-flex items-center transition-colors">
                ყველა ექსპერტი
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading gate (B1): until the fetch resolves, `tutorData` is null. Rendering
  // the full profile here used to flash "—" names, an empty SpecsGrid, a
  // ₾80/60-წთ fallback price and a DISABLED "no published slots" booking card —
  // all of which self-healed a moment later once the data arrived, so users saw
  // a jarring broken-then-fixed profile. Show a skeleton instead; only render
  // the real profile + booking UI once `loadState === 'ok'`. (`not-found` and
  // `error` are handled above; only genuine `loading` lands here.)
  if (loadState !== 'ok') {
    return (
      <div className="font-sans bg-white text-ink-900 antialiased">
        <PublicTopBar />
        <main
          id="main"
          className="max-w-[1280px] mx-auto px-6 sm:px-8 pt-4 sm:pt-7 lg:pt-9 pb-24 lg:pb-16"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="sm:mt-6 grid lg:grid-cols-[1fr_360px] gap-8 xl:gap-12 animate-pulse">
            {/* Left: hero + identity + specs placeholders */}
            <div className="min-w-0">
              <div className="rounded-card bg-ink-100 w-full aspect-[16/9] sm:aspect-[21/9]" />
              <div className="relative -mt-8 sm:-mt-12 mx-3 sm:mx-6 lg:mx-8 rounded-card bg-white border border-ink-200 shadow-card px-5 sm:px-7 pt-5 sm:pt-6 pb-6">
                <div className="-mt-12 sm:-mt-16 w-[88px] h-[88px] sm:w-[112px] sm:h-[112px] rounded-full bg-ink-100 ring-4 ring-white" />
                <div className="mt-4 space-y-3">
                  <div className="h-7 w-2/3 bg-ink-100 rounded" />
                  <div className="h-4 w-1/3 bg-ink-100 rounded" />
                  <div className="h-3 w-4/5 bg-ink-100 rounded" />
                </div>
              </div>
              <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-card bg-ink-100" />)}
              </div>
            </div>
            {/* Right: sticky booking card placeholder */}
            <div className="hidden lg:block">
              <div className="rounded-card border border-ink-200 bg-white p-6 space-y-4">
                <div className="h-9 w-1/2 bg-ink-100 rounded" />
                <div className="h-4 w-2/3 bg-ink-100 rounded" />
                <div className="h-12 w-full bg-ink-100 rounded-btn" />
              </div>
            </div>
          </div>
          <span className="sr-only">იტვირთება…</span>
        </main>
      </div>
    )
  }

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      <PublicTopBar />

      <main id="main" className="max-w-[1280px] mx-auto px-6 sm:px-8 pt-4 sm:pt-7 lg:pt-9 pb-24 lg:pb-16">
        {/* Paused-profile banner. Shown when the tutor has toggled visibility
            off on /tutor/profile — the detail page still resolves (existing
            students may have deep links) but explicit CTAs (StickyBookingCard,
            MobileBookingBar, ServicesSection) short-circuit their handlers so
            no new bookings can start. */}
        {tutorData && tutorData.available === false && (
          <div className="mb-4 sm:mb-6 rounded-card border border-warning-200 bg-warning-50 p-4 sm:p-5 flex items-start gap-3">
            <Icon.warn className="w-5 h-5 shrink-0 text-warning-700 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[14px] font-bold text-warning-800">ეს ექსპერტი დროებით პაუზაზეა</div>
              <p className="text-[12.5px] text-warning-800/85 mt-1 leading-snug">ახლიდან ჯავშანი დროებით შეჩერებულია. თუ უკვე გქონდა დაჯავშნილი სესია — ის აქტიური რჩება და მიმოწერითაც შეგიძლია მიუწერო.</p>
            </div>
          </div>
        )}
        <div className="hidden sm:block">
          <Breadcrumb tutor={tutorData} />
        </div>

        <div className="sm:mt-6 grid lg:grid-cols-[1fr_360px] gap-8 xl:gap-12">

          {/* Left: scrollable content */}
          <div className="min-w-0">
            <VideoHero tutorId={tutorId} tutor={tutorData} requireAuth={requireAuth} />

            <SpecsGrid tutor={tutorData} />

            <AboutSection tutor={tutorData} />
            {/* Consultation tiers. Rendered again (they were hidden while the
                modal ignored per-tier prices): a tapped card now flows into
                BookingModal, which enumerates slots by the tier's minutes,
                restates ITS price and sends consultationId — the server books
                the Consultation row's authoritative minutes/price. */}
            <ServicesSection consultations={tutorData?.consultations ?? []} onBook={openServiceBooking} />
            <ExperienceSection items={tutorData?.experience ?? []} />
            <EducationSection items={tutorData?.education ?? []} />
            <CertificatesSection items={tutorData?.certificates ?? []} />
            <Reviews
              reviews={tutorData?.reviews ?? []}
              rating={tutorData?.rating ?? 0}
              total={tutorData?.reviewsCount ?? 0}
              verified={!!tutorData?.verified}
            />
            <SimilarExperts
              excludeId={tutorId}
              categorySlug={tutorData?.category?.slug ?? null}
              categoryName={tutorData?.category?.name ?? null}
            />
          </div>

          {/* Right: sticky booking — desktop only */}
          <div className="hidden lg:block">
            <StickyBookingCard
              onOpen={openPaid}
              availability={tutorData?.availability ?? []}
              busySlots={tutorData?.busySlots ?? []}
              tutorPrice={tutorData?.price ?? TUTOR_DEFAULTS.price}
              sessionMin={tutorData?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin}
              responseHours={tutorData?.responseHours ?? TUTOR_DEFAULTS.responseHours}
              sessionsCount={tutorData?.sessionsCount ?? 0}
              rating={tutorData?.rating ?? 0}
              reviewsCount={tutorData?.reviewsCount ?? 0}
              signedIn={signedIn}
            />
          </div>
        </div>
      </main>

      <SharedFooter />

      {/* Mobile sticky bottom booking */}
      <MobileBookingBar
        onBook={openPaid}
        price={tutorData?.price ?? TUTOR_DEFAULTS.price}
        responseHours={tutorData?.responseHours ?? TUTOR_DEFAULTS.responseHours}
        sessionMin={tutorData?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin}
        signedIn={signedIn}
        paused={isPaused}
        availability={tutorData?.availability ?? []}
        busySlots={tutorData?.busySlots ?? []}
      />

      {/* Point-of-tap auth prompt — replaces the old top-of-page banner. */}
      {needsAuth && !authDismissed && signedIn === false && (
        <AuthPromptSheet
          tutorId={tutorId}
          intent={authIntent}
          onDismiss={() => setAuthDismissed(true)}
        />
      )}

      <BookingModal
        open={bookingOpen}
        // Closing drops the tapped tier too — the next generic open must not
        // silently rebook the previous service.
        onClose={() => { setBookingOpen(false); setSelectedService(null) }}
        mode={bookingMode}
        initialStep={bookingInit.step}
        initialStart={bookingInit.start}
        initialTopic={rebookTopic}
        tutorId={tutorId}
        tutorPrice={tutorData?.price ?? TUTOR_DEFAULTS.price}
        tutorName={tutorData?.user?.fullName ?? TUTOR_DEFAULTS.name}
        tutorSpecialty={tutorData?.specialty ?? 'კონსულტაცია'}
        tutorAvatar={tutorData?.user?.avatarUrl ?? null}
        availability={tutorData?.availability ?? []}
        busySlots={tutorData?.busySlots ?? []}
        sessionMin={tutorData?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin}
        service={selectedService}
      />
    </div>
  )
}


