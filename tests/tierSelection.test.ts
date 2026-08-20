// Invariants for tier resolution (components/booking/slots.ts).
//
// Run: npx tsx tests/tierSelection.test.ts
//
// WHY: the pre-tier surfaces (profile „განრიგი", desktop rail, mobile bar) used
// to derive their times from the SHORTEST service. An expert offering a free
// 15-min intro next to a 60-min consultation therefore had their schedule drawn
// on a 15-minute grid, most of whose starts cannot hold 60 minutes. A visitor
// picked one, chose the 60-min service, and the flow silently dropped the time.
// These pins keep the replacement rule — flagship = LONGEST PAID — from
// regressing, along with the free-tier labelling that „₾0" used to break.
import { primaryService, primaryServiceMin, orderedTiers, tierPriceLabel, isFreeTier, fromPriceLabel, primaryPriceLabel, type ConsultationItem } from '../components/booking/slots'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const tier = (id: string, minutes: number, price: number): ConsultationItem =>
  ({ id, tier: id, title: id, description: null, minutes, price })

// The exact shape that caused the bug.
const INTRO = tier('intro', 15, 0)
const QUICK = tier('quick', 30, 45)
const FULL = tier('full', 60, 80)

/* ═══════════ 1. flagship selection ═══════════════════════════════════════ */

{
  check('flagship is the longest PAID tier, not the shortest',
    primaryService([INTRO, QUICK, FULL])?.id === 'full')
  check('a free intro never becomes the flagship',
    primaryService([INTRO, QUICK])?.id === 'quick')
  check('payload order does not matter',
    primaryService([FULL, INTRO, QUICK])?.id === 'full')
  check('single paid tier is the flagship',
    primaryService([FULL])?.id === 'full')
  check('all-free is a legal (if odd) profile — longest free wins over nothing',
    primaryService([INTRO, tier('long-free', 45, 0)])?.id === 'long-free')
  check('no tiers → null', primaryService([]) === null)
  check('zero/negative minutes are ignored',
    primaryService([tier('bad', 0, 50), FULL])?.id === 'full')

  check('primaryServiceMin returns the flagship minutes',
    primaryServiceMin([INTRO, QUICK, FULL], 30) === 60)
  check('primaryServiceMin falls back to the profile duration with no tiers',
    primaryServiceMin([], 45) === 45)
}

/* ═══════════ 2. ordering ═════════════════════════════════════════════════ */

{
  const ids = orderedTiers([INTRO, QUICK, FULL]).map(t => t.id)
  check('paid tiers come first, longest first; free intro last',
    ids.join(',') === 'full,quick,intro', ids.join(','))
  check('the first ordered tier IS the flagship',
    orderedTiers([INTRO, QUICK, FULL])[0].id === primaryService([INTRO, QUICK, FULL])?.id)
  check('ordering is stable regardless of input order',
    orderedTiers([FULL, INTRO, QUICK]).map(t => t.id).join(',') ===
    orderedTiers([INTRO, QUICK, FULL]).map(t => t.id).join(','))
  check('invalid-minute rows are dropped',
    orderedTiers([tier('bad', 0, 10), FULL]).length === 1)
}

/* ═══════════ 3. free-tier labelling ══════════════════════════════════════ */

{
  check('a zero-price tier is free', isFreeTier(INTRO))
  check('a priced tier is not free', !isFreeTier(FULL))
  check('free renders as „უფასო", never „₾0"', tierPriceLabel(INTRO) === 'უფასო')
  check('paid renders as ₾N', tierPriceLabel(FULL) === '₾80')

  // The headline price on the card / rail / mobile bar.
  check('from-price ignores the free intro (was „₾0-დან")',
    fromPriceLabel([INTRO, QUICK, FULL], 80).label === '₾45-დან',
    fromPriceLabel([INTRO, QUICK, FULL], 80).label)
  check('from-price with one paid tier + a free intro shows the paid price',
    fromPriceLabel([INTRO, FULL], 80).label === '₾80',
    fromPriceLabel([INTRO, FULL], 80).label)
  check('equal paid prices are not a range',
    fromPriceLabel([tier('a', 30, 80), tier('b', 60, 80)], 80).isFrom === false)
  check('an all-free expert still reads „უფასო"',
    fromPriceLabel([INTRO], 0).label === 'უფასო',
    fromPriceLabel([INTRO], 0).label)
}

