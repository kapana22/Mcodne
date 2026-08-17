'use client'
// Home — the shapes the page renders, the /api/tutors → Expert mapper, and
// the verified mark every section reuses.

import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { primaryPriceLabel, primaryService } from '@/components/booking/slots'

export const VerifiedMark = ({ size = 16 }: { size?: number }) => (
  <span className="inline-flex items-center justify-center rounded-full bg-brand-600 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

/* ───── Categories (shared data) ───── */

// One brand treatment for every tile — the canon is the 3-color system, so no
// per-category rainbow hues (and no safelist-dependent dynamic classes).
// The grid is driven by the LIVE, admin-managed categories (GET /api/categories)
// so a hidden category drops out, a rename propagates, and a new one can surface
// — no code edit needed. This per-slug meta only supplies the icon + a short
// description (which aren't stored on the Category row); NAMES come from the DB.
// A default covers any slug without bespoke meta.
// The slug → mark/blurb map moved to lib/categoryMarks: it was ALSO defined,
// differently, in app/categories, so the same category wore two different
// glyphs depending on where you saw it. One source now.

// Fallback used ONLY for the SSR/first paint and if the categories fetch fails —
// so the home never renders an empty category section (SEO). Top-6 by demand;
// once the live fetch resolves, hidden/renamed categories self-correct.
export type HomeCat = { slug: string; name: string }
// Names re-synced 2026-08-11 against all 15 production rows. Four of the six
// were pre-rename strings („ბიზნესი", „მარკეტინგი", „IT და პროგრამირება"), so
// the first paint printed one label and the fetch swapped in another — a flash
// of a chip that no longer exists. `career` drops out: it is HIDDEN, and the
// only thing tapping it can produce is an empty page.
export const FALLBACK_CATS: HomeCat[] = [
  { slug: 'business',   name: 'ბიზნესი და სტრატეგია' },
  { slug: 'tax',        name: 'ფინანსები და გადასახადები' },
  { slug: 'law',        name: 'სამართალი' },
  { slug: 'marketing',  name: 'მარკეტინგი და გაყიდვები' },
  { slug: 'it',         name: 'ტექნოლოგია და პროდუქტი' },
  { slug: 'psychology', name: 'ფსიქოლოგია' },
]

/* ───── Top nav ─────
   The home page renders the canonical <PublicTopBar /> (same as /tutors and
   every other public surface) — no bespoke inline header. The old inline nav
   with its category mega-menu was the one divergent public header; categories
   stay reachable via the „კატეგორიები“ item PublicTopBar now carries. */

/* ───── Shared footer ───── */
/* Local Footer removed — the home page now renders the shared
   components/Footer.tsx like every other public page, so the columns, honesty
   notes and bottom strip can never drift between surfaces again. (The old
   local copy also pointed „კატეგორიები“ at /tutors instead of /categories.) */

/* ═══════════════════════════════════════════════════════════════════ */
/* HOME VIEW                                                            */
/* ═══════════════════════════════════════════════════════════════════ */

// Shape used by HomeHero's preview cards.
export type Expert = {
  id?: string
  /** Expert URL slug. Hrefs MUST use it: a cuid href 308s to the slug and the
      redirect downgrades the navigation to a full load, killing the photo
      view-transition. It was missing from this type entirely, so every
      `(featured as any).urlSlug` read undefined and the hero card has been
      linking by cuid. */
  urlSlug?: string | null
  name: string
  cat: string
  headline: string
  quote: string
  rate: number
  reviews: number
  sessions: number
  /** The flagship tier's price, as a number — the hero's <CountUp> needs one. */
  price: number
  /** The same tier, formatted („₾60", „უფასო") — for everything that shows text. */
  priceLabel: string
  durationMin: number
  // Real next open start (ISO) or null. Drives the SAME bookability gate the
  // /tutors card and the profile's StickyBookingCard use — a card must never
  // promise a booking the profile will immediately deny.
  nextSlotAt: string | null
  video: boolean
  verified: boolean
  // Credibility a brand-new (unrated) expert genuinely has. Real values only —
  // each renders solely when it exists.
  yearsExp?: number
  photo: string
}

// The old `next`/`online` fields (a formatted "დღეს 14:00" hint and a fake
// presence flag) are gone: the availability preview was removed from every card
// on 2026-07-21 and nothing rendered them since. `nextSlotAt` replaces them as
// a pure boolean gate — see isBookable below.
function isBookable(nextSlotAt: string | null): boolean {
  return nextSlotAt != null
}

// Map a TutorProfile row from /api/tutors → Expert shape used by hero cards.
export function mapTutorToExpert(t: any): Expert {
  return {
    id: t.id,
    urlSlug: t?.slug ?? null,
    name: t?.user?.fullName ?? 'ექსპერტი',
    // The real category or nothing — never `specialty`, never the literal
    // „სფერო". See app/tutors/_data.tsx for the full reasoning; this mapper
    // feeds the same card component.
    cat: t?.category?.name ?? '',
    headline: t?.headline ?? '',
    quote: (t?.bio ?? '').slice(0, 140),
    rate: typeof t?.rating === 'number' ? t.rating : 0,
    reviews: t?.reviewsCount ?? 0,
    sessions: t?.sessionsCount ?? 0,
    /* PRICE AND DURATION FROM THE SAME TIER. The duration was already
       resolved from the flagship, but the price stayed `t.price` — the
       flat rate typed at /apply — so the two halves of one line described
       two different things. Measured 2026-08-13: ლიზა ზუბაშვილი's flat
       rate is 20 and her real consultation is ₾60/60წთ, so the home grid
       advertised „₾20 · 60-წუთიანი სესია" — an hour at a third of its
       price, on the front page. `primaryPriceLabel` returns BOTH from one
       tier, which is the entire reason it exists (see its docblock). */
    ...(() => {
      const tiers = Array.isArray(t?.consultations) ? t.consultations : []
      const f = primaryPriceLabel(tiers, t?.price ?? 80, t?.consultationDurationMin ?? 60)
      // `price` stays a NUMBER because the hero animates it with <CountUp>;
      // it comes off the SAME tier as the label and the duration, so the
      // three can no longer describe different services.
      return { price: primaryService(tiers)?.price ?? (t?.price ?? 80), priceLabel: f.label, durationMin: f.minutes }
    })(),
    nextSlotAt: t?.nextSlotAt ?? null,
    video: Boolean(t?.videoUrl),
    verified: t?.verified ?? false,
    yearsExp: typeof t?.yearsExp === 'number' ? t.yearsExp : undefined,
    // Measured from Message history (never the self-declared responseHours,
    // which the API deliberately strips before a row reaches a public surface).
    // Fall back to the shared friendly default avatar (no unsplash stock photos —
    // a stock photo tied to a real name reads as a fake identity to crawlers and
    // undermines the "hand-picked" trust claim).
    photo: t?.user?.avatarUrl ?? DEFAULT_AVATAR,
  }
}

// Fisher-Yates. Used ONLY inside the client fetch callback below — see the
// hydration note there before moving this call anywhere near render.
// Preview rotation cadence. Short on purpose (the card is a taster, not
// reading material) — hover/focus pauses it, so it never moves under a hand.
export const ROTATE_MS = 3000

export function shuffled<T>(list: T[]): T[] {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}