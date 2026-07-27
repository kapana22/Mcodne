'use client'
import React, { useState, useEffect, useRef, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicTopBar } from '@/components/PublicTopBar'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Footer as SharedFooter } from '@/components/Footer'
import { useToast } from '@/components/ToastProvider'
import { copyToClipboard } from '@/lib/clipboard'
import { safeHttpUrl } from '@/lib/safeUrl'
import { langLabel, toLangCode } from '@/lib/languages'
import { useMe, fetchMe, type Me as PublicMe } from '@/lib/me'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { RISK_REVERSAL_LINE } from '@/lib/copy'
import { fmtRating } from '@/lib/fmt'
import { fmtKaDate, KA_MONTHS_LONG as KA_MONTHS_FULL } from '@/lib/kaDate'
import { CountUp } from '@/components/CountUp'
import { Sheet } from '@/components/Sheet'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
// Shared booking flow (DESIGN_FIX_PROMPT 1.1) — the ONE implementation, also
// used by the /tutors listing. The slot math, tz labels and defaults that used
// to live in this file are imported from components/booking now.
// mapTutorPayload is a tiny pure mapper (used eagerly to memoize tutorInfo), so
// import it statically from its own module. BookingFlow — the heavy calendar /
// date-picker subtree — only mounts after a "book" click, so lazy-load it.
import { mapTutorPayload } from '@/components/booking/mapTutorPayload'
const BookingFlow = dynamic(
  () => import('@/components/booking/BookingFlow').then(m => m.BookingFlow),
  { ssr: false },
)
import { InlineAvailability } from '@/components/booking/InlineAvailability'
import {
  TUTOR_DEFAULTS, priceForDuration, fromPriceLabel, computeNextFreeStart, previewServiceMin,
  isoWeekday, DAY_NAMES_FULL,
  type ApiSlot, type BusySlot, type ConsultationItem,
} from '@/components/booking/slots'


const Logo = () => (
  <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
  </Link>
)

// Canon: ONE icon source (components/Icon) — the check used to be a page-local
// svg. The glyph never drops below the 12px icon floor, even on the compact
// 16px badge the certificate chips use.
const VerifiedMark = ({ size = 20, title = 'გადამოწმებული ექსპერტი' }: { size?: number; title?: string }) => {
  const glyph = Math.max(12, Math.round(size * 0.6))
  return (
    <span title={title} className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white shrink-0" style={{ width: size, height: size }}>
      <Icon.check style={{ width: glyph, height: glyph }} />
    </span>
  )
}

/* Local TopBar was orphan (never rendered) — page uses <PublicTopBar initialUser={initialUser} /> instead. Removed. */

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
  linkedinUrl?: string | null
  websiteUrl?: string | null
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

// Same vocabulary as the browse cards (lib/languages) — this used to be a private
// abbreviation map („ქარ"/„ENG"), so the SAME expert read differently here than on
// their card, and any code outside ka/en/ru/tr rendered raw („DE").
const toLangLabel = (v: string): string => langLabel(toLangCode(v) ?? v)

// Experts enter LinkedIn/website with or without a scheme ("linkedin.com/in/x").
// Prepend https:// when missing, then run the safe-scheme guard so a
// javascript:/data: value can never become a live href.
function normExternalUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  const t = u.trim()
  if (!t) return undefined
  return safeHttpUrl(/^https?:\/\//i.test(t) ? t : `https://${t}`)
}

/* priceForDuration + TUTOR_DEFAULTS moved to components/booking/slots.ts —
   the old "MUST stay identical to app/tutors/page.tsx" twin blocks are now a
   single import on both surfaces. Covered by tests/tutor-mapping.test.ts. */