/* ═══════════ 4. THE headline price — one expert, one number ══════════════
 * Measured on production 2026-07-31: a single expert advertised THREE prices
 * at once. The /tutors card priced `consultationDurationMin` (the profile-level
 * default — not a service anyone can buy) and printed „₾80 · 30 წთ"; the profile
 * rail ran `fromPriceLabel` and printed „₾25-დან" (the cheapest tier); the
 * service list printed the truth. Someone who clicked ₾25 met ₾80.
 * `primaryPriceLabel` is now the ONE source both pre-tier surfaces read, and it
 * resolves the same flagship tier the „განრიგი" grid and the tier step already
 * lead with — so the price and the times on screen describe one service.
 */
{
  /* ⚠️ THE HEADLINE IS THE FLOOR, NOT THE FLAGSHIP (changed 2026-08-20).
   *
   * This block asserted the opposite for months, and the old rule was right for
   * the page it was written for: a card that prints ONE exact number must print
   * the one most people buy, or „₾25" leads to a ₾80 meeting.
   *
   * The card stopped printing an exact number. Owner chose „50₾-დან" after the
   * market check — Fiverr „From $45", Airtasker „From $150", Base44
   * „From $500" — because an expert publishes several tiers and a single figure
   * claims to be the price of a thing that has more than one. A floor is always
   * true; the exact number belongs on the booking screen, where a tier has been
   * chosen. So the headline resolves the CHEAPEST paid row and says „-დან".
   *
   * What did NOT change, and is still asserted below: the free intro never
   * prices the profile, payload order is irrelevant, and the card and the rail
   * resolve one label. Those are the properties the original bug was about.
   */
  const head = primaryPriceLabel([INTRO, QUICK, FULL], 80, 30)
  check('headline price is the FLOOR of the paid tiers',
    head.label === '₾45', head.label)
  check('the floor carries its own length, not the flagship\'s',
    head.minutes === 30, String(head.minutes))
  check('a range says so',
    head.isFrom === true, String(head.isFrom))
  check('one paid tier is not a range',
    primaryPriceLabel([INTRO, QUICK], 80, 30).isFrom === false)
  check('the free intro never sets the headline price',
    primaryPriceLabel([INTRO, QUICK], 80, 30).label === '₾45')
  check('payload order does not matter',
    primaryPriceLabel([FULL, INTRO, QUICK], 80, 30).minutes === 30)

  // The card and the rail must agree by construction — that is the whole point.
  const card = primaryPriceLabel([INTRO, QUICK, FULL], 80, 30)
  const rail = primaryPriceLabel([INTRO, QUICK, FULL], 80, 60)
  check('card and rail resolve the SAME label whatever fallback they pass',
    card.label === rail.label && card.minutes === rail.minutes,
    `${card.label}/${card.minutes} vs ${rail.label}/${rail.minutes}`)

  // No tiers published → fall back to the flat profile price + the caller's
  // duration. This is the ONLY branch where the fallback minutes are used.
  const flat = primaryPriceLabel([], 80, 45)
  check('no tiers → flat price + caller fallback duration',
    flat.label === '₾80' && flat.minutes === 45,
    `${flat.label}/${flat.minutes}`)
  check('an all-free profile still reads „უფასო", never „₾0"',
    primaryPriceLabel([INTRO], 0, 15).label === 'უფასო')

  // ⚠️ A SERVICE HAS NO CLOCK, and it OUTRANKS the bookable rows: the site
  // sells services, so when somebody publishes one it is what the card leads
  // with. `minutes` is null and the suffix is a word, never „· 0 წთ".
  const JOB = { id: 'job', tier: 'job', title: 'დეკლარაცია', description: null, minutes: 0, price: 100, bookable: false }
  const withJob = primaryPriceLabel([INTRO, QUICK, FULL, JOB], 80, 30)
  check('a published service leads the headline', withJob.isService === true, String(withJob.isService))
  check('a service headline carries no duration', withJob.minutes === null, String(withJob.minutes))
}

/* ───── summary ───── */
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
