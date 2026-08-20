// ONE LIST OF WORK — /work/jobs and lib/jobRows, executed (2026-08-19).
//
// Run: npx tsx tests/jobs.test.ts   (also in `npm test`)
//
// The row model is PURE, so it is run rather than read: both kinds are mapped,
// the sort rule and its documented fallback are exercised on real arrays, and
// the quote status derivation is walked through all four combinations of
// doneAt/closedAt. The middleware is run for real (the way tests/redirects
// does) so „the list moved, the detail page did not" is a fact and not a
// comment. Everything that is a SCREEN — the query's select list, what the row
// prints — is read as source with comments stripped, because those files quote
// their own rules while explaining them.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

import {
  buildJobRows, bookingJobRow, quoteJobRow, quoteJobStatus, quotePeerName,
  contactIsOpen, sortJobRows, splitDated, jobDayKey,
  CLIENT_FALLBACK, UNDATED_LABEL, QUOTE_JOB_STATUS_LABEL, BOOKING_JOB_STATUS_LABEL,
  type BookingJobInput, type QuoteJobInput, type JobRow,
} from '../lib/jobRows'
import { UPCOMING_STATUSES } from '../lib/bookings'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const NOW = Date.parse('2026-08-19T12:00:00.000Z')
const HOUR = 3_600_000

const booking = (over: Partial<BookingJobInput> = {}): BookingJobInput => ({
  id: 'b1',
  topic: 'გადასახადები',
  status: 'CONFIRMED',
  startAt: new Date(NOW + 3 * HOUR).toISOString(),
  durationMin: 60,
  price: 80,
  student: { fullName: 'ნინო ბერიძე' },
  ...over,
})

const quote = (over: Partial<QuoteJobInput> = {}): QuoteJobInput => ({
  id: 'q1',
  status: 'ACCEPTED',
  priceGel: 450,
  priceKind: 'FIXED',
  doneAt: null,
  closedAt: null,
  updatedAt: new Date(NOW - 2 * HOUR).toISOString(),
  topic: 'other',
  contactName: 'გიორგი ხმალაძე',
  ...over,
})

/* ═══════════ 1. the shared row, both kinds ══════════════════════════════ */

test('the mapper is pure and produces ONE row shape for both kinds', () => {
  const b = bookingJobRow(booking(), NOW)
  const q = quoteJobRow(quote())

  const KEYS = ['kind', 'id', 'href', 'title', 'peerName', 'when', 'status', 'statusLabel', 'price', 'sortAt', 'bucket']
  for (const r of [b, q]) {
    assert.deepEqual(Object.keys(r).sort(), [...KEYS].sort(), 'the two kinds no longer share one row shape')
  }

  assert.equal(b.kind, 'BOOKING')
  assert.equal(q.kind, 'QUOTE')
  // ⚠️ THE BOOKING DETAIL PAGE DID NOT MOVE.
  assert.equal(b.href, '/work/bookings/b1')
  // A quote has no page of its own — it opens where an offer is viewable.
  assert.equal(q.href, '/work/offers')
  assert.equal(b.peerName, 'ნინო ბერიძე')
  assert.equal(b.price, '80₾')
  assert.equal(q.price, '450₾')
  // A booking has a scheduled instant; a quote does not, and does not pretend.
  assert.ok(b.when instanceof Date)
  assert.equal(q.when, null)
  // …but it still sorts on something, and that something is documented.
  assert.equal(q.sortAt, Date.parse(quote().updatedAt as string))
  assert.equal(b.sortAt, (b.when as Date).getTime())

  // Purity: same input, same output, and the input is not mutated.
  const input = booking()
  const snapshot = JSON.stringify(input)
  assert.deepEqual(bookingJobRow(input, NOW), bookingJobRow(booking(), NOW))
  assert.equal(JSON.stringify(input), snapshot)
})

test('a quote reads „-დან" and a call-out the way the offer card does', () => {
  assert.equal(quoteJobRow(quote({ priceKind: 'FROM' })).price, '450₾-დან')
  assert.match(quoteJobRow(quote({ priceKind: 'ON_SITE' })).price, /სამუშაო ადგილზე/)
})

/* ═══════════ 2. the buckets ═════════════════════════════════════════════ */