/* ───── Video hero — cover moment with overlapping avatar ───── */
const VideoHero = ({ tutorId, tutor, requireAuth, viewerCantFav = false }: { tutorId?: string; tutor: TutorDetail | null; requireAuth?: () => boolean; viewerCantFav?: boolean }) => {
  const [saved, setSaved] = useState(false)
  const [savedBusy, setSavedBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [favConsumed, setFavConsumed] = useState(false)
  const favSearchParams = useSearchParams()
  const { toast } = useToast()
  const shareTutorLink = async () => {
    if (!tutorId) return
    // Same env-derived origin the server page uses for canonical/OG URLs — a
    // hardcoded prod host made a staging build copy (and toast success for) a
    // link pointing at production. Falls back to the current origin.
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '')
    const url = `${origin}/tutors/${tutorId}`
    const ok = await copyToClipboard(url)
    toast(ok ? 'ბმული დაკოპირდა' : 'ვერ დაკოპირდა', ok ? 'success' : 'error')
  }

  useEffect(() => {
    if (!tutorId) return
    let cancelled = false
    ;(async () => {
      try {
        // Shared /api/me (lib/me) — deduped with the top bar, AppShell and the
        // profile's own auth probe. /api/me is 200 even for guests (null user);
        // only probe favorites for signed-in users, else every guest visit
        // logs a 401 in the console.
        const me = await fetchMe()
        if (!me || cancelled) return
        const res = await fetch('/api/favorites')
        if (!res.ok || cancelled) return
        const rows = await res.json()
        if (Array.isArray(rows)) setSaved(rows.some((r: any) => r.tutorId === tutorId))
      } catch {}
    })()
    return () => { cancelled = true }
  }, [tutorId])

  // Resume a save that was interrupted by the auth wall: a logged-out heart tap
  // bounces to /signin?redirect=/tutors/{id}?fav=1, and on return we re-apply the
  // favorite (server upsert is idempotent) and clear the flag from the URL so a
  // refresh doesn't re-trigger it. Mirrors the ?rebook=1 / ?intent=message resume.
  useEffect(() => {
    if (favConsumed || !tutorId || favSearchParams?.get('fav') !== '1') return
    let cancelled = false
    ;(async () => {
      const me = await fetchMe()
      if (cancelled || !me) { setFavConsumed(true); return }
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorId }),
        })
        if (res.ok && !cancelled) { setSaved(true); toast('შენახულია', 'success') }
      } catch {}
      if (!cancelled) setFavConsumed(true)
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href)
        u.searchParams.delete('fav')
        window.history.replaceState(null, '', u.pathname + u.search)
      }
    })()
    return () => { cancelled = true }
  }, [favConsumed, tutorId, favSearchParams, toast])

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
          // Carry a ?fav=1 resume flag so the save re-applies itself after auth
          // (same pattern as ?rebook=1 / ?intent=message) — otherwise the heart
          // silently drops and the user has to click it again.
          window.location.href = `/signin?redirect=${encodeURIComponent(`/tutors/${tutorId}?fav=1`)}`
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
  // rows may still carry a hosted file URL from the old upload path; those
  // render via <video> until the tutor swaps in a link. (Raw `data:video/…`
  // blobs never reach the client — the SSR seed and /api/tutors/[id] both null
  // them — so the legacy branch only ever sees a plain URL.)
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

  // Legacy hosted video (pre-YouTube rows) — scheme-guarded like the profile's
  // external links, so a stored `javascript:`/`data:text` value can never
  // become a live media src. An unsafe value is treated as „no video".
  const legacyVideoSrc = ytId ? undefined : normExternalUrl(tutor?.videoUrl)
  const hasVideo = !!ytId || !!legacyVideoSrc

  return (
    <div>
      {/* Intro video — rendered ONLY when the expert actually has one.
          The old „no video" branch drew a decorative cover (gradient-dark +
          blurred blobs) carrying glassy chips; every fact on it — rating,
          sessions, response time, headline — is repeated verbatim in the
          identity card below, so it was pure filler and it looked it. Nothing
          replaces it: the identity card simply starts the profile.
          When a video DOES exist it now stands on its own instead of acting as
          a backdrop — the identity card used to overlap it by 32/48px, which
          cropped the thumbnail and covered YouTube's control bar the moment
          playback started. A quiet caption bar names it in every branch (the
          old „ვიდეოგაცნობა" chip only showed on the un-played YouTube poster). */}
      {hasVideo && (
        <figure className="rounded-card overflow-hidden border border-ink-200 bg-white motion-safe:animate-scale-in">
          {ytId ? (
            playing ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1&autoplay=1`}
                title="ვიდეოგაცნობა"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="block w-full aspect-[16/9] sm:aspect-[21/9] border-0 bg-black"
              />
            ) : (
              // Click-to-load facade — a raw autoplaying embed rendered as a black
              // box before playback (looked broken); Preply shows a poster + play
              // button. This also defers the heavy YouTube iframe until intent.
              <button type="button" onClick={() => setPlaying(true)} aria-label="ჩართე ვიდეოგაცნობა" className="group w-full aspect-[16/9] sm:aspect-[21/9] relative block bg-ink-900 overflow-hidden">
                <img src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-slow" loading="lazy" />
                {/* Flat scrim, not an ad-hoc from-/to- gradient (canon allows only
                    the four named tokens) — it only has to lift the play button
                    off a bright thumbnail. */}
                <span aria-hidden className="absolute inset-0 bg-ink-950/25" />
                <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                  <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 shadow-float inline-flex items-center justify-center group-hover:scale-110 group-hover:bg-white transition-all duration-fast">
                    <Icon.play className="w-7 h-7 sm:w-8 sm:h-8 text-brand-600 translate-x-0.5" />
                  </span>
                </span>
              </button>
            )
          ) : (
            <video
              src={legacyVideoSrc}
              controls
              playsInline
              poster={tutor?.user.avatarUrl ?? undefined}
              className="block w-full aspect-[16/9] sm:aspect-[21/9] object-cover bg-black"
            />
          )}
          {/* Caption bar — the canon eyebrow, always visible (incl. while the
              embed plays), so the block reads as a named feature. */}
          <figcaption className="h-10 px-4 sm:px-5 border-t border-ink-200 flex items-center gap-2">
            <Icon.video className="w-3.5 h-3.5 text-ink-500 shrink-0" />
            <Eyebrow as="span">ვიდეოგაცნობა</Eyebrow>
          </figcaption>
        </figure>
      )}

      {/* Identity card — a plain card, flush with the column. It no longer
          climbs over the block above (see the note on the video): with no
          video there is nothing to climb over, and with one the overlap hid
          the player's controls. */}
      <div className={`relative rounded-card bg-white border border-ink-200 shadow-card px-5 sm:px-7 pt-5 sm:pt-6 pb-6 ${hasVideo ? 'mt-4' : ''}`}>
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-[88px] h-[88px] sm:w-[112px] sm:h-[112px] rounded-full overflow-hidden bg-brand-100 ring-1 ring-ink-100 inline-flex items-center justify-center">
              <img
                src={tutor?.user.avatarUrl || DEFAULT_AVATAR}
                alt={tutor?.user.fullName ?? ''}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Actions top-right */}
          <div className="ml-auto shrink-0 flex items-center gap-1.5">
            {/* Save/favorite is client-only (server 403s non-students) — hidden for tutor/admin. */}
            {!viewerCantFav && (
            <button
              type="button"
              onClick={toggleSave}
              disabled={savedBusy}
              aria-label={saved ? 'შენახული' : 'შენახვა'}
              className={`w-11 h-11 rounded-full border inline-flex items-center justify-center transition-colors disabled:opacity-60 ${saved ? 'border-danger-300 bg-danger-50 text-danger-600' : 'border-ink-200 bg-white hover:border-ink-300 text-ink-600'}`}
            >
              {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
            </button>
            )}
            <button
              type="button"
              onClick={shareTutorLink}
              aria-label="ბმულის კოპირება"
              title="დააკოპირე ბმული"
              className="h-11 px-3.5 rounded-pill border border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 text-ink-700 inline-flex items-center gap-1.5 font-display text-[12px] sm:text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              {/* Chain-link glyph: components/Icon has no link icon (`Icon.share`
                  is the screen-share monitor from the video-call cluster), so
                  this one stays local — drawn with the canon stroke family and
                  above the 12px icon floor. */}
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

          {/* Meta row — separated by gap only. The old „•" spans were both
              banned by canon (no status dots) and orphaned: each one rendered
              after its own fact, so an expert with no sessions/languages after
              it ended the row on a dangling dot. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {typeof tutor?.rating === 'number' && tutor.rating > 0 && (
              <div className="inline-flex items-baseline gap-1.5">
                <Icon.star className="w-3.5 h-3.5 text-warning-500 self-center" />
                <span className="font-display font-bold text-ink-900 tabular-nums text-[15px]">{fmtRating(tutor.rating)}</span>
                {typeof tutor.reviewsCount === 'number' && tutor.reviewsCount > 0 && (
                  <span className="text-ink-500 tabular-nums">· {tutor.reviewsCount}</span>
                )}
              </div>
            )}
            {typeof tutor?.sessionsCount === 'number' && tutor.sessionsCount > 0 && (
              <div className="inline-flex items-baseline gap-1.5">
                <span className="font-display font-bold text-ink-900 tabular-nums text-[15px]">{tutor.sessionsCount}</span>
                <span className="text-ink-500">სესია</span>
              </div>
            )}
            {tutor?.languages && tutor.languages.length > 0 && (
              <div className="inline-flex items-center gap-1.5 text-ink-700">
                <Icon.globe className="w-3.5 h-3.5 text-ink-500" />
                <span>{tutor.languages.map(toLangLabel).join(' · ')}</span>
              </div>
            )}
            {typeof tutor?.yearsExp === 'number' && tutor.yearsExp > 0 && (
              <div className="inline-flex items-center gap-1.5 text-ink-700">
                <span>{tutor.yearsExp} წელი</span>
              </div>
            )}
            {typeof tutor?.responseHours === 'number' && tutor.responseHours > 0 && (
              <div className="inline-flex items-center gap-1.5 text-ink-700">
                <Icon.clock className="w-3.5 h-3.5 text-ink-500" />
                <span>პასუხი &lt; {tutor.responseHours}სთ</span>
              </div>
            )}
          </div>

          {(tutor?.headline || tutor?.bio) && (
            <p className="mt-4 text-[14px] text-ink-600 leading-[1.6] max-w-[560px]">
              {tutor?.headline ?? tutor?.bio}
            </p>
          )}

          {/* External profiles the expert added on /apply — neutral link chips
              (canon: no blue). Rendered only when present + scheme-safe. */}
          {(() => {
            const li = normExternalUrl(tutor?.linkedinUrl)
            const web = normExternalUrl(tutor?.websiteUrl)
            if (!li && !web) return null
            return (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {li && (
                  <a href={li} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 hover:border-ink-300 hover:text-ink-900 font-display text-[12px] font-semibold transition-colors">
                    <Icon.external className="w-3.5 h-3.5" /> LinkedIn
                  </a>
                )}
                {web && (
                  <a href={web} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 hover:border-ink-300 hover:text-ink-900 font-display text-[12px] font-semibold transition-colors">
                    <Icon.globe className="w-3.5 h-3.5" /> ვებგვერდი
                  </a>
                )}
              </div>
            )
          })()}

          {/* Trust row — reassurance before booking. On a high-ticket, first-time
              purchase these three signals remove the biggest objections. */}
          <div className="mt-5 pt-4 border-t border-ink-100 flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-display font-medium text-ink-700">
              <Icon.check className="w-4 h-4 text-brand-600" /> ხელით შერჩეული
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-display font-medium text-ink-700">
              <Icon.shieldCheck className="w-4 h-4 text-brand-600" /> {PAYMENTS_LIVE ? 'დაცული გადახდა' : 'უფასო დაჯავშნა · გადახდები მალე'}
            </span>
            {tutor?.verified && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-display font-medium text-ink-700">
                <Icon.shieldCheck className="w-4 h-4 text-brand-600" /> ID გადამოწმებული
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
  // Expert's public reply to the review (Review.tutorResponse) — shipped by
  // /api/tutors/[id] alongside its timestamp.
  tutorResponse?: string | null
  respondedAt?: string | null
  // The API already nulls `student` for anonymous reviews; the flag is kept as
  // client-side defense so an identity never renders even if a payload slips.
  anonymous?: boolean
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

// One review card — used by both the featured block and the main list, so the
// anonymity rule and the expert-reply block can never drift between the two.
const ReviewArticle = ({ r }: { r: ReviewItem }) => {
  // Defense-in-depth: honor the anonymous flag even if a payload ever ships an
  // identity alongside it (the API already nulls `student` server-side).
  const anon = r.anonymous || !r.student
  const respondedDate = r.respondedAt ? new Date(r.respondedAt) : null
  return (
    <article className="py-6 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3 mb-3">
        {!anon && r.student?.avatarUrl ? (
          <img src={r.student.avatarUrl} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <img src={DEFAULT_AVATAR} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-[14px] font-bold text-ink-900 leading-tight truncate">{anon ? 'ანონიმური სტუდენტი' : r.student?.fullName ?? 'ანონიმური სტუდენტი'}</div>
          <div className="mt-0.5 inline-flex items-center gap-2 text-[11.5px] text-ink-500">
            <Stars n={Math.round(r.rating)} />
            <span>·</span>
            <span>{timeAgoGe(r.createdAt)}</span>
          </div>
        </div>
      </div>
      <p className="text-[14px] text-ink-700 leading-[1.6] max-w-[680px] whitespace-pre-wrap">{r.body}</p>
      {/* Expert's public reply — quoted sub-block, visually nested. */}
      {r.tutorResponse && (
        <div className="mt-4 border-l-2 border-ink-200 pl-3 max-w-[680px]">
          <div className="text-[11px] text-ink-500">
            <span className="font-display font-semibold text-ink-700">ექსპერტის პასუხი</span>
            {respondedDate && !isNaN(respondedDate.getTime()) && <span> · {fmtKaDate(respondedDate, { year: true })}</span>}
          </div>
          <p className="mt-1 text-[13px] text-ink-600 leading-[1.6] whitespace-pre-wrap">{r.tutorResponse}</p>
        </div>
      )}
    </article>
  )
}

const Reviews = ({ reviews, rating, total, verified, expertFeatured, loading = false }: { reviews: ReviewItem[]; rating: number; total: number; verified: boolean; expertFeatured: boolean; loading?: boolean }) => {
  const dist = [5, 4, 3, 2, 1].map(s => ({
    s,
    n: reviews.filter(r => Math.round(r.rating) === s).length,
  }))
  // The rating/total are SSR-seeded scalars but the review ROWS only arrive with
  // the client fetch — so between the two the histogram would draw „5★ 0 / 4★ 0…"
  // right next to a real „4.9 · 127 შეფასებიდან" and read as a fake rating.
  // No rows + a nonzero total = distribution simply not known yet.
  const distUnknown = reviews.length === 0 && total > 0
  const [showAll, setShowAll] = useState(false)
  // Outcome-rich highlights (DESIGN_FIX_PROMPT 2.5, display half): the 1–2
  // longest real ≥4★ reviews with enough substance surface above the
  // distribution chart. Heuristic only — real review bodies, never seeded.
  const featured = [...reviews]
    .filter(r => r.rating >= 4 && (r.body?.trim().length ?? 0) >= 120)
    .sort((a, b) => b.body.length - a.body.length)
    .slice(0, 2)
  const featuredIds = new Set(featured.map(r => r.id))
  const rest = reviews.filter(r => !featuredIds.has(r.id))
  const shown = showAll ? rest : rest.slice(0, 6)

  return (
    <section id="reviews" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <Eyebrow className="mb-3">შეფასებები</Eyebrow>
      <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">
        {total > 0 ? 'რას ამბობს მომხმარებელი' : 'ჯერ არ არის შეფასება'}
      </h2>

      {total === 0 ? (
        <p className="mt-3 text-[13.5px] text-ink-500 max-w-[520px]">ჯერ არავის შეუფასებია — იყავი პირველი.</p>
      ) : (
        <>
          {/* Featured outcome stories — above the star math, because on a
              marketplace where almost everyone shows ~5.0 the substance of a
              review differentiates more than the number. */}
          {featured.length > 0 && (
            <div className="mt-7 grid sm:grid-cols-2 gap-3">
              {featured.map(r => (
                <div key={r.id} className="rounded-card border border-ink-200 bg-white p-5">
                  <ReviewArticle r={r} />
                </div>
              ))}
            </div>
          )}

          <div className="mt-7 rounded-card border border-ink-200 bg-ink-50/50 p-5 sm:p-6 grid sm:grid-cols-[auto_1fr] gap-6 sm:gap-10 items-center">
            <div className="flex items-baseline gap-4 pb-5 sm:pb-0 sm:pr-8 sm:border-r border-b sm:border-b-0 border-ink-200">
              <span className="font-display text-[56px] sm:text-[64px] font-bold text-ink-900 tabular-nums leading-none tracking-tight motion-safe:animate-scale-in">
                {/* decimals=1 — same precision as fmtRating everywhere else. */}
                <CountUp value={rating} decimals={1} />
              </span>
              <div>
                <Stars n={Math.round(rating)} />
                <div className="mt-1.5 text-[12px] text-ink-500 tabular-nums">
                  <CountUp value={total} /> შეფასებიდან
                </div>
                {verified && rating >= 4.8 && expertFeatured && (
                  <Eyebrow className="mt-1">Super expert</Eyebrow>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {distUnknown ? (
                loading ? (
                  // Neutral placeholder bars — same rows/heights as the real
                  // histogram, so nothing jumps when the rows land.
                  <div className="space-y-2 animate-pulse" aria-busy="true">
                    {[5, 4, 3, 2, 1].map(s => (
                      <div key={s} className="grid grid-cols-[24px_1fr_40px] items-center gap-3">
                        <span className="h-3 rounded bg-ink-100" />
                        <span className="h-2 rounded-pill bg-ink-100" />
                        <span className="h-3 rounded bg-ink-100" />
                      </div>
                    ))}
                    <span className="sr-only">შეფასებები იტვირთება…</span>
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-500 leading-snug">შეფასებების განაწილება ვერ ჩაიტვირთა.</p>
                )
              ) : dist.map(d => {
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
                <div className="pt-1 text-[11px] text-ink-400">ბოლო {reviews.length} შეფასების მიხედვით</div>
              )}
            </div>
          </div>

          <div className="mt-10 divide-y divide-ink-100">
            {distUnknown && loading
              ? [0, 1, 2].map(i => (
                  <div key={i} className="py-6 first:pt-0 last:pb-0 animate-pulse" aria-hidden>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-ink-100 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3.5 w-32 rounded bg-ink-100" />
                        <div className="h-3 w-24 rounded bg-ink-100" />
                      </div>
                    </div>
                    <div className="h-3 w-full max-w-[680px] rounded bg-ink-100" />
                    <div className="mt-2 h-3 w-3/5 max-w-[400px] rounded bg-ink-100" />
                  </div>
                ))
              : shown.map(r => <ReviewArticle key={r.id} r={r} />)}
          </div>

          {rest.length > 6 && !showAll && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="h-11 px-5 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors"
              >
                ნახე ყველა {rest.length} შეფასება
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

/* ───── Availability load state ─────
   The server's first-paint seed (page.tsx) is deliberately PARTIAL: scalars
   only, no availability/busySlots/reviews (they're viewer-tz dependent and
   must stay client-computed). So an empty `availability` array means „not
   loaded yet" just as often as it means „no free time" — every slot-derived
   affordance takes this flag instead of guessing, otherwise a shared profile
   link spends its first second claiming the expert is unbookable. */
type SlotsState = 'pending' | 'ready' | 'failed'

/* ───── Mobile sticky booking bar ───── */
const MobileBookingBar = ({ onBook, priceLabel, priceIsFrom, sessionMin, bufferMin = 0, signedIn, paused, availability = [], busySlots = [], slotsState = 'ready', onRetrySlots, canMessage = false, onMessage, isOwnProfile = false, viewerCantBook = false }: { onBook: () => void; priceLabel: string; priceIsFrom: boolean; sessionMin: number; bufferMin?: number; signedIn?: boolean | null; paused?: boolean; availability?: ApiSlot[]; busySlots?: BusySlot[]; slotsState?: SlotsState; onRetrySlots?: () => void; canMessage?: boolean; onMessage?: () => void; isOwnProfile?: boolean; viewerCantBook?: boolean }) => {
  // Flag the body while this mobile CTA bar is mounted so the cookie banner
  // lifts above it (see globals.css) instead of covering the primary CTA.
  useEffect(() => {
    document.body.setAttribute('data-mobile-cta', '1')
    return () => document.body.removeAttribute('data-mobile-cta')
  }, [])

  // Earliest actually-bookable start → "next available" hint. Same derivation
  // the booking sheet runs (windows − bookings − service length), so the bar
  // never advertises a time the sheet then withholds. Mirrors the desktop
  // StickyBookingCard's hint.
  const nextFree = React.useMemo(
    () => computeNextFreeStart(availability, busySlots, sessionMin, { bufferMin }),
    [availability, busySlots, sessionMin, bufferMin],
  )

  // The bar has five states the button must communicate on its own —
  // the explanatory banners live far up the page on mobile:
  //   paused   → expert stepped out; booking closed
  //   pending  → slots still loading; NEVER claim „დროები არ არის" here
  //   failed   → the slot fetch broke; offer a retry, not a false negative
  //   noSlots  → live profile, but nothing bookable right now
  //   bookable → normal CTA
  const pending = !paused && slotsState === 'pending'
  const failed = !paused && slotsState === 'failed'
  const noSlots = !paused && slotsState === 'ready' && nextFree === null
  const disabled = paused || noSlots
  return (
  <div
    className="lg:hidden fixed bottom-0 left-0 right-0 z-[65] bg-white border-t border-ink-200 shadow-[0_-4px_20px_rgba(46,42,33,0.06)] motion-safe:animate-slide-in-b"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    <div className="px-4 py-3 flex items-center gap-3">
      {/* shrink-0 so the price keeps its width and the CTA never starves it
          into breaking „₾NN-დან“ at the hyphen (was a real 360px bug). */}
      <div className="min-w-0 shrink-0">
        <div className="flex items-baseline gap-1.5">
          {/* From-price when tiers differ (1.2) — the exact price is chosen at
              the flow's service step; flat experts keep the "/ N წთ" label. */}
          <span className="font-display text-[22px] font-bold text-ink-900 tabular-nums leading-none tracking-tight whitespace-nowrap">{priceLabel}</span>
          <span className="text-[11.5px] text-ink-500 whitespace-nowrap">{priceIsFrom ? '/ სესია' : `/ ${sessionMin} წთ`}</span>
        </div>
        {!disabled && nextFree && (
          <div className="mt-1 text-[11px] text-ink-500 leading-none truncate">
            უახლოესი: <span className="font-display font-semibold text-ink-800">{DAY_NAMES_FULL[isoWeekday(nextFree)]}, {nextFree.getDate()} {KA_MONTHS_FULL[nextFree.getMonth()]}</span>
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2 min-w-0">
        {/* Pre-booking message — secondary, icon-only to protect „დაჯავშნა“'s
            width on 360px. Allowed even when booking is paused. */}
        {canMessage && onMessage && (
          <button
            type="button"
            onClick={onMessage}
            aria-label="მიწერე ექსპერტს"
            title="მიწერე ექსპერტს"
            className="h-12 w-12 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700 inline-flex items-center justify-center transition-colors"
          >
            <Icon.chat className="w-5 h-5" />
          </button>
        )}
        {isOwnProfile ? (
          <Link href="/tutor/profile" className="shrink min-w-0 h-12 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors">
            <span className="truncate">პროფილის რედაქტირება</span>
          </Link>
        ) : viewerCantBook ? (
          <span className="shrink min-w-0 h-12 px-4 rounded-btn bg-ink-75 border border-ink-200 text-ink-400 font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center justify-center">
            <span className="truncate">ჯავშანი მხოლოდ სტუდენტს</span>
          </span>
        ) : pending ? (
          // Neutral placeholder at the CTA's exact size — a greyed
          // „დროები არ არის" here was simply untrue while the fetch was in
          // flight, and it is the last thing a shared link should say.
          <span className="h-12 w-[104px] shrink-0 rounded-btn bg-ink-100 motion-safe:animate-pulse" aria-busy="true">
            <span className="sr-only">თავისუფალი დროები იტვირთება…</span>
          </span>
        ) : failed ? (
          <button
            type="button"
            onClick={onRetrySlots}
            className="shrink min-w-0 h-12 px-4 rounded-btn border border-ink-200 bg-white text-ink-800 font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors hover:border-ink-300"
          >
            <Icon.refresh className="w-4 h-4" />
            <span className="truncate">სცადე თავიდან</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onBook}
            disabled={disabled}
            className="shrink min-w-0 h-12 px-4 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast disabled:bg-none disabled:bg-ink-200 disabled:text-ink-500 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {/* Guest label kept short — tapping opens the auth sheet, which
                explains the sign-in step. „შესვლა და დაჯავშნა“ overflowed 360px. */}
            <span className="truncate">{paused ? 'პაუზაზეა' : noSlots ? 'დროები არ არის' : 'დაჯავშნა'}</span>
          </button>
        )}
      </div>
    </div>
    <div className="border-t border-ink-100 px-4 py-2 flex items-center justify-center gap-4 text-[11.5px] text-ink-500">
      {paused ? (
        <span>ჯავშნები დროებით შეჩერებულია</span>
      ) : failed ? (
        <span>თავისუფალი დროები ვერ ჩაიტვირთა</span>
      ) : noSlots ? (
        <span>დრო ჯერ არ არის — მიწერე ან შეინახე ❤</span>
      ) : (
        // Canonical risk-reversal line under the CTA (shared constant).
        <span className="text-center leading-snug">{RISK_REVERSAL_LINE}</span>
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
const AuthPromptSheet = ({ tutorId, intent, onDismiss }: { tutorId: string; intent: 'book' | 'message' | null; onDismiss: () => void }) => {
  // Escape / scroll-lock / focus trap come from the Sheet container.
  const target = `/tutors/${tutorId}${intent === 'book' ? '?rebook=1' : intent === 'message' ? '?intent=message' : ''}`
  const q = `redirect=${encodeURIComponent(target)}`
  return (
    <Sheet
      open
      onClose={onDismiss}
      size="sm"
      ariaLabel="ავტორიზაცია საჭიროა"
      title={intent === 'book' ? 'შედი, რომ დაიჯავშნო' : intent === 'message' ? 'შედი, რომ მისწერო ექსპერტს' : 'შედი, რომ გააგრძელო'}
    >
        <p className="text-[13px] text-ink-600 leading-[1.55]">
          წუთში მორჩები — აქვე დაბრუნდები{intent === 'book' ? ' და ჯავშანი გაგრძელდება' : ''}.
        </p>
        <div className="mt-5 space-y-2.5">
          <Link href={`/signin?${q}`} className="w-full h-12 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow transition-all">
            შესვლა
          </Link>
          <Link href={`/signup?${q}`} className="w-full h-12 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-75 text-ink-800 font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center transition-colors">
            რეგისტრაცია
          </Link>
        </div>
        <p className="mt-4 mb-2 text-[11px] text-ink-500 text-center inline-flex items-center gap-1.5 w-full justify-center">
          <Icon.shieldCheck className="w-3 h-3 text-success-600" />
          {PAYMENTS_LIVE ? 'გადახდა დაცულია' : 'დაჯავშნა უფასოა — გადახდები მალე'}
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

  // Hide below 2: a single tile renders at 1/4 width in the 4-col grid — a
  // lonely, broken-looking row on a small/cold category.
  if (tutors === null || tutors.length < 2) return null

  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
        <div>
          <Eyebrow className="mb-3">ასევე ნახე</Eyebrow>
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
              <img src={t.avatar || DEFAULT_AVATAR} alt="" width={52} height={52} loading="lazy" decoding="async" className="w-[52px] h-[52px] rounded-full object-cover shrink-0 ring-2 ring-ink-100" />
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
                    <span className="font-display font-bold text-ink-900 tabular-nums">{fmtRating(t.rating)}</span>
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
  // `> 0`, not just `typeof === 'number'`: a brand-new expert stores 0, and the
  // old check headlined their profile with „0 ჩატარებული სესია" / „0 წ.
  // გამოცდილება". The browse card and the sticky rail both suppress zeros —
  // here the honest value is „—".
  const num = (v: number | null | undefined) => (typeof v === 'number' && v > 0 ? v : null)
  const items = [
    { n: num(tutor.sessionsCount) !== null ? String(tutor.sessionsCount) : '—', l: 'ჩატარებული სესია', icon: <Icon.video className="w-3.5 h-3.5" /> },
    { n: num(tutor.responseHours) !== null ? `~ ${tutor.responseHours} სთ` : '—', l: 'რეაგირება', icon: <Icon.clock className="w-3.5 h-3.5" /> },
    { n: num(tutor.yearsExp) !== null ? `${tutor.yearsExp} წ.` : '—', l: 'გამოცდილება', icon: <Icon.thumb className="w-3.5 h-3.5" /> },
    // Bank names must not render before the gateway is live — until then the
    // honest spec is that booking costs nothing.
    PAYMENTS_LIVE
      ? { n: 'დაცული გადახდა', l: 'TBC · BOG · SOLO', icon: <Icon.shieldCheck className="w-3.5 h-3.5" /> }
      : { n: 'უფასო', l: 'გადახდები მალე', icon: <Icon.shieldCheck className="w-3.5 h-3.5" /> },
  ]
  return (
    // Compact fact strip — these repeat identity-row facts, so on desktop they
    // act as quiet confirmation, not a second hero. Half the old height keeps
    // the About content (the real evaluation material) above the fold.
    <section className="mt-8 rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-ink-100">
        {/* `divide-x` puts a left hairline on every child but the first — in the
            2-col mobile grid that lands on cell 3, i.e. a stray line hanging off
            the strip's left edge. Cell 3 only gets its divider back at lg,
            where the row is a single 4-col line. */}
        {items.map((it, i) => (
          <div key={i} className={`px-4 py-3 sm:px-5 ${i === 0 ? 'border-l-0' : ''} ${i === 2 ? 'border-l-0 lg:border-l' : ''}`}>
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
    <section id="overview" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <Eyebrow className="mb-4">ჩემ შესახებ</Eyebrow>
      {tutor.headline && (
        <blockquote className="font-display text-[22px] lg:text-[26px] leading-[1.35] font-medium tracking-tight text-ink-800 mb-7 max-w-[640px]">
          „{tutor.headline}“
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

/* ───── Services — takes tutor.consultations from API ─────
   ConsultationItem type comes from components/booking/slots (shared with the
   booking flow's tier step). Each card's „აირჩიე“ opens the shared flow with
   that tier preselected (DESIGN_FIX_PROMPT 1.2). */
const ServicesSection = ({ consultations, onBook }: { consultations: ConsultationItem[]; onBook: (s: ConsultationItem) => void }) => {
  if (!consultations || consultations.length === 0) return null
  return (
    <section id="services" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow className="mb-3">სერვისები</Eyebrow>
          <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">როგორ დაგეხმარები</h2>
        </div>
        <span className="text-[11.5px] text-ink-500 font-display tabular-nums">{consultations.length} სერვისი · ფიქსირებული ფასი</span>
      </div>

      <div className="mt-7 grid sm:grid-cols-2 gap-3">
        {consultations.map((s, i) => (
          <article key={s.id} className="rounded-card border border-ink-200 bg-white p-5 hover:border-ink-300 hover-lift flex flex-col">
            <div className="font-display text-[11px] font-bold text-brand-700 tabular-nums mb-2">{String(i+1).padStart(2, '0')}</div>
            <h3 className="font-display text-[15px] lg:text-[16px] font-bold text-ink-900 tracking-tight leading-tight">{s.title}</h3>
            {s.description && <p className="text-[13px] text-ink-600 mt-2 leading-[1.55] flex-1">{s.description}</p>}
            <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between">
              <div>
                <Eyebrow tone="muted">{s.minutes} წუთი</Eyebrow>
                <div className="font-display text-[18px] font-bold text-ink-900 tabular-nums leading-none mt-1">₾{s.price}</div>
              </div>
              <button type="button" onClick={() => onBook(s)} className="h-11 px-4 rounded-btn bg-brand-50 hover:bg-brand-500 hover:text-white border border-brand-200 hover:border-brand-500 text-brand-700 font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1 transition-colors">
                აირჩიე
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
          <Eyebrow className="mb-3">სერტიფიკატები</Eyebrow>
          <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">დიპლომები და სერტიფიკატები</h2>
        </div>
        <span className="text-[11.5px] text-ink-500 font-display inline-flex items-center gap-1.5">
          <Icon.shieldCheck className="w-3.5 h-3.5 text-brand-600" />
          გადამოწმებული აღინიშნება
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {items.map(c => (
          <div key={c.id} className="inline-flex items-center gap-2 h-9 pl-3 pr-3.5 rounded-pill border border-ink-200 bg-white">
            <span className="font-display text-[12.5px] font-bold text-ink-900 truncate max-w-[280px]">{c.title}</span>
            <span className="text-[11px] text-ink-500 tabular-nums">· {c.issuer} · {c.year}</span>
            {c.verified && (
              // Shared VerifiedMark (Icon.check inside) — was a third page-local
              // check svg, drawn at 8px, under the canon's 12px icon floor.
              <span className="ml-0.5 inline-flex">
                <VerifiedMark size={16} title="გადამოწმებული სერტიფიკატი" />
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
      <Eyebrow className="mb-3">განათლება</Eyebrow>
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
    <section id="experience" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <Eyebrow className="mb-3">გამოცდილება</Eyebrow>
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

/* TbilisiHint / CalendarTzLabel moved to components/booking/TzLabels.tsx —
   rendered by the shared Calendar inside the booking flow + inline schedule. */

/* ───── Sticky booking card — live picker → opens modal at Details ───── */
const StickyBookingCard = ({
  onOpen,
  availability = [],
  busySlots = [],
  slotsState = 'ready',
  onRetrySlots,
  tutorPrice = TUTOR_DEFAULTS.price,
  sessionMin = TUTOR_DEFAULTS.durationMin,
  bufferMin = 0,
  responseHours = TUTOR_DEFAULTS.responseHours,
  sessionsCount = 0,
  yearsExp = 0,
  rating = 0,
  reviewsCount = 0,
  signedIn,
  consultations = [],
  canMessage = false,
  onMessage,
  isOwnProfile = false,
  viewerCantBook = false,
}: {
  onOpen: () => void
  availability?: ApiSlot[]
  busySlots?: BusySlot[]
  slotsState?: SlotsState
  onRetrySlots?: () => void
  tutorPrice?: number
  sessionMin?: number
  bufferMin?: number
  responseHours?: number
  sessionsCount?: number
  yearsExp?: number
  rating?: number
  reviewsCount?: number
  signedIn?: boolean | null
  consultations?: ConsultationItem[]
  canMessage?: boolean
  onMessage?: () => void
  isOwnProfile?: boolean
  viewerCantBook?: boolean
}) => {
  const duration = sessionMin
  // From-price when the expert's tiers differ (DESIGN_FIX_PROMPT 1.2) — the
  // exact price is chosen at the flow's service step. Flat experts keep the
  // familiar "₾N / N წუთი" pair.
  const fromPrice = fromPriceLabel(consultations, tutorPrice)
  const hasTiers = consultations.length >= 2
  const priceLabel = fromPrice.label
  const subLabel = fromPrice.isFrom ? '/ სესია' : `/ ${duration} წუთი`

  // Soonest actually-bookable start — powers the "next available" hint. Same
  // derivation the booking sheet runs, so the rail never advertises a day whose
  // windows the sheet then shows as full. The full day/time picker lives in the
  // sheet, so we only need the earliest here.
  const nextFree: Date | null = React.useMemo(
    () => computeNextFreeStart(availability, busySlots, sessionMin, { bufferMin }),
    [availability, busySlots, sessionMin, bufferMin],
  )
  // „No free time" is only honest once the slots have actually arrived — see
  // the SlotsState note. Until then the hint + CTA stay neutral.
  const pending = slotsState === 'pending'
  const failed = slotsState === 'failed'

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
              პოპულარული · {sessionsCount} სესია
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[34px] font-bold text-ink-900 tabular-nums leading-none tracking-tight">{priceLabel}</span>
            <span className="text-[13px] text-ink-500">{subLabel}</span>
          </div>

          {/* Stat-trio — Preply-signature. Stays visible on scroll (the card is
              sticky), so the trust numbers travel with the CTA. Real data only;
              cells with no value are dropped, then capped to three. For a
              brand-new expert (0 rating / 0 sessions) this otherwise collapsed to
              a lone „პასუხი" cell — so years-of-experience joins the candidates
              and fills the strip with a real credential instead of empty space.
              Priority order keeps established experts on rating·სესია·პასუხი. */}
          {(() => {
            const cells: { key: string; value: React.ReactNode; label: string }[] = []
            if (rating > 0) cells.push({ key: 'rating', value: <span className="inline-flex items-center gap-1"><Icon.star className="w-3 h-3 text-warning-500" />{fmtRating(rating)}</span>, label: reviewsCount > 0 ? `${reviewsCount} შეფასება` : 'რეიტინგი' })
            if (sessionsCount > 0) cells.push({ key: 'sessions', value: sessionsCount, label: 'სესია' })
            if (yearsExp > 0) cells.push({ key: 'years', value: yearsExp, label: 'წელი გამოცდ.' })
            if (responseHours > 0) cells.push({ key: 'resp', value: <>&lt;{responseHours}სთ</>, label: 'პასუხი' })
            const shown = cells.slice(0, 3)
            if (shown.length === 0) return null
            return (
              <div className="mt-4 flex items-stretch rounded-card border border-ink-100 bg-ink-50/50 divide-x divide-ink-100 overflow-hidden">
                {shown.map(c => (
                  <div key={c.key} className="flex-1 px-2 py-2.5 text-center">
                    <div className="font-display text-[15px] font-bold text-ink-900 tabular-nums leading-none">{c.value}</div>
                    <div className="mt-1 text-[10px] text-ink-500 tabular-nums">{c.label}</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Availability hint + open-in-popup CTA. The full day/time picker lives
            inside the booking modal (opens on click) — the whole flow is one
            popup instead of an inline sidebar picker. */}
        <div className="px-6 pt-5 pb-4">
          {pending ? (
            // Same box, no claim: the slots are still in flight.
            <div className="rounded-card border border-ink-100 bg-ink-50/40 px-3 py-4 mb-4 motion-safe:animate-pulse" aria-busy="true">
              <div className="h-3 w-2/3 mx-auto rounded bg-ink-100" />
              <span className="sr-only">თავისუფალი დროები იტვირთება…</span>
            </div>
          ) : nextFree === null ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-3 py-4 text-center text-[12px] text-ink-500 mb-4">
              {failed ? 'თავისუფალი დროები ვერ ჩაიტვირთა.' : 'ჯერ არ არის თავისუფალი დრო.'}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-[12.5px] text-ink-700 mb-4">
              <span className="w-7 h-7 rounded-full bg-brand-50 inline-flex items-center justify-center shrink-0">
                <Icon.cal className="w-3.5 h-3.5 text-brand-600" />
              </span>
              <span className="leading-snug">უახლოესი დრო: <span className="font-display font-bold text-ink-900">{DAY_NAMES_FULL[isoWeekday(nextFree)]}, {nextFree.getDate()} {KA_MONTHS_FULL[nextFree.getMonth()]}</span></span>
            </div>
          )}
          {isOwnProfile ? (
            <Link href="/tutor/profile" className="w-full h-12 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors">
              პროფილის რედაქტირება
            </Link>
          ) : viewerCantBook ? (
            <div className="w-full h-12 rounded-btn bg-ink-75 border border-ink-200 text-ink-500 font-display font-semibold text-[13px] tracking-wide inline-flex items-center justify-center">
              ჯავშანი მხოლოდ სტუდენტს
            </div>
          ) : pending ? (
            // CTA-sized neutral placeholder — the old code rendered the button
            // already DISABLED here, so the first paint of a seeded profile
            // read as „unbookable" for as long as the fetch took.
            <div className="w-full h-12 rounded-btn bg-ink-100 motion-safe:animate-pulse" aria-busy="true">
              <span className="sr-only">თავისუფალი დროები იტვირთება…</span>
            </div>
          ) : failed && nextFree === null ? (
            <Btn variant="secondary" size="lg" onClick={onRetrySlots} className="w-full">
              <Icon.refresh className="w-4 h-4" /> სცადე თავიდან
            </Btn>
          ) : (
            <button
              type="button"
              disabled={nextFree === null}
              onClick={onOpen}
              className="w-full h-12 rounded-btn bg-gradient-cta hover:brightness-105 disabled:bg-none disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-all shadow-brand-glow disabled:shadow-none"
            >
              {signedIn === false ? 'შესვლა და დაჯავშნა' : 'დაჯავშნე'}
            </button>
          )}
          {/* Pre-booking messaging — secondary to the primary booking CTA. The
              objection-handler: ask before committing to a ₾100+ session. */}
          {canMessage && onMessage && (
            <Btn variant="secondary" size="lg" onClick={onMessage} className="w-full mt-2.5">
              <Icon.chat className="w-4 h-4" /> მიწერე ექსპერტს
            </Btn>
          )}
          {/* Decision-point reassurance: what happens next + the canonical
              risk-reversal line (shared constant — one wording everywhere). */}
          <p className="mt-2.5 text-[11.5px] text-ink-500 text-center leading-snug">
            {hasTiers ? 'შემდეგ აირჩევ სერვისსა და დროს' : 'შემდეგ აირჩევ ზუსტ დროს'}
          </p>
          <p className="mt-1 text-[11.5px] text-ink-500 text-center leading-snug">{RISK_REVERSAL_LINE}</p>
        </div>

        {/* Bottom strip */}
        <div className="border-t border-ink-100 px-6 py-3 flex items-center justify-between gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-ink-600">
            <Icon.clock className="w-3 h-3 text-ink-400" />
            რეაგ. ~ {responseHours} სთ
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-600">
            <Icon.shieldCheck className="w-3 h-3 text-ink-400" />
            {PAYMENTS_LIVE ? 'დაცული გადახდა' : 'უფასო დაჯავშნა'}
          </span>
        </div>
      </div>

    </aside>
  )
}

/* Calendar / DayTimeline / Steps / intake / payment / OrderSummary /
   BookingModal moved WHOLESALE to components/booking/* (BookingFlow) —
   the shared implementation both this profile and /tutors render. */

/* ───── In-page anchor nav (DESIGN_FIX_PROMPT 1.6) ─────
   A floating pill that rises from the BOTTOM once the reader is past the hero,
   instead of the old strip stuck under the PublicTopBar — that strip stretched
   the header by another 44px on every scroll frame and made the page feel
   top-heavy. Same anchors and the same smooth scroll; it also tracks the
   section you are actually reading now.
   Bottom clearance: this page's fixed MobileBookingBar owns the mobile bottom
   edge (~121px + safe-area); BottomNav does NOT render here (it treats
   /tutors/[id] as a focused screen), so the mobile offset only has to clear
   that one bar. Sections carry scroll-mt-24 — enough for the sticky top bar
   (h-16/h-20) now that nothing else sticks under it. */
const SectionNav = ({ items, hidden = false }: { items: { id: string; l: string }[]; hidden?: boolean }) => {
  const [active, setActive] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const ids = items.map(i => i.id).join(',')

  useEffect(() => {
    const list = ids ? ids.split(',') : []
    if (list.length < 2) return
    let frame = 0
    const measure = () => {
      frame = 0
      // Reveal only after the hero (identity card + specs) has scrolled by —
      // the pill floating over the very first paint would just be chrome. The
      // scrollY floor matters on a wide desktop, where the first section can
      // already be in view before the reader has scrolled at all.
      const first = document.getElementById(list[0])
      const past = first ? first.getBoundingClientRect().top < window.innerHeight * 0.85 : window.scrollY > 420
      setShown(window.scrollY > 200 && past)
      // Scroll-spy: the last section whose heading has passed the top bar. At
      // the very bottom the final section can never reach that line (the page
      // runs out of scroll), so the end of the document claims the last tab.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let current = atEnd ? list[list.length - 1] : list[0]
      if (!atEnd) {
        for (const id of list) {
          const el = document.getElementById(id)
          if (el && el.getBoundingClientRect().top <= 140) current = id
        }
      }
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ids])

  if (items.length < 2 || hidden || !shown) return null
  return (
    // The wrapper owns the centering transform; the pill owns the entry
    // animation — `animate-slide-in-b` animates `transform`, so sharing one
    // element would cancel `-translate-x-1/2` and knock the pill off-centre.
    // `pointer-events-none` on the wrapper keeps the fixed layer from eating
    // taps beside the pill.
    <div
      // 150px = the mobile booking bar's real height (~122px at 390px, where
      // the risk-reversal line wraps) plus a clear gap; the safe-area inset is
      // added on top because the bar itself grows by it.
      className="fixed left-1/2 -translate-x-1/2 z-[55] pointer-events-none bottom-[calc(150px+env(safe-area-inset-bottom))] lg:bottom-6"
    >
      <nav
        aria-label="პროფილის სექციები"
        // Glass, but NOT on mobile: backdrop-blur on a fixed mobile bar flickers
        // on scroll (fixed 2026-07-22 for the headers + BottomNav), and this
        // page is mostly read on a phone. Phones get a near-solid white pill
        // with a hairline + shadow; the real translucent blur starts at lg.
        className="pointer-events-auto max-w-[calc(100vw-2rem)] rounded-pill border border-ink-200 bg-white/95 lg:bg-white/70 lg:backdrop-blur-xl shadow-pop motion-safe:animate-slide-in-b"
      >
        {/* The rail scrolls INSIDE the pill (four Georgian labels overflow
            390px), and only the labels are edge-masked — masking the <nav>
            itself would fade out the pill's own border and shadow. */}
        <div className="flex items-center gap-1 p-1 overflow-x-auto scrollbar-hide rail-fade-end">
          {items.map(it => (
            <a
              key={it.id}
              href={`#${it.id}`}
              aria-current={active === it.id ? 'true' : undefined}
              // Smooth-glide to the section instead of a hard jump. scrollIntoView
              // honors each section's scroll-mt-24, so the heading lands clear of
              // the sticky top bar. Fall back to the native hash jump if the
              // target isn't found.
              onClick={(e) => {
                const el = document.getElementById(it.id)
                if (!el) return
                e.preventDefault()
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                history.replaceState(null, '', `#${it.id}`)
              }}
              className={`shrink-0 h-10 px-3.5 rounded-pill inline-flex items-center font-display text-[12.5px] font-semibold whitespace-nowrap no-caps transition-colors ${
                active === it.id ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900 hover:bg-ink-50'
              }`}
            >
              {it.l}
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}

/* ───── Page ─────
   Wrapped in <Suspense> because `useSearchParams` (used inside for rebook
   query params) must be inside a Suspense boundary in Next 15. */
export default function ExpertProfilePage({ initialTutor, initialUser }: { initialTutor?: any; initialUser?: PublicMe | null }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <ExpertProfile initialTutor={initialTutor ?? null} initialUser={initialUser} />
    </Suspense>
  )
}

function ExpertProfile({ initialTutor, initialUser }: { initialTutor: any; initialUser?: PublicMe | null }) {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const tutorId = params?.id
  // Seed from the server's already-loaded profile (page.tsx passes the same
  // core fields it reads for SEO — name/avatar/headline/specialty/verified/
  // rating/price/consultations). The hero, identity, specs, about and price
  // then render on the FIRST paint instead of a blank skeleton. The fetch below
  // still runs to hydrate what the seed omits (live availability, reviews,
  // experience/education/certificates) and to refresh the core fields. When no
  // seed is available (server DB error), we fall back to the pure client-fetch
  // path — identical to before, incl. the skeleton + error/retry states.
  const [tutorData, setTutorData] = useState<any>(initialTutor ?? null)
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'not-found' | 'error'>(
    initialTutor ? 'ok' : 'loading',
  )
  // The seed is PARTIAL — it carries the scalars but NOT availability/busySlots/
  // reviews (viewer-tz dependent, so they stay client-computed; see the seed
  // note in page.tsx). `loadState === 'ok'` therefore says „we can draw the
  // profile", NOT „we know this expert's free times". Everything slot- or
  // review-derived reads this second flag instead, so a seeded first paint
  // shows a neutral loading affordance rather than a disabled CTA and an
  // all-zero review histogram that silently flip 300–1500ms later.
  const [detailsState, setDetailsState] = useState<SlotsState>('pending')
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
  // Deep-link from a slot-less expert's card CTA ("მიწერე ექსპერტს"): open the
  // message flow on arrival — auth-gated for guests, straight to the thread for
  // signed-in students. Same one-shot pattern as ?rebook=1 for booking.
  const messageAutoOpen = searchParams?.get('intent') === 'message'

  useEffect(() => {
    if (!tutorId) return
    // Only drop to the skeleton when we have NOTHING seeded from the server —
    // with a seed we keep the profile on screen while the fresh payload loads.
    // Likewise a transient refetch failure must not blow a working seeded
    // profile into the error screen (the server already had the data); it only
    // downgrades to not-found/error on the pure client-fetch path.
    const seeded = !!initialTutor
    if (!seeded) setLoadState('loading')
    setDetailsState('pending')
    fetch(`/api/tutors/${tutorId}`)
      .then(async r => {
        if (r.status === 404) { if (!seeded) setLoadState('not-found'); return null }
        if (!r.ok) { if (!seeded) setLoadState('error'); return null }
        // Non-JSON body (proxy error page, dead dev server) must land in the
        // error branch — not throw into an uncaught rejection.
        return r.json().catch(() => { if (!seeded) setLoadState('error'); return null })
      })
      // `detailsState` resolves on EVERY outcome — a seeded profile survives a
      // failed refetch (it keeps the error screen away), but its slot/review
      // regions must not sit on a skeleton forever: they switch to an honest
      // „ვერ ჩაიტვირთა" + retry instead.
      .then(d => {
        if (d) { setTutorData(d); setLoadState('ok'); setDetailsState('ready') }
        else setDetailsState('failed')
      })
      .catch(() => { if (!seeded) setLoadState('error'); setDetailsState('failed') })
  }, [tutorId, loadAttempt])

  // Soft sign-in prompt: replaces hard redirect for anon interactions.
  // Shared /api/me (lib/me) — deduped with the top bar, AppShell and VideoHero.
  // Tri-state preserved: null until the probe resolves (`ready`), then boolean —
  // the rebook auto-open waits on `signedIn === null`, requireAuth gates on
  // `=== false`.
  const { me, ready: meReady } = useMe()
  // The server already resolved the session (page.tsx passes `initialUser`), so
  // fall back to it until the probe lands — otherwise an expert opening their
  // OWN profile flashes a live „დაჯავშნე" + a save-heart they can't use, and a
  // signed-in visitor flashes „შესვლა და დაჯავშნა". Same seed-then-refresh
  // pattern as app/tutors/client.tsx. It's a prop, identical on the server and
  // the hydration render, so no mismatch.
  const viewer = me ?? initialUser ?? null
  const signedIn: boolean | null = meReady ? !!me : initialUser ? true : null
  const [needsAuth, setNeedsAuth] = useState(false)
  const [authDismissed, setAuthDismissed] = useState(false)
  // Which flow the visitor was in when the auth gate fired. 'book' makes the
  // post-auth redirect carry ?rebook=1 so the booking modal reopens by itself.
  const [authIntent, setAuthIntent] = useState<'book' | 'message' | null>(null)
  const requireAuth = React.useCallback((intent?: 'book' | 'message') => {
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
  // Pre-selected slot start — set by the inline „განრიგი" picker so the flow
  // opens with that time already chosen. Null for generic CTAs.
  const [bookingStart, setBookingStart] = useState<Date | null>(null)
  // Consultation tier tapped in ServicesSection — flows into BookingFlow so
  // it books THAT tier's minutes/price (via consultationId). Null for
  // every generic CTA (sticky card, mobile bar), which books the flat default
  // (or asks for a tier at step 1 when the expert has several).
  const [selectedService, setSelectedService] = useState<ConsultationItem | null>(null)

  // The shared flow's payload, derived once per fetch from the SAME
  // /api/tutors/[id] JSON this page already loaded (no extra request).
  // Memoized: BookingFlow's reset logic must not see a new object per render.
  const bookingTutorInfo = React.useMemo(
    () => (tutorData ? mapTutorPayload(tutorData) : null),
    [tutorData],
  )

  // No-op when the tutor is paused (available === false). The banner above
  // explains the state; silently swallowing the click prevents any of the
  // booking entry points (sidebar, mobile bar, service cards, inline
  // schedule) from opening the flow for a tutor who's stepped out.
  const isPaused = tutorData?.available === false

  const openPaid = () => {
    if (isPaused) return
    if (requireAuth('book')) return
    setSelectedService(null)
    setBookingStart(null)
    setBookingOpen(true)
  }
  // Service-card entry point: same gates as openPaid, but carries the tapped
  // tier into the flow (tier step pre-answered).
  const openServiceBooking = (s: ConsultationItem) => {
    if (isPaused) return
    if (requireAuth('book')) return
    setSelectedService(s)
    setBookingStart(null)
    setBookingOpen(true)
  }
  // Inline-schedule entry point (1.6): opens the flow with the tapped time
  // preselected; multi-tier experts still answer the tier step first.
  const openSlotBooking = (start: Date) => {
    if (isPaused) return
    if (requireAuth('book')) return
    setSelectedService(null)
    setBookingStart(start)
    setBookingOpen(true)
  }

  // Pre-booking messaging — the objection-handler for high-stakes one-off
  // consultations (Clarity/Topmate pattern). Guests hit the auth sheet (returns
  // here after sign-in); logged-in students open the pair thread with this
  // expert. Allowed even while paused — a prospect can still ask questions.
  const router = useRouter()
  const expertUserId: string | undefined = tutorData?.user?.id
  // The expert viewing their OWN public profile must not see a "book/message
  // yourself" control — swap it for an edit-profile link.
  const isOwnProfile = !!(viewer?.id && expertUserId && viewer.id === expertUserId)
  // Dual-role model (2026-07-23): anyone who can act as a CLIENT may message or
  // book another expert — guests, students, AND a promoted expert (role TUTOR)
  // consulting a DIFFERENT expert. The backend permits it (bookings API now
  // refuses only ADMIN; messages API allows TUTOR→TUTOR pre-booking inquiries),
  // so the only viewers excluded are the expert on their own profile
  // (isOwnProfile) and ADMIN (no client space). Messaging is allowed even while
  // the listing is paused — a prospect can still ask questions.
  const canMessage = expertUserId != null && !isOwnProfile && viewer?.role !== 'ADMIN'
  const viewerCantBook = viewer?.role === 'ADMIN'
  // Favorites remain STUDENT-only (the favorites API still 403s a TUTOR), so the
  // save button uses a separate flag from booking (which a dual-role TUTOR can do).
  const viewerCantFav = !!(viewer?.role && viewer.role !== 'STUDENT')
  const onMessageExpert = () => {
    if (requireAuth('message')) return
    if (!expertUserId) return
    router.push(`/student/messages/u/${expertUserId}`)
  }

  // Auto-open the booking flow when the caller passed ?rebook=1. Only fire
  // once — we track it with a guard state so React strict-mode double invokes
  // stay idempotent, and further opens/closes remain manual. Skip if
  // the tutor has paused their listing since the rebook link was generated.
  // Anonymous visitors go through requireAuth instead of straight into the
  // flow — the AuthPromptSheet's 'book' intent carries ?rebook=1 through
  // sign-in, so the flow resumes here after auth.
  const [rebookConsumed, setRebookConsumed] = useState(false)
  useEffect(() => {
    if (!rebookAutoOpen || rebookConsumed) return
    if (loadState !== 'ok') return
    if (isPaused) { setRebookConsumed(true); return }
    if (signedIn === null) return // wait for the /api/me probe to resolve
    if (requireAuth('book')) { setRebookConsumed(true); return }
    setSelectedService(null)
    setBookingStart(null)
    setBookingOpen(true)
    setRebookConsumed(true)
  }, [rebookAutoOpen, rebookConsumed, loadState, isPaused, signedIn, requireAuth])

  // Same one-shot resolution for the ?intent=message deep-link (slot-less card
  // CTA): guests hit the auth sheet with a 'message' intent, signed-in students
  // go straight to the pair thread.
  const [messageConsumed, setMessageConsumed] = useState(false)
  useEffect(() => {
    if (!messageAutoOpen || messageConsumed) return
    if (loadState !== 'ok' || signedIn === null) return
    // Guests: fire the auth sheet (doesn't need the expert's user id).
    if (signedIn === false) { setMessageConsumed(true); requireAuth('message'); return }
    // Signed-in student: the SSR seed carries no `user.id` (SEO fields only), so
    // wait for the client payload to fill `expertUserId` before redirecting —
    // do NOT consume early, or the redirect is lost. The effect re-runs when
    // expertUserId lands (it's a dep).
    if (!expertUserId) return
    setMessageConsumed(true)
    router.push(`/student/messages/u/${expertUserId}`)
  }, [messageAutoOpen, messageConsumed, loadState, signedIn, requireAuth, expertUserId, router])

  // Safe now — every hook above has already run unconditionally.
  if (loadState === 'not-found') {
    return (
      <div className="font-sans bg-white text-ink-900 antialiased min-h-screen flex flex-col">
        <PublicTopBar initialUser={initialUser} />
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-[480px] w-full text-center">
            <h1 className="font-display text-[22px] font-bold text-ink-900">ექსპერტი ვერ მოიძებნა</h1>
            <p className="text-[13.5px] text-ink-500 mt-2">პროფილი წაიშალა ან ბმული არასწორია.</p>
            <Link href="/tutors" className="mt-6 inline-flex h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] items-center gap-2">
              ყველა ექსპერტი
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
        <PublicTopBar initialUser={initialUser} />
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="max-w-[480px] w-full text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-warning-50 border border-warning-200 inline-flex items-center justify-center text-warning-700 mb-5">
              <Icon.warn className="w-6 h-6" />
            </div>
            <h1 className="font-display text-[22px] font-bold text-ink-900">პროფილი ვერ ჩაიტვირთა</h1>
            <p className="text-[13.5px] text-ink-500 mt-2 leading-relaxed">ქსელის დროებითი ხარვეზი — სცადე თავიდან.</p>
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
  // ₾80/30-წთ fallback price and a DISABLED "no published slots" booking card —
  // all of which self-healed a moment later once the data arrived, so users saw
  // a jarring broken-then-fixed profile. Show a skeleton instead; only render
  // the real profile + booking UI once `loadState === 'ok'`. (`not-found` and
  // `error` are handled above; only genuine `loading` lands here.)
  if (loadState !== 'ok') {
    return (
      <div className="font-sans bg-white text-ink-900 antialiased">
        <PublicTopBar initialUser={initialUser} />
        <Container as="main"
          id="main"
          className="pt-4 sm:pt-7 lg:pt-9 pb-24 lg:pb-16"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="sm:mt-6 grid lg:grid-cols-[1fr_360px] gap-8 xl:gap-12 animate-pulse">
            {/* Left: identity + specs placeholders. Deliberately NO media
                block: most experts have no intro video, so a video-shaped
                skeleton promised one to everyone and then vanished. */}
            <div className="min-w-0">
              <div className="relative rounded-card bg-white border border-ink-200 shadow-card px-5 sm:px-7 pt-5 sm:pt-6 pb-6">
                <div className="w-[88px] h-[88px] sm:w-[112px] sm:h-[112px] rounded-full bg-ink-100" />
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
        </Container>
      </div>
    )
  }

  // Anchor-nav items — only the sections that actually render get a link.
  const navItems: { id: string; l: string }[] = [
    ...((tutorData?.bio || tutorData?.headline || tutorData?.user?.bio) ? [{ id: 'overview', l: 'მიმოხილვა' }] : []),
    ...((tutorData?.consultations?.length ?? 0) > 0 ? [{ id: 'services', l: 'სერვისები' }] : []),
    ...(!isPaused ? [{ id: 'schedule', l: 'განრიგი' }] : []),
    { id: 'reviews', l: 'შეფასებები' },
    ...((tutorData?.experience?.length ?? 0) > 0 ? [{ id: 'experience', l: 'გამოცდილება' }] : []),
  ]

  // From-price shared by the rail + mobile bar (1.2): „₾N-დან" when tiers differ.
  const headlinePrice = fromPriceLabel(tutorData?.consultations ?? [], tutorData?.price ?? TUTOR_DEFAULTS.price)
  // ONE service length for every pre-tier surface (rail, mobile bar, #schedule)
  // so they can't disagree about what „free" means: the SHORTEST real service,
  // falling back to the profile duration. Starts are DERIVED from it (windows −
  // bookings − length), never read off a pre-sliced row's `booked` flag.
  const previewMin = previewServiceMin(tutorData?.consultations ?? [], tutorData?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin)
  // Absent from the payload until the profile carries it — 0 changes nothing.
  const bufferMin = typeof tutorData?.bufferMin === 'number' && tutorData.bufferMin > 0 ? tutorData.bufferMin : 0

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      <PublicTopBar initialUser={initialUser} />

      <Container as="main" id="main" className="pt-4 sm:pt-7 lg:pt-9 pb-8 lg:pb-16">
        {/* Owner preview note — the expert opened their own profile from the
            editor's „ნახე შენი პროფილი“ button (?preview=1). Shown only when the
            signed-in viewer owns this profile, so a student never sees it.
            The page already resolves for the owner even while paused (nothing
            gates on available === false — only admin-suspension hides). */}
        {searchParams?.get('preview') === '1' && initialUser?.id && tutorData?.user?.id === initialUser.id && (
          <div className="mb-4 rounded-card border border-ink-200 bg-ink-50 p-3 flex items-center gap-2 text-[12.5px] text-ink-600">
            <Icon.eye className="w-4 h-4 shrink-0 text-ink-400" />
            პრევიუ — ასე გხედავს სტუდენტი.
          </div>
        )}
        {/* Paused-profile banner. Shown when the tutor has toggled visibility
            off on /tutor/profile — the detail page still resolves (existing
            students may have deep links) but explicit CTAs (StickyBookingCard,
            MobileBookingBar, ServicesSection) short-circuit their handlers so
            no new bookings can start. */}
        {tutorData && tutorData.available === false && (
          <div className="mb-4 sm:mb-6 rounded-card border border-warning-200 bg-warning-50 p-4 sm:p-5 flex items-start gap-3">
            <Icon.warn className="w-5 h-5 shrink-0 text-warning-700 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[14px] font-bold text-warning-800">ექსპერტი დროებით პაუზაზეა</div>
              <p className="text-[12.5px] text-warning-800/85 mt-1 leading-snug">ახალი ჯავშანი შეჩერებულია. არსებული სესია აქტიურია და მიწერა შეგიძლია.</p>
            </div>
          </div>
        )}
        <div className="hidden sm:block">
          <Breadcrumb tutor={tutorData} />
        </div>

        <div className="sm:mt-6 grid lg:grid-cols-[1fr_360px] gap-8 xl:gap-12">

          {/* Left: scrollable content */}
          <div className="min-w-0">
            <VideoHero tutorId={tutorId} tutor={tutorData} requireAuth={requireAuth} viewerCantFav={viewerCantFav} />

            <SpecsGrid tutor={tutorData} />

            <AboutSection tutor={tutorData} />
            {/* Consultation tiers: a tapped card opens the shared BookingFlow
                with that tier preselected — the flow enumerates by the tier's
                minutes, restates ITS price and sends consultationId (the
                server books the Consultation row's authoritative values). */}
            <ServicesSection consultations={tutorData?.consultations ?? []} onBook={openServiceBooking} />
            {/* Inline availability (1.6) — the shared flow's calendar/slot
                view rendered in-page, viewer-local tz. Tapping a time opens
                the booking Sheet with the slot preselected. Hidden while the
                expert is paused (booking is closed anyway). */}
            {!isPaused && (
              <section id="schedule" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
                <Eyebrow className="mb-3">განრიგი</Eyebrow>
                <h2 className="font-display text-[24px] lg:text-[28px] font-bold tracking-[-0.022em] text-ink-900 leading-tight">თავისუფალი დროები</h2>
                <p className="mt-2 text-[13.5px] text-ink-500 max-w-[520px]">აირჩიე დრო — ჯავშანი არჩეული დროით გაიხსნება.</p>
                <div className="mt-6">
                  {detailsState === 'pending' ? (
                    // The picker reads an empty `availability` as „no free
                    // times" — with the seed carrying none, that empty state
                    // would fire before the fetch even lands.
                    <div className="rounded-card border border-ink-200 bg-white p-4 sm:p-6 motion-safe:animate-pulse" aria-busy="true">
                      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
                        <div className="h-[260px] rounded-card bg-ink-100" />
                        <div className="hidden lg:grid grid-cols-2 gap-2 content-start">
                          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-11 rounded-btn bg-ink-100" />)}
                        </div>
                      </div>
                      <span className="sr-only">თავისუფალი დროები იტვირთება…</span>
                    </div>
                  ) : detailsState === 'failed' ? (
                    <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-6 py-8 text-center">
                      <div className="font-display text-[15px] font-bold text-ink-900">დროები ვერ ჩაიტვირთა</div>
                      <p className="text-[12.5px] text-ink-500 mt-1.5">ქსელის დროებითი ხარვეზი — სცადე თავიდან.</p>
                      <Btn variant="secondary" onClick={() => setLoadAttempt(a => a + 1)} className="mt-4">
                        <Icon.refresh className="w-4 h-4" /> სცადე თავიდან
                      </Btn>
                    </div>
                  ) : (
                    <InlineAvailability
                      availability={tutorData?.availability ?? []}
                      busySlots={tutorData?.busySlots ?? []}
                      sessionMin={previewMin}
                      bufferMin={bufferMin}
                      priceLabel={headlinePrice.label}
                      tutorName={tutorData?.user?.fullName ?? TUTOR_DEFAULTS.name}
                      onPickSlot={openSlotBooking}
                    />
                  )}
                </div>
              </section>
            )}
            <ExperienceSection items={tutorData?.experience ?? []} />
            <EducationSection items={tutorData?.education ?? []} />
            <CertificatesSection items={tutorData?.certificates ?? []} />
            <Reviews
              reviews={tutorData?.reviews ?? []}
              rating={tutorData?.rating ?? 0}
              total={tutorData?.reviewsCount ?? 0}
              verified={!!tutorData?.verified}
              expertFeatured={!!tutorData?.featured}
              // reviewsCount is seeded, the review ROWS are not — without this
              // the histogram drew all-zero bars next to a real total.
              loading={detailsState === 'pending'}
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
              slotsState={detailsState}
              onRetrySlots={() => setLoadAttempt(a => a + 1)}
              tutorPrice={tutorData?.price ?? TUTOR_DEFAULTS.price}
              sessionMin={previewMin}
              bufferMin={bufferMin}
              responseHours={tutorData?.responseHours ?? TUTOR_DEFAULTS.responseHours}
              sessionsCount={tutorData?.sessionsCount ?? 0}
              yearsExp={tutorData?.yearsExp ?? 0}
              rating={tutorData?.rating ?? 0}
              reviewsCount={tutorData?.reviewsCount ?? 0}
              signedIn={signedIn}
              consultations={tutorData?.consultations ?? []}
              canMessage={canMessage}
              onMessage={onMessageExpert}
              isOwnProfile={isOwnProfile}
              viewerCantBook={viewerCantBook}
            />
          </div>
        </div>
      </Container>

      {/* The fixed mobile booking bar overlays the page bottom at ~121px +
          safe-area (the risk-reversal line wraps to two lines at 390px). The
          footer lives OUTSIDE the main Container, so it carries the clearance
          itself — with only the Container's old pb-24 the last footer row was
          permanently unreachable on a phone. */}
      <div className="pb-[calc(128px+env(safe-area-inset-bottom))] lg:pb-0">
        <SharedFooter />
      </div>

      {/* Floating section nav — rendered at page level (a fixed layer), and
          hidden while a dialog owns the screen so it can't float over it. */}
      <SectionNav items={navItems} hidden={bookingOpen || (needsAuth && !authDismissed && signedIn === false)} />

      {/* Mobile sticky bottom booking */}
      <MobileBookingBar
        onBook={openPaid}
        priceLabel={headlinePrice.label}
        priceIsFrom={headlinePrice.isFrom}
        sessionMin={previewMin}
        bufferMin={bufferMin}
        signedIn={signedIn}
        paused={isPaused}
        availability={tutorData?.availability ?? []}
        busySlots={tutorData?.busySlots ?? []}
        slotsState={detailsState}
        onRetrySlots={() => setLoadAttempt(a => a + 1)}
        canMessage={canMessage}
        onMessage={onMessageExpert}
        isOwnProfile={isOwnProfile}
        viewerCantBook={viewerCantBook}
      />

      {/* Point-of-tap auth prompt — replaces the old top-of-page banner. */}
      {needsAuth && !authDismissed && signedIn === false && (
        <AuthPromptSheet
          tutorId={tutorId}
          intent={authIntent}
          onDismiss={() => setAuthDismissed(true)}
        />
      )}

      <BookingFlow
        open={bookingOpen}
        // Closing drops the tapped tier/slot too — the next generic open must
        // not silently rebook the previous selection.
        onClose={() => { setBookingOpen(false); setSelectedService(null); setBookingStart(null) }}
        tutorId={tutorId}
        tutor={bookingTutorInfo}
        initialStart={bookingStart}
        initialTopic={rebookTopic}
        initialService={selectedService}
      />
    </div>
  )
}


