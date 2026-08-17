/*
 * The requests subsystem — the hiding, the contact rule, and the place limit.
 *
 * Run with:  npx tsx tests/requests.test.ts
 *
 * WHY THIS FILE EXISTS. Three of this subsystem's properties are invisible when
 * broken. The build passes, the screens render, and the damage is discovered by
 * a person rather than by us:
 *
 *   · IT LEAKS. A route that renders instead of 404ing, a stray link in a nav
 *     array — nothing breaks, the feature is simply no longer hidden.
 *   · IT LEAKS THE CONTACT. A provider payload that carries a phone number
 *     looks exactly like one that does not, and giving the contact away IS
 *     giving the product away.
 *   · IT OVERSELLS. A fourth offer on a three-place request is one extra card
 *     on a page. Nobody notices until the provider who wrote it finds out.
 *
 * tests/b2b.test.ts and tests/abroad.test.ts make the same argument for their
 * own verticals at length; this file is their sibling.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  requestsOn, requestsVisibleTo, canSeeRequests, requestsFeatureExists,
  isRequestPath, REQUEST_PATH_PREFIXES,
  makePublicRef, normalizePublicRef, PUBLIC_REF_RE, REF_ALPHABET, REF_LENGTH,
  budgetIsBelowFloor, BUDGET_BANDS, REQUEST_KINDS, KIND, TIMING,
  isTopicOfKind, searchTopics, budgetLabel, TOPIC_GROUPS, groupsForKind,
  SUGGESTED_TOPICS, SUGGESTED_TOPIC_IDS,
  extrasFor, normalizeExtras, extrasLabels, templateFor, offerTemplateFor, timeAgoKa,
  offerProviderError, accessSubjectError,
  placesLeft, requestIsOpen,
  providerRequestView, clientOfferView, clientContactFor,
  ServiceRequestInput, RequestOfferInput, AdminRequestPatch,
  serviceRequestRow, topicLabel, REQUEST_STATIONS, stationsReached,
} from '../lib/requests'
import {
  threadIsOpen, threadClosedReason, staffIsOnline, PRESENCE_TTL_MS,
} from '../lib/requestThread'
import { answerLabel, EMPTY_DRAFT, type Draft } from '../app/request/_model'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/**
 * The file with its COMMENTS AND IMPORTS REMOVED.
 *
 * ⚠️ USE THIS FOR EVERY „X happens before Y" ASSERTION. The files in this
 * subsystem are heavily commented BY DESIGN and quote their own code while
 * explaining it — `canSeeRequests`, `updateMany`, `offerCount` and `404` all
 * appear in prose. A source-text assertion against the raw file is therefore
 * unusually easy to satisfy by accident, which is exactly how three assertions
 * in tests/b2b.test.ts were found to be vacuous. Strip first, then assert.
 *
 * Line comments come off BEFORE block comments, and the order is the whole
 * function: a `/*` inside a `//` line would otherwise open a block-comment
 * match that closes hundreds of lines later. (b2b.test.ts documents that exact
 * failure — it once destroyed 465 lines of a route.)
 *
 * SQL `--` COMMENTS COME OFF TOO, and that is not theoretical either: lib/dbBoot
 * ships its DDL inside JS template literals, and the comment above the
 * one-provider CHECK names `offerProviderError()` while explaining that the
 * function is the single place the rule is checked. A scan that kept SQL
 * comments reported that very sentence as a second call site — the prose
 * documenting an invariant failing the test that guards it.
 */
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*(\/\/|--)/.test(l) && !/^import\b/.test(l))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

/** Every .ts/.tsx file under the app's own source directories. */
function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d))
  return out
}

/* ═══════════ 1. the switch ═════════════════════════════════════════════ */

test('FEATURE_REQUESTS is off unless it says exactly „on"', () => {
  // Defaulting to OFF is the whole safety property: a deployment that never
  // heard of this variable ships the subsystem dark. Every one of these is a
  // value a human might actually type into a dashboard field.
  for (const v of [undefined, '', 'off', 'OFF', 'false', '0', 'no', 'true', '1', 'yes', 'onn', ' o n ']) {
    assert.equal(requestsOn(v), false, `„${String(v)}" was read as on`)
  }
  // …and the two forms of „on" that are the same answer typed by two people.
  for (const v of ['on', 'ON', ' On ', 'oN']) {
    assert.equal(requestsOn(v), true, `„${v}" was read as off`)
  }
})

test('the gate answers correctly in BOTH states, not just this one', () => {
  // Executed for real at on AND off, which is why requestsVisibleTo takes the
  // switch as an argument. A gate closed over process.env can only ever be
  // tested at whichever value the machine running the tests happens to have —
  // and this repository will spend most of its life with the variable unset,
  // so the on-branch would ship having never once run.
  const VIEWERS = [
    { label: 'admin',              v: { role: 'ADMIN' } },
    { label: 'admin + access',     v: { role: 'ADMIN', hasAccess: true } },
    { label: 'allowlisted tutor',  v: { role: 'TUTOR', hasAccess: true } },
    { label: 'plain tutor',        v: { role: 'TUTOR' } },
    { label: 'allowlisted client', v: { role: 'STUDENT', hasAccess: true } },
    { label: 'plain client',       v: { role: 'STUDENT' } },
    { label: 'signed out',         v: { role: null } },
    { label: 'nothing at all',     v: {} },
    // Case matters. Guards against a future `canSeeRequests(user.someField)`
    // typo passing silently.
    { label: 'lowercase admin',    v: { role: 'admin' } },
  ]
  //                    admin  a+acc  tutor+ tutor  client+ client  out  none  'admin'
  const WHEN_ON  = [    true,  true,  true,  false, true,   false,  false, false, false]
  const WHEN_OFF = [    false, false, false, false, false,  false,  false, false, false]

  VIEWERS.forEach((viewer, i) => {
    assert.equal(requestsVisibleTo(true, viewer.v), WHEN_ON[i], `on × ${viewer.label}`)
    // OFF BEATS EVERYTHING, ADMINS INCLUDED. „Off" that an admin can still see
    // is not off — and the admin is the person most likely to be testing, i.e.
    // the one person who could not verify the switch works.
    assert.equal(requestsVisibleTo(false, viewer.v), WHEN_OFF[i], `off × ${viewer.label}`)
  })

  // …and the wrapper the whole app actually calls is that function applied to
  // the environment, with nothing extra in between. Without this, the table
  // above could be describing a function nobody uses.
  for (const viewer of VIEWERS) {
    assert.equal(canSeeRequests(viewer.v), requestsVisibleTo(requestsOn(), viewer.v),
      'canSeeRequests has drifted from requestsVisibleTo — there are two gates now')
  }
  assert.equal(requestsFeatureExists(), requestsOn())
})

test('an allowlist row is the ONLY way in that is not being an admin', () => {
  // Stated as its own test because it is the decision most likely to be
  // „simplified" later: the obvious shortcut is „every approved expert can
  // bid". Those experts applied to be BOOKED. An empty allowlist can only ever
  // produce an empty audience, which is the only safe state for a stage-1 test.
  assert.equal(requestsVisibleTo(true, { role: 'TUTOR' }), false,
    'being an expert now grants access — the allowlist has been bypassed')
  assert.equal(requestsVisibleTo(true, { role: 'TUTOR', hasAccess: true }), true)
})

test('SEEING the subsystem and BEING a provider are two questions', () => {
  // These were conflated for one revision and it made a control lie. The gate
  // skipped the allowlist query for an admin — „they are in by role anyway" —
  // which is true of seeing it and false of bidding on it: without a row there
  // is no identity to attach an offer to, so the offer endpoint 404s. An admin
  // added to the list stayed unable to write one, and nothing said why.
  // Reported by the owner asking to be added to it (2026-08-14).
  const gate = codeOf('lib/requestsServer.ts')
  assert.doesNotMatch(gate, /user\.role !== 'ADMIN' \? await requestAccessOf/,
    'the gate skips the allowlist for an admin again — a row for them does nothing')
  assert.match(gate, /const provider = user \? await requestAccessOf\(user\.id\) : null/,
    'the provider identity no longer comes from the allowlist for every viewer')
  // …and the endpoint that maintains the list accepts an admin, for the same
  // reason. The refusal that used to sit there is what made the row pointless.
  assert.doesNotMatch(codeOf('app/api/admin/requests/access/route.ts'), /ADMIN_ALREADY_HAS_ACCESS/,
    'adding an admin to the allowlist is refused again — then they can never write an offer')

  // The two questions still have two answers. An admin with NO row sees
  // everything and is not a provider; that is what the offer endpoint checks.
  assert.equal(requestsVisibleTo(true, { role: 'ADMIN', hasAccess: false }), true)
  assert.match(codeOf('app/api/provider/offers/route.ts'), /if \(!provider\) return notFound\(\)/,
    'the offer endpoint no longer requires a provider identity')
})

/* ═══════════ 2. FEATURE_REQUESTS=off → every new route 404s ════════════ */

test('the middleware 404s every path the subsystem owns', () => {
  // The path list is exported and the middleware walks IT, so a route added
  // later is covered by this test the day it appears rather than the day
  // somebody remembers. A hand-typed copy here would rot.
  const mw = codeOf('middleware.ts')
  assert.match(mw, /if \(!requestsOn\(\) && isRequestPath\(req\.nextUrl\.pathname\)\)/,
    'the middleware no longer gates the requests paths')
  assert.match(mw, /status: 404/, 'the middleware gate must answer 404')
  // Before the headers are built and before anything else touches the request.
  assert.ok(
    mw.indexOf('isRequestPath') < mw.indexOf('x-current-path'),
    'the gate runs after the request has already been processed',
  )
  // A redirect would tell an anonymous visitor the page is real and worth
  // coming back to with an account — the one thing the 404 exists to deny.
  const gateBlock = mw.slice(mw.indexOf('isRequestPath'), mw.indexOf('x-current-path'))
  assert.doesNotMatch(gateBlock, /redirect/)

  // Every prefix, and its children, are inside. Matched on a segment boundary
  // so a future „/requests-archive" is not swallowed by the „/request" prefix.
  for (const p of REQUEST_PATH_PREFIXES) {
    assert.equal(isRequestPath(p), true, `${p} is not gated`)
    assert.equal(isRequestPath(p + '/MC-7A4K2'), true, `${p}/… is not gated`)
  }
  for (const p of ['/', '/tutors', '/student', '/tutor', '/admin', '/business', '/api/bookings', '/requests-archive', '/providers']) {
    assert.equal(isRequestPath(p), false, `${p} was swallowed by the requests gate`)
  }
})

test('the two gates are different answers, and each is the right one', () => {
  // Executed, not described. The client gate must let in a person with NO
  // account and no allowlist row — that is the entire change of 2026-08-17,
  // and the shape it replaced (a marketplace where only hand-picked providers
  // could ask a question) passed every other test in this file.
  const GUESTS = [
    {},
    { role: 'STUDENT' },
    { role: 'TUTOR' },
    { role: 'ADMIN' },
  ] as const

  // OFF beats everything on BOTH sides — including the client side, and
  // including an admin. A kill switch that leaves the public form standing is
  // not a kill switch.
  assert.equal(requestsOn('off'), false)
  for (const v of GUESTS) {
    assert.equal(requestsVisibleTo(false, v), false, 'OFF still admits a provider surface')
  }

  // ON: the provider side still asks who you are…
  assert.equal(requestsVisibleTo(true, { role: 'STUDENT' }), false)
  assert.equal(requestsVisibleTo(true, { role: 'TUTOR' }), false)
  assert.equal(requestsVisibleTo(true, { role: 'TUTOR', hasAccess: true }), true)
  assert.equal(requestsVisibleTo(true, { role: 'ADMIN' }), true)

  // …and the client side does not ask at all. Asserted through the source of
  // the exported function rather than by calling it, because it closes over
  // process.env and would only ever prove whatever this machine is set to.
  const src = codeOf('lib/requests.ts')
  const fn = src.slice(src.indexOf('export function canOpenRequestForm'))
    .slice(0, src.slice(src.indexOf('export function canOpenRequestForm')).indexOf('}') + 1)
  assert.match(fn, /return requestsOn\(\)/,
    'canOpenRequestForm no longer answers „on, and nothing else"')
  assert.doesNotMatch(fn, /role|hasAccess|allowlist|provider/i,
    'the client gate started asking who the caller is — it must not')
})

test('the client’s reference is never shown to a provider', () => {
  // ⚠️ THE WORST BUG THIS SUBSYSTEM HAS HAD (found 2026-08-17, in review).
  //
  // `publicRef` is not a reference number. It is the client's ENTIRE
  // credential — they have no account, by design, so possession of that string
  // authorises:
  //     · reading their private thread with us      (/api/request-thread?ref=)
  //     · writing to us AS them                     (POST the same)
  //     · POST /api/requests/<ref>/accept           — which settles the
  //       request, declines every rival offer, and OPENS THE CLIENT'S PHONE.
  // The accept route checks nothing else. It cannot: the client has no session.
  //
  // And the provider request page printed it in the eyebrow. So any allowlisted
  // provider read it on every open request BEFORE bidding, and could then
  // accept their own offer on the client's behalf. The one transition the whole
  // product is built on — „WE open the contact when the client chooses" — was
  // available to the counterparty for the price of reading a heading.
  //
  // The type is where this is enforced, so a future card cannot compile.
  const reqs = read('lib/requests.ts')
  const shape = reqs.slice(reqs.indexOf('export type ProviderRequestRow'))
    .slice(0, reqs.slice(reqs.indexOf('export type ProviderRequestRow')).indexOf('}') + 1)
  assert.doesNotMatch(shape, /publicRef/,
    'publicRef is back on ProviderRequestRow — every provider surface can now render the client’s credential')
  const view = reqs.slice(reqs.indexOf('export function providerRequestView'))
    .slice(0, 600)
  assert.doesNotMatch(view, /publicRef/, 'providerRequestView emits publicRef again')

  // …and no provider-facing surface may print it directly either.
  for (const f of [
    'app/provider/requests/page.tsx',
    'app/provider/requests/[id]/page.tsx',
    'app/provider/offers/page.tsx',
  ]) {
    const body = codeOf(f)
    assert.doesNotMatch(body, /\{[^}]*\.publicRef[^}]*\}/,
      `${f} renders the client’s reference — that hands the counterparty the key to accept on the client’s behalf`)
  }

  // A provider's NOTIFICATION and MAIL are archives somebody can read it out of
  // at leisure, so they carry the topic instead.
  assert.doesNotMatch(codeOf('app/api/request-chat/route.ts'), /body: r\.offer\.request\.publicRef/,
    'the provider bell body is the client’s reference again')
  const mail = read('lib/emailTemplates.ts')
  assert.match(mail, /o\.toProvider\s*\n?\s*\?\s*`ახალი შეტყობინება — \$\{topicLabel\(o\.topic\)\}`/,
    'the provider chat mail subject carries the client’s reference again')
  // codeOf, not read: the comment explaining the removal names `publicRef`, and
  // a negative assertion that trips on its own documentation is a test nobody
  // can keep true.
  const mailCode = codeOf('lib/emailTemplates.ts')
  assert.doesNotMatch(mailCode.slice(mailCode.indexOf('offerAcceptedProviderEmail')).slice(0, 500), /publicRef/,
    'the accepted-offer mail to the provider carries the client’s reference again')
})

