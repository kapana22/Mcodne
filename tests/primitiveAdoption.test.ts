// A RATCHET on hand-built shells: the counts may fall, never rise.
//
// Run: npx tsx tests/primitiveAdoption.test.ts   (also in `npm run check`)
//
// WHY A RATCHET AND NOT A BAN. `lib/design/README` §8 has listed „hand-rolled
// card shell" and „hand-rolled primary button" as future-sweep debt since
// 2026-08-01. Re-measured on 2026-08-06 the numbers had GONE UP — cards
// 178 → 197, buttons 89 → 101 — so this is not a backlog draining slowly, it is
// a backlog being fed. The debt is not the problem; the inflow is.
//
// A ban is unshippable (200 sites fail on day one) and a silent backlog is what
// produced the growth. A ratchet is the third option: existing code keeps
// working, new code cannot add to the pile, and every migration mechanically
// tightens the limit for the next person.
//
// WHY THESE TWO SPECIFICALLY. They are the two primitives whose whole reason to
// exist is that the surface is decided ONCE — <Card> owns radius/border/
// background, <Btn> owns height/label-size/focus/press/disabled. A hand-built
// copy does not just duplicate classes, it opts that element out of every future
// fix. Both audits this month found real defects in exactly such copies: a
// 32px bulk-approve button, and cards carrying `bg-white/80 backdrop-blur-sm`
// that the canon forbids.
//
// WHEN YOU MIGRATE ONE: run this file, and lower the number below by what you
// removed. That edit is the point — it is a one-way gate.
//
// ⚠️ NOT a licence to convert in bulk. Measured 2026-08-06: only 24 of 201 card
// shells carry a padding that maps exactly onto a <Card> tier, and only 11 of
// 101 buttons match a <Btn> size in BOTH height and label size. The rest would
// silently resize, and a className override cannot fix it (two padding or two
// fontSize utilities on one element resolve by Tailwind's emit order, not by
// the order you wrote them). Convert the exact matches in files you are already
// touching; anything else is a design decision, not a refactor.

import { execSync } from 'child_process'
import { join } from 'path'

const root = join(__dirname, '..')
const count = (cmd: string) => {
  try { return Number(execSync(cmd, { cwd: root }).toString().trim()) } catch { return 0 }
}

let failures = 0
function ratchet(name: string, actual: number, limit: number, hint: string) {
  if (actual <= limit) {
    const slack = limit - actual
    console.log(`✓ ${name}: ${actual} (limit ${limit})${slack > 0 ? ` — ${slack} migrated, LOWER THE LIMIT to ${actual}` : ''}`)
  } else {
    failures++
    console.error(`✗ ${name}: ${actual} > ${limit}\n    ${hint}`)
  }
}

// The exact shell <Card> replaces: radius + ink-200 border + white ground.
const cardShells = count(
  `grep -rn 'rounded-card' app components | grep 'border-ink-200' | grep -c 'bg-white'`,
)
// The exact fill+hover pair <Btn variant="primary"> owns.
const handButtons = count(
  `grep -rn 'bg-brand-600 hover:bg-brand-700' app components | wc -l`,
)

ratchet(
  'hand-built card shells',
  cardShells,
  76, // 2026-09-01: measured 76, down from 79 — the UX sweep put `_tracker`, the
      // provider's identity panel and the offer thread on <Card>. The file's own
      // rule is that the limit IS the measurement, so it comes down with it;
      // a ceiling left above the count stops guarding the next hand-rolled shell.
      // Previously: 79 // 2026-08-31 (later the same day, after „How It Works + Help" landed on /about and /help): measured 78, down from 81 — the /about principle cards and the /help channel cards are <Card edge="hairline"> now. Same reason as the 100 → 81 step above: the owner's canvases draw one card, so a ported screen reaches for the primitive. Lowered to the measurement, as the note above requires.
  // +1 on 2026-08-31: the redesign's 28px `rounded-panel` sections are not a
  // <Card> tier, and one of them still spells the card shell by hand. Debt,
  // logged rather than hidden — lower it the moment that panel becomes a
  // primitive.
  'Use <Card> (components/Card.tsx). If the padding is not one of its tiers, that is a design decision — raise it rather than hand-rolling a shell.',
)
ratchet(
  'hand-built primary buttons',
  handButtons,
  37, // 2026-09-01: measured 37, down from 38 — /me's error boundary uses <Btn>.
      // Previously: 38 // 2026-08-31 (later the same day): measured 38, down from 40 — /about's closing band and /help's two support actions are <Btn> now. Same reasoning as the line above — the limit is the measurement, or it stops guarding anything.
  'Use <Btn variant="primary">. A hand-built copy opts out of the shared focus ring, press state and disabled handling.',
)

// Dead tracking is a HARD zero, not a ratchet: globals.css out-cascades every
// `tracking-*` on an uppercase element, so any new one is guaranteed-dead code
// the moment it is typed. 182 were removed 2026-08-06 and the rendered
// letter-spacing across 118 elements on 8 page/width combos was byte-identical
// before and after — this is provably safe to hold at zero.
// The exception the regex must allow: an INNER element that opts out with
// `normal-case`, whose `tracking-normal` is live precisely because the
// `[class*="uppercase"]` selector does not match it.
const deadTracking = count(
  `grep -rn 'uppercase' app components | grep 'tracking-' | grep -v 'normal-case' | grep -vc '^\\s*\\*\\|//' || true`,
)
ratchet(
  'dead tracking-* on uppercase elements',
  deadTracking,
  1, // components/Eyebrow.tsx's explanatory comment mentions both words.
  'globals.css `[class*="uppercase"] { letter-spacing: .14em }` wins over any tracking-* utility. Retune that ONE rule instead.',
)

// The same rule, TAG-scoped (stage 11, 2026-08-19): a className that wraps
// onto several lines hides `uppercase` and `tracking-*` from the line grep
// above. Every JSX opening tag in app/components/lib is checked as one string;
// the only allowed pair is the `normal-case` opt-out. Measured 0 tonight — a
// hard zero, no comment allowance needed because comments are not tags.
{
  const { readdirSync, statSync, readFileSync } = require('fs') as typeof import('fs')
  const walk = (d: string, out: string[] = []): string[] => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.tsx?$/.test(f)) out.push(p)
    }
    return out
  }
  let tagScoped = 0
  const where: string[] = []
  for (const dir of ['app', 'components', 'lib']) {
    for (const p of walk(join(root, dir))) {
      const src = readFileSync(p, 'utf8')
      if (!src.includes('tracking-')) continue
      for (const m of src.matchAll(/<[A-Za-z][^<>]*>/gs)) {
        const t = m[0]
        if (t.includes('uppercase') && /tracking-/.test(t) && !t.includes('normal-case')) {
          tagScoped++
          where.push(`${p.slice(root.length + 1)}:${src.slice(0, m.index).split('\n').length}`)
        }
      }
    }
  }
  ratchet(
    'dead tracking-* on uppercase elements (tag-scoped, multi-line)',
    tagScoped,
    0,
    `${where.slice(0, 5).join(', ')} — delete the tracking-* utility; the uppercase rule owns letter-spacing.`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} adoption ratchet(s) FAILED — the pile grew.`)
  process.exit(1)
}
console.log('\nAll adoption ratchets hold.')
