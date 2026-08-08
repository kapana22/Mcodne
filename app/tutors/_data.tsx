'use client'
// /tutors — the row→card data layer: the API payload shape and every
// mapping/derivation the browse list needs before anything is rendered.

import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { KA_MONTHS_SHORT } from '@/lib/kaDate'
import { LANG_LABELS, PRIMARY_LANG_CODES, langLabel, toLangCode } from '@/lib/languages'
import { TUTOR_DEFAULTS, type ConsultationItem } from '@/components/booking/slots'

/* ───── Search hero ───── */
// Category identity is DB-driven (GET /api/categories → live categories only).
// The hero chips and the sidebar checkboxes toggle the SAME `filters.cats`, and
// that array now holds category SLUGS — so filtering is robust to renames and a
// hidden (isLive:false) category simply stops appearing (no dead chip). The
// filter matches an expert's `catSlug` (category.slug), never a display string.
// `expertCount` drives which categories are OFFERED as a filter: an option that
// can only ever return zero results is a dead end, not a filter.
export type LiveCat = { id: string; slug: string; name: string; expertCount?: number }
// Resolve a slug → its display name from the live list; falls back to the slug
// itself so a not-yet-loaded / unknown category never renders as blank.
export const catNameOf = (cats: LiveCat[], slug: string) => cats.find(c => c.slug === slug)?.name ?? slug

// The DB stores language CODES (ka/en/…); cards + the language filter work in
// human labels. Map codes → labels so a stored ["ka","en"] matches the filter
// chips (previously they never did → 0 results). `toLangCode` first, so legacy
// rows still holding NAMES („ქართული") land on the same label as a code row —
// otherwise the same expert reads differently depending on when they signed up.
const toLangLabel = (v: string): string => langLabel(toLangCode(v) ?? v)

/* ───── Tutor data ───── */
export type Tutor = {
  slug?: string | null
  id: string
  name: string
  photo: number
  // Real avatar URL from user.avatarUrl. When null, TutorCard renders an
  // initials placeholder (SVG data URI) instead of a random pravatar face.
  avatarUrl?: string | null
  // YouTube URL (canonical `youtu.be/{id}`) from tutorProfile.videoUrl.
  // `video` gates the play button on the card; the popup extracts the
  // 11-char ID at open time to render the nocookie iframe.
  videoUrl?: string | null
  cat: string
  // Category SLUG (category.slug) — the stable filter key. `cat` above stays the
  // display NAME the card shows; filtering matches on this slug so renames and
  // hidden categories never break the sidebar/hero filter.
  catSlug?: string | null
  headline: string
  bio: string
  langs: string[]
  rating: number
  reviews: number
  sessions: number
  price: number
  trial: number
  next: string
  video: boolean
  // ID-verified (admin-checked). Gates the VerifiedMark — rendering it for
  // everyone was a trust lie the detail page didn't repeat.
  verified: boolean
  superExpert: boolean
  // ISO time of the expert's soonest bookable slot, or null when they have no
  // upcoming availability (→ effectively unbookable; the card shows a muted
  // "availability soon" state instead of a next-slot chip).
  nextSlotAt?: string | null
  // ISO creation time of the expert profile (tutorProfile.createdAt). Powers the
  // „ახლის მიხედვით" sort — without it that sort had no key and was a no-op.
  createdAt?: string | null
  consultationDurationMin?: number
  // Tier SHAPE only (minutes/price/tier) — already selected by lib/tutorsQuery
  // for exactly this reason, so the card can resolve the FLAGSHIP service
  // instead of pricing the profile-level default duration. Never the title or
  // description; the card doesn't render them.
  consultations: ConsultationItem[]
  // MEASURED response time, already bucketed into a Georgian phrase
  // („პასუხობს ~2 საათში"). Derived from tutorProfile.responseMedianMin /
  // .responseSampleN — real medians over answered conversations, see
  // lib/responseTime. `null` when the expert has too few answered conversations
  // to say anything true, in which case the card shows NOTHING; it deliberately
// Response time removed from every public surface (2026-07-29, product
// decision). It was measured honestly but it is not something a first-time
// buyer weighs — and with zero experts qualifying it printed for nobody. The
// measurement in lib/responseTime keeps running so it can rank search results
// later, the way Preply uses it; it is simply never displayed.
  // does NOT fall back to the self-declared responseHours the expert types into
  // their own profile editor.
  // Years of professional experience (tutorProfile.yearsExp). A credibility
  // signal a brand-new expert (0 rating/sessions/reviews) still has — surfaced
  // on the card only when >0 so it never reads as "0 წელი".
  yearsExp?: number
}

