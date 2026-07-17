// Focused unit test for the /api/auth/signout route handler.
//
// Verifies the production logout fix: the endpoint must return a NON-redirect
// success status (never a 3xx that the client `fetch` would transparently
// follow) and must expire/clear the auth cookie in the response headers.
//
// Run with: node_modules/.bin/tsx --test tests/signout.test.ts
// (tsx is already a devDependency — used for prisma seed — so no new deps;
//  tsx resolves the extensionless route import to its .ts source.)
//
// Note on mocking: the handler calls destroySession(), which touches the DB and
// the request-scoped cookie jar via next/headers. Outside a Next request scope
// (i.e. here) `cookies()` throws — exactly the failure the handler is hardened
// against. The handler swallows that error and still returns the cleared-cookie
// 200, so we exercise the real handler end-to-end with no server or DB, and the
// assertions below hold on the response contract regardless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POST } from '../app/api/auth/signout/route'

const COOKIE = 'mcodne_session'

test('signout returns a non-redirect success status', async () => {
  const res = await POST()
  // Must NOT be a 3xx redirect — that was the root-cause bug (fetch followed it).
  assert.ok(res.status < 300 || res.status >= 400, `expected non-3xx, got ${res.status}`)
  assert.equal(res.status, 200)
  // No Location header (redirect marker) should be present.
  assert.equal(res.headers.get('location'), null)
  const body = await res.json()
  assert.deepEqual(body, { ok: true })
})

test('signout expires/clears the auth cookie', async () => {
  const res = await POST()

  // The cleared cookie is present on the response and reduced to an empty value.
  const cleared = res.cookies.get(COOKIE)
  assert.ok(cleared, 'auth cookie should be set on the response')
  assert.equal(cleared!.value, '')
  // Expired immediately: maxAge 0 and/or an epoch expiry.
  assert.equal(cleared!.maxAge, 0)

  // And the raw Set-Cookie header actually instructs the browser to expire it.
  const setCookie = res.headers.get('set-cookie') ?? ''
  assert.match(setCookie, new RegExp(`${COOKIE}=`))
  assert.match(setCookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  assert.match(setCookie, /Path=\//i)
})
