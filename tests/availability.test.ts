// Unit tests for lib/availability.ts — the windows-not-tickets slot math.
//
// Run: npx tsx tests/availability.test.ts
//
// Pure unit test (no browser, no dev server, no DB), in the style of
// tests/tutor-mapping.test.ts. It pins the invariants that make services with
// their OWN lengths (Consultation.minutes, 5–240) safe on top of legacy
// pre-sliced AvailabilitySlot rows:
//
//   1. Exactly-touching legacy rows merge into one window — that is what makes a
//      60-min service bookable across two adjacent 30-min rows with no data
//      migration.
//   2. A 15-min service does NOT consume a whole 60-min window (the old model
//      threw away 45 min of inventory).
//   3. A booking inside a window splits it into two bookable regions; the buffer
//      widens each booking on both sides.
//   4. isStartOpen agrees with computeOpenStarts on every instant of a fixed
//      probe grid — the server check can never accept a start the picker didn't
//      offer, or reject one it did.
//
// All fixtures are UTC instants: the library is timezone-agnostic by contract,
// so the tests must be too. No Math.random() — every case is deterministic.

import {
  mergeIntervals,
  subtractIntervals,
  computeOpenStarts,
  isStartOpen,
  type Interval,
  type OpenStartsOpts,
} from '../lib/availability'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ───── fixtures ───── */

// 2026-07-28, UTC. D(10, 30) === 10:30Z.
const D = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 28, h, m))
const iv = (a: Date, b: Date): Interval => ({ start: a, end: b })
const hm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
const hms = (list: Date[]) => list.map(hm).join(',')
const shape = (list: Interval[]) => list.map(i => `${hm(i.start)}-${hm(i.end)}`).join(',')

// A legacy row set: six consecutive 30-min pre-sliced rows, 10:00 → 13:00.
const legacyRows: Interval[] = [
  iv(D(10, 0), D(10, 30)), iv(D(10, 30), D(11, 0)), iv(D(11, 0), D(11, 30)),
  iv(D(11, 30), D(12, 0)), iv(D(12, 0), D(12, 30)), iv(D(12, 30), D(13, 0)),
]

/* ───── mergeIntervals ───── */

check('merge: six touching legacy rows → ONE 10:00–13:00 window',
  shape(mergeIntervals(legacyRows)) === '10:00-13:00', shape(mergeIntervals(legacyRows)))

check('merge: overlapping intervals fuse',
  shape(mergeIntervals([iv(D(10), D(12)), iv(D(11), D(13))])) === '10:00-13:00')

check('merge: a real gap is preserved',
  shape(mergeIntervals([iv(D(10), D(11)), iv(D(12), D(13))])) === '10:00-11:00,12:00-13:00')

check('merge: unsorted input is sorted',
  shape(mergeIntervals([iv(D(15), D(16)), iv(D(10), D(11))])) === '10:00-11:00,15:00-16:00')

check('merge: nested interval is absorbed',
  shape(mergeIntervals([iv(D(10), D(14)), iv(D(11), D(12))])) === '10:00-14:00')

check('merge: zero-length and inverted rows are dropped',
  shape(mergeIntervals([iv(D(10), D(10)), iv(D(13), D(12)), iv(D(15), D(16))])) === '15:00-16:00')

check('merge: invalid Date is dropped, not thrown',
  shape(mergeIntervals([iv(new Date(NaN), D(11)), iv(D(15), D(16))])) === '15:00-16:00')

check('merge: empty → []', mergeIntervals([]).length === 0)

/* ───── subtractIntervals ───── */

check('subtract: booking in the middle splits the window',
  shape(subtractIntervals([iv(D(10), D(13))], [iv(D(11), D(11, 30))])) === '10:00-11:00,11:30-13:00')

check('subtract: booking at the edge trims',
  shape(subtractIntervals([iv(D(10), D(13))], [iv(D(10), D(11))])) === '11:00-13:00')

check('subtract: busy covering the window leaves nothing',
  subtractIntervals([iv(D(10), D(13))], [iv(D(9), D(14))]).length === 0)

check('subtract: busy outside the window is ignored',
  shape(subtractIntervals([iv(D(10), D(13))], [iv(D(14), D(15))])) === '10:00-13:00')

check('subtract: legacy rows are merged first, then cut',
  shape(subtractIntervals(legacyRows, [iv(D(11), D(12))])) === '10:00-11:00,12:00-13:00')