test('a client we cannot reach is refused at the door', () => {
  // ⚠️ EMAIL IS REQUIRED, AND IT USED TO BE OPTIONAL ON PURPOSE. The old rule
  // („the whole flow runs on the phone number") was good and was defeated by
  // something outside the schema: every automated message this subsystem sends
  // a client is an EMAIL, and there is no SMS anywhere in the codebase. So an
  // absent email did not mean „reach me by phone" — it meant the system never
  // spoke to them again: no offer notice, no reply notice, no nudge.
  const base = {
    kind: 'CONSULTATION', topic: 'contract',
    description: 'ხელშეკრულება მჭირდება იჯარაზე.',
    budgetBand: 'c2', timing: 'this_week', format: 'ONLINE', city: 'TBILISI',
    contactName: 'ნინო მაგალიძე', phone: '555123456',
  }
  assert.equal(ServiceRequestInput.safeParse({ ...base, email: 'nino@example.ge' }).success, true)
  assert.equal(ServiceRequestInput.safeParse(base).success, false,
    'a request with no email is accepted again — that client can never be told an offer arrived')
  assert.equal(ServiceRequestInput.safeParse({ ...base, email: '' }).success, false,
    'an empty email is accepted again')

  // ⚠️ THE DOWNSTREAM GUARDS STAY. Rows written before this rule have no email
  // and must still be readable; every notifier keeps its `if (email)` so an old
  // row degrades to silence instead of throwing.
  assert.match(codeOf('app/api/provider/offers/route.ts'), /const to = offer\.request\.email\s*\n\s*if \(to\)/,
    'the offer notifier stopped guarding on a missing email — old rows predate the requirement')
  assert.match(codeOf('lib/requestJobs.ts'), /!r\.email/,
    'the client nudge stopped guarding on a missing email')

  // When SMS exists this requirement should come back OUT. Pinned so that the
  // reason is findable from the test rather than only from a git blame.
  assert.match(read('lib/requests.ts'), /THE HONEST FIX IS SMS/,
    'the note explaining why this requirement is temporary was removed')
})

