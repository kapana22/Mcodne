// Everything the database holds must be declared in schema.prisma.
//
// WHY. `prisma db push` reconciles the DATABASE to that file, so a table the
// file cannot see is a table it offers to drop. On 2026-08-21 three of them were
// invisible — Event (2 468 rows), HelpMessage and JobRun — because lib/dbBoot
// creates them and every read goes through `$queryRawUnsafe`. It prompts before
// dropping, so it was a trap rather than a bug; `npm run db:push` is in
// package.json and that prompt was the only thing between it and the data.
//
// This test needs no database: dbBoot's CREATE TABLE statements say what exists,
// and schema.prisma says what Prisma knows. Comparing the two catches the next
// one at the moment it is written.
//
// Run: npx tsx tests/schemaCoverage.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const boot = read('lib/dbBoot.ts')
const schema = read('prisma/schema.prisma')

/** Model names, plus whatever an @@map renames them to. */
const declared = new Set<string>()
for (const m of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  declared.add(m[1])
  const mapped = m[2].match(/@@map\("([^"]+)"\)/)
  if (mapped) declared.add(mapped[1])
}

test('every table lib/dbBoot creates is declared in schema.prisma', () => {
  // ⚠️ A TABLE MAY BE CREATED UNDER ONE NAME AND RENAMED LATER IN THE SAME SET
  // (2026-08-30). `MasterApplication` is created ~800 statements in — that
  // statement is HISTORY and must keep saying so, or a fresh boot mints a name
  // the rename then cannot find — and the last block renames it to
  // `ProviderApplication`, which is what the schema declares. Reading only the
  // CREATEs made this test report a drop that cannot happen.
  const renames = new Map(
    [...boot.matchAll(/ALTER TABLE "(\w+)" RENAME TO "(\w+)"/g)].map(m => [m[1], m[2]]),
  )
  const created = [...boot.matchAll(/CREATE TABLE IF NOT EXISTS\s+"(\w+)"/g)]
    .map(m => renames.get(m[1]) ?? m[1])
  assert.ok(created.length > 0, 'no CREATE TABLE found — this test stopped reading dbBoot')
  const missing = [...new Set(created)].filter(t => !declared.has(t) && t !== '_DbBootStamp')
  assert.deepEqual(
    missing, [],
    `dbBoot creates ${missing.join(', ')} and schema.prisma does not declare it — ` +
    '`prisma db push` would offer to DROP it. Add the model (copy the shape from ' +
    '`npx prisma db pull --print`, which reads production and writes nothing).',
  )
})

test('_DbBootStamp stays out of schema.prisma', () => {
  // The one table that must NOT be declared: it is the migration ledger, it is
  // never read through Prisma, and modelling it would invite db push to manage
  // the thing that records whether db push is needed.
  assert.equal(declared.has('_DbBootStamp'), false, 'the boot ledger became a Prisma model')
})

test('the two foreign keys that had no index keep it', () => {
  // Postgres indexes a primary key and a unique constraint for you. It does NOT
  // index a foreign key, and both of these are ON DELETE SET NULL — so account
  // deletion (tests/userDeletion.test.ts) had to seq-scan the child table.
  for (const [tbl, idx, col] of [
    ['ServiceRequest', 'ServiceRequest_userId_idx', 'userId'],
    ['RequestMessage', 'RequestMessage_fromUserId_idx', 'fromUserId'],
  ]) {
    assert.ok(
      boot.includes(`CREATE INDEX IF NOT EXISTS "${idx}"`),
      `lib/dbBoot no longer creates ${idx} — a fresh database would not have it`,
    )
    const model = schema.match(new RegExp(`model\\s+${tbl}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] ?? ''
    assert.match(
      model, new RegExp(`@@index\\(\\[${col}\\]\\)`),
      `${tbl} lost @@index([${col}]) — schema.prisma and the database would disagree`,
    )
  }
})
