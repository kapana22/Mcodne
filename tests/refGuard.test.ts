// The public reference is a 25-bit bearer credential (32^5 = 33 554 432). The
// budget that makes a sweep of it pointless is arithmetic, not taste, so it is
// checked here rather than described in a comment.
//
// Run: npx tsx tests/refGuard.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { refBudgetSpent, noteRefMiss, __resetRefGuard, MISS_BUDGET } from '../lib/refGuard'
import { REF_ALPHABET, REF_LENGTH } from '../lib/requests'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** A request from one address, shaped the way clientIp reads it. */
const from = (ip: string) => ({ headers: new Headers({ 'x-forwarded-for': `spoofed, ${ip}` }) })

test('the premise: the reference is small enough to be worth sweeping', () => {
  const space = REF_ALPHABET.length ** REF_LENGTH
  assert.ok(
    space < 2 ** 40,
    `the reference is now ${Math.log2(space).toFixed(0)} bits. If it grew past 40, this guard is belt-and-braces rather than the load-bearing thing — say so here before relaxing it.`,
  )
})

test('a client holding a real reference never spends budget, however often they reload', () => {
  __resetRefGuard()
  const client = from('198.51.100.7')
  for (let i = 0; i < 500; i++) assert.equal(refBudgetSpent(client), false)
})

test('a sweep burns its budget and is then refused', () => {
  __resetRefGuard()
  const sweeper = from('203.0.113.9')
  for (let i = 0; i < MISS_BUDGET; i++) {
    assert.equal(refBudgetSpent(sweeper), false, `refused after only ${i} misses`)
    noteRefMiss(sweeper)
  }
  assert.equal(refBudgetSpent(sweeper), true, 'the budget never runs out — a sweep is unbounded')
})

test('the budget is per address — one sweeper does not lock out the world', () => {
  __resetRefGuard()
  const sweeper = from('203.0.113.9')
  for (let i = 0; i < MISS_BUDGET; i++) noteRefMiss(sweeper)
  assert.equal(refBudgetSpent(sweeper), true)
  assert.equal(refBudgetSpent(from('198.51.100.7')), false, 'an innocent address inherited the refusal')
})

test('a spent address is answered with the same 404 as an empty code', () => {
  // Distinguishing „throttled" from „wrong" hands the sweeper half the answer.
  for (const f of [
    'app/request/[ref]/page.tsx',
    'app/api/requests/[ref]/accept/route.ts',
    'app/api/requests/[ref]/open/route.ts',
  ]) {
    const src = read(f)
    assert.ok(src.includes('refBudgetSpent'), `${f} does not consult the guard`)
    assert.ok(src.includes('noteRefMiss'), `${f} never records a miss — the budget can only be spent by the surfaces that count`)
    assert.doesNotMatch(src, /RATE_LIMITED|429/, `${f} tells the caller they were throttled — that confirms the guess was merely refused, not wrong`)
  }
})
