// WHO SOMEBODY IS — lib/hats.
//
// Run: npx tsx tests/hats.test.ts   (also in `npm run check`)
//
// ⚠️ THE BUG THIS FILE GUARDS SHIPPED ONCE AND WAS INVISIBLE. Every person on
// the requests allowlist carries `role: STUDENT` — measured on production,
// four of four, the owner included — so a tradesperson signed in and landed on
// the LEARNER'S dashboard. Nothing threw; the site simply answered „who are
// you" with the wrong half of the truth.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  HATS, HAT_LABEL, HAT_HOME, homeForHats, hasMultipleHats, type Hat,
} from '../lib/hats'

test('§A every hat has a home and a Georgian word', () => {
  for (const h of HATS) {
    assert.ok(HAT_HOME[h], `${h} has no home — sign-in would redirect nowhere`)
    assert.ok(HAT_LABEL[h], `${h} has no label — a raw code would reach a screen`)
    assert.ok(HAT_HOME[h].startsWith('/'), `${h}'s home is not an internal path`)
  }
})

test('§B the order is the priority, and CLIENT is the floor', () => {
  // ⚠️ CLIENT LAST, ALWAYS. Everybody can ask for help — including an expert
  // who needs a plumber — so it is not a hat you have or lack, it is the
  // ground everybody stands on. If it ever sorts above another hat, every
  // multi-hat person starts landing on the learner's dashboard again, which is
  // the exact bug this file exists for.
  assert.equal(HATS[HATS.length - 1], 'CLIENT')
  assert.equal(HATS[0], 'ADMIN', 'an admin must land in the panel whatever else they are')

  // An expert's calendar outranks their client history: that is the side other
  // people are waiting on.
  assert.ok(HATS.indexOf('EXPERT') < HATS.indexOf('CLIENT'))
  assert.ok(HATS.indexOf('MASTER') < HATS.indexOf('CLIENT'))
})

test('§C the first hat wins — a tradesperson never lands on the student dashboard', () => {
  // THE REGRESSION, stated directly.
  assert.equal(homeForHats(['MASTER', 'CLIENT']), HAT_HOME.MASTER)
  assert.notEqual(homeForHats(['MASTER', 'CLIENT']), '/me')
  // ⚠️ AND THE ADDRESS ITSELF (2026-08-21). Against `HAT_HOME.MASTER` this was
  // a tautology: it could not fail whatever that constant said, and what it
  // said for a year was the QUEUE. /work is the only screen that runs the
  // profile grant and draws the balance, so the service half — the one hat
  // pointed elsewhere — earned a bonus it was never shown. Name the path.
  assert.equal(homeForHats(['MASTER', 'CLIENT']), '/work')

  assert.equal(homeForHats(['CLIENT']), '/me')
  assert.equal(homeForHats(['EXPERT', 'CLIENT']), '/work')
  // The owner's own shape: admin AND on the allowlist. The panel wins.
  assert.equal(homeForHats(['ADMIN', 'MASTER', 'CLIENT']), '/admin')
  // A tutor who also does home repairs — the case a fourth Role could not hold.
  assert.equal(homeForHats(['EXPERT', 'MASTER', 'CLIENT']), '/work')

  // An empty list cannot happen while hatsOf always returns CLIENT, but the
  // fallback must still be a real path rather than undefined.
  assert.ok(homeForHats([] as Hat[], 'USER').startsWith('/'))
})

test('§D a switcher is drawn only for somebody who has one', () => {
  assert.equal(hasMultipleHats(['CLIENT']), false)
  assert.equal(hasMultipleHats(['MASTER', 'CLIENT']), true)
})

test('§E the allowlist is required for MASTER, not just the profile', () => {
  // ⚠️ A ServiceProfile WITHOUT an active RequestAccess is somebody who filled
  // in a form and was never let in. Sending them to a workspace listing
  // requests they cannot answer would be the emptiest room on the site.
  const src = readFileSync('lib/hats.ts', 'utf8')
  assert.match(src, /requestAccess\?\.active === true/,
    'MASTER stopped requiring an active allowlist row')
  assert.match(src, /u\.serviceProfile && allowed/,
    'MASTER is granted on the profile alone')
  // EXPERT keys on the PROFILE, not the role: a TUTOR row with no profile has
  // nothing to put on a calendar.
  assert.match(src, /if \(u\.tutor\) out\.push\('EXPERT'\)/,
    'EXPERT went back to keying on the role')
})

test('§F sign-in asks the model, not four separate tables', () => {
  // An earlier attempt inlined a `requestAccess.findFirst` into postAuthHome —
  // one subsystem's table in the sign-in path, papering over the gap instead of
  // naming it. This is what stops that returning.
  const auth = readFileSync('lib/auth.ts', 'utf8')
  assert.match(auth, /hatsOf\(user\.id\)/, 'postAuthHome stopped using the hat model')
  // ⚠️ MATCHED ON THE QUERY, NOT THE WORD. The first version of this assertion
  // used /requestAccess\./ and fired on the COMMENT above that explains what
  // was removed — a test that a piece of prose can fail is a test nobody
  // trusts. Only a real Prisma call looks like this.
  assert.doesNotMatch(auth, /prisma\.requestAccess/,
    'the allowlist is being queried directly from the auth layer again')
})
