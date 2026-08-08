// The diaspora vertical — one file, every fact about it.
//
// Pure data + pure functions on purpose (no prisma, no react): the landing page
// is a server component, the price chips are client components, and the booking
// route is a server route — all three import from here, so a rule stated once
// cannot drift into three versions. The ON/OFF switch and the FX rate live in
// lib/flags.ts; this file says what they MEAN.
//
// Scope reminder: nothing here changes the ordinary catalog. A diaspora expert
// is an ordinary TutorProfile whose Category happens to be the hidden one below;
// remove them from that category and every behaviour in this file stops
// applying, with no other edit.

import { ABROAD_EUR_PER_GEL } from '@/lib/flags'

/**
 * The Category.slug the whole vertical keys off.
 *
 * The row itself is created with `isLive: false` (see scripts/abroad-category.mjs),
 * which is the EXISTING mechanism for a hidden category and does all the hiding
 * for us: lib/tutorsQuery filters browse on `category.isLive`, app/sitemap.ts
 * mirrors that filter, and /categories only lists live rows. A profile in it
 * still opens by direct link — app/tutors/[id]/page.tsx never checks isLive —
 * which is exactly the „reachable only from /abroad" behaviour we want.
 */
export const ABROAD_CATEGORY_SLUG = 'diaspora'

/** True when a category slug (from a tutor row, a URL, anywhere) is the diaspora one. */
export function isAbroadCategory(slug?: string | null): boolean {
  return slug === ABROAD_CATEGORY_SLUG
}

/**
 * Which EXISTING categories /abroad draws its experts from.
 *
 * ⚠️ READ THIS BEFORE MOVING AN EXPERT INTO THE `diaspora` CATEGORY. DON'T.
 *
 * `TutorProfile.categoryId` is single-valued, and `lib/tutorsQuery` excludes any
 * expert whose category is not `isLive` — from the category page, from the
 * general /tutors browse, from search, and from the sitemap. So assigning a
 * lawyer to the hidden `diaspora` category does not ADD them to /abroad, it
 * DELETES them from the public catalog. The one action that looks like „turn
 * this expert on for the diaspora" is the one action that takes them off the
 * site. That is not a bug in the category mechanism — a hidden category is
 * supposed to hide people — it is the wrong mechanism for this job.
 *
 * A diaspora client does not want a different kind of expert; they want the
 * SAME lawyer, accountant or business expert, reachable from abroad. So the
 * landing page is a curated VIEW over categories that already exist and stay
 * exactly where they are. Nobody moves, nothing disappears, and this list is
 * the only thing to edit when the offering changes.
 *
 * Order matters — it is the order the cards on the page are written in:
 *   law      → card 1, property / power of attorney / inheritance
 *   tax      → card 2, taxes and sole-trader status
 *   career   → card 3, coming home: salaries, vacancies, starting a business
 *   business → card 3 as well; „career" is still empty and business carries it
 */
export const ABROAD_SOURCE_CATEGORY_SLUGS = ['law', 'tax', 'career', 'business'] as const

/**
 * GEL → EUR for display. Rounded to whole euro: the rate is approximate to
 * begin with, so cents would be false precision, and „€33" is what a reader
 * actually compares against.
 */
export function eurFromGel(gel: number): number {
  return Math.round(gel * ABROAD_EUR_PER_GEL)
}

/**
 * The ONE euro price string. „≈ €33".
 *
 * The „≈" is not decoration and must not be dropped: the number is a converted
 * marketing figure, the charge is in lari, and a bare „€33" next to a „გადახდა"
 * button reads as a quote we are contractually offering. Anywhere a euro price
 * appears, it appears through here.
 */
export function eurLabel(gel: number): string {
  return `≈ €${eurFromGel(gel)}`
}

/**
 * Read one of the `abroad.cardN.priceGel` SiteText values.
 *
 * SiteText values are free-text strings an admin types, so „150 ლარი", „ 150 "
 * and „” are all reachable. A price that silently renders as „≈ €NaN" on a
 * landing page is worse than one that is merely out of date, so a value that
 * isn't a sane positive number falls back to the code default rather than
 * reaching the DOM.
 */
export function gelFromSiteText(raw: string | undefined, fallbackGel: number): number {
  const n = Number.parseInt(String(raw ?? '').replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallbackGel
}