/* ───── computeOpenStarts: the legacy-repair case ───── */

{
  // Two adjacent 30-min rows; a 60-min service is bookable ACROSS them.
  const starts = computeOpenStarts({
    windows: [iv(D(10, 0), D(10, 30)), iv(D(10, 30), D(11, 0))],
    busy: [], serviceMin: 60, now: D(0),
  })
  check('60-min service is bookable across two adjacent 30-min legacy rows',
    hms(starts) === '10:00', hms(starts))
}

{
  // Same rows, but with a real gap between them → the 60-min service fits nowhere.
  const starts = computeOpenStarts({
    windows: [iv(D(10, 0), D(10, 30)), iv(D(11, 0), D(11, 30))],
    busy: [], serviceMin: 60, now: D(0),
  })
  check('a genuine gap still blocks a 60-min service', starts.length === 0, hms(starts))
}

{
  // 15-min service inside a single 60-min window → 4 starts, not 1.
  const starts = computeOpenStarts({
    windows: [iv(D(10), D(11))], busy: [], serviceMin: 15, now: D(0),
  })
  check('15-min service does not consume a whole 60-min window',
    hms(starts) === '10:00,10:15,10:30,10:45', hms(starts))
}

{
  // Grid is anchored to the WINDOW start, not to midnight.
  const starts = computeOpenStarts({
    windows: [iv(D(10, 10), D(11, 10))], busy: [], serviceMin: 30, granularityMin: 15, now: D(0),
  })
  check('granularity grid is anchored to the window start',
    hms(starts) === '10:10,10:25,10:40', hms(starts))
}

{
  const starts = computeOpenStarts({
    windows: [iv(D(10), D(11))], busy: [], serviceMin: 90, now: D(0),
  })
  check('service longer than the window offers nothing', starts.length === 0, hms(starts))
}

/* ───── computeOpenStarts: busy, buffer, lead ───── */

{
  // Booking in the middle → two bookable regions around it.
  const base: OpenStartsOpts = {
    windows: [iv(D(10), D(13))], busy: [iv(D(11), D(11, 30))],
    serviceMin: 60, granularityMin: 30, now: D(0),
  }
  const starts = computeOpenStarts(base)
  check('a booking mid-window splits it into two bookable regions',
    hms(starts) === '10:00,11:30,12:00', hms(starts))

  // 10:30 would end exactly at 11:30 and overlap the booking → never offered.
  check('a start whose session would overlap the booking is not offered',
    !starts.some(s => hm(s) === '10:30') && !starts.some(s => hm(s) === '11:00'))
}

{
  // Buffer: without it, 10:30 ends exactly when the 11:00 booking starts (legal);
  // with a 15-min buffer that touch becomes illegal.
  const shared = {
    windows: [iv(D(10), D(12))], busy: [iv(D(11), D(11, 30))],
    serviceMin: 30, granularityMin: 30, now: D(0),
  }
  const noBuffer = computeOpenStarts({ ...shared })
  const buffered = computeOpenStarts({ ...shared, bufferMin: 15 })
  check('without a buffer, a session may end exactly when a booking starts',
    hms(noBuffer) === '10:00,10:30,11:30', hms(noBuffer))
  check('bufferMin blocks a start that merely touches a booking',
    hms(buffered) === '10:00', hms(buffered))
}

{
  // leadMin filters near-term starts (now = 10:00, 60 min notice required).
  const starts = computeOpenStarts({
    windows: [iv(D(10), D(12))], busy: [], serviceMin: 30, granularityMin: 30,
    now: D(10), leadMin: 60,
  })
  check('leadMin filters near-term starts', hms(starts) === '11:00,11:30', hms(starts))
}

{
  // Past windows disappear on their own (leadMin defaults to 0).
  const starts = computeOpenStarts({
    windows: [iv(D(8), D(9)), iv(D(14), D(15))], busy: [], serviceMin: 60, now: D(10),
  })
  check('windows already in the past are skipped', hms(starts) === '14:00', hms(starts))
}

/* ───── tolerated garbage input ───── */

