// Selling and buying are two rooms, and a provider's menu is about selling.
//
// WHY. „ჩემი სივრცე" sat directly beneath „სამუშაო სივრცე" in the user menu for
// every provider. Both words say „mine" and neither says what is inside, so the
// two identities read as one thing offered twice — owner: „ირევა ჩვეულებრივ
// იუზერსა და ეს უნდა გავმიჯნოთ სწორად."
//
// The fix is not a better label. Measured against production on 2026-08-21:
// 27 OF 29 PROVIDERS HAD AN ENTIRELY EMPTY CLIENT ROOM — nothing bought, nothing
// saved, nothing asked for. The door was furniture, and furniture beside a real
// workspace is what did the mixing.
//
// Run: npx tsx tests/spaceSeparation.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SPACE_LABEL } from '../lib/roles'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

test('the client door is conditional on the room holding something', () => {
  const menu = read('components/UserMenu.tsx')
  assert.match(
    menu, /!inClientSpace && me\?\.clientRoom/,
    'the menu offers „ჩემი სივრცე" unconditionally again — 27 of 29 providers would be given a door into an empty room',
  )
})

test('somebody already IN the client space keeps the way back', () => {
  // The switcher must never strand a person. The condition gates the INVITATION,
  // and `!inClientSpace` is what makes it an invitation rather than an exit.
  const menu = read('components/UserMenu.tsx')
  const line = menu.slice(menu.indexOf('SPACE_LABEL.CLIENT') - 400, menu.indexOf('SPACE_LABEL.CLIENT') + 120)
  assert.match(line, /!inClientSpace/, 'the client door no longer checks where you are — it would vanish while you stand in the room')
  assert.match(menu, /href: '\/work', label: SPACE_LABEL\.PROVIDER/, 'the way back to the workspace is gone')
})

test('the signal is live, not cached or derived from a role', () => {
  const api = read('app/api/me/route.ts')
  assert.match(api, /clientRoom: await hasClientActivity\(user\.id\)/, '/api/me stopped reporting whether the client room has anything')
  const fn = api.slice(api.indexOf('async function hasClientActivity'))
  // ⚠️ „bought" IS `review.count` SINCE 2026-08-24 — it was `booking.count`,
  // and a booking is not a thing any more. You can only rate a job you actually
  // hired somebody for, so the question („have you bought anything here")
  // survives with a different column behind it.
  for (const model of ['review.count', 'favorite.count', 'serviceRequest.count']) {
    assert.ok(fn.includes(model), `hasClientActivity no longer counts ${model} — a provider who did exactly that would lose their own room`)
  }
  const lib = read('lib/me.ts')
  assert.match(lib, /clientRoom\?: boolean/, 'the Me type lost clientRoom')
  assert.match(lib, /clientRoom: d\.clientRoom \?\? false/, 'fetchMe drops clientRoom on the floor')
})

test('the two rooms are still named by different words', () => {
  // Whatever they are called, they must not be called the same thing — that was
  // the complaint underneath the complaint.
  assert.notEqual(SPACE_LABEL.CLIENT, SPACE_LABEL.PROVIDER)
  assert.ok(SPACE_LABEL.CLIENT.length > 0 && SPACE_LABEL.PROVIDER.length > 0)
})
