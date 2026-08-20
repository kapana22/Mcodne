/*
 * THE TESTS MUST ACTUALLY BE READING THE CODE.
 *
 * Run:  npx tsx tests/sourceStripper.test.ts   (also in `npm run check`)
 *
 * WHY THIS FILE EXISTS — and it is the most quietly dangerous thing found in
 * this repository so far (2026-08-20).
 *
 * About thirty test files read a source file, strip its comments, and assert
 * against what is left. Every one of them strips in the same order, because
 * they were copied from each other:
 *
 *     src.replace(/\/\*[\s\S]*?\*\//g, '')      // block comments FIRST
 *        .split('\n').filter(l => !/^\s*\/\//)  // then // lines
 *
 * That order is wrong, and it fails silently. A `/*` written inside a LINE
 * comment is prose to the compiler, but the block regex runs before the line
 * comments are removed — so it opens a block that closes at the next real
 * `∗/` hundreds of lines below, and everything between is deleted from the
 * string the test then examines.
 *
 * app/api/bookings/route.ts:129 said:
 *
 *     // another expert. The /student/∗ surfaces + space switcher are wired…
 *
 * …which swallowed 472 lines — including the booking route's own guards. Every
 * `assert.doesNotMatch(...)` aimed at that range PASSED, because the haystack
 * was empty. A test that cannot fail is worse than no test: it is a claim.
 *
 * It surfaced by accident. A newly added guard (`bookable: true` in the
 * booking lookup) was asserted, the code was there, and the assertion failed.
 *
 * THE FIX WAS THE SOURCES, NOT THE THIRTY COPIES. Thirty-one lines across
 * twenty-three files had `/∗` or `∗/` inside a `//` comment; each now uses the
 * typographic asterisk U+2217, which reads identically in prose and cannot
 * open or close anything. This test keeps it that way — and, more importantly,
 * asserts the PROPERTY rather than the spelling: whatever anybody writes in a
 * comment, the naive stripper must not eat code.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'scratch'].includes(e.name)) continue
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) sources(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}
const FILES = [...sources('app'), ...sources('lib'), ...sources('components')]

/** Exactly what the ~30 test files do — the order that fails silently. */
const naive = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')

/** Line comments first, so a `/*` written in prose can never open a block. */
const correct = (s: string) =>
  s.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')

test('the naive stripper every test uses does not eat code', () => {
  // `export` is the cheapest proxy for „a line of real code": every module has
  // some, they are never inside a comment, and losing one means the stripper
  // deleted a region. Comparing the two strippers rather than counting markers
  // asserts the CONSEQUENCE — a file may hold unbalanced markers safely as long
  // as they sit inside a block that is removed whole.
  const exports = (t: string) => (t.match(/^\s*export /gm) ?? []).length
  const lost = FILES
    .map(f => {
      const s = readFileSync(join(ROOT, f), 'utf8')
      return { f, naive: exports(naive(s)), correct: exports(correct(s)) }
    })
    .filter(r => r.naive < r.correct)
    .map(r => `${r.f} — the stripper deleted a region: ${r.correct - r.naive} export(s) vanished`)

  assert.deepEqual(lost, [],
    'a comment opened a block that swallowed code; the tests reading these files assert against an empty string')
})

test('no line comment carries a block-comment delimiter', () => {
  // The direct form of the rule above, so a new one is caught at the line that
  // introduces it rather than by its consequence three files away. U+2217 (∗)
  // is the character to use in prose — „/∗15 cron", „data:image/∗".
  const offenders: string[] = []
  for (const f of FILES) {
    readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((l, i) => {
      const c = l.indexOf('//')
      if (c === -1) return
      const tail = l.slice(c)
      if (tail.includes('/*') || tail.includes('*/')) offenders.push(`${f}:${i + 1}  ${l.trim().slice(0, 80)}`)
    })
  }
  assert.deepEqual(offenders, [],
    'use ∗ (U+2217) instead of * inside a // comment — see the header of this file')
})
