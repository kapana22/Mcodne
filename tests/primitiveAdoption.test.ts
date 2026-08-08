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
  201,
  'Use <Card> (components/Card.tsx). If the padding is not one of its tiers, that is a design decision — raise it rather than hand-rolling a shell.',
)
ratchet(
  'hand-built primary buttons',
  handButtons,
  101,
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

if (failures > 0) {
  console.error(`\n${failures} adoption ratchet(s) FAILED — the pile grew.`)
  process.exit(1)
}
console.log('\nAll adoption ratchets hold.')
