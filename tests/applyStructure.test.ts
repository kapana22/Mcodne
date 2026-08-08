/*
 * /apply's SHAPE — two screens, required marks, red cards, folded extras, and a
 * calendar that is full by default.
 *
 * Run with:  npx tsx tests/applyStructure.test.ts
 *
 * These are the owner's 2026-08-07 decisions, and each one exists because of a
 * measured failure:
 *   • 3 screens → 2. The third asked for nothing mandatory; it was a screen
 *     between the applicant and finishing, and every screen loses people.
 *   • Required fields must be MARKED, and a refusal must colour the whole CARD.
 *     A hairline under one input is easy to scroll past on a phone — and half
 *     the controls here (sphere chips, photo tile, services, availability) are
 *     not inputs and cannot show a field ring at all.
 *   • Optional + heavy (a diploma uploader) must be FOLDED. An open uploader
 *     reads as a requirement; one applicant said exactly that, out loud.
 *   • The calendar ships FULL. 46% of booking attempts died on „no free time"
 *     because publishing availability was a separate job after approval.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { materializeWeekly } from '../lib/availabilityRules'

/* /apply is split across `app/apply/_*.tsx` — ApplyClient.tsx is only the
   container now. These assertions are about the FORM as a whole, so read the
   directory rather than a filename the next split would invalidate. */
const src = readdirSync(new URL('../app/apply/', import.meta.url))
  .filter(f => f.endsWith('.tsx'))
  .sort()
  .map(f => readFileSync(new URL(`../app/apply/${f}`, import.meta.url), 'utf8'))
  .join('\n')
const approve = readFileSync(new URL('../app/api/applications/[id]/route.ts', import.meta.url), 'utf8')

test('two screens, and the last one submits', () => {
  assert.match(src, /type StepId = 1 \| 2\b/)
  assert.equal((src.match(/\{ id: [12], l:/g) ?? []).length, 2)
  assert.match(src, /if \(step === 2\) \{ onSubmit\(\); return \}/)
  assert.ok(!/const Step3 = /.test(src), 'the third screen must not come back')
})

test('required is marked, and a refusal reddens the whole card', () => {
  // Every card holding a gated field declares both the mark and its anchors.
  for (const anchor of ['firstName', 'cats', 'headline', 'motivation', 'photo', 'avail']) {
    assert.match(src, new RegExp(`fields=\\{\\[[^\\]]*'${anchor}'`), `no card owns ${anchor}`)
  }
  assert.match(src, /invalid\s*\?\s*'border-danger-300/, 'the card must actually change colour')
  assert.match(src, /required && <span className="text-danger-500/, 'the mark itself')
})

test('optional and heavy is folded away', () => {
  assert.match(src, /const Collapsible = /)
  assert.match(src, /<Collapsible[\s\S]{0,900}CertificateUploader/, 'the diploma uploader must start closed')
  // …but a closed lid must never hide an error.
  assert.match(src, /const forced = !!err && !!fields\?\.includes\(err\.field\)/)
  assert.match(src, /const shown = open \|\| forced/)
})

test('the calendar is full by default and travels with the application', () => {
  assert.match(src, /const DEFAULT_AVAIL = \{ days: \[true, true, true, true, true, false, false\], startHour: 10, endHour: 18 \}/)
  assert.match(src, /pd\.availability = \{/, 'the pattern must reach the server')
  // An expert with no day cannot be booked at all — that stays gated.
  assert.match(src, /!form\.avail\.days\.some\(Boolean\)/)
})

test('approval turns the pattern into real windows — once', () => {
  assert.match(approve, /materializeWeekly\(/)
  assert.match(approve, /availabilitySlot\.count\(/, 'a re-approval must not double-publish the week')
  assert.match(approve, /already === 0/)
  // And it must never be able to fail an approval that already committed.
  assert.match(approve, /catch \{ \/\* availability is a convenience/)
  // The expert has to be TOLD their calendar opened in their name.
  assert.match(approve, /openedWindows > 0 \? 'დამტკიცდი — შენი განრიგი გამოქვეყნდა'/)
})

test('materializeWeekly publishes Tbilisi wall-clock, not the server\'s', () => {
  // Mon 2026-08-10, 09:00 UTC. A Mon–Fri 10:00–18:00 pattern for one week must
  // produce windows whose UTC hour is 06:00 (10:00 Tbilisi = UTC+4).
  const now = new Date('2026-08-10T09:00:00.000Z')
  const out = materializeWeekly([1, 2, 3, 4].map(day => ({ day, startHour: 10, endHour: 18 })), 1, now)
  assert.equal(out.length, 4, 'Tue–Fri of this week (Monday 10:00 has already gone)')
  assert.equal(out[0].startAt.toISOString(), '2026-08-11T06:00:00.000Z')
  assert.equal(out[0].endAt.toISOString(), '2026-08-11T14:00:00.000Z')
  // Chronological, and nothing already over.
  for (const w of out) assert.ok(w.endAt > now)
  for (let i = 1; i < out.length; i++) assert.ok(out[i].startAt >= out[i - 1].startAt)
})

test('a pattern applied mid-week does not publish days that have gone', () => {
  // Wednesday 09:00 UTC = 13:00 Tbilisi — inside today's 10:00–18:00 window.
  const wed = new Date('2026-08-12T09:00:00.000Z')
  const mf = [0, 1, 2, 3, 4].map(day => ({ day, startHour: 10, endHour: 18 }))
  const week = materializeWeekly(mf, 1, wed)
  // Mon + Tue are over and dropped. TODAY is kept: its end is still ahead, so
  // the rest of the afternoon is real, publishable time (dropping it would cost
  // the expert their first bookable day).
  assert.equal(week.length, 3, 'Wed (part), Thu, Fri')
  assert.equal(week[0].startAt.toISOString(), '2026-08-12T06:00:00.000Z')
  // Two weeks = the remainder of this one + a whole next one.
  assert.equal(materializeWeekly(mf, 2, wed).length, 8)
})
