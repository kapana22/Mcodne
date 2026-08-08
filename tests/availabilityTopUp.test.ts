/*
 * The rolling availability horizon — and, more importantly, what it must NOT do.
 *
 * Run with:  npx tsx tests/availabilityTopUp.test.ts
 *
 * WHY IT EXISTS. Approval opens 8 weeks of windows from the pattern the expert
 * picked on /apply. Eight weeks later they are gone, and an expert who never
 * opened /tutor/schedule is back to „თავისუფალი დრო არ აქვს" — the state that
 * killed 46% of booking attempts — with nothing anywhere saying so.
 *
 * WHY IT IS DANGEROUS. It publishes bookable hours in a real person's name on a
 * timer. Every guard below is the difference between „keeps a working calendar
 * from expiring" and „re-publishes time someone deliberately withdrew".
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HORIZON_WEEKS, missingWindows, readPattern } from '../lib/availabilityTopUp'

const NOW = new Date('2026-08-10T09:00:00.000Z') // a Monday
const MF = { days: [0, 1, 2, 3, 4], startHour: 10, endHour: 18 }

test('a stored pattern is read, and junk is refused', () => {
  assert.deepEqual(readPattern({ availability: { days: [0, 1], startHour: 10, endHour: 18 } }), { days: [0, 1], startHour: 10, endHour: 18 })
  assert.equal(readPattern(null), null)
  assert.equal(readPattern({}), null)
  assert.equal(readPattern({ availability: { days: [], startHour: 10, endHour: 18 } }), null)
  assert.equal(readPattern({ availability: { days: [0], startHour: 18, endHour: 10 } }), null, 'end before start')
  assert.equal(readPattern({ availability: { days: [0], startHour: 'x', endHour: 18 } }), null)
  assert.equal(readPattern({ availability: { days: [9, 0, 0], startHour: 10, endHour: 18 } })?.days.length, 1, 'out-of-range dropped, duplicates collapsed')
})

test('it fills the horizon', () => {
  // One existing window is enough to mark the expert as active.
  const existing = [{ startAt: new Date('2026-08-11T06:00:00Z'), endAt: new Date('2026-08-11T14:00:00Z') }]
  const add = missingWindows(MF, existing, NOW)
  // 5 days × (HORIZON_WEEKS + 1) weeks, minus the one that already exists.
  // TODAY still counts: it is 13:00 Tbilisi and the window runs to 18:00, so the
  // rest of this afternoon is real bookable time.
  assert.equal(add.length, 5 * (HORIZON_WEEKS + 1) - 1)
  // Nothing already OVER. A window that started this morning but runs to 18:00
  // is kept — bookable starts are derived from it at request time, and past ones
  // are never offered (lib/availability).
  assert.ok(add.every(w => w.endAt > NOW))
  // Nothing collides with what is already published.
  for (const w of add) {
    assert.ok(!existing.some(e => e.startAt < w.endAt && e.endAt > w.startAt), 'overlaps an existing window')
  }
})

test('it never overlaps an edited window', () => {
  // The expert shortened Tuesday to 12:00–14:00. The pattern's 10:00–18:00 for
  // that day must NOT be re-added on top of their edit.
  const edited = { startAt: new Date('2026-08-11T08:00:00Z'), endAt: new Date('2026-08-11T10:00:00Z') }
  const add = missingWindows(MF, [edited], NOW)
  assert.ok(!add.some(w => w.startAt.toISOString().startsWith('2026-08-11')), 'Tuesday must be left as the expert left it')
})

test('running twice adds nothing the second time', () => {
  const first = missingWindows(MF, [{ startAt: new Date('2026-08-11T06:00:00Z'), endAt: new Date('2026-08-11T14:00:00Z') }], NOW)
  const after = [{ startAt: new Date('2026-08-11T06:00:00Z'), endAt: new Date('2026-08-11T14:00:00Z') }, ...first]
  assert.equal(missingWindows(MF, after, NOW).length, 0, 'the job must be idempotent')
})

test('the batch does not collide with itself', () => {
  const add = missingWindows(MF, [{ startAt: new Date('2026-08-11T06:00:00Z'), endAt: new Date('2026-08-11T14:00:00Z') }], NOW)
  for (let i = 0; i < add.length; i++) {
    for (let j = i + 1; j < add.length; j++) {
      assert.ok(!(add[i].startAt < add[j].endAt && add[i].endAt > add[j].startAt), 'two windows in one batch overlap')
    }
  }
})

/* ── the guards, read off the job itself ── */
const src = readFileSync(new URL('../lib/availabilityTopUp.ts', import.meta.url), 'utf8')

test('an EMPTY calendar is left alone — it is a decision, not a gap', () => {
  // „სრულად წაშლა" and a vacation block both produce an empty calendar. Refilling
  // it on a timer would re-publish hours the expert deliberately withdrew, and
  // they would find out from a booking.
  assert.match(src, /if \(existing\.length === 0\) continue/)
  assert.match(src, /RULE 1: a calendar with nothing ahead is a decision/)
})

test('it only ever uses the expert’s own stored pattern', () => {
  assert.match(src, /readPattern\(p\.professionData\)/)
  assert.match(src, /if \(!pattern\) continue/, 'no pattern must mean no top-up — never a house default')
})

test('suspended accounts are skipped and the cron cannot be broken by it', () => {
  assert.match(src, /suspendedAt: null/)
  assert.match(src, /role: 'TUTOR'/)
  assert.match(src, /catch \(e\) \{[\s\S]{0,200}\[server-error\] availability top-up/)
})

test('the sweep actually calls it, and reports what it did', () => {
  const cron = readFileSync(new URL('../app/api/internal/cleanup/route.ts', import.meta.url), 'utf8')
  assert.match(cron, /await topUpAvailability\(\)/)
  // A cron that runs and says nothing is indistinguishable from one that never
  // ran — the lesson from the 2026-07-27 silent-failure incident.
  assert.match(cron, /availabilityTopUp,/)
})
