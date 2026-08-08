'use client'
import React, { useState, useEffect, useRef, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
// next-view-transitions' Link is a drop-in for next/link that runs the
// navigation inside document.startViewTransition — this is what animates
// the card→profile morph. Unsupported browsers get plain navigation.
import { Link } from 'next-view-transitions'
import { PublicTopBar } from '@/components/PublicTopBar'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Footer as SharedFooter } from '@/components/Footer'
import { useToast } from '@/components/ToastProvider'
import { copyToClipboard } from '@/lib/clipboard'
import { safeHttpUrl } from '@/lib/safeUrl'
import { langLabel, toLangCode } from '@/lib/languages'
import { useMe, fetchMe, type Me as PublicMe } from '@/lib/me'
import { PAYMENTS_LIVE, FEATURE_REQUEST_BOOKING } from '@/lib/flags'
import { isAbroadCategory } from '@/lib/abroad'
import { fmtRating } from '@/lib/fmt'
import { displayHeadline } from '@/lib/headline'
import { fmtKaDate, KA_MONTHS_LONG as KA_MONTHS_FULL, KA_MONTHS_SHORT_DOT, KA_WEEKDAYS_SHORT } from '@/lib/kaDate'
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
  TUTOR_DEFAULTS, priceForDuration, primaryPriceLabel, computeNextFreeStart, primaryServiceMin,
  orderedTiers, tierPriceLabel,
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
    <span title={title} className="inline-flex items-center justify-center rounded-full bg-brand-600 text-white shrink-0" style={{ width: size, height: size }}>
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
  // MEASURED response time (lib/responseTime) — null when we don't have enough
  // answered conversations to say anything true. NEVER fall back to
  // `responseHours`: the expert types that into their own editor and we cannot
  // verify it, so rendering it would be a fabricated trust signal.
  responseTime?: { medianMin: number | null; sampleN: number | null; label: string } | null
  languages?: string[] | null
  videoUrl?: string | null
  linkedinUrl?: string | null
  websiteUrl?: string | null
  user: { id: string; fullName: string; avatarUrl?: string | null; bio?: string | null }
  category?: { id: string; slug: string; name: string; icon?: string | null } | null
}

