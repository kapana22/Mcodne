// The boot stamp: lib/dbBoot runs 166 idempotent statements, and since
// 2026-08-21 it skips them when a stamp says this exact DDL already ran.
//
// WHY THIS FILE. The stamp is the difference between a 102-second cold boot and
// a 1-second one — measured that day against the Railway proxy, and it was the
// entire cost of `npm run check` (110s of tests, 100s of which was two files
// booting the schema). The saving is only safe while the fingerprint tracks the
// DDL: a stamp that went stale WITHOUT the migrations re-running would mean a
// schema silently missing a column, surfacing as opaque 500s. So the property
// is checked here rather than asserted in a comment.
//
// Run: npx tsx tests/dbBootStamp.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { __migrationsFingerprint, __runMigrationsSource } from '../lib/dbBoot'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

test('the fingerprint is a hash of the migration function, not a constant', () => {
  const fp = __migrationsFingerprint()
  assert.match(fp, /^[0-9a-f]{32}$/, 'the stamp is not a sha256 prefix')
  const expected = createHash('sha256').update(__runMigrationsSource()).digest('hex').slice(0, 32)
  assert.equal(fp, expected, 'the stamp is no longer derived from the migration source — it can now go stale silently')
})

test('the fingerprint is stable within a process', () => {
  assert.equal(__migrationsFingerprint(), __migrationsFingerprint())
})

test('changing the DDL changes the fingerprint', () => {
  // The property the whole design rests on, exercised on the real source text:
  // one more statement must produce a different stamp, or the set would be
  // skipped for ever after the first boot.
  const body = __runMigrationsSource()
  const fp = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32)
  // ⚠️ THIS IS THE TRANSPILED BODY, not the file. esbuild has already stripped
  // the comments and normalised the spacing, which is the RIGHT granularity: a
  // comment is not DDL and must not cost a 102-second boot, while any real
  // statement survives into the text below and moves the hash.
  assert.match(body, /^async function runMigrations\(\)\s*\{/, 'the seam no longer returns the migration body')
  const withOneMore = body + '\n// ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "x" TEXT;'
  assert.notEqual(fp(body), fp(withOneMore), 'adding a statement left the stamp unchanged — new DDL would never run')
})

test('a boot failure still cannot record a stamp', () => {
  // recordApplied runs AFTER runMigrations resolves. If it were ever moved
  // before, or wrapped in the same try, a half-applied schema would be stamped
  // as complete and never repaired.
  const src = read('lib/dbBoot.ts')
  const once = src.slice(src.indexOf('async function runMigrationsOnce'))
  const run = once.indexOf('await runMigrations()')
  const record = once.indexOf('await recordApplied(')
  assert.ok(run > -1 && record > -1, 'runMigrationsOnce no longer runs or records the set')
  assert.ok(record > run, 'the stamp is written before the migrations finish — a failed boot would be remembered as done')
  // ⚠️ THE BAN IS ON `catch`, NOT ON `try` (2026-08-27). This read
  // `doesNotMatch(/try\s*\{/)` and cut the body at the FIRST `}` — so the day
  // `runMigrationsOnce` grew a `try { … } finally { applying = false }` around
  // the run, to tell „the migrations are genuinely running" from „the database
  // is gone" (see ensureDbReadyWithin), this fired on a function that swallows
  // nothing: a `finally` re-throws, only a `catch` eats. The rule the comment
  // above states is „ensureDbReady must SEE the throw", and that is what is
  // checked now — over the whole body rather than up to the first brace.
  const bodyEnd = (() => {
    let d = 0
    for (let i = once.indexOf('{'); i < once.length; i++) {
      if (once[i] === '{') d++
      else if (once[i] === '}' && --d === 0) return i
    }
    return once.length
  })()
  assert.doesNotMatch(
    once.slice(0, bodyEnd),
    /catch\s*[({]/,
    'runMigrationsOnce swallows its own failure — ensureDbReady must see the throw so the next request retries',
  )
})

test('the stamp is consulted by ensureDbReady, not bypassed', () => {
  const src = read('lib/dbBoot.ts')
  assert.match(src, /bootPromise = runMigrationsOnce\(\)/, 'ensureDbReady calls runMigrations directly again — the stamp is dead code')
})
