/**
 * „ქართულად უნდა ეწეროს" — the language gate for user-written public text.
 *
 * WHY (2026-08-02, product decision): the entire product is Georgian, but the
 * public profiles were not gated, so real rows drifted: four experts carry a
 * Latin-only `fullName` („Mate Ivaniadze", „Marietta Dzvelaia"…) and one
 * headline reads „SEO expert" on an otherwise wholly Georgian catalogue. An
 * English version may come later; until it does, one language on one site.
 *
 * WHAT THIS IS NOT: a ban on Latin characters. Real Georgian business copy is
 * full of them — brands („Google Ads", „Figma"), acronyms („SEO", „HR", „IT"),
 * URLs, emails, numbers. A validator that rejected those would be wrong far
 * more often than the drift it exists to stop. So the rule is about the
 * DOMINANT script, not the presence of one:
 *
 *   • the text must contain Georgian letters at all, and
 *   • Georgian must be at least half of the letters it contains.
 *
 * Both mkhedruli (U+10D0–10FF) and mtavruli (U+1C90–1CBF) count, plus the
 * archaic asomtavruli/nuskhuri block (U+10A0–10CF) — a name written in caps
 * must not be rejected for being the "wrong" Georgian.
 *
 * SHORT TOKENS ARE EXEMPT. A service legitimately titled „SEO" or a category
 * literally named „IT" is not drift; anything with fewer than MIN_LETTERS
 * letters passes untouched. The drift this catches is sentences and names.
 */

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/g
const LATIN = /[A-Za-z]/g
const CYRILLIC = /[Ѐ-ӿ]/g

/** Below this many letters a string is a token (brand, acronym), not prose. */
const MIN_LETTERS = 8
/** Georgian must be at least this share of the letters. */
const MIN_GEORGIAN_SHARE = 0.5

export type ScriptCheck = { ok: true } | { ok: false; reason: 'no-georgian' | 'mostly-foreign' }

/**
 * Is this user-written text acceptably Georgian?
 *
 * Empty/absent input passes — required-ness is a separate concern and belongs
 * to the field's own schema, not here.
 */
export function checkGeorgian(value: string | null | undefined): ScriptCheck {
  if (!value) return { ok: true }
  const geo = (value.match(GEORGIAN) ?? []).length
  const lat = (value.match(LATIN) ?? []).length
  const cyr = (value.match(CYRILLIC) ?? []).length
  const letters = geo + lat + cyr
  if (letters < MIN_LETTERS) return { ok: true }
  if (geo === 0) return { ok: false, reason: 'no-georgian' }
  if (geo / letters < MIN_GEORGIAN_SHARE) return { ok: false, reason: 'mostly-foreign' }
  return { ok: true }
}

export function isGeorgian(value: string | null | undefined): boolean {
  return checkGeorgian(value).ok
}

/** The message the user sees. One sentence, informal, says what to do. */
export function georgianError(field: string, c: ScriptCheck): string | null {
  if (c.ok) return null
  return c.reason === 'no-georgian'
    ? `${field} ქართულად დაწერე — საიტი ქართულენოვანია.`
    : `${field} ძირითადად ქართულად უნდა იყოს. ბრენდები და აბრევიატურები (SEO, HR, Google Ads) რჩება ლათინურად.`
}

/**
 * Zod refinement helper — `z.string().superRefine(georgianRefine('სახელი'))`.
 * Kept separate from the check so non-zod callers (client hints) share the
 * exact same predicate and message.
 */
export function georgianRefine(field: string) {
  return (value: string, ctx: { addIssue: (i: { code: 'custom'; message: string }) => void }) => {
    const c = checkGeorgian(value)
    if (!c.ok) ctx.addIssue({ code: 'custom', message: georgianError(field, c)! })
  }
}
