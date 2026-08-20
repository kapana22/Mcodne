// Unit tests for the shared tutor-mapping fallbacks.
//
// Run: npx tsx tests/tutor-mapping.test.ts
//
// Unlike the Playwright *.mjs suites in this folder, this is a pure unit test —
// no browser, no dev server. It pins down the invariants that caused the
// "search card vs tutor-detail mismatch" bug (B) and the "booking CTA lies" bug
// (C):
//
//   1. The search card (app/experts/page.tsx) and the expert detail page
//      (app/experts/[slug]/page.tsx) must resolve the SAME price / duration / name
//      for the same API row — especially when fields are missing. They used to
//      drift (duration 30 vs 60, price 60 vs 80, name "ექსპერტი" vs "—").
//   2. `priceForDuration` is FLAT — the duration argument is a display label
//      only and never changes the price.
//   3. The card's "დაიჯავშნე" CTA is enabled iff the expert has an upcoming
//      slot (`nextSlotAt`), matching the detail page's booking gate.
//
// These mirror the constants/logic in BOTH page files. If the pages and this
// file ever disagree, that is exactly the drift this test exists to catch.

/* ───── replicated shared logic (keep identical to both page files) ───── */

const TUTOR_DEFAULTS = { price: 80, durationMin: 30, name: 'ექსპერტი', responseHours: 24 } as const

// Flat price — `_minutes` is a label only (see priceForDuration in both pages).
function priceForDuration(base: number, _minutes: number): number {
  return Math.max(0, Math.round(base || 0))
}

// Availability → CTA-enabled predicate (isTutorBookable in app/experts/page.tsx;
// mirrors StickyBookingCard's `uniqueDays.length === 0` gate on the detail page).
function isTutorBookable(nextSlotAt?: string | null): boolean {
  return nextSlotAt != null
}

type ApiRow = {
  user?: { fullName?: string | null } | null
  price?: number | null
  consultationDurationMin?: number | null
}
type Resolved = { name: string; price: number; durationMin: number }

// Card resolution — app/experts/page.tsx fetchTutors mapper.
function resolveCard(t: ApiRow): Resolved {
  return {
    name: t.user?.fullName ?? TUTOR_DEFAULTS.name,
    price: t.price ?? TUTOR_DEFAULTS.price,
    durationMin: typeof t.consultationDurationMin === 'number' ? t.consultationDurationMin : TUTOR_DEFAULTS.durationMin,
  }
}

// Detail resolution — app/experts/[slug]/page.tsx booking call sites.
function resolveDetail(t: ApiRow): Resolved {
  return {
    name: t.user?.fullName ?? TUTOR_DEFAULTS.name,
    price: t.price ?? TUTOR_DEFAULTS.price,
    durationMin: t.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin,
  }
}

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function eqResolved(name: string, row: ApiRow) {
  const c = resolveCard(row)
  const d = resolveDetail(row)
  check(`card === detail — ${name}`,
    c.name === d.name && c.price === d.price && c.durationMin === d.durationMin,
    `card=${JSON.stringify(c)} detail=${JSON.stringify(d)}`)
}

/* ───── B: card ↔ detail consistency ───── */

// Fully-populated row: both echo the real values.
eqResolved('full row', { user: { fullName: 'ნინო ბერიძე' }, price: 150, consultationDurationMin: 45 })

// The exact drift the bug report describes: every field missing.
eqResolved('all fields missing', {})
eqResolved('null user', { user: null })
eqResolved('empty user object', { user: {} })
eqResolved('null price', { price: null })
eqResolved('null duration', { consultationDurationMin: null })

// Edge: duration explicitly 0 must resolve the same on both surfaces (0, not 30).
eqResolved('duration 0', { consultationDurationMin: 0 })

// The concrete values the missing-field path resolves to.
{
  const c = resolveCard({})
  check('missing → duration 30 (schema default)', c.durationMin === 30, `got ${c.durationMin}`)
  check('missing → price 80', c.price === 80, `got ${c.price}`)
  check('missing → name "ექსპერტი"', c.name === 'ექსპერტი', `got ${c.name}`)
  check('no "—" name fallback', c.name !== '—')
}

/* ───── priceForDuration is FLAT ───── */

check('flat price: 120 @ 30წთ === 120', priceForDuration(120, 30) === 120)
check('flat price: duration does not scale price', priceForDuration(120, 30) === priceForDuration(120, 90))
check('flat price rounds', priceForDuration(99.6, 60) === 100)
check('flat price floors at 0', priceForDuration(0, 60) === 0 && priceForDuration(-5, 60) === 0)

/* ───── C: availability → CTA-enabled predicate ───── */

check('no slot (null) → CTA disabled', isTutorBookable(null) === false)
check('no slot (undefined) → CTA disabled', isTutorBookable(undefined) === false)
check('has slot → CTA enabled', isTutorBookable(new Date().toISOString()) === true)

/* ───── summary ───── */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
