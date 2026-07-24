// Registry of editable site texts. Pure data (no prisma) so it's safe to import
// in client components (the provider's fallback) AND on the server. Each entry's
// `default` is the exact string currently shipped; a SiteText DB row overrides
// it. To make a new string editable: add an entry here + render it with
// <SiteText k="..."/> (or useSiteText) where it appears.

export type SiteTextDef = {
  key: string
  group: string      // admin UI grouping
  label: string      // human label in the admin editor
  default: string
  multiline?: boolean
}

export const SITE_TEXTS: SiteTextDef[] = [
  // ── Landing hero ──
  { key: 'home.hero.line1', group: 'მთავარი — Hero', label: 'სათაური, 1-ლი ხაზი', default: '60 წუთი ექსპერტთან —' },
  { key: 'home.hero.line2', group: 'მთავარი — Hero', label: 'სათაური, აქცენტი (მწვანე)', default: '3 თვის გუგლის ნაცვლად.' },
  { key: 'home.hero.subtitle', group: 'მთავარი — Hero', label: 'ქვესათაური', multiline: true, default: 'McKinsey, BCG, FAANG, BIG4 — ქართველი პროფესიონალები, რომლებიც გადასახადს, კარიერას ან Series A-ს ვიდეოსესიით გადაგიწყვეტენ.' },
  { key: 'home.hero.subtitleEmphasis', group: 'მთავარი — Hero', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'აირჩიე დრო, დაჯავშნე, შეხვდი.' },

  // ── Footer ──
  { key: 'footer.tagline', group: 'Footer', label: 'აღწერა', multiline: true, default: 'მცოდნე — ცოდნის არქივი, სადაც ხვდები ხელით შერჩეულ ქართველ ექსპერტებს.' },
]

export const SITE_TEXT_DEFAULTS: Record<string, string> = Object.fromEntries(
  SITE_TEXTS.map(t => [t.key, t.default]),
)

// Guard: only known keys can be written from the admin API.
export function isKnownSiteTextKey(key: string): boolean {
  return key in SITE_TEXT_DEFAULTS
}
