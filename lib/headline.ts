/**
 * Display normaliser for `TutorProfile.headline` — the one line an expert
 * writes about themselves.
 *
 * WHY THIS EXISTS. `headline` is free text, and until 2026-07-31 we asked for it
 * badly: the /apply placeholder was literally „მაგ. ბიზნეს-სტრატეგი · 12 წელი",
 * i.e. we TAUGHT experts to put their years in it, and the profile editor
 * allowed 200 characters with no guidance. The result on the live roster:
 *
 *   „AI ინჟინერი - 7 წელი"                    + a „7 წლის გამოცდილება" row below
 *   „გაყიდვების ექსპერტი 4 წელი"              + a „4 წლის გამოცდილება" row below
 *   „SMM•content creator - 1 წლიანი გამოცდილება" + a „1 წლის გამოცდილება" row below
 *   „ფსიქოლოგი | ფსიქოლოგიური კონსულტანტი"    — an ASCII pipe as a separator
 *
 * The input side is now fixed (60-char cap + a counter + an honest hint, and the
 * placeholder no longer contains a number). This function handles the rows that
 * already exist, and any future one that slips through — no migration, and the
 * expert's stored text is never rewritten, only its RENDERING.
 *
 * Deliberately NOT done here: detecting that a headline merely restates its
 * category („მარკეტერი" under „მარკეტინგი"). Any stem rule sharp enough to catch
 * that also eats „ბიზნეს-სტრატეგი" under „ბიზნესი", where the headline is the
 * MORE specific of the two. Mild redundancy is harmless once the card gives the
 * two fields different visual weight (category = chip, headline = quiet text);
 * it only read as a fault while both were competing for the same loud slot.
 */

/**
 * Trailing experience fragment: an optional separator, a number, then a Georgian
 * year word, then an optional „გამოცდილება". Anchored to the END so a headline
 * that is genuinely ABOUT a duration („5 წლის გეგმა ბიზნესისთვის") keeps it.
 */
const TRAILING_YEARS = /[\s·•|,–—-]*\d+\s*(?:წლ(?:ის|იანი)?|წელი|წელიწადი)\s*(?:გამოცდილებ(?:ა|ის))?\s*$/u

/** Separators experts type by hand. Normalised to the site's „·" middot. */
const ODD_SEPARATORS = /\s*[|/]\s*/gu

export function displayHeadline(raw: string | null | undefined): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  // Years first: the fragment can itself end in a separator once stripped.
  s = s.replace(TRAILING_YEARS, '')
  s = s.replace(ODD_SEPARATORS, ' · ')
  // „SMM•content creator" — a bullet with no spaces is a typo, not a separator.
  s = s.replace(/\s*•\s*/gu, ' · ')
  // Collapse whitespace and shed any separator left dangling at either end.
  s = s.replace(/\s+/gu, ' ').replace(/^[\s·-]+|[\s·-]+$/gu, '').trim()
  return s
}

/**
 * The cap the profile editor and /apply both enforce. 60 is measured, not
 * guessed: at 390px the browse card gives the headline ~2 lines of `text-meta`
 * before the bio starts, which is ~60 Georgian characters. Above that the card
 * truncates and the expert never sees the end of their own sentence.
 * (The DB column is unbounded and existing longer rows still render — the cap
 * governs what can be TYPED from here on.)
 */
export const HEADLINE_MAX = 60

/** Minimum that still says something. Mirrors lib/profileScore's own gate. */
export const HEADLINE_MIN = 20
