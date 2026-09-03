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

type ScriptCheck = { ok: true } | { ok: false; reason: 'no-georgian' | 'mostly-foreign' }

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

export function georgianError(field: string, c: ScriptCheck): string | null {
  if (c.ok) return null
  return c.reason === 'no-georgian'
    ? `${field} ქართულად დაწერე — საიტი ქართულენოვანია.`
    : `${field} ძირითადად ქართულად უნდა იყოს. ბრენდები და აბრევიატურები (SEO, HR, Google Ads) რჩება ლათინურად.`
}
export function georgianRefine(field: string) {
  return (value: string | null | undefined, ctx: { addIssue: (i: { code: 'custom'; message: string }) => void }) => {
    const c = checkGeorgian(value)
    if (!c.ok) ctx.addIssue({ code: 'custom', message: georgianError(field, c)! })
  }
}

/* ═══════════ A PERSON'S NAME ═════════════════════════════════════════════
 *
 * `checkGeorgian` above is a SHARE test (half the letters) and that is right for
 * prose — „Google Ads-ის სპეციალისტი" is real Georgian copy. A name has no
 * brands, acronyms or digits in it, so the share test was simply the wrong
 * instrument: it passed „Marietta Dzvelaia", and „luka kapanadze" is a live
 * ADMIN row. Names are Georgian letters, plus the hyphen of a double surname
 * and an apostrophe. Nothing else.
 *
 * Google sign-in is exempt by necessity — refusing the name would refuse the
 * sign-in — so it is caught at /apply instead, before anything becomes public.
 */
const GEORGIAN_NAME = /^[Ⴀ-ჿᲐ-Ჿⴀ-⴯\s'’-]+$/

/** The sentence to show, or null. Empty passes — required-ness is the field's
 *  own job. Names the fix and shows it: this usually fires on a value the
 *  person never typed, because it came from their Google account. */
export function georgianNameError(label: string, value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  if (!v || GEORGIAN_NAME.test(v)) return null
  return `${label} ქართულად ჩაწერე — მაგ. „ნინო ბერიძე“. ციფრი და ლათინური ასო არ გამოიყენება.`
}

/** zod adapter, so a schema states the rule by importing it, never by copy. */
export function georgianNameRefine(label: string) {
  return (value: string | null | undefined, ctx: { addIssue: (i: { code: 'custom'; message: string }) => void }) => {
    const msg = georgianNameError(label, value)
    if (msg) ctx.addIssue({ code: 'custom', message: msg })
  }
}

/* ═══════════ GETTING THE REASON BACK TO THE PERSON ══════════════════════
 *
 * A rule whose reason never reaches the field is half a rule: the save is
 * refused and „შენახვა ვერ მოხერხდა" names neither the field nor the fix, so
 * the only way forward is guessing. Four routes had grown their own private
 * copy of this and four more returned a bare 'INVALID' — same gate, four
 * different answers. One function, so a route surfaces the copy by importing
 * it rather than by remembering to.
 *
 * It reads OUR messages only, and the test for „ours" is the script: every
 * message we author is Georgian. zod's own English („String must contain at
 * least 2 character(s)") stays behind the generic code — it is a developer
 * string, not copy. That also catches messages written inline on a rule
 * (`.min(2, 'ძალიან მოკლეა')`), which the older per-route copies missed by
 * matching on `code === 'custom'` alone.
 */
export function firstGeorgianMessage(err: { issues: { message: string }[] }): string | null {
  return firstGeorgianIssue(err)?.message ?? null
}

/**
 * The same issue, WITH ITS PATH — which is how the form learns which box.
 *
 * ⚠️ WHY THE MESSAGE ALONE WAS NOT ENOUGH (2026-08-31). /api/me runs this gate
 * over TWO fields — `fullName` (the strict name rule) and `bio` (the prose
 * share test) — and answered both with one code, `INVALID_TEXT`, and one
 * sentence. /settings then had to guess which of its four boxes to mark, and
 * the only clue was the noun the message happens to open with („სახელი…" vs
 * „აღწერა…"), i.e. a substring match on copy. A rule that names a field must
 * hand the NAME over, not leave the reader's screen to infer it from prose.
 */
export function firstGeorgianIssue(
  err: { issues: { message: string; path?: PropertyKey[] }[] },
): { message: string; field: string | null } | null {
  const hit = err.issues.find(i => /[Ⴀ-ჿᲐ-Ჿ]/.test(i.message))
  if (!hit) return null
  const head = hit.path?.[0]
  return { message: hit.message, field: typeof head === 'string' ? head : null }
}
