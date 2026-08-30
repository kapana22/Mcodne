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
  buildJobRows, quoteJobRow, quoteJobStatus, quotePeerName,
  contactIsOpen, sortJobRows, splitDated, jobDayKey,
  CLIENT_FALLBACK, UNDATED_LABEL, QUOTE_JOB_STATUS_LABEL,
  type QuoteJobInput, type JobRow,
} from '../lib/jobRows'

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

test('the mapper is pure and produces ONE row shape', () => {
  // ⚠️ IT PRODUCED TWO KINDS UNTIL 2026-08-24 — a BOOKING (a scheduled instant,
  // a six-word status vocabulary, a detail page of its own) and a QUOTE. The
  // booking product went; the SHAPE stays two-kinded on purpose, because it is
  // what let a quote sit in this list at all.
  const q = quoteJobRow(quote())

  const KEYS = ['kind', 'id', 'href', 'title', 'peerName', 'when', 'status', 'statusLabel', 'price', 'sortAt', 'bucket']
  assert.deepEqual(Object.keys(q).sort(), [...KEYS].sort(), 'the row shape changed')

  assert.equal(q.kind, 'QUOTE')
  // A quote has no page of its own — it opens where an offer is viewable.
  assert.equal(q.href, '/work/offers')
  assert.equal(q.price, '450₾')
  // It has no scheduled instant, and does not pretend to.
  assert.equal(q.when, null)
  // …but it still sorts on something, and that something is documented.
  assert.equal(q.sortAt, Date.parse(quote().updatedAt as string))

  // Purity: same input, same output, and the input is not mutated.
  const input = quote()
  const snapshot = JSON.stringify(input)
  assert.deepEqual(quoteJobRow(input), quoteJobRow(quote()))
  assert.equal(JSON.stringify(input), snapshot)
})

test('a quote reads „-დან" and a call-out the way the offer card does', () => {
  assert.equal(quoteJobRow(quote({ priceKind: 'FROM' })).price, '450₾-დან')
  assert.match(quoteJobRow(quote({ priceKind: 'ON_SITE' })).price, /სამუშაო ადგილზე/)
})

/* ═══════════ 2. the buckets ═════════════════════════════════════════════ */

