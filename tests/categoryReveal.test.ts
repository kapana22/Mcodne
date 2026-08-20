/*
 * lib/categoryReveal.ts — the ONE server-side "reveal the hidden sphere" step.
 *
 * Run: npx tsx --test tests/categoryReveal.test.ts   (also in `npm run check`)
 *
 * Stage 11 (2026-08-19). Approval (`app/api/applications/[id]`) and the admin
 * re-file endpoint (`app/api/admin/tutors/[id]/category`) each inlined the same
 * two calls — `category.update({ status: 'VISIBLE', isLive: true })` + an audit
 * row — after `sphereToReveal`. Two copies of a write is how one of them drifts
 * (forgets `isLive`, changes the audit action). Now there is one function; this
 * file pins (a) its behaviour with injected writes, no database, and (b) that
 * both routes actually call it and neither inlines the write any more.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join } from 'path'
import { revealCategoryIfHidden, type RevealableCategory, type RevealWrites } from '../lib/categoryReveal'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const cat = (id: string, over: Partial<RevealableCategory> = {}): RevealableCategory =>
  ({ id, name: id, status: 'VISIBLE', parentId: null, ...over })

function fakes() {
  const revealed: string[] = []
  const audits: { actorId: string; action: string; opts: any }[] = []
  const writes: RevealWrites = {
    reveal: async id => { revealed.push(id) },
    audit: async (actorId, action, opts) => { audits.push({ actorId, action, opts }) },
  }
  return { revealed, audits, writes }
}

test('a HIDDEN sphere is revealed and audited once, with the caller\'s reason', async () => {
  const health = cat('health', { status: 'HIDDEN' })
  const f = fakes()
  const out = await revealCategoryIfHidden(health, [health], { adminId: 'adm', reason: 'first approved expert', via: 'health' }, f.writes)
  assert.equal(out?.id, 'health')
  assert.deepEqual(f.revealed, ['health'])
  assert.equal(f.audits.length, 1)
  assert.equal(f.audits[0].actorId, 'adm')
  assert.equal(f.audits[0].action, 'category.show')
  assert.deepEqual(f.audits[0].opts, {
    targetType: 'Category', targetId: 'health',
    meta: { name: 'health', reason: 'first approved expert', via: 'health' },
  })
})

test('a sub-field of a HIDDEN sphere reveals the SPHERE, not the sub-field', async () => {
  const health = cat('health', { status: 'HIDDEN' })
  const nutrition = cat('nutrition', { status: 'REDIRECTED', parentId: 'health' })
  const f = fakes()
  const out = await revealCategoryIfHidden(nutrition, [health, nutrition], { adminId: 'adm', reason: 'expert re-filed here', via: 'nutrition' }, f.writes)
  assert.equal(out?.id, 'health')
  assert.deepEqual(f.revealed, ['health'])
  assert.equal(f.audits[0].opts.targetId, 'health')
  assert.equal(f.audits[0].opts.meta.via, 'nutrition')
})

test('nothing is written when there is nothing to reveal', async () => {
  const marketing = cat('marketing')
  const sales = cat('sales', { status: 'REDIRECTED', parentId: 'marketing' })
  const f = fakes()
  assert.equal(await revealCategoryIfHidden(sales, [marketing, sales], { adminId: 'adm', reason: 'x', via: null }, f.writes), undefined)
  assert.equal(await revealCategoryIfHidden(marketing, [marketing], { adminId: 'adm', reason: 'x', via: null }, f.writes), undefined)
  assert.equal(await revealCategoryIfHidden(undefined, [marketing], { adminId: 'adm', reason: 'x', via: null }, f.writes), undefined)
  assert.deepEqual(f.revealed, [])
  assert.deepEqual(f.audits, [])
})

test('the write itself flips status AND isLive together — the one place that string lives', () => {
  const src = read('lib/categoryReveal.ts')
  assert.match(src, /status: 'VISIBLE', isLive: true/)
})

test('both category-setting routes call it, and neither inlines the reveal write any more', () => {
  const approve = read('app/api/applications/[id]/route.ts')
  const refile = read('app/api/admin/tutors/[id]/category/route.ts')
  for (const [name, src] of [['approve', approve], ['re-file', refile]] as const) {
    assert.match(src, /revealCategoryIfHidden\(/, `${name} route must call revealCategoryIfHidden`)
    assert.doesNotMatch(src, /status: 'VISIBLE', isLive: true/, `${name} route inlines the reveal write again`)
    assert.doesNotMatch(src, /'category\.show'/, `${name} route writes its own category.show audit again`)
    assert.doesNotMatch(src, /\bsphereToReveal\b/, `${name} route calls sphereToReveal directly — the reveal is one function now`)
  }
})
