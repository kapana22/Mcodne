'use client'
// /tutors — one expert as a card, plus the video preview it opens.

import React, { useState, useEffect } from 'react'
import { Link } from 'next-view-transitions'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Icon } from '@/components/Icon'
import { fmtRating } from '@/lib/fmt'
import { displayHeadline } from '@/lib/headline'
import { TUTOR_DEFAULTS, primaryPriceLabel } from '@/components/booking/slots'
import { Tutor, fmtLangs, hasExtraLanguage, initialsAvatarSvg, isTutorBookable, tutorYouTubeId } from './_data'

const VerifiedMark = ({ size = 18 }: { size?: number }) => (
  <span title="გადამოწმებული" className="inline-flex items-center justify-center rounded-full bg-brand-600 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

// Trust signals for a brand-new expert (0 rating / 0 sessions / 0 reviews).
// Their card would otherwise be a lonely „ახალი" over empty space, so surface
// the credibility they DO have — ID-verification, years of experience, an intro
// video, a response promise. Real fields only; each chip renders solely when its
// value truly exists. Calm muted meta row (canon: hairline icons, no loud fills).
// No „ახალი ექსპერტი" lead tag here: the photo pill already says „ახალი", and
// on the unified card the two sat inches apart and read twice.
const NewExpertSignals = ({ t, className = '' }: { t: Tutor; className?: string }) => {
  const signals: { key: string; icon: React.ReactNode; label: React.ReactNode }[] = []
  if (t.verified) signals.push({ key: 'verified', icon: <Icon.shieldCheck className="w-3 h-3 text-brand-600" />, label: 'გადამოწმებული' })
  // `briefcase`, not `thumb`: a thumbs-up is the universal APPROVAL/like mark,
  // so „👍 5 წლის გამოცდილება" read as five endorsements rather than five years
  // — and on a card whose whole job is separating measured facts from claims,
  // borrowing the rating vocabulary for a self-declared number is the one
  // confusion to avoid. Professional experience is a briefcase.
  if (typeof t.yearsExp === 'number' && t.yearsExp > 0) signals.push({ key: 'years', icon: <Icon.briefcase className="w-3 h-3 text-ink-400" />, label: <><span className="font-display font-bold text-ink-900 tabular-nums">{t.yearsExp}</span> წლის გამოცდილება</> })
  if (t.video) signals.push({ key: 'video', icon: <Icon.video className="w-3 h-3 text-ink-400" />, label: 'ვიდეოგაცნობა' })
  if (signals.length === 0) return null
  return (
    <div className={`flex items-center gap-x-3.5 gap-y-1.5 text-meta text-ink-600 flex-wrap ${className}`}>
      {signals.map(s => (
        <span key={s.key} className="inline-flex items-center gap-1">{s.icon}{s.label}</span>
      ))}
    </div>
  )
}

/**
 * An expert portrait that falls back instead of breaking.
 *
 * `||` on `avatarUrl` only covers an ABSENT photo. Two live profiles carry a
 * Google-SSO URL (`lh3.googleusercontent.com/...`) that no longer resolves, and
 * those rendered the browser's broken-image glyph — with the expert's own name
 * as alt text — in the grid whose whole job is to prove the roster is hand-picked.
 *
 * ⚠️ The fallback MUST live in React state. The first version of this fix set
 * `e.currentTarget.src` directly from `onError`; React owns that attribute, so
 * the next render restored the dead URL, the image failed again, and the card
 * flickered back to broken. A DOM mutation cannot win against the renderer —
 * state is the only thing that survives a re-render. (Same reason CertThumb is
 * written this way.)
 *
 * Keyed on `src` by the caller-facing prop: a rotated/changed photo resets the
 * failed flag, so one bad URL never poisons a later good one.
 */
const ExpertPhoto = ({ src, name, eager = false }: { src: string; name: string; eager?: boolean }) => {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  return (
    <img
      src={failed ? DEFAULT_AVATAR : src}
      alt={name}
      /* The first cards' photos ARE the page's LCP element; lazy-loading them
         put the LCP fetch at the lowest priority behind everything (measured
         LCP 1.0–1.6s). First two rows load eager + high. */
      loading={eager ? 'eager' : 'lazy'}
      {...(eager ? { fetchPriority: 'high' as const } : {})}
      decoding="async"
      /* Intrinsic hint only (the element is `absolute inset-0`) — kept equal to
         the thumb's largest rendered size so the aspect ratio it reserves is
         square and the circle never gets a pre-layout oval. */
      width={144}
      height={144}
      onError={() => setFailed(true)}
      className="absolute inset-0 w-full h-full object-cover object-center motion-safe:animate-fade-in-fast"
    />
  )
}

export const TutorCard = ({ t, idx, onPreviewEnter, onBook, saved, onToggleFav, needsSignIn, viewerCantBook = false, viewerCantFav = false }:{ t: Tutor; idx: number; onPreviewEnter: (t: Tutor, anchor: HTMLElement) => void; onBook: (t: Tutor) => void; saved: boolean; onToggleFav: (tutorId: string) => void; needsSignIn?: boolean; viewerCantBook?: boolean; viewerCantFav?: boolean }) => {
  // Prefer the tutor's real avatar; fall back to an initials placeholder so we
  // never render a random pravatar face over a real name (crawler-safe).
  const photoSrc = t.avatarUrl || initialsAvatarSvg(t.name)
  // Inline video-on-hover (Preply-style). Only the hovered card mounts an
  // (muted, looping) iframe, so we never autoplay every video at once.
  const [vhover, setVhover] = useState(false)
  // Advertise the FLAGSHIP service — the longest PAID tier — and nothing else.
  // This used to price `consultationDurationMin`, the profile-level DEFAULT,
  // which is not a service anyone can buy: the card read „₾80 · 30 წთ" for an
  // expert whose real offer is a 60-minute consultation at ₾80, while their
  // profile rail said „₾25-დან" (the cheapest tier). One expert, three prices.
  // `primaryPriceLabel` is the shared source the rail now reads too.
  const flagship = primaryPriceLabel(t.consultations, t.price, t.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin)
  // Gate the CTA on real availability — same rule the detail page's
  // StickyBookingCard uses — so the card never promises a booking the profile
  // will deny with "no published slots".
  const bookable = isTutorBookable(t.nextSlotAt)
  // Video plays INLINE inside the photo on hover (Preply-style) — no permanent
  // panel cluttering the list. Play button opens the full VideoPreview modal.
  const ytId = tutorYouTubeId(t)
  return (
    // COMPACT HORIZONTAL card (2026-07-27): square thumb left, content right,
    // price + actions on the bottom strip. ONE layout at every breakpoint —
    // 1-up on mobile, 2-up from sm. Replaces the photo-banner card, which was
    // both very tall (little fit on screen) and structurally unable to render a
    // sharp portrait — see the photo comment below.
    <article className="group relative rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift overflow-hidden flex flex-col h-full">
      {/* The WHOLE card opens the profile, at every breakpoint (overlay-link
          pattern from app/student/bookings). It is a SIBLING of the controls,
          never a parent — wrapping the card in an <a> would nest the buttons
          inside a link. Anything interactive opts out by sitting above it with
          `relative z-10`; miss that and the overlay silently eats the click. */}
      <Link
        href={`/tutors/${t.slug || t.id}`}
        aria-label={`${t.name} — პროფილი`}
        className="absolute inset-0 z-[1]"
      />

      {/* Save/favorite is a client-only feature (server 403s non-students).
          Pinned to the card corner rather than sitting in the photo/identity
          row: as a flex item it stole ~40px from the content column, which at
          390px is the difference between a readable bio and three words. It is
          NOT on the photo either — a 112px square has no spare corner. The name
          row reserves `pr-9` so the two can never collide. */}
      {!viewerCantFav && (
        <button
          type="button"
          onClick={() => onToggleFav(t.id)}
          aria-label={saved ? 'შენახული' : 'შენახვა'}
          className={`absolute top-2.5 right-2.5 z-10 w-10 h-10 inline-flex items-center justify-center rounded-full transition-colors duration-fast ${saved ? 'text-danger-600' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'}`}
        >
          {saved ? <Icon.heartFilled className="w-4 h-4" /> : <Icon.heart className="w-4 h-4" />}
        </button>
      )}

      {/* Top row — photo + identity. flex-1 so every card in a row ends its
          footer on the same line even when one bio is shorter. */}
      <div className="flex-1 min-w-0 flex flex-col p-4">
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Portrait — a fixed CIRCLE, never a banner (round 2026-08-05: every
              other avatar on the site is a circle — home grid, profile header,
              „მსგავსი ექსპერტები", the SEO landings, chat — and this square was
              the last odd one out). Avatars are stored server-side as a 256×256
              image (app/api/uploads/route.ts resizes on upload, deliberately:
              one 9.4MB base64 avatar once made chat threads 7.5MB / 40s), so
              ~144px is the ceiling that still looks crisp on a 2× screen — the
              old 16/10 banner blew the same 256px source up ~3.7× (visibly
              blurry) AND had to crop a square portrait into a wide frame, which
              cut faces at eye level whatever the object-position. Do NOT turn
              this back into an aspect-ratio banner. Sized UP to 144 at `lg`
              when it became a circle: an inscribed circle shows ~78% of the
              same box's area, so keeping the old number would have SHRUNK the
              face — and the photo is the card's whole point.
              ⚠️ The bump is keyed to `lg`, NOT `sm`, and the base stays 112.
              This card is horizontal and the grid goes 2-up at `sm`, so between
              640 and 1023 the identity column is the narrowest it ever gets —
              measured at 640px it is 68px wide and Georgian surnames already
              break across FOUR lines there (a pre-existing bug, not this
              change's). 144px at `sm` took it to 52px / five lines; 112 there
              gives 84px back. At 390 the card is 1-up but the column is still
              only 146px, and 128 pushed „ლუკა ლორთქიფანიძე" to three lines with
              a single dangling letter. Measure the h3 before growing this.
              `object-center`: a centred square crop of a portrait keeps the face.
              Identical size for every expert, so the grid reads as one system.
              z-10 keeps the block ABOVE the card-wide overlay link — without it
              the overlay swallows mouseenter and the hover-video never plays. */}
          <div
            className="relative z-10 shrink-0 w-28 h-28 lg:w-36 lg:h-36 rounded-full bg-ink-100 overflow-hidden group/photo"
            /* Shared-element name: the profile page puts the SAME name on its
               avatar, so navigation morphs this photo into that one instead of
               blinking. Unique per tutor — duplicate names void the pair. */
            style={{ viewTransitionName: `vt-photo-${t.id}` }}
            onMouseEnter={() => { if (t.video && ytId) setVhover(true) }}
            onMouseLeave={() => setVhover(false)}
          >
            {/* tabIndex -1: same destination as the card overlay and the name
                link — three identical tab stops per card is keyboard noise. */}
            <Link href={`/tutors/${t.slug || t.id}`} tabIndex={-1} aria-label={`${t.name} — პროფილი`} className="absolute inset-0 block">
              <ExpertPhoto src={photoSrc} name={t.name} eager={idx < 2} />
            </Link>
            {/* Hover → the intro video plays right inside the photo. Only the
                hovered card mounts an iframe, so we never autoplay the whole list. */}
            {t.video && vhover && ytId && (
              <iframe
                className="absolute inset-0 w-full h-full z-10 pointer-events-none"
                src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&playsinline=1&rel=0`}
                allow="autoplay; encrypted-media"
                title={`${t.name} — ვიდეო`}
              />
            )}
            {/* Play badge — opens the full VideoPreview modal (stopPropagation
                so the card-wide overlay link doesn't navigate instead). The
                BUTTON is 40×40 (canon tap-target floor) but its visible circle
                is 28px, so it sits in the shoulder corner instead of covering
                the face. It is INSET (`bottom-2`/`sm:bottom-3`, badge centred in
                the button) rather than pinned to `bottom-0 right-0` as it was on
                the square: a corner of the bounding box is OUTSIDE a circular
                photo, so the old offsets left the badge floating in the gap.
                These land it tangent to the circle at the 4-o'clock edge —
                r(56/72) ≈ centre-distance(39.6/56.6) + badge radius(14). Keep
                the breakpoint on `lg`, matching the thumb's own. */}
            {t.video && (
              <button
                type="button"
                aria-label="ვიდეო"
                onClick={e => { e.stopPropagation(); onPreviewEnter(t, e.currentTarget) }}
                className="absolute bottom-2 right-2 lg:bottom-3 lg:right-3 z-20 w-10 h-10 inline-flex items-center justify-center"
              >
                <span className="w-7 h-7 rounded-full bg-white/95 backdrop-blur shadow-pop text-ink-900 inline-flex items-center justify-center group-hover/photo:scale-105 transition-transform duration-fast">
                  <Icon.play className="w-3 h-3 ml-0.5" />
                </span>
              </button>
            )}
          </div>

          {/* Identity column */}
          <div className="min-w-0 flex-1 flex flex-col">
            <div className={`flex items-center gap-x-1.5 gap-y-1 min-w-0 flex-wrap ${viewerCantFav ? '' : 'pr-9'}`}>
              {/* h2, not h3: the listing's only other heading is the page h1, so an h3
                  here left a level gap that a screen reader navigating by heading
                  reads as a missing section. Size is unchanged — the token is the
                  design, the tag is the outline. */}
              <h2 className="font-display text-body-lg sm:text-h3 font-bold text-ink-900 tracking-tight leading-[1.2] min-w-0 break-words">
                <Link href={`/tutors/${t.slug || t.id}`} className="tap-area relative z-10 hover:text-brand-700 transition-colors duration-fast">{t.name}</Link>
              </h2>
              {t.verified && <VerifiedMark size={14} />}
              {t.superExpert && (
                <span className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-pill bg-ink-900 border border-transparent text-white font-display text-micro font-bold uppercase">
                  <Icon.spark className="w-3 h-3" /> Super
                </span>
              )}
              {/* Rating moved OFF the photo: a 112px square has no room for an
                  overlay pill and it hid part of the face. Inline, hairline, no
                  pastel fill (canon). An unrated expert renders NOTHING here.
                  The „ახალი" pill that used to fill this slot is gone (2026-07-31):
                  a badge earns its place by DISTINGUISHING, and on production it
                  sat on 9 of 9 cards, so it distinguished nobody and instead told
                  every first-time visitor, once per card, that the marketplace is
                  empty. What an unrated expert genuinely has is rendered below by
                  <NewExpertSignals> — verified / years / intro video — which is
                  the same information without the apology. Do NOT reintroduce a
                  „new" badge until it applies to a minority of the roster. */}
              {t.rating > 0 && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Icon.star className="w-3 h-3 text-warning-500" />
                  <span className="font-display text-meta font-bold text-ink-900 tabular-nums leading-none">{fmtRating(t.rating)}</span>
                  <span className="text-meta text-ink-500 tabular-nums">({t.reviews})</span>
                </span>
              )}
            </div>
            {/* CATEGORY CHIP ONLY — the headline was removed from this card on
                2026-07-31, in two steps worth recording because the first one was
                not enough.
                Step 1 swapped the roles: the chip used to hold `headline` (free
                text the expert types) while the category — our own taxonomy — was
                the muted afterthought. That is backwards, because the chip is the
                loudest element on the card and it made an unvalidated string look
                like a platform-verified label. It also left both fields answering
                ONE question („what does this person do?") with no hierarchy, so
                when they AGREED it read as a duplicate („მარკეტერი" /
                „მარკეტინგი", 4 of 9 live rows) and when they DISAGREED the reader
                could not tell which to trust („ანალიტიკა და ქოუჩინგი" /
                „ფსიქოლოგია" — a real row).
                Step 2 dropped the headline outright: at full size it was obvious
                that `headline` is just the one-line version of `bio`, and `bio`
                renders directly beneath it — „გაყიდვების ექსპერტი" sat immediately
                above „გაყიდვების სფეროში მაქვს გამოცდილება…". The card was
                printing the same content twice at two lengths. Removing it takes a
                row off every card, leaves a clean vertical column of category
                chips to scan, and takes the whole duplicate-vs-contradiction
                problem out of the grid. Nothing is lost: all 9 live profiles have
                a bio.
                The headline KEEPS its place on the PROFILE, where it is the lead
                sentence under the name and has the room to be read.
                Deliberately NO stem-dedupe was ever added: any rule sharp enough
                to hide „მარკეტერი" under „მარკეტინგი" also hides
                „ბიზნეს-სტრატეგი" under „ბიზნესი", where the headline is the MORE
                specific of the two.
                `pr-2` on the row: at 390px a truncated label ended 17px from the
                card border and its ellipsis collided with the frame. */}
            <div className="mt-1.5 pr-2 flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-meta font-semibold tracking-tight max-w-full truncate">{t.cat}</span>
            </div>
            {hasExtraLanguage(t.langs) && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-meta text-ink-500 max-w-full">
                <Icon.globe className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                <span className="truncate">{fmtLangs(t.langs, 2)}</span>
              </div>
            )}
            {t.bio && <p className="mt-2 text-small text-ink-600 leading-[1.45] line-clamp-2 break-words">{t.bio}</p>}
          </div>
        </div>

        {/* Demand proof for established experts; for a brand-new expert
            (0 rating) surface the credibility signals they DO have — verified,
            experience, intro video, response — instead of a lonely „ახალი"
            over empty space. Real values only. */}
        {t.rating === 0 ? (
          <NewExpertSignals t={t} className="mt-3" />
        ) : t.sessions > 0 ? (
          <div className="mt-3 text-meta text-ink-600 tabular-nums">
            <span className="font-display font-bold text-ink-900">{t.sessions}</span> სესია
          </div>
        ) : null}
      </div>

      {/* Footer strip — the hairline divider, then price on its own line and two
          equal buttons. Keeping the price above the buttons (instead of beside
          them) is what stopped „· N წთ სესია" from wrapping on a narrow card. */}
      <div className="px-4 py-3 border-t border-ink-100 bg-ink-50/40">
        <div className="flex items-baseline gap-1.5 mb-2.5">
          <span className="font-display text-h2 font-bold text-ink-900 tabular-nums tracking-tight leading-none">{flagship.label}</span>
          <span className="text-meta font-medium text-ink-500">· {flagship.minutes} წთ სესია</span>
        </div>
        {/* Two-button CTA: booking is the primary niche, messaging the
            secondary. A non-student (tutor/admin) can't book OR message, so
            they get a single neutral note instead of dead-end buttons.
            z-10: these sit above the card-wide overlay link, so „დაჯავშნე" and
            „მიწერე" keep their own actions instead of navigating. */}
        <div className="relative z-10">
          {/* ink-500, not ink-400, on the inert plate below: the muted step is
              documented as 4.75:1 on WHITE, but on a tinted ink-75 ground it
              drops to 4.40 and fails. ink-500 is 5.19 and still reads muted. */}
          {viewerCantBook ? (
            <div className="w-full h-11 rounded-btn bg-ink-75 border border-ink-200 text-ink-500 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center">
              ჯავშანი მხოლოდ სტუდენტს
            </div>
          ) : bookable ? (
            /* `auto 1fr`, not `grid-cols-2`. Two equal halves fit „დაჯავშნე"
               and break „შესვლა და ჯავშანი" — the label a SIGNED-OUT visitor
               sees — onto two lines inside a 44px button. Measured on the live
               site: 150px/2 lines at 390px, 135px/2 lines at 360px. „მიწერე"
               takes only the width it needs and the primary gets the rest
               (212px / 182px, one line), so the fix costs the secondary nothing
               and touches no copy. */
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Link
                href={`/tutors/${t.slug || t.id}?intent=message`}
                aria-label="მიწერე ექსპერტს"
                className="h-11 px-2 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors duration-fast"
              >
                <Icon.chat className="w-3.5 h-3.5 shrink-0" /> მიწერე
              </Link>
              <button type="button" onClick={() => onBook(t)} className="h-11 px-2 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors duration-fast shadow-xs">
                {needsSignIn ? 'შესვლა და ჯავშანი' : 'დაჯავშნე'}
              </button>
            </div>
          ) : (
            // No published time → ONE live primary, full width. The old layout
            // kept the two-button grid and greyed „დაჯავშნე" out, so 4 of the 9
            // production cards showed a dead half next to a live half — which
            // reads as a broken card, not as an unavailable expert. The message
            // path is how a slot-less expert actually gets booked, so it stops
            // being the secondary here and simply becomes the action.
            <Link
              href={`/tutors/${t.slug || t.id}?intent=message`}
              className="w-full h-11 px-2 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center gap-1.5 transition-colors duration-fast shadow-xs"
            >
              <Icon.chat className="w-3.5 h-3.5 shrink-0" /> მიწერე ექსპერტს
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

/* ───── Video preview — horizontal 16:9, anchored next to play button ───── */
export const VideoPreview = ({ tutor, onClose, onBook }: { tutor: Tutor; onClose: () => void; onBook: (t: Tutor) => void }) => {
  // Real YouTube ID from the tutor's stored videoUrl. If the tutor has a
  // legacy `data:video/…` blob (from the deprecated upload path), ytId is null
  // and the modal falls back to a static thumbnail — the player is silent.
  const ytId = tutorYouTubeId(tutor)

  // Close on Escape — expected for a centered modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-sheet flex items-center justify-center p-4 sm:p-6 bg-ink-950/55 backdrop-blur-sm motion-safe:animate-fade-in-fast"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${tutor.name} — ვიდეო`}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[560px] rounded-card overflow-hidden bg-ink-900 shadow-float ring-1 ring-white/10 motion-safe:animate-scale-in"
      >
        {/* Horizontal 16:9 video — YouTube nocookie iframe. Autoplay muted so
            browsers actually let it play without user gesture (they block
            unmuted autoplay). Modest branding + rel=0 hide the YouTube logo
            and related-videos suggestion strip. */}
        <div className="relative aspect-video bg-accent-800 overflow-hidden">
          {ytId ? (
            <iframe
              key={tutor.id}
              src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1&controls=1`}
              title={`${tutor.name} — ვიდეო`}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          ) : (
            // Legacy: tutor has a data:video/ blob (or no video at all). Show
            // a static portrait — no autoplay, no stock MP4. This branch is
            // unreachable when `t.video` gates the play button correctly, but
            // rendered defensively.
            <img
              src={tutor.avatarUrl || DEFAULT_AVATAR}
              alt={tutor.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Bottom gradient for legibility */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-accent-950/85 to-transparent pointer-events-none" />

          {/* Close button (top-right). Mute is handled by the YouTube iframe's
              built-in controls, so no separate mute button here. */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="დახურვა"
              className="w-7 h-7 rounded-full bg-accent-900/65 hover:bg-accent-900 text-white inline-flex items-center justify-center transition-colors duration-fast backdrop-blur"
            >
              <Icon.x className="w-3 h-3" />
            </button>
          </div>

          {/* Tutor strip (over gradient) */}
          <div className="absolute left-3 right-3 bottom-2.5 flex items-center gap-2 pointer-events-none">
            <img src={tutor.avatarUrl || DEFAULT_AVATAR} alt={tutor.name} className="w-7 h-7 rounded-full ring-2 ring-white/30 object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-small font-bold text-white tracking-tight truncate">{tutor.name}</span>
                {tutor.verified && <VerifiedMark size={11} />}
              </div>
              {/* One expert fills this overlay, so the headline still earns its
                  place here (unlike on the grid card, where the bio sits right
                  under it). It goes through `displayHeadline` for the same reason
                  everywhere else does — no „- 7 წელი" tail — and the „·" only
                  renders when there is actually something after it, so an expert
                  with no headline doesn't end the line on a dangling separator. */}
              <div className="text-meta text-white/65 truncate">
                {tutor.cat}{displayHeadline(tutor.headline) && ` · ${displayHeadline(tutor.headline)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Compact action strip */}
        <div className="flex items-center gap-3 px-3.5 py-2.5 bg-accent-900 border-t border-white/8">
          <div className="flex items-center gap-2.5 text-meta text-white/65 min-w-0 flex-1">
            {/* Same zero-state treatment as the card: an unrated expert reads
                „ახალი“, never „0.0“. */}
            {tutor.rating > 0 && tutor.reviews > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Icon.star className="w-3 h-3 text-warning-400" />
                <span className="font-display font-bold text-white tabular-nums">{fmtRating(tutor.rating)}</span>
              </span>
            ) : (
              <span className="font-display font-semibold text-white/70">ახალი</span>
            )}
            <span className="text-white/25">·</span>
            <span className="font-display text-small font-bold text-white tabular-nums">
              ₾{tutor.price}<span className="text-meta font-medium text-white/55 ml-0.5">/ სესია</span>
            </span>
          </div>
          {/* h-11, not h-8: this is a primary CTA with a label, so it takes a
              canon control height rather than a tap-area patch — the bar has
              room and a 32px booking button was the smallest CTA in the flow. */}
          <button type="button" onClick={() => { onBook(tutor); onClose() }} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1 transition-colors duration-fast shrink-0">
            <Icon.cal className="w-3 h-3" />
            დაჯავშნე
          </button>
        </div>
      </div>
    </div>
  )
}