/* ⚠️ „bookings keep their existing status vocabulary and bucket by it" WAS HERE
   AND IS GONE (2026-08-24), with `BOOKING_JOB_STATUS_LABEL` — six words held in
   step with components/StatusPill — and the bucket rules that read a start
   time, a duration and a reschedule proposal. */

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
  // An ACCEPTED offer is exactly the case lib/requestChat stops masking for,
  // and lib/requests → clientIdentityOpen is the function that decides it.
  // (It was `clientContactFor` until 2026-08-21; the phone and the email left
  // the product that day and the seal now releases the NAME alone.)
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
  assert.match(src, /clientIdentityOpen\(/, 'lib/jobRows stopped asking the one seal')
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

test('undated rows sit apart, newest movement first', () => {
  const rows: JobRow[] = [
    quoteJobRow(quote({ id: 'qOld', updatedAt: new Date(NOW - 5 * HOUR).toISOString() })),
    quoteJobRow(quote({ id: 'qNew', updatedAt: new Date(NOW - 1 * HOUR).toISOString() })),
  ]

  // ⚠️ THE DATED HALF OF THIS TEST WENT WITH THE BOOKING (2026-08-24) — soonest
  // first for work ahead, most recent first for history, and the segregation
  // that kept a quote from landing between two bookings by borrowing
  // `updatedAt` as if it were a slot. The rule for UNDATED rows is unchanged,
  // and it is every row in this list now: newest movement first, in both
  // directions, because a quote has no time to sort on.
  for (const order of ['ASC', 'DESC'] as const) {
    assert.deepEqual(sortJobRows(rows, order).map(r => r.id), ['qNew', 'qOld'])
  }

  // `splitDated` is a FILTER, not a sort — it keeps the order it was handed.
  const { dated, undated } = splitDated(rows)
  assert.deepEqual(dated.map(r => r.id), [])
  assert.deepEqual(undated.map(r => r.id), ['qOld', 'qNew'])
  assert.equal(UNDATED_LABEL, 'თარიღის გარეშე')
  assert.equal(jobDayKey(undated[0]), null)
})

test('buildJobRows sorts into three buckets, in one call', () => {
  const day = new Date(NOW).toISOString()
  const out = buildJobRows({
    quotes: [
      quote({ id: 'qLive' }),
      quote({ id: 'qDone', doneAt: day, updatedAt: day }),
    ],
  }, NOW)

  assert.deepEqual(Object.keys(out).sort(), ['active', 'attention', 'history'])
  assert.deepEqual(out.active.map(r => r.id), ['qLive'])
  assert.deepEqual(out.history.map(r => r.id), ['qDone'])
  // A quote is never „attention": nothing in this list waits on the provider
  // pressing a button on it (the done/close clock is the client's).
  assert.deepEqual(out.attention, [])

  // Empty input is an empty list, not a crash.
  assert.deepEqual(buildJobRows({}, NOW), { attention: [], active: [], history: [] })
})

/* ═══════════ 5. what moved, and what did not ═══════════════════════════ */

const ORIGIN = 'https://mcodne.ge'
const hit = (p: string) => middleware(new NextRequest(`${ORIGIN}${p}`))

test('/work/bookings 308s to /work/jobs', () => {
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

  // ⚠️ THE DETAIL ROUTE USED TO SURVIVE THIS BLOCK — a dozen notification hrefs
  // pointed at /work/bookings/<id> — and it went with the booking on
  // 2026-08-24, so those links fall through to the redirect above and land on
  // the list. That is the honest destination: the thing they named is gone.
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
  assert.match(page, /providersOn\(\)/, 'the page ignores the supply-side switch')
  assert.match(page, /requestsViewer\(\)/, 'the page derives a provider from something other than the viewer')
  assert.match(page, /redirect\('\/me'\)/, 'somebody with no provider identity is shown an empty workspace')
  // …and the whole consultation route group is gone rather than left as dead code.
  assert.throws(() => read('app/work/(expert)/layout.tsx'))
})

test('the screen keeps its two distinct empty states', () => {
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
  /* ⚠️ THIS PAGE STOPPED WRITING THE ADDRESS (2026-08-29). It held its own
     three-tab bar and pushed `?tab=` back with `history.replaceState`; the bar
     is the workspace's now (app/work/_components/WorkTabs) and this page only
     READS the param, so the link is asserted where it is written. */
  assert.match(codeOf('app/work/_components/WorkTabs.tsx'), /\/work\/jobs\?tab=/,
    'the stage bar stopped linking to the jobs stages')
  assert.doesNotMatch(client, /replaceState/,
    'the jobs page writes the URL again — the stage bar owns which slice is open')
  assert.doesNotMatch(client, /'\/work\/bookings'/, 'the screen still links to the retired list')
})

/* ═══════════ the flow: four stages, one screen ═══════════════════════════ */

test('the pipeline is one screen with four stages, and each stage is reachable', () => {
  /* ⚠️ WHAT THIS PINS (2026-08-29). An open request, the offer sent for it and
   * the work won were THREE pages behind TWO rail rows, so a provider had to
   * remember which page a piece of work was sitting on. Owner, asked whether
   * they stay separate or become one flow: „ერთი ნაკადი გახდეს."
   *
   * ⚠️ IT IS NOT A ROUTE MERGE, and that is deliberate: each page keeps its own
   * address and its own gate, so who may see what did not change. What changed
   * is that one bar draws all four stages. Anything that re-splits the bar, or
   * drops a stage out of it, is the regression. */
  const bar = codeOf('app/work/_components/WorkTabs.tsx')
  for (const label of ['ახალი', 'გაგზავნილი', 'ხელში მაქვს', 'დასრულებული']) {
    assert.ok(bar.includes(label), `the stage „${label}" left the flow`)
  }
  // The two ends of the bar are the two addresses with their own guards; the
  // literal /work/offers is forbidden outside the requests family, so the bar
  // reaches it through the subsystem's own constant (tests/requests pins that).
  assert.match(bar, /PROVIDER_ROUTE\}\/requests/, 'the queue stage stopped pointing at the queue')
  assert.match(bar, /PROVIDER_ROUTE\}\/offers/, 'the sent stage stopped pointing at the offers page')
  assert.doesNotMatch(bar, /['"`]\/work\/offers/, 'the bar hard-codes the offers address')

  /* ⚠️ AND „გაგზავნილი" STAYS BEHIND `showOffers`. An expert the allowlist does
   * not name has no offers page — /work/(provider)/∗ answers 404 — so drawing
   * the stage for them would be a link to a 404 inside their own workspace. */
  assert.match(bar, /if \(!showOffers\) return null/,
    'the stage bar draws for somebody who cannot send an offer')

  // Every screen of the flow mounts the bar, or one of them is an island.
  for (const f of [
    'app/work/jobs/page.tsx',
    'app/work/(provider)/offers/page.tsx',
    'app/work/(provider)/requests/page.tsx',
  ]) {
    assert.match(codeOf(f), /<WorkTabs/, `${f} is outside the flow — it draws no stage bar`)
  }

  // One heading across the flow: three screens that call themselves three
  // different things are three products again.
  for (const f of ['app/work/jobs/page.tsx', 'app/work/(provider)/requests/page.tsx']) {
    assert.match(codeOf(f), /title="სამუშაოები"/, `${f} calls the flow something else`)
  }

  // The rail carries ONE row for it, and that row still lights up on all three.
  const nav = codeOf('components/tutor/navConfig.ts')
  assert.doesNotMatch(nav, /label: 'მოთხოვნები'/, 'the queue is a rail row again — it is a stage')
  assert.match(nav, /WORK_ONLY_NAV: NavItem\[\] = \[\]/,
    'a rail row depends on the allowlist again')
})
