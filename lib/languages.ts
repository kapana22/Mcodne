/**
 * Canonical language list + normalizer.
 *
 * `TutorProfile.languages` stores ISO-639-1 CODES ("ka","en") — that is what the
 * profile editor's chips, the browse filter and the profile meta row all read.
 * But /apply collects languages as free text („ქართული · მშობლიური"), and older
 * rows were written with bare Georgian NAMES. Feeding a name into a code-based
 * UI shows zero chips selected, the expert re-picks them, and the array ends up
 * holding both spellings → the card renders „ქართული · English · ქართული · English".
 *
 * Everything that writes `languages` must run its input through `normalizeLangs`
 * so only canonical codes ever reach the DB.
 */

export type LanguageOption = { code: string; label: string }

/**
 * The canonical set. `label` is the Georgian name shown in the editor chips.
 * `aliases` are every spelling we accept on the way IN (Georgian name, English
 * name, endonym, ISO-639-1/2) — lowercased, matched exactly after trimming.
 * The code itself is always accepted, so it isn't repeated in `aliases`.
 */
const TABLE: (LanguageOption & { aliases: string[] })[] = [
  { code: 'ka', label: 'ქართული',        aliases: ['ქართული', 'ქარ', 'georgian', 'kat', 'geo', 'ქართული ენა'] },
  { code: 'en', label: 'ინგლისური',      aliases: ['ინგლისური', 'ინგლ', 'english', 'eng', 'англ', 'английский'] },
  { code: 'ru', label: 'რუსული',         aliases: ['რუსული', 'russian', 'русский', 'rus'] },
  { code: 'de', label: 'გერმანული',      aliases: ['გერმანული', 'german', 'deutsch', 'deu', 'ger'] },
  { code: 'fr', label: 'ფრანგული',       aliases: ['ფრანგული', 'french', 'français', 'francais', 'fra', 'fre'] },
  { code: 'tr', label: 'თურქული',        aliases: ['თურქული', 'turkish', 'türkçe', 'turkce', 'tur'] },
  { code: 'es', label: 'ესპანური',       aliases: ['ესპანური', 'spanish', 'español', 'espanol', 'spa'] },
  { code: 'it', label: 'იტალიური',       aliases: ['იტალიური', 'italian', 'italiano', 'ita'] },
  { code: 'az', label: 'აზერბაიჯანული',  aliases: ['აზერბაიჯანული', 'azerbaijani', 'azeri', 'azərbaycan', 'azerbaycan', 'aze'] },
  { code: 'hy', label: 'სომხური',        aliases: ['სომხური', 'armenian', 'հայերեն', 'hye', 'arm'] },
  { code: 'uk', label: 'უკრაინული',      aliases: ['უკრაინული', 'ukrainian', 'українська', 'ukr'] },
  { code: 'ar', label: 'არაბული',        aliases: ['არაბული', 'arabic', 'العربية', 'ara'] },
  { code: 'zh', label: 'ჩინური',         aliases: ['ჩინური', 'chinese', 'mandarin', '中文', 'zho', 'chi'] },
]

/**
 * The three that are always OFFERED as chips.
 *
 * MEASURED 2026-07-31, across all 12 profiles: ka×11, en×5, ru×1, de×1 — four
 * languages in use, thirteen chips on screen to express them. A picker whose
 * options outnumber its real answers 3:1 is a wall to read past, not a choice.
 *
 * The other ten did not disappear: `TABLE` still holds the canonical set,
 * a typed entry is normalized against it (so „French", „ფრანგული" and „fr" all
 * land on `fr`), and any code ALREADY on a profile renders as its own chip —
 * the one expert with German keeps German without touching anything.
 */
export const PRIMARY_LANG_CODES = ['ka', 'en', 'ru'] as const
export const PRIMARY_LANGUAGES: LanguageOption[] =
  PRIMARY_LANG_CODES.map(c => ({ code: c, label: TABLE.find(t => t.code === c)!.label }))

/** code → Georgian label, for rendering a stored array. */
export const LANG_LABELS: Record<string, string> = Object.fromEntries(TABLE.map(l => [l.code, l.label]))

/** Renders a stored code; unknown codes fall back to themselves (never blank). */
export function langLabel(code: string): string {
  return LANG_LABELS[code] ?? code
}

const ALIAS_TO_CODE: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const l of TABLE) {
    m[l.code] = l.code
    m[l.label.toLowerCase()] = l.code
    for (const a of l.aliases) m[a.toLowerCase()] = l.code
  }
  return m
})()

/**
 * Normalize ANY single input to a canonical code, or null when unrecognized.
 * Handles the shapes we actually see in the wild:
 *   „ქართული · მშობლიური" | „English | C2" | „French (B2)" | „en-US" | „ENG"
 * The level/qualifier is dropped — only the language itself is stored.
 */
export function toLangCode(input: string): string | null {
  if (typeof input !== 'string') return null
  let s = input
    // Level/qualifier separators used in /apply's free-text chips.
    .split('·')[0].split('|')[0].split('(')[0].split(',')[0]
    // „English – C2" / „English - native" (spaced dash only, so "en-US" survives).
    .replace(/\s[-–—]\s.*$/, '')
    .trim()
    .toLowerCase()
  if (!s) return null
  // Locale tags („ka-GE", „en_US") → the language subtag.
  const locale = /^([a-z]{2,3})[-_][a-z0-9]{2,4}$/.exec(s)
  if (locale) s = locale[1]
  return ALIAS_TO_CODE[s] ?? null
}

/**
 * Normalize a whole stored/submitted array to deduped canonical codes.
 * Unrecognized entries are dropped — there is no safe way to keep a value the
 * code-based UI can't render. Capped at the full canonical list length.
 */
export function normalizeLangs(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  for (const v of values) {
    const code = toLangCode(String(v ?? ''))
    if (code && !out.includes(code)) out.push(code)
  }
  return out
}
