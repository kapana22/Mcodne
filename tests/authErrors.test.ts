/*
 * Pins the Google sign-in failure copy against the route that produces it.
 *
 * Run with:  npx tsx tests/authErrors.test.ts
 *
 * THE BUG THIS EXISTS FOR: /api/auth/google/callback redirected to
 * `/signin?error=<code>` on every failure, and nothing on the signin page read
 * that param — so all seven failures rendered as a blank signin form. The
 * commonest one (an expired 10-minute state cookie) was therefore
 * indistinguishable from „the button does nothing".
 *
 * A message map is only a fix while it stays COMPLETE, and the natural way to
 * break it again is to add an eighth `fail('…')` to the route and forget the
 * copy. So this test does not hardcode a list: it reads the route source, pulls
 * out the codes it can actually emit, and requires copy for each. Add a code,
 * skip the copy, and the gate fails.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUTH_ERROR_MESSAGES, authErrorMessage } from '../lib/authErrors'

const ROOT = join(import.meta.dirname, '..')
const CALLBACK = join(ROOT, 'app/api/auth/google/callback/route.ts')
const src = readFileSync(CALLBACK, 'utf8')

/** Every `fail('<code>')` the callback can return. */
function emittedCodes(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\bfail\(\s*'([a-z_]+)'\s*\)/g)) out.add(m[1])
  return [...out].sort()
}

test('the callback emits codes at all (the regex still matches the source)', () => {
  const codes = emittedCodes(src)
  assert.ok(codes.length >= 7, `expected ≥7 fail() codes, found ${codes.length}: ${codes.join(', ')}`)
})

test('every code the callback can emit has Georgian copy', () => {
  for (const code of emittedCodes(src)) {
    const msg = AUTH_ERROR_MESSAGES[code]
    assert.ok(msg, `no copy for ?error=${code} — add it to lib/authErrors.ts`)
    assert.ok(msg.trim().length > 10, `copy for ${code} is too short to be useful: ${msg}`)
    assert.match(msg, /[ა-ჰ]/u, `copy for ${code} must be Georgian: ${msg}`)
  }
})

test('a suspended account reports through the SAME param as every other failure', () => {
  // It used to be `/signin?e=suspended` — a second param nobody read either.
  // Matched on the built URL, not a bare `?e=`, so the comment explaining the
  // switch (which necessarily names the old param) doesn't trip it.
  assert.ok(!/\/signin\?e=/.test(src), 'callback still emits the legacy ?e= param')
  assert.ok(emittedCodes(src).includes('suspended'), 'suspended must go through fail()')
})

test('an unknown or absent code degrades to a generic line, never to silence', () => {
  assert.equal(authErrorMessage(null), null)
  assert.equal(authErrorMessage(undefined), null)
  assert.equal(authErrorMessage(''), null)
  const unknown = authErrorMessage('something_new')
  assert.ok(unknown && /[ა-ჰ]/u.test(unknown), 'unknown codes must still say something')
  // Never echo the raw code back at the visitor.
  assert.ok(!unknown!.includes('something_new'))
})

test('the state-expiry message names the fix, not the cause', () => {
  // This is the failure a real visitor hits most often; „state cookie expired"
  // would be true and useless. It must tell them to press the button again.
  assert.match(AUTH_ERROR_MESSAGES.google_state, /ხელახლა|თავიდან/u)
})

test('suspended copy matches what POST /api/auth/signin returns', () => {
  // One account state must not read two different ways depending on the door.
  const signin = readFileSync(join(ROOT, 'app/api/auth/signin/route.ts'), 'utf8')
  const m = /ანგარიში შეჩერებულია\. დაგვიკავშირდი: \$\{SUPPORT_EMAIL\}/u.exec(signin)
  assert.ok(m, 'signin route no longer carries the expected SUSPENDED message')
  assert.match(AUTH_ERROR_MESSAGES.suspended, /^ანგარიში შეჩერებულია\. დაგვიკავშირდი: /u)
})
