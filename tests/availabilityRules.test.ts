/*
 * A published availability WINDOW has one definition — and the expert can edit it.
 *
 * Run with:  npx tsx tests/availabilityRules.test.ts
 *
 * WHAT WAS WRONG (owner report, 2026-08-07): there was no edit path anywhere.
 * `app/api/tutor/availability/[id]` exposed DELETE only, so changing „10:00–18:00"
 * to „11:00–18:00" meant destroying the window — through a confirm dialog warning
 * about the sessions inside — and retyping both ends into two `datetime-local`
 * inputs. The rules for a valid range were also written three times (POST, the
 * page's pre-submit check, the page's error map), which is the same drift that
 * cost /apply real applicants (see tests/applyValidation.test.ts).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { MAX_WINDOW_MS, windowErrorMessage, windowRangeError } from '../lib/availabilityRules'

const NOW = new Date('2026-08-10T09:00:00.000Z')
const at = (iso: string) => new Date(iso)

test('the range rule accepts a normal window and refuses the three bad shapes', () => {
  assert.equal(windowRangeError(at('2026-08-10T10:00:00Z'), at('2026-08-10T18:00:00Z'), NOW), null)
  assert.equal(windowRangeError(at('2026-08-10T18:00:00Z'), at('2026-08-10T10:00:00Z'), NOW), 'BAD_RANGE')
  assert.equal(windowRangeError(at('2026-08-10T10:00:00Z'), at('2026-08-10T10:00:00Z'), NOW), 'BAD_RANGE')
  assert.equal(windowRangeError(at('2026-08-09T10:00:00Z'), at('2026-08-09T12:00:00Z'), NOW), 'PAST_DATE')
  // 12h is the cap — a whole day in one row is a fat-fingered date.
  const start = at('2026-08-10T10:00:00Z')
  assert.equal(windowRangeError(start, new Date(start.getTime() + MAX_WINDOW_MS), NOW), null)
  assert.equal(windowRangeError(start, new Date(start.getTime() + MAX_WINDOW_MS + 60_000), NOW), 'TOO_LONG')
  assert.equal(windowRangeError(at('nonsense'), at('2026-08-10T18:00:00Z'), NOW), 'BAD_RANGE')
})

test('a window that has already begun can still be shortened', () => {
  // „I'm running late, cut today's block" — refusing this would put
  // delete-and-retype back as the only move, which is the thing being fixed.
  const began = at('2026-08-10T08:00:00Z')          // an hour before NOW
  assert.equal(windowRangeError(began, at('2026-08-10T12:00:00Z'), NOW, { keepStart: began }), null)
  // …but its start may not be MOVED into the past,
  assert.equal(
    windowRangeError(at('2026-08-10T07:00:00Z'), at('2026-08-10T12:00:00Z'), NOW, { keepStart: began }),
    'PAST_DATE',
  )
  // …and it may not be shortened to a range that is entirely over.
  assert.equal(windowRangeError(began, at('2026-08-10T08:30:00Z'), NOW, { keepStart: began }), 'PAST_DATE')
})

test('every code the API can answer with has a Georgian sentence', () => {
  for (const code of ['BAD_RANGE', 'PAST_DATE', 'TOO_LONG', 'OVERLAP', 'NO_PROFILE', 'NOT_FOUND', 'FORBIDDEN', 'INVALID']) {
    assert.match(windowErrorMessage(code), /[Ⴀ-ჿ]/, `${code} has no message`)
  }
  // An unknown code must still say something, never render „undefined".
  assert.match(windowErrorMessage('SOMETHING_NEW'), /[Ⴀ-ჿ]/)
  assert.match(windowErrorMessage(undefined), /[Ⴀ-ჿ]/)
})

const item = readFileSync(new URL('../app/api/tutor/availability/[id]/route.ts', import.meta.url), 'utf8')
const coll = readFileSync(new URL('../app/api/tutor/availability/route.ts', import.meta.url), 'utf8')
/* The schedule screen is split across `app/work/(expert)/schedule/_*.tsx` — the slot
   and template sheets are their own files now. These assertions are about the
   SCREEN, so read the directory rather than one filename. */
const page = readdirSync(new URL('../app/work/(expert)/schedule/', import.meta.url))
  .filter(f => /\.tsx?$/.test(f))
  .sort()
  .map(f => readFileSync(new URL(`../app/work/(expert)/schedule/${f}`, import.meta.url), 'utf8'))
  .join('\n')

test('editing a window is possible at all', () => {
  assert.match(item, /export async function PATCH/, 'the schedule was write-once without this')
  assert.match(item, /availabilitySlot\.update/)
})

test('an edit does not conflict with itself', () => {
  // Without `id: { not: id }` every PATCH overlaps the row being edited and the
  // expert is told „this time is already published" about their own window.
  assert.match(item, /id: \{ not: id \}/)
})

test('an edit is authorised like a delete', () => {
  const patch = item.slice(item.indexOf('export async function PATCH'), item.indexOf('export async function DELETE'))
  assert.match(patch, /requireRoleApi\(\[ROLE\.EXPERT,\s+ROLE\.ADMIN\]\)/)
  assert.match(patch, /userId !== user\.id && user\.role !== 'ADMIN'/, 'a window must not be editable by its non-owner')
})

test('nobody restates the range rule', () => {
  for (const [name, src] of [['POST', coll], ['PATCH', item], ['the page', page]] as const) {
    assert.match(src, /windowRangeError\(/, `${name} must call the shared predicate`)
  }
  // The literal bounds may live in lib/availabilityRules only.
  assert.ok(!/12 \* 60 \* 60 \* 1000/.test(coll), 'POST re-declared MAX_WINDOW_MS')
  assert.ok(!/BAD_RANGE: '/.test(page), 'the page kept its own copy of the messages')
})

test('the picker asks for a day, a start and a LENGTH — not two datetimes', () => {
  // Comments still (rightly) mention the old control and the round-trip helper
  // it named — the assertion is about what the page RENDERS.
  const code = page.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  assert.ok(!/type="datetime-local"/.test(code), 'two datetime-local inputs is the control the owner called unusable')
  assert.match(page, /id="slot-date" type="date"/)
  assert.match(page, /id="slot-start" type="time"/)
  assert.match(page, /durMin: /, 'the end is arithmetic; asking for it made the expert do the sum')
})

test('tapping a window edits it; delete is a separate control', () => {
  assert.match(page, /const openEditFor = /)
  assert.match(page, /onClick=\{\(\) => openEditFor\(s\)\}/, 'the desktop chip must edit, not destroy')
  assert.match(page, /onClick=\{\(\) => openEditFor\(e\.slot\)\}/, 'and the mobile row too')
})