// Extract the 11-char YouTube ID from any of the accepted URL forms. Returns
// null for legacy `data:video/…` blobs or non-YouTube URLs, in which case the
// preview popup falls back to a plain thumbnail (no video plays).
export function tutorYouTubeId(t: { videoUrl?: string | null }): string | null {
  const v = t.videoUrl
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
}

// Human-friendly label for an expert's soonest bookable slot ("დღეს 14:00",
// "ხვალ 09:30", "5 ივლ"). Client-only — safe to use Date here.
// Georgian short months — spelled out manually because the runtime's Intl
// often lacks `ka-GE` data and `toLocaleDateString('ka-GE',…)` silently falls
// back to English ("Jul 24") in an otherwise-Georgian UI.

function fmtNextSlot(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay(d, now)) return `დღეს ${hm}`
  if (sameDay(d, tomorrow)) return `ხვალ ${hm}`
  return `${d.getDate()} ${KA_MONTHS_SHORT[d.getMonth()]}`
}

// Neutral initials-avatar SVG for tutors without an uploaded photo. Kept as a
// data URI so no external round-trip and no stock-photo tied to a real name.
export function initialsAvatarSvg(_name: string): string {
  return DEFAULT_AVATAR
}

// The FIRST-PAINT list is now seeded by the server (app/tutors/page.tsx calls
// queryTutors() and passes the rows in as `initialTutors`), so real expert
// cards are in the initial HTML — no empty skeleton, no fake placeholder data.
// The old hardcoded 9-tutor array is gone; `mapRows` below turns the raw API/
// server rows into the card shape, shared by the seed and every refetch.

// One row → card mapper. Used by BOTH the SSR seed (initialTutors) and the
// client refetch (fetchTutors), so the two paths can never drift. Kept pure so
// the useState initializer can run it during SSR of the client component.
function mapTutorRow(t: any, i: number): Tutor {
  return {
    // The expert's own URL slug. Card links MUST use it when present: a
    // cuid href answers with a 308 to the slug URL, and that redirect turns
    // the client-side navigation into a full page load — which silently kills
    // the card→profile view-transition morph. Measured, not theoretical.
    slug: t.slug ?? null,
    id: t.id,
    name: t.user?.fullName ?? TUTOR_DEFAULTS.name,
    photo: 11 + i,
    avatarUrl: t.user?.avatarUrl ?? null,
    videoUrl: t.videoUrl ?? null,
    cat: t.category?.name ?? t.specialty ?? 'სფერო',
    catSlug: t.category?.slug ?? null,
    headline: t.headline ?? '',
    bio: t.bio ?? '',
    langs: Array.isArray(t.languages) && t.languages.length ? t.languages.map(toLangLabel) : ['ქართული'],
    // 0 = no reviews yet → the card renders "ახალი", same as the detail
    // page. NEVER invent a rating (this used to default to 4.9).
    rating: t.rating ?? 0,
    reviews: t.reviewsCount ?? 0,
    sessions: t.sessionsCount ?? 0,
    price: t.price ?? TUTOR_DEFAULTS.price,
    trial: 0,
    // Real next free slot — the compare modal shows this verbatim, so a
    // fabricated "დღეს/ხვალ" here lied to the user.
    next: t.nextSlotAt ? fmtNextSlot(t.nextSlotAt) : 'დრო ჯერ არ არის',
    // Only show the play button when we have a real video URL.
    video: Boolean(t.videoUrl),
    verified: t.verified ?? false,
    // Super is now admin-gated: an expert must be verified, top-rated AND
    // admin-featured — so the badge is a deliberate distinction (controlled via
    // the admin FeaturedToggle), not something that lands on everyone with a
    // high rating.
    superExpert: (t.verified ?? false) && (t.rating ?? 0) >= 4.8 && Boolean(t.featured),
    nextSlotAt: t.nextSlotAt ?? null,
    // Normalize to ISO — the API sends a string, the SSR seed a Date object.
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
    consultationDurationMin: typeof t.consultationDurationMin === 'number' ? t.consultationDurationMin : TUTOR_DEFAULTS.durationMin,
    // Defensive: an older cached payload (or a hand-built fixture) may predate
    // the tier select in lib/tutorsQuery. An empty list makes primaryPriceLabel
    // fall back to the flat price, which is the pre-tier behaviour — never a crash.
    consultations: Array.isArray(t.consultations) ? t.consultations : [],
    yearsExp: typeof t.yearsExp === 'number' ? t.yearsExp : undefined,
  }
}

