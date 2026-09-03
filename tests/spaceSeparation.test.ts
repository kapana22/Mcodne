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
import { navFor } from '../components/work/navConfig'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

test('the client door is conditional on the room holding something', () => {
  const menu = read('components/UserMenu.tsx')
  assert.match(
    menu, /!inClientSpace && me\?\.clientRoom/,
    'the menu offers „ჩემი სივრცე" unconditionally again — 27 of 29 providers would be given a door into an empty room',
  )
})

/* ═══════════ AND SINCE 2026-09-02 IT IS NOT „conditional", IT IS „never" ═════
 *
 * The rule above was the 2026-08-21 one: a provider got the client door once
 * their client room held something. The owner has since made it absolute —
 * „თუ ექსპერტად რეგისტრირდება ადამიანი, მაგ შემთხვევაში აღარ უნდა ჰქონდეს
 * კლიენტის ფუნქციები."
 *
 * The three tests below pin the three halves of that, and they are three
 * because the rule is enforced in three places on purpose: a menu that does not
 * draw the door, a rail that does not carry the client catalogue, and a layout
 * that refuses the address whether or not anybody linked to it.
 *
 * Measured the day it changed: of 26 providers, ONE had ever filed a request
 * and NONE had saved anybody. */

test('a seller is never offered the client room', () => {
  const menu = read('components/UserMenu.tsx')
  // The condition that pushes SPACE_LABEL.CLIENT must exclude anybody who sells
  // here. Read the condition itself rather than the whole file, so an unrelated
  // `sellsHere` elsewhere in the menu cannot make this pass.
  const at = menu.indexOf("href: '/me', label: SPACE_LABEL.CLIENT")
  assert.ok(at > 0, 'the client-door push is gone entirely — this test can no longer see what it guards')
  const condition = menu.slice(menu.lastIndexOf('if (', at), at)
  assert.match(
    condition, /!sellsHere/,
    'a provider is offered „ჩემი სივრცე" again — the room refuses every control it contains, so the door is a dead end',
  )
})

test('the provider rail carries no client catalogue', () => {
  // Behaviour, not spelling: ask the rail what it renders.
  const hrefs = navFor({ work: true }).flatMap(s => s.items).map(i => i.href)
  assert.ok(
    !hrefs.some(h => h.startsWith('/experts')),
    '/experts is back in the seller\'s rail — that is the screen a CLIENT uses to shop for somebody like them',
  )
  const sidebar = read('components/work/WorkspaceSidebar.tsx')
  assert.doesNotMatch(
    sidebar, /CATALOG_LINK/,
    'the sidebar renders a catalogue row again, outside the list navFor returns',
  )
})

test('/me refuses somebody who sells here', () => {
  // 🔒 The menu not drawing a link is not the same as the address being closed.
  const layout = read('app/me/layout.tsx')
  assert.match(
    layout, /if \(await sellsHere\([^)]*\)\)\s*redirect\(/,
    '/me no longer turns a seller away — a typed URL reaches the client room the product says they do not have',
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
