// Design-system invariants that a type-checker cannot see.
//
// Run: npx tsx tests/designTokens.test.ts   (also picked up by `npm run check`)
//
// WHY THIS FILE EXISTS. Every other axis of the system (colour, type, motion,
// radius, shadow) is a token in tailwind.config.js, so drifting off it is at
// least visible in a diff. Two things were not protected at all:
//
//   A. CONTRAST. The canon states „a FILLED brand surface is brand-600
//      (brand-500 under white = 3.38, fails AA)" — with the measured number
//      written down — and six surfaces still shipped white text on brand-500,
//      including the reschedule picker's selected date and the student's
//      „enter session" button. A rule nothing checks is a comment.
//
//   B. STACKING ORDER. z-index was the one axis with NO token: 14 arbitrary
//      values whose ordering rationale lived only in prose, spread across six
//      components that each explained themselves in terms of their neighbours.
//
// Both are now enforced here, arithmetically — the ratios below are computed,
// not pasted, so re-tuning a palette step re-runs the real check.

import { readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

let failures = 0
function check(name: string, ok: boolean, hint: string) {
  if (ok) console.log(`✓ ${name}`)
  else { failures++; console.error(`✗ ${name}\n    ${hint}`) }
}

/* ── WCAG relative luminance / contrast ratio ─────────────────────────────── */
const luminance = (hex: string) => {
  const ch = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** Blend `fg` over `bg` at alpha — what `text-white/75` actually renders as. */
const blend = (fg: string, bg: string, alpha: number) =>
  '#' + [1, 3, 5].map(i => {
    const f = parseInt(fg.slice(i, i + 2), 16), b = parseInt(bg.slice(i, i + 2), 16)
    return Math.round(alpha * f + (1 - alpha) * b).toString(16).padStart(2, '0')
  }).join('')

/** Pull a `const NAME = { 500: '#…' }` scale straight out of the config. */
const cfg = read('tailwind.config.js')
const scale = (name: string) => {
  const body = cfg.split(`const ${name} = {`)[1]?.split('}')[0] ?? ''
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(\d+):\s*'(#[0-9A-Fa-f]{6})'/g)) out[m[1]] = m[2]
  return out
}
const BRAND = scale('BRAND_SCALE')
const WHITE = '#FFFFFF'
const AA = 4.5

// ── A. the fill rule, arithmetically ────────────────────────────────────────
{
  check(
    'A: brand-500 is genuinely too light for white text (the premise still holds)',
    contrast(WHITE, BRAND[500]) < AA,
    `brand-500 measures ${contrast(WHITE, BRAND[500]).toFixed(2)}. If a palette change made this pass, delete this rule rather than working around it.`,
  )
  check(
    'A2: brand-600 is the first step that carries white text',
    contrast(WHITE, BRAND[600]) >= AA,
    `brand-600 measures ${contrast(WHITE, BRAND[600]).toFixed(2)} — the canon's „fills start at 600" depends on it.`,
  )
}

// ── B. no surface pairs white text with a sub-AA fill ───────────────────────
{
  const grep = (pattern: string) => {
    try { return execSync(`grep -rn "${pattern}" app components`, { cwd: root }).toString().trim().split('\n').filter(Boolean) }
    catch { return [] as string[] }
  }
  // Same element, both classes. `bg-brand-500/40` style opacity utilities are
  // decoration (a glow, a track) and are excluded by the `[^/]` guard.
  const offenders = grep('bg-brand-500[^/]').filter(l => /text-white(?![\w/])/.test(l))
  check(
    'B: no element pairs a brand-500 fill with white text',
    offenders.length === 0,
    `${offenders.length} site(s): ${offenders.slice(0, 3).map(l => l.split(':').slice(0, 2).join(':')).join(', ')}. Use brand-600 — see rule A.`,
  )
  const warn = grep('bg-warning-500[^/]').filter(l => /text-white(?![\w/])/.test(l))
  check(
    'B2: the same holds for warning fills',
    warn.length === 0,
    `white on warning-500 is 3.67:1; warning-600 is 5.51. ${warn.length} site(s) left.`,
  )
}

