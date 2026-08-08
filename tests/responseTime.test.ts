// Unit tests for lib/responseTime.ts — the MEASURED expert response time.
//
// Run: npx tsx tests/responseTime.test.ts
//
// Pure unit test (no browser, no dev server, no DB), in the style of
// tests/availability.test.ts. It pins the invariants that make this number
// safe to publish as a fact:
//
//   1. Conversations the EXPERT started are excluded — outreach is not a
//      response time, and counting it would flatter the median.
//   2. It is a MEDIAN, not a mean: one forgotten weekend thread must not move
//      the published number.
//   3. The minimum-sample gate: below RESPONSE_MIN_SAMPLE answered
//      conversations the answer is null and the UI shows nothing.
//   4. The 90-day window: an inbound message older than the window doesn't
//      count, so an expert can't coast on ancient behavior.
//   5. No data → null. An unanswered thread is outside the sample (neither a
//      fast reply nor an infinite one).
//   6. The Georgian label re-checks the sample gate, so a stale row can never
//      leak a 1-conversation "median" onto a card.
//
// All fixtures are explicit UTC instants — no Math.random(), no `new Date()`
// without an argument: every case is deterministic.

import {
  computeResponseStats,
  responseTimeLabelKa,
  responseWindowStart,
  RESPONSE_MIN_SAMPLE,
  RESPONSE_WINDOW_DAYS,
  type ResponseMsgRow,
} from '../lib/responseTime'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ───── fixtures ───── */

const EXPERT = 'expert-1'
const NOW = new Date(Date.UTC(2026, 6, 27, 12, 0)) // 2026-07-27 12:00Z

// Minutes before NOW → an instant.
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000)
const DAY = 24 * 60

// A message FROM the partner TO the expert, `min` minutes before NOW.
const inbound = (partner: string, min: number, bookingId: string | null = null): ResponseMsgRow =>
  ({ fromId: partner, toId: EXPERT, bookingId, createdAt: ago(min) })
// …and the reverse.
const outbound = (partner: string, min: number, bookingId: string | null = null): ResponseMsgRow =>
  ({ fromId: EXPERT, toId: partner, bookingId, createdAt: ago(min) })

/**
 * A conversation the partner opened `startMin` before NOW and the expert
 * answered `gapMin` later. Rows are emitted out of order on purpose — the
 * library must sort them itself.
 */
const answered = (partner: string, startMin: number, gapMin: number, bookingId: string | null = null) => [
  outbound(partner, startMin - gapMin, bookingId),
  inbound(partner, startMin, bookingId),
]

/* ───── 1. expert-initiated threads are excluded ───── */

// Three healthy client-started conversations (gaps 10/20/30) + one thread the
// expert opened and the client answered instantly. If the expert-started thread
// leaked in, its ~0 gap would pull the median from 20 down to 15.
const withOutreach: ResponseMsgRow[] = [
  ...answered('c1', 100, 10),
  ...answered('c2', 200, 20),
  ...answered('c3', 300, 30),
  // expert opens, client replies 1 min later, expert follows up 2 min after that
  outbound('c4', 400),
  inbound('c4', 399),
  outbound('c4', 397),
]
const outreachStats = computeResponseStats(EXPERT, withOutreach, NOW)
check('expert-initiated thread is ignored (median stays 20, sample 3)',
  outreachStats?.medianMin === 20 && outreachStats?.sampleN === 3,
  JSON.stringify(outreachStats))

// The very same 4th thread, on its own, must produce nothing at all.
check('a lone expert-initiated thread yields no sample',
  computeResponseStats(EXPERT, [outbound('c4', 400), inbound('c4', 399), outbound('c4', 397)], NOW) === null)

/* ───── 2. median, not mean ───── */

// Gaps 5 / 10 / 300 → median 10, mean 105. Publishing the mean would call a
// responsive expert a day-late one (and vice versa).
const skewed = [...answered('c1', 500, 5), ...answered('c2', 600, 10), ...answered('c3', 900, 300)]
const skewedStats = computeResponseStats(EXPERT, skewed, NOW)
check('median of [5,10,300] is 10 (mean would be 105)',
  skewedStats?.medianMin === 10, JSON.stringify(skewedStats))

// Even-length samples average the two middles: [10,20,40,80] → (20+40)/2 = 30.
const evenStats = computeResponseStats(EXPERT, [
  ...answered('c1', 500, 10), ...answered('c2', 600, 20),
  ...answered('c3', 700, 40), ...answered('c4', 800, 80),
], NOW)
check('even sample averages the two middle gaps ([10,20,40,80] → 30)',
  evenStats?.medianMin === 30 && evenStats?.sampleN === 4, JSON.stringify(evenStats))

// Rounding is to whole minutes: a 90-second reply is 2 min, not 1.5.
const roundStats = computeResponseStats(EXPERT, [
  { fromId: 'c1', toId: EXPERT, bookingId: null, createdAt: new Date(NOW.getTime() - 600_000) },
  { fromId: EXPERT, toId: 'c1', bookingId: null, createdAt: new Date(NOW.getTime() - 510_000) },
  ...answered('c2', 700, 2),
  ...answered('c3', 800, 2),
], NOW)
check('gaps round to whole minutes (90s → 2)', roundStats?.medianMin === 2, JSON.stringify(roundStats))

/* ───── 3. minimum-sample gate ───── */

check('RESPONSE_MIN_SAMPLE is 3', RESPONSE_MIN_SAMPLE === 3)
check('two answered conversations → null (below the gate)',
  computeResponseStats(EXPERT, [...answered('c1', 100, 10), ...answered('c2', 200, 20)], NOW) === null)