{
  const messy: Interval[] = [
    iv(D(12, 30), D(13)),      // out of order
    iv(D(10), D(11)),
    iv(D(10, 30), D(12, 30)),  // overlaps the previous row
    iv(D(11), D(11)),          // zero length
  ]
  const tidy = [iv(D(10), D(13))]
  const opts = { busy: [iv(D(11, 30), D(12)), iv(D(11, 45), D(12, 15))], serviceMin: 60, granularityMin: 30, now: D(0) }
  const a = computeOpenStarts({ ...opts, windows: messy })
  const b = computeOpenStarts({ ...opts, windows: tidy })
  // Merged: 10:00–13:00; the two overlapping bookings merge to 11:30–12:15, so
  // only the first two grid ticks survive for a 60-min service.
  check('unsorted/overlapping/degenerate windows resolve like the tidy equivalent',
    hms(a) === hms(b) && hms(a) === '10:00,10:30', `${hms(a)} vs ${hms(b)}`)
}

check('serviceMin 0 → []',
  computeOpenStarts({ windows: [iv(D(10), D(13))], busy: [], serviceMin: 0, now: D(0) }).length === 0)
check('serviceMin negative → []',
  computeOpenStarts({ windows: [iv(D(10), D(13))], busy: [], serviceMin: -30, now: D(0) }).length === 0)
check('serviceMin NaN → []',
  computeOpenStarts({ windows: [iv(D(10), D(13))], busy: [], serviceMin: NaN, now: D(0) }).length === 0)
check('no windows → []', computeOpenStarts({ windows: [], busy: [], serviceMin: 30, now: D(0) }).length === 0)

check('limit caps the response',
  computeOpenStarts({ windows: [iv(D(0), D(23))], busy: [], serviceMin: 15, limit: 5, now: D(0) }).length === 5)

{
  // Pathological input must not mint a million Dates or hang.
  const t0 = Date.now()
  const starts = computeOpenStarts({
    windows: [iv(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2027, 0, 1)))],
    busy: [], serviceMin: 30, granularityMin: 1, now: new Date(Date.UTC(2026, 0, 1)),
  })
  check('a year-long window stays bounded and fast',
    starts.length <= 500 && Date.now() - t0 < 1000, `${starts.length} starts in ${Date.now() - t0}ms`)
}

/* ───── isStartOpen agrees with computeOpenStarts (deterministic probes) ───── */

{
  // Four fixed scenarios × a 5-minute probe grid across the whole day. Off-grid
  // and out-of-window probes must be rejected by BOTH sides.
  const scenarios: Array<[string, OpenStartsOpts]> = [
    ['plain window', { windows: [iv(D(10), D(13))], busy: [], serviceMin: 30, now: D(0) }],
    ['legacy rows + booking', {
      windows: legacyRows, busy: [iv(D(11), D(11, 30))],
      serviceMin: 60, granularityMin: 30, now: D(0),
    }],
    ['buffer + lead', {
      windows: [iv(D(9), D(18))], busy: [iv(D(12), D(13)), iv(D(15, 30), D(16))],
      serviceMin: 45, granularityMin: 15, bufferMin: 10, leadMin: 90, now: D(9, 20),
    }],
    ['two windows, odd anchor', {
      windows: [iv(D(9, 7), D(10, 52)), iv(D(14), D(15)), iv(D(15), D(16))],
      busy: [iv(D(9, 40), D(9, 55))], serviceMin: 20, granularityMin: 15, now: D(0),
    }],
  ]

  for (const [name, opts] of scenarios) {
    const offered = new Set(computeOpenStarts(opts).map(d => d.getTime()))
    let mismatches = 0
    for (let m = 0; m < 24 * 60; m += 5) {
      const probe = D(0, m)
      const inList = offered.has(probe.getTime())
      if (isStartOpen(probe, opts) !== inList) mismatches++
    }
    check(`isStartOpen agrees with computeOpenStarts — ${name}`,
      mismatches === 0 && offered.size > 0, `${mismatches} mismatch(es), ${offered.size} offered`)
  }

  // Explicit off-grid probe: 10:07 inside a wide-open 10:00 window is NOT a
  // bookable start, because the picker never offers it.
  const opts: OpenStartsOpts = { windows: [iv(D(10), D(13))], busy: [], serviceMin: 30, now: D(0) }
  check('off-grid instant is rejected', isStartOpen(D(10, 7), opts) === false)
  check('on-grid instant is accepted', isStartOpen(D(10, 15), opts) === true)
  check('instant past the window end is rejected', isStartOpen(D(12, 45), opts) === false)
  check('invalid Date is rejected, not thrown', isStartOpen(new Date(NaN), opts) === false)
  check('isStartOpen false when serviceMin is unusable',
    isStartOpen(D(10), { ...opts, serviceMin: 0 }) === false)
}

/* ───── summary ───── */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
