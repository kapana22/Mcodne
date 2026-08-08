/*
 * Pins what Google sign-in does when it lands on an email that already has an
 * account here.
 *
 * Run with:  npx tsx tests/googleLink.test.ts
 *
 * THE BUG: password signup creates a usable account with no verification wall,
 * so anyone could register `victim@gmail.com` with their own password. Google
 * sign-in then found that row, marked it verified and signed the visitor in —
 * leaving the attacker's `passwordHash` intact and their sessions running. The
 * mailbox owner lands inside an account someone else also holds.
 *
 * This test guards BOTH directions, and the second one matters just as much:
 *   • unverified → revoke, or the hijack is back;
 *   • verified   → keep, or the first Google login of every returning user
 *     silently destroys the password they have been using for months.
 * A one-line „simplification" of the condition breaks exactly one of the two,
 * which is why neither is left to review alone.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveGoogleLink } from '../lib/googleLink'

/* ═══════════ the decision ═══════════════════════════════════════════════ */

test('a NEVER-verified account loses its password, its sessions, and is told', () => {
  const d = resolveGoogleLink({ emailVerified: false })
  assert.equal(d.revokePassword, true)
  assert.equal(d.revokeSessions, true)
  assert.equal(d.notify, true)
})

test('an ALREADY-verified account keeps its password — the regression that would hurt everyone', () => {
  const d = resolveGoogleLink({ emailVerified: true })
  assert.equal(d.revokePassword, false)
  assert.equal(d.revokeSessions, false)
  assert.equal(d.notify, false)
})

test('a brand-new account has nothing to revoke', () => {
  for (const nothing of [null, undefined]) {
    const d = resolveGoogleLink(nothing)
    assert.equal(d.revokePassword, false)
    assert.equal(d.revokeSessions, false)
    assert.equal(d.notify, false)
  }
})

test('anything that is not literally `true` fails SAFE (revoke)', () => {
  // Only a real boolean true is proof. A null column, a legacy row, a value
  // that arrived through some other path — none of those are evidence that the
  // password belongs to the mailbox owner, and keeping it is the branch with a
  // victim. Mirrors resolveVerifiedGrant's strictness in app/admin/_application.
  for (const v of [null, undefined, 1, 'true', {}] as unknown[]) {
    const d = resolveGoogleLink({ emailVerified: v as boolean })
    assert.equal(d.revokePassword, true, `emailVerified=${JSON.stringify(v)} must revoke`)
  }
})

test('revoking the password always revokes the sessions with it', () => {
  // A revoked credential whose live sessions keep running is not revoked.
  for (const v of [true, false]) {
    const d = resolveGoogleLink({ emailVerified: v })
    assert.equal(d.revokePassword, d.revokeSessions)
  }
})

/* ═══════════ the wiring ═════════════════════════════════════════════════ */

const src = readFileSync(join(import.meta.dirname, '..', 'app/api/auth/google/callback/route.ts'), 'utf8')

test('the callback decides BEFORE it patches emailVerified', () => {
  // Reading the flag after the patch always says „verified" — the fix would
  // still be present, still be called, and never do anything again.
  const decidedAt = src.indexOf('resolveGoogleLink(')
  const patchedAt = src.indexOf('patch.emailVerified = true')
  assert.ok(decidedAt > 0, 'callback no longer calls resolveGoogleLink')
  assert.ok(patchedAt > 0, 'callback no longer patches emailVerified')
  assert.ok(decidedAt < patchedAt, 'resolveGoogleLink must run before the emailVerified patch')
})

test('sessions are deleted BEFORE the new one is minted', () => {
  const wipeAt = src.indexOf('session.deleteMany')
  const mintAt = src.indexOf('createSession(')
  assert.ok(wipeAt > 0, 'callback no longer wipes sessions')
  assert.ok(wipeAt < mintAt, 'deleteMany after createSession would delete the session we just issued')
})

test('the session wipe is not swallowed', () => {
  // If we cannot revoke, we must not sign in and report success.
  const line = src.split('\n').find(l => l.includes('session.deleteMany')) ?? ''
  assert.ok(!/\.catch\(/.test(line), 'a caught deleteMany signs the user in with the attacker sessions alive')
})

test('the user is emailed that their password is gone', () => {
  assert.match(src, /googleLinkedEmail/, 'silent password revocation reads as „my password stopped working"')
})

test('the create-race branch re-decides against the row that actually landed', () => {
  // `link` is first resolved from a null `existing` (= nothing to revoke). If a
  // PASSWORD signup for this address wins the race, the row we then read IS the
  // one the revocation exists for — so the decision has to be taken again.
  const raceBranch = src.slice(src.indexOf('Concurrent create'), src.indexOf('} else {'))
  assert.match(raceBranch, /link = resolveGoogleLink\(user\)/, 'race branch skips the link decision')
  assert.match(raceBranch, /revokePassword/, 'race branch never acts on the decision')
})

test('the revocation notice outranks the welcome mail', () => {
  // Both conditions can hold at once in that same race branch, and only one
  // mail is sent — „we deleted your password" must be the one that survives.
  const notifyAt = src.indexOf('link.notify ?')
  const welcomeAt = src.indexOf('isNewUser ? welcomeEmail')
  assert.ok(notifyAt > 0 && welcomeAt > notifyAt, 'welcomeEmail must be the fallback, not the winner')
})