// ── C. translucent white never sits on a mid-tone colour fill ───────────────
// A dark neutral ground (ink-800/900) carries white/50 at 5.2:1 and up, which
// is why the dark hero cards use it freely. A brand fill cannot: on brand-600
// even white/90 measures 4.19. So opacity is a legitimate hierarchy tool on the
// dark grounds and simply is not available on the coloured ones — there,
// hierarchy has to come from size and weight.
{
  check(
    'C: even 90% white fails on a brand-600 fill (why the rule is absolute)',
    contrast(blend(WHITE, BRAND[600], 0.9), BRAND[600]) < AA,
    'If this ever passes, the palette moved and the rule below can be relaxed.',
  )
  let offenders: string[] = []
  try {
    // Same line only: a translucent class on the very element that declares the
    // fill. Anything further away needs a DOM to resolve and is out of scope.
    offenders = execSync('grep -rn "text-white/[0-9]" app components', { cwd: root })
      .toString().trim().split('\n')
      .filter(l => /bg-(brand|warning|success|flame)-[56]00/.test(l))
  } catch { /* no matches */ }
  check(
    'C2: no element declares a colour fill and translucent white text together',
    offenders.length === 0,
    `${offenders.length} site(s). Use solid text-white and carry the hierarchy with size/weight.`,
  )
}

// ── C3. the muted ink step is only muted enough on WHITE ────────────────────
// ink-400 carries a documented „4.75:1" — measured against #FFFFFF. On the
// tinted plates the product actually uses for inert/disabled states (ink-75,
// ink-100) it drops to 4.40 / 4.02 and fails. Two such labels shipped
// („ჯავშანი მხოლოდ სტუდენტს" on both /tutors and the expert profile). Icons on
// those plates are fine — non-text needs only 3:1 — so this checks TEXT only.
{
  const INK = scale('INK_SCALE')
  check(
    'C3: ink-400 really does fail on the tinted plates (the premise)',
    contrast(INK[400], INK[75]) < AA && contrast(INK[400], INK[100]) < AA,
    `ink-400 measures ${contrast(INK[400], INK[75]).toFixed(2)} on ink-75.`,
  )
  check(
    'C4: ink-500 is the muted step that survives a tinted plate',
    contrast(INK[500], INK[75]) >= AA,
    `ink-500 measures ${contrast(INK[500], INK[75]).toFixed(2)} on ink-75 — the replacement this rule points to.`,
  )
  let offenders: string[] = []
  try {
    offenders = execSync('grep -rn "text-ink-400" app components', { cwd: root })
      .toString().trim().split('\n')
      .filter(l => /bg-ink-(75|100)(?![\w/])/.test(l))
      // An icon-only control is non-text (3:1) and legitimately stays muted.
      // Both are identifiable from the same line: an aria-label with no visible
      // string, or a `hover:bg-` that is a state rather than the resting plate.
      .filter(l => !/aria-label=/.test(l) && !/hover:bg-ink-(75|100)/.test(l))
      // A DISABLED control is exempt: WCAG 2.1 SC 1.4.3 excludes "inactive user
      // interface components" from the contrast minimum, and greying out is how
      // inactivity is communicated in the first place. Raising the contrast
      // there would make a dead button look live.
      .filter(l => !/\bdisabled\b/.test(l))
      // …and the remaining ones only matter if the element carries a size token,
      // i.e. it is styled as text.
      .filter(l => /text-(micro|meta|small|body|body-lg|h3|h2|h1)(?![\w-])/.test(l))
  } catch { /* no matches */ }
  check(
    'C5: no muted TEXT sits on a tinted ink plate',
    offenders.length === 0,
    `${offenders.length} site(s): ${offenders.slice(0, 2).map(l => l.split(':').slice(0, 2).join(':')).join(', ')}. Use ink-500 on ink-75/100.`,
  )
}

