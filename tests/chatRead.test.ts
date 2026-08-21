// „წაკითხულია" — the read mark, as behaviour.
//
// Run: npx tsx tests/chatRead.test.ts   (also in `npm run check`)
//
// WHAT THIS PINS. The receipt is the one thing in a conversation that makes a
// claim about the OTHER person, so the failure modes are asymmetric: showing it
// when they have not read is a lie the reader acts on („they know I'm coming at
// six"), while not showing it is merely a missing convenience. Every assertion
// below is therefore about the mark being CONSERVATIVE.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lastReadMessageId } from '../lib/chatRead'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const ME = 'u-me'
const THEM = 'u-them'
const at = (min: number) => new Date(Date.UTC(2026, 7, 21, 10, min)).toISOString()
const THREAD = [
  { id: 'm1', fromId: ME,   createdAt: at(0) },
  { id: 'm2', fromId: THEM, createdAt: at(1) },
  { id: 'm3', fromId: ME,   createdAt: at(2) },
  { id: 'm4', fromId: ME,   createdAt: at(9) },
]

test('the mark lands on the LAST message of mine they have reached', () => {
  // Read through 10:02 → m3 carries it, not m1: one line at the bottom of what
  // they have read, which is what „read up to here" means.
  assert.equal(lastReadMessageId(THREAD, ME, at(2)), 'm3')
  // …and a later mark moves it down rather than adding a second one.
  assert.equal(lastReadMessageId(THREAD, ME, at(9)), 'm4')
  assert.equal(lastReadMessageId(THREAD, ME, at(20)), 'm4')
})

test('it is inclusive of the instant it names', () => {
  // The read stamp IS the time the message was opened; excluding it would hide
  // the receipt for exactly the message that produced it.
  assert.equal(lastReadMessageId([THREAD[0]], ME, at(0)), 'm1')
})

test('nothing is claimed when nothing is known', () => {
  // Four different „we cannot tell" states, all one answer — the UI shows no
  // line at all rather than asserting „unread", which is not a fact we hold.
  assert.equal(lastReadMessageId(THREAD, ME, null), null, 'a null mark printed a receipt')
  assert.equal(lastReadMessageId(THREAD, ME, undefined), null)
  assert.equal(lastReadMessageId(THREAD, null, at(9)), null, 'a signed-out reader got a receipt')
  assert.equal(lastReadMessageId(THREAD, ME, 'not-a-date'), null, 'a garbage stamp printed a receipt')
  // Behind the first message of mine → still nothing.
  assert.equal(lastReadMessageId(THREAD, ME, new Date(Date.UTC(2026, 7, 21, 9, 0)).toISOString()), null)
})

test('it never marks THEIR messages, and never an unsent one', () => {
  // Their own bubbles: „when I read theirs" is noise, and printing it under
  // their message would read as them confirming their own words.
  assert.equal(lastReadMessageId([THREAD[1]], ME, at(9)), null, 'a receipt appeared under their message')
  // An optimistic bubble carries the BROWSER's clock. A machine running fast
  // would stamp it before the server's mark and claim a message nobody has
  // received was read — excluded by id, never by trusting the clock.
  const optimistic = [{ id: 'tmp-1', fromId: ME, createdAt: at(1) }]
  assert.equal(lastReadMessageId(optimistic, ME, at(9)), null, 'an unsent message was marked read')
})

test('the endpoint answers the mark on EVERY response, not just the first', () => {
  // The reason this value exists at all: the poll is incremental, so a change to
  // an OLD row (somebody reading an hour-old message) can only arrive as its own
  // field. Putting it behind the `sinceValid` header branch would make the
  // receipt appear on a full reload and never during a conversation — the exact
  // bug this line prevents, and one nothing else would catch.
  const route = read('app/api/messages/route.ts')
  const emits = route.split('\n').filter(l => l.includes('peerReadAt:'))
  assert.equal(emits.length, 2, 'both threads (pair + booking) must answer peerReadAt')
  for (const l of emits) {
    assert.doesNotMatch(l, /sinceValid/, 'the read mark was hidden behind the initial-load branch')
  }
})

test('both conversations say it the same way', () => {
  // Two chats exist on this platform — the booking/pair thread and the offer
  // thread — and a receipt that reads „წაკითხულია" in one place and something
  // else in the other is two features to a reader who uses both.
  for (const f of ['components/chat/BookingChat.tsx', 'components/RequestChat.tsx']) {
    assert.match(read(f), /წაკითხულია/, `${f} lost the read receipt`)
    assert.match(read(f), /lastReadMineId/, `${f} no longer marks a single message`)
  }
})
