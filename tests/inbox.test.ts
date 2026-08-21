// ONE INBOX — the provider's conversations, whatever kind they are.
//
// Run: npx tsx tests/inbox.test.ts   (also in `npm run check`)
//
// Owner, 2026-08-19: „რექვესთები ვფიქრობ რომ მიმოწერაში უნდა გამოდიოდეს
// აქტიურად, და გადაყავხარ საიტზე არაკომფორტულად და სად რა არის ვერ ხვდები."
// A provider talked to clients in TWO places — /work/messages (bookings) and an
// accordion inside every row of /work/offers. This file pins the merge:
//
//   1. ONE row builder. Both kinds become lib/inboxRows → InboxRow.
//   2. THE MASKING, EXECUTED. An offer row says „კლიენტი" until that offer is
//      ACCEPTED — run against a fake accepted and a fake pending offer, not
//      read as source text, because a label rule that is only grepped is a
//      label rule nobody has tested.
//   3. ONE unread number. The inbox and the sidebar pill end at the same
//      function over the same rows.
//   4. /work/offers no longer mounts the chat.
//   5. Both kinds are reachable from the one list.
//
// The pure rules are executed; the screens and routes are read as SOURCE TEXT
// with comments stripped (every one of these files explains at length what it
// is not — see tests/requests.test.ts → codeOf).

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  MASKED_CLIENT_NAME,
  offerPeerName, offerInboxRow, offerThreadHref,
  bookingInboxRow, sortInboxRows, inboxUnreadTotal,
  type InboxRow, type OfferInboxSource, type BookingInboxSource,
} from '../lib/inboxRows'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*(\/\/|--)/.test(l))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

const OFFERS_PAGE = 'app/work/(provider)/offers/page.tsx'
const MESSAGES_API = 'app/api/messages/route.ts'
const NAV_BADGES = 'app/api/tutor/nav-badges/route.ts'
const LIST = 'components/chat/ConversationList.tsx'
const PANE = 'components/chat/OfferThreadPane.tsx'
const INBOX_THREAD = 'app/work/messages/o/[offerId]/page.tsx'
const PROVIDER_THREAD = 'app/work/(provider)/offers/[offerId]/page.tsx'

/* ── the fixtures ────────────────────────────────────────────────────────── */

const CLIENT_NAME = 'ნინო ქავთარაძე'
const PHONE = '+995599111222'

const offer = (status: string, over: Partial<OfferInboxSource> = {}): OfferInboxSource => ({
  id: 'off1',
  status,
  createdAt: new Date('2026-08-18T09:00:00Z'),
  request: { topic: 'plumbing', contactName: CLIENT_NAME },
  messages: [{ body: 'როდის შეგიძლია მოსვლა?', fromClient: true, createdAt: new Date('2026-08-19T08:00:00Z') }],
  _count: { messages: 2 },
  ...over,
})

const booking = (over: Partial<BookingInboxSource> = {}): BookingInboxSource => ({
  key: 'b-bk1',
  href: '/work/messages/bk1',
  name: 'გიორგი ბერიძე',
  avatarUrl: '/api/avatars/u1',
  topic: 'მათემატიკა',
  preview: 'გამარჯობა',
  lastFromMe: false,
  lastHasFile: false,
  at: new Date('2026-08-19T07:00:00Z'),
  unreadCount: 3,
  ...over,
})

/* ═══════════ 1. ONE ROW SHAPE ════════════════════════════════════════════ */

test('one builder, one shape: a booking thread and an offer thread become the same row', () => {
  const b = bookingInboxRow(booking())
  const o = offerInboxRow(offer('SENT'))

  for (const row of [b, o]) {
    // The exact field set the list renders from — a second shape for the second
    // kind is how the two inboxes came apart in the first place.
    assert.deepEqual(
      Object.keys(row).sort(),
      ['avatarUrl', 'href', 'id', 'kind', 'lastAt', 'lastFromMe', 'lastHasFile', 'lastPreview', 'peerName', 'topic', 'unread'],
      'the row shape drifted between the two kinds',
    )
    assert.equal(typeof row.href, 'string')
    assert.ok(row.href.length > 1)
    assert.match(row.lastAt, /^\d{4}-\d{2}-\d{2}T/, 'lastAt is not an ISO string the browser can sort on')
  }

  assert.equal(b.kind, 'BOOKING')
  assert.equal(o.kind, 'OFFER')
  // Kind-prefixed ids: the React key AND the „which row is open" test, so a
  // booking id and an offer id can never collide into one highlighted row.
  assert.equal(b.id, 'b-bk1')
  assert.equal(o.id, 'o-off1')
  assert.equal(o.href, offerThreadHref('off1'))
  assert.equal(offerThreadHref('off1'), '/work/messages/o/off1')

  // The booking half is a pure carry-over of what app/api/messages already
  // built — nothing is recomputed, so the endpoint's pre-booking unread FOLD
  // survives into the row.
  assert.equal(b.unread, 3)
  assert.equal(b.peerName, 'გიორგი ბერიძე')
  assert.equal(b.lastPreview, 'გამარჯობა')
})

