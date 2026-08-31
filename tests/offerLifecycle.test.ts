// AFTER THE CHOICE — lib/offerLifecycle and the routes/screens that use it
// (stage 7a, 2026-08-19).
//
// Run: npx tsx tests/offerLifecycle.test.ts   (also in `npm run check`)
//
// The pure rules are executed; the routes, the cron and the screens are read as
// SOURCE TEXT with comments stripped (the files quote their own code while
// explaining it — see tests/requests.test.ts → codeOf).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
  DONE_REMINDER_DAYS, DONE_CLOSE_DAYS, REVIEW_BODY_MAX,
  canMarkDone, markDoneWhere, canWithdraw, withdrawWhere,
  reviewGate, ReviewInput, reminderDue, closeDue,
} from '../lib/offerLifecycle'
import { OFFER_EVENTS, OFFER_EVENT_LABEL, BILLABLE_EVENTS } from '../lib/offerEvents'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*(\/\/|--)/.test(l) && !/^import\b/.test(l))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
/** Every file in a route DIRECTORY, concatenated — never one filename. */
const dirOf = (d: string): string => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e)) out.push(codeOf(relative(ROOT, p)))
    }
  }
  walk(join(ROOT, d))
  return out.join('\n')
}

const OFFERS_API = 'app/api/requests/[ref]/offers/[offerId]'
const DONE = `${OFFERS_API}/done/route.ts`
const REVIEW = `${OFFERS_API}/review/route.ts`
const WITHDRAW = `${OFFERS_API}/withdraw/route.ts`
const CRON = 'app/api/internal/cleanup/route.ts'
const LIB = 'lib/offerLifecycle.ts'

const DAY = 86_400_000
const t0 = Date.parse('2026-08-01T10:00:00Z')

/* ═══════════ A. the pure rules ══════════════════════════════════════════ */

test('§A done: an ACCEPTED QUOTE offer, once — the claim carries doneAt: null', () => {
  const open = { status: 'ACCEPTED', kind: 'QUOTE', doneAt: null, closedAt: null }
  assert.equal(canMarkDone(open), true)
  assert.equal(canMarkDone({ ...open, doneAt: new Date() }), false, 'a done offer can be done again')
  assert.equal(canMarkDone({ ...open, status: 'SENT' }), false, 'an unaccepted offer can be marked done')
  assert.equal(canMarkDone({ ...open, status: 'DECLINED' }), false)
  assert.equal(canMarkDone({ ...open, kind: 'BOOKING' }), false, 'a BOOKING offer is marked done here — that is the booking\'s job')
  // A late „დასრულდა" after the silent close is still the truth, and the
  // review that follows is worth having.
  assert.equal(canMarkDone({ ...open, closedAt: new Date() }), true)

  // THE CLAIM SHAPE — what the route's updateMany is written with.
  assert.deepEqual(markDoneWhere('o1'), { id: 'o1', status: 'ACCEPTED', kind: 'QUOTE', doneAt: null })
})

test('§A withdraw: only a SENT offer, and only by the provider in the where', () => {
  assert.equal(canWithdraw({ status: 'SENT' }), true)
  for (const s of ['INVITED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']) {
    assert.equal(canWithdraw({ status: s }), false, `${s} can be withdrawn`)
  }
  assert.deepEqual(
    withdrawWhere('o1', { kind: 'EXPERT', userId: 'u1', companyId: null }),
    { id: 'o1', status: 'SENT', expertUserId: 'u1' },
  )
  assert.deepEqual(
    withdrawWhere('o1', { kind: 'COMPANY', userId: 'u1', companyId: 'c1' }),
    { id: 'o1', status: 'SENT', companyId: 'c1' },
    'a company member withdraws AS the company, not as themselves',
  )
})

