'use client'
// /experts/[slug] — every surface that starts a booking: the desktop sticky
// card, the mobile bottom bar, and the sign-in prompt they raise.

import React, { useEffect } from 'react'
import { Link } from 'next-view-transitions'
import { PAYMENTS_LIVE, FEATURE_REQUEST_BOOKING } from '@/lib/flags'
import { fmtRating } from '@/lib/fmt'
import { KA_MONTHS_LONG as KA_MONTHS_FULL, KA_MONTHS_SHORT_DOT, KA_WEEKDAYS_SHORT } from '@/lib/kaDate'
import { Sheet } from '@/components/Sheet'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { TUTOR_DEFAULTS, primaryPriceLabel, computeNextFreeStart, isoWeekday, DAY_NAMES_FULL, type ApiSlot, type BusySlot, type ConsultationItem } from '@/components/booking/slots'

/* Local Footer was orphan (had hardcoded fake nav) — replaced by shared components/Footer.tsx via SharedFooter. */

/* ───── Availability load state ─────
   The server's first-paint seed (page.tsx) is deliberately PARTIAL: scalars
   only, no availability/busySlots/reviews (they're viewer-tz dependent and
   must stay client-computed). So an empty `availability` array means „not
   loaded yet" just as often as it means „no free time" — every slot-derived
   affordance takes this flag instead of guessing, otherwise a shared profile
   link spends its first second claiming the expert is unbookable. */
export type SlotsState = 'pending' | 'ready' | 'failed'

/* ── THE SECOND VERB, IN THE SECONDARY SLOT (2026-08-19) ────────────────────
   The client has two: „დაჯავშნე" and „აღწერე". This page's primary action is
   and stays the first — an expert with published time is BOOKED. What was
   missing is the second: describing a piece of work TO THIS PERSON, which until
   today required posting a request into the void and inviting them from the
   room afterwards.

   ⚠️ IT TAKES THE SLOT „მიწერე ექსპერტს" HAS, IT DOES NOT ADD A THIRD BUTTON.
   The rail already carries exactly two actions and a third would make the page
   an argument with itself. The two are also the same intent — „write to this
   person before committing" — except this one needs no account, which is the
   whole design of the intake („no registration, anywhere"). When the subsystem
   is off (`requestHref` null, gated once in page.tsx) the button is the message
   button it has always been, unchanged.

   ⚠️ AND NEVER WHEN MESSAGING HAS BEEN PROMOTED TO PRIMARY. With no published
   time the message button IS the primary action; replacing the secondary then
   would leave the rail showing the same action twice. */

/* ───── Mobile sticky booking bar ───── */
export const MobileBookingBar = ({ onBook, priceLabel, sessionMin, bufferMin = 0, signedIn, paused, availability = [], busySlots = [], slotsState = 'ready', onRetrySlots, canMessage = false, onMessage, requestHref = null, isOwnProfile = false, viewerCantBook = false, canProposeCategory = false }: { onBook: () => void; priceLabel: string; sessionMin: number; bufferMin?: number; signedIn?: boolean | null; paused?: boolean; availability?: ApiSlot[]; busySlots?: BusySlot[]; slotsState?: SlotsState; onRetrySlots?: () => void; canMessage?: boolean; onMessage?: () => void; /** `/request?to=<slug>` when the requests subsystem exists — see the note above. */ requestHref?: string | null; isOwnProfile?: boolean; viewerCantBook?: boolean; canProposeCategory?: boolean }) => {
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
        {canMessage && !messagePromoted && (
          requestHref ? (
            // The same swap the desktop rail makes — one secondary action, the
            // same destination on both, so the page does not offer two different
            // second steps depending on the width of the screen.
            <Link
              href={requestHref}
              aria-label="გამოაგზავნე მოთხოვნა"
              title="გამოაგზავნე მოთხოვნა"
              className="h-12 w-12 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700 inline-flex items-center justify-center transition-colors duration-fast"
            >
              <Icon.chat className="w-5 h-5" />
            </Link>
          ) : onMessage ? (
            <button
              type="button"
              onClick={onMessage}
              aria-label="მიწერე ექსპერტს"
              title="მიწერე ექსპერტს"
              className="h-12 w-12 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700 inline-flex items-center justify-center transition-colors duration-fast"
            >
              <Icon.chat className="w-5 h-5" />
            </button>
          ) : null
        )}
        {isOwnProfile ? (
          <Link href="/work/profile" className="tap-shrink shrink min-w-0 h-12 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast">
            <span className="truncate">პროფილის რედაქტირება</span>
          </Link>
        ) : viewerCantBook ? (
          // ink-500 on the tinted ink-75 plate (5.19); ink-400 measures 4.40
          // there and fails AA — its documented 4.75 is against WHITE.
          <span className="shrink min-w-0 h-12 px-4 rounded-btn bg-ink-75 border border-ink-200 text-ink-500 font-display font-semibold text-body tracking-wide inline-flex items-center justify-center">
            <span className="truncate">ჯავშანი მხოლოდ კლიენტს</span>
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
export const AuthPromptSheet = ({ tutorId, intent, start, serviceId, onDismiss }: { tutorId: string; intent: 'book' | 'message' | null; start?: Date | null; serviceId?: string | null; onDismiss: () => void }) => {
  // Escape / scroll-lock / focus trap come from the Sheet container.
  // The picked time and tier ride along, so „ჯავშანი გაგრძელდება" is true:
  // the profile re-seeds them on arrival instead of asking again.
  const bookQs = new URLSearchParams({ rebook: '1' })
  if (start) bookQs.set('start', start.toISOString())
  if (serviceId) bookQs.set('service', serviceId)
  const target = `/experts/${tutorId}${intent === 'book' ? `?${bookQs}` : intent === 'message' ? '?intent=message' : ''}`
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

/* TbilisiHint / CalendarTzLabel moved to components/booking/TzLabels.tsx —
   rendered by the shared Calendar inside the booking flow + inline schedule. */

/* ───── Sticky booking card — live picker → opens modal at Details ───── */
export const StickyBookingCard = ({
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
  requestHref = null,
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
  /** `/request?to=<slug>` when the requests subsystem exists — see the note at
   *  the top of this file. Null keeps the message button exactly as it was. */
  requestHref?: string | null
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
            <Link href="/work/profile" className="tap-shrink w-full h-12 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast">
              პროფილის რედაქტირება
            </Link>
          ) : viewerCantBook ? (
            <div className="w-full h-12 rounded-btn bg-ink-75 border border-ink-200 text-ink-500 font-display font-semibold text-small tracking-wide inline-flex items-center justify-center">
              ჯავშანი მხოლოდ კლიენტს
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
              never stacks the same action on itself.
              See the note at the top of this file for why `requestHref` takes
              this slot rather than earning a third button. */}
          {canMessage && !messagePromoted && (
            requestHref ? (
              <Btn href={requestHref} variant="secondary" size="lg" className="w-full mt-2.5">
                <Icon.chat className="w-4 h-4" /> გამოაგზავნე მოთხოვნა
              </Btn>
            ) : onMessage ? (
              <Btn variant="secondary" size="lg" onClick={onMessage} className="w-full mt-2.5">
                <Icon.chat className="w-4 h-4" /> მიწერე ექსპერტს
              </Btn>
            ) : null
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