/* ═══════════ 2. THE MASKING, EXECUTED ════════════════════════════════════ */

test('an offer row says „კლიენტი" until that offer is ACCEPTED — and never a phone', () => {
  // Every status the column can hold, so a value added later fails loudly here
  // rather than defaulting into the revealing branch.
  for (const status of ['INVITED', 'SENT', 'WITHDRAWN', 'DECLINED']) {
    const row = offerInboxRow(offer(status))
    assert.equal(row.peerName, MASKED_CLIENT_NAME, `the client's name leaked on a ${status} offer`)
    assert.equal(MASKED_CLIENT_NAME, 'კლიენტი')
    assert.ok(!JSON.stringify(row).includes(CLIENT_NAME), `${status}: the real name is somewhere in the row`)
    assert.ok(!JSON.stringify(row).includes(PHONE), `${status}: a phone number is in an inbox row`)
  }

  // …and the one status that opens it.
  const accepted = offerInboxRow(offer('ACCEPTED'))
  assert.equal(accepted.peerName, CLIENT_NAME, 'the name is still masked after the client chose this provider')

  // The same decision at the function, called directly by the pane's header.
  assert.equal(offerPeerName({ status: 'SENT' }, CLIENT_NAME), MASKED_CLIENT_NAME)
  assert.equal(offerPeerName({ status: 'ACCEPTED' }, CLIENT_NAME), CLIENT_NAME)
  // An accepted row with nothing to reveal falls back to the label rather than
  // rendering an empty name — a blank peer reads as a broken row, not as a
  // masked one.
  assert.equal(offerPeerName({ status: 'ACCEPTED' }, '   '), MASKED_CLIENT_NAME)
  assert.equal(offerPeerName({ status: 'ACCEPTED' }, null), MASKED_CLIENT_NAME)
})

test('the masking happens where the row is BUILT, through the one function that decides it', () => {
  const lib = codeOf('lib/inboxRows.ts')
  // clientIdentityOpen is the platform's single answer to „may this reader see
  // who the client is". A second `status === 'ACCEPTED'` written here would be a
  // second answer, and the two would drift. (It was `clientContactFor` until
  // 2026-08-21, when the phone and the email left the product and the seal was
  // left holding the NAME alone — same function, one thing less to release.)
  assert.match(lib, /clientIdentityOpen\(/, 'the row builder stopped going through the seal')
  assert.match(lib, /peerName:\s+offerPeerName\(o,\s+o\.request\.contactName\)/,
    'an offer row no longer masks its peer name at build time')
  const build = lib.slice(lib.indexOf('export function offerInboxRow'))
  assert.doesNotMatch(build, /status === 'ACCEPTED'/, 'the builder re-implements the acceptance rule')

  // The row builder is never HANDED a phone or an email — the leak is
  // unrepresentable, not merely forbidden.
  const src = lib.slice(lib.indexOf('export type OfferInboxSource'), lib.indexOf('export function offerInboxRow'))
  assert.doesNotMatch(src, /\bphone\b|\bemail\b/, 'OfferInboxSource grew a contact field a list row must never hold')
  const query = lib.slice(lib.indexOf('export async function offerInboxRows'))
  assert.doesNotMatch(query, /phone: true|email: true/, 'the inbox query selects the client’s contact columns')
  assert.doesNotMatch(query, /adminNote/, 'the inbox query selects the admin’s private note')

  // The pane behind the row prints NO contact at all (2026-08-21) — owner:
  // „არ უჩანდეს ეგრევე ტელეფონი". It never fetches the two columns, so the
  // block cannot come back without the query coming back first.
  const pane = codeOf(PANE)
  assert.doesNotMatch(pane, /phone: true|email: true/, 'the offer pane fetches the client’s contact again')
  assert.doesNotMatch(pane, /tel:|mailto:/, 'the offer pane prints a contact link again')
  assert.match(pane, /offerPeerName\(offer,\s+offer\.request\.contactName\)/, 'the pane prints an unmasked peer name')
  assert.doesNotMatch(pane, /contactName\}/, 'the pane prints the client’s name straight from the column')
})

/* ═══════════ 3. ONE UNREAD NUMBER ════════════════════════════════════════ */

