'use client'
// /tutors/[id] — the top of the profile: breadcrumb + the video hero.

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link } from 'next-view-transitions'
import { useToast } from '@/components/ToastProvider'
import { copyToClipboard } from '@/lib/clipboard'
import { fetchMe } from '@/lib/me'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { fmtRating } from '@/lib/fmt'
import { displayHeadline } from '@/lib/headline'
import { categoryPath } from '@/lib/categoryRoutes'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { TUTOR_DEFAULTS } from '@/components/booking/slots'
import { ProfilePhoto, VerifiedMark } from './_bits'
import { TutorDetail, normExternalUrl, toLangLabel } from './_data'

export const Breadcrumb = ({ tutor }: { tutor: TutorDetail | null }) => (
  <nav aria-label="ნავიგაცია" className="font-display text-micro font-semibold uppercase flex items-center gap-2 text-ink-500">
    <Link href="/tutors" className="hover:text-ink-900 transition-colors duration-fast">ექსპერტები</Link>
    {tutor?.category && (
      <>
        <Icon.chevR className="w-3 h-3 text-ink-300" />
        {/* The indexable category landing page, not the /tutors filter (which
            canonicalises away). Expert profiles are the site's deepest crawled
            pages, so this is the link that feeds the category pages upward —
            and it goes through lib/categoryRoutes so it lands on the page
            directly instead of on a 301 to it. Link equity survives a redirect;
            it does not survive it as well as not needing one. */}
        <Link href={categoryPath({ slug: tutor.category.slug, status: tutor.category.status ?? 'VISIBLE', parent: tutor.category.parent })} className="hover:text-ink-900 transition-colors duration-fast">{tutor.category.name}</Link>
      </>
    )}
    <Icon.chevR className="w-3 h-3 text-ink-300" />
    <span className="text-ink-900">{tutor?.user?.fullName ?? TUTOR_DEFAULTS.name}</span>
  </nav>
)

/* priceForDuration + TUTOR_DEFAULTS moved to components/booking/slots.ts —
   the old "MUST stay identical to app/tutors/page.tsx" twin blocks are now a
   single import on both surfaces. Covered by tests/tutor-mapping.test.ts. */

/* ───── Video hero — cover moment with overlapping avatar ───── */
export const VideoHero = ({ tutorId, tutor, requireAuth, viewerCantFav = false }: { tutorId?: string; tutor: TutorDetail | null; requireAuth?: () => boolean; viewerCantFav?: boolean }) => {
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