test('NOBODY outside the allowlist can be mailed about a request', () => {
  // ⚠️ THE OWNER'S STANDING CONSTRAINT (2026-08-17): „რადგან კლიენტები
  // ახლანდელი ექსპერტები არიან, არ მინდა შეწუხდნენ — ამ ეტაპზე რექვესთი არავის
  // მეილზე არ უნდა მივიდეს." The platform has 26 experts who applied to be
  // BOOKED; not one of them asked to receive leads. Mailing them would be
  // shipping an unfinished product to people who never opted in, and it is the
  // kind of mistake that is made once and remembered.
  //
  // The guarantee already holds — routing reads the allowlist and the allowlist
  // has one row. But „it happens to be true today" is not a guarantee; a
  // `findMany` that loses its `where` is one careless edit. This is the test
  // that makes it one.
  const jobs = codeOf('lib/requestJobs.ts')

  // The audience is built from RequestAccess, and only from rows that are ON.
  assert.match(jobs, /prisma\.requestAccess\.findMany\(\{\s*where: \{ active: true/,
    'the routable audience is no longer restricted to ACTIVE allowlist rows')
  assert.match(jobs, /company: \{ requestAccess: \{ active: true \} \}/,
    'company members are no longer restricted to companies with an active allowlist row')

  // …and it is NEVER built from the expert catalogue. This is the assertion
  // that matters: `tutorProfile.findMany` here would silently turn every
  // approved expert on the site into a lead recipient.
  assert.doesNotMatch(jobs, /prisma\.tutorProfile\.(findMany|findFirst)/,
    'the router reads the EXPERT CATALOGUE — that mails 26 people who never asked for leads')
  assert.doesNotMatch(jobs, /prisma\.user\.findMany\(\{\s*where: \{ role:/,
    'the router selects recipients by ROLE — the allowlist is the only opt-in')

  // The one place that mails providers takes its addresses from that audience
  // and from nowhere else.
  assert.match(jobs, /const byId = new Map\(providers\.map/,
    'provider addresses are no longer resolved from the routed audience')
})

test('the waiting screen animates FACTS — no invented audience', () => {
  // ⚠️ THE MOST TEMPTING LIE IN THE PRODUCT, and the reason this test exists
  // rather than a comment. A waiting screen is easy to make feel busy: „N
  // ექსპერტი ათვალიერებს", a pulse, done. At the moment somebody presses send
  // the request is NEW, no provider has been told it exists, and none will be
  // until an operator phones — so that number is ZERO by construction and any
  // other number is fabricated. It is the „3 people are viewing this room"
  // pattern, and it is worse here: the person is asked to WAIT on it, and what
  // they are waiting for is a phone call we would have misrepresented.
  const live = codeOf('app/request/_live.tsx')
  const api = codeOf('app/api/requests/[ref]/status/route.ts')

  // Every number on that screen must come from the endpoint, and every number
  // in the endpoint must come from a count.
  assert.doesNotMatch(live, /Math\.random|setTimeout\([^)]*\d{3,}[^)]*\)\s*=>\s*set|\+\s*Math\.floor/,
    'the waiting screen invented a number instead of reading one')
  assert.doesNotMatch(live, /ათვალიერებ|უყურებ|ნახულობ/,
    'the waiting screen claims people are LOOKING at the request — nobody is until it is routed')
  assert.match(api, /prisma\.notification\.count/,
    '„how many were told" stopped being a count of what we actually sent')
  assert.match(api, /prisma\.tutorProfile\.count/,
    '„how many experts are in this sphere" stopped being a count')

  // „N ექსპერტს ვაცნობეთ" may only render when the count is real and non-zero.
  assert.match(live, /d\.notified > 0/,
    'the notified line renders unconditionally — it would claim an audience before routing ran')

  // The motion is the site's own closed library — the canon shut it at eight
  // tokens and says to prefer removing motion to adding it.
  const anims = [...live.matchAll(/animate-([a-z-]+)/g)].map(m => m[1])
  for (const a of anims) {
    assert.ok(['pulse-soft', 'fade-in-fast', 'fade-in', 'rise-in', 'slide-in-b', 'slide-in-r', 'scale-in'].includes(a),
      `the waiting screen minted a new animation: ${a}`)
  }
  // …and every one of them is reduced-motion gated. Unrequested movement is an
  // accessibility contract, not a preference.
  for (const m of live.matchAll(/(\S*)animate-[a-z-]+/g)) {
    assert.match(m[1], /motion-safe:/, `an animation on the waiting screen is not motion-safe gated: ${m[0]}`)
  }
})

test('the two screens describe one journey', () => {
  // The thanks screen polls and the /request/<ref> page renders on the server;
  // both draw the same four stations. Two copies of the list is how one request
  // reads „ვამოწმებთ" on one screen and „შეთავაზებები" on the other.
  assert.equal(REQUEST_STATIONS.length, 4)
  assert.match(codeOf('app/request/[ref]/page.tsx'), /REQUEST_STATIONS\.map/,
    'the server track went back to its own copy of the station labels')
  assert.match(codeOf('app/request/_live.tsx'), /REQUEST_STATIONS\.map/,
    'the live panel went back to its own copy of the station labels')
  // NEW reaches „ვამოწმებთ" and stops there — the station in progress, not one
  // already ticked. Getting this wrong tells somebody their request has been
  // checked when nobody has looked at it.
  assert.equal(stationsReached('NEW'), 2)
  assert.equal(stationsReached('VERIFIED'), 3)
  assert.equal(stationsReached('MATCHED'), 4)
})

test('an emailed provider link survives not being signed in', () => {
  // ⚠️ THE SHAPE OF THE BUG (owner, 2026-08-17, holding the dead link twice).
  // Every /provider surface answers notFound() rather than redirecting, and
  // that rule is right: a redirect to /signin tells a stranger guessing URLs
  // that the page is real. But we EMAIL these links. On the phone where the
  // recipient was not signed in, „ნახე და შესთავაზე" led to „page not found"
  // about a request we had just told them existed — the rule protecting the
  // subsystem from strangers punishing the one person it was written for.
  //
  // /signin is public (it reveals nothing about the target) and already 307s a
  // visitor who turns out to have a session straight through to `redirect`.
  const t = read('lib/emailTemplates.ts')

  // ⚠️ /provider ONLY, and the exemption is the whole distinction. /admin is
  // guarded by requireRole, which REDIRECTS a signed-out visitor to sign-in —
  // so an emailed /admin link has always worked and was never the bug. The
  // requests subsystem is the one that answers notFound(), deliberately, and
  // that is exactly why its emailed links needed routing. (The admin links in
  // this file go through the helper too, which saves a redirect hop, but
  // asserting it would fail this test on an unrelated moderation email that
  // is not broken.)
  const bare = [...t.matchAll(/href: `\$\{BASE\}(\/provider[^`]*)`/g)].map(m => m[1])
  assert.deepEqual(bare, [],
    `these email links go straight to a 404-on-signed-out page: ${bare.join(', ')}`)
  const bareTernary = [...t.matchAll(/\?\s*`\$\{BASE\}(\/provider[^`]*)`/g)].map(m => m[1])
  assert.deepEqual(bareTernary, [], `same, in a ternary: ${bareTernary.join(', ')}`)

  // …and the helper must keep doing the one thing it is for.
  assert.match(t, /\/signin\?redirect=\$\{encodeURIComponent\(path\)\}/,
    'gatedLink no longer routes through /signin — the emailed links 404 again')

  // ⚠️ AND THE CLIENT LINK MUST NOT BE GATED. /request/<ref> is reachable with
  // no account at all — the reference IS the client's identity — so sending a
  // client through sign-in would invent the wall this product removed.
  assert.match(t, /`\$\{BASE\}\/request\/\$\{o\.publicRef\}`/,
    'the client link was routed through sign-in — they have no account by design')
  assert.doesNotMatch(t, /gatedLink\([`']\/request/,
    'a client reference link is being sent through sign-in')

  // The signin page must actually honour the parameter this depends on.
  assert.match(read('app/signin/page.tsx'), /safeInternalPath\(typeof sp\.redirect === 'string'/,
    'the sign-in page stopped honouring ?redirect= — every emailed provider link now lands on the wrong page')
})

test('a settled request stays open to the people who bid on it', () => {
  // ⚠️ THE LINK IN THE NOTIFICATION POINTS HERE. A provider is told about a
  // request by an email and a bell that both link to /provider/requests/<id>;
  // accepting an offer moves the request to MATCHED. The page used to answer
  // `status !== 'VERIFIED' → notFound()`, so the WINNER's own link went dead at
  // the exact moment it started to matter, and every provider who bid and lost
  // got a 404 where the answer should have been (owner, 2026-08-17, holding the
  // dead link).
  const page = codeOf('app/provider/requests/[id]/page.tsx')
  assert.doesNotMatch(page, /row\.status !== 'VERIFIED'\s*\)\s*notFound/,
    'the page 404s on every non-VERIFIED status again — that kills the winner’s own link')
  // The replacement rule, asserted as a rule rather than as prose: a settled
  // request opens for somebody who has an offer on it, or for an admin.
  assert.match(page, /settled && \(mine !== null \|\| isAdmin\)/,
    'the settled-request audience is no longer „bid on it, or admin"')
  // …and NEW/REJECTED must still be nobody's business. Expressed as: the only
  // statuses that can produce `mayOpen` are VERIFIED and the settled pair.
  assert.match(page, /const settled = row\.status === 'MATCHED' \|\| row\.status === 'CLOSED'/,
    'the settled set changed — NEW or REJECTED must never become visible here')
  // The contact stays where its one guard lives. A phone number rendered on
  // this page would be a second place `clientContactFor` has to hold.
  assert.doesNotMatch(page, /clientContactFor|contact\.phone/,
    'the provider detail page started rendering the client contact itself')
})

test('the six examples on the first screen all still exist', () => {
  // SUGGESTED_TOPICS filters rather than throws — lib/requests is imported by
  // middleware.ts, so a module-load throw would take the whole site down over a
  // renamed topic (see the note there). The filter's cost is that a bad id goes
  // MISSING silently, and „one fewer chip" is invisible on a screen nobody has
  // a baseline for. This is where that is caught instead.
  assert.equal(SUGGESTED_TOPICS.length, SUGGESTED_TOPIC_IDS.length,
    `a suggested topic id no longer exists: ${SUGGESTED_TOPIC_IDS.filter(id => !SUGGESTED_TOPICS.some(t => t.id === id)).join(', ')}`)

  // Two per kind, which is the point of the row — the first screen has to show
  // that a lawyer and a builder live here too, not only a tutor. Asserted as a
  // property, so swapping a topic for another of the same kind is free and
  // quietly turning the row into six tutoring subjects is not.
  const byKind = REQUEST_KINDS.map(k => SUGGESTED_TOPICS.filter(t => isTopicOfKind(k, t.id)).length)
  for (const n of byKind) {
    assert.ok(n >= 2, `the examples row is lopsided across kinds: ${JSON.stringify(byKind)}`)
  }
})

test('the outer gate covers EVERY route the inner guard covers', () => {
  // The list above is walked by the middleware, so it cannot rot — but it is
  // still hand-written, and a new route only joins it if somebody remembers.
  // /api/request-chat did not: it calls requestsViewer() like every sibling,
  // yet „/api/request-chat" does not start with „/api/requests/", so the
  // middleware waved it through for a day. Nothing leaked (the inner guard
  // held), which is precisely why nothing announced it.
  //
  // So derive the set instead of trusting it: a route file that gates itself
  // BELONGS to the subsystem, and its URL must be inside isRequestPath. The two
  // layers now cover the same paths by construction.
  const missed: string[] = []
  for (const f of sourceFiles()) {
    const rel = relative(ROOT, f)
    if (!/^app\/.*\/route\.ts$/.test(rel)) continue
    if (!/\brequestsViewer\(/.test(codeOf(rel))) continue
    // app/api/request-chat/route.ts → /api/request-chat
    const url = '/' + rel.replace(/^app\//, '').replace(/\/route\.ts$/, '')
    if (!isRequestPath(url)) missed.push(url)
  }
  assert.deepEqual(missed, [],
    'these routes gate themselves but the middleware does not 404 them — add the prefix to REQUEST_PATH_PREFIXES')
})

test('every page and every route ALSO gates itself — the middleware is not the guard', () => {
  // A middleware matcher is one config edit away from not covering a new path,
  // and it runs with no database so it cannot know the allowlist. Both layers
  // are required; neither is load-bearing alone.
  // ⚠️ WHICH gate, not just „a gate" (2026-08-17). The two are no longer the
  // same answer: `clientAllowed` is „the subsystem is on" and lets anybody in,
  // `providerAllowed` is „admin or allowlist". A provider surface that reads
  // the client field would open the offer screens — and every other assertion
  // in this file would still pass, because the file DOES gate itself. So the
  // side is spelled out per path, and it is the whole point of this test now.
  const PAGES: [string, 'clientAllowed' | 'providerAllowed'][] = [
    ['app/request/page.tsx', 'clientAllowed'],
    ['app/request/[ref]/page.tsx', 'clientAllowed'],
    ['app/provider/layout.tsx', 'providerAllowed'],
  ]
  for (const [f, gate] of PAGES) {
    const body = codeOf(f)
    assert.match(body, /requestsViewer\(\)/, `${f} does not resolve the gate`)
    assert.match(body, new RegExp(`if \\(!viewer\\.${gate}\\) notFound\\(\\)`),
      `${f} does not 404 behind viewer.${gate}`)
    const other = gate === 'clientAllowed' ? 'providerAllowed' : 'clientAllowed'
    assert.doesNotMatch(body, new RegExp(`viewer\\.${other}`),
      `${f} reads viewer.${other} — that is the other side's gate`)
    // notFound, never a redirect: requireRole() would send a signed-out visitor
    // to /signin, which confirms the page is there.
    assert.doesNotMatch(body, /redirect\(/, `${f} redirects instead of 404ing`)
    assert.doesNotMatch(body, /requireRole\(/, `${f} uses requireRole — it would redirect to /signin`)
  }

  const ROUTES: [string, 'clientAllowed' | 'providerAllowed'][] = [
    ['app/api/requests/route.ts', 'clientAllowed'],
    ['app/api/requests/[ref]/accept/route.ts', 'clientAllowed'],
    ['app/api/request-chat/route.ts', 'clientAllowed'],
    ['app/api/request-thread/route.ts', 'clientAllowed'],
    ['app/api/provider/offers/route.ts', 'providerAllowed'],
    ['app/api/admin/requests/route.ts', 'providerAllowed'],
    ['app/api/admin/requests/[id]/route.ts', 'providerAllowed'],
    ['app/api/admin/requests/access/route.ts', 'providerAllowed'],
  ]
  for (const [f, gate] of ROUTES) {
    const body = codeOf(f)
    assert.match(body, /requestsViewer\(\)/, `${f} does not check the gate`)
    assert.match(body, new RegExp(`viewer\\.${gate}`), `${f} does not use viewer.${gate}`)
    const other = gate === 'clientAllowed' ? 'providerAllowed' : 'clientAllowed'
    assert.doesNotMatch(body, new RegExp(`viewer\\.${other}`),
      `${f} reads viewer.${other} — that is the other side's gate`)
    // Either the literal status, or the shared helper that IS that status —
    // `requestsNotFound()` exists so „the gate answers 404" is one fact rather
    // than six copies of a NextResponse.json call.
    assert.match(body, /status: 404|requestsNotFound\(\)/, `${f} does not answer 404`)
  }
  // …and the helper it defers to really is a 404. Without this, the branch
  // above would accept a function that had quietly become a 403.
  assert.match(codeOf('lib/requestsServer.ts'), /requestsNotFound\(\)[\s\S]{0,120}status: 404/)
})

test('the public endpoint gates BEFORE it rate-limits and before it reads a body', () => {
  // The failure mode that makes „hidden" meaningless: the page 404s in the
  // browser while the endpoint behind it answers anyone with a curl command.
  // And a caller who may not see the subsystem must not learn anything from
  // it, INCLUDING how fast it rate-limits.
  const route = codeOf('app/api/requests/route.ts')
  assert.ok(route.indexOf('viewer.clientAllowed') < route.indexOf('rateLimit('),
    'the gate runs after the rate limiter — an outsider can still probe the endpoint')
  assert.ok(route.indexOf('viewer.clientAllowed') < route.indexOf('req.json()'),
    'the gate runs after the body is parsed')
  // Unauthenticated form → rate-limited hard. Same budget as /api/contact and
  // /api/business/lead: generous for a real person, hostile to a script.
  assert.match(read('app/api/requests/route.ts'), /rateLimit\(`service-request:\$\{ip\}`, 5, 60 \* 60\)/)
  assert.match(route, /status: 429/)
})

test('a non-allowlisted account gets 404, never 403', () => {
  // 403 says „this exists and you may not have it", which confirms the
  // subsystem to anyone who probes for it. The whole hiding story is that
  // somebody who does not know the URL cannot find the feature.
  const gate = codeOf('lib/requestsServer.ts')
  assert.match(gate, /status: 404/, 'requestsNotFound no longer answers 404')
  assert.doesNotMatch(gate, /status: 403/, 'the requests gate learned to answer 403')

  for (const f of [
    'app/api/requests/route.ts',
    'app/api/requests/[ref]/accept/route.ts',
    'app/api/provider/offers/route.ts',
  ]) {
    const body = codeOf(f)
    // The 403 that requireRoleApi produces is legitimate on the ADMIN routes —
    // it is only ever reached once the subsystem is already visible to you —
    // but it must not appear on the three a provider or a client can reach.
    assert.doesNotMatch(body, /status: 403/, `${f} answers 403 — it confirms the endpoint exists`)
    assert.doesNotMatch(body, /requireRoleApi/, `${f} answers 401/403 for a signed-out caller`)
  }

  // The admin routes carry BOTH gates, in this order: 404 first so a
  // non-admin learns nothing, then 401/403 which is only reachable once the
  // subsystem is visible to you at all. At stage 1 they coincide; for an
  // allowlisted PROVIDER they come apart, which is why it is two checks.
  for (const f of [
    'app/api/admin/requests/route.ts',
    'app/api/admin/requests/[id]/route.ts',
    'app/api/admin/requests/access/route.ts',
  ]) {
    const body = codeOf(f)
    assert.match(body, /requireRoleApi\('ADMIN'\)/, `${f} does not check for an admin`)
    assert.ok(body.indexOf('requestsViewer') < body.indexOf('requireRoleApi'),
      `${f} checks the role before the feature gate — a non-admin learns the endpoint exists`)
  }
})

/* ═══════════ 3. nothing links to it ════════════════════════════════════ */

test('the PROVIDER side is linked from nowhere, and /request only from named places', () => {
  // ⚠️ THIS TEST CHANGED SHAPE ON 2026-08-17 AND THE OLD SHAPE IS WORTH KNOWING.
  // It used to assert that NOTHING linked to /request or /provider from
  // anywhere — the subsystem was dark, and one href in a nav array made it
  // discoverable regardless of every other precaution. That was right while the
  // client side was allowlist-only.
  //
  // It is not right any more. The owner opened the client form to everyone and
  // then put it in the header and on the home page (Bark/Angi are the reference
  // — a browsable catalogue and a describe-it path running side by side). A
  // test that forbids the thing the product now does is a test that gets
  // deleted in frustration, taking the half that still matters with it.
  //
  // So the halves are separated:
  //   /provider — STILL linked from nowhere. It is the bidder's side; nobody
  //               arrives there by browsing, only by an admin's invitation.
  //               This is the guarantee that has to survive.
  //   /request  — allowed, from a SHORT NAMED LIST, and every entry must check
  //               the feature flag. Named individually rather than excused by a
  //               pattern, so the next link somebody adds still fails here and
  //               has to be argued for.
  // Each entry point, paired with the file that GATES it. They are not always
  // the same file, and that is correct: the home band does not check the flag
  // itself because it is never rendered unless HomeClient decides it should be.
  // A component that re-checks a gate its parent already applied is a second
  // place the answer lives.
  const CLIENT_ENTRY_POINTS: [file: string, gatedIn: string][] = [
    ['components/PublicTopBar.tsx', 'components/PublicTopBar.tsx'],
    ['app/_home/request.tsx', 'app/HomeClient.tsx'],
  ]
  for (const [f, gate] of CLIENT_ENTRY_POINTS) {
    assert.match(read(gate), /requestsOn\(\)/,
      `${f} reaches /request but ${gate} does not check the flag — it would show on a deployment where the subsystem does not exist`)
    assert.doesNotMatch(read(f), /["'`]\/provider/,
      `${f} links to the PROVIDER side — that surface is reached by invitation only`)
  }
  const ENTRY_FILES = CLIENT_ENTRY_POINTS.flatMap(([f, g]) => [f, g])

  const offenders: string[] = []
  for (const f of sourceFiles()) {
    const rel = relative(ROOT, f)
    // The named client entry points, already checked above for the flag and for
    // not reaching the provider side. Skipped here rather than pattern-excused,
    // so a NEW file linking to /request still lands in `offenders`.
    if (ENTRY_FILES.includes(rel)) continue
    // The subsystem's own files are allowed to know their own URLs.
    if (rel.startsWith('app/request/') || rel.startsWith('app/provider/')) continue
    if (rel.startsWith('app/api/requests/') || rel.startsWith('app/api/provider/')) continue
    // The conversation endpoint is the subsystem's own — its hrefs are „reply"
    // targets inside threads that already belong to it.
    if (rel === 'app/api/request-chat/route.ts') continue
    if (rel.startsWith('app/api/admin/requests/')) continue
    // …and so is lib/requests.ts, which is where the URLs are DEFINED, and
    // lib/requestJobs.ts, which is the subsystem's own background worker —
    // its hrefs go INTO the subsystem's mails, they are not a way in from
    // outside it.
    if (rel === 'lib/requests.ts' || rel === 'lib/requestJobs.ts') continue
    // lib/requestThread.ts is the platform thread's rules, and
    // lib/emailTemplates.ts is where those mails are BUILT — its /provider
    // paths are the destinations inside the subsystem's own letters, reached
    // only by somebody we already wrote to. They are not a way in from a page
    // a stranger can browse, which is the thing this scan exists to stop.
    // Pinned separately by „an emailed provider link survives not being signed
    // in", which is stricter than this scan: it requires every one of them to
    // be routed through sign-in.
    if (rel === 'lib/requestThread.ts' || rel === 'lib/emailTemplates.ts') continue
    // The admin panel is behind requireRole('ADMIN') at the layout, and both
    // its tabs are filtered out of ADMIN_NAV when the subsystem is off. Named
    // individually rather than excused by a pattern: „anything under app/admin"
    // would silently bless the next link somebody adds there.
    if (rel === 'app/admin/_requests.tsx' || rel === 'app/admin/_access.tsx') continue
    // components/RequestChat is the subsystem's own pane — it is MOUNTED by
    // the two request pages and reaches nowhere else. Its href is the „reply"
    // target inside a conversation that already belongs to the subsystem, not
    // a door into it from the site.
    if (rel === 'components/RequestChat.tsx') continue
    // The public header's „მოთხოვნა" item — the ONE link outside the subsystem,
    // added at the owner's request (2026-08-14: „მხოლოდ ადმინებს რომ
    // გამოუჩნდეს") and verified admin-gated by the assertions below this scan.
    // This line only says WHERE to look; the mechanism check is what matters.
    if (rel === 'components/PublicTopBar.tsx') continue

    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      // A quoted "/request" or "/provider" — a link target, not the word.
      if (!/["'`]\/(request|provider)(["'`/?#])/.test(line)) return
      offenders.push(`      ${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.equal(offenders.length, 0,
    `something links to the requests subsystem from outside it:\n${offenders.join('\n')}`)

  // …and the ONE allowed link is actually gated on the flag, which is the
  // assertion that matters — the allowlist entry above only says where to look.
  //
  // ⚠️ THIS USED TO REQUIRE `&& me?.role === 'ADMIN'` (2026-08-14 → 2026-08-17).
  // The rule was right for as long as one gate covered the whole subsystem:
  // /request 404ed for anonymous, so showing them the item was a link into a
  // wall. Splitting the gate (canOpenRequestForm) made the client side answer
  // 200 to everyone, and the filter was then hiding a working page from exactly
  // the people it is for. What survives is the part that never depended on the
  // audience: the item must not appear when the FLAG is off.
  const bar = read('components/PublicTopBar.tsx')
  assert.match(bar, /if \(i\.href === '\/request'\) return requestsOn\(\)/,
    'the header „მოთხოვნა" item no longer checks the flag — it would show on a deployment where the subsystem does not exist')
  assert.doesNotMatch(bar, /i\.href === '\/request'\) return requestsOn\(\) &&/,
    'the requests item narrowed its audience again — the client form is open to everyone the flag admits')
  // The FLAG check is the whole gate now, so it must be the real thing and not
  // a literal somebody inlined while removing the role test.
  assert.doesNotMatch(bar, /i\.href === '\/request'\) return true/,
    'the requests item is shown unconditionally — FEATURE_REQUESTS=off must still hide it')
})

test('it is not in the sitemap, not in the feed, and not named in robots.txt', () => {
  const sitemap = read('app/sitemap.ts')
  // STATIC_ROUTES is an allowlist, so absence is the default — pinned anyway,
  // because „add every page to the sitemap" is a plausible future tidy-up.
  assert.doesNotMatch(sitemap, /path: '\/request'/)
  assert.doesNotMatch(sitemap, /path: '\/provider'/)
  assert.doesNotMatch(read('app/rss.xml/route.ts'), /\/request|\/provider/)
  // The instinct is to add these to Disallow. That is backwards: robots.txt is
  // PUBLIC, so a Disallow line publishes the exact URLs the subsystem exists to
  // keep unlisted — to anyone who reads it, including every scraper that treats
  // Disallow as a list of interesting places. /business and /abroad are absent
  // from that file for the same reason.
  assert.doesNotMatch(read('app/robots.ts'), /request|provider/)
  // Every page carries noindex AND nofollow — nofollow deliberately: a crawler
  // that reached one must not walk out of it either.
  for (const f of ['app/request/page.tsx', 'app/request/[ref]/page.tsx', 'app/provider/layout.tsx']) {
    assert.match(read(f), /robots: \{ index: false, follow: false \}/, `${f} is indexable`)
  }
})

test('FEATURE_REQUESTS reaches the browser bundle', () => {
  // app/admin/_nav.tsx is a CLIENT component and only NEXT_PUBLIC_* vars exist
  // in the browser by default — so without this inline the two admin tabs were
  // filtered out on every deployment while the server half worked perfectly.
  // Invisible when broken (nothing errors; the rail is simply two rows shorter),
  // which is exactly the class of defect this file exists to pin.
  assert.match(read('next.config.js'), /env: \{ FEATURE_REQUESTS: process\.env\.FEATURE_REQUESTS \}/,
    'next.config.js no longer inlines FEATURE_REQUESTS — client components read undefined and the admin tabs vanish')
})

test('the admin tabs disappear with the subsystem', () => {
  const nav = codeOf('app/admin/_nav.tsx')
  assert.match(nav, /\.filter\(it => \(it\.id !== 'requests' && it\.id !== 'access'\) \|\| requestsFeatureExists\(\)\)/,
    'the requests tabs are no longer filtered out of ADMIN_NAV')
  // VALID_TABS is DERIVED from that array, so filtering there means
  // /admin#requests does nothing at all with the subsystem off — exactly like
  // any other unknown hash — rather than opening a tab that is not drawn.
  assert.match(nav, /const VALID_TABS: AdminTab\[\] = ADMIN_NAV\.map/)
  // …and both tabs actually render something. A tab you can click that renders
  // nothing is worse than no tab (the rule tests/adminNav pins for all of them).
  const page = read('app/admin/page.tsx')
  for (const id of ['requests', 'access']) {
    assert.match(page, new RegExp(`active === '${id}'`), `the ${id} tab renders nothing`)
  }
})

/* ═══════════ 4. the contact does not leak ══════════════════════════════ */

test('a provider payload cannot carry the client‘s name, phone or email', () => {
  // THE PRODUCT IS THAT WE OPEN THE CONTACT. An endpoint that gives it away
  // early has given away the whole feature — silently, while looking like it
  // works. Executed rather than grepped: the shaping function is handed a row
  // that DOES carry the contact, and the output is inspected.
  const row = {
    id: 'req_1', publicRef: 'MC-7A4K2',
    description: 'ვეძებ ბუღალტერს შპს-სთვის',
    kind: 'CONSULTATION', topic: 'accounting',
    budgetMin: 100, budgetMax: 250, budgetUnit: 'PER_SESSION',
    timing: 'this_week', format: 'ONLINE', city: 'TBILISI',
    status: 'VERIFIED', offerCount: 1, offerLimit: 3,
    createdAt: new Date('2026-08-14T09:00:00Z'),
    category: { id: 'c1', name: 'ბუღალტერია', slug: 'accounting' },
    // The three that must not survive, plus the admin's private note. Passed as
    // extra keys exactly the way a careless `select` would produce them.
    contactName: 'ნინო მაგალიძე',
    phone: '+995555123456',
    email: 'nino@example.ge',
    adminNote: 'დავურეკე, რეალურია',
  }
  const view = providerRequestView(row as any)
  const json = JSON.stringify(view)
  for (const secret of ['ნინო მაგალიძე', '+995555123456', 'nino@example.ge', 'დავურეკე']) {
    assert.ok(!json.includes(secret), `providerRequestView leaked „${secret}"`)
  }
  for (const key of ['contactName', 'phone', 'email', 'adminNote']) {
    assert.ok(!(key in view), `providerRequestView emitted „${key}"`)
  }
  // …and it still returns what a provider needs to decide.
  assert.equal(view.placesLeft, 2)
  assert.equal(view.description, row.description)

  // The provider-facing SURFACES go through it rather than picking their own
  // columns — the assertion that makes the one above worth anything.
  for (const f of ['app/provider/requests/page.tsx', 'app/provider/requests/[id]/page.tsx']) {
    const body = codeOf(f)
    assert.match(body, /providerRequestView/, `${f} shapes the row itself`)
    for (const col of ['contactName', 'phone: true', 'adminNote']) {
      assert.ok(!body.includes(col), `${f} selects „${col}" — a provider must never receive it`)
    }
  }
})

test('a provider gets the client‘s contact only once their offer is ACCEPTED', () => {
  const contact = { contactName: 'ნინო მაგალიძე', phone: '+995555123456', email: 'nino@example.ge' }
  // Every status the column can hold, so a value added later fails loudly here
  // rather than defaulting into the revealing branch.
  for (const status of ['SENT', 'WITHDRAWN', 'DECLINED']) {
    assert.equal(clientContactFor({ status }, contact), null, `contact revealed on a ${status} offer`)
  }
  assert.deepEqual(clientContactFor({ status: 'ACCEPTED' }, contact), contact)
  // Null and NOT a redacted object: an object of empty strings is a shape a UI
  // renders as a blank „ტელეფონი:" row and a careless `??` fills from
  // somewhere else. Absent is unambiguous.
  assert.equal(clientContactFor({ status: 'SENT' }, contact), null)

  // The screen where a chosen provider reads it does go through the function.
  const offers = codeOf('app/provider/offers/page.tsx')
  assert.match(offers, /clientContactFor\(/, 'the offers page picks its own contact columns')
  assert.ok(!offers.includes('adminNote'), 'the offers page selects the admin‘s private note')
})

test('a client gets the provider‘s contact only on the offer they accepted', () => {
  // The mirror of the rule above, written once so the two sides cannot drift.
  const base = {
    id: 'o1', priceGel: 1200, daysEstimate: 10, message: 'გავაკეთებ',
    createdAt: new Date('2026-08-14T10:00:00Z'),
    provider: { name: 'ბესიკ მაგალიძე', phone: '+995599111222', email: 'besik@example.ge' },
  }
  for (const status of ['SENT', 'WITHDRAWN', 'DECLINED']) {
    const v = clientOfferView({ ...base, status })
    assert.equal(v.providerPhone, null, `provider phone shown on a ${status} offer`)
    assert.equal(v.providerEmail, null, `provider email shown on a ${status} offer`)
    // The NAME is always shown — it is what the client is choosing between.
    assert.equal(v.providerName, 'ბესიკ მაგალიძე')
    assert.ok(!JSON.stringify(v).includes('+995599111222'))
  }
  const accepted = clientOfferView({ ...base, status: 'ACCEPTED' })
  assert.equal(accepted.providerPhone, '+995599111222')
  assert.equal(accepted.providerEmail, 'besik@example.ge')

  const page = codeOf('app/request/[ref]/page.tsx')
  assert.match(page, /clientOfferView\(/, 'the client page shapes offers itself')
  assert.ok(!page.includes('adminNote'), 'the client page selects the admin‘s private note about them')
})

/* ═══════════ 5. the place limit holds under concurrency ════════════════ */

test('the place is CLAIMED conditionally, never counted then written', () => {
  // „A status check you read before the write is not a guard" (CLAUDE.md).
  // Three providers submitting in the same second would each count two existing
  // offers, each decide there is room, and the client would open a page with
  // four offers on a request they were promised three of.
  //
  // Comments and imports stripped: this route explains the pattern in prose and
  // QUOTES THE STATEMENT ITSELF in its header, so the raw file would satisfy
  // every assertion below without a line of code behind them.
  const route = codeOf('app/api/provider/offers/route.ts')

  const claim = route.slice(route.indexOf('prisma.serviceRequest.updateMany'))
  assert.match(claim, /status: 'VERIFIED'/, 'the claim does not carry the expected status')
  assert.match(claim, /offerCount: \{ lt: prisma\.serviceRequest\.fields\.offerLimit \}/,
    'the claim no longer compares the counter to the limit in the database')
  assert.match(claim, /offerCount: \{ increment: 1 \}/, 'the claim does not take the place')
  assert.match(route, /claimed\.count !== 1/, 'the claim result is not checked')
  assert.match(route, /status: 409/, 'a lost claim must answer 409')

  // The claim happens BEFORE the offer is written. Reversed, the row would
  // exist while the place was still unclaimed.
  assert.ok(
    route.indexOf('updateMany') < route.indexOf('requestOffer.create'),
    'the offer is written before its place is claimed',
  )
  // …and there is no read-then-write anywhere near it. `findUnique`/`count` on
  // the request before the claim is exactly the bug this is preventing.
  const beforeClaim = route.slice(0, route.indexOf('prisma.serviceRequest.updateMany'))
  assert.doesNotMatch(beforeClaim, /serviceRequest\.(findUnique|findFirst|count)/,
    'the route reads the request before claiming it — a second tab beats that every time')

  // The place is GIVEN BACK when the offer fails. Without this, every failure
  // leaks a place and a three-place request silently accepts two.
  assert.match(route, /offerCount: \{ decrement: 1 \}/,
    'a failed insert no longer releases the place it claimed')
  assert.match(route, /offerCount: \{ gt: 0 \}/,
    'the release is unguarded — a double release would drive the counter negative')
  assert.ok(
    route.indexOf('decrement') > route.indexOf('requestOffer.create'),
    'the release runs before the insert it is releasing for',
  )
})

test('the database refuses a fourth offer even if the endpoint is bypassed', () => {
  // The claim is what enforces the limit; this is the backstop for anything
  // that ever writes the table without going through it. Both the boot DDL and
  // the reviewable migration carry it, and they must stay identical.
  for (const f of ['lib/dbBoot.ts', 'prisma/manual-migrations/2026-08-14-requests/up.sql']) {
    const src = read(f)
    assert.match(src, /CHECK \("offerCount" >= 0 AND "offerCount" <= "offerLimit"\)/,
      `${f} has lost the offerCount CHECK`)
    assert.match(src, /"RequestOffer_exactly_one_provider" CHECK/,
      `${f} has lost the one-provider CHECK`)
  }
  // Lowering the limit under what has already arrived would violate that CHECK
  // and surface as a 500 on a dropdown, so the admin route answers it properly.
  assert.match(codeOf('app/api/admin/requests/[id]/route.ts'), /LIMIT_BELOW_RECEIVED/)
})

test('accepting an offer is claimed the same way', () => {
  // Two tabs must not both accept: the client would have promised the work to
  // two providers, each of whom now has their phone number.
  const route = codeOf('app/api/requests/[ref]/accept/route.ts')
  const claim = route.slice(route.indexOf('prisma.serviceRequest.updateMany'))
  assert.match(claim, /status: 'VERIFIED'/)
  assert.match(claim, /status: 'MATCHED'/)
  assert.match(route, /claimed\.count !== 1/)
  assert.match(route, /status: 409/)
  assert.ok(
    route.indexOf('updateMany') < route.indexOf("status: 'ACCEPTED'"),
    'the offer is accepted before the request is claimed',
  )
  // Every other offer is declined in the same breath — leaving them SENT shows
  // three providers a live offer on a request that is settled.
  assert.match(route, /status: 'DECLINED'/)
})

test('the place arithmetic is the same on both sides of the wire', () => {
  assert.equal(placesLeft({ offerCount: 0, offerLimit: 3 }), 3)
  assert.equal(placesLeft({ offerCount: 3, offerLimit: 3 }), 0)
  // Never negative: a row that somehow went over reads as „full" rather than as
  // a negative badge on a card.
  assert.equal(placesLeft({ offerCount: 5, offerLimit: 3 }), 0)

  assert.equal(requestIsOpen({ status: 'VERIFIED', offerCount: 2, offerLimit: 3 }), true)
  assert.equal(requestIsOpen({ status: 'VERIFIED', offerCount: 3, offerLimit: 3 }), false)
  // Only VERIFIED is open. NEW is unchecked, MATCHED is settled, and neither
  // REJECTED nor CLOSED is anybody's business.
  for (const status of ['NEW', 'REJECTED', 'MATCHED', 'CLOSED']) {
    assert.equal(requestIsOpen({ status, offerCount: 0, offerLimit: 3 }), false, `${status} reads as open`)
  }
})

/* ═══════════ 6. the budget floor ═══════════════════════════════════════ */

test('a below-floor request is STORED, with status REJECTED — per kind', () => {
  // Both halves matter and they pull in opposite directions. The request is
  // refused because nobody here can deliver against it — and the row is kept
  // because „how many people arrive with 300₾" is exactly what an early stage
  // exists to find out, and it is unrecoverable if the endpoint drops it.
  //
  // PER KIND, and this loop is why the rule is data rather than a comparison:
  // 20₾ is below the floor for a LESSON and absurd as a floor for a PROJECT.
  // The first hard-coded version would have refused every tutoring request.
  for (const kind of REQUEST_KINDS) {
    const bands = BUDGET_BANDS[kind]
    // Exactly one floor band per ladder, and it is the bottom one — a floor in
    // the middle would mean an acceptable band below a refused one.
    assert.equal(bands.filter(b => b.floor).length, 1, `${kind} has ${bands.filter(b => b.floor).length} floor bands`)
    assert.ok(bands[0].floor, `${kind}'s floor is not its bottom band`)
    for (const b of bands) {
      assert.equal(budgetIsBelowFloor(kind, b.id), b.floor === true, `${kind}/${b.id}`)
    }
    // An unknown band id is NOT below the floor — it is invalid, and zod
    // refuses it before this question is ever asked.
    assert.equal(budgetIsBelowFloor(kind, 'nope'), false)
  }

  const route = codeOf('app/api/requests/route.ts')
  assert.match(route, /const rejected = budgetIsBelowFloor\(parsed\.data\.kind, parsed\.data\.budgetBand\)/,
    'the endpoint no longer applies the per-kind floor')
  assert.match(route, /status: rejected \? 'REJECTED' : 'NEW'/,
    'a below-floor request no longer lands as REJECTED')
  // THE ROW IS STILL WRITTEN. If this ever becomes an early return, the
  // measurement is gone and nothing says so.
  const beforeCreate = route.slice(0, route.indexOf('createServiceRequest'))
  assert.doesNotMatch(beforeCreate, /if \(rejected\)[\s\S]{0,80}return/,
    'a below-floor request is dropped instead of stored — that is the measurement')
  // …and it is not mailed: nobody is going to phone it, so a mail about it only
  // trains the reader to ignore the subject line.
  assert.match(route, /if \(!rejected\) \{\s*after\(/,
    'a refused request still sends the admin an email')
})

test('the vocabulary holds together', () => {
  // The topic list is the product now (thumbtack-shaped: hundreds of services,
  // one entry point), so its internal consistency is a feature, not hygiene.
  const ids = TOPIC_GROUPS.flatMap(g => g.topics.map(t => t.id))
  assert.equal(new Set(ids).size, ids.length, 'duplicate topic ids — the stored slug would be ambiguous')
  assert.ok(ids.length >= 100, `only ${ids.length} topics — the catalogue shrank`)

  // Every kind has groups, and LEARNING actually carries the school subjects
  // this whole redesign happened for.
  for (const kind of REQUEST_KINDS) {
    assert.ok(groupsForKind(kind).length > 0, `${kind} has no topic groups`)
  }
  assert.ok(isTopicOfKind('LEARNING', 'chemistry'), 'ქიმია fell out of LEARNING')
  assert.ok(!isTopicOfKind('PROJECT', 'chemistry'), 'ქიმია leaked into PROJECT')
  // „სხვა" belongs to every kind — the escape hatch is the most valuable row.
  for (const kind of REQUEST_KINDS) {
    assert.ok(isTopicOfKind(kind, 'other'), `${kind} lost its „სხვა"`)
  }

  // Georgian declines by stem change, and people type the declined form. These
  // are the queries a real person types, executed for real.
  for (const [kind, q, expected] of [
    ['LEARNING', 'ქიმიის', 'chemistry'],
    ['LEARNING', 'ინგლისურის', 'english'],
    ['PROJECT', 'ვებგვერდის', 'website'],
    ['CONSULTATION', 'ხელშეკრულებას', 'contract'],
  ] as const) {
    const hits = searchTopics(kind, q)
    assert.ok(hits.some(h => h.topic.id === expected),
      `„${q}" did not find ${expected} — got ${hits.map(h => h.topic.id).join(', ') || 'nothing'}`)
  }

  // The label always carries the unit — a price with no unit is a different
  // number on every screen that guesses one.
  assert.equal(budgetLabel('LEARNING', 20, 40), '20–40₾ ერთ გაკვეთილზე')
  assert.equal(budgetLabel('PROJECT', 15000, null), '15 000₾-ზე მეტი მთლიანად')
})

test('every direction has a description template', () => {
  // The empty textarea is the abandonment point — see the block comment in
  // lib/requestTopics. Every group carries its own scaffold, and the fallback
  // covers anything that ever ships without one, so templateFor can never hand
  // the wizard an empty string.
  for (const g of TOPIC_GROUPS) {
    assert.ok(g.template && g.template.length > 20, `group ${g.id} has no template`)
    // The blanks are „…" — visibly unfinished, so a half-filled template looks
    // half-filled rather than submitted-looking.
    assert.ok(g.template!.includes('…'), `group ${g.id}'s template has no blanks`)
    // Newlines are real: the scaffold is a list to fill, not a sentence.
    assert.ok(g.template!.includes('\n'), `group ${g.id}'s template is one line`)
  }
  for (const kind of REQUEST_KINDS) {
    for (const g of groupsForKind(kind)) {
      for (const t of g.topics.slice(0, 2)) {
        const tpl = templateFor(kind, t.id)
        assert.ok(tpl.length > 20 && tpl.includes('…'), `${kind}/${t.id} template broken`)
      }
    }
    // …and the escape hatch gets the kind fallback rather than nothing.
    assert.ok(templateFor(kind, 'other').includes('…'), `${kind}/other has no template`)
  }
})

test('the run is one question per screen, derived from the draft', () => {
  // The reference model (owner, 2026-08-17): profi-style single-question
  // screens, the kind folding away when the topic answers it, free text
  // optional at the end. These are the routing rules the wizard runs on,
  // executed rather than described.
  const { withTopic, stepsFor, stepComplete, resumeStepId, EMPTY_DRAFT } =
    require('../app/request/_model') as typeof import('../app/request/_model')

  // Unambiguous topic → no kind screen; the clarifiers splice in from the
  // vocabulary; the free-text screen is skippable; contact is LAST — it is
  // the whole „registration" and nothing may come after it.
  const chem = withTopic(EMPTY_DRAFT, 'chemistry')
  const chemRun = stepsFor(chem).map(st => st.id)
  assert.deepEqual(chemRun,
    ['what', 'extra:audience', 'extra:level', 'budget', 'timing', 'format', 'details', 'contact'])
  assert.ok(stepsFor(chem).find(st => st.id === 'details')!.skippable, 'the free-text screen became required')
  assert.ok(stepsFor(chem).find(st => st.id === 'extra:audience')!.skippable, 'a clarifier became required')

  // Ambiguous topic → the kind screen survives, and no clarifiers exist for
  // professional kinds today.
  const con = withTopic(EMPTY_DRAFT, 'contract')
  assert.deepEqual(stepsFor(con).map(st => st.id),
    ['what', 'kind', 'budget', 'timing', 'format', 'details', 'contact'])

  // Titles speak the kind's own words once it is known.
  assert.ok(stepsFor(chem).find(st => st.id === 'budget')!.title.includes('ერთ გაკვეთილზე'))

  // Resume: a draft with budget answered but no timing lands on timing —
  // never dragged back to a skipped clarifier, never overshot to contact.
  const mid = { ...chem, budgetBand: 'l2' }
  assert.equal(resumeStepId(mid), 'timing')
  // …and a virgin restored draft with only the topic resumes at the first
  // unanswered clarifier (the frontier).
  assert.equal(resumeStepId(chem), 'extra:audience')

  // The description is OPTIONAL now — the schema accepts an empty one, because
  // the structured answers carry the request and the admin phones anyway.
  assert.equal(stepComplete('details', chem), true)
  assert.equal(ServiceRequestInput.safeParse({
    kind: 'LEARNING', topic: 'chemistry', description: '',
    budgetBand: 'l2', timing: 'twice_week', format: 'ONLINE', city: 'TBILISI',
    contactName: 'ნინო მაგალიძე', phone: '555123456', email: 'nino@example.ge',
  }).success, true, 'an empty description is rejected — the essay wall is back')

  // Cross-kind topic switch still clears the kind-scoped answers.
  const cross = withTopic({ ...chem, budgetBand: 'l2', timing: 'twice_week' }, 'contract')
  assert.equal(cross.kind, '')
  assert.equal(cross.budgetBand, '')
})

test('the conversation opens before the choice and never leaks the contact', () => {
  // The reference model: a client talks to several providers and THEN picks.
  // That does not weaken the seal — it is what makes it survivable, because
  // the alternative is choosing blind or handing out a number to ask one
  // question. lib/requestChat carries the whole argument.
  const {
    chatIsOpen, chatClosedReason, maskContacts, unreadFor, chatMessageView,
  } = require('../lib/requestChat') as typeof import('../lib/requestChat')

  // Open from the moment an offer exists; closed once somebody ELSE won.
  assert.equal(chatIsOpen({ status: 'VERIFIED' }, { status: 'SENT' }), true)
  assert.equal(chatIsOpen({ status: 'MATCHED' }, { status: 'ACCEPTED' }), true)
  assert.equal(chatIsOpen({ status: 'MATCHED' }, { status: 'DECLINED' }), false,
    'a losing bidder can keep pitching after the decision')
  assert.equal(chatIsOpen({ status: 'VERIFIED' }, { status: 'WITHDRAWN' }), false)
  assert.equal(chatIsOpen({ status: 'NEW' }, { status: 'SENT' }), false)
  assert.equal(chatIsOpen({ status: 'CLOSED' }, { status: 'SENT' }), false)
  // A closed thread SAYS why — vanishing would read as a bug.
  assert.ok(chatClosedReason({ status: 'MATCHED' }, { status: 'DECLINED' }))
  assert.equal(chatClosedReason({ status: 'VERIFIED' }, { status: 'SENT' }), null)

  // ⚠️ THE CONTACT FIREWALL. The disintermediation research names in-app
  // messaging as THE leak, and here the stake is the product itself: „we open
  // the contact when you choose" is the promise, and a number pasted into the
  // first message takes the choice from the client and the record from us.
  for (const leak of [
    'დამირეკე 555 98 76 54',
    'ჩემი ნომერია +995 599 11 22 33',
    'მომწერე nino@example.ge-ზე',
    'ჩემი ტელეგრამია @besiki_teacher',
  ]) {
    const r = maskContacts(leak, false)
    assert.equal(r.masked, true, `a contact rode through: ${leak}`)
    assert.ok(!/\d{6,}/.test(r.body.replace(/\s/g, '')), `digits survived: ${r.body}`)
    assert.ok(!r.body.includes('@example.ge'))
  }
  // …and it must not eat ordinary sentences. A masked timetable would make the
  // firewall the thing people work around.
  for (const clean of [
    'ორშაბათს 10:00 საათზე შემიძლია',
    '40 წუთი გაკვეთილი, კვირაში 2 ჯერ',
    'ფასი 50₾ მაქვს',
  ]) {
    assert.equal(maskContacts(clean, false).masked, false, `a clean sentence was masked: ${clean}`)
  }
  // Once the contact IS open, scrubbing a number both parties can read on the
  // same screen would be theatre.
  assert.equal(maskContacts('დამირეკე 555987654', true).masked, false)

  // Each side reads its own bubbles and only ITS unread count.
  const rows = [
    { id: 'a', fromClient: true, body: 'q', createdAt: new Date(), readByClientAt: null, readByProviderAt: null },
    { id: 'b', fromClient: false, body: 'a', createdAt: new Date(), readByClientAt: null, readByProviderAt: null },
  ]
  assert.equal(unreadFor(rows, 'CLIENT'), 1)
  assert.equal(unreadFor(rows, 'PROVIDER'), 1)
  assert.equal(chatMessageView(rows[0], 'CLIENT').mine, true)
  assert.equal(chatMessageView(rows[0], 'PROVIDER').mine, false)

  // ⚠️ THE SIDE IS DERIVED, NEVER DECLARED — a `side` in the body is exactly
  // what a crafted request would lie about. The endpoint proves the client by
  // the REF and the provider by the SESSION, and answers 404 to everything
  // else (403 would confirm the thread exists).
  const route = codeOf('app/api/request-chat/route.ts')
  assert.doesNotMatch(route, /body\.side|data\.side/, 'the caller declares its own side')
  assert.match(route, /normalizePublicRef\(ref\)/, 'the client is no longer proven by the reference')
  assert.match(route, /viewer\.provider/, 'the provider is no longer proven by the session')
  assert.doesNotMatch(route, /status: 403/, 'the chat endpoint answers 403 — it confirms the thread exists')
  // The masking happens on the WRITE, so the stored row is already clean and
  // no later reader (or notification email) can spill what was removed.
  assert.ok(route.indexOf('maskContacts') < route.indexOf('requestMessage.create'),
    'the message is stored before it is masked')

  // ⚠️ „A PROVIDER MESSAGE NAMES ITS AUTHOR" LIVES HERE, not in the database.
  // The table's CHECK holds only the security direction (a client message
  // carries no author); the mirror half was removed because it collided with
  // the SET NULL on that column and made a provider who had ever written one
  // sentence undeletable — see lib/dbBoot and tests/userDeletion.test.ts §C.
  // What the CHECK gave up, this assertion keeps: the single writer sets the
  // author from the SESSION, on the provider side, in the same expression that
  // nulls it for the client.
  assert.match(route, /fromClient:\s*r\.side === 'CLIENT'/,
    'the stored side is no longer derived from the resolved side')
  assert.match(route, /fromUserId:\s*r\.side === 'CLIENT' \? null : \(viewer\.user\?\.id/,
    'a provider message no longer takes its author from the session — nothing checks this in the database')
})

test('the automation routes, nudges once, and sweeps', () => {
  // The back-office layer (owner, 2026-08-17: automate connecting requests to
  // the right experts). Executed rather than described — every one of these is
  // a decision the cron makes unattended.
  const {
    routeRequest, needsProviderNudge, needsClientNudge, shouldAutoClose,
  } = require('../lib/requestRouting') as typeof import('../lib/requestRouting')
  const H = 3_600_000, D = 86_400_000
  const now = Date.parse('2026-08-17T12:00:00Z')
  const providers = [
    { userId: 'chem', categoryId: null },
    { userId: 'law1', categoryId: 'cat-law' },
    { userId: 'law2', categoryId: 'cat-law' },
    { userId: 'mkt', categoryId: 'cat-mkt' },
    { userId: 'co', categoryId: null, isCompanyMember: true },
  ]

  // ROUTED by sphere agreement — a fact, never a score.
  const law = routeRequest('cat-law', providers)
  assert.equal(law.audience, 'TARGETED')
  assert.deepEqual(law.recipients.sort(), ['law1', 'law2'])

  // ⚠️ THE FALLBACK IS THE POINT, twice over: a topic with no sphere (every
  // school subject) and a sphere nobody serves must BOTH reach everybody. A
  // targeted list that came back empty and mailed nobody would silently bury
  // exactly the demand this platform exists to discover.
  assert.equal(routeRequest(null, providers).audience, 'EVERYONE')
  assert.equal(routeRequest(null, providers).recipients.length, 5)
  assert.equal(routeRequest('cat-nobody', providers).audience, 'EVERYONE')
  assert.equal(routeRequest('cat-nobody', providers).recipients.length, 5)
  // A company member has no sphere, so they never crowd out a targeted list.
  assert.ok(!law.recipients.includes('co'))

  const base = {
    id: 'r', status: 'VERIFIED', offerCount: 0,
    createdAt: new Date(now - 7 * D), updatedAt: new Date(now - 7 * D),
    verifiedAt: new Date(now - 7 * H), providerNudgeAt: null, clientNudgeAt: null,
  }
  // ONCE — the flag is the idempotency, because the cron ticks every 15
  // minutes and every tick inside the window would otherwise re-send.
  assert.equal(needsProviderNudge(base, now), true)
  assert.equal(needsProviderNudge({ ...base, providerNudgeAt: new Date(now - H) }, now), false)
  assert.equal(needsProviderNudge({ ...base, verifiedAt: new Date(now - 2 * H) }, now), false)
  // An answered request is not unanswered.
  assert.equal(needsProviderNudge({ ...base, offerCount: 1 }, now), false)

  assert.equal(needsClientNudge({ ...base, offerCount: 2, verifiedAt: new Date(now - 49 * H) }, now), true)
  assert.equal(needsClientNudge({ ...base, offerCount: 0, verifiedAt: new Date(now - 49 * H) }, now), false)

  assert.equal(shouldAutoClose({ ...base, verifiedAt: new Date(now - 15 * D) }, now), true)
  // ⚠️ MATCHED closes off `updatedAt`, never `createdAt`. With createdAt a
  // request submitted five weeks ago and matched YESTERDAY would close today,
  // taking a live introduction off the client's page — silent, and only
  // visible to the two people it happened to.
  assert.equal(shouldAutoClose({
    ...base, status: 'MATCHED', createdAt: new Date(now - 40 * D), updatedAt: new Date(now - 1 * D),
  }, now), false)
  assert.equal(shouldAutoClose({ ...base, status: 'MATCHED', updatedAt: new Date(now - 31 * D) }, now), true)
  // NEW is nobody's business until an admin has phoned it.
  assert.equal(shouldAutoClose({ ...base, status: 'NEW' }, now), false)

  // ⚠️ THE AUTOMATION NEVER MAKES THE CALL. Verification, acceptance and the
  // contact reveal are the three moments the product is made of, and the cron
  // must not touch any of them — the admin's phone call is the quality gate
  // that separates this from the lead-mills.
  const jobs = codeOf('lib/requestJobs.ts')
  assert.doesNotMatch(jobs, /status: 'VERIFIED' \}[\s\S]{0,40}data:/, 'a job verifies requests')
  assert.doesNotMatch(jobs, /'ACCEPTED'/, 'a job accepts offers')
  assert.doesNotMatch(jobs, /contactName|\bphone\b/, 'a job touches the client contact')
  // The nudge CLAIMS before it sends — a crash mid-send must cost one mail,
  // never a loop every 15 minutes.
  // Scoped to the nudge job itself: `sendMail` appears earlier in the file in
  // mailVerifiedRequest, which has no flag to claim, so a whole-file index
  // comparison measured the wrong two things.
  //
  // ⚠️ ANCHORED ON CODE, NEVER ON A COMMENT MARKER. `codeOf` strips comments
  // by design, so a slice bounded by „// ── 2. Unanswered" silently became
  // slice(-1, -1) — an empty string every assertion then passed against.
  const nudgeBlock = jobs.slice(jobs.indexOf('providerNudgeAt: null'), jobs.indexOf('clientNudgeAt: null'))
  assert.ok(nudgeBlock.indexOf('providerNudgeAt: new Date(now)') < nudgeBlock.indexOf('sendMail'),
    'the nudge sends before it claims — a crash would re-send forever')
  // ⚠️ The SWEEP runs before the nudges: a fifteen-day-dead request must not
  // be mailed about and closed in the same tick. Found by firing the real cron
  // (2026-08-17) — it reported two nudges where one was honest.
  assert.ok(jobs.indexOf("status: 'CLOSED'") < jobs.indexOf('providerNudgeAt: new Date(now)'),
    'the sweep runs after the nudges — dead rows get mailed about')

  // And the cron only runs it when the subsystem is on.
  assert.match(codeOf('app/api/internal/cleanup/route.ts'), /requestsOn\(\)\s*\n?\s*\? await runRequestJobs/,
    'the request jobs run on deployments where the subsystem is off')
})

test('the live layer and the budget-fit line hold', () => {
  // Liveness is polling through the ONE render path (router.refresh), never a
  // second delivery channel — and it exists only where there is something to
  // wait for.
  const auto = codeOf('components/AutoRefresh.tsx')
  assert.match(auto, /router\.refresh\(\)/, 'AutoRefresh grew its own data channel')
  assert.match(auto, /visibilityState/, 'AutoRefresh polls hidden tabs')
  assert.match(codeOf('app/request/[ref]/page.tsx'),
    /\(request\.status === 'NEW' \|\| request\.status === 'VERIFIED'\) && <AutoRefresh/,
    'the client page promises liveness on settled requests too')
  assert.match(codeOf('app/provider/requests/page.tsx'), /<AutoRefresh/,
    'the provider queue lost its live refresh')

  // The budget-fit line: warning above the band, never a BLOCK — an expert
  // worth more than the band must still be able to say so.
  const form = codeOf('app/provider/requests/[id]/OfferForm.tsx')
  assert.match(form, /კლიენტის ბიუჯეტშია/, 'the in-budget confirmation is gone')
  assert.match(form, /text-warning-700/, 'above-budget lost its caution tone')
  assert.doesNotMatch(form, /disabled=\{[^}]*fit/, 'the fit line became a block')

  // The admin rail badge rides the same stats fetch as every other queue.
  assert.match(codeOf('app/api/admin/stats/route.ts'), /newRequests/,
    'the stats endpoint no longer counts unverified requests')
  assert.match(codeOf('app/admin/_nav.tsx'), /if \(id === 'requests'\) return newRequests \?\? 0/,
    'the requests tab lost its badge')
})

test('the clarifying answers are stripped against the question list', () => {
  // The `details` column is free-form only in SHAPE. normalizeExtras is the
  // door: off-list keys and values do not survive to the database, so a crafted
  // POST cannot store a script tag under „audience" and a renamed option cannot
  // leave an unreadable id behind.
  assert.ok(extrasFor('LEARNING').length >= 2, 'LEARNING lost its clarifying questions')
  assert.equal(extrasFor('CONSULTATION').length, 0)
  assert.equal(extrasFor('PROJECT').length, 0)

  assert.deepEqual(
    normalizeExtras('LEARNING', 'chemistry', { audience: 'abiturient', level: 'intermediate' }),
    { audience: 'abiturient', level: 'intermediate' },
  )
  // Off-list content is DROPPED, silently — the trap for a crafted body.
  assert.deepEqual(
    normalizeExtras('LEARNING', 'chemistry', {
      audience: 'abiturient',
      level: '<script>alert(1)</script>',
      injected: 'nope',
    }),
    { audience: 'abiturient' },
  )
  // Nothing legal → null, never {} — the column must read „nothing to clarify".
  assert.equal(normalizeExtras('LEARNING', 'chemistry', { junk: 'x' }), null)
  assert.equal(normalizeExtras('CONSULTATION', 'contract', { audience: 'pupil' }), null)
  assert.equal(normalizeExtras('LEARNING', 'chemistry', 'garbage'), null)
  assert.equal(normalizeExtras('LEARNING', 'chemistry', ['a']), null)

  // The rendered labels come from the same list, in the questions' own order —
  // and a poisoned bag renders nothing rather than its own content.
  assert.deepEqual(
    extrasLabels('LEARNING', 'chemistry', { level: 'beginner', audience: 'pupil' }),
    [{ label: 'ვისთვის', value: 'სკოლის მოსწავლე' }, { label: 'რა დონეა', value: 'დამწყები' }],
  )
  assert.deepEqual(extrasLabels('LEARNING', 'chemistry', { level: 'hacked' }), [])

  // …and the row builder routes through the strip: the schema ACCEPTS a bag
  // with junk (so an old client is not rejected), the row stores only the
  // legal part.
  const row = serviceRequestRow({
    kind: 'LEARNING', topic: 'chemistry',
    description: 'ვეძებ ქიმიის მასწავლებელს მეათეკლასელისთვის, ეროვნულებისთვის მზადება გვინდა.',
    budgetBand: 'l2', timing: 'twice_week', format: 'ONLINE', city: 'TBILISI',
    contactName: 'ნინო', phone: '555123456', email: '',
    details: { audience: 'abiturient', dropme: 'x' },
  } as any)
  assert.deepEqual(row.details, { audience: 'abiturient' })
})

/* ═══════════ 7. the reference ══════════════════════════════════════════ */

test('the reference survives being read down a phone line', () => {
  // O/0 and I/1 are the same sound and nearly the same glyph, and this code's
  // whole job is to be dictated. All four are out of the alphabet.
  for (const c of ['O', '0', 'I', '1']) {
    assert.ok(!REF_ALPHABET.includes(c), `„${c}" is back in the reference alphabet`)
  }
  // 32 symbols is what makes the byte→symbol mapping unbiased: five bits map
  // onto it exactly, with no modulo skew and no rejection sampling.
  assert.equal(REF_ALPHABET.length, 32)
  assert.equal(new Set(REF_ALPHABET).size, 32, 'the alphabet has a duplicate symbol')

  // Every byte value produces a legal reference — including the ones above 31,
  // which is the whole point of the mask.
  for (let b = 0; b < 256; b += 7) {
    const ref = makePublicRef(new Uint8Array([b, b + 1, b + 2, b + 3, b + 4, b + 5, b + 6, b + 7]))
    assert.match(ref, PUBLIC_REF_RE, `byte ${b} produced „${ref}"`)
  }
  assert.equal(makePublicRef(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])), 'MC-22222')
  // Too few bytes throws rather than silently producing a short reference —
  // „MC-2" would be one of 32 codes and would still look like a reference.
  assert.throws(() => makePublicRef(new Uint8Array([1, 2])))

  // What a person retyping off a phone call actually does: lower case, and
  // forgetting the prefix. Neither is a different request.
  assert.equal(normalizePublicRef('MC-7A4K2'), 'MC-7A4K2')
  assert.equal(normalizePublicRef('mc-7a4k2'), 'MC-7A4K2')
  assert.equal(normalizePublicRef('7a4k2'), 'MC-7A4K2')
  assert.equal(normalizePublicRef(' MC-7A4K2 '), 'MC-7A4K2')
  // …and what is simply not a reference, answered without a database round-trip.
  for (const bad of ['', 'MC-', 'MC-7A4K', 'MC-7A4K23', 'MC-7A4KO', 'MC-7A4K0', '../../etc', null, undefined]) {
    assert.equal(normalizePublicRef(bad), null, `„${String(bad)}" was accepted as a reference`)
  }

  // It is minted from CRYPTO randomness — the reference alone opens a page that
  // carries a phone number, so a sequence or Math.random would be a real hole.
  const server = codeOf('lib/requestsServer.ts')
  assert.match(server, /randomBytes/, 'the reference is no longer crypto-random')
  assert.doesNotMatch(server, /Math\.random/, 'the reference is minted from Math.random')
  // A collision is retried rather than 500ing on a form somebody filled in from
  // their phone.
  assert.match(server, /P2002/)
})

/* ═══════════ 8. validation ═════════════════════════════════════════════ */

test('the form and the API judge a request by the SAME schema', () => {
  // Two hand-written copies of „what is valid" is how a field ends up accepted
  // by the browser and rejected by the server. This project has been bitten
  // twice by exactly that gap — certificates max(500), blog covers max(2000),
  // both named in the pre-deploy gate's own header.
  // The wizard validates in TWO places and both are load-bearing: _model runs
  // the schema as the last step's completion gate, and RequestWizard runs it
  // once more at submit (the draft can change between „ready" and „sent").
  for (const f of ['app/request/_model.ts', 'app/request/RequestWizard.tsx', 'app/api/requests/route.ts']) {
    assert.match(read(f), /ServiceRequestInput/, `${f} does not use the shared schema`)
  }
  for (const f of ['app/provider/requests/[id]/OfferForm.tsx', 'app/api/provider/offers/route.ts']) {
    assert.match(read(f), /RequestOfferInput/, `${f} does not use the shared schema`)
  }
})

test('the ceilings admit what a person actually types', () => {
  // Pinned as VALUES rather than as source text, so a ceiling cannot be quietly
  // tightened into the certificates bug.
  const ok = {
    kind: 'CONSULTATION',
    topic: 'accounting',
    description: 'ვეძებ ბუღალტერს შპს-სთვის, საგადასახადო შემოწმება მოვიდა და დახმარება მჭირდება.',
    budgetBand: 'c2', timing: 'this_week', format: 'ONLINE', city: 'TBILISI',
    contactName: 'ნინო მაგალიძე', phone: '555123456', email: 'nino@example.ge',
  }
  assert.equal(ServiceRequestInput.safeParse(ok).success, true, 'a minimal real request is rejected')
  // …and a teaching one, which is the audience this redesign happened for.
  assert.equal(ServiceRequestInput.safeParse({
    ...ok, kind: 'LEARNING', topic: 'chemistry', budgetBand: 'l2', timing: 'twice_week',
  }).success, true, 'a tutoring request is rejected')
  // Somebody describing what they need writes at least as much as somebody
  // asking a support question — the 4000 /api/contact allows.
  assert.equal(ServiceRequestInput.safeParse({ ...ok, description: 'ა'.repeat(4000) }).success, true,
    'the description ceiling is below what a person writes')
  // The description is OPTIONAL (the reference decision — the admin's call is
  // the quality gate), so a short one is simply a short one.
  assert.equal(ServiceRequestInput.safeParse({ ...ok, description: 'მჭირდება იურისტი' }).success, true)
  assert.equal(ServiceRequestInput.safeParse({ ...ok, description: '' }).success, true)
  // A foreign number with its country code — the diaspora case lib/phone exists
  // to admit, and this form gets it for free by using THE phone rule.
  assert.equal(ServiceRequestInput.safeParse({ ...ok, phone: '+4915112345678' }).success, true)
  assert.equal(ServiceRequestInput.safeParse({ ...ok, phone: '123' }).success, false)

  // ── THE CROSS-FIELD RULES — the reason these are not DB enums ──────────
  // Three answers only mean anything beside the kind they were given for, and
  // each mismatch is refused: a chemistry topic on a legal project, a
  // per-lesson band on a project, a frequency on a consultation.
  assert.equal(ServiceRequestInput.safeParse({ ...ok, topic: 'chemistry' }).success, false,
    'a LEARNING topic was accepted on a CONSULTATION')
  assert.equal(ServiceRequestInput.safeParse({ ...ok, budgetBand: 'l2' }).success, false,
    'a per-lesson band was accepted on a consultation')
  assert.equal(ServiceRequestInput.safeParse({ ...ok, timing: 'twice_week' }).success, false,
    'a learning frequency was accepted on a consultation')
  // „სხვა" is legal on EVERY kind — the escape hatch must never be the thing
  // validation refuses.
  for (const kind of REQUEST_KINDS) {
    const bands = BUDGET_BANDS[kind]
    assert.equal(ServiceRequestInput.safeParse({
      ...ok, kind, topic: 'other', budgetBand: bands[1].id, timing: TIMING[kind][0].id,
    }).success, true, `„სხვა" is refused on ${kind}`)
  }
  // The budget cannot be left empty — it is the field that decides whether the
  // request is worth a phone call.
  assert.equal(ServiceRequestInput.safeParse({ ...ok, budgetBand: '' }).success, false)
  assert.equal(ServiceRequestInput.safeParse({ ...ok, budgetBand: undefined }).success, false)

  const offer = { requestId: 'req_1', priceGel: 1200, message: 'გავაკეთებ სრულ აუდიტს ორ კვირაში.' }
  assert.equal(RequestOfferInput.safeParse(offer).success, true, 'a minimal real offer is rejected')
  assert.equal(RequestOfferInput.safeParse({ ...offer, message: 'ა'.repeat(4000) }).success, true)
  // A number with no sentence beside it is a guess, not an offer.
  assert.equal(RequestOfferInput.safeParse({ ...offer, message: 'კარგი' }).success, false)
  // A free offer is not an offer; the top matches the company balance ceiling.
  assert.equal(RequestOfferInput.safeParse({ ...offer, priceGel: 0 }).success, false)
  assert.equal(RequestOfferInput.safeParse({ ...offer, priceGel: 1_000_000 }).success, true)
  // No tetri anywhere in this database, and this is not the feature to add one.
  assert.equal(RequestOfferInput.safeParse({ ...offer, priceGel: 12.5 }).success, false)
  // The estimate is optional — some work cannot honestly be estimated first.
  assert.equal(RequestOfferInput.safeParse({ ...offer, daysEstimate: null }).success, true)
  assert.equal(RequestOfferInput.safeParse({ ...offer, daysEstimate: 365 }).success, true)

  // The admin cannot set a limit of zero (a request nobody may answer is just
  // closed) and cannot reopen a request to NEW.
  assert.equal(AdminRequestPatch.safeParse({ offerLimit: 0 }).success, false)
  assert.equal(AdminRequestPatch.safeParse({ offerLimit: 1 }).success, true)
  assert.equal(AdminRequestPatch.safeParse({ status: 'NEW' }).success, false)
  assert.equal(AdminRequestPatch.safeParse({ status: 'VERIFIED' }).success, true)
})

test('the honeypot answers ok and writes nothing', () => {
  // Telling a bot it was caught teaches whoever wrote it which field to skip
  // next time, and there is nobody on the other end to inform.
  const route = codeOf('app/api/requests/route.ts')
  assert.match(route, /if \(\(parsed\.data\.website \?\? ''\) !== ''\)/,
    'the honeypot is no longer checked')
  const trap = route.slice(route.indexOf("parsed.data.website"))
  assert.ok(
    trap.indexOf('ok: true') < trap.indexOf('createServiceRequest'),
    'a honeypot hit is written to the database, or is answered with an error',
  )
  // The field itself is out of the tab order and hidden from a screen reader —
  // a trap that catches assistive technology is not spam protection, it is a
  // broken form for the people least able to work around it.
  const form = read('app/request/_stepContact.tsx')
  assert.match(form, /aria-hidden="true"/)
  assert.match(form, /tabIndex=\{-1\}/)
  // No third-party service: no new dependency, nothing sent to anybody else
  // about who is filling in the form.
  assert.doesNotMatch(form, /recaptcha|hcaptcha|turnstile/i)

  // ⚠️ THE SCHEMA MUST LET A FILLED HONEYPOT THROUGH. It was `.max(0)` for one
  // revision, which meant zod rejected it first: the route's branch above was
  // unreachable dead code, and the caller got a 400 that said „this field is
  // the problem" — the one thing a trap must never do. Found by driving the
  // real endpoint; a schema test that asserted `.max(0)` would have agreed with
  // the bug.
  assert.equal(ServiceRequestInput.safeParse({
    kind: 'CONSULTATION', topic: 'accounting',
    description: 'ვეძებ ბუღალტერს შპს-სთვის, საგადასახადო შემოწმება მოვიდა და დახმარება მჭირდება.',
    budgetBand: 'c2', timing: 'this_week', format: 'ONLINE', city: 'TBILISI',
    contactName: 'ნინო მაგალიძე', phone: '555123456', email: 'nino@example.ge',
    website: 'http://spam.example',
  }).success, true, 'zod rejects a filled honeypot — the route branch is dead and the bot is told which field it was')
})

test('an empty optional becomes NULL, never an empty string', () => {
  // A column holding '' reads as „they answered, with nothing", which is a
  // different fact from „they did not answer" — and the admin has to tell them
  // apart to know whether there is anything left to ask.
  const row = serviceRequestRow({
    kind: 'LEARNING', topic: 'chemistry',
    description: 'ვეძებ ქიმიის მასწავლებელს მეათეკლასელისთვის, ეროვნულებისთვის მზადება გვინდა.',
    budgetBand: 'l2', timing: 'twice_week', format: 'ONLINE', city: 'TBILISI',
    contactName: '  ნინო მაგალიძე  ', phone: '+995 555 12 34 56', email: '',
  } as any)
  assert.equal(row.email, null)
  assert.equal(row.contactName, 'ნინო მაგალიძე')
  // Stored normalised, so two people typing the same number two ways produce
  // one value an admin can actually dial or search.
  assert.equal(row.phone, '+995555123456')
  // ⚠️ The numbers come from the BAND, and the unit from the KIND — never from
  // the body. A crafted POST cannot claim a range that is not on the ladder.
  assert.equal(row.budgetMin, 40)
  assert.equal(row.budgetMax, 70)
  assert.equal(row.budgetUnit, 'PER_LESSON')
  // The sphere is DERIVED from the topic. Chemistry maps to no sphere — that
  // null is the demand signal, not a bug.
  assert.equal(row.categorySlug, null)
  assert.equal(serviceRequestRow({
    ...({ kind: 'CONSULTATION', topic: 'contract',
      description: 'ხელშეკრულება მჭირდება იჯარაზე, ორი მხარე ვართ და პირობები შეთანხმებულია.',
      budgetBand: 'c2', timing: 'this_week', format: 'ONLINE', city: 'TBILISI',
      contactName: 'ნინო', phone: '555123456', email: '' } as any),
  }).categorySlug, 'law', 'a law topic no longer maps to the law sphere')
})

/* ═══════════ 9. exactly one provider ═══════════════════════════════════ */

test('an offer names exactly one provider, and the discriminator agrees', () => {
  // Prisma has no cross-column constraint, and the database CHECK behind this
  // can only REFUSE the row — it cannot say which half was wrong. So this
  // function is the check and the CHECK is the backstop.
  assert.equal(offerProviderError({ providerKind: 'EXPERT', expertUserId: 'u1', companyId: null }), null)
  assert.equal(offerProviderError({ providerKind: 'COMPANY', expertUserId: null, companyId: 'c1' }), null)
  assert.equal(offerProviderError({ providerKind: 'EXPERT', expertUserId: 'u1', companyId: 'c1' }), 'PROVIDER_AMBIGUOUS')
  assert.equal(offerProviderError({ providerKind: 'EXPERT', expertUserId: null, companyId: null }), 'PROVIDER_MISSING')
  // A disagreement between the discriminator and the ids would produce a row
  // that reads one way through `providerKind` and another through its columns —
  // and every reader would pick a different one.
  assert.equal(offerProviderError({ providerKind: 'COMPANY', expertUserId: 'u1', companyId: null }), 'PROVIDER_KIND_MISMATCH')
  assert.equal(offerProviderError({ providerKind: 'EXPERT', expertUserId: null, companyId: 'c1' }), 'PROVIDER_KIND_MISMATCH')
  assert.equal(offerProviderError({ providerKind: 'ROBOT', expertUserId: 'u1', companyId: null }), 'PROVIDER_KIND_UNKNOWN')
  // Whitespace is not a value. '  ' in a column would satisfy a naive truthiness
  // check and store two providers.
  assert.equal(offerProviderError({ providerKind: 'EXPERT', expertUserId: 'u1', companyId: '   ' }), null)

  // ONE call site, and it is the endpoint that writes offers. A second copy is
  // how „both columns set" eventually becomes storable.
  //
  // Scanned with comments stripped: lib/dbBoot.ts NAMES this function in the
  // comment above its backstop CHECK („the rule is CHECKED in one place —
  // offerProviderError()"), and a raw-text scan reported that sentence as a
  // second call site. The prose that documents the invariant must not be what
  // fails the test guarding it.
  const callers = sourceFiles().filter(f =>
    relative(ROOT, f) !== 'lib/requests.ts' && codeOf(relative(ROOT, f)).includes('offerProviderError('))
  assert.deepEqual(
    callers.map(f => relative(ROOT, f)).sort(),
    ['app/api/provider/offers/route.ts'],
    'the one-provider rule is checked in more than one place',
  )
})

test('an allowlist row names exactly one subject', () => {
  assert.equal(accessSubjectError({ kind: 'EXPERT', email: 'a@b.ge' }), null)
  assert.equal(accessSubjectError({ kind: 'COMPANY', companyId: 'c1' }), null)
  assert.equal(accessSubjectError({ kind: 'EXPERT', email: 'a@b.ge', companyId: 'c1' }), 'SUBJECT_AMBIGUOUS')
  assert.equal(accessSubjectError({ kind: 'EXPERT' }), 'SUBJECT_MISSING')
  assert.equal(accessSubjectError({ kind: 'COMPANY', email: 'a@b.ge' }), 'SUBJECT_KIND_MISMATCH')
})

/* ═══════════ 10. the admin trail ═══════════════════════════════════════ */

test('every admin decision writes an audit row', () => {
  // „Verified" is a claim that a human phoned somebody, and the audit row is
  // the only evidence that happened. Same for handing somebody access.
  const patch = codeOf('app/api/admin/requests/[id]/route.ts')
  assert.match(patch, /await audit\(admin\.id, status \? `request\.\$\{status\.toLowerCase\(\)\}` : 'request\.update'/)
  // The PREVIOUS status is recorded because that is the half you cannot
  // reconstruct: the row now says what it became, only the log says what it was.
  assert.match(patch, /from: before\.status/)

  const access = codeOf('app/api/admin/requests/access/route.ts')
  assert.match(access, /'request\.access\.grant'/)
  assert.match(access, /'request\.access\.enable' : 'request\.access\.disable'/)
  // There is no DELETE: turning somebody off is a switch, so the note saying
  // why survives the decision.
  assert.doesNotMatch(access, /export async function DELETE/)
})

test('verification notifies providers once, on the edge only', () => {
  // Re-saving a note on an already-verified request must not re-notify
  // everybody — that is how a working notification becomes one people mute.
  const patch = codeOf('app/api/admin/requests/[id]/route.ts')
  assert.match(patch, /if \(status === 'VERIFIED' && before\.status !== 'VERIFIED'\)/,
    'verification notifies on every save, not only on the transition')
  // The bell and the mail both live in lib/requestJobs → mailVerifiedRequest,
  // so the cron's 6-hour re-mail runs the same code as the first one. Two
  // copies of „who should hear about this" is how the two end up disagreeing.
  assert.match(patch, /mailVerifiedRequest\(/, 'the route no longer routes through the shared mailer')
  assert.match(codeOf('lib/requestJobs.ts'), /notifyMany\(/, 'the shared mailer stopped ringing the bell')
  // The support address is READ, never typed — an unrouted literal drops mail
  // silently (lib/supportEmails says so at length).
  const create = read('app/api/requests/route.ts')
  assert.match(create, /import \{ SUPPORT_EMAIL \} from '@\/lib\/supportEmails'/)
  assert.doesNotMatch(create, /@mcodne\.ge|@gmail\.com/, 'an email address was typed as a literal')
})

/* ═══════════ 11. it does not touch the booking product ═════════════════ */

test('the subsystem shares nothing with bookings, packages or B2B', () => {
  // The one architectural promise, and the one that decays quietly: a request
  // that grew a `startAt` is the point at which two products become one
  // unmaintainable one.
  // Case-SENSITIVE, and matching the two spellings a Prisma model actually has
  // in code: the client accessor (prisma.booking) and the type (Booking).
  // Deliberately NOT /i — 'CONSULTATION' is one of this subsystem's own KIND
  // values (lib/requestTopics), and a case-insensitive net caught our own
  // vocabulary the day the kinds landed.
  const FORBIDDEN = /\b(booking|consultation|enrollment|availabilitySlot|dispute|businessLead|b2BService|Booking|Consultation|Package|Enrollment|AvailabilitySlot|Dispute|BusinessLead|B2BService)\b|\bprisma\.package\b/
  const OWN = [
    'lib/requests.ts',
    'lib/requestsServer.ts',
    'app/api/requests/route.ts',
    'app/api/requests/[ref]/accept/route.ts',
    'app/api/provider/offers/route.ts',
    'app/api/admin/requests/route.ts',
    'app/api/admin/requests/[id]/route.ts',
    'app/request/page.tsx',
    'app/request/RequestWizard.tsx',
    'app/request/_model.ts',
    'app/request/_stepDetails.tsx',
    'app/request/[ref]/page.tsx',
    'lib/requestTopics.ts',
    'app/provider/requests/page.tsx',
    'app/provider/offers/page.tsx',
  ]
  for (const f of OWN) {
    // Comments stripped: every one of these files explains at length what it is
    // NOT, naming those very models, and the prose must not fail the check that
    // exists because of it.
    const m = codeOf(f).match(FORBIDDEN)
    assert.equal(m, null, `${f} reaches into the booking product: „${m?.[0]}"`)
  }
  // The allowlist route is the ONE exception and it is deliberate: a company's
  // MEMBERSHIP is the audience list, so it reads CompanyMember. It still must
  // not touch a booking.
  const access = codeOf('app/api/admin/requests/access/route.ts')
  assert.doesNotMatch(access, /\b(booking|enrollment|package)\b/i)

  // And the new schema block adds no column to any existing table.
  const up = read('prisma/manual-migrations/2026-08-14-requests/up.sql')
  const altersExisting = [...up.matchAll(/ALTER TABLE "(\w+)"/g)].map(m => m[1])
  for (const t of altersExisting) {
    assert.ok(['ServiceRequest', 'RequestOffer', 'RequestAccess'].includes(t),
      `the migration alters "${t}" — it was meant to be additive only`)
  }
  assert.doesNotMatch(up, /DROP|TRUNCATE|UPDATE "/, 'the migration is no longer additive')
})

test('the boot DDL and the reviewable migration agree', () => {
  // dbBoot is what actually runs on Railway; the migration file is the document
  // that was reviewed and the reason down.sql exists. A drift between them is a
  // production schema nobody has read.
  const boot = read('lib/dbBoot.ts')
  const up = read('prisma/manual-migrations/2026-08-14-requests/up.sql')
  for (const table of ['ServiceRequest', 'RequestOffer', 'RequestAccess']) {
    assert.match(boot, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), `dbBoot does not create "${table}"`)
    assert.match(up, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), `the migration does not create "${table}"`)
  }
  for (const idx of [
    'ServiceRequest_publicRef_key',
    'ServiceRequest_status_createdAt_idx',
    'ServiceRequest_categoryId_status_idx',
    'RequestOffer_requestId_expertUserId_key',
    'RequestOffer_requestId_companyId_key',
    'RequestAccess_userId_key',
    'RequestAccess_companyId_key',
  ]) {
    assert.ok(boot.includes(idx), `dbBoot has lost "${idx}"`)
    assert.ok(up.includes(idx), `the migration has lost "${idx}"`)
  }
  // Every column dbBoot creates is also declared in schema.prisma — an
  // undeclared one is a single `prisma db push` away from being dropped, which
  // is what the warning block on model Booking is about.
  const schema = read('prisma/schema.prisma')
  for (const model of ['model ServiceRequest', 'model RequestOffer', 'model RequestAccess']) {
    assert.ok(schema.includes(model), `${model} is not declared in schema.prisma`)
  }
  // And a rollback exists, written before the change ships.
  const down = read('prisma/manual-migrations/2026-08-14-requests/down.sql')
  for (const t of ['ServiceRequest', 'RequestOffer', 'RequestAccess']) {
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS "${t}"`))
  }
})

/* ═══════════ the account made in parallel (2026-08-17) ═══════════════════
 *
 * Owner: „მოთხოვნას ამ გვერდზე პარალელურად უნდა არეგისტრირდებოდე." The rules
 * live in lib/requestAccount and the dangerous one is EXISTS — typing somebody
 * else's address must never open their account. That is a security property,
 * so it is pinned as source text rather than trusted to stay true.
 */

test('a known email attaches the request but never opens a session', () => {
  const acct = codeOf('lib/requestAccount.ts')

  // The EXISTS branch returns BEFORE any session is created. Read positionally:
  // the only createSession call must come after the early return for an
  // existing user, i.e. inside the create path.
  const existsReturn = acct.indexOf("outcome: 'EXISTS'")
  const session = acct.indexOf('createSession(')
  assert.ok(existsReturn > 0, 'the EXISTS outcome is gone')
  assert.ok(session > 0, 'nothing creates a session any more')
  assert.ok(
    existsReturn < session,
    'createSession now runs before the existing-account branch returns — ' +
    'typing a stranger\'s email would sign you into their account',
  )

  // A live session is never swapped for a new one.
  assert.match(acct, /if \(input\.signedInUserId\)/,
    'the signed-in short-circuit is gone: submitting would log somebody out of their own account')

  // No email → no account. The „no registration, ever" promise.
  assert.match(acct, /if \(email === ''\) return \{ outcome: 'NONE'/,
    'an empty email no longer short-circuits — an account with no way back into it')

  // The password is random, not derived from anything the submitter typed.
  assert.match(acct, /randomBytes\(32\)/, 'the throwaway password stopped being random')
  assert.ok(!/passwordHash: *''/.test(acct), 'an empty passwordHash would be a passwordless account')
})

test('the request is written before the account, and the account cannot lose it', () => {
  const route = codeOf('app/api/requests/route.ts')
  const created = route.indexOf('createServiceRequest(')
  const account = route.indexOf('accountForRequest(')
  assert.ok(created > 0 && account > 0, 'the create/account pair has been renamed')
  assert.ok(
    created < account,
    'the account is now decided before the request is written — a failure there ' +
    'would cost the person the thing they actually came to send',
  )
  // The cookie cannot be written after the response has flushed.
  const afterIdx = route.indexOf('after(async', account)
  assert.ok(
    afterIdx === -1 || afterIdx > account,
    'accountForRequest moved inside after(): createSession would set a cookie nobody receives',
  )
  // The browser is told the outcome, never the id.
  assert.match(route, /account: account\.outcome/, 'the thanks screen lost its account signal')
  assert.ok(!/account\.userId.*NextResponse/s.test(route.slice(route.lastIndexOf('return NextResponse'))),
    'the response now carries a user id the browser has no use for')
})

test('the thanks screen promises only what exists', () => {
  const thanks = codeOf('app/request/_thanks.tsx')
  // /student does not list service requests and must not be pointed at as if
  // it did — the subsystem is linked from nowhere on the site by design.
  assert.ok(!thanks.includes('/student'),
    'the thanks screen links to /student, which does not show requests')
  assert.match(thanks, /sent\.account === 'CREATED'/, 'the created-account line is gone')
  assert.match(thanks, /sent\.account === 'EXISTS'/, 'the existing-account line is gone')
})

test('the honeypot stays invisible and stays dumb', () => {
  const contact = codeOf('app/request/_stepContact.tsx')
  assert.match(contact, /left: '-9999px'/, 'the honeypot became visible')
  assert.match(contact, /userSelect: 'none'/,
    'the honeypot is selectable again — a select-all puts „ვებგვერდი" in the clipboard')
  assert.match(contact, /aria-hidden="true"/, 'the honeypot is announced to screen readers')
  assert.match(contact, /tabIndex=\{-1\}/, 'the honeypot is reachable by keyboard')
  // The route answers ok:true with no row — never a 400 that teaches a bot
  // which field to skip.
  const route = codeOf('app/api/requests/route.ts')
  assert.match(route, /website \?\? ''\) !== ''\) \{[\s\S]{0,400}?ok: true/,
    'the honeypot branch stopped answering ok:true — it now tells bots they were caught')
})

test('no screen prints the same answer twice', () => {
  // This test used to assert the OPPOSITE arrangement — that the wizard's
  // „kind · topic" line was suppressed on the contact screen, because that
  // screen printed its own fuller summary. Both lines are gone (2026-08-17):
  // the transcript now restates every answer as a bubble, in the person's own
  // order, each with its own „შეცვლა". Keeping either line printed the same
  // four facts a second time, a few lines under their own bubbles.
  const wizard = codeOf('app/request/RequestWizard.tsx')
  const contact = codeOf('app/request/_stepContact.tsx')
  assert.match(wizard, /<Transcript/, 'the wizard no longer renders the transcript')
  assert.doesNotMatch(wizard, /KIND\[kind\]\.label\} · \{topicLabel/,
    'the wizard restates kind · topic again — the transcript already says it')
  assert.doesNotMatch(contact, /budgetLabel\(kind, band\.min, band\.max\)/,
    'the contact screen printed its summary line again — the transcript already carries it')
})

test('the transcript restates ANSWERS, in words, and only answered ones', () => {
  // The half of every bubble pair that is not the question. Executed rather
  // than described, because the failure it guards is invisible in a diff: an
  // id leaking into the transcript („c2" instead of „100–250₾") still renders,
  // still looks like a chat, and is a debug view shown to a customer.
  const d: Draft = {
    ...EMPTY_DRAFT,
    kind: 'CONSULTATION', topic: 'contract',
    budgetBand: 'c2', timing: 'this_week',
    format: 'IN_PERSON', city: 'BATUMI',
  }
  const budget = answerLabel('budget', d)
  assert.ok(budget && !budget.includes('c2'), `the budget bubble shows the raw band id: ${budget}`)
  assert.equal(budget, budgetLabel('CONSULTATION', 100, 250))
  const timing = answerLabel('timing', d)
  assert.ok(timing && !timing.includes('this_week'), `the timing bubble shows the raw id: ${timing}`)
  assert.equal(answerLabel('what', d), topicLabel('contract'))

  // The city rides on the format answer — it is a sub-question only ever asked
  // under „ადგილზე", so a bubble of its own would answer a question the
  // transcript never printed.
  const fmt = answerLabel('format', d)
  assert.ok(fmt?.includes('·'), `the in-person answer dropped the city: ${fmt}`)

  // An unanswered or skipped screen leaves NO pair. „—" in a conversation is a
  // person who said nothing, which is not worth a line.
  assert.equal(answerLabel('details', d), null, 'an empty description produced a bubble')
  assert.equal(answerLabel('budget', EMPTY_DRAFT), null, 'an unanswered screen produced a bubble')
  // The contact screen is never behind the reader — it is where send lives.
  assert.equal(answerLabel('contact', d), null)
})

test('the thread with us is open when a person most needs it', () => {
  // ⚠️ REJECTED STAYS OPEN, and it is the case worth executing. Somebody under
  // the budget floor is told „ამ ბიუჯეტში ვერ დაგეხმარებით" and is never
  // phoned — closing their thread would make the only person actively turned
  // away also the only one who cannot ask why, or say „და 300₾-ზე?".
  for (const status of ['NEW', 'VERIFIED', 'REJECTED', 'MATCHED']) {
    assert.equal(threadIsOpen({ status }), true, `the thread is shut on ${status}`)
    assert.equal(threadClosedReason({ status }), null)
  }
  assert.equal(threadIsOpen({ status: 'CLOSED' }), false)
  assert.ok(threadClosedReason({ status: 'CLOSED' }))
})

test('„ონლაინ ვართ" is a heartbeat, and it goes dark on its own', () => {
  const now = Date.parse('2026-08-17T12:00:00Z')
  assert.equal(staffIsOnline(null, now), false, 'an account that never beat reads as online')
  assert.equal(staffIsOnline(new Date(now - 1_000), now), true)
  assert.equal(staffIsOnline(new Date(now - (PRESENCE_TTL_MS - 1_000)), now), true)
  // The whole point: a closed tab stops beating and the badge must follow,
  // rather than claiming somebody is at the desk until the laptop dies.
  assert.equal(staffIsOnline(new Date(now - (PRESENCE_TTL_MS + 1_000)), now), false)
  // The panel's own interval must sit comfortably inside the window, or a
  // single missed beat blinks the badge off for every waiting client.
  const beat = read('app/admin/_presence.tsx').match(/BEAT_MS = ([\d_]+)/)?.[1]
  assert.ok(beat, 'the heartbeat interval is no longer stated as BEAT_MS')
  assert.ok(Number(beat!.replace(/_/g, '')) * 2 < PRESENCE_TTL_MS,
    'the heartbeat interval is no longer at least twice inside the staleness window')
  // …and it must only beat while somebody is LOOKING. A tab left open all night
  // would otherwise report an operator at the desk until morning.
  assert.match(codeOf('app/admin/_presence.tsx'), /visibilityState !== 'visible'/,
    'the heartbeat beats from a backgrounded tab — that is a badge that lies')
})

test('the platform thread cannot leak the provider conversations', () => {
  const route = codeOf('app/api/request-thread/route.ts')
  // ⚠️ `offerId: null` IS THE THREAD SELECTOR. Without it, a read scoped only
  // by requestId returns every message on the request — including the client's
  // separate conversations with each provider, which is the exact leak the
  // per-offer threads exist to prevent. Asserted on the READ and the WRITE.
  const reads = route.match(/offerId: null/g) ?? []
  assert.ok(reads.length >= 3,
    `the platform thread is not scoped by offerId: null everywhere (found ${reads.length}: read, receipt, write)`)
  assert.doesNotMatch(route, /where: \{ requestId: r\.request\.id \}/,
    'a query is scoped by requestId alone — that reads every provider thread too')

  // Contacts are NOT masked here, deliberately — see lib/requestThread. Stated
  // as an assertion so „add masking for consistency" fails loudly instead of
  // quietly gagging the operator who has to give a callback number.
  assert.doesNotMatch(route, /maskContacts/,
    'the platform thread started masking contacts — the client is talking to the platform they already gave a number to')

  // And the operator side is ADMIN, never the allowlist: `providerAllowed` is
  // also true for an allowlisted expert, and handing a bidder this thread hands
  // them the client's private half of the conversation.
  assert.match(route, /viewer\.user\?\.role !== 'ADMIN'/,
    'the staff side no longer requires ADMIN — an allowlisted bidder could read it')
  assert.doesNotMatch(route, /viewer\.providerAllowed/,
    'the platform thread gates on providerAllowed, which admits bidders')
})