test('the unread number is one number over both kinds, from one source', () => {
  const rows: InboxRow[] = [
    bookingInboxRow(booking({ unreadCount: 3 })),
    bookingInboxRow(booking({ key: 'u-u9', href: '/work/messages/u/u9', unreadCount: 1 })),
    offerInboxRow(offer('SENT', { _count: { messages: 2 } })),
    offerInboxRow(offer('ACCEPTED', { id: 'off2', _count: { messages: 0 } })),
  ]
  assert.equal(inboxUnreadTotal(rows), 6)
  assert.equal(inboxUnreadTotal([]), 0)

  // The inbox: the badge sums EVERY row, the payload is capped — an unread
  // conversation older than the returned window must still be counted.
  const api = codeOf(MESSAGES_API)
  assert.match(api, /from '@\/lib\/inboxRows'/, 'the inbox endpoint stopped building rows through lib/inboxRows')
  assert.match(api, /const\s+unreadCount\s+=\s+inboxUnreadTotal\(allRows\)/, 'the inbox counts unread its own way again')
  assert.match(api, /const threads = allRows\.slice\(0, 20\)/, 'the payload cap moved off the merged rows')
  assert.doesNotMatch(api, /reduce\(\(n, t\) => n \+ t\.unreadCount, 0\)/, 'the old hand-rolled sum is back beside the shared one')

  // The sidebar pill: the SAME rows, summed by the SAME function. Two
  // derivations of one number is the bug that once left a „მიმოწერა N" pill
  // nothing could clear.
  const badges = codeOf(NAV_BADGES)
  assert.match(badges, /import\s+\{\s+offerUnreadTotal\s+\}\s+from\s+'@\/lib\/inboxRows'/, 'the nav badge no longer reads the shared total')
  assert.match(badges, /const\s+offerUnread\s+=\s+await\s+offerUnreadTotal\(await\s+requestAccessOf\(user\.id\)\)/,
    'the nav badge counts offer unread with a query of its own')
  assert.match(badges, /const messages = bookingUnread \+ preUnread \+ offerUnread/,
    'the „მიმოწერა" pill does not cover offer conversations')
  assert.doesNotMatch(badges, /prisma\.requestMessage|prisma\.requestOffer/,
    'the nav badge grew its own offer query — that is the second source')

  // …and the shared total IS the shared rows, not a parallel count.
  const lib = codeOf('lib/inboxRows.ts')
  assert.match(lib, /return\s+inboxUnreadTotal\(await\s+offerInboxRows\(provider\)\)/,
    'offerUnreadTotal stopped being „the rows, summed"')
})

/* ═══════════ 4. THE CHAT LEFT THE OFFERS PAGE ════════════════════════════ */

test('/work/offers is the list of OFFERS again — it no longer mounts RequestChat', () => {
  const raw = read(OFFERS_PAGE)
  const code = codeOf(OFFERS_PAGE)
  assert.ok(!code.includes('<RequestChat'), '/work/offers still embeds the conversation — that is the second inbox')
  assert.ok(!raw.includes("from '@/components/RequestChat'"), '/work/offers still imports the chat pane')

  // What it keeps: the price, the status, the two actions, and — since
  // 2026-08-21, in place of the contact block — the client's NAME once they
  // have chosen you, through the same seal.
  assert.match(code, /offerPriceLabel\(o\.priceGel, o\.priceKind\)/, 'the price left the offers page')
  assert.match(code, /OFFER_STATUS_LABEL\[o\.status as OfferStatusName\]/, 'the status label left the offers page')
  assert.match(code, /<OfferActions\s+offerId=\{o\.id\}\s+status=\{o\.status\}\s+kind=\{o\.kind\}\s+doneAt=/,
    'the „გატანა" / „დასრულდა" actions changed — _actions.tsx behaviour was to stay untouched')
  assert.match(code, /clientIdentityOpen\(/, 'the offers page decides the seal itself')
  assert.doesNotMatch(code, /phone: true|email: true|tel:|mailto:/, 'the offers page shows a contact again')

  // And the row now points AT the thread, carrying the same unread number the
  // collapsed pane used to show. No name on the link: the label says
  // „მიმოწერა" and nothing about who is on the other end.
  assert.match(code, /href=\{`\/work\/offers\/\$\{o\.id\}`\}/, 'an offer row no longer links to its conversation')
  assert.match(code, /\{o\._count\.messages > 0 && \(/, 'the unread badge left the offer row')
  assert.doesNotMatch(code, /contact \? contact\.contactName : /, 'the offers list is naming the client again')
})

/* ═══════════ 5. BOTH KINDS REACHABLE FROM THE ONE LIST ═══════════════════ */

test('the one list carries both kinds, newest activity first, and every row opens', () => {
  const rows = sortInboxRows([
    offerInboxRow(offer('SENT', { id: 'old', messages: [{ body: 'ძველი', fromClient: true, createdAt: new Date('2026-08-10T10:00:00Z') }] })),
    bookingInboxRow(booking({ at: new Date('2026-08-19T07:00:00Z') })),
    offerInboxRow(offer('ACCEPTED', { id: 'new', messages: [{ body: 'ახალი', fromClient: false, createdAt: new Date('2026-08-19T12:00:00Z') }] })),
  ])
  assert.deepEqual(rows.map(r => r.kind), ['OFFER', 'BOOKING', 'OFFER'], 'the merged list is not ordered by last activity')
  assert.deepEqual(rows.map(r => r.id), ['o-new', 'b-bk1', 'o-old'])
  // `lastFromMe` reads from the PROVIDER's side of an offer thread: a message
  // the client sent is not mine.
  assert.equal(rows[0].lastFromMe, true)
  assert.equal(rows[2].lastFromMe, false)
  // Sorting does not mutate its input (the endpoint reuses the arrays).
  const one = [offerInboxRow(offer('SENT'))]
  assert.notEqual(sortInboxRows(one), one)

  // The endpoint merges the third kind in, and only on the supply side: the
  // client's request conversations live in their own request room, keyed by a
  // reference rather than by an account.
  const api = codeOf(MESSAGES_API)
  assert.match(api, /const\s+offerRows\s+=\s+space\s+===\s+'client'\s*\n?\s*\?\s+\[\]\s*\n?\s*:\s+await\s+offerInboxRows\(await\s+requestAccessOf\(user\.id\)\)/,
    'offer conversations are no longer merged in on the supply side only')
  assert.match(api, /sortInboxRows\(\[\.\.\.allThreads\.map\(bookingInboxRow\),\s+\.\.\.offerRows\]\)/,
    'the two kinds are no longer merged into one ordered list')

  // The list component renders whatever it is given and masks nothing itself —
  // the masking already happened where the row was built.
  const list = codeOf(LIST)
  assert.match(list, /name=\{t\.peerName\}/, 'the list stopped reading the built row’s peer name')
  assert.match(list, /unread=\{t\.unread\}/)
  assert.match(list, /href=\{t\.href\}/)
  assert.doesNotMatch(list, /კლიენტი|clientContactFor|ACCEPTED/, 'the list is masking (or unmasking) on its own')
  // The open row highlights for all three thread kinds, from the same prefixes
  // lib/inboxRows mints.
  assert.match(list, /params\?\.offerId\s*\n?\s*\?\s+`o-\$\{params\.offerId\}`/, 'an open offer thread no longer highlights its row')

  // Two mounts, one pane — the expert reads it inside the messages centre, and
  // a WORK-only provider (whom the (expert) guard never admits) in their own
  // space. Same component, so the two can never drift.
  for (const p of [INBOX_THREAD, PROVIDER_THREAD]) {
    assert.ok(has(p), `${p} is missing — a row in the list points nowhere`)
    assert.match(codeOf(p), /<OfferThreadPane\s+offerId=\{offerId\}\s+backHref="/, `${p} does not render the shared pane`)
  }
  assert.match(codeOf(INBOX_THREAD), /backHref="\/work\/messages"/)
  assert.match(codeOf(PROVIDER_THREAD), /backHref="\/work\/offers"/)

  // The pane is the pane that already existed: components/RequestChat, no ref
  // (the session is the identity and the endpoint derives the side from it).
  const pane = codeOf(PANE)
  assert.match(pane, /<RequestChat\s+thread=\{\{\s+kind:\s+'OFFER',\s+offerId:\s+offer\.id\s+\}\}/, 'the offer pane stopped using RequestChat')
  assert.doesNotMatch(pane, /refCode/, 'the provider’s pane carries a client reference')
  // Ownership is in the `where`, never in a branch after the read.
  assert.match(pane, /prisma\.requestOffer\.findFirst\(\{\s*\n\s*where:\s+\{\s*\n\s*id:\s+offerId,/, 'the pane reads an offer before checking whose it is')
  assert.match(pane, /p\.kind\s+===\s+'EXPERT'\s*\n?\s*\?\s+\{\s+expertUserId:\s+p\.userId\s+\}\s*\n?\s*:\s+\{\s+companyId:\s+p\.companyId\s+\}/,
    'the pane no longer scopes the offer to the viewer')
})

/* ═══════════ 6. the module stays importable by the browser ═══════════════ */

test('lib/inboxRows is safe on both sides: no top-level prisma, and the list imports the TYPE only', () => {
  const lib = read('lib/inboxRows.ts')
  assert.doesNotMatch(lib, /^import \{ prisma \}/m, 'a database client is imported at module scope — the browser list imports this module')
  assert.match(lib, /const\s+\{\s+prisma\s+\}\s+=\s+await\s+import\('\.\/prisma'\)/, 'the loader stopped importing prisma lazily')
  assert.match(read(LIST), /import\s+type\s+\{\s+InboxRow\s+\}\s+from\s+'@\/lib\/inboxRows'/,
    'the list imports lib/inboxRows for VALUES — that pulls the loader into the bundle')
})
