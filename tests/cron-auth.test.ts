// Unit tests for lib/cronAuth — the gate on the internal cron endpoints.
//
// Run: npx tsx --test tests/cron-auth.test.ts
//
// The core invariant of the in-progress migration: the `?secret=` query form
// must keep working ONLY where it is explicitly opted into (GET, for the live
// Railway cron), and must be rejected everywhere else — otherwise retiring it
// later silently does nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cronAuth } from '../lib/cronAuth'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The gate's own source — the last test reads it, because „what does a
 *  rejection print" is a question about the TEXT, not about a return value. */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

const SECRET = 'a-test-secret-of-some-length'
const URL_BASE = 'https://mcodne.ge/api/internal/cleanup'

function req(opts: { secretQuery?: string; bearer?: string } = {}): Request {
  const url = opts.secretQuery !== undefined
    ? `${URL_BASE}?secret=${encodeURIComponent(opts.secretQuery)}`
    : URL_BASE
  return new Request(url, {
    headers: opts.bearer !== undefined ? { authorization: `Bearer ${opts.bearer}` } : {},
  })
}

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.CLEANUP_SECRET
  if (value === undefined) delete process.env.CLEANUP_SECRET
  else process.env.CLEANUP_SECRET = value
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.CLEANUP_SECRET
    else process.env.CLEANUP_SECRET = prev
  }
}

test('unset CLEANUP_SECRET disables the endpoint rather than allowing it', () => {
  withSecret(undefined, () => {
    const gate = cronAuth(req({ bearer: 'anything' }), { allowQuery: true })
    assert.equal(gate.ok, false)
    if (!gate.ok) assert.equal(gate.status, 503)
  })
})

test('matching Bearer header authenticates', () => {
  withSecret(SECRET, () => {
    assert.equal(cronAuth(req({ bearer: SECRET })).ok, true)
  })
})

test('wrong Bearer header is rejected with 401', () => {
  withSecret(SECRET, () => {
    const gate = cronAuth(req({ bearer: 'wrong' }))
    assert.equal(gate.ok, false)
    if (!gate.ok) assert.equal(gate.status, 401)
  })
})

test('a correct-prefix but truncated secret does not pass', () => {
  withSecret(SECRET, () => {
    assert.equal(cronAuth(req({ bearer: SECRET.slice(0, -1) })).ok, false)
    assert.equal(cronAuth(req({ bearer: SECRET + 'x' })).ok, false)
  })
})

/*
 * ⚠️ THIS ASSERTION WAS INVERTED FOR ONE DEPLOY ON 2026-08-30 AND PUT BACK —
 * and NOT because the theory behind the inversion was wrong. It was right: the
 * crashed `cleanup-cron` sends POST with `?secret=`, and widening the gate made
 * the next clean tick run green.
 *
 * It was put back because a green cron is not the only thing at stake. Widening
 * this gate makes a secret in a URL the normal way to call a MUTATING endpoint,
 * permanently, to accommodate one caller's quoting — so the fix moved to the
 * cron command, where the fault is. The strict rule is the rule again, and
 * lib/cronAuth carries the whole finding including the operator step.
 */
test('query secret is rejected by default (POST path)', () => {
  withSecret(SECRET, () => {
    assert.equal(cronAuth(req({ secretQuery: SECRET })).ok, false)
  })
})

test('query secret is accepted only when explicitly allowed (legacy GET)', () => {
  withSecret(SECRET, () => {
    assert.equal(cronAuth(req({ secretQuery: SECRET }), { allowQuery: true }).ok, true)
    assert.equal(cronAuth(req({ secretQuery: 'wrong' }), { allowQuery: true }).ok, false)
  })
})

test('no credential at all is rejected', () => {
  withSecret(SECRET, () => {
    assert.equal(cronAuth(req(), { allowQuery: true }).ok, false)
  })
})

test('a rejected cron call explains itself, and never with the secret', () => {
  // ⚠️ WHY THIS IS PINNED. The Railway cron 401'd on every tick while the same
  // request sent by hand returned 200, and the command could not be read back —
  // the CLI does not print it, the API refuses. The 401 said nothing about
  // WHICH credential arrived, so the cause had to be guessed. This line is what
  // makes the next one a single tick's diagnosis.
  const src = read('lib/cronAuth.ts')
  assert.match(src, /scope: 'cron-auth'/, 'the rejection stopped explaining itself')
  assert.match(src, /sentLen: header\?\.length \?\? 0/,
    'the length comparison is gone — it is what catches an unexpanded $CLEANUP_SECRET')

  // ⚠️ SHAPES, NEVER VALUES. A log that prints the credential in order to
  // explain a rejected credential is a worse bug than the one it explains.
  //
  // ⚠️ THE CHECK IS ON THE VALUE, NOT ON THE NAME. A first version banned the
  // identifiers outright and failed on `expected.length` — which is precisely
  // the safe form, and exactly the shape this log is built out of. What is
  // forbidden is a credential reaching the line UNMEASURED: `expected` or
  // `header` on their own, or the query value read back out of the URL.
  const logged = src.slice(src.indexOf("scope: 'cron-auth'"), src.indexOf('return { ok: false, status: 401'))
  // Strip the three forms that are safe BY CONSTRUCTION — a length, or a
  // coercion to „was it there at all" — and nothing naming a credential may
  // remain. Written this way round because the safe list is short and closed,
  // while the unsafe one is every expression somebody might write next.
  const stripped = logged
    .replace(/!!(expected|header)\b/g, '')
    .replace(/\b(expected|header)\?\?\.length/g, '')
    .replace(/\b(expected|header)\?\.length/g, '')
    .replace(/\b(expected|header)\.length/g, '')
  const hits = stripped.match(/\b(expected|header)\b/g) ?? []
  assert.deepEqual(hits, [],
    `the cron-auth log puts a credential on the line unmeasured: ${hits.join(', ')}`)
  assert.ok(!logged.includes("searchParams.get('secret')"),
    'the cron-auth log reads the query secret back out of the URL')
})