test('§A review: only after done, once, by somebody with an account', () => {
  assert.equal(reviewGate({ doneAt: null, reviewed: false, authorUserId: 'u1' }), 'NOT_DONE')
  assert.equal(reviewGate({ doneAt: new Date(), reviewed: true, authorUserId: 'u1' }), 'ALREADY_REVIEWED')
  assert.equal(reviewGate({ doneAt: new Date(), reviewed: false, authorUserId: null }), 'NO_ACCOUNT')
  assert.equal(reviewGate({ doneAt: new Date(), reviewed: false, authorUserId: 'u1' }), 'OK')

  // The body: whole stars 1..5, one short paragraph, empty allowed.
  assert.equal(ReviewInput.safeParse({ rating: 5, body: 'კარგი' }).success, true)
  assert.equal(ReviewInput.safeParse({ rating: 3 }).success, true, 'stars alone are a review')
  assert.equal(ReviewInput.safeParse({ rating: 0, body: '' }).success, false)
  assert.equal(ReviewInput.safeParse({ rating: 6, body: '' }).success, false)
  assert.equal(ReviewInput.safeParse({ rating: 4.5, body: '' }).success, false, 'half stars')
  assert.equal(ReviewInput.safeParse({ rating: 4, body: 'x'.repeat(REVIEW_BODY_MAX) }).success, true)
  assert.equal(ReviewInput.safeParse({ rating: 4, body: 'x'.repeat(REVIEW_BODY_MAX + 1) }).success, false)
  assert.equal(REVIEW_BODY_MAX, 300)
})

test('§A the clock: ONE reminder at 14 days, the silent close at 21', () => {
  assert.equal(DONE_REMINDER_DAYS, 14)
  assert.equal(DONE_CLOSE_DAYS, 21)
  const row = { status: 'ACCEPTED', kind: 'QUOTE', acceptedAt: t0, doneAt: null, closedAt: null, reminded: false }

  assert.equal(reminderDue(row, t0 + 13 * DAY), false)
  assert.equal(reminderDue(row, t0 + 14 * DAY), true)
  assert.equal(reminderDue({ ...row, reminded: true }, t0 + 30 * DAY), false, 'reminded twice')
  assert.equal(reminderDue({ ...row, doneAt: new Date(t0) }, t0 + 30 * DAY), false, 'a finished job is nagged')
  assert.equal(reminderDue({ ...row, closedAt: new Date(t0) }, t0 + 30 * DAY), false)
  assert.equal(reminderDue({ ...row, kind: 'BOOKING' }, t0 + 30 * DAY), false)

  assert.equal(closeDue(row, t0 + 20 * DAY), false)
  assert.equal(closeDue(row, t0 + 21 * DAY), true)
  assert.equal(closeDue({ ...row, doneAt: new Date(t0) }, t0 + 30 * DAY), false, 'a finished job is closed as unfinished')
  assert.equal(closeDue({ ...row, closedAt: new Date(t0) }, t0 + 30 * DAY), false, 'closed twice')
  // The close does not wait for the reminder — a row the reminder skipped
  // (no email) still closes.
  assert.equal(closeDue({ ...row, reminded: false }, t0 + 21 * DAY), true)
})

test('§A the journal knows the new events and none of them is billable', () => {
  for (const e of ['WITHDRAWN', 'DONE', 'REMINDED', 'CLOSED'] as const) {
    assert.ok((OFFER_EVENTS as readonly string[]).includes(e), `${e} is not an offer event`)
    assert.ok(OFFER_EVENT_LABEL[e], `${e} has no label`)
    assert.ok(!(BILLABLE_EVENTS as readonly string[]).includes(e), `${e} became billable`)
  }
})

/* ═══════════ B. the routes ══════════════════════════════════════════════ */

