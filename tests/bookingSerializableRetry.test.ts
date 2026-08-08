/*
 * The retry that separates „try again" from „you lost the slot".
 *
 * Run with:  npx tsx tests/bookingSerializableRetry.test.ts
 *
 * WHY. `POST /api/bookings` runs its create in a Serializable transaction and
 * used to map Prisma's P2034 (serialization failure) straight to SLOT_TAKEN —
 * „ეს დრო დაიკავეს". Those are different claims: P2034 is raised by ANY
 * concurrent work on the same tables, including the every-15-minutes cleanup
 * cron, and says nothing about who booked what.
 *
 * Production, 2026-08-05: an expert with 24 published windows and zero bookings
 * in the entire history of the database produced six „that time is taken"
 * refusals in ten minutes. With no bookings the genuine SlotTaken branch cannot
 * fire, so P2034 was the only path left.
 *
 * This pins the two properties that matter, without a database: a serialization
 * failure is retried, and a real verdict is not.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

/** Mirrors runSerializable in app/api/bookings/route.ts. Kept as a copy on
 *  purpose: the route module pulls in prisma, auth and the mailer, none of
 *  which belong in a unit test. The behaviour under test is 6 lines. */
const MAX_TX_ATTEMPTS = 3
async function runSerializable<T>(attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt()
    } catch (e: any) {
      if (e?.code !== 'P2034' || n >= MAX_TX_ATTEMPTS) throw e
      await new Promise(r => setTimeout(r, 1))
    }
  }
}

const p2034 = () => Object.assign(new Error('could not serialize'), { code: 'P2034' })

test('a serialization failure is retried, not reported as a lost slot', async () => {
  let calls = 0
  const result = await runSerializable(async () => {
    calls++
    if (calls < 3) throw p2034()
    return 'booked'
  })
  assert.equal(result, 'booked')
  assert.equal(calls, 3, 'should have retried twice before succeeding')
})

test('a first-attempt success does not retry', async () => {
  let calls = 0
  await runSerializable(async () => { calls++; return 1 })
  assert.equal(calls, 1)
})

test('P2034 forever still surfaces, after the retry budget', async () => {
  let calls = 0
  await assert.rejects(
    () => runSerializable(async () => { calls++; throw p2034() }),
    (e: any) => e.code === 'P2034',
  )
  assert.equal(calls, MAX_TX_ATTEMPTS, 'must stop at the budget, never loop forever')
})

test('a REAL verdict is never retried', async () => {
  // SlotTaken / StudentOverlap / NoAvailability are decisions about THIS
  // booking. Retrying one would re-run the same check and waste the person's
  // time to reach the identical answer.
  class SlotTaken extends Error {}
  let calls = 0
  await assert.rejects(
    () => runSerializable(async () => { calls++; throw new SlotTaken() }),
    (e: any) => e instanceof SlotTaken,
  )
  assert.equal(calls, 1, 'a real verdict must reach the user on the first attempt')
})

test('an unrelated error is not swallowed', async () => {
  let calls = 0
  await assert.rejects(
    () => runSerializable(async () => { calls++; throw Object.assign(new Error('boom'), { code: 'P1001' }) }),
    (e: any) => e.code === 'P1001',
  )
  assert.equal(calls, 1)
})

console.log('✓ bookingSerializableRetry')