export function mapRows(rows: any[]): Tutor[] {
  return Array.isArray(rows) ? rows.map(mapTutorRow) : []
}

/* TUTOR_DEFAULTS + primaryPriceLabel are imported from components/booking/slots
   — the single source both this listing and the detail page resolve fallbacks
   from (the old "MUST stay identical" twin blocks are gone).
   Covered by tests/tutor-mapping.test.ts. */

// A card is bookable only when the expert has an upcoming free slot
// (`nextSlotAt`). Mirrors the detail page's StickyBookingCard gate
// (`uniqueDays.length === 0` → CTA disabled) so search never implies a
// bookability the profile will immediately deny. Covered by the test file.
export function isTutorBookable(nextSlotAt?: string | null): boolean {
  return nextSlotAt != null
}

/*/* ───── "Available now" pill — instant-booking indicator ───── */
/* ───── Tutor card — mirrors landing.tsx ExpertCard ───── */
// The card's „ენები" line. `t.langs` already holds labels (see toLangLabel), but
// run it through again so a stray code can never render raw — a third private
// map here is exactly how the label vocabularies drifted apart before.
// Dedupe AFTER labelling: `languages` holds ISO codes, but legacy rows also
// hold bare Georgian NAMES, so „ka" and „ქართული" are two distinct strings that
// collapse to one only once mapped. Without this the card printed
// „ქართული, ქართული, ინგლისური" (seen live on a real profile).
// Measured at 390px: „ქართული, ინგლისური, რუსული" overflows the card and CSS
// truncation cut it mid-word — the third language became „რუს…", which reads
// as a rendering fault rather than as „there are more". Two names and a count
// says the same thing in less room and never breaks a word. `truncate` stays
// on the element as the backstop for one very long name.
// Order is FIXED (ka → en → ru → the rest, alphabetically), never the order the
// expert happened to tick the chips in: adjacent cards printed „ქართული,
// ინგლისური" and „ინგლისური, ქართული" for the same pair of languages, which
// reads as two different facts. It matches the picker's chip order, so what an
// expert selects is what a card shows.
const LANG_RANK = (label: string) => {
  const i = PRIMARY_LANG_CODES.findIndex(c => LANG_LABELS[c] === label)
  return i === -1 ? PRIMARY_LANG_CODES.length : i
}
export const fmtLangs = (langs: string[], max = 3) => {
  const all = Array.from(new Set((langs ?? []).map(toLangLabel)))
    .sort((a, b) => LANG_RANK(a) - LANG_RANK(b) || a.localeCompare(b, 'ka'))
  if (all.length <= max) return all.join(', ')
  return `${all.slice(0, max).join(', ')} +${all.length - max}`
}

// Georgian alone is not a language SIGNAL on a Georgian marketplace — it is the
// assumption. Every one of the 9 production experts carried „🌐 ქართული", i.e. a
// row that consumed a line on every card and separated nobody from anybody. The
// line earns its place exactly when there is something extra to say: an expert
// who ALSO works in English or Russian is genuinely differentiated, and that is
// when the row appears. `fmtLangs` still prints the full list (including
// Georgian) once it does — the test is what to SHOW, not what to say.
const KA_LABEL = toLangLabel('ka')
export const hasExtraLanguage = (langs: string[] | undefined) =>
  (langs ?? []).map(toLangLabel).some(l => l !== KA_LABEL)