test('bookings keep their existing status vocabulary and bucket by it', () => {
  // The vocabulary is the booking's own — this list adopts it, never renames it.
  assert.deepEqual(Object.keys(BOOKING_JOB_STATUS_LABEL).sort(),
    ['CANCELED', 'COMPLETED', 'CONFIRMED', 'LIVE', 'NO_SHOW', 'PREPARING'])
  // …and the words are the ones components/StatusPill prints.
  const pill = read('components/StatusPill.tsx')
  for (const label of Object.values(BOOKING_JOB_STATUS_LABEL)) {
    assert.ok(pill.includes(`'${label}'`), `StatusPill and the row disagree on „${label}"`)
  }

  const at = (over: Partial<BookingJobInput>) => bookingJobRow(booking(over), NOW).bucket
  assert.equal(at({ status: 'PREPARING' }), 'attention')
  assert.equal(at({ status: 'CONFIRMED' }), 'active')
  assert.equal(at({ status: 'LIVE', startAt: new Date(NOW - 10 * 60_000).toISOString() }), 'active')
  assert.equal(at({ status: 'COMPLETED' }), 'history')
  assert.equal(at({ status: 'CANCELED' }), 'history')
  assert.equal(at({ status: 'NO_SHOW' }), 'history')
  // Past its own end while still confirmed = the expert owes a decision.
  assert.equal(at({ status: 'CONFIRMED', startAt: new Date(NOW - 4 * HOUR).toISOString() }), 'attention')
  // A client-proposed reschedule is an unanswered question, whatever the status.
  assert.equal(at({ status: 'CONFIRMED', rescheduleRequest: { proposedBy: 'STUDENT' } }), 'attention')
  assert.equal(at({ status: 'CONFIRMED', rescheduleRequest: { proposedBy: 'TUTOR' } }), 'active')

  // The active set is the SHARED one, not a second copy.
  assert.deepEqual([...UPCOMING_STATUSES].sort(), ['CONFIRMED', 'LIVE', 'PREPARING'])
})

test('quote statuses map ACCEPTED → მიმდინარე, doneAt → დასრულებული, closedAt → დაიხურა', () => {
  const day = new Date(NOW).toISOString()
  assert.equal(quoteJobStatus({ doneAt: null, closedAt: null }), 'ACTIVE')
  assert.equal(quoteJobStatus({ doneAt: day, closedAt: null }), 'DONE')
  assert.equal(quoteJobStatus({ doneAt: null, closedAt: day }), 'CLOSED')
  // BOTH set — a client who came back on day 25 and said it finished. „done"
  // is the truer sentence about that job, so it outranks the silent close.
  assert.equal(quoteJobStatus({ doneAt: day, closedAt: day }), 'DONE')

  assert.deepEqual(QUOTE_JOB_STATUS_LABEL, {
    ACTIVE: 'მიმდინარე', DONE: 'დასრულებული', CLOSED: 'დაიხურა',
  })
  assert.equal(quoteJobRow(quote()).statusLabel, 'მიმდინარე')
  assert.equal(quoteJobRow(quote({ doneAt: day })).statusLabel, 'დასრულებული')
  assert.equal(quoteJobRow(quote({ closedAt: day })).statusLabel, 'დაიხურა')

  assert.equal(quoteJobRow(quote()).bucket, 'active')
  assert.equal(quoteJobRow(quote({ doneAt: day })).bucket, 'history')
  assert.equal(quoteJobRow(quote({ closedAt: day })).bucket, 'history')
})

/* ═══════════ 3. masking ═════════════════════════════════════════════════ */

test('the peer name obeys the contact seal — open on ACCEPTED, „კლიენტი" otherwise', () => {
  // An ACCEPTED offer is exactly the case lib/requestChat opens the contact
  // for, and lib/requests → clientContactFor is the function that decides it.
  assert.equal(contactIsOpen({ status: 'ACCEPTED' }), true)
  for (const s of ['SENT', 'INVITED', 'DECLINED', 'WITHDRAWN']) {
    assert.equal(contactIsOpen({ status: s }), false, `${s} opened the contact`)
  }
  assert.equal(quotePeerName({ status: 'ACCEPTED', contactName: 'გიორგი ხმალაძე' }), 'გიორგი ხმალაძე')
  assert.equal(quotePeerName({ status: 'SENT', contactName: 'გიორგი ხმალაძე' }), CLIENT_FALLBACK)
  assert.equal(quotePeerName({ status: 'ACCEPTED', contactName: null }), CLIENT_FALLBACK)
  assert.equal(quotePeerName({ status: 'ACCEPTED', contactName: '   ' }), CLIENT_FALLBACK)
  assert.equal(CLIENT_FALLBACK, 'კლიენტი')
  // The rule is asked, never copied: jobRows holds no second `=== 'ACCEPTED'`
  // seal of its own.
  const src = codeOf('lib/jobRows.ts')
  assert.match(src, /clientContactFor\(/, 'lib/jobRows stopped asking clientContactFor')
})

test('the list query selects no phone, no e-mail and no base64 column', () => {
  const page = codeOf('app/work/jobs/page.tsx')
  for (const field of ['phone', 'email', 'avatarUrl', 'photo', 'adminNote']) {
    assert.doesNotMatch(page, new RegExp(`\\b${field}:\\s*true`), `the jobs query selects ${field}`)
  }
  // …and nothing anywhere on the screen prints one.
  for (const f of ['app/work/jobs/page.tsx', 'app/work/jobs/_client.tsx', 'lib/jobRows.ts']) {
    assert.doesNotMatch(codeOf(f), /tel:|\.phone\b/, `${f} reaches for a phone number`)
  }
  // Only ACCEPTED QUOTE rows are work — a bid and a conversation are not.
  assert.match(page, /status: 'ACCEPTED'/)
  assert.match(page, /kind: 'QUOTE'/)
})

/* ═══════════ 4. the order, and the fallback ═════════════════════════════ */

test('dated rows sort on their time; undated rows sit apart, newest movement first', () => {
  const rows: JobRow[] = [
    quoteJobRow(quote({ id: 'qOld', updatedAt: new Date(NOW - 5 * HOUR).toISOString() })),
    bookingJobRow(booking({ id: 'bLate', startAt: new Date(NOW + 9 * HOUR).toISOString() }), NOW),
    quoteJobRow(quote({ id: 'qNew', updatedAt: new Date(NOW - 1 * HOUR).toISOString() })),
    bookingJobRow(booking({ id: 'bSoon', startAt: new Date(NOW + 2 * HOUR).toISOString() }), NOW),
  ]

  // ASC — work still ahead: soonest first, then the undated tail.
  assert.deepEqual(sortJobRows(rows, 'ASC').map(r => r.id), ['bSoon', 'bLate', 'qNew', 'qOld'])
  // DESC — history: most recent first, and the undated tail keeps its OWN
  // order (newest movement first) rather than flipping with the dated half.
  assert.deepEqual(sortJobRows(rows, 'DESC').map(r => r.id), ['bLate', 'bSoon', 'qNew', 'qOld'])

  // ⚠️ THE FALLBACK IS A SEGREGATION, NOT AN INTERLEAVE. A quote never lands
  // between two bookings by borrowing `updatedAt` as if it were a slot.
  for (const order of ['ASC', 'DESC'] as const) {
    const kinds = sortJobRows(rows, order).map(r => r.kind)
    assert.equal(kinds.lastIndexOf('BOOKING') < kinds.indexOf('QUOTE'), true,
      'an undated row was interleaved with the dated ones')
  }

  const { dated, undated } = splitDated(rows)
  assert.deepEqual(dated.map(r => r.id), ['bLate', 'bSoon'])
  assert.deepEqual(undated.map(r => r.id), ['qOld', 'qNew'])
  assert.equal(UNDATED_LABEL, 'თარიღის გარეშე')
  assert.equal(jobDayKey(undated[0]), null)
  // Day keys are Tbilisi's, from lib/bookings — never the machine's zone.
  // `bLate` is 21:00 UTC, i.e. 01:00 on the NEXT day in Tbilisi (UTC+4): the
  // whole reason this list may not group on the viewer's midnight.
  assert.equal(jobDayKey(dated[0]), '2026-08-20')
  assert.equal(jobDayKey(dated[1]), '2026-08-19')
})

test('buildJobRows mixes both kinds into three ordered buckets, in one call', () => {
  const day = new Date(NOW).toISOString()
  const out = buildJobRows({
    bookings: [
      booking({ id: 'bPrep', status: 'PREPARING', startAt: new Date(NOW + 30 * HOUR).toISOString() }),
      booking({ id: 'bNext', status: 'CONFIRMED', startAt: new Date(NOW + HOUR).toISOString() }),
      booking({ id: 'bDone', status: 'COMPLETED', startAt: new Date(NOW - 30 * HOUR).toISOString() }),
    ],
    quotes: [
      quote({ id: 'qLive' }),
      quote({ id: 'qDone', doneAt: day, updatedAt: day }),
    ],
  }, NOW)

  assert.deepEqual(Object.keys(out).sort(), ['active', 'attention', 'history'])
  assert.deepEqual(out.attention.map(r => r.id), ['bPrep'])
  // BOTH KINDS ARE REACHABLE FROM ONE LIST — that is the whole feature.
  assert.deepEqual(out.active.map(r => r.id), ['bNext', 'qLive'])
  assert.deepEqual(out.history.map(r => r.id), ['bDone', 'qDone'])
  assert.deepEqual(out.active.map(r => r.kind), ['BOOKING', 'QUOTE'])
  // A quote is never „attention": nothing in this list waits on the provider
  // pressing a button on it (the done/close clock is the client's).
  assert.equal(out.attention.every(r => r.kind === 'BOOKING'), true)

  // Empty input is an empty list, not a crash.
  assert.deepEqual(buildJobRows({}, NOW), { attention: [], active: [], history: [] })
})

/* ═══════════ 5. what moved, and what did not ═══════════════════════════ */

const ORIGIN = 'https://mcodne.ge'
const hit = (p: string) => middleware(new NextRequest(`${ORIGIN}${p}`))

test('/work/bookings 308s to /work/jobs — and the DETAIL page does not move', () => {
  assert.equal(hit('/work/bookings').status, 308)
  assert.equal(hit('/work/bookings').headers.get('location'), `${ORIGIN}/work/jobs`)
  // The trailing-slash form lands on the same page; NextURL carries the slash
  // through and Next's own normaliser drops it, so pin the path, not the byte.
  const slashed = hit('/work/bookings/')
  assert.equal(slashed.status, 308)
  assert.match(slashed.headers.get('location') ?? '', new RegExp(`^${ORIGIN}/work/jobs/?$`))
  // The query string carries the intent of every old deep link.
  assert.equal(hit('/work/bookings?tab=attention').headers.get('location'),
    `${ORIGIN}/work/jobs?tab=attention`)

  // ⚠️ THE DETAIL ROUTE. A dozen notification hrefs and e-mails point at it.
  for (const p of ['/work/bookings/clx123', '/work/bookings/clx123#chat', '/work/bookings/clx123?reminder=soon']) {
    const r = hit(p)
    assert.equal(r.status, 200, `${p} was redirected (→ ${r.headers.get('location')})`)
    assert.equal(r.headers.get('location'), null)
  }
  // …nor is anything that merely starts with the letters.
  assert.equal(hit('/work/bookingsx').status, 200)
  // The new list itself is a final address: one hop, never two.
  assert.equal(hit('/work/jobs').status, 200)

  // The block may never grow a prefix test — that is what would eat the detail
  // page. Pinned on the source, not on the behaviour alone.
  const mw = read('middleware.ts')
  assert.doesNotMatch(mw, /startsWith\('\/work\/bookings/, 'the /work/bookings block became a prefix rule')
  assert.match(mw, /url\.pathname = '\/work\/jobs'/)
})

test('the list page is titled „სამუშაოები" and lives outside both guard groups', () => {
  const page = codeOf('app/work/jobs/page.tsx')
  assert.match(page, /title="სამუშაოები"/)
  assert.match(page, /export const dynamic = 'force-dynamic'/)
  // The union of the two halves — a person is not two people.
  assert.match(page, /caps\.includes\('CONSULT'\)/, 'the consultation half is not detected')
  assert.match(page, /providersOn\(\)/, 'the job half ignores the supply-side switch')
  assert.match(page, /requestsViewer\(\)/, 'the job half derives a provider from something other than the viewer')
  assert.match(page, /redirect\('\/me'\)/, 'somebody with neither half is shown an empty workspace')
  // …and the old list page is gone rather than left as dead code.
  assert.throws(() => read('app/work/(expert)/bookings/page.tsx'))
  // The detail page it replaced the list of is still there.
  assert.ok(read('app/work/(expert)/bookings/[id]/page.tsx').length > 0)
})

test('the screen shows both kinds and two distinct empty states', () => {
  const client = codeOf('app/work/jobs/_client.tsx')
  assert.match(client, /buildJobRows\(/, 'the screen builds its rows some other way')
  assert.match(client, /UNDATED_LABEL/, 'the undated tail lost its heading')
  // Two empty states, and they say different things.
  assert.match(client, /ჯერ სამუშაო არ გაქვს/, 'the „no work yet" empty state is gone')
  assert.match(client, /ამ ფილტრში არაფერია/, 'the „nothing in this filter" empty state is gone')
  assert.match(client, /<EmptyState/, 'the empty states are hand-built again')
  assert.match(client, /total === 0 \?/, 'the two empty states are no longer distinguished')
  // Old ?tab= links still land somewhere sensible.
  assert.match(client, /LEGACY_TAB/)
  // The tab writes the NEW address.
  assert.match(client, /\/work\/jobs\?tab=/)
  assert.doesNotMatch(client, /'\/work\/bookings'/, 'the screen still links to the retired list')
})