test('§B every route sits behind the subsystem gate and answers 404, never 403', () => {
  for (const f of [DONE, REVIEW, WITHDRAW]) {
    const src = codeOf(f)
    assert.match(src, /await requestsViewer\(\)/, `${f} does not call the gate`)
    assert.match(src, /requestsNotFound\(\)/, `${f} does not answer with the shared 404`)
    assert.doesNotMatch(src, /status:\s*403/, `${f} answers 403 — that confirms the subsystem exists`)
    assert.doesNotMatch(src, /redirect\(/, `${f} redirects — same leak`)
  }
  // Client-side routes gate on the client flag; the provider's on the provider flag.
  assert.match(codeOf(DONE), /if\s+\(!viewer\.clientAllowed\)\s+return\s+requestsNotFound\(\)/)
  assert.match(codeOf(REVIEW), /if\s+\(!viewer\.clientAllowed\)\s+return\s+requestsNotFound\(\)/)
  assert.match(codeOf(WITHDRAW), /if\s+\(!viewer\.providerAllowed\)\s+return\s+requestsNotFound\(\)/)
  assert.match(codeOf(WITHDRAW), /if \(!provider\) return requestsNotFound\(\)/,
    'an admin with no allowlist row has no identity to withdraw as')
})

test('§B every state change is CLAIMED — updateMany + count !== 1 → 409, in the lib', () => {
  const lib = codeOf(LIB)
  // done
  assert.match(lib, /prisma\.requestOffer\.updateMany\(\{\s*where:\s+markDoneWhere\(offerId\)/)
  assert.match(lib, /if\s+\(claimed\.count\s+!==\s+1\)\s+return\s+\{\s+ok:\s+false,\s+error:\s+'ALREADY_DONE'\s+\}/)
  // withdraw — the provider is IN the where, and the place is given back guarded
  assert.match(lib, /where:\s+withdrawWhere\(offerId,\s+provider\),\s*data:\s+\{\s+status:\s+'WITHDRAWN'\s+\}/)
  assert.match(lib, /if\s+\(claimed\.count\s+!==\s+1\)\s+return\s+\{\s+ok:\s+false,\s+error:\s+'NOT_OPEN'\s+\}/)
  assert.match(lib, /offerCount:\s+\{\s+gt:\s+0\s+\}\s+\},\s*data:\s+\{\s+offerCount:\s+\{\s+decrement:\s+1\s+\}\s+\}/,
    'withdraw does not give the place back with the guarded decrement')
  // …and the routes turn a failed claim into 409, nothing else.
  assert.match(codeOf(DONE), /if\s+\(!r\.ok\)\s+return\s+NextResponse\.json\(\{\s+ok:\s+false,\s+error:\s+r\.error\s+\},\s+\{\s+status:\s+409\s+\}\)/)
  assert.match(codeOf(WITHDRAW), /if\s+\(!r\.ok\)\s+return\s+NextResponse\.json\(\{\s+ok:\s+false,\s+error:\s+r\.error\s+\},\s+\{\s+status:\s+409\s+\}\)/)
  // review: the gate is the honest answer, P2002 is the guard — both 409
  const review = codeOf(REVIEW)
  assert.match(review, /if\s+\(gate\s+!==\s+'OK'\)\s+return\s+NextResponse\.json\(\{\s+ok:\s+false,\s+error:\s+gate\s+\},\s+\{\s+status:\s+409\s+\}\)/)
  assert.match(review, /P2002[\s\S]{0,120}ALREADY_REVIEWED[\s\S]{0,40}status: 409/)
  // no read-then-write in any of the three: nothing decides on a status it read
  for (const f of [DONE, WITHDRAW]) {
    assert.doesNotMatch(codeOf(f), /\.status === 'ACCEPTED'|\.status === 'SENT'/, `${f} decides on a status it read`)
  }
})

test('§B who may call what: client by reference, provider by session, never a ref for the provider', () => {
  const done = codeOf(DONE)
  // The client: the reference must be THIS offer's request.
  assert.match(done, /normalizePublicRef\(raw\)/)
  assert.match(done, /ref\s+===\s+offer\.request\.publicRef\)\s+by\s+=\s+'CLIENT'/)
  // The provider: the session owns the offer — same ownership test as request-chat.
  assert.match(done, /offer\.expertUserId === p\.userId : offer\.companyId === p\.companyId/)
  assert.match(done, /if \(owns\) by = 'PROVIDER'/)
  // The review is CLIENT ONLY: the ref is in the where, and the author is the request's user.
  const review = codeOf(REVIEW)
  assert.match(review, /where:\s+\{\s+id:\s+offerId,\s+request:\s+\{\s+publicRef:\s+ref\s+\}\s+\}/)
  assert.match(review, /studentId: offer\.request\.userId!/)
  // ⚠️ THIS LINE REQUIRED `tutorId: null` UNTIL 2026-08-26, AND THE COLUMN WAS
  // DROPPED ON 2026-08-24. So the create threw PrismaClientValidationError,
  // nobody could review a finished job, and this file stayed green BECAUSE the
  // dead write was still there. A review hangs on the OFFER now — `offerId` is
  // the unique key the P2002 branch below is catching.
  assert.match(review, /offerId: offer\.id/)
  assert.doesNotMatch(review, /tutorId/, 'the review writes a column the database dropped — the create throws')
  // The withdraw route never reads the ref — a provider must never need it.
  const withdraw = codeOf(WITHDRAW)
  assert.doesNotMatch(withdraw, /normalizePublicRef|publicRef/, 'the withdraw route reads the client\'s credential')
  // No route prints the reference into a provider-facing notification.
  const bell = done.slice(done.indexOf('notifyMany(ids'), done.indexOf('offerDoneProviderEmail('))
  assert.ok(bell.length > 0)
  assert.doesNotMatch(bell, /publicRef/, 'the done bell carries the client\'s credential')
  // Provider hrefs come from PROVIDER_ROUTE, never a typed path.
  assert.match(done, /href: `\$\{PROVIDER_ROUTE\}\/offers`/)
  assert.match(review, /href: `\$\{PROVIDER_ROUTE\}\/offers`/)
})

/* ═══════════ C. the cron ════════════════════════════════════════════════ */

test('§C two phases, both claim-style: the REMINDED row is the reminder\'s claim, closedAt: null the close\'s', () => {
  const lib = codeOf(LIB)
  const jobs = lib.slice(lib.indexOf('export async function runOfferLifecycleJobs'))
  // Phase 1: the marker row is written FIRST and `first === false` sends nothing.
  const remind = jobs.indexOf("recordOfferEvent(r.id, 'REMINDED')")
  assert.ok(remind > 0, 'the reminder is not marked by an OfferEvent row')
  assert.match(jobs, /const\s+rec\s+=\s+await\s+recordOfferEvent\(r\.id,\s+'REMINDED'\)\s*if\s+\(!rec\.ok\s+\|\|\s+!rec\.first\)\s+continue/)
  const send = jobs.indexOf('send.remindClient')
  assert.ok(send > remind, 'the client is mailed before the reminder is claimed — a crash mid-send mails every tick')
  assert.ok(jobs.indexOf('send.remindProvider') > remind)
  // The candidate query excludes already-reminded rows at the database, too.
  assert.match(jobs, /events: \{ none: \{ type: 'REMINDED' \} \}/)
  // Phase 2: the close is a conditional write on the columns that make it once.
  assert.match(jobs, /where:\s+\{\s+id:\s+r\.id,\s+status:\s+'ACCEPTED',\s+doneAt:\s+null,\s+closedAt:\s+null\s+\},\s*data:\s+\{\s+closedAt:\s+new\s+Date\(now\)\s+\}/)
  assert.match(jobs, /if \(claimed\.count !== 1\) continue/)
  // Neither phase touches status — closing is a stamp, not a transition.
  assert.doesNotMatch(jobs, /data: \{ status:/, 'the cron changes an offer\'s status')
  // Both phases re-check the pure predicate against the loaded row.
  assert.match(jobs, /if\s+\(!reminderDue\(rowOf\(r\),\s+now\)\)\s+continue/)
  assert.match(jobs, /if \(!closeDue\(rowOf\(r\), now\)\) continue/)
})

test('§C the cleanup route runs it under the flag and reports it', () => {
  const cron = codeOf(CRON)
  assert.match(cron, /requestsOn\(\)\s*\?\s+await\s+runOfferLifecycleJobs\(now\.getTime\(\)/)
  assert.match(cron, /offers: offerJobs,/)
  // The client is mailed the reminder template; the provider gets a typed bell
  // with the topic and PROVIDER_ROUTE — never the reference.
  assert.match(cron, /offerDoneReminderClientEmail\(\{\s+publicRef:\s+o\.publicRef,\s+topicLabel:\s+topicLabel\(o\.topic\)\s+\}\)/)
  const bell = cron.slice(cron.indexOf('remindProvider'), cron.indexOf('remindProvider') + 600)
  assert.match(bell, /type: 'REQUEST_DONE'/)
  assert.match(bell, /href: `\$\{PROVIDER_ROUTE\}\/offers`/)
  assert.doesNotMatch(bell, /publicRef/)
  // The GET description lists the job.
  assert.match(read(CRON), /Requests: remind ONCE about an ACCEPTED offer/)
})

/* ═══════════ D. notifications typed (D10 / D12) ═════════════════════════ */

test('§D the requests subsystem has typed notifications, always delivered', () => {
  const notify = read('lib/notify.ts')
  for (const t of ['REQUEST_NEW', 'REQUEST_INVITE', 'REQUEST_MESSAGE', 'REQUEST_DONE']) {
    assert.match(notify, new RegExp(`\\| '${t}'`), `${t} is not a NotifType`)
    // Not pref-gated: none maps to a PrefKey.
    assert.doesNotMatch(notify, new RegExp(`if \\(t === '${t}'\\) return`), `${t} is pref-gated`)
  }
  // D10: a new request pings every admin, like APPLICATION_NEW.
  const create = codeOf('app/api/requests/route.ts')
  assert.match(create, /where: \{ role: ROLE\.ADMIN \}/, 'admins are found by the raw string, not ROLE.ADMIN')
  assert.match(create, /type: 'REQUEST_NEW',[\s\S]{0,200}href: '\/admin#requests'/)
  // D12: the two GENERIC sends are typed now.
  // ⚠️ THE INVITE'S SEND MOVED INTO lib/requestInvite (2026-08-19) — one
  // definition, two callers (the room's button and the intake's `?to=`). The
  // assertion follows the code rather than the route that used to hold it.
  assert.match(codeOf('lib/requestInvite.ts'), /type: 'REQUEST_INVITE'/)
  assert.match(codeOf('app/api/request-chat/route.ts'), /type: 'REQUEST_MESSAGE'/)
  assert.doesNotMatch(codeOf('lib/requestInvite.ts'), /type: 'GENERIC'/)
  // The bell's label table knows them (a raw code never reaches a screen).
  // ⚠️ THE TABLE MOVED WITH THE SPLIT (2026-08-30): /notifications is a server
  // page now — it resolves the viewer so the header is never half-drawn — and
  // the list, with its label table, is app/notifications/client.tsx.
  const labels = read('app/notifications/client.tsx')
  for (const t of ['REQUEST_NEW', 'REQUEST_INVITE', 'REQUEST_MESSAGE', 'REQUEST_DONE']) {
    assert.match(labels, new RegExp(`${t}:\\s*\\{ l: '`), `${t} has no bell label`)
  }
})

/* ═══════════ E. the screens ═════════════════════════════════════════════ */

test('§E the client\'s page: „დასრულდა" on the accepted offer, then ★, then read-only', () => {
  const dir = dirOf('app/request/[ref]')
  // The page feeds the lifecycle state without widening clientOfferView.
  assert.match(dir, /kind:\s+true,\s+doneAt:\s+true,\s*review:\s+\{\s+select:\s+\{\s+rating:\s+true,\s+body:\s+true\s+\}\s+\}/)
  assert.match(dir, /clientOfferView\(\{/, 'the contact rule still comes from lib/requests → clientOfferView')
  assert.match(dir, /canReview=\{request\.userId !== null\}/)
  // The button, secondary, on the ACCEPTED QUOTE offer that is not done.
  assert.match(dir, /accepted\s+&&\s+o\.kind\s+===\s+'QUOTE'\s+&&\s+!o\.doneAt\s+&&\s+\([\s\S]{0,200}variant="secondary"[\s\S]{0,300}'დასრულდა'/)
  assert.match(dir, /\/api\/requests\/\$\{publicRef\}\/offers\/\$\{id\}\/done/)
  // The picker after done, only with an account; the stars after the review.
  assert.match(dir, /accepted\s+&&\s+o\.doneAt\s+&&\s+!o\.review\s+&&\s+canReview\s+&&\s+\(\s*<ReviewForm/)
  assert.match(dir, /accepted\s+&&\s+o\.review\s+&&\s+\([\s\S]{0,200}<Stars\s+n=\{o\.review\.rating\}/)
  assert.match(dir, /\/api\/requests\/\$\{publicRef\}\/offers\/\$\{offerId\}\/review/)
  // The picker: five 40×40 star buttons (the lesson review's row), one textarea
  // capped at the lib's ceiling.
  assert.match(dir, /\[1, 2, 3, 4, 5\]\.map\(n => \(\s*<button/)
  assert.match(dir, /(w-10 h-10|size-10)/, 'the control fell below the 40px tap floor')
  assert.match(dir, /maxLength=\{REVIEW_BODY_MAX\}/)
  // The done/review 409s read as „out of date", like accept's.
  assert.match(dir, /case 'ALREADY_DONE':\s*case 'ALREADY_REVIEWED':/)
})

test('§E the thanks screen no longer forbids a „my requests" list', () => {
  const thanks = read('app/request/_thanks.tsx')
  assert.doesNotMatch(thanks, /must not start to/, 'the old sentence is still there')
  assert.doesNotMatch(thanks, /NEITHER LINE PROMISES A LIST/)
})

test('§E the master profile lists real reviews through the offer, and never a photo column', () => {
  const data = read('app/experts/[slug]/_providerData.ts')
  const code = codeOf('app/experts/[slug]/_providerData.ts')
  // Review → RequestOffer → the profile's user or company.
  assert.match(code, /prisma\.review\.findMany\(\{\s*where:\s+\{\s+offer:\s+providerWhere\s+\}/)
  assert.match(code, /\{ companyId: row\.companyId \}/)
  assert.match(code, /\{ expertUserId: row\.userId \}/)
  assert.match(code, /orderBy: \{ createdAt: 'desc' \}/)
  assert.match(code, /select:\s+\{\s+id:\s+true,\s+rating:\s+true,\s+body:\s+true,\s+createdAt:\s+true\s+\}/)
  // Nothing about the reviewer, and no blob anywhere in the file.
  assert.doesNotMatch(code, /student:|studentId:\s+true|fullName:\s+true,\s+tutor:\s+\{\s+select:\s+\{\s+slug:\s+true\s+\}\s+\}\s+\},\s*company:\s+\{\s+select:\s+\{\s+name:\s+true\s+\}\s+\},\s*photo/)
  // ⚠️ ON THE STRIPPED SOURCE, and it was `data` (raw) until 2026-08-24. The
  // file now carries a long note explaining why `User.avatarUrl` — the FALLBACK
  // portrait for a migrated professional — is asked for by shape rather than
  // selected, and that explanation must stay readable without failing the very
  // pin it documents. Same trap, opposite direction, as the `codeOf` note above:
  // there a comment SATISFIED a positive assertion; here one FAILED a negative.
  assert.doesNotMatch(code, /photoUrl:\s*true|workPhotos:\s*true|avatarUrl/, 'a base64 column in the profile query')
  // …and the fallback goes through the route builder, never the stored value.
  assert.match(code, /avatarRouteSrc\(/, 'the account-avatar fallback bypasses lib/avatarSrc')
  // The model stays a leaf.
  assert.doesNotMatch(data, /from '\.\//)
  // Average + count, one decimal, null when none.
  assert.match(code, /ratingAvg = reviewCount\s*\? Math\.round\(/)
  // The block draws the list, keeps the honest empty state, formats in Tbilisi time.
  const blocks = read('app/experts/[slug]/_providerBlocks.tsx')
  // ⚠️ THE EMPTY STATE WAS REMOVED (2026-08-20), not lost. Measured that day:
  // 0 reviews on the whole site, so every provider profile drew a heading, a
  // bordered box and an icon to announce an absence — three elements saying
  // „unfinished" on the one page whose job is to make somebody trustworthy.
  // An empty state earns its place when the reader can FILL it; nobody can
  // review a provider they have not hired. What is pinned now is the ABSENCE
  // of the section, plus the two properties that always mattered: reviews come
  // through the offer, and no photo column is ever selected.
  assert.match(blocks, /if \(p\.reviews\.length === 0\) return null/)
  assert.match(blocks, /p\.reviews\.map\(r => \(/)
  assert.match(blocks, /fmtDateTime\(r\.at,\s+\{\s+day:\s+'numeric',\s+month:\s+'long',\s+year:\s+'numeric'\s+\},\s+TBILISI\)\.local/)
  assert.doesNotMatch(blocks, /toLocaleDateString|fmtKaDate/)
  // The hero: ★ beside the name only when count > 0.
  const hero = read('app/experts/[slug]/_providerHero.tsx')
  assert.match(hero, /p\.reviewCount\s+>\s+0\s+&&\s+p\.ratingAvg\s+!==\s+null\s+&&\s+\(/)
  assert.match(hero, /p\.ratingAvg\.toFixed\(1\)/)
  assert.match(read('app/experts/[slug]/page.tsx'), /<ReviewsBlock p=\{p\} \/>/)
})
