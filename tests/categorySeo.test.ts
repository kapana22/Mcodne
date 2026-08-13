// Invariants for the category landing-page SEO copy (lib/categorySeo.ts).
//
// Run: npx tsx tests/categorySeo.test.ts
//
// This data drives 15 indexable URLs and every field is rendered into a <title>
// or a <meta name="description"> — the two elements a search engine weighs most
// and the only ones a visitor sees before deciding to click. Every way this
// breaks is silent: a title that runs long is simply truncated mid-word in the
// results, and nothing in the build complains.
//
// The length ceilings are not stylistic. Google shows roughly 60 characters of
// a title and roughly 160 of a description; past that the tail is cut. These
// pins exist because BOTH limits have already been crossed in this file's
// history — descriptions once carried the full 280–300-char intro paragraph,
// and titles once ran 62–64 with a descriptive suffix.
import { categorySeo, fallbackSeo, type CategorySeo } from '../lib/categorySeo'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Exactly what app/categories/[slug] renders. Keep in sync with it. */
const renderTitle = (s: CategorySeo) => `${s.keyword} — ${s.titleTail} | მცოდნე`

const TITLE_MAX = 60
const DESC_MAX = 160
const DESC_MIN = 70

const entries = Object.entries(categorySeo)

/* ═══════════ 1. every sphere is fully populated ══════════════════════════ */

{
  check('there are 15 spheres', entries.length === 15, String(entries.length))
  const missing = entries.filter(([, v]) => !v.keyword || !v.titleTail || !v.metaDescription || !v.intro)
  check('every entry has keyword / titleTail / metaDescription / intro',
    missing.length === 0, missing.map(([k]) => k).join(', '))
  check('every entry has 3+ FAQ pairs (feeds FAQPage JSON-LD)',
    entries.every(([, v]) => v.faq.length >= 3 && v.faq.every(f => f.q && f.a)))
}

/* ═══════════ 2. the rendered title must survive the SERP ═════════════════ */

{
  const long = entries.filter(([, v]) => renderTitle(v).length > TITLE_MAX)
  check(`rendered title ≤ ${TITLE_MAX} chars`, long.length === 0,
    long.map(([k, v]) => `${k}:${renderTitle(v).length}`).join(', '))

  // The point of titleTail: the title must be more than the service name.
  const bare = entries.filter(([, v]) => !v.titleTail.trim())
  check('no sphere falls back to a bare service name', bare.length === 0, bare.map(([k]) => k).join(', '))

  // Distinct titles — two spheres sharing one title compete with each other.
  const titles = entries.map(([, v]) => renderTitle(v))
  check('every rendered title is unique', new Set(titles).size === titles.length)
}

/* ═══════════ 3. descriptions are ad copy, not the intro paragraph ════════ */

{
  const long = entries.filter(([, v]) => v.metaDescription.length > DESC_MAX)
  check(`metaDescription ≤ ${DESC_MAX} chars`, long.length === 0,
    long.map(([k, v]) => `${k}:${v.metaDescription.length}`).join(', '))

  const short = entries.filter(([, v]) => v.metaDescription.length < DESC_MIN)
  check(`metaDescription ≥ ${DESC_MIN} chars (don't waste the slot)`, short.length === 0,
    short.map(([k, v]) => `${k}:${v.metaDescription.length}`).join(', '))

  // The regression this field was created to fix: description === intro.
  const same = entries.filter(([, v]) => v.metaDescription.trim() === v.intro.trim())
  check('metaDescription is never just the intro paragraph', same.length === 0,
    same.map(([k]) => k).join(', '))

  const dupes = entries.map(([, v]) => v.metaDescription)
  check('every description is unique', new Set(dupes).size === dupes.length)
}

/* ═══════════ 4. the fallback must obey the same rules ════════════════════ */

{
  // Any sphere seeded without its own entry renders through this — it must not
  // be the one page that ships a broken title.
  // ⚠️ THE WORST REAL NAME, NOT A CONVENIENT ONE. This used to pass
  // `'უძრავი ქონება'` — 13 characters, which rendered to exactly 60 and
  // squeaked through — while SEVEN live spheres with longer names were shipping
  // 63–72-character titles that Google was cutting. A ceiling checked against
  // one hand-picked input is not a ceiling.
  //
  // The names below are the longest that exist in the seeded taxonomy
  // (prisma/seedCategories + the 2026-08-10 hierarchy migration). If a longer
  // sphere is ever added and this list is not updated, that page ships a cut
  // title — so the list is deliberately explicit rather than a single sample.
  const WORST_NAMES = [
    'არქიტექტურა და მშენებლობა',
    'გრანტები და დაფინანსება',
    'ტურიზმი და მასპინძლობა',
    'ჯანმრთელობა და კვება',
    'უძრავი ქონება',
  ]
  const over = WORST_NAMES
    .map(n => ({ n, len: renderTitle(fallbackSeo(n)).length }))
    .filter(x => x.len > TITLE_MAX)
  check(`fallback title ≤ ${TITLE_MAX} for every real sphere name`, over.length === 0,
    over.map(x => `${x.n}:${x.len}`).join(', '))

  const fb = fallbackSeo('უძრავი ქონება')
  check('fallback description is within budget',
    fb.metaDescription.length <= DESC_MAX && fb.metaDescription.length >= 40,
    String(fb.metaDescription.length))
  check('fallback still carries a FAQ', fb.faq.length >= 3)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