// ── F. a control's LABEL SIZE follows its HEIGHT ────────────────────────────
// <Btn> ships the two together — sm = h-9 + text-small, md = h-11 + text-body,
// lg = h-12 + text-body-lg — because height is how a control announces its
// importance and the label has to agree. 78 hand-built primary buttons had
// drifted off that pairing (measured 2026-08-06); the largest group, 55 of
// them, sat at h-11 with a 13px label — the size of a filter chip, on the
// page's main action. Quoting Btn.tsx: „the most important control on the page
// was one pixel bigger than a filter."
//
// ⚠️ This CANNOT be fixed by passing a size utility through `className`: two
// fontSize utilities on one element resolve by Tailwind's emit order, not by
// the order you wrote them. The pairing has to be right at the source.
{
  const TIER: Record<string, string> = { 'h-9': 'text-small', 'h-11': 'text-body', 'h-12': 'text-body-lg' }
  let offenders: string[] = []
  try {
    offenders = execSync('grep -rn "bg-brand-600 hover:bg-brand-700" app components', { cwd: root })
      .toString().trim().split('\n').filter(Boolean)
      .filter(line => {
        const h = line.match(/\bh-(?:9|11|12)\b/)?.[0]
        if (!h) return false
        const label = line.match(/\btext-(?:micro|meta|small|body-lg|body|h3)\b/)?.[0]
        // No label token on this line: it may sit on another line of a
        // multi-line className, which this static check cannot follow. The
        // rendered check (a Playwright pass over brand-filled controls) is what
        // catches those — it found one this way on /help.
        return !!label && label !== TIER[h]
      })
  } catch { /* no matches */ }
  check(
    'F: every hand-built primary button labels itself at its own height tier',
    offenders.length === 0,
    `${offenders.length} site(s): ${offenders.slice(0, 2).map(l => l.split(':').slice(0, 2).join(':')).join(', ')}. h-9→text-small, h-11→text-body, h-12→text-body-lg.`,
  )
}

// ── D. the stacking order is a token, and it is ordered ─────────────────────
{
  const z = require('../tailwind.config.js').theme.extend.zIndex as Record<string, string>
  check(
    'D: the stacking order exists as a token scale',
    !!z && Object.keys(z).length >= 10,
    'z-index was the only axis of the system with no token; the order must live in tailwind.config.js, not in six components\' comments.',
  )
  // The product rules these encode, stated as inequalities so a future edit
  // cannot quietly invert one.
  const order: [string, string, string][] = [
    ['skip', 'toast', 'a keyboard user\'s first control must never be covered'],
    ['toast', 'confirm', 'feedback outlives the surface that raised it'],
    ['confirm', 'sheet', 'a sheet can raise a confirm dialog'],
    ['sheet', 'drawer', 'a sheet opened from the nav must cover it'],
    ['drawer', 'drawer-scrim', 'the scrim sits exactly one below its drawer'],
    ['drawer-scrim', 'overlay', 'an open nav dialog covers in-page chrome'],
    ['overlay', 'impersonate', ''],
    ['impersonate', 'pill', 'the impersonation exit must stay reachable'],
    ['pill', 'consent', 'the consent banner must not paint over the profile pill'],
    ['consent', 'help', 'consent clears the floating buttons'],
    ['help', 'to-top', 'the two round buttons never trade places'],
    ['to-top', 'chrome', 'floating affordances clear the sticky bars'],
  ]
  const bad = order.filter(([a, b]) => !(Number(z[a]) > Number(z[b])))
  check(
    'D2: every documented layering relationship holds',
    bad.length === 0,
    bad.map(([a, b, why]) => `z-${a} must sit above z-${b}${why ? ` — ${why}` : ''}`).join('; '),
  )
  check(
    'D3: the drawer scrim is exactly one below the drawer',
    Number(z.drawer) - Number(z['drawer-scrim']) === 1,
    'A gap invites something to be inserted between a scrim and the surface it dims.',
  )
}

// ── E. no arbitrary z-index survives in the overlay range ───────────────────
{
  let stray: string[] = []
  try {
    stray = execSync('grep -rn "z-\\[[0-9]\\+\\]" app components', { cwd: root })
      .toString().trim().split('\n').filter(Boolean)
      // A value at or below Tailwind's own scale is ordinary in-flow elevation
      // (a badge over a photo) and is deliberately not part of this system.
      .filter(l => { const m = l.match(/z-\[(\d+)\]/); return m && Number(m[1]) > 40 })
  } catch { /* no matches */ }
  check(
    'E: no arbitrary z-[N] left above the chrome floor',
    stray.length === 0,
    `${stray.length} site(s) still hand-write a stacking value: ${stray.slice(0, 3).map(l => l.split(':').slice(0, 2).join(':')).join(', ')}. Name it in tailwind.config.js instead.`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} design-token guard(s) FAILED`)
  process.exit(1)
}
console.log('\nAll design-token guards passed.')