check('three answered conversations → a value (gate exactly met)',
  computeResponseStats(EXPERT, [...answered('c1', 100, 10), ...answered('c2', 200, 20), ...answered('c3', 300, 30)], NOW)?.sampleN === 3)

/* ───── 4. the 90-day window ───── */

check('RESPONSE_WINDOW_DAYS is 90', RESPONSE_WINDOW_DAYS === 90)
check('responseWindowStart is exactly 90 days before now',
  responseWindowStart(NOW).getTime() === NOW.getTime() - 90 * DAY * 60_000)

// Three recent conversations (median 20) plus three ancient ones at 1 minute:
// if the window leaked, the median would collapse to ~1.
const stale = [
  ...answered('c1', 100, 10),
  ...answered('c2', 200, 20),
  ...answered('c3', 300, 30),
  ...answered('old1', 91 * DAY, 1),
  ...answered('old2', 92 * DAY, 1),
  ...answered('old3', 93 * DAY, 1),
]
const staleStats = computeResponseStats(EXPERT, stale, NOW)
check('conversations opened before the 90-day window are excluded',
  staleStats?.medianMin === 20 && staleStats?.sampleN === 3, JSON.stringify(staleStats))
check('an all-ancient history yields null, not an old number',
  computeResponseStats(EXPERT, [
    ...answered('old1', 91 * DAY, 1), ...answered('old2', 92 * DAY, 1), ...answered('old3', 93 * DAY, 1),
  ], NOW) === null)

/* ───── 5. no data / unanswered ───── */

check('no messages at all → null', computeResponseStats(EXPERT, [], NOW) === null)
check('three inbound conversations the expert never answered → null',
  computeResponseStats(EXPERT, [inbound('c1', 100), inbound('c2', 200), inbound('c3', 300)], NOW) === null)
// An unanswered thread must not be scored — neither as fast nor as infinite.
const withGhosted = computeResponseStats(EXPERT, [
  ...answered('c1', 100, 10), ...answered('c2', 200, 20), ...answered('c3', 300, 30),
  inbound('ghost', 150),
], NOW)
check('an unanswered thread leaves the sample size unchanged',
  withGhosted?.sampleN === 3 && withGhosted?.medianMin === 20, JSON.stringify(withGhosted))

/* ───── conversation identity + measurement point ───── */

// Same partner, one pre-booking thread and one booking thread → TWO
// conversations (two separate inboxes in the product), so together with a third
// partner the gate is met.
const twoThreads = computeResponseStats(EXPERT, [
  ...answered('c1', 100, 10, null),
  ...answered('c1', 200, 30, 'booking-1'),
  ...answered('c2', 300, 20, null),
], NOW)
check('pre-booking and booking threads with the same partner count separately',
  twoThreads?.sampleN === 3 && twoThreads?.medianMin === 20, JSON.stringify(twoThreads))

// The wait is measured from the FIRST inbound message, not the last one before
// the reply: client writes at T-60 and again at T-50, expert answers at T-40 →
// the client waited 20 minutes, not 10.
const burst = computeResponseStats(EXPERT, [
  inbound('c1', 60), inbound('c1', 50), outbound('c1', 40),
  ...answered('c2', 300, 20), ...answered('c3', 400, 20),
], NOW)
check('the gap is measured from the FIRST inbound message of the thread',
  burst?.medianMin === 20 && burst?.sampleN === 3, JSON.stringify(burst))

// Messages that touch neither side of this expert are ignored outright.
check('rows for other people are filtered out',
  computeResponseStats(EXPERT, [
    ...answered('c1', 100, 10), ...answered('c2', 200, 20), ...answered('c3', 300, 30),
    { fromId: 'x', toId: 'y', bookingId: null, createdAt: ago(120) },
  ], NOW)?.sampleN === 3)

/* ───── 6. the Georgian label ───── */

check('null median → no label', responseTimeLabelKa(null, 12) === null)
check('median present but sample below the gate → no label',
  responseTimeLabelKa(5, RESPONSE_MIN_SAMPLE - 1) === null)
check('missing sample → no label', responseTimeLabelKa(5, null) === null)
check('label buckets: 8 min → წუთებში', responseTimeLabelKa(8, 5) === 'პასუხობს წუთებში')
check('label buckets: 25 min → ~30 წუთში', responseTimeLabelKa(25, 5) === 'პასუხობს ~30 წუთში')
check('label buckets: 47 min → ~1 საათში', responseTimeLabelKa(47, 5) === 'პასუხობს ~1 საათში')
check('label buckets: 119 min → ~2 საათში', responseTimeLabelKa(119, 5) === 'პასუხობს ~2 საათში')
check('label buckets: 200 min → ~4 საათში', responseTimeLabelKa(200, 5) === 'პასუხობს ~4 საათში')
check('label buckets: 400 min → ~8 საათში', responseTimeLabelKa(400, 5) === 'პასუხობს ~8 საათში')
check('label buckets: 1000 min → ~24 საათში', responseTimeLabelKa(1000, 5) === 'პასუხობს ~24 საათში')
check('label buckets: 2000 min → ~2 დღეში', responseTimeLabelKa(2000, 5) === 'პასუხობს ~2 დღეში')
check('label buckets: 5000 min → რამდენიმე დღეში', responseTimeLabelKa(5000, 5) === 'პასუხობს რამდენიმე დღეში')
check('a negative/garbage median never renders', responseTimeLabelKa(-1, 9) === null && responseTimeLabelKa(NaN, 9) === null)

/* ───── summary ───── */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