const Breadcrumb = ({ tutor }: { tutor: TutorDetail | null }) => (
  <nav aria-label="ნავიგაცია" className="font-display text-micro font-semibold uppercase flex items-center gap-2 text-ink-500">
    <Link href="/tutors" className="hover:text-ink-900 transition-colors duration-fast">ექსპერტები</Link>
    {tutor?.category && (
      <>
        <Icon.chevR className="w-3 h-3 text-ink-300" />
        {/* The indexable category landing page, not the /tutors filter (which
            canonicalises away). Expert profiles are the site's deepest crawled
            pages, so this is the link that feeds the category pages upward. */}
        <Link href={`/categories/${tutor.category.slug}`} className="hover:text-ink-900 transition-colors duration-fast">{tutor.category.name}</Link>
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
        // The heart just snapped back — say why, or the revert reads as a bug.
        toast('შენახვა ვერ მოხერხდა', 'error')
      }
    } catch {
      setSaved(wasSaved)
      toast('შენახვა ვერ მოხერხდა', 'error')
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
            {/* The receiving half of the card→profile morph (vt-photo-<id> is
                set on the browse and home cards). Uses the DATA id, never the
                URL param — the route also answers to name slugs, and a name
                mismatch silently degrades the morph to a plain cross-fade. */}
            <div style={tutor?.id ? { viewTransitionName: `vt-photo-${tutor.id}` } : undefined} className="w-[88px] h-[88px] sm:w-[112px] sm:h-[112px] rounded-full overflow-hidden bg-brand-100 ring-1 ring-ink-100 inline-flex items-center justify-center [&>button]:w-full [&>button]:h-full">
              {/* State, not a DOM write. `||` only covers an ABSENT avatarUrl,
                  and two live profiles carry a Google-SSO URL that no longer
                  resolves — 112px of broken-image glyph, captioned with the
                  expert's own name, as the first thing on their profile. The
                  first version of this fix assigned `e.currentTarget.src` inside
                  `onError`; React owns that attribute and restored the dead URL
                  on the next render, so the fallback never stuck. Mirrors
                  <ExpertPhoto> on the browse card. */}
              <ProfilePhoto src={tutor?.user.avatarUrl} name={tutor?.user.fullName ?? ''} />
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
              className={`w-11 h-11 rounded-full border inline-flex items-center justify-center transition-colors duration-fast disabled:opacity-60 ${saved ? 'border-danger-300 bg-danger-50 text-danger-600' : 'border-ink-200 bg-white hover:border-ink-300 text-ink-600'}`}
            >
              {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
            </button>
            )}
            <button
              type="button"
              onClick={shareTutorLink}
              aria-label="ბმულის კოპირება"
              title="დააკოპირე ბმული"
              className="h-11 px-3.5 rounded-pill border border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 text-ink-700 inline-flex items-center gap-1.5 font-display text-meta sm:text-small font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
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
            <h1 className="font-display text-h1 sm:text-display lg:text-display-lg font-bold text-ink-900 tracking-tight leading-[1.05]">
              {tutor?.user.fullName ?? TUTOR_DEFAULTS.name}
            </h1>
            {tutor?.verified && <VerifiedMark size={22} />}
          </div>

          {/* The CATEGORY leads, `specialty` follows — same hierarchy as the
              browse card (see the long note there). It used to be the other way
              round: `specialty` wore the brand chip even though it is free text
              carried over from /apply, while the category — our own, filterable
              taxonomy — was the demoted second chip. On all nine live rows the
              two strings are IDENTICAL, so this swap is invisible today; it
              matters the moment they diverge, which is exactly when the reader
              needs to know which one the platform stands behind. */}
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {tutor?.category?.name && (
              <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-pill bg-brand-50 border border-brand-200 text-meta font-display font-semibold text-brand-800">
                {tutor.category.name}
              </span>
            )}
            {tutor?.specialty && tutor.specialty !== tutor?.category?.name && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 h-7 rounded-pill bg-ink-50 border border-ink-200 text-meta font-display font-medium text-ink-700">
                {tutor.specialty}
              </span>
            )}
          </div>

          {/* Meta row — separated by gap only. The old „•" spans were both
              banned by canon (no status dots) and orphaned: each one rendered
              after its own fact, so an expert with no sessions/languages after
              it ended the row on a dangling dot. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-small">
            {typeof tutor?.rating === 'number' && tutor.rating > 0 && (
              <div className="inline-flex items-baseline gap-1.5">
                <Icon.star className="w-3.5 h-3.5 text-warning-500 self-center" />
                <span className="font-display font-bold text-ink-900 tabular-nums text-body-lg">{fmtRating(tutor.rating)}</span>
                {typeof tutor.reviewsCount === 'number' && tutor.reviewsCount > 0 && (
                  <span className="text-ink-500 tabular-nums">· {tutor.reviewsCount}</span>
                )}
              </div>
            )}
            {typeof tutor?.sessionsCount === 'number' && tutor.sessionsCount > 0 && (
              <div className="inline-flex items-baseline gap-1.5">
                <span className="font-display font-bold text-ink-900 tabular-nums text-body-lg">{tutor.sessionsCount}</span>
                <span className="text-ink-500">სესია</span>
              </div>
            )}
            {/* Dedupe AFTER labelling, not before. `languages` is stored as ISO
                codes, but /apply once wrote Georgian NAMES and older rows hold
                both spellings for one language — so „ka" and „ქართული" survive a
                raw dedupe as two entries and only collapse once each has been
                mapped to its label. That is exactly what printed „ქართული ·
                ქართული · ინგლისური" on a live profile. lib/languages'
                normalizeLangs fixes new writes; this keeps existing rows honest
                without a migration. */}
            {tutor?.languages && tutor.languages.length > 0 && (() => {
              const labels = Array.from(new Set(tutor.languages.map(toLangLabel)))
              return (
                <div className="inline-flex items-center gap-1.5 text-ink-700">
                  <Icon.globe className="w-3.5 h-3.5 text-ink-500" />
                  <span>{labels.join(' · ')}</span>
                </div>
              )
            })()}
            {typeof tutor?.yearsExp === 'number' && tutor.yearsExp > 0 && (
              <div className="inline-flex items-center gap-1.5 text-ink-700">
                <span>{tutor.yearsExp} წელი</span>
              </div>
            )}
            {/* Response time deliberately NOT here (2026-07-29). It is not an
                identity fact — it only matters at the moment someone decides
                whether to message and wait, so it lives beside the message
                button in the booking rail. Preply, the only comparable site
                that measures it, uses it as a SEARCH RANKING input and never
                prints it as a headline stat. */}
          </div>

          {/* Same normaliser the browse card uses, so the two surfaces can never
              print one expert's headline differently — and so the trailing
              „- 7 წელი" is gone here too (the years have their own row). */}
          {(displayHeadline(tutor?.headline) || tutor?.bio) && (
            <p className="mt-4 text-body text-ink-600 leading-[1.6] max-w-[560px]">
              {displayHeadline(tutor?.headline) || tutor?.bio}
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
                  <a href={li} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 h-10 sm:h-8 px-3.5 sm:px-3 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 hover:border-ink-300 hover:text-ink-900 font-display text-meta font-semibold transition-colors duration-fast">
                    <Icon.external className="w-3.5 h-3.5" /> LinkedIn
                  </a>
                )}
                {web && (
                  <a href={web} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 h-10 sm:h-8 px-3.5 sm:px-3 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 hover:border-ink-300 hover:text-ink-900 font-display text-meta font-semibold transition-colors duration-fast">
                    <Icon.globe className="w-3.5 h-3.5" /> ვებგვერდი
                  </a>
                )}
              </div>
            )
          })()}

          {/* Trust row — reassurance before booking. On a high-ticket, first-time
              purchase these three signals remove the biggest objections. */}
          <div className="mt-5 pt-4 border-t border-ink-100 flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <span className="inline-flex items-center gap-1.5 text-meta font-display font-medium text-ink-700">
              <Icon.check className="w-4 h-4 text-brand-600" /> ხელით შერჩეული
            </span>
            <span className="inline-flex items-center gap-1.5 text-meta font-display font-medium text-ink-700">
              {/* „· გადახდები მალე" dropped: a visitor can act on „booking is
                  free", not on our roadmap. Keep the half that is a fact about
                  their next click. */}
              <Icon.shieldCheck className="w-4 h-4 text-brand-600" /> {PAYMENTS_LIVE ? 'დაცული გადახდა' : 'უფასო დაჯავშნა'}
            </span>
            {tutor?.verified && (
              <span className="inline-flex items-center gap-1.5 text-meta font-display font-medium text-ink-700">
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

const REV_MONTHS = KA_MONTHS_SHORT_DOT
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
          <div className="font-display text-body font-bold text-ink-900 leading-tight truncate">{anon ? 'ანონიმური სტუდენტი' : r.student?.fullName ?? 'ანონიმური სტუდენტი'}</div>
          <div className="mt-0.5 inline-flex items-center gap-2 text-meta text-ink-500">
            <Stars n={Math.round(r.rating)} />
            <span>·</span>
            <span>{timeAgoGe(r.createdAt)}</span>
          </div>
        </div>
      </div>
      <p className="text-body text-ink-700 leading-[1.6] max-w-[680px] whitespace-pre-wrap">{r.body}</p>
      {/* Expert's public reply — quoted sub-block, visually nested. */}
      {r.tutorResponse && (
        <div className="mt-4 border-l-2 border-ink-200 pl-3 max-w-[680px]">
          <div className="text-meta text-ink-500">
            <span className="font-display font-semibold text-ink-700">ექსპერტის პასუხი</span>
            {respondedDate && !isNaN(respondedDate.getTime()) && <span> · {fmtKaDate(respondedDate, { year: true })}</span>}
          </div>
          <p className="mt-1 text-small text-ink-600 leading-[1.6] whitespace-pre-wrap">{r.tutorResponse}</p>
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
      <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">
        {total > 0 ? 'რას ამბობენ სტუდენტები' : 'ჯერ არ არის შეფასება'}
      </h2>

      {total === 0 ? (
        <p className="mt-3 text-body text-ink-500 max-w-[520px]">ჯერ არავის შეუფასებია — იყავი პირველი.</p>
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
              <span className="font-display text-hero font-bold text-ink-900 tabular-nums leading-none tracking-tight motion-safe:animate-scale-in">
                {/* decimals=1 — same precision as fmtRating everywhere else. */}
                <CountUp value={rating} decimals={1} />
              </span>
              <div>
                <Stars n={Math.round(rating)} />
                <div className="mt-1.5 text-meta text-ink-500 tabular-nums">
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
                  <div className="space-y-2 motion-safe:animate-pulse" aria-busy="true">
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
                  <p className="text-meta text-ink-500 leading-snug">შეფასებების განაწილება ვერ ჩაიტვირთა.</p>
                )
              ) : dist.map(d => {
                const pct = reviews.length > 0 ? (d.n / reviews.length) * 100 : 0
                return (
                  <div key={d.s} className="grid grid-cols-[24px_1fr_40px] items-center gap-3 text-meta">
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
                <div className="pt-1 text-meta text-ink-400">ბოლო {reviews.length} შეფასების მიხედვით</div>
              )}
            </div>
          </div>

          <div className="mt-10 divide-y divide-ink-100">
            {distUnknown && loading
              ? [0, 1, 2].map(i => (
                  <div key={i} className="py-6 first:pt-0 last:pb-0 motion-safe:animate-pulse" aria-hidden>
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
                className="h-11 px-5 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center gap-2 transition-colors duration-fast"
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
const MobileBookingBar = ({ onBook, priceLabel, sessionMin, bufferMin = 0, signedIn, paused, availability = [], busySlots = [], slotsState = 'ready', onRetrySlots, canMessage = false, onMessage, isOwnProfile = false, viewerCantBook = false, canProposeCategory = false }: { onBook: () => void; priceLabel: string; sessionMin: number; bufferMin?: number; signedIn?: boolean | null; paused?: boolean; availability?: ApiSlot[]; busySlots?: BusySlot[]; slotsState?: SlotsState; onRetrySlots?: () => void; canMessage?: boolean; onMessage?: () => void; isOwnProfile?: boolean; viewerCantBook?: boolean; canProposeCategory?: boolean }) => {
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
  // With request-based booking on, „no published time" STOPS being a dead end:
  // the visitor proposes one and the expert answers. Booking therefore stays
  // enabled — which matters more than it looks, because the booking sheet's
  // „შემომთავაზე დრო" screen is reachable ONLY through this button. Disabling
  // it here made the whole feature unreachable for exactly the experts it was
  // built for (verified on a slot-less profile before shipping).
  // `paused` still disables: an expert who stepped out has not asked to be
  // sent proposals.
  const canPropose = FEATURE_REQUEST_BOOKING && canProposeCategory && noSlots
  const disabled = paused || (noSlots && !canPropose)
  // Mirrors the desktop rail: with nothing bookable, the primary slot goes to
  // the action that still works instead of a greyed „დროები არ არის". `paused`
  // deliberately does NOT promote — an expert who stepped out is a different
  // statement from one who has published no time, and the bar says so.
  // `canMessage` already excludes the owner and ADMIN, so this can't outrank
  // their own branches below.
  const messagePromoted = noSlots && !canPropose && canMessage && !!onMessage
  return (
  <div
    className="lg:hidden fixed bottom-0 left-0 right-0 z-overlay bg-white border-t border-ink-200 shadow-[0_-4px_20px_rgba(46,42,33,0.06)] motion-safe:animate-slide-in-b"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    <div className="px-4 py-3 flex items-center gap-3">
      {/* Shrinkable (2026-07-27 type-scale pass): this block used to be
          `shrink-0`, which dumped ALL flex shrinkage on the CTA — once the
          „უახლოესი: …" line moved 11.5px → text-meta the CTA truncated to
          „დაჯავშ…". Both children are already overflow-safe (the price has
          `whitespace-nowrap` so „₾NN-დან" can't break at the hyphen — the
          original reason for shrink-0 — and the date line has `truncate`),
          so shrinkage now lands on the secondary hint, never on the CTA. */}
      <div className="min-w-0 shrink">
        <div className="flex items-baseline gap-1.5">
          {/* The FLAGSHIP tier's price and its real length — always a concrete
              service, so there is no „/ სესია" from-price branch left to take. */}
          <span className="font-display text-h2 font-bold text-ink-900 tabular-nums leading-none tracking-tight whitespace-nowrap">{priceLabel}</span>
          <span className="text-meta text-ink-500 whitespace-nowrap">{`/ ${sessionMin} წთ`}</span>
        </div>
        {!disabled && nextFree && (
          /* SHORT date (2026-08-02). „ორშაბათი, 3 აგვისტო" does not fit beside
             a price, an icon button and the CTA on a 390px bar — it truncated to
             „ორშაბათი, 3 აგვ…", i.e. the one fact this line exists to deliver
             was the part that got cut. „ორშ, 3 აგვ." is the same information in
             half the width, from the shared kaDate arrays. */
          <div className="mt-1 text-meta text-ink-500 leading-none truncate">
            უახლოესი: <span className="font-display font-semibold text-ink-800">{KA_WEEKDAYS_SHORT[nextFree.getDay()]}, {nextFree.getDate()} {KA_MONTHS_SHORT_DOT[nextFree.getMonth()]}</span>
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2 min-w-0 shrink-0">
        {/* Pre-booking message — secondary, icon-only to protect „დაჯავშნა“'s
            width on 360px. Allowed even when booking is paused. Hidden once
            messaging has BECOME the primary (noSlots), so the bar never shows
            the same action twice, once as an icon and once as a button. */}
        {canMessage && onMessage && !messagePromoted && (
          <button
            type="button"
            onClick={onMessage}
            aria-label="მიწერე ექსპერტს"
            title="მიწერე ექსპერტს"
            className="h-12 w-12 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700 inline-flex items-center justify-center transition-colors duration-fast"
          >
            <Icon.chat className="w-5 h-5" />
          </button>
        )}
        {isOwnProfile ? (
          <Link href="/tutor/profile" className="tap-shrink shrink min-w-0 h-12 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast">
            <span className="truncate">პროფილის რედაქტირება</span>
          </Link>
        ) : viewerCantBook ? (
          // ink-500 on the tinted ink-75 plate (5.19); ink-400 measures 4.40
          // there and fails AA — its documented 4.75 is against WHITE.
          <span className="shrink min-w-0 h-12 px-4 rounded-btn bg-ink-75 border border-ink-200 text-ink-500 font-display font-semibold text-body tracking-wide inline-flex items-center justify-center">
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
            className="shrink min-w-0 h-12 px-4 rounded-btn border border-ink-200 bg-white text-ink-800 font-display font-semibold text-body tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors duration-fast hover:border-ink-300"
          >
            <Icon.refresh className="w-4 h-4" />
            <span className="truncate">სცადე თავიდან</span>
          </button>
        ) : messagePromoted ? (
          // No bookable time: the live action takes the primary slot. The old
          // branch rendered the CTA disabled with the label „დროები არ არის" —
          // a beige, dead primary that stated a problem and offered no way out,
          // while the only working control was a 48px icon beside it.
          <button
            type="button"
            onClick={onMessage}
            className="shrink-0 min-w-0 h-12 px-4 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast"
          >
            <Icon.chat className="w-4 h-4 shrink-0" />
            <span className="truncate">მიწერე</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onBook}
            disabled={disabled}
            className="shrink-0 min-w-0 h-12 px-4 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast disabled:bg-none disabled:bg-ink-100 disabled:text-ink-500 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {/* Guest label kept short — tapping opens the auth sheet, which
                explains the sign-in step. „შესვლა და დაჯავშნა“ overflowed 360px.
                shrink-0 (2026-07-27): every label here is short (max
                „დროები არ არის" ≈ 137px incl. padding), so the PRIMARY action
                never truncates — the sibling price block absorbs the squeeze
                on its secondary „უახლოესი: …" line instead. */}
            <span className="truncate">{paused ? 'პაუზაზეა' : canPropose ? 'შემომთავაზე დრო' : noSlots ? 'დროები არ არის' : 'დაჯავშნა'}</span>
          </button>
        )}
      </div>
    </div>
    {/* Status strip — renders ONLY when there is a state to explain. The
        default („bookable") case used to carry the free-cancellation line;
        removed 2026-08-05 at the owner's request, and with it the strip
        itself, rather than leaving an empty bordered band on the bar. */}
    {(paused || failed || canPropose || noSlots) && (
      <div className="border-t border-ink-100 px-4 py-2 flex items-center justify-center gap-4 text-meta text-ink-500">
        {paused ? (
          <span>ჯავშნები დროებით შეჩერებულია</span>
        ) : failed ? (
          <span>თავისუფალი დროები ვერ ჩაიტვირთა</span>
        ) : canPropose ? (
          <span>გამოქვეყნებული დრო ჯერ არ არის — შესთავაზე შენთვის მოსახერხებელი</span>
        ) : (
          // Don't re-issue the instruction the button beside it already is. This
          // line's job is the REASON („no published time"), not a second „მიწერე".
          <span>გამოქვეყნებული დრო ჯერ არ არის — შეთანხმდით მიმოწერაში</span>
        )}
      </div>
    )}
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
const AuthPromptSheet = ({ tutorId, intent, start, serviceId, onDismiss }: { tutorId: string; intent: 'book' | 'message' | null; start?: Date | null; serviceId?: string | null; onDismiss: () => void }) => {
  // Escape / scroll-lock / focus trap come from the Sheet container.
  // The picked time and tier ride along, so „ჯავშანი გაგრძელდება" is true:
  // the profile re-seeds them on arrival instead of asking again.
  const bookQs = new URLSearchParams({ rebook: '1' })
  if (start) bookQs.set('start', start.toISOString())
  if (serviceId) bookQs.set('service', serviceId)
  const target = `/tutors/${tutorId}${intent === 'book' ? `?${bookQs}` : intent === 'message' ? '?intent=message' : ''}`
  const q = `redirect=${encodeURIComponent(target)}`
  return (
    <Sheet
      open
      onClose={onDismiss}
      size="sm"
      ariaLabel="ავტორიზაცია საჭიროა"
      title={intent === 'book' ? 'შედი, რომ დაიჯავშნო' : intent === 'message' ? 'შედი, რომ მისწერო ექსპერტს' : 'შედი, რომ გააგრძელო'}
    >
        <p className="text-small text-ink-600 leading-[1.55]">
          წუთში მორჩები — აქვე დაბრუნდები{intent === 'book' ? ' და ჯავშანი გაგრძელდება' : ''}.
        </p>
        <div className="mt-5 space-y-2.5">
          <Link href={`/signin?${q}`} className="tap-shrink w-full h-12 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow transition-all duration-fast">
            შესვლა
          </Link>
          <Link href={`/signup?${q}`} className="w-full h-12 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-75 text-ink-800 font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast">
            რეგისტრაცია
          </Link>
        </div>
        <p className="mt-4 mb-2 text-meta text-ink-500 text-center inline-flex items-center gap-1.5 w-full justify-center">
          <Icon.shieldCheck className="w-3 h-3 text-success-600" />
          {PAYMENTS_LIVE ? 'გადახდა დაცულია' : 'დაჯავშნა უფასოა — გადახდები მალე'}
        </p>
    </Sheet>
  )
}

/* ───── Similar experts — fetches real tutors in the same category ───── */
type SimilarTutor = {
  id: string
  slug: string | null
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
            // Slug, not the cuid: a cuid href 308s to the slug and the redirect
            // downgrades the navigation to a full load, which kills the photo
            // view-transition (CLAUDE.md, animation pass 2026-08-01).
            slug: t.slug ?? null,
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
          <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">მსგავსი ექსპერტები</h2>
        </div>
        <Link href={`/tutors${categorySlug ? `?category=${categorySlug}` : ''}`} className="text-meta text-ink-600 hover:text-ink-900 font-display font-semibold inline-flex items-center gap-1 transition-colors duration-fast">
          {categoryName ? `ყველა · ${categoryName}` : 'ყველა ექსპერტი'}
          <Icon.chevR className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto sm:overflow-visible -mx-6 sm:mx-0 px-6 sm:px-0 pb-2 sm:pb-0 snap-x snap-mandatory sm:snap-none">
        {tutors.map(t => (
          <Link
            key={t.id}
            href={`/tutors/${t.slug || t.id}`}
            /* min-w-0: a grid item defaults to min-width:auto, so a long word
               inside would grow this track past its 1fr share instead of
               being clamped by it. */
            className="shrink-0 sm:shrink w-[260px] sm:w-auto min-w-0 text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-4 snap-start"
          >
            <div className="flex items-start gap-3">
              <img src={t.avatar || DEFAULT_AVATAR} alt="" width={60} height={60} loading="lazy" decoding="async" className="w-[60px] h-[60px] rounded-full object-cover shrink-0 ring-2 ring-ink-100" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-body font-bold text-ink-900 tracking-tight truncate">{t.name}</div>
                <div className="text-meta text-ink-500 truncate mt-0.5">{t.specialty}</div>
                {t.categoryName && (
                  /* max-w-full + a truncating span: the chip's text is a flex
                     item with min-width:auto, i.e. it refuses to go below the
                     longest word („გადასახადები" = 114px at this size) and
                     pushed the pill outside the card. `truncate` sets
                     overflow:hidden, which is what makes that automatic
                     minimum resolve to 0 — the pill now clamps to its column
                     and ellipsises instead of spilling. */
                  <div className="mt-1.5 inline-flex max-w-full items-center gap-1 px-2 h-5 rounded-pill bg-brand-50 text-brand-800 font-display text-micro font-semibold uppercase">
                    <span className="truncate">{t.categoryName}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3.5 pt-3 border-t border-ink-100 flex items-center justify-between">
              <div className="inline-flex items-baseline gap-1 text-meta">
                {t.rating > 0 ? (
                  <>
                    <Icon.star className="w-3 h-3 text-warning-500 self-center" />
                    <span className="font-display font-bold text-ink-900 tabular-nums">{fmtRating(t.rating)}</span>
                    {t.sessions > 0 && <span className="text-ink-500 tabular-nums">· {t.sessions}</span>}
                  </>
                ) : (
                  <span className="text-ink-400 text-meta">ახალი</span>
                )}
              </div>
              <div className="font-display text-body font-bold text-ink-900 tabular-nums tracking-tight">₾{t.price}<span className="text-meta font-medium text-ink-500 tracking-normal">/ სესია</span></div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ───── Specs strip — compact stats row ───── */
/* SpecsGrid (sessions · response time · years) was DELETED 2026-07-29.
 *
 * It restated three facts the identity header already carried, in a heavier
 * type size — the same number appeared up to three times on one desktop screen
 * (header, this strip, the booking rail's stat-trio), so none of them read as
 * authoritative. It also could not survive our own data: of the ten live
 * experts, ZERO have a measured response time, nine have zero sessions, and
 * four have none of the three — for them a bordered section rendered one lone
 * number or nothing at all.
 *
 * No comparable marketplace runs such a strip: MentorCruise and ADPList lead
 * with photo + role-at-company, Preply leads with the intro video. Identity and
 * the video are what a first-time buyer evaluates; counters are what a mature
 * marketplace adds later. Don't reintroduce it — if a number is worth showing,
 * it belongs in exactly one place, at the weight it deserves.
 */

/* ───── About ───── */
const AboutSection = ({ tutor }: { tutor: TutorDetail | null }) => {
  // A long bio is a wall of text on a phone. Below lg we clamp to ~8 lines
  // and offer an explicit expand; desktop keeps the full text (the right
  // rail balances it there). Hooks run unconditionally (before any return).
  const [bioExpanded, setBioExpanded] = useState(false)
  if (!tutor) return null
  const bio = tutor.bio ?? tutor.user.bio
  // The headline is printed in the identity header, ~300px above. Repeating it
  // here as a large pull-quote made the same sentence the two most prominent
  // pieces of text on the page. About = the bio; no bio, no section.
  if (!bio) return null
  // Split bio into paragraphs by double newline or period-space+capital.
  const paragraphs = bio ? bio.split(/\n\n+/).filter(p => p.trim()) : []
  const isLong = (bio?.length ?? 0) > 420
  return (
    <section id="overview" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <Eyebrow className="mb-4">ჩემ შესახებ</Eyebrow>
      {paragraphs.length > 0 && (
        <>
          <div className={`space-y-4 text-body-lg text-ink-700 leading-[1.65] max-w-[640px] whitespace-pre-wrap ${isLong && !bioExpanded ? 'max-lg:line-clamp-[8]' : ''}`}>
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {isLong && (
            <button
              type="button"
              onClick={() => setBioExpanded(v => !v)}
              className="lg:hidden mt-3 h-11 -ml-1 px-1 inline-flex items-center gap-1.5 font-display text-small font-semibold text-brand-700 no-caps"
              aria-expanded={bioExpanded}
            >
              {bioExpanded ? 'ჩაკეცვა' : 'სრულად წაკითხვა'}
              <Icon.chevD className={`w-4 h-4 transition-transform duration-fast ${bioExpanded ? 'rotate-180' : ''}`} />
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
  // Shared ordering: flagship (longest PAID) first, free intro last. Raw payload
  // order could lead with a free 15-min tier, which reads as the main offer.
  const tiers = orderedTiers(consultations)
  return (
    <section id="services" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow className="mb-3">სერვისები</Eyebrow>
          <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">როგორ დაგეხმარები</h2>
        </div>
        <span className="text-meta text-ink-500 font-display tabular-nums">{consultations.length} სერვისი · ფიქსირებული ფასი</span>
      </div>

      <div className="mt-7 grid sm:grid-cols-2 gap-3">
        {tiers.map((s, i) => (
          <article key={s.id} className="rounded-card border border-ink-200 bg-white p-5 hover:border-ink-300 hover-lift flex flex-col">
            <div className="font-display text-meta font-bold text-brand-700 tabular-nums mb-2">{String(i+1).padStart(2, '0')}</div>
            <h3 className="font-display text-body-lg font-bold text-ink-900 tracking-tight leading-tight">{s.title}</h3>
            {s.description && <p className="text-small text-ink-600 mt-2 leading-[1.55] flex-1">{s.description}</p>}
            <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between">
              <div>
                <Eyebrow tone="muted">{s.minutes} წუთი</Eyebrow>
                {/* tierPriceLabel, not „₾{price}“ — a free intro tier used to
                    render as „₾0", which reads like a broken price, not a gift. */}
                <div className="font-display text-h3 font-bold text-ink-900 tabular-nums leading-none mt-1">{tierPriceLabel(s)}</div>
              </div>
              <button type="button" onClick={() => onBook(s)} className="h-11 px-4 rounded-btn bg-brand-50 hover:bg-brand-600 hover:text-white border border-brand-200 hover:border-brand-600 text-brand-700 font-display font-semibold text-meta tracking-wide inline-flex items-center gap-1 transition-colors duration-fast">
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
// `fileUrl` no longer travels in the payload (a base64 diploma would add
// megabytes to every profile response) — `hasFile` says a scan exists and the
// bytes come from /api/certificates/<id>/file. `fileUrl` stays optional for
// legacy externally-hosted links.
type CertItem = { id: string; title: string; issuer?: string | null; year: number; fileUrl?: string | null; hasFile?: boolean; verified: boolean }
type EduItem = { id: string; school: string; degree: string; field: string | null; startYear: number; endYear: number | null }
type ExpItem = { id: string; company: string; role: string; startYear: number; endYear: number | null; description: string | null }

/**
 * A certificate thumbnail that degrades instead of breaking. `hasFile` says a
 * row HAS bytes, not that they are still fetchable, so a stored-then-lost scan
 * rendered the browser's broken-image glyph inside a trust section. On failure
 * we fall back to the neutral document mark — the card stays, the frame stays,
 * only the promise of a preview is withdrawn.
 */
/**
 * Profile portrait with a state-backed fallback — the identity-header twin of
 * <ExpertPhoto> on the browse card. See the note at its call site for why the
 * fallback cannot be a DOM write inside `onError`.
 */
const ProfilePhoto = ({ src, name }: { src?: string | null; name: string }) => {
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  const shown = !src || failed ? DEFAULT_AVATAR : src
  const real = !!src && !failed

  // Esc closes, and the page behind must not scroll under the overlay.
  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [zoom])

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shown}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  )

  // Only a REAL photo is worth opening. The placeholder silhouette enlarges to
  // nothing, and a control that does nothing is worse than no control.
  if (!real) return img

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label={`${name} — ფოტოს გადიდება`}
        className="block rounded-full overflow-hidden cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {img}
      </button>
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setZoom(false)}
          // z-sheet, not a hand-written number: this is a page-level modal and
          // must sit under a destructive confirm and a toast (see the stacking
          // order in CLAUDE.md).
          className="fixed inset-0 z-sheet bg-ink-900/85 p-6 flex items-center justify-center motion-safe:animate-fade-in-fast cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shown}
            alt={name}
            onClick={e => e.stopPropagation()}
            className="max-w-[min(680px,92vw)] max-h-[86dvh] w-auto h-auto object-contain rounded-card shadow-float cursor-default"
          />
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="დახურვა"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/95 text-ink-800 hover:bg-white inline-flex items-center justify-center shadow-sm transition-colors duration-fast"
          >
            <Icon.close className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  )
}

const CertThumb = ({ src, alt }: { src: string; alt: string }) => {
  const [failed, setFailed] = useState(false)
  if (failed) return <Icon.doc className="w-7 h-7 text-ink-300" />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  )
}

const CertificatesSection = ({ items }: { items: CertItem[] }) => {
  // ── Rows with NO document do not render (2026-07-31) ──────────────────────
  // A certificate whose entire content is „IMG_2763 · 2026" is not a credential,
  // it is the residue of a failed upload: a zod `max(500)` on `fileUrl` silently
  // rejected every base64 diploma before 2026-07-29, so those rows kept the
  // camera's filename as their title and nothing else. Framed under a heading
  // that promises „დიპლომები და სერტიფიკატები" and „გადამოწმებული აღინიშნება",
  // an empty frame does not read as neutral — it reads as a credential that
  // failed to verify, which is worse than showing nothing.
  //
  // NOTHING IS DELETED. This filters the RENDER only; the row stays in the DB
  // and reappears the moment the expert uploads the scan (which is what
  // lib/expertActivation nudges them to do). No expert-authored text is touched.
  //
  // `href` is resolved once here rather than per-branch below, so the list and
  // the anchors can never disagree about whether a document exists.
  const withFile = (items ?? [])
    .map(c => ({ c, href: c.hasFile ? `/api/certificates/${c.id}/file` : safeHttpUrl(c.fileUrl) }))
    .filter((x): x is { c: CertItem; href: string } => !!x.href)
  // Every row lacked a file → the section as a whole has nothing to prove, so it
  // is absent rather than an empty heading over blank space.
  if (withFile.length === 0) return null
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow className="mb-3">სერტიფიკატები</Eyebrow>
          <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">დიპლომები და სერტიფიკატები</h2>
        </div>
        <span className="text-meta text-ink-500 font-display inline-flex items-center gap-1.5">
          <Icon.shieldCheck className="w-3.5 h-3.5 text-brand-600" />
          გადამოწმებული აღინიშნება
        </span>
      </div>

      {/* Cards with a real preview, not text pills. A diploma is a VISUAL trust
          signal — rendering it as „IMG_2763.jpeg · მითითებული არ არის · 2026"
          threw that away and looked broken. The scan loads per-certificate from
          its own cacheable URL, so nothing heavy enters the profile payload. */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {withFile.map(({ c, href }) => {
          // `href` is guaranteed by the filter above — legacy rows carry an
          // external https link, new ones are served by id, and rows with
          // neither never reach this map.
          const inner = (
            <>
              <div className="aspect-[4/3] w-full bg-ink-50 border-b border-ink-100 overflow-hidden flex items-center justify-center">
                <CertThumb src={href} alt={c.title} />
              </div>
              <div className="p-3">
                <div className="font-display text-small font-bold text-ink-900 leading-snug line-clamp-2">{c.title}</div>
                <div className="mt-1 flex items-center gap-1.5 text-meta text-ink-500">
                  {/* An empty issuer renders as NOTHING. It used to be the
                      literal string „მითითებული არ არის", stored in the column
                      and shown as if the expert had written it. */}
                  {c.issuer?.trim() && <span className="truncate">{c.issuer.trim()}</span>}
                  {c.issuer?.trim() && <span className="text-ink-300">·</span>}
                  <span className="tabular-nums shrink-0">{c.year}</span>
                  {c.verified && <VerifiedMark size={14} title="გადამოწმებული სერტიფიკატი" />}
                </div>
              </div>
            </>
          )
          // Always an anchor now: the file-less branch that used to render a
          // dead <div> here is unreachable, because those rows are filtered out
          // above rather than shown as an empty frame.
          return (
            <a
              key={c.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-card border border-ink-200 bg-white overflow-hidden block hover-lift transition-all duration-fast"
              aria-label={`${c.title} — გახსნა`}
            >
              {inner}
            </a>
          )
        })}
      </div>
    </section>
  )
}

const EducationSection = ({ items }: { items: EduItem[] }) => {
  if (!items || items.length === 0) return null
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <Eyebrow className="mb-3">განათლება</Eyebrow>
      <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">ფორმალური საფუძველი</h2>

      <ol className="mt-6 relative space-y-5 pl-6">
        <span className="absolute left-[7px] top-2 bottom-2 w-px bg-ink-200" aria-hidden />
        {items.map(e => (
          <li key={e.id} className="relative">
            <span className="absolute left-[-24px] top-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 ring-4 ring-white" />
            <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{e.school}</div>
            <div className="text-small text-ink-700 mt-0.5">{e.degree}{e.field ? ` · ${e.field}` : ''}</div>
            <div className="text-meta text-ink-500 tabular-nums mt-0.5">{e.startYear} – {e.endYear ?? 'დღემდე'}</div>
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
      <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">სამუშაო ისტორია</h2>

      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {items.map(x => (
          <article key={x.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="font-display text-body font-bold text-ink-900 leading-snug">{x.role}</div>
            <div className="text-small text-ink-700 mt-0.5">{x.company}</div>
            <div className="text-meta text-ink-500 tabular-nums mt-1">{x.startYear} – {x.endYear ?? 'ახლა'}</div>
            {x.description && <p className="mt-2 text-small text-ink-600 leading-[1.55]">{x.description}</p>}
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
  sessionsCount = 0,
  rating = 0,
  reviewsCount = 0,
  signedIn,
  consultations = [],
  canMessage = false,
  onMessage,
  isOwnProfile = false,
  viewerCantBook = false,
  canProposeCategory = false,
}: {
  /** Request-based booking is scoped to one category server-side; the CTA
   *  must be scoped identically or it promises what the POST refuses. */
  canProposeCategory?: boolean
  onOpen: () => void
  availability?: ApiSlot[]
  busySlots?: BusySlot[]
  slotsState?: SlotsState
  onRetrySlots?: () => void
  tutorPrice?: number
  sessionMin?: number
  bufferMin?: number
  sessionsCount?: number
  rating?: number
  reviewsCount?: number
  signedIn?: boolean | null
  consultations?: ConsultationItem[]
  canMessage?: boolean
  onMessage?: () => void
  isOwnProfile?: boolean
  viewerCantBook?: boolean
}) => {
  // The FLAGSHIP tier — one price, one length, the same service the „განრიგი"
  // grid and the tier step already lead with. `sessionMin` is that tier's length
  // (resolved by the caller via primaryServiceMin), so it is also the fallback
  // when the expert has published no tiers at all.
  const flagship = primaryPriceLabel(consultations, tutorPrice, sessionMin)
  const hasTiers = consultations.length >= 2
  const priceLabel = flagship.label
  const subLabel = `/ ${flagship.minutes} წუთი`

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
  // The expert genuinely has no upcoming free time AND we know it (slots
  // resolved, not still in flight and not a failed fetch). In that state the
  // booking CTA has nothing to open, so messaging is promoted from secondary to
  // primary and the disabled button is not rendered at all — see the CTA below.
  // `isOwnProfile`/`viewerCantBook` are handled by earlier branches, so they are
  // not re-tested here; `canMessage` is true for guests too (onMessage runs
  // requireAuth first), so a signed-out visitor still gets a live primary.
  // See the mobile bar: „no published time" stops being a dead end once the
  // visitor can propose one, and the propose screen is reachable ONLY through
  // this button.
  const canPropose = FEATURE_REQUEST_BOOKING && canProposeCategory && !pending && !failed && nextFree === null
  const messagePromoted = !pending && !failed && nextFree === null && !canPropose && canMessage && !!onMessage

  return (
    <aside className="lg:sticky lg:top-[80px]">
      <div className="bg-white rounded-card border border-ink-200 shadow-card overflow-hidden">

        {/* Price + mode toggle */}
        <div className="px-6 pt-6 pb-5 border-b border-ink-100">
          {/* Honest popularity signal — derived from real completed sessions,
              not a fabricated "N bookings in 48h" figure. */}
          {sessionsCount >= 100 && (
            <div className="mb-3 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill bg-brand-50 text-brand-700 font-display text-meta font-semibold">
              <Icon.spark className="w-3 h-3" />
              პოპულარული · {sessionsCount} სესია
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="font-display text-display font-bold text-ink-900 tabular-nums leading-none tracking-tight">{priceLabel}</span>
            <span className="text-small text-ink-500">{subLabel}</span>
          </div>

          {/* Stat-trio DELETED 2026-07-29 — it was the third printing of
              sessions/years/response on one screen, and with real data it
              collapsed to a single cell that stretched full width and rendered
              one digit at price size. What survives is the rating: the one
              number MentorCruise, ADPList and Preply all still show at the
              point of decision. Rendered as a quiet line, not a grid. */}
          {rating > 0 && (
            <div className="mt-3 inline-flex items-baseline gap-1.5 text-small">
              <Icon.star className="w-3.5 h-3.5 text-warning-500 self-center" />
              <span className="font-display font-bold text-ink-900 tabular-nums">{fmtRating(rating)}</span>
              {reviewsCount > 0 && <span className="text-ink-500 tabular-nums">· {reviewsCount} შეფასება</span>}
            </div>
          )}
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
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 px-3 py-4 text-center text-meta text-ink-500 mb-4">
              {failed
                ? 'თავისუფალი დროები ვერ ჩაიტვირთა.'
                : canPropose
                  ? 'ჯერ არ არის გამოქვეყნებული დრო — შესთავაზე შენთვის მოსახერხებელი.'
                  : 'ჯერ არ არის თავისუფალი დრო.'}
            </div>
          ) : (
            /* One fact, one place (2026-08-04, owner's call). This box used to
               carry three pressable „უახლოესი დროები" chips — actual clock
               times — while the „განრიგი" section below listed every bookable
               time for the same expert. Two lists of the same times on one
               page, and the rail is desktop-only, so the duplication existed
               only where the page had the most room to show it once properly.
               The rail now states WHEN the expert is next free (a day, not a
               time) and hands the choosing to „განრიგი", which is built for it.
               NB this also removes the card's only route into the sheet with a
               pre-picked start; the section's chips still carry one. */
            <div className="flex items-center gap-2.5 text-small text-ink-700 mb-4">
              <span className="w-7 h-7 rounded-full bg-brand-50 inline-flex items-center justify-center shrink-0">
                <Icon.cal className="w-3.5 h-3.5 text-brand-600" />
              </span>
              <span className="leading-snug">უახლოესი დრო: <span className="font-display font-bold text-ink-900">{DAY_NAMES_FULL[isoWeekday(nextFree)]}, {nextFree.getDate()} {KA_MONTHS_FULL[nextFree.getMonth()]}</span></span>
            </div>
          )}
          {isOwnProfile ? (
            <Link href="/tutor/profile" className="tap-shrink w-full h-12 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast">
              პროფილის რედაქტირება
            </Link>
          ) : viewerCantBook ? (
            <div className="w-full h-12 rounded-btn bg-ink-75 border border-ink-200 text-ink-500 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center">
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
          ) : messagePromoted ? (
            // NO free time, and the slots really did load. The old code rendered
            // „დაჯავშნე" DISABLED here — a dead primary at the top of the one
            // surface that exists to convert, wearing `bg-ink-200`, the warm
            // hairline beige, which is the only filled-beige control in the whole
            // system and reads as broken rather than as unavailable. There IS a
            // live next step for this visitor, so it takes the primary slot and
            // the dead button is gone entirely: messaging is how a slot-less
            // expert gets booked (they agree a time, then publish it).
            <button
              type="button"
              onClick={onMessage}
              className="w-full h-12 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-all duration-fast shadow-brand-glow"
            >
              <Icon.chat className="w-4 h-4" /> მიწერე ექსპერტს
            </button>
          ) : (
            <button
              type="button"
              disabled={nextFree === null && !canPropose}
              onClick={onOpen}
              className="w-full h-12 rounded-btn bg-gradient-cta hover:brightness-105 disabled:bg-none disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-all duration-fast shadow-brand-glow disabled:shadow-none"
            >
              {canPropose
                ? (signedIn === false ? 'შესვლა და დროის შეთავაზება' : 'შემომთავაზე დრო')
                : signedIn === false ? 'შესვლა და დაჯავშნა' : 'დაჯავშნე'}
            </button>
          )}
          {/* Pre-booking messaging — secondary to the primary booking CTA. The
              objection-handler: ask before committing to a ₾100+ session. Skipped
              when it has already been promoted TO the primary above, so the rail
              never stacks the same action on itself. */}
          {canMessage && onMessage && !messagePromoted && (
            <Btn variant="secondary" size="lg" onClick={onMessage} className="w-full mt-2.5">
              <Icon.chat className="w-4 h-4" /> მიწერე ექსპერტს
            </Btn>
          )}
          {/* Decision-point reassurance: what happens NEXT, one line. With no
              slots to pick there is no „next you choose a time", so an honest
              line replaces it. (The free-cancellation line that used to sit
              under this one was removed 2026-08-05 at the owner's request.) */}
          <p className="mt-2.5 text-meta text-ink-500 text-center leading-snug">
            {messagePromoted
              ? 'დროზე მიმოწერაში შეთანხმდებით'
              : hasTiers ? 'შემდეგ აირჩევ სერვისსა და დროს' : 'შემდეგ აირჩევ ზუსტ დროს'}
          </p>
        </div>

        {/* Bottom strip */}
        <div className="border-t border-ink-100 px-6 py-3 flex items-center justify-center gap-3 text-meta">
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
  const ids = items.map(i => i.id).join(',')

  useEffect(() => {
    const list = ids ? ids.split(',') : []
    if (list.length < 2) return
    let frame = 0
    const measure = () => {
      frame = 0
      // NOTE: there is deliberately no reveal threshold here any more. The pill
      // used to appear only after you scrolled ~400px; it is now permanent
      // chrome, present from the moment the profile opens. The effect below is
      // purely the scroll-spy that highlights the current section.
      //
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

  // `hidden` still applies — it's a genuine conflict (the booking sheet / auth
  // gate is open on top), not a scroll state.
  if (items.length < 2 || hidden) return null
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
      // DESKTOP ONLY (2026-08-01). This jump-nav is a SHORTCUT, not a path:
      // every section it links to is reachable by scrolling, so removing it on
      // phones takes nothing away. (That is what separates it from the
      // saved-experts heart, which was hidden on mobile with NO other route —
      // the reason this was repositioned twice before being cut.)
      //
      // Measured on a phone before cutting it: a profile runs 6–8.3 screens, and
      // header + this nav + the booking bar occupied 241px = 29% of a 390×844
      // viewport, permanently. Anchored at the bottom it landed on a bio
      // paragraph (`.glass-over-copy` could only make that coverage opaque, not
      // stop it); moved under the header at 72px it left an 8px slit that body
      // text showed through as a band of cut type; flush at 64px it read as a
      // second bar stacked on the first. Every position was a different way of
      // spending a third of a small screen on a convenience.
      //
      // No major marketplace ships a floating section nav on a mobile profile.
      // If the function is ever wanted back on phones, the right shape is an
      // IN-FLOW index under the identity card — visible while the reader is
      // orienting, then scrolled away — not another fixed layer.
      className="hidden lg:block fixed left-1/2 -translate-x-1/2 z-pill pointer-events-none bottom-6"
    >
      <nav
        aria-label="პროფილის სექციები"
        // `.glass` (globals.css) owns the whole surface — translucency, blur,
        // hairline, edge-highlight, shadow AND the compositor promotion that
        // keeps a blurred fixed element from strobing on mobile scroll. It is
        // glass at every breakpoint now (the old `lg:`-only blur was the
        // avoidance workaround; promotion is the real fix). Add nothing but the
        // radius here — no bg-/border-/shadow- utilities on a glass surface.
        // `glass-over-copy`: below lg this pill floats directly over the bio
        // paragraph, where 55% translucency smeared a line into unreadability.
        // See the utility's note in globals.css — opacity is the only fix.
        className="pointer-events-auto max-w-[calc(100vw-2rem)] rounded-pill glass glass-over-copy motion-safe:animate-slide-in-b"
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
              // Active chip is BRAND green, not `bg-ink-900`. Black was the only
              // non-palette surface left on this control and it read as a
              // foreign element sitting on the site's own glass.
              className={`shrink-0 h-11 px-3.5 rounded-pill inline-flex items-center font-display text-small font-semibold whitespace-nowrap no-caps transition-colors duration-fast ${
                active === it.id ? 'bg-brand-600 text-white shadow-xs' : 'text-ink-600 hover:text-ink-900 hover:bg-ink-50'
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
  // The REAL profile id — never the URL segment.
  //
  // The URL is now the human slug („/tutors/ana-gagoshidze"), and every request
  // this component makes (/api/tutors/…, /api/favorites?tutorId=…, booking
  // submits) is keyed by the profile's actual id. Reading `params.id` here sent
  // the slug to those endpoints, which 404'd — it broke booking on every
  // profile the moment slugs shipped. `initialTutor` is the server's own row,
  // so its id is authoritative; the param is only a fallback for the id-form
  // URL (and for the brief window before the seed exists).
  const tutorId = initialTutor?.id ?? params?.id
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
  // The slot + tier the visitor picked BEFORE the auth gate (written by
  // AuthPromptSheet). Reading them here is what makes the gate's promise —
  // „ჯავშანი გაგრძელდება" — literally true; before this the flow reopened
  // empty and the person re-hunted the same time.
  const resumeStartIso = searchParams?.get('start') ?? null
  const resumeServiceId = searchParams?.get('service') ?? null
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
  // THE SLOT THE VISITOR ALREADY PICKED. The gate used to promise „ჯავშანი
  // გაგრძელდება" and then return ?rebook=1 with nothing in it — the chosen
  // time and tier were dropped and the person had to re-find the exact slot
  // they had just tapped. These travel through the redirect and are re-seeded
  // on arrival (see the ?start/?service reader below).
  const [authStart, setAuthStart] = useState<Date | null>(null)
  const [authServiceId, setAuthServiceId] = useState<string | null>(null)
  const requireAuth = React.useCallback((intent?: 'book' | 'message', ctx?: { start?: Date | null; service?: ConsultationItem | null }) => {
    if (signedIn === false) {
      setAuthIntent(intent ?? null)
      setAuthStart(ctx?.start ?? null)
      setAuthServiceId(ctx?.service?.id ?? null)
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
  // Request-based booking is scoped to one category on the SERVER (lib/abroad).
  // Every CTA that offers it must read the same predicate, or the button
  // promises something POST /api/bookings refuses.
  const isAbroadProfile = isAbroadCategory(tutorData?.category?.slug ?? null)
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
    if (requireAuth('book', { service: s })) return
    setSelectedService(s)
    setBookingStart(null)
    setBookingOpen(true)
  }
  // Inline-schedule entry point (1.6): opens the flow with the tapped time
  // preselected; multi-tier experts still answer the tier step first.
  // `service` comes from the #schedule tier switcher: the times shown there are
  // derived for THAT service, so it must travel with the tap. Passing null (as
  // this did unconditionally) meant the sheet re-asked for the tier and then
  // silently discarded the start whenever the chosen tier was longer.
  const openSlotBooking = (start: Date, service: ConsultationItem | null = null) => {
    if (isPaused) return
    if (requireAuth('book', { start, service })) return
    setSelectedService(service)
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
    // Re-seed what the gate carried. A stale/past `start` is dropped rather
    // than passed on — the flow would reject it anyway, and an expired time
    // silently preselected is worse than none.
    const resumed = resumeStartIso ? new Date(resumeStartIso) : null
    const usableStart = resumed && !isNaN(resumed.getTime()) && resumed.getTime() > Date.now() ? resumed : null
    const tiers: ConsultationItem[] = tutorData?.consultations ?? []
    // No explicit tier in the URL? The carried start came from a chip derived
    // for the FLAGSHIP tier, so resume on that one — otherwise the sheet
    // re-validates the start against a different duration and drops it.
    const flagMin = primaryServiceMin(tiers, tutorData?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin)
    const resumedService = resumeServiceId
      ? (tiers.find(t => t.id === resumeServiceId) ?? null)
      : (usableStart ? (tiers.find(t => t.minutes === flagMin) ?? null) : null)
    setSelectedService(resumedService)
    setBookingStart(usableStart)
    setBookingOpen(true)
    setRebookConsumed(true)
  }, [rebookAutoOpen, rebookConsumed, loadState, isPaused, signedIn, requireAuth, resumeStartIso, resumeServiceId, tutorData])

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
            <h1 className="font-display text-h2 font-bold text-ink-900">ექსპერტი ვერ მოიძებნა</h1>
            <p className="text-body text-ink-500 mt-2">პროფილი წაიშალა ან ბმული არასწორია.</p>
            <Link href="/tutors" className="tap-shrink mt-6 inline-flex h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body items-center gap-2">
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
            <h1 className="font-display text-h2 font-bold text-ink-900">პროფილი ვერ ჩაიტვირთა</h1>
            <p className="text-body text-ink-500 mt-2 leading-relaxed">ქსელის დროებითი ხარვეზი — სცადე თავიდან.</p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setLoadAttempt(a => a + 1)}
                className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 transition-colors duration-fast"
              >
                სცადე თავიდან
              </button>
              <Link href="/tutors" className="h-11 px-5 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center transition-colors duration-fast">
                ყველა ექსპერტი
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading gate (B1): until the fetch resolves, `tutorData` is null. Rendering
  // the full profile here used to flash "—" names, an empty facts strip, a
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
          <div className="sm:mt-6 grid lg:grid-cols-[1fr_360px] gap-8 xl:gap-12 motion-safe:animate-pulse">
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
    ...((tutorData?.experience?.length ?? 0) > 0 ? [{ id: 'experience', l: 'გამოცდილება' }] : []),
    { id: 'reviews', l: 'შეფასებები' },
  ]

  // ONE service length for every pre-tier surface (rail, mobile bar, #schedule)
  // so they can't disagree: the expert's FLAGSHIP service — longest PAID tier —
  // falling back to the profile duration. It used to be the SHORTEST service,
  // which drew the schedule on a grid most of whose starts could not hold the
  // service the visitor actually wanted (see primaryService in slots.ts).
  // Starts are DERIVED from it (windows − bookings − length), never read off a
  // pre-sliced row's `booked` flag.
  const previewMin = primaryServiceMin(tutorData?.consultations ?? [], tutorData?.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin)
  // The headline price shared by the rail + mobile bar. It reads off the SAME
  // flagship tier `previewMin` above is derived from, so the price and the times
  // beside it now describe one service. It used to be `fromPriceLabel`, i.e. the
  // CHEAPEST tier — the rail said „₾25-დან" while the browse card said „₾80" and
  // the service list said both. See primaryPriceLabel in slots.ts.
  const headlinePrice = primaryPriceLabel(
    tutorData?.consultations ?? [],
    tutorData?.price ?? TUTOR_DEFAULTS.price,
    previewMin,
  )
  // Absent from the payload until the profile carries it — 0 changes nothing.
  const bufferMin = typeof tutorData?.bufferMin === 'number' && tutorData.bufferMin > 0 ? tutorData.bufferMin : 0

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      <PublicTopBar initialUser={initialUser} />

      {/* pb: on mobile the page carries a fixed stack — the section pill at 150px
          and the booking bar below it — so the final section needs room to be
          scrolled ABOVE them. Without it the last paragraph could never be read
          in full, no matter how far you scrolled. */}
      <Container as="main" id="main" className="pt-4 sm:pt-7 lg:pt-9 pb-[168px] lg:pb-16">
        {/* Owner preview note — the expert opened their own profile from the
            editor's „ნახე შენი პროფილი“ button (?preview=1). Shown only when the
            signed-in viewer owns this profile, so a student never sees it.
            The page already resolves for the owner even while paused (nothing
            gates on available === false — only admin-suspension hides). */}
        {searchParams?.get('preview') === '1' && initialUser?.id && tutorData?.user?.id === initialUser.id && (
          <div className="mb-4 rounded-card border border-ink-200 bg-ink-50 p-3 flex items-center gap-2 text-small text-ink-600">
            <Icon.eye className="w-4 h-4 shrink-0 text-ink-400" />
            ასე გხედავს სტუდენტი.
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
              <div className="font-display text-body font-bold text-warning-800">ექსპერტი დროებით პაუზაზეა</div>
              <p className="text-small text-warning-800/85 mt-1 leading-snug">ახალი ჯავშანი შეჩერებულია. არსებული სესია აქტიურია და მიწერა შეგიძლია.</p>
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
                <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">თავისუფალი დროები</h2>
                <p className="mt-2 text-body text-ink-500 max-w-[520px]">აირჩიე დრო — ჯავშანი არჩეული დროით გაიხსნება.</p>
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
                      <div className="font-display text-body-lg font-bold text-ink-900">დროები ვერ ჩაიტვირთა</div>
                      <p className="text-small text-ink-500 mt-1.5">ქსელის დროებითი ხარვეზი — სცადე თავიდან.</p>
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
                      tutorId={tutorData?.id}
                      consultations={tutorData?.consultations ?? []}
                      onPickSlot={openSlotBooking}
                      categorySlug={tutorData?.category?.slug ?? null}
                      onPropose={() => setBookingOpen(true)}
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
          </div>

          {/* Right: sticky booking — desktop only */}
          <div className="hidden lg:block">
            <StickyBookingCard
                canProposeCategory={isAbroadProfile}
              onOpen={openPaid}
              availability={tutorData?.availability ?? []}
              busySlots={tutorData?.busySlots ?? []}
              slotsState={detailsState}
              onRetrySlots={() => setLoadAttempt(a => a + 1)}
              tutorPrice={tutorData?.price ?? TUTOR_DEFAULTS.price}
              sessionMin={previewMin}
              bufferMin={bufferMin}
              sessionsCount={tutorData?.sessionsCount ?? 0}
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

        {/* Similar experts — FULL WIDTH, deliberately outside the two-column
            grid (moved 2026-08-05). Inside the 1fr column it shared the row
            with the 360px booking rail, so the section measured 808px and its
            4-up grid gave each card 193px: after p-4 and the 60px photo the
            text column was 89px, which truncated every name and let the
            category chip (min-content 114px — Georgian category words don't
            break) hang 26px outside the card. At full width the same cards
            are 295px and everything fits. Nothing here belongs to the rail's
            row, so it costs nothing to lift out. */}
        <SimilarExperts
          excludeId={tutorId}
          categorySlug={tutorData?.category?.slug ?? null}
          categoryName={tutorData?.category?.name ?? null}
        />
      </Container>

      {/* The fixed mobile booking bar overlays the page bottom. The clearance
          covers its TALLEST state — the one that still renders a status strip
          („paused" / „no published time" / load failure), which wraps to two
          lines at 390px. In the ordinary bookable state the bar is now ~72px,
          since the strip no longer carries a line there at all. The
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
              canProposeCategory={isAbroadProfile}
        onBook={openPaid}
        priceLabel={headlinePrice.label}
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
          start={authStart}
          serviceId={authServiceId}
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


