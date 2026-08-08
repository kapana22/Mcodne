/*
 * „Does this expert have bookable time?" must have exactly ONE answer.
 *
 * Run with:  npx tsx tests/bookability.test.ts
 *
 * THE BUG THIS PREVENTS. The question was answered in four places with two
 * different predicates — `endAt > now` in the health route, `startAt > now` in
 * the insights route, the activation nudge and the profile-views panel. They
 * agree only while no expert has a window straddling „now"; the moment one
 * does, the სისტემა tab and the ინსაითები tab report different counts of
 * „experts with no time", and the nudge emails a group matching neither.
 * Nothing throws — the panel just contradicts itself, which is the hardest kind
 * of wrong to notice.
 *
 * So this test does not check the predicate's VALUE (that is a one-liner). It
 * checks that no call site has grown its own copy again.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasFutureWindow, futureWindowWhere, futureWindowSql } from '../lib/bookability'

const ROOT = join(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Every file that has to ask the question. */
const CALL_SITES = [
  'app/api/admin/health/route.ts',
  'app/api/admin/insights/route.ts',
  'app/api/admin/profile-views/route.ts',
  'lib/expertActivation.ts',
]

/* ═══════════ the shape ══════════════════════════════════════════════════ */

test('the predicate is endAt, never startAt — an open window IS availability', () => {
  // An expert who published 09:00–18:00 today still has bookable time at 11:00.
  // `startAt > now` would call them unbookable and email them „you have no free
  // time" while their calendar is open.
  const now = new Date('2026-08-04T11:00:00.000Z')
  assert.deepEqual(hasFutureWindow(now), { some: { endAt: { gt: now } } })
  assert.deepEqual(futureWindowWhere(now), { endAt: { gt: now } })
  assert.match(futureWindowSql('s'), /"endAt"\s*>\s*NOW\(\)/)
  assert.ok(!/startAt/.test(futureWindowSql('s')))
})

test('the SQL fragment carries no backtick and no interpolated value', () => {
  // It is dropped into a template literal (lib/expertActivation) — a backtick
  // there silently ends the string and esbuild then fails with a confusing
  // „Expected )". And it must never carry a value: only bound params may.
  const sql = futureWindowSql('s')
  assert.ok(!sql.includes('`'), 'a backtick would terminate the host template literal')
  assert.ok(!sql.includes('$'), 'the fragment must not interpolate anything')
})

test('the alias is honoured, so it composes into any query', () => {
  assert.match(futureWindowSql('slot'), /^slot\./)
  assert.equal(futureWindowSql(), futureWindowSql('s'))
})

/* ═══════════ nobody re-invents it ═══════════════════════════════════════ */

test('every call site imports the shared predicate', () => {
  for (const f of CALL_SITES) {
    assert.match(read(f), /from '@\/lib\/bookability'/, `${f} no longer imports lib/bookability`)
  }
})

test('no call site hand-writes an availability window filter again', () => {
  // Scoped to the `availability:` relation ON PURPOSE. A bare search for
  // `startAt: { gt:` also matches Booking queries — the health route counts
  // sessions in the next 24h that way, which is a different question about a
  // different table and must not be flagged.
  //
  // Comments are stripped first: these files EXPLAIN the old predicate, and the
  // explanation must not trip the check that bans it.
  for (const f of CALL_SITES) {
    const code = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/^\s*--.*$/gm, '')
    for (const m of code.matchAll(/availability:\s*([^\n]{0,120})/g)) {
      assert.ok(
        !/\b(startAt|endAt)\b/.test(m[1]),
        `${f} hand-writes an availability window filter (${m[1].trim()}) — use lib/bookability`,
      )
    }
    assert.ok(
      !/"(startAt|endAt)"\s*>\s*NOW\(\)/.test(code.replace(/futureWindowSql\([^)]*\)/g, '')),
      `${f} hand-writes the SQL predicate — use futureWindowSql`,
    )
  }
})
