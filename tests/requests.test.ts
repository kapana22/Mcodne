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
import { requestChatEmail } from '../lib/emailTemplates'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  requestsOn, requestsVisibleTo, canSeeRequests, requestsFeatureExists,
  providersOn, providersFeatureExists, isProviderPath, PROVIDER_PATH_PREFIXES,
  isProviderWorkspacePath, PROVIDER_WORKSPACE_PATHS,
  isRequestPath, REQUEST_PATH_PREFIXES,
  makePublicRef, normalizePublicRef, PUBLIC_REF_RE, REF_ALPHABET, REF_LENGTH,
  budgetIsBelowFloor, BUDGET_BANDS, REQUEST_KINDS, KIND, TIMING,
  isTopicOfKind, searchTopics, budgetLabel, TOPIC_GROUPS, groupsForKind,
  CITIES, ALL_CITIES, ONE_CITY, cityLabel,
  SUGGESTED_TOPICS, SUGGESTED_TOPIC_IDS,
  extrasFor, normalizeExtras, extrasLabels, templateFor, offerTemplateFor, timeAgoKa,
  offerProviderError, accessSubjectError,
  placesLeft, requestIsOpen,
  providerRequestView, clientOfferView, clientIdentityOpen,
  ServiceRequestInput, RequestOfferInput, AdminRequestPatch,
  kindsOfTopic,
  MAX_REQUEST_PHOTOS,
  serviceRequestRow, topicLabel, REQUEST_STATIONS, stationsReached,
  canOpenRequestForm, canFileRequest, showRequestCta,
} from '../lib/requests'
import {
  threadIsOpen, threadClosedReason, staffIsOnline, PRESENCE_TTL_MS,
} from '../lib/requestThread'
import { offerPeerName } from '../lib/inboxRows'
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
    { label: 'allowlisted tutor',  v: { role: 'PROVIDER', hasAccess: true } },
    { label: 'plain tutor',        v: { role: 'PROVIDER' } },
    { label: 'allowlisted client', v: { role: 'USER', hasAccess: true } },
    { label: 'plain client',       v: { role: 'USER' } },
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
    // An admin's surfaces follow the subsystem's switch; a provider's follow the
    // supply-side switch (D6, 2026-08-18) — which folds the first one in.
    const on = viewer.v.role === 'ADMIN' ? requestsOn() : providersOn()
    assert.equal(canSeeRequests(viewer.v), requestsVisibleTo(on, viewer.v),
      'canSeeRequests has drifted from requestsVisibleTo — there are two gates now')
  }
  assert.equal(requestsFeatureExists(), requestsOn())
  assert.equal(providersFeatureExists(), providersOn())
})

test('FEATURE_PROVIDERS narrows, never widens (D6)', () => {
  // Off subsystem ⇒ off supply side, whatever the second variable says. This
  // is what keeps „off beats everything" true after the split.
  for (const v of [undefined, '', 'on', 'ON', 'off', 'true']) {
    assert.equal(providersOn(v, false), false, `providers came on with the subsystem off („${String(v)}")`)
  }
  // Inside an ON subsystem: unset/blank means „no separate opinion" — the
  // supply side follows FEATURE_REQUESTS, so a deployment that predates the
  // variable keeps its masters' workspace. Anything typed must say „on".
  for (const v of [undefined, '', '  ', 'on', 'ON', ' On ']) {
    assert.equal(providersOn(v, true), true, `„${String(v)}" was read as off inside an on subsystem`)
  }
  for (const v of ['off', 'OFF', 'false', '0', 'no', 'true', '1', 'yes', 'onn']) {
    assert.equal(providersOn(v, true), false, `„${v}" was read as on`)
  }
  // The supply-side paths, on a segment boundary, and NOT the client ones.
  for (const p of PROVIDER_PATH_PREFIXES) {
    assert.equal(isProviderPath(p), true, `${p} is not gated`)
    assert.equal(isProviderPath(p + '/x'), true, `${p}/… is not gated`)
  }
  // ⚠️ /join stays OUTSIDE the gate (2026-08-19): it is the expert door too,
  // and 404ing it would take the expert half down. Its WORK half is gated in
  // the page — asserted just below.
  for (const p of ['/', '/request', '/api/requests', '/services', '/masters', '/api/providers/x/photo', '/providers', '/apply', '/join', '/work', '/work/bookings', '/work/schedule', '/me/requests']) {
    assert.equal(isProviderPath(p), false, `${p} was swallowed by the providers gate`)
  }
  // The middleware walks the second list too, with the same 404.
  const mw = codeOf('middleware.ts')
  assert.match(mw, /if\s+\(!providersOn\(\)\s+&&\s+isProviderPath\(req\.nextUrl\.pathname\)\)/,
    'the middleware does not gate the supply-side paths on FEATURE_PROVIDERS')
  // Every supply-side route reads providersOn(), not requestsOn().
  // ⚠️ /join NO LONGER READS THE SWITCH ITSELF (2026-08-24). It used to offer
  // „the missing half" and had to know whether the WORK half existed at all;
  // there is one half now, the middleware gates the whole path (asserted just
  // above), and the API routes below still check for themselves.
  for (const f of ['app/api/provider-applications/route.ts',
    'app/api/provider-applications/[id]/route.ts', 'app/api/admin/provider-applications/route.ts']) {
    assert.match(codeOf(f), /providersOn\(\)/, `${f} does not check the supply-side switch`)
    assert.doesNotMatch(codeOf(f), /requestsOn\(\)/, `${f} still checks the subsystem switch directly`)
  }
  // The signup tile that hands off to /join?can=WORK is drawn only when that
  // half exists (D5) — an ungated tile was a registration ending on a 404.
  const signup = codeOf('app/signin/_signup.tsx')
  // The signup page no longer forks by provider TYPE (2026-08-19) — there is no
  // „ვარ ხელოსანი" tile to gate. The WORK half is offered, and gated, on the
  // door itself: app/join/page.tsx builds `offer` behind providersOn().
  assert.doesNotMatch(signup, /ვარ ხელოსანი/, 'the signup page forks by provider type again')
  // ⚠️ THE „OFFER" ITSELF IS GONE (2026-08-24). The door built a list of the
  // halves somebody could still apply for and gated the WORK one on the
  // switch; there is one thing to register, the middleware gates /join whole
  // (asserted above), and what the page decides now is only whether this
  // person is already selling.
  assert.match(codeOf('app/join/page.tsx'), /if \(await isProvider\(user\.id\)\) redirect\('\/work'\)/,
    'the door stopped sending a finished applicant to their workspace')
})

test('an allowlist row is the ONLY way in that is not being an admin', () => {
  // Stated as its own test because it is the decision most likely to be
  // „simplified" later: the obvious shortcut is „every approved expert can
  // bid". Those experts applied to be BOOKED. An empty allowlist can only ever
  // produce an empty audience, which is the only safe state for a stage-1 test.
  assert.equal(requestsVisibleTo(true, { role: 'PROVIDER' }), false,
    'being an expert now grants access — the allowlist has been bypassed')
  assert.equal(requestsVisibleTo(true, { role: 'PROVIDER', hasAccess: true }), true)
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
  assert.match(gate, /const\s+provider\s+=\s+user\s+\?\s+await\s+requestAccessOf\(user\.id\)\s+:\s+null/,
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
  assert.match(mw, /if\s+\(!requestsOn\(\)\s+&&\s+isRequestPath\(req\.nextUrl\.pathname\)\)/,
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
  // ⚠️ /work AND /work/bookings: the expert's workspace shares the prefix with
  // the master's three screens (stage 6) and must survive the subsystem being
  // off. /me/requests too — it is a /me page that gates itself.
  for (const p of ['/', '/tutors', '/services', '/me', '/me/requests', '/work', '/work/bookings', '/work/requests-x', '/admin', '/business', '/api/bookings', '/requests-archive', '/providers']) {
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
    { role: 'USER' },
    { role: 'PROVIDER' },
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
  assert.equal(requestsVisibleTo(true, { role: 'USER' }), false)
  assert.equal(requestsVisibleTo(true, { role: 'PROVIDER' }), false)
  assert.equal(requestsVisibleTo(true, { role: 'PROVIDER', hasAccess: true }), true)
  assert.equal(requestsVisibleTo(true, { role: 'ADMIN' }), true)

  // …and the client side does not ask at all. Asserted through the source of
  // the exported function rather than by calling it, because it closes over
  // process.env and would only ever prove whatever this machine is set to.
  //
  // ⚠️ THIS IS THE SUBSYSTEM GATE AND ITS NAME UNDERSELLS IT — fourteen surfaces
  // answer 404 behind it, INCLUDING BOTH SIDES OF THE CHAT. Narrowing it to
  // exclude sellers was tried on 2026-08-31 (the owner's „ვისაც სერვისი აქვს
  // იმას არ შეძლოს სერვისის დაკვეთა") and would have taken the chat, the thread
  // and /request/<ref> away from every provider on the site. The audience
  // question lives in `canFileRequest`, one test down. This assertion is what
  // catches the re-narrowing next time.
  const src = codeOf('lib/requests.ts')
  const fn = src.slice(src.indexOf('export function canOpenRequestForm'))
    .slice(0, src.slice(src.indexOf('export function canOpenRequestForm')).indexOf('}') + 1)
  assert.match(fn, /return requestsOn\(\)/,
    'canOpenRequestForm no longer answers „on, and nothing else"')
  assert.doesNotMatch(fn, /role|hasAccess|allowlist|provider|sells/i,
    'the subsystem gate started asking who the caller is — that is canFileRequest\'s job')
})

// ⚠️ THE ONE AUDIENCE THAT IS REFUSED, AND IT IS THE SUPPLY SIDE (2026-08-31).
// Owner: „მინდა რომ ვისაც სერვისი აქვს იმას არ შეძლოს სერვისის დაკვეთა — ირევა
// ძალიან კოდი." Hiding the CTA has been the rule since 2026-08-21 and was never
// a gate: the address is typeable, the catalogue and every provider profile
// still carry an intake link for the anonymous majority, and a POST needs no
// page at all. So what is pinned here is the SERVER's refusal.
test('a provider cannot file a request — and the refusal is the server’s', () => {
  assert.equal(canFileRequest(true), false, 'somebody who sells here can still file a request')
  assert.equal(canFileRequest(false), requestsOn(), 'a plain client lost the form')
  assert.equal(canFileRequest(undefined), requestsOn(),
    'an unresolved identity must read as demand — a guest has no ServiceProfile')
  assert.equal(canFileRequest(null), requestsOn())

  const server = codeOf('lib/requestsServer.ts')
  // The resolver: both halves, or it is describing somebody mid-registration.
  // The resolver, by its parts rather than by one line's formatting: both
  // halves of „is a provider", and the admin exemption that lets the operator
  // still walk the client funnel on the live site.
  const resolver = server.slice(server.indexOf('const sells ='), server.indexOf('const viewer: RequestViewer'))
  assert.match(resolver, /provider !== null/, 'requestsViewer stopped requiring the allowlist row')
  assert.match(resolver, /hasServiceProfile\(user\.id\)/,
    'requestsViewer stopped requiring a ServiceProfile — an allowlist row alone is somebody mid-registration')
  assert.match(resolver, /asRole\(user\.role\) !== 'ADMIN'/,
    'the admin exemption is gone — an operator whose account carries a service could no longer test the intake')
  assert.match(server, /mayFile: canFileRequest\(sells\)/,
    'the file gate is answered without asking whether the caller is a seller')
  assert.match(server, /clientAllowed: canOpenRequestForm\(\)/,
    'the subsystem gate narrowed by audience again — that is what broke provider chat')
  assert.match(server, /serviceProfile\.count/,
    'the seller test no longer looks for a ServiceProfile — an allowlist row alone is somebody who has not finished registering')

  // ONE endpoint creates a row, and it is the only one that may read `mayFile`.
  const api = codeOf('app/api/requests/route.ts')
  assert.match(api, /if \(!viewer\.mayFile\)/, 'the create endpoint stopped refusing sellers')
  const others = sourceFiles()
    .map(f => relative(ROOT, f))
    .filter(f => /^app\/.*route\.ts$/.test(f) && f !== 'app/api/requests/route.ts')
    .filter(f => /viewer\.mayFile/.test(codeOf(f)))
  assert.deepEqual(others, [],
    'another endpoint reads mayFile — a read-only surface must not refuse a provider')

  // The page sends them to their own room rather than to the 404 the rest of
  // this route answers with: they already know the subsystem exists.
  const page = codeOf('app/request/page.tsx')
  assert.match(page, /if \(viewer\.sells\) redirect\(PROVIDER_ROUTE\)/,
    'the intake stopped turning a seller around')
  assert.ok(
    page.indexOf('viewer.sells') < page.indexOf('!viewer.clientAllowed'),
    'the seller check runs after the 404 — a provider would get a wall instead of their workspace',
  )

  // …and the doors a signed-in provider actually meets are closed too, so the
  // refusal is never the first they hear of it.
  assert.match(codeOf('app/page.tsx'), /initialUser\?\.provider !== true/,
    'the home hero still offers the intake to somebody who sells here')
  assert.match(codeOf('app/me/layout.tsx'), /await sellsHere\(user\.id\)/,
    'the client rail still offers „new request" to somebody who sells here')
})

test('the client’s reference is never shown to a provider', async () => {
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
    'app/work/(provider)/requests/page.tsx',
    'app/work/(provider)/requests/[id]/page.tsx',
    'app/work/(provider)/offers/page.tsx',
  ]) {
    const body = codeOf(f)
    assert.doesNotMatch(body, /\{[^}]*\.publicRef[^}]*\}/,
      `${f} renders the client’s reference — that hands the counterparty the key to accept on the client’s behalf`)
  }

  // A provider's NOTIFICATION and MAIL are archives somebody can read it out of
  // at leisure, so they carry the topic instead.
  assert.doesNotMatch(codeOf('app/api/request-chat/route.ts'), /body: r\.offer\.request\.publicRef/,
    'the provider bell body is the client’s reference again')
  /* ⚠️ RENDERED, NOT GREPPED (2026-09-03). This matched the exact template
   * literal `o.toProvider ? \`ახალი შეტყობინება — ${topicLabel(o.topic)}\``,
   * which stopped existing the day the copy moved into the registry the owner
   * edits — and a regex that can be broken by moving a string is a regex that
   * was never checking the rule. The RULE is that a provider's copy of this
   * mail never carries the client's reference, and the way to check that is to
   * build both mails and look. This version also catches what the old one could
   * not: the reference appearing anywhere in the BODY. */
  const provider = await requestChatEmail({ toProvider: true, topic: 'cleaning', publicRef: 'MC-ABCDE', preview: 'გამარჯობა' })
  assert.doesNotMatch(provider.subject, /MC-ABCDE/, 'the provider chat mail subject carries the client’s reference')
  assert.doesNotMatch(provider.html, /MC-ABCDE/, 'the provider chat mail body carries the client’s reference')
  // And the client's own copy still HAS it: it is their way back into the
  // request, and losing it would be the opposite failure.
  const client = await requestChatEmail({ toProvider: false, topic: 'cleaning', publicRef: 'MC-ABCDE', preview: 'გამარჯობა' })
  assert.match(client.subject, /MC-ABCDE/, 'the client lost their own reference')
  // codeOf, not read: the comment explaining the removal names `publicRef`, and
  // a negative assertion that trips on its own documentation is a test nobody
  // can keep true.
  const mailCode = codeOf('lib/emailTemplates.ts')
  assert.doesNotMatch(mailCode.slice(mailCode.indexOf('offerAcceptedProviderEmail')).slice(0, 500), /publicRef/,
    'the accepted-offer mail to the provider carries the client’s reference again')
})

test('a client leaves a phone, and the phone is what reaches them', () => {
  /* ⚠️ THIS TEST HAS HELD BOTH ANSWERS AND THE PREVIOUS ONE SAID WHEN TO SWITCH.
     It pinned „email is REQUIRED" from 2026-08-17, because every automated
     message this subsystem sent a client was an email and an absent address
     meant permanent silence — no offer notice, no reply notice, no nudge. Its
     last assertion was the exit condition, in its own words: „When SMS exists
     this requirement should come back OUT."

     It exists as of 2026-09-03 (owner: „კონტაქტის ველიდან ამოვიღოთ მელი"), so
     the requirement came out and this test now pins the replacement: a request
     may be filed with a phone alone, and the two events that cannot go quiet
     have an SMS behind them. */
  const base = {
    kind: 'MEETING', topic: 'contract',
    description: 'ხელშეკრულება მჭირდება იჯარაზე.',
    budgetBand: 'c2', timing: 'this_week', format: 'ONLINE', city: 'TBILISI',
    contactName: 'ნინო მაგალიძე', phone: '555123456',
  }
  assert.equal(ServiceRequestInput.safeParse({ ...base, email: 'nino@example.ge' }).success, true,
    'an address is still accepted — a signed-in client has one and it is still used')
  assert.equal(ServiceRequestInput.safeParse(base).success, true,
    'a request with a phone and no email is refused — that is the field that was removed')
  assert.equal(ServiceRequestInput.safeParse({ ...base, email: '' }).success, true,
    'the empty string the removed field used to submit is refused')
  // A malformed address is still wrong. Optional is not „anything goes".
  assert.equal(ServiceRequestInput.safeParse({ ...base, email: 'nino@' }).success, false,
    'a broken address is accepted now that the field is optional')

  // …and the screen no longer asks for one.
  assert.doesNotMatch(codeOf('app/request/_stepContact.tsx'), /id="req-contact-email"/,
    'the email field is back on the last screen before a submit')

  /* ⚠️ THE TWO TEXTS ARE THE WHOLE JUSTIFICATION, so they are asserted here and
     not only in tests/outbound: „we have it, here is your code" and „somebody
     answered". Without these two this change is the 2026-08-17 silence again. */
  assert.match(codeOf('app/api/requests/route.ts'), /sendSms\(\{ key: 'request\.received\.client'/,
    'a client who filed by phone is never sent their own MC- code')
  assert.match(codeOf('app/api/provider/offers/route.ts'), /sendSms\(\{ key: 'request\.offerArrived\.client'/,
    'a client who filed by phone is never told an offer arrived')

  // ⚠️ THE DOWNSTREAM GUARDS STAY, and now they guard the common case rather
  // than the legacy one: most rows have no email at all.
  assert.match(codeOf('app/api/provider/offers/route.ts'), /const to = offer\.request\.email\s*\n\s*if \(to\)/,
    'the offer notifier stopped guarding on a missing email')
  assert.match(codeOf('lib/requestJobs.ts'), /!r\.email/,
    'the client nudge stopped guarding on a missing email')
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
  assert.match(jobs, /prisma\.requestAccess\.findMany\(\{\s*where:\s+\{\s+active:\s+true/,
    'the routable audience is no longer restricted to ACTIVE allowlist rows')
  assert.match(jobs, /company:\s+\{\s+requestAccess:\s+\{\s+active:\s+true\s+\}\s+\}/,
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
  /* ⚠️ THE SCREEN MOVED, THE RULE DID NOT (2026-09-01). This read
     `app/request/_live.tsx`, the post-send panel, which is gone — it was the
     second journey widget at one address (see „the two screens describe one
     journey" above). The waiting screen is now the room's, and every word of
     the paragraph above applies to it unchanged: at the moment somebody
     presses send nobody has looked at their request, so any number claiming an
     audience is fabricated. */
  const live = codeOf('app/request/[ref]/_waiting.tsx')
  // Since stage 10 the counting lives in lib/requestLive, which BOTH the poll
  // route (./status) and the stream (./events) answer from — one source, so a
  // number cannot be true on one and stale on the other. Both routes must
  // still go through it (tests/liveRoom.test.ts pins the stream side).
  const api = codeOf('lib/requestLive.ts')
  assert.match(codeOf('app/api/requests/[ref]/status/route.ts'), /requestLiveStatus\(ref\)/,
    'the status route stopped answering from lib/requestLive')

  // Every number on that screen must come from the endpoint, and every number
  // in the endpoint must come from a count.
  assert.doesNotMatch(live, /Math\.random|setTimeout\([^)]*\d{3,}[^)]*\)\s*=>\s*set|\+\s*Math\.floor/,
    'the waiting screen invented a number instead of reading one')
  assert.doesNotMatch(live, /ათვალიერებ|უყურებ|ნახულობ/,
    'the waiting screen claims people are LOOKING at the request — nobody is until it is routed')
  assert.match(api, /prisma\.notification\.count/,
    '„how many were told" stopped being a count of what we actually sent')
  assert.match(api, /prisma\.serviceProfile\.count/,
    '„how many experts are in this sphere" stopped being a count')

  /* ⚠️ „N ექსპერტს ვაცნობეთ" IS NOT RENDERED ANYWHERE TODAY, and that is why
     this asserts its ABSENCE rather than its gate. It lived on the deleted
     panel, behind `d.notified > 0` so it could never claim an audience before
     routing had run. `lib/requestLive` still computes it and both routes still
     serve it, so the day it comes back it must come back GATED — which is what
     the line below refuses to let anybody forget. */
  assert.doesNotMatch(live, /ვაცნობეთ/,
    'the notified line came back — it must be gated on a real non-zero count, as `d.notified > 0` was')

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
  /* ⚠️ THE ROOM STOPPED DRAWING THE TRACK, AND THE RULE SURVIVES INTACT
     (2026-09-01, the owner's design canvas → „Request Room v2").
     The canvas gives /request/<ref> three stages of its own — ლოდინი →
     შეთავაზებები → დახურვა — and no four-station rail, because by the time a
     client is IN the room the track has served its purpose: the stations
     describe getting there, the room is the arrival.
     What this test protects is unchanged and is asserted below instead: there
     is ONE list of stations and nobody keeps a private copy. The screens that
     still draw it must read it from lib/requests, and the room must not
     re-declare the labels under another name. */
  assert.doesNotMatch(codeOf('app/request/[ref]/page.tsx'), /'ვამოწმებთ'|'შეთავაზებები'\s*,\s*'/,
    'the room grew its own copy of the station labels')
  /* ⚠️ `app/request/_live.tsx` IS GONE (2026-09-01) and this assertion went
     with it. `LiveStatus` was the four-station track on the post-send screen,
     and it was the SECOND journey widget at one address: the wizard replaces
     the URL rather than navigating, so a refresh landed on the room — which
     the owner's design canvas had redrawn as „ვეძებთ შენთვის ექსპერტს". One
     link, two different screens, depending on how you arrived.
     The room won, and liveness did not die with the track: the room mounts
     `LiveRefresh`, which calls `router.refresh()` and re-renders the whole
     server component rather than one strip of it. */
  assert.equal(existsSync(join(ROOT, 'app/request/_live.tsx')), false,
    'the second journey widget came back — see app/request/_thanks.tsx')
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

  // ⚠️ THE MASTER'S /work SCREENS ONLY, and the exemption is the whole
  // distinction (they were /provider until stage 6; the /work prefix is also
  // the expert's, whose /work/bookings links are guarded by requireRole and
  // redirect to sign-in on their own — see PROVIDER_WORKSPACE_PATHS). /admin is
  // guarded by requireRole, which REDIRECTS a signed-out visitor to sign-in —
  // so an emailed /admin link has always worked and was never the bug. The
  // requests subsystem is the one that answers notFound(), deliberately, and
  // that is exactly why its emailed links needed routing. (The admin links in
  // this file go through the helper too, which saves a redirect hop, but
  // asserting it would fail this test on an unrelated moderation email that
  // is not broken.)
  const bare = [...t.matchAll(/href: `\$\{BASE\}(\/work\/(?:requests|offers|service-profile)[^`]*)`/g)].map(m => m[1])
  assert.deepEqual(bare, [],
    `these email links go straight to a 404-on-signed-out page: ${bare.join(', ')}`)
  const bareTernary = [...t.matchAll(/\?\s*`\$\{BASE\}(\/work\/(?:requests|offers|service-profile)[^`]*)`/g)].map(m => m[1])
  // …and every one of the master's links in this file goes through the helper.
  const gated = [...t.matchAll(/gatedLink\((?:'|`)(\/work\/[^'`$]*)/g)].map(m => m[1])
  assert.ok(gated.length >= 3, `the master's emailed links stopped going through gatedLink: ${gated.join(', ')}`)
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
  // request by an email and a bell that both link to /work/requests/<id>;
  // accepting an offer moves the request to MATCHED. The page used to answer
  // `status !== 'VERIFIED' → notFound()`, so the WINNER's own link went dead at
  // the exact moment it started to matter, and every provider who bid and lost
  // got a 404 where the answer should have been (owner, 2026-08-17, holding the
  // dead link).
  const page = codeOf('app/work/(provider)/requests/[id]/page.tsx')
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
    ['app/work/(provider)/layout.tsx', 'providerAllowed'],
  ]
  for (const [f, gate] of PAGES) {
    const body = codeOf(f)
    assert.match(body, /requestsViewer\(\)/, `${f} does not resolve the gate`)
    assert.match(body, new RegExp(`if \\(!viewer\\.${gate}\\) notFound\\(\\)`),
      `${f} does not 404 behind viewer.${gate}`)
    const other = gate === 'clientAllowed' ? 'providerAllowed' : 'clientAllowed'
    assert.doesNotMatch(body, new RegExp(`viewer\\.${other}`),
      `${f} reads viewer.${other} — that is the other side's gate`)
    // notFound, never a redirect — WITH ONE NAMED EXCEPTION (2026-08-31).
    //
    // The rule protects a STRANGER: `requireRole()` would send a signed-out
    // visitor to /signin, and that confirms the page is there. It was written
    // as „no redirect at all" because until now no redirect could be reached by
    // anyone but a stranger. The seller turnaround can: it fires only for
    // somebody with a session, an active allowlist row AND a ServiceProfile —
    // a person who answers requests in /work every day and has nothing left to
    // learn about whether this subsystem exists. So the assertion narrows to
    // what it was always about: every redirect on these pages must be one that
    // a stranger cannot reach.
    const redirects = body
      .split('\n')
      .map(l => l.trim())
      .filter(l => /\bredirect\(/.test(l) && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('import '))
    assert.deepEqual(
      redirects.filter(l => !/^if \(viewer\.sells\) redirect\(PROVIDER_ROUTE\)$/.test(l)),
      [],
      `${f} redirects instead of 404ing — the only redirect allowed here is the seller turnaround`,
    )
    assert.doesNotMatch(body, /requireRole\(/, `${f} uses requireRole — it would redirect to /signin`)
  }

  const ROUTES: [string, 'clientAllowed' | 'providerAllowed' | 'mayFile'][] = [
    // ⚠️ THE ONE ROUTE ON THE NARROW GATE (2026-08-31). Every other client
    // endpoint here READS or REPLIES; this one CREATES, and creating is the act
    // a seller is refused (lib/requests → canFileRequest). `mayFile` implies
    // `clientAllowed` — it is that boolean AND the audience test — so this row
    // is not a weaker check, it is a stricter one.
    ['app/api/requests/route.ts', 'mayFile'],
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
    // A route on the narrow gate must not ALSO answer the wide one: two gates
    // on one endpoint is two places to loosen it from.
    if (gate === 'mayFile') {
      assert.doesNotMatch(body, /viewer\.clientAllowed/,
        `${f} reads both gates — the create endpoint is decided by mayFile alone`)
    }
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
  //   the master's three /work screens (/work/requests, /work/offers,
  //   /work/service-profile — were /provider until stage 6, 2026-08-19; the
  //   rest of /work is the EXPERT's workspace and is not the subsystem's) —
  //               STILL linked from nowhere. It is the bidder's side; nobody
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
    /* ⚠️ `app/_home/request.tsx` LEFT THIS LIST WITH THE FILE (2026-09-02).
       The band stopped being composed with the 2026-08-21 redesign and was kept
       „one `<RequestBand />` away from returning" so this scan would still know
       it. Measured on 2026-09-02: nothing imported it, nothing rendered it, and
       `app/page.tsx` calls it „the old band … NOT what came back". A file whose
       only remaining purpose is to be listed in a test that watches it is the
       control CLAUDE.md says to delete rather than leave switched off.
       Nothing this test guarantees is weakened: what it protects is that no
       UNARGUED door to /request or to the provider side exists, and a file that
       does not exist opens no door. If the band is ever rebuilt it arrives as a
       new entry point and gets argued for then — which is the rule.

       ⚠️ `app/HomeClient.tsx` TAKES ITS PLACE, and it is the honest pairing.
       The band was never the thing that reached /request from the home — the
       ADDRESS is, and it arrives as `requestHref`, computed in `app/page.tsx`
       behind `requestsOn()` and handed down. So the entry point is the file
       that carries the address and the gate is the file that decides whether
       there is one, which is exactly what this list is for. */
    ['app/HomeClient.tsx', 'app/page.tsx'],
    // ⚠️ THE HOME PAGE'S HERO IS AN INTAKE DOOR AGAIN (2026-08-31). The owner's
    // design canvas („mcodne.ge პროფილის რედიზაინი" → Home) makes „დაწერე, რა
    // გჭირდება" the largest type on the site and its field submits to
    // /request?q=… — the handover the wizard already seeds from. This is the
    // third time the home page's relationship to the intake has changed and it
    // is listed rather than pattern-excused for the reason at the top of this
    // list: the next door somebody adds still has to be argued for.
    //
    // GATED IN app/page.tsx, NOT IN HomeClient. `requestsOn()` reads an
    // environment variable and HomeClient is `'use client'` — the server page
    // resolves the address once and hands it down as `requestHref`, null when
    // the subsystem is off. The hero then submits to the catalogue instead, so
    // the field is never a door onto a 404.
    //
    // ⚠️ NEITHER FILE CONTAINS THE STRING „/request", so neither would be
    // caught by the scan below — they are listed because the PAIRING is the
    // assertion worth having: it is what fails if app/page.tsx ever stops
    // reading the flag and starts handing the hero an address unconditionally.
    // ⚠️ THE HOME'S EIGHTH CATEGORY TILE (2026-08-31). Six spheres cover almost
    // everybody on the site; the tile beside them is for a need that is outside
    // all six, and describing it is the only thing that serves that person — so
    // it is a door into the subsystem sitting in a grid of browse links, which
    // is exactly the kind of entrance this list exists to make somebody argue
    // for. It arrived HARDCODED as `href="/request"` and this test caught it:
    // with the flag off that tile is a 404 on the busiest page on the site. It
    // takes `requestHref` from app/page.tsx now and is not drawn without one.
    ['app/_home/categories.tsx', 'app/page.tsx'],
    ['app/_home/hero.tsx', 'app/page.tsx'],
    ['app/_home/how.tsx', 'app/page.tsx'],
    // ⚠️ /about IS „როგორ მუშაობს" AND ITS CLIENT SIDE NOW CLOSES ON THE INTAKE
    // (2026-08-31, the owner's „How It Works + Help" canvas). The page explains
    // the request → offers → choose flow and then draws the canvas's dark band
    // with „ფასის მოთხოვნა" in it; a page that describes filing a request and
    // then offers no way to file one is the dead end the catalogue's own bridge
    // was added to fix.
    //
    // Listed individually rather than pattern-excused, for the reason at the
    // top of this list: the next door still has to be argued for. It gates
    // ITSELF — the page is a server component, so `requestsOn()` is answerable
    // right where the href is chosen, and with the subsystem off the button
    // goes to /experts, which carries its own gated CTA one tap away.
    ['app/about/page.tsx', 'app/about/page.tsx'],
    // ⚠️ THE CATALOGUE'S DEAD END (2026-08-18). „Nobody matches these filters"
    // is the single best moment to offer the other path, and until this link
    // the two halves of the product did not know about each other — browsing
    // ended in a cul-de-sac. Owner: „არ მინდა, რომ ცალკე პლათფორმაზე
    // ხდებოდეს." It gates itself (this file is not the home page) and it
    // carries the typed search through as ?q=, so the bridge costs nobody
    // their sentence.
    ['app/experts/client.tsx', 'app/experts/client.tsx'],
    // ⚠️ THE CATALOGUE'S ONE INTAKE URL, AND IT IS A CONSTANT (2026-08-18; the
    // /services DOOR that used to sit beside it was deleted in stage 10,
    // 2026-08-19, and the catalogue moved to /experts). Two surfaces reach the
    // subsystem — the header CTA and the „nobody is listed yet" empty state —
    // and BOTH import `REQUEST_HREF` from this model file, so the address is
    // written once with `for=service` baked in: the parameter the wizard needs
    // to open on the trades side instead of offering a plumbing visitor 23
    // groups of experts. Gated in the PAGE rather than here on purpose:
    // `_providers` is a pure model with no react and no environment, and the
    // page reads the flag once and hands it to both surfaces, so the two cannot
    // disagree. Only the CTAs are gated — the page itself must survive
    // FEATURE_REQUESTS being off, because it is in the sitemap and a submitted
    // URL that 404s teaches the crawler to distrust the file.
    ['app/experts/_providers.ts', 'app/experts/page.tsx'],
    // ⚠️ THE SERVICE PROFILE (stage 5, 2026-08-19; moved into the ONE namespace
    // in stage 11, the same day — it answers at /experts/<slug> now and its
    // parts are the `_provider*` siblings of the expert profile's). It is the
    // one page behind a catalogue card, and its one action is the intake. The
    // same shape as /masters: the address is a constant in the model
    // (`REQUEST_HREF`, `for=service` baked in), the CTA part imports it, and the
    // PAGE reads `requestsOn()` once and mounts the CTA only when the subsystem
    // exists — the profile itself must survive FEATURE_REQUESTS being off,
    // because it is an indexable page. The page it is gated in is the SAME file
    // the expert profile is gated in: one resolver, one flag read.
    ['app/experts/[slug]/_providerData.ts', 'app/experts/[slug]/page.tsx'],
    ['app/experts/[slug]/_providerCta.tsx', 'app/experts/[slug]/page.tsx'],
    // ⚠️ THE TRADE LANDING (stage 8; /experts/<trade> since stage 11). Its CTA
    // is `REQUEST_HREF` from the same model, mounted only when the page hands
    // it `requestsEnabled` — never read from the environment by the part.
    ['app/experts/[slug]/_tradeLanding.tsx', 'app/experts/[slug]/page.tsx'],
    // ⚠️ THE CLIENT'S OWN LIST (D7, stage 6, 2026-08-19) — AND IT MOVED TO THE
    // HOME ON 2026-08-30. /me/requests is a redirect now: „მთავარი" and
    // „მოთხოვნები" were one thing said twice, so the home draws the list and
    // the rail carries three rows. The entry point is the same in every way
    // that matters here — the signed-in owner's own rows, each linking to
    // /request/<ref>, a page they already hold the key to — and it still gates
    // itself with `requestsOn()`, now to decide whether to read them at all.
    ['app/me/page.tsx', 'app/me/page.tsx'],
    // ⚠️ THE CLIENT RAIL'S „ახალი მოთხოვნა" (2026-08-31), from the owner's
    // „Client Space" canvas. The intake had no permanent control in this
    // chrome: it lived in the /me home's greeting band, on ONE of the three
    // screens, and vanished the moment somebody opened „შენახული". The canvas
    // pins it to the bottom of the rail, so it is present on all three.
    //
    // Listed rather than pattern-excused, for the reason at the top of this
    // list — and the PAIRING is the assertion worth having, because neither
    // file could be caught by the scan below: navConfig quotes `REQUEST_ROUTE`
    // (the subsystem publishing its own address, the correct direction) and the
    // sidebar only renders an href it is handed.
    //
    // GATED IN app/me/layout.tsx, NOT IN THE SIDEBAR. `requestsOn()` reads an
    // environment variable and every consumer of navConfig is `'use client'`,
    // where that variable does not exist — so the flag can only be answered on
    // the server. The layout resolves it once and hands the shell an href or
    // null; null draws no button rather than a button onto a 404. The same
    // shape as the home page's hero one entry up.
    ['components/me/navConfig.ts', 'app/me/layout.tsx'],
    ['components/me/ClientSidebar.tsx', 'app/me/layout.tsx'],
    // ⚠️ THE EXPERT'S PROFILE (2026-08-19) — the counterpart of the master's
    // above, and the same shape: the href is BUILT in the page („/request?to="
    // + the expert's slug), the page reads `requestsOn()` ONCE and hands the
    // result down as `requestHref`, and null means the rail draws the message
    // button it always drew. The two parts below carry the value, never the
    // flag — a component that read the environment itself is how two surfaces
    // on one page start disagreeing about whether a subsystem exists.
    //
    // ⚠️ IT IS THE SECONDARY ACTION AND MUST STAY ONE. „დაჯავშნე" is this
    // page's primary; the request path takes the slot „მიწერე ექსპერტს" has,
    // never a third button — asserted under the scan below.
    ['app/experts/[slug]/page.tsx', 'app/experts/[slug]/page.tsx'],
    // ⚠️ THE EXPERT PROFILE'S OWN PARTS WENT WITH THE BOOKING PRODUCT
    // (2026-08-24) — `_booking.tsx` (the rail) and `client.tsx` (the page).
    // The provider profile's CTA is the same door and is listed above.
    ['app/experts/[slug]/_providerCta.tsx', 'app/experts/[slug]/page.tsx'],
  ]
  for (const [f, gate] of CLIENT_ENTRY_POINTS) {
    assert.match(read(gate), /requestsOn\(\)/,
      `${f} reaches /request but ${gate} does not check the flag — it would show on a deployment where the subsystem does not exist`)
    assert.doesNotMatch(read(f), /["'`]\/work\/(requests|offers|service-profile)/,
      `${f} links to the PROVIDER side — that surface is reached by invitation only`)
  }
  // ⚠️ ONE FILE REACHES THE PROVIDER SIDE ON PURPOSE, AND IT IS NOT A LINK.
  //
  // `lib/hats.ts` maps an allowlisted tradesperson to their workspace after
  // sign-in. That is a REDIRECT FOR SOMEBODY THE ALLOWLIST ALREADY NAMES, not a
  // door anybody can find by browsing — the guarantee this test protects is
  // that nobody ARRIVES here without an invitation, and a person who already
  // has one is not arriving, they are going home.
  //
  // It passes the scan below because it quotes `PROVIDER_ROUTE` rather than the
  // literal, which is the correct dependency direction (the subsystem publishes
  // its own address). That would have let it slip through SILENTLY, so it is
  // asserted here instead: the case was considered, and if the file ever stops
  // going through the constant this fails and has to be argued again.
  {
    const hats = read('lib/hats.ts')
    assert.match(hats, /PROVIDER_ROUTE/,
      'lib/hats.ts stopped using the subsystem’s own route constant')
    assert.doesNotMatch(hats, /["'`]\/work\/(requests|offers|service-profile)|["'`]\/provider/,
      'lib/hats.ts hard-codes the provider path instead of importing it')
    // …and it must never become a browsable entry point: no link, no nav item.
    assert.doesNotMatch(hats, /<Link|href=/,
      'lib/hats.ts started rendering a link to the provider side')
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
    if (rel.startsWith('app/request/') || rel.startsWith('app/work/(provider)/')) continue
    // ⚠️ THE /work SHELL AND ITS RAIL (stage 6, 2026-08-19). The master's three
    // items live in components/work/navConfig beside the expert's, and the
    // shell (app/work/layout.tsx) draws them only for a viewer the (provider)
    // gate itself admits — capabilitiesOf → WORK, or requestsViewer().
    // providerAllowed — never for a role. The (expert) layout's redirect sends
    // a WORK-only account to the queue for the same reason lib/hats does: that
    // is somebody the allowlist already names going home, not a door. All
    // three mechanisms are asserted just under this scan.
    if (rel === 'components/work/navConfig.ts' || rel === 'app/work/layout.tsx') continue
    // The client's OWN request list (D7): /me/requests reads `userId = me` and
    // links each row to /request/<ref> — a page its owner already holds the
    // key to. Named here, gated below (requestsOn() + the signed-in owner).
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
    // …and so are the two files the subsystem's own „write to this provider
    // first" is made of: lib/requestInvite is where the INVITED offer is
    // DEFINED (one definition, two callers — the room's button and the intake's
    // `?to=`), lib/requestTarget is what resolves that parameter. Neither
    // renders anything; the only /request they contain is prose about their own
    // URL. Pinned separately by tests/hireDirect.test.ts.
    if (rel === 'lib/requestInvite.ts' || rel === 'lib/requestTarget.ts') continue
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
    // ⚠️ THE ONE LIST OF WORK (2026-08-19). /work/jobs holds a provider's
    // committed work of BOTH kinds, so an accepted QUOTE row has to open where
    // an offer is viewable (lib/jobRows → href '/work/offers'), and the empty
    // state offers the open queue to somebody who has no work yet.
    //
    // This is not a door into the subsystem, by the same mechanism UserMenu is
    // excused below: the row only EXISTS for a provider whose offer was
    // accepted, and the CTA renders only when `hasProvider` — which the page
    // derives from `requestsViewer()` behind `providersOn()`, i.e. the same
    // allowlist the subsystem's own 404 gate reads. A stranger browsing the
    // site is never shown either string. The mechanism is asserted just under
    // this scan rather than trusted to this line.
    if (rel === 'lib/jobRows.ts' || rel === 'app/work/jobs/_client.tsx') continue
    // ⚠️ components/UserMenu IS THE WAY BACK, AND IT IS GATED ON THE HAT
    // (2026-08-18). An approved tradesperson keeps role STUDENT (lib/hats), so
    // this menu called them „სტუდენტი" and offered them the EXPERT application
    // — and there was no route to /provider from anywhere on the site. Their
    // own workspace was reachable only by typing the URL or signing in again.
    //
    // This is NOT a door anybody can find by browsing, which is the guarantee
    // the scan protects: the item renders only when `hats.includes('MASTER')`,
    // and that hat requires BOTH a ServiceProfile and an active RequestAccess
    // row — the same allowlist the subsystem itself checks. Identical reasoning
    // to lib/hats.ts's own exemption below, and the mechanism is asserted just
    // under this scan rather than trusted to this line.
    if (rel === 'components/UserMenu.tsx') continue
    // ⚠️ THE MOBILE TAB BAR, INSIDE THE WORKSPACE ONLY (M1, 2026-08-18). Its
    // three tabs are drawn only when the pathname is ALREADY one of the
    // master's three /work screens — a place nobody reaches without passing
    // the workspace's own 404 gate. So it is not a door into the subsystem; it
    // is furniture inside it, the same way the /work rail's own items are.
    // AppShell's line is the path test that lets the bar render there at all.
    // Both mechanisms are asserted just under this scan.
    if (rel === 'components/BottomNav.tsx' || rel === 'components/AppShell.tsx') continue
    // The public header's „მოთხოვნა" item — the ONE link outside the subsystem,
    // added at the owner's request (2026-08-14: „მხოლოდ ადმინებს რომ
    // გამოუჩნდეს") and verified admin-gated by the assertions below this scan.
    // This line only says WHERE to look; the mechanism check is what matters.
    if (rel === 'components/PublicTopBar.tsx') continue

    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      // A quoted "/request" or one of the master's three "/work/…" screens —
      // a link target, not the word. Never a bare "/work": that prefix is the
      // expert's workspace, linked from everywhere it should be.
      if (!/["'`]\/(request(["'`/?#])|work\/(requests|offers|service-profile)(["'`/?#])|provider(["'`/?#]))/.test(line)) return
      offenders.push(`      ${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.equal(offenders.length, 0,
    `something links to the requests subsystem from outside it:\n${offenders.join('\n')}`)

  // The allowlist entry above only says WHERE to look. This is the part that
  // matters: the menu's provider item must be gated on the MASTER hat, never on
  // a role — a `role === 'TUTOR'`-style test would show the door to somebody
  // the requests allowlist has never admitted.
  const menu = read('components/UserMenu.tsx')
  assert.match(menu, /const sellsHere = hats\.includes\('PROVIDER'\)/,
    'the user menu stopped deriving the workspace door from the hat')
  // ⚠️ THE DOOR IS /work SINCE 2026-08-20 and there is only one of it — what
  // this pins is unchanged: a provider reaches the supply side through the
  // PROVIDER HAT, never through a role, and the hat requires the same allowlist
  // row the workspace itself checks.
  assert.match(menu, /if\s+\(\(isDualRole\s+\|\|\s+sellsHere\)\s+&&\s+!inExpertSpace\s+&&\s+!inProviderSpace\)\s+\{\s*\n\s*switchItems\.push\(\{\s+href:\s+'\/work'/,
    'the provider link in the user menu is no longer behind the provider hat')

  // Same shape for /work/jobs: the allowlist entry above says WHERE to look,
  // this says the two strings are unreachable without the allowlist. The page
  // asks `requestsViewer()` behind `providersOn()` and sends anybody without a
  // provider identity to /me — the whole list is quotes since 2026-08-24, so
  // there is nothing to show them and no `hasProvider` flag to hand down.
  const jobsPage = read('app/work/jobs/page.tsx')
  assert.match(jobsPage, /const\s+viewer\s+=\s+providersOn\(\)\s+\?\s+await\s+requestsViewer\(\)\s+:\s+null/,
    'the jobs page derives the provider from something other than the viewer + the switch')
  assert.match(jobsPage, /if \(!provider\) redirect\('\/me'\)/,
    'the jobs screen no longer turns away somebody with no provider identity')
  // ⚠️ THE CTA IS UNCONDITIONAL NOW, AND THE GATE MOVED UP (2026-08-24). It
  // used to be `hasProvider ? … : undefined` because the page also served
  // somebody with only a consultation profile; the page redirects them away
  // instead, so everybody who reads this empty state can open the queue.
  assert.match(read('app/work/jobs/_client.tsx'), /cta=\{\{ label: '[^']+', href: '\/work\/requests' \}\}/,
    'the queue CTA on /work/jobs points somewhere else')

  // The tab bar's provider tabs are keyed on the SPACE the pathname is in —
  // never on a role, never on a hat, never anywhere but the master's three
  // paths (lib/requests → isProviderWorkspacePath — and that helper is bound
  // to PROVIDER_WORKSPACE_PATHS, asserted executed below).
  const nav = read('components/BottomNav.tsx')
  // ⚠️ THE PROVIDER'S THREE PATHS NO LONGER NEED THEIR OWN BRANCH (2026-08-30).
  // This asserted `isProviderWorkspacePath(path) ? PROVIDER_TABS`, which existed
  // because /work had TWO tab sets and those three paths picked the right one.
  // There is one supply-side set now — the same five rows the rail draws — so
  // the whole of /work resolves to it and the special case is the thing that
  // would reintroduce a difference. What must hold is unchanged and is asserted
  // right here: standing anywhere in /work gives a provider the provider's tabs.
  assert.match(nav, /path\.startsWith\('\/work'\) \? PROVIDER_TABS/,
    'BottomNav no longer gives the whole provider space one tab set')
  assert.ok(nav.includes("href: '/work/profile'"),
    'the phone lost the tab for the editor where a provider sets what they sell')
  for (const p of PROVIDER_WORKSPACE_PATHS) {
    assert.equal(isProviderWorkspacePath(p), true, `${p} is not the master's space`)
    assert.equal(isProviderWorkspacePath(p + '/x'), true, `${p}/… is not the master's space`)
  }
  for (const p of ['/work', '/work/bookings', '/work/requests-x', '/me', '/provider/requests', '/request']) {
    assert.equal(isProviderWorkspacePath(p), false, `${p} was read as the master's space`)
  }
  // ⚠️ THREE ASSERTIONS STOOD HERE AND ALL THREE PINNED A DEAD DISTINCTION
  // (retired 2026-08-30). They required `isProviderWorkspacePath(path) ?
  // PROVIDER_TABS`, `workOnly ? PROVIDER_TABS`, and the definition
  //
  //     const workOnly = caps.includes('WORK') && !caps.includes('CONSULT')
  //
  // — and that last one could not be true. `/api/me` stopped returning
  // `capabilities` on 2026-08-24 when the CONSULT/WORK pair went with the second
  // product, so `caps` was always `[]`, `workOnly` always false, and /work
  // always drew the OTHER set — the one with no tab for „ჩემი სერვისები". These
  // tests were green throughout: they asserted that the branch existed, never
  // that it could be taken.
  //
  // There is one kind of provider, so there is one supply-side set — asserted
  // above, together with the tab whose absence was the actual cost.
  /* ⚠️ THIS ASSERTION WAS REPLACED ON 2026-09-03, AND THE RULE IT DEFENDED IS
     THE REASON. It read
         assert.doesNotMatch(nav, /PROVIDER_TABS[\s\S]{0,200}role === /,
           'PROVIDER_TABS became role-keyed — a role is not the allowlist')
     and it went red on the change that made „a role is not the allowlist"
     TRUE for the first time: the fallback for a page in neither room used to
     be `TABS_BY_ROLE[role]`, and three of 27 accounts that hold an active
     RequestAccess row AND a ServiceProfile carry `role: USER` — so three
     working providers were handed the CLIENT's tab bar everywhere outside /me
     and /work. The regex matched the new `role === 'ADMIN'` sitting two lines
     above `sells ? PROVIDER_TABS`, which is a role question about a
     permission and exactly what a role is for.

     CLAUDE.md: „If an assertion can break on a rename, a reformat or a restyle
     while the screen is identical, it is pinning the wrong thing." What is
     pinned now is the decision itself. */
  assert.match(nav, /sells \? PROVIDER_TABS/,
    'the supply-side tab set stopped following `sells` — identityOf‘s fact, not a role')
  assert.doesNotMatch(nav, /TABS_BY_ROLE\[role\]/,
    'a role is the last resort again — see identityOf in CLAUDE.md')
  const shell = read('components/AppShell.tsx')
  assert.match(shell, /const\s+inProviderSpace\s+=\s+isProviderWorkspacePath\(path\s+\?\?\s+''\)/,
    'AppShell no longer recognises the provider workspace')

  // The /work rail: the master's items are their own group, drawn only for
  // the capability (or the allowlist), never for a role — and the shell draws
  // nothing at all for a viewer with no session, so the (provider) 404 stays a
  // bare 404.
  const navCfg = read('components/work/navConfig.ts')
  // ⚠️ THE GROUP IS GONE, THE GATE IS NOT (2026-08-19). The rail became ONE list
  // of functions rather than two lists of person-kinds; what this test protects
  // is unchanged — the subsystem's two screens are drawn only for a viewer the
  // allowlist admits (`groups.work`), never for a role, and never by default.
  assert.match(navCfg, /export const WORK_ONLY_NAV: NavItem\[\] = \[/, 'the subsystem\'s items left navConfig')
  assert.doesNotMatch(navCfg, /export const PROVIDER_NAV/, 'the per-person group came back')
  assert.match(navCfg, /\.\.\.\(groups\.work\s+\?\s+WORK_ONLY_NAV\s+:\s+\[\]\)/, 'the subsystem items are no longer drawn by capability')
  const workLayout = codeOf('app/work/layout.tsx')
  assert.match(workLayout, /if \(!user\) return <>\{children\}<\/>/, 'the /work shell draws chrome for a signed-out visitor')
  assert.match(workLayout, /work:\s+viewer\s+!==\s+null\s+&&\s+\(provider\s+\|\|\s+viewer\.providerAllowed\)/,
    'the queue row is no longer keyed on the profile / the allowlist')
  assert.doesNotMatch(workLayout, /work: [^\n]*ROLE\./, 'the master group became role-keyed — a role is not the allowlist')
  assert.doesNotMatch(workLayout, /redirect\(|notFound\(|requireRole\(/, 'the /work shell became a guard — the guard is the route group')
  // ⚠️ THE (expert) GROUP AND ITS BOUNCE ARE GONE (2026-08-24). Its layout ran
  // `requireRole` and then redirected a WORK-only provider to /work — a rule
  // that existed only because a service provider kept meeting a booking
  // calendar. One group is left and tests/spaces.test.ts §C pins its 404.

  // /me/requests (D7): the owner's list, and only the owner's — gated on the
  // flag and on the session, scoped by userId.
  // ⚠️ THE LIST IS THE HOME SINCE 2026-08-30, and the three guarantees moved
  // with it unchanged: a session is required, the rows are the signed-in
  // owner's, and the subsystem's absence is honoured. What CHANGED is the
  // shape of the last one — /me is the client's home whether or not requests
  // exist, so it cannot 404 the way a dedicated page could; it reads no rows
  // and offers no intake instead. Same promise, the only form it can take on a
  // screen that has other reasons to exist.
  const mine = codeOf('app/me/page.tsx')
  assert.match(mine, /const on = requestsOn\(\)/, '/me stopped checking whether the subsystem exists')
  assert.match(mine, /on \? await myRequests\(user\.id\) : \[\]/, '/me reads requests on a deployment without the subsystem')
  assert.match(mine, /const user = await requireUser\(\)/, '/me does not require a session')
  assert.match(mine, /myRequests\(user\.id\)/, '/me lists something other than the signed-in owner’s requests')
  assert.match(codeOf('lib/myRequests.ts'), /where: \{ userId \}/, 'lib/myRequests widened the owner match')
  // ⚠️ `/api/me/requests` WAS ASSERTED HERE AND THE ROUTE IS GONE (2026-08-30).
  // Its own header said why it existed: „this route exists only because the
  // home is a client component." The /me home is a server component now — it
  // calls `myRequests` directly, like /me/requests always did — so the route
  // had no caller left. The gate it carried is not lost: both remaining readers
  // are asserted directly above, and an endpoint that answers a person's own
  // request list is one more surface to keep scoped for no reader at all.
  assert.match(shell, /\(!inRequests \|\| inProviderSpace\) && \(/,
    'the provider workspace lost its bottom nav again (M1)')

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
  assert.match(bar, /if\s+\(i\.href\s+===\s+'\/request'\)\s+return\s+requestsOn\(\)/,
    'the header „მოთხოვნა" item no longer checks the flag — it would show on a deployment where the subsystem does not exist')
  // The FLAG check is the whole gate now, so it must be the real thing and not
  // a literal somebody inlined while removing the role test.
  assert.doesNotMatch(bar, /i\.href === '\/request'\) return true/,
    'the requests item is shown unconditionally — FEATURE_REQUESTS=off must still hide it')
})

// ⚠️ THE AUDIENCE, WHICH IS A SEPARATE QUESTION FROM THE FLAG (2026-08-21).
// A third assertion used to sit in the test above — `doesNotMatch(… requestsOn()
// &&)`, „the requests item narrowed its audience again" — and it was written
// against ONE narrowing: the admin-only filter that had hidden a working page
// from anonymous visitors. It has been replaced rather than deleted, because
// the half of it that still matters (a GUEST must keep the CTA) is now stated
// as behaviour instead of as a regex over one statement, per CLAUDE.md §6.
//
// What changed. Owner, 2026-08-21, holding the header signed in as a provider:
// „როცა სერვისი მაქვს დამატებული არ უნდა მიჩანდეს მოთხოვნის გაგზავნა. მხოლოდ
// მაშინ როცა user კლიენტი შემოდის უბრალოდ." The bar carries ONE permanent
// action on every public page, and for somebody who has registered a service
// that action was an invitation to buy, printed above the page where they sell.
//
// The two halves this pins, and they pull in opposite directions on purpose:
//   · a guest and a plain client still get it — the 2026-08-17 ruling, intact;
//   · anybody with a capability does not — the 2026-08-21 one.
// ⚠️ AND THE PERMISSION IS NO LONGER UNTOUCHED (2026-08-31). This comment used
// to end „canOpenRequestForm() still admits everyone the flag admits, because a
// provider who needs a plumber is a client like anybody else. A hidden
// invitation is not a closed door." The owner closed the door: „მინდა რომ ვისაც
// სერვისი აქვს იმას არ შეძლოს სერვისის დაკვეთა." The two functions still answer
// DIFFERENT questions — this one decides what the chrome draws, the other
// decides what the server accepts — and that separation is the thing this test
// exists to keep. They now happen to agree about one audience.
test('the header CTA invites the demand side only — and never mistakes that for a gate', () => {
  assert.equal(showRequestCta(false), true, 'a guest or a plain client lost the intake CTA')
  assert.equal(showRequestCta(undefined), true, 'an unresolved identity must read as demand, not as supply')
  assert.equal(showRequestCta(null), true)
  // ⚠️ IT TOOK A LIST OF CAPABILITIES UNTIL 2026-08-24 — CONSULT, WORK, or
  // both. One profile, one boolean; the rule („anybody who sells is not the
  // audience for this invitation") is unchanged.
  assert.equal(showRequestCta(true), false, 'a provider with a registered service is still invited to buy one')
  // The invitation and the door are not the same question, and the proof is
  // that the bar's rule alone cannot open or close the form: `showRequestCta`
  // takes no view of the flag, `canOpenRequestForm` does.
  assert.equal(canOpenRequestForm(), requestsOn(), 'the CTA’s audience leaked into the subsystem gate')
  assert.equal(showRequestCta(true), canFileRequest(true),
    'the two rules disagree about a seller — the chrome would draw a door the server refuses')
  // One const feeds both renders (desktop button + mobile drawer), so the two
  // cannot drift apart; and the rule itself is not re-implemented in the bar.
  const bar = codeOf('components/PublicTopBar.tsx')
  assert.match(bar, /showRequestCta\(/, 'the bar stopped asking the shared rule who the CTA is for')
  assert.doesNotMatch(bar, /capabilities\?\.length/, 'the bar re-implements showRequestCta instead of calling it')
})

test('it is not in the sitemap, not in the feed, and not named in robots.txt', () => {
  const sitemap = read('app/sitemap.ts')
  // STATIC_ROUTES is an allowlist, so absence is the default — pinned anyway,
  // because „add every page to the sitemap" is a plausible future tidy-up.
  assert.doesNotMatch(sitemap, /path: '\/request'/)
  assert.doesNotMatch(sitemap, /path: '\/provider'|path: '\/work/)
  assert.doesNotMatch(read('app/rss.xml/route.ts'), /\/request|\/provider|\/work/)
  // The instinct is to add these to Disallow. That is backwards: robots.txt is
  // PUBLIC, so a Disallow line publishes the exact URLs the subsystem exists to
  // keep unlisted — to anyone who reads it, including every scraper that treats
  // Disallow as a list of interesting places. /business and /abroad are absent
  // from that file for the same reason.
  // ⚠️ THE ASSERTION IS ON THE `disallow` ARRAY, WHICH IS WHAT THE PARAGRAPH
  // ABOVE ACTUALLY SAYS (narrowed 2026-08-30). It used to scan the WHOLE file
  // for the words, and passed only by an accident of vocabulary: the public
  // photo route was spelled `/api/masters/` and sat in the ALLOW list — an
  // Allow is the opposite of publishing a private URL, it is what lets a shared
  // link show a face at all. The rename to `/api/providers/` put the word in
  // the file for an entirely legitimate reason and the blunt scan called it a
  // leak. What must never happen is a DISALLOW line naming the subsystem, and
  // that is now what is checked.
  const robots = read('app/robots.ts')
  const disallow = robots.slice(robots.indexOf('disallow: ['), robots.indexOf(']', robots.indexOf('disallow: [')))
  assert.doesNotMatch(disallow, /request|provider/)
  // /work is Disallowed as a workspace (like /me), never NAMED as the
  // subsystem's — the line reads „/work$" and „/work/", nothing longer.
  assert.doesNotMatch(read('app/robots.ts'), /\/work\/[a-z]/)
  // Every page carries noindex AND nofollow — nofollow deliberately: a crawler
  // that reached one must not walk out of it either.
  for (const f of ['app/request/page.tsx', 'app/request/[ref]/page.tsx', 'app/work/(provider)/layout.tsx']) {
    assert.match(read(f), /robots: \{ index: false, follow: false \}/, `${f} is indexable`)
  }
})

test('FEATURE_REQUESTS reaches the browser bundle', () => {
  // app/admin/_nav.tsx is a CLIENT component and only NEXT_PUBLIC_* vars exist
  // in the browser by default — so without this inline the two admin tabs were
  // filtered out on every deployment while the server half worked perfectly.
  // Invisible when broken (nothing errors; the rail is simply two rows shorter),
  // which is exactly the class of defect this file exists to pin.
  assert.match(read('next.config.js'), /env:\s+\{\s+FEATURE_REQUESTS:\s+process\.env\.FEATURE_REQUESTS,\s+FEATURE_PROVIDERS:\s+process\.env\.FEATURE_PROVIDERS\s+\}/,
    'next.config.js no longer inlines FEATURE_REQUESTS + FEATURE_PROVIDERS — client components read undefined, the admin tabs and the signup tile vanish')
})

test('the admin tabs disappear with the subsystem', () => {
  const nav = codeOf('app/admin/_nav.tsx')
  // Three tabs now, not two — „ხელოსნები" joined them 2026-08-18. It belongs to
  // the same subsystem for the same reason the other two do: it approves people
  // INTO /provider, so leaving it visible with the flag off would offer an admin
  // a button that admits somebody to a workspace that 404s.
  // „ძაბრი" joined 2026-08-30: with the flag off it is five bars of zero, which
  // reads as a broken panel rather than an absent feature.
  assert.match(nav, /\.filter\(it\s+=>\s+\(it\.id\s+!==\s+'requests'\s+&&\s+it\.id\s+!==\s+'access'\s+&&\s+it\.id\s+!==\s+'funnel'\)\s+\|\|\s+requestsFeatureExists\(\)\)/,
    'the requests tabs are no longer filtered out of ADMIN_NAV')
  // …and the applications queue follows the SUPPLY-side switch (D6): it
  // approves people into /provider, which is what FEATURE_PROVIDERS turns off.
  // The tab id was `masters` until 2026-08-30; `#masters` still lands here
  // through TAB_ALIASES.
  assert.match(nav, /\.filter\(it\s+=>\s+it\.id\s+!==\s+'providers'\s+\|\|\s+providersFeatureExists\(\)\)/,
    'the applications tab is not filtered on providersFeatureExists()')
  assert.match(nav, /masters: 'providers'/,
    'the old #masters hash no longer lands on the applications queue')
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
    kind: 'MEETING', topic: 'accounting',
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
  const QUEUE = 'app/work/(provider)/requests/page.tsx'
  const JOB = 'app/work/(provider)/requests/[id]/page.tsx'
  for (const f of [QUEUE, JOB]) {
    const body = codeOf(f)
    assert.match(body, /providerRequestView/, `${f} shapes the row itself`)
    // The phone, the email and the admin's private note are never fetched by
    // NAME on a provider surface. The one legitimate route to the first two is
    // `CLIENT_CONTACT_SELECT`, which spells them once, in lib/requests, behind
    // a paid unlock — so a column name appearing in a page is by definition a
    // second route somebody opened by hand.
    for (const col of ['phone: true', 'email: true', 'adminNote']) {
      assert.ok(!body.includes(col), `${f} selects „${col}" — a provider must never receive it`)
    }
  }

  /* ⚠️ `contactName` IS NO LONGER BANNED OUTRIGHT ON THE JOB PAGE (2026-09-01,
     the owner's design canvas → „Expert Jobs"). The blanket source ban was a
     proxy for the real rule, and the canvas made the proxy wrong while leaving
     the rule alone.

     THE RULE, unchanged since 2026-08-21: the client's NAME is released the
     moment they accept somebody's offer — `clientIdentityOpen`, executed in the
     next test — and not one moment earlier. What changed is only WHICH screen
     prints it: the canvas moved the fee to the end of the flow, so the provider
     who has been chosen now meets a „კლიენტმა შეგარჩია" card here, greeting
     them by the client's name, instead of finding it in the offers inbox.

     WHAT IS PINNED INSTEAD is the thing that would actually hurt somebody: the
     name must not ride on the SHARED row. `providerRequestView` is handed one
     object, that object is built by the select at the top of the page, and a
     nullable `contactName` on it is a field a future render forgets to gate on
     its first day. So the file is cut at the acceptance branch — everything
     above it, the shared select included, may not mention the name at all — and
     the fetch below it must be a conditional expression rather than a
     statement that always runs. */
  assert.ok(!codeOf(QUEUE).includes('contactName'),
    'the queue selects the client‘s name — a list has no acceptance to gate it on, so there is no moment at which it is legitimate there')
  const job = codeOf(JOB)
  const gate = job.indexOf("'ACCEPTED'")
  assert.ok(gate > 0, 'the job page no longer branches on an ACCEPTED offer — the gate this assertion measures from is gone')
  assert.ok(!job.slice(0, gate).includes('contactName'),
    'the job page fetches the client‘s name before it knows whether this provider was chosen — that is ProviderRequestRow widening again')
  const fetched = job.indexOf('contactName', gate)
  assert.ok(fetched > 0, 'the job page stopped fetching the client‘s name at all — the „chosen" card cannot greet anybody')
  assert.match(
    job.slice(job.lastIndexOf('const ', fetched), fetched), /\?/,
    'the client‘s name is fetched unconditionally — it has to hang off the branch that already established this provider won',
  )
})

// ⚠️ THIS TEST USED TO PIN THE OPPOSITE (2026-08-14 → 2026-08-21): „a provider
// gets the client's contact once their offer is ACCEPTED". The reveal was the
// product — „WE open the contact" — and the test guarded its one gate.
//
// Owner, 2026-08-21, holding the provider's thread screen: „მოდი ამ ეტაპზე იყოს
// მიწერა და ჩათში გარკვნენ, ნომერიც თუ საჭიროა იქ გაცვალონ… არ უჩანდეს ეგრევე
// ტელეფონი." Two reasons, and the second is the business one: an automatic
// reveal gives away, for free and at the moment of acceptance, the only thing
// the platform has to sell („ჩემი მიზანი ხომ ისაა, რომ ლიდი გავყიდო").
//
// So what is pinned now is the ABSENCE, on both sides, at BOTH layers: the
// function releases a name and nothing else, and the three screens that used to
// print a number do not even fetch the columns. The name rule is unchanged.
test('the client‘s phone and email never reach a provider — only the name, and only once chosen', () => {
  for (const status of ['SENT', 'WITHDRAWN', 'DECLINED', 'INVITED']) {
    assert.equal(clientIdentityOpen({ status }), false, `${status} unsealed the client‘s identity`)
  }
  assert.equal(clientIdentityOpen({ status: 'ACCEPTED' }), true)
  // The seal releases a NAME. „კლიენტი" before, the person after — one rule,
  // asked by both the inbox row and the jobs list rather than copied.
  assert.equal(offerPeerName({ status: 'SENT' }, 'ნინო მაგალიძე'), 'კლიენტი')
  assert.equal(offerPeerName({ status: 'ACCEPTED' }, 'ნინო მაგალიძე'), 'ნინო მაგალიძე')

  // …AND THE COLUMNS ARE NOT FETCHED. A rule enforced by the query is one a
  // later render cannot forget — this is the assertion that would fail if
  // somebody re-added the block, because the block needs the data first.
  for (const f of ['app/work/(provider)/offers/page.tsx', 'components/chat/OfferThreadPane.tsx']) {
    const body = codeOf(f)
    assert.ok(!/\bphone: true\b/.test(body), `${f} selects the client‘s phone again`)
    assert.ok(!/\bemail: true\b/.test(body), `${f} selects the client‘s email again`)
    assert.ok(!body.includes('adminNote'), `${f} selects the admin‘s private note`)
    assert.ok(!/tel:|mailto:/.test(body), `${f} prints a contact link`)
  }
})

/* ⚠️ THIS TEST WAS REVERSED ON 2026-09-03, AND THE HALF IT KEPT IS THE POINT.
   It used to be „the provider's phone and email never reach the client either —
   the mirror, same day", pinning the 2026-08-21 decision to take BOTH numbers
   off the screen at once. The owner undid the supply half of it: „დარეკვა უნდა
   იყოს ასარჩევად ორი ღილაკი და შემდეგ აირჩიოს რომელი სჭირდება", so an offer
   now carries „მიწერა" and „დარეკვა" and the client picks.

   Pinning the absence of the provider's phone would now pin a bug. What is
   asserted instead is the line the reversal did NOT cross — the client's own
   contact, which is what the platform sells — plus the two things that keep the
   new opening narrow: the EMAIL still never leaves, and the room still fetches
   no column about the client. */
test('the client may ring their provider — the phone, never the email, and nothing back the other way', () => {
  const base = {
    id: 'o1', priceGel: 1200, priceKind: 'FIXED', daysEstimate: 10, message: 'გავაკეთებ',
    createdAt: new Date('2026-08-14T10:00:00Z'),
    provider: { name: 'ბესიკ მაგალიძე', canCall: true },
  }
  for (const status of ['SENT', 'WITHDRAWN', 'DECLINED', 'ACCEPTED']) {
    const v = clientOfferView({ ...base, status })
    // ⚠️ ON EVERY STATUS, NOT ONLY THE ACCEPTED ONE. „ასარჩევად" is the owner's
    // word: the call is offered while the client is still CHOOSING, which is
    // the whole change. A version that allowed it only after the accept would
    // pass a laxer assertion and ship the feature nobody asked for.
    assert.equal(v.providerCanCall, true, `no call offered on a ${status} offer`)
    // ⚠️ AND IT IS A FLAG, NOT THE DIGITS (2026-09-03, second pass). The number
    // is sold by POST /api/requests/[ref]/call; a string here would sit in the
    // page source and make the fee optional.
    assert.ok(!/55512|phone/i.test(JSON.stringify(v)), `clientOfferView leaked a number on a ${status} offer`)
    // The NAME is always shown — it is what the client is choosing between.
    assert.equal(v.providerName, 'ბესიკ მაგალიძე')
    // The email did not come with it, and there is no branch where it does.
    assert.ok(!/email/i.test(JSON.stringify(v)), `clientOfferView emitted an email on a ${status} offer`)
  }
  // A provider with nothing on file yields null, never '' — the card asks
  // `{tel && …}` and an empty string would draw a button that dials nowhere.
  assert.equal(clientOfferView({ ...base, status: 'SENT', provider: { name: 'ბესიკ' } }).providerCanCall, false)

  /* ⚠️ AND THE MIRROR REALLY IS STILL SHUT. This is the assertion that would
     have to be deleted for the reversal to have gone too far: nothing the
     client's room hands over says anything about the CLIENT, whose name opens
     on the accept and whose number is still bought. */
  for (const status of ['SENT', 'WITHDRAWN', 'DECLINED', 'INVITED']) {
    assert.equal(clientIdentityOpen({ status }), false, `${status} unsealed the client‘s identity`)
  }
  // …and the page stopped fetching them, so the shape above cannot be widened
  // from the query side either.
  /* ⚠️ THE QUERY MOVED TO `_room.tsx` ON 2026-09-02 and the page kept the
     guard. The room became ONE component with TWO addresses that day — the
     signed-in client reads it at /me/r/<ref> inside their own workspace
     instead of being thrown into the intake's bare chrome — so both files are
     read here: the SELECT has to stay narrow wherever it ends up, and neither
     file may grow a second one. */
  const page = codeOf('app/request/[ref]/page.tsx') + '\n' + codeOf('app/request/[ref]/_room.tsx')
  assert.match(page, /clientOfferView\(/, 'the client page shapes offers itself')
  // `phone: true` IS expected now — it is the column the button runs on. The
  // email is not, and that is still a rule enforced by what is FETCHED.
  assert.ok(!/email: true/.test(page), 'the client page selects the provider‘s email')
  assert.ok(!page.includes('adminNote'), 'the client page selects the admin‘s private note about them')
  const list = codeOf('app/request/[ref]/OfferList.tsx')
  assert.ok(!/mailto:/.test(list), 'the offer list prints an email link')
  /* ⚠️ THE CARD MUST NOT BE ABLE TO BUILD A `tel:` ITSELF (2026-09-03). The
     number is sold — POST /api/requests/[ref]/call charges the provider and
     returns the already-shaped link — so a `telHref(` or a template `tel:${…}`
     back in this file would mean the digits are in the props again, and a fee
     anybody can read past is not a fee. */
  assert.ok(!/telHref\(/.test(list), 'the offer list shapes a number itself again')
  assert.match(list, /requests\/\$\{publicRef\}\/call/, 'the call button stopped going through the paid route')
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
  assert.match(claim, /offerCount:\s+\{\s+lt:\s+prisma\.serviceRequest\.fields\.offerLimit\s+\}/,
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
    assert.match(src, /CHECK\s+\("offerCount"\s+>=\s+0\s+AND\s+"offerCount"\s+<=\s+"offerLimit"\)/,
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

test('the budget ladder is per kind — and no band is refused any more', () => {
  // The ladder's SHAPE is still load-bearing even though nothing is refused by
  // it: `bandOf` maps a typed amount onto it, the expert reads the band on the
  // request, and `floor: true` still drives the wizard's „fewer offers" note.
  // What changed on 2026-08-18 is only the consequence — see the endpoint half
  // of this test.
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

  // ⚠️ THE ENDPOINT NO LONGER REFUSES ANYTHING FOR ITS BUDGET (2026-08-18).
  //
  // The ladder above is still real and still asserted — a budget is collected,
  // stored, and shown to the expert who bids. What is gone is the REFUSAL. It
  // turned away 7 of 21 requests, four of them 20₾ lessons; the closest local
  // competitor asks for no budget at all. Owner: „ზღვარი მოხსენი."
  //
  // Pinned as an EQUALITY, not an absence: `const rejected = false` is a claim
  // this test can check, where „the floor call is missing" would also pass on a
  // file somebody half-refactored.
  const route = codeOf('app/api/requests/route.ts')
  assert.match(route, /const rejected = false/,
    'something rejects a request on arrival again — if it is the budget floor, it closes a third of the funnel')
  // The ladder itself must keep its shape. Nothing sets `rejected` today, and a
  // dead branch that is quietly wrong is a bug waiting for its first caller.
  assert.match(route, /status: rejected \? 'REJECTED' :/,
    'the status ladder changed — REJECTED must still outrank auto-verification')
  assert.match(route, /const autoVerified = !rejected &&/,
    'auto-verification stopped deferring to `rejected`')
  // THE ROW IS STILL WRITTEN, whatever the budget. If this ever becomes an
  // early return, the measurement is gone and nothing says so.
  const beforeCreate = route.slice(0, route.indexOf('createServiceRequest'))
  assert.doesNotMatch(beforeCreate, /if \(rejected\)[\s\S]{0,80}return/,
    'a request is dropped instead of stored — that is the measurement')
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
    ['MEETING', 'ხელშეკრულებას', 'contract'],
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

test('going back to change the topic does not throw the draft away', () => {
  /* ⚠️ THE BUG THIS PINS SHIPPED AND THE OWNER FOUND IT (2026-09-04): „ბოლოში
     მივდივარ და უკან რაიმეს შესწორება მინდა — უკან შლის ყველაფერს."

     `onClearTopic` — the „change" control on screen one — calls
     `withTopic(d, '')`, and an empty id has no kinds, so the „is the old kind
     still possible?" branch answered no and wiped kind, budgetBand, timing and
     details. Somebody who reached the contact screen, came back to fix one word
     and tapped change lost the band and the date before choosing anything new.

     What is pinned is the RULE, not the fix: clearing the topic clears the
     topic, and the decision about what the old answers are still worth belongs
     to the next pick — which must still clear an incompatible kind. Both halves
     are asserted, because a change that only satisfies the first would let a
     PROJECT band survive onto a LEARNING run. */
  const { withTopic, withKind, EMPTY_DRAFT } =
    require('../app/request/_model') as typeof import('../app/request/_model')

  let full = withTopic(EMPTY_DRAFT, 'contract')
  full = withKind(full, 'PROJECT')
  full = { ...full, description: 'ხელშეკრულების შედგენა მჭირდება', budgetBand: 'p2', timing: 'two_weeks' }

  const cleared = withTopic(full, '')
  assert.equal(cleared.topic, '', 'the topic was not cleared')
  assert.equal(cleared.kind, 'PROJECT', 'clearing the topic threw the kind away')
  assert.equal(cleared.budgetBand, 'p2', 'clearing the topic threw the budget away')
  assert.equal(cleared.timing, 'two_weeks', 'clearing the topic threw the date away')
  assert.equal(cleared.description.length, full.description.length, 'clearing the topic threw the brief away')

  // Coming back to the same answer restores a complete draft.
  const same = withTopic(cleared, 'contract')
  assert.equal(same.kind, 'PROJECT')
  assert.equal(same.budgetBand, 'p2')
  assert.equal(same.timing, 'two_weeks')

  // …and the other half still holds: a topic that cannot carry the old kind
  // resets what was keyed to it.
  const other = withTopic(cleared, 'chemistry')
  assert.notEqual(other.kind, 'PROJECT', 'an incompatible topic kept the old kind')
  assert.notEqual(other.budgetBand, 'p2', 'a PROJECT band survived onto a LEARNING run')
})

test('the run is one question per screen, derived from the draft', () => {
  // The reference model (owner, 2026-08-17): profi-style single-question
  // screens, the kind folding away when the topic answers it, free text
  // optional at the end. These are the routing rules the wizard runs on,
  // executed rather than described.
  const { withTopic, stepsFor, stepComplete, resumeStepId, EMPTY_DRAFT } =
    require('../app/request/_model') as typeof import('../app/request/_model')

  // ⚠️ THE RUN GOT TWO SCREENS SHORTER (2026-08-18) AND THIS PINS THE NEW
  // SHAPE. Two steps were retired for measured reasons, not tidiness:
  //
  //   „details"  a whole screen for an optional textarea. Of 19 real requests
  //              8 carried a description, so 58% walked through it to skip it.
  //              It is now a collapsed field on the contact screen.
  //   „kind"     one question with two answers, on its own page, directly after
  //              the question it depends on. It is now the second half of
  //              screen one — the kinds appear under an ambiguous topic in
  //              place. The step id survives ONLY before a topic exists, so the
  //              counter has a denominator on screen one.
  //
  // …and the per-question clarifier screens became one „extras" screen: two
  // one-tap questions about the same thing are one question in two parts.
  const chem = withTopic(EMPTY_DRAFT, 'chemistry')
  const chemRun = stepsFor(chem).map(st => st.id)
  // ⚠️ „mode" IS THE ONE STEP ADDED BACK, and it earns its screen (2026-08-18).
  // Every cut this week removed a step most people advanced past without
  // answering; this is a single tap that changes what the NEXT screen offers
  // them — offers coming to you, or a list of experts to write to. The owner
  // chose to ask before sending rather than after: at that point they are still
  // deciding how they want to be helped; afterwards they are waiting.
  // ⚠️ FIVE SCREENS, FOR EVERY TOPIC ON THE SITE (2026-08-19). Owner: „არ
  // გვინდა ბიუჯეტი საერთოდ, 5 ეტაპამდე უნდა შემცირდეს."
  //
  // Two screens went in one pass and the reasons differ. The BUDGET question
  // asked the person who cannot know what the work costs to name a figure
  // first, and that figure then capped every offer they got — the same
  // objection that took the price off the catalogue card, one screen earlier.
  // The CLARIFIERS did not go anywhere; they lost their own page and sit on the
  // timing screen, which is the move „აირჩიე ტიპი" made a day before.
  //
  // ⚠️ THE RUN CHANGED TWICE ON 2026-08-29 AND CAME BACK TO FIVE. „mode" went
  // (see below) and „photos" arrived — a swap, not a growth: one screen that
  // asked the visitor to answer OUR routing question, for one that makes every
  // offer they receive more accurate. Owner: „მაქსიმალურად მარტივად, ორივეს
  // მხარეს" — and the photo step is the only one in the run that can be passed
  // with a single tap („გამოტოვება"), because `photos: []` is a complete
  // request.
  //
  // On „mode": Owner:
  // „ყველაფერი უნდა იყოს მარტივად… მაქსიმალურად მარტივად, ორივეს მხარეს."
  // „როგორ გირჩევნია?" was our routing question handed to the visitor one
  // screen before their phone number — Airtasker, Thumbtack and Bark never ask
  // it. See app/request/_model.ts, and the note in this file's pickMode test
  // for what happened to the list it used to gate.
  //
  // The distribution is the pin, not one example: measured across all 171
  // topics, every single run is the same length. If a step returns, this is the
  // test that says so.
  /* ⚠️ THE BUDGET SCREEN CAME BACK ON 2026-09-03 AND THE RUN IS SIX. Owner:
     „სავალდებულო გავხადოთ ბიუჯეტის რეინჯის მითითება მაინც." Everything above
     about why it went on 2026-08-19 still stands and is not being argued with —
     what changed underneath it is that the fee a provider pays for a contact is
     now sized by this band (lib/credits → contactCostTetri), and measured that
     morning NINETEEN OF TWENTY live requests carried no budget at all. The
     ladder had nothing to read.
     It is a BAND and one tap, which is the half of the old objection that can
     be answered: „500–1 000₾" is a range somebody picks, „750₾" was a figure
     they had to invent. */
  /* ⚠️ THE CLARIFIERS HAVE THEIR OWN SCREENS AGAIN (2026-09-03), reversing the
     2026-08-18 merge. Owner, on a screenshot of the stacked page: „ორად რომ
     არის ჩამოშლილი ამას ვგულისხმობ… დაყო ცალკე გვერდებად." Chemistry asks two
     — who it is for, and what level — so its run is seven. See stepsFor for
     what the merge was right about and what it cost. */
  /* ⚠️ „details" IS BACK, AS A REQUIRED SCREEN (2026-09-04) — and the line
     under this one used to assert its ABSENCE. Owner: „სავალდებულო უნდა იყოს
     რომ ტექსტი შეავსოს… ცალკე უნდა იყოს ველი, დამატე, გაზარდე."
     The 2026-08-18 measurement that removed it (8 descriptions in 19 requests,
     „58% walked through a whole screen to skip it") was an argument about an
     OPTIONAL screen and it is not being disputed. A required one is a different
     object: nobody walks past it, and what it collects is the only thing on the
     run a provider can quote against — every other answer is a tap naming a
     CATEGORY of job rather than the job. On a platform where the provider pays
     to reach the lead, the sentence is what they are buying. */
  /* ⚠️ „details" SITS SECOND-TO-LAST, NOT SECOND (moved 2026-09-04, the same
     day it was added). It first followed „what" directly — a sphere tapped and
     then a ten-row empty box — and the owner moved it: „ბოლოსკენ, ან ლოგიკურად
     სწორად როცა ჯდება." Cheap taps first, the writing once something is
     invested; before „contact", because asking somebody to write after they
     have given their number is asking them to work for a finished form. */
  assert.deepEqual(chemRun,
    ['what', 'budget', 'extra:audience', 'extra:level', 'timing', 'format', 'details', 'contact'])
  assert.ok(chemRun.includes('details'), 'the required brief screen went missing')

  // An ambiguous topic no longer earns a screen — it is answered on screen one.
  /* An ambiguous topic lists the budget screen too, before the kind that
     decides its bands is known — the provisional entry that keeps the counter's
     denominator still. See the note at the `else` in stepsFor. */
  const con = withTopic(EMPTY_DRAFT, 'contract')
  assert.deepEqual(stepsFor(con).map(st => st.id),
    ['what', 'budget', 'timing', 'format', 'details', 'contact'])
  // A clarifier screen is OPTIONAL and says so — it is the only kind of screen
  // in the run besides the photos that may be walked past.
  for (const st of stepsFor(chem)) {
    assert.equal(!!st.skippable, st.id.startsWith('extra:') || st.id === 'photos',
      `${st.id} disagrees with itself about being skippable`)
  }
  // …but an EMPTY draft still lists it, so the counter can count before the
  // first tap.
  assert.ok(stepsFor(EMPTY_DRAFT).map(st => st.id).includes('kind'),
    'the empty run lost its provisional kind step — the counter would jump')

  /* EVERY topic, not the two above.
   *
   * ⚠️ TWO LENGTHS SINCE 2026-08-29, AND THE SPLIT IS THE POINT. The photo
   * screen belongs to SERVICE — the kind whose definition is „somebody comes to
   * your address", where the work is physical and a picture answers the
   * question the offer is about. The first version of that step was pushed for
   * every run, which measured out at 132 of these 171 topics being asked to
   * photograph a contract or an English lesson.
   *
   * So the pin is no longer one number; it is that NOBODY gets a screen their
   * kind cannot use.
   *
   * ⚠️ AND FOUR EACH SINCE 2026-08-30, NOT FIVE FOR THE HOUSEHOLD HALF. The
   * trades run was carrying „ონლაინ თუ ადგილზე?" — the screen `stepsFor`'s own
   * paragraph calls „the wizard performing a choice nobody has", because there
   * is no online plumber. Two independent rules had been written as one
   * if/else, so turning the CITY question off (one city, 2026-08-20) turned the
   * FORMAT question back on for exactly the kind that must never see it.
   *
   * `withKind` had been telling the truth about the intent the whole time — it
   * sets `format: IN_PERSON` for a service and says „the run never shows the
   * format screen for this kind (see stepsFor)". It did. That is what this loop
   * now pins from both ends: no service is asked, and every service still
   * SUBMITS in-person rather than inheriting the ONLINE default. */
  for (const g of TOPIC_GROUPS) {
    for (const t of g.topics) {
      const d = withTopic(EMPTY_DRAFT, t.id)
      const run = stepsFor(d).map(st => st.id)
      const service = kindsOfTopic(t.id).includes('SERVICE')
      assert.equal(run.includes('photos'), service,
        `${t.id} ${service ? 'lost' : 'was given'} the photo screen`)
      assert.equal(run.includes('format'), !service,
        `${t.id} ${service ? 'was asked' : 'lost'} the online-or-in-person question`)
      /* ⚠️ THE LENGTH IS NO LONGER ONE NUMBER, AND THE PIN MOVED RATHER THAN
         WENT (2026-09-03). Every run was four, then five when the budget band
         came back; splitting the clarifiers onto their own screens made it
         5 + however many this topic asks. „Every run is the same length" was
         the strongest available statement while that was true, and the honest
         replacement is the FORMULA — a step that appears for some kinds and not
         others still fails here, because the only thing allowed to vary is the
         clarifier count. */
      /* ⚠️ THE CONSTANT WENT 5 → 6 ON 2026-09-04, and the sixth is „details" —
         the required brief (owner: „სავალდებულო უნდა იყოს რომ ტექსტი
         შეავსოს"). The formula is what is pinned, not the number: the only
         thing allowed to vary between runs is the clarifier count, and a step
         that appears for some kinds and not others still fails here. */
      const clarifiers = run.filter(id => id.startsWith('extra:')).length
      assert.equal(run.length, 6 + clarifiers,
        `${t.id} runs in ${run.length} screens with ${clarifiers} clarifiers`)
      assert.ok(run.includes('details'), `${t.id} can be sent without a word typed`)
      assert.ok(clarifiers <= 2, `${t.id} asks ${clarifiers} clarifiers — the run is getting long`)
      assert.ok(run.includes('budget'), `${t.id} is never asked what it can spend`)
      // ⚠️ THE SKIPPED SCREEN MUST NOT LEAVE A WRONG ANSWER BEHIND. The draft
      // defaults to ONLINE — safe only while the screen shows and confirms it.
      if (kindsOfTopic(t.id).length === 1 && service) {
        assert.equal(d.format, 'IN_PERSON',
          `${t.id} would be filed as an online job — somebody has to be in the room`)
      }
    }
  }

  /* ⚠️ THE TIMING SCREEN IS NAMED AFTER ITS OWN QUESTION AGAIN (2026-09-03).
     It read „ორიოდე დეტალი" while the clarifiers shared it — a heading that
     names none of the questions on the page, which is what a page holding three
     of them forces. With one question per screen the kind's own wording is
     right for every topic, so there is no longer a with-clarifiers branch to
     test: the two below assert the same thing about different topics. */
  assert.ok(!stepsFor(chem).find(st => st.id === 'timing')!.title.includes('დეტალი'))
  const plain = withTopic(EMPTY_DRAFT, 'contract')
  assert.ok(!stepsFor(plain).find(st => st.id === 'timing')!.title.includes('დეტალი'))
  // …and every clarifier screen is named by its own question, never by a count.
  for (const st of stepsFor(chem).filter(s2 => s2.id.startsWith('extra:'))) {
    assert.ok(st.title.length > 0 && !st.title.includes('დეტალი'),
      `${st.id} lost its own question for a generic heading`)
  }

  // Resume lands on the frontier: a draft holding only its topic resumes at the
  // first unanswered question — the budget band since 2026-09-03, which is the
  // screen that now sits directly after „what".
  /* „details" since 2026-09-04 — it is now the screen directly after „what",
     so a draft holding only its topic resumes on the brief. */
  /* Back to „budget": „details" moved to second-to-last on 2026-09-04, so the
     first unanswered screen after the topic is the money again. */
  assert.equal(resumeStepId(chem), 'budget')

  /* ⚠️ THIS PINNED THE OPPOSITE UNTIL 2026-09-04 — „an empty description is
     rejected — the essay wall is back" — because the structured taps were held
     to carry the request on their own. The owner asked for the wall: „ტექსტი
     სავალდებულო უნდა იყოს." What the taps carry is a CATEGORY of job; what a
     provider pays to reach is the job, and only the sentence says which it is.
     Checked at the ENDPOINT and not only on the screen: a screen is a courtesy
     and a schema is the contract. */
  assert.equal(ServiceRequestInput.safeParse({
    kind: 'LEARNING', topic: 'chemistry', description: '',
    budgetBand: 'x', timing: 'twice_week', format: 'ONLINE', city: 'TBILISI',
    contactName: 'ნინო მაგალიძე', phone: '555123456', email: 'nino@example.ge',
  }).success, false, 'an empty description still passes — the wizard is the only wall')

  // ⚠️ AND THE SCHEMA MUST ACCEPT „NOT ASKED" MONEY. The wizard no longer
  // collects a band, so every request that reaches the endpoint carries the
  // sentinel. A refinement that demands a real band here would refuse every
  // request on the site — and would do it at the last screen, after the person
  // typed their name and number.
  assert.equal(ServiceRequestInput.safeParse({
    kind: 'LEARNING', topic: 'chemistry', description: 'ალგებრა მჭირდება მეათე კლასში',
    budgetBand: 'x', timing: 'twice_week', format: 'ONLINE', city: 'TBILISI',
    contactName: 'ნინო მაგალიძე', phone: '555123456', email: 'nino@example.ge',
  }).success, true, 'the UNSTATED budget is refused — no request can be sent')

  // Cross-kind topic switch still clears the kind-scoped answers, and the money
  // stays at „not asked" rather than dropping to '' (which the schema refuses).
  const cross = withTopic({ ...chem, timing: 'twice_week' }, 'contract')
  assert.equal(cross.kind, '')
  assert.equal(cross.budgetBand, 'x')
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
  assert.match(route, /fromUserId:\s*r\.side\s+===\s+'CLIENT'\s+\?\s+null\s+:\s+\(viewer\.user\?\.id/,
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
  /* ⚠️ THE SHAPE, NOT THE WORD (tightened 2026-09-01). This read
   * `doesNotMatch(jobs, /'ACCEPTED'/)`, which forbade the STRING anywhere in the
   * file — and the 48-hour refund sweep has to ASK whether an offer was accepted
   * in order to find the thread it should have produced. Reading an acceptance
   * is not making one. The rule being pinned was always about the WRITE, and it
   * is now written the same way the VERIFIED assertion above it is: a status
   * landing in a `data:` payload. */
  assert.doesNotMatch(jobs, /status: 'ACCEPTED' \}[\s\S]{0,40}data:/, 'a job accepts offers')
  assert.doesNotMatch(jobs, /data: \{[^}]*status: 'ACCEPTED'/, 'a job writes an acceptance')
  /* ⚠️ THE FIELD, NOT THE WORD (tightened 2026-09-02, the same move the
   * ACCEPTED assertion above made a day earlier). This read
   * `doesNotMatch(jobs, /contactName|\bphone\b/)` — the WORD „phone" anywhere
   * in the file — and the provider SMS has to read one: a provider's OWN mobile,
   * to tell them a job came in. That is the opposite of the rule being pinned.
   *
   * The rule is that the CLIENT's contact stays the admin's to reveal. So:
   * `contactName` is banned outright (it exists on ServiceRequest and nowhere
   * else), and every `phone` this file reads must be a USER's. */
  assert.doesNotMatch(jobs, /contactName/, 'a job touches the client contact')
  /* And the client's number is never READ. `r.phone` / `request.phone` is the
   * client's; the provider's own comes off `user` and is a different person's
   * different number — banning the word „phone" banned both, which is how this
   * assertion came to forbid telling a provider that a job arrived. */
  assert.doesNotMatch(jobs, /\b(r|row|request|req)\.phone\b/, 'a job reads the client phone')
  /* Every `phone: true` must be selected off the ALLOWLIST, not off a request:
   * the nearest prisma call opened before it says whose row it is. */
  for (let i = jobs.indexOf('phone: true'); i !== -1; i = jobs.indexOf('phone: true', i + 1)) {
    const calls = [...jobs.slice(0, i).matchAll(/prisma\.([a-zA-Z]+)\./g)]
    const from = calls.length ? calls[calls.length - 1][1] : '(none)'
    assert.ok(
      from === 'requestAccess' || from === 'companyMember',
      `a job selects a phone off prisma.${from} — only the allowlist may carry one`,
    )
  }
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
  /* ⚠️ THE CONDITION IS NAMED NOW (2026-09-02): `live` is „NEW or VERIFIED",
     derived once in the loader beside every other fact about the request, and
     both `<AutoRefresh/>` and `<LiveRefresh/>` read it. It is the same rule —
     a settled request has no next event and a liveness promise on it would be
     furniture — and naming it is what stops the two controls disagreeing.
     Pinned on both halves: the derivation and the use. */
  const room = codeOf('app/request/[ref]/_room.tsx')
  assert.match(room, /live: request\.status === 'NEW' \|\| request\.status === 'VERIFIED'/,
    'the client room stopped deriving liveness from the request status')
  assert.match(room, /\{data\.live && <AutoRefresh/,
    'the client page promises liveness on settled requests too')
  assert.match(codeOf('app/work/(provider)/requests/page.tsx'), /<AutoRefresh/,
    'the provider queue lost its live refresh')

  // The budget-fit line: warning above the band, never a BLOCK — an expert
  // worth more than the band must still be able to say so.
  const form = codeOf('app/work/(provider)/requests/[id]/OfferForm.tsx')
  assert.match(form, /კლიენტის ბიუჯეტშია/, 'the in-budget confirmation is gone')
  assert.match(form, /text-warning-700/, 'above-budget lost its caution tone')
  assert.doesNotMatch(form, /disabled=\{[^}]*fit/, 'the fit line became a block')

  // The admin rail badge rides the same stats fetch as every other queue.
  assert.match(codeOf('app/api/admin/stats/route.ts'), /newRequests/,
    'the stats endpoint no longer counts unverified requests')
  assert.match(codeOf('app/admin/_nav.tsx'), /if \(id === 'requests'\) return newRequests \?\? 0/,
    'the requests tab lost its badge')
})

test('a clarifier is asked only where it means something', () => {
  /* ⚠️ THE BUG THIS PINS. Owner, 2026-08-30: „როცა ვებ დეველოპერთან კავშირი
     მინდა, რატომ უნდა მინდოდეს რომ ავირჩიო დაწყებითების კლასი." Measured on
     `webdev-l` before the fix: LEARNING asked which year of school, SERVICE
     asked which flat to come to, MEETING and PROJECT asked nothing at all.
     This walks the WHOLE vocabulary rather than that one topic, because the
     owner's next sentence was „ზოგადადი უნდა იყოს რომ ყველაფერს ერგებოდეს" —
     one topic passing is not the property we want. */
  const idsFor = (k: Parameters<typeof extrasFor>[0], t: string) => extrasFor(k, t).map(q => q.id)

  // Nobody outside a classroom is asked which year of school they are in.
  const schooling = new Set(['school', 'exams', 'higher', 'languages', 'arts', 'sport'])
  for (const g of TOPIC_GROUPS) {
    const topic = g.topics[0].id
    const asksAudience = idsFor('LEARNING', topic).includes('audience')
    assert.equal(asksAudience, schooling.has(g.id),
      `${g.id}: LEARNING ${asksAudience ? 'asks' : 'does not ask'} „ვისთვის" and should ${schooling.has(g.id) ? 'ask' : 'not ask'} it`)
    // Every subject is still asked the one question that survives the change.
    assert.ok(idsFor('LEARNING', topic).includes('level'), `${g.id}: LEARNING lost „რა დონეა"`)
  }

  // „სად: ბინაში / კერძო სახლში" is asked only of work that has an address.
  const onsite = new Set(['cleaning', 'plumbing', 'electrical', 'repairs', 'appliances', 'moving', 'outdoor', 'systems', 'property'])
  for (const g of TOPIC_GROUPS) {
    const asksPlace = idsFor('SERVICE', g.topics[0].id).includes('property')
    assert.equal(asksPlace, onsite.has(g.id),
      `${g.id}: SERVICE ${asksPlace ? 'asks' : 'does not ask'} „სად"`)
  }

  // An unknown topic — „სხვა", or a group added tomorrow — gets the SIMPLE
  // treatment, never the school frame. This is the direction of the default and
  // it is the thing that stops the frame spreading back as the catalogue grows.
  assert.deepEqual(idsFor('LEARNING', 'no-such-topic-at-all'), ['level'])
  assert.deepEqual(idsFor('SERVICE', 'no-such-topic-at-all'), [])
})

test('the clarifying answers are stripped against the question list', () => {
  // The `details` column is free-form only in SHAPE. normalizeExtras is the
  // door: off-list keys and values do not survive to the database, so a crafted
  // POST cannot store a script tag under „audience" and a renamed option cannot
  // leave an unreadable id behind.
  // ⚠️ THESE THREE PINNED THE SCHOOL FRAME (rewritten 2026-08-30). They read
  // `extrasFor('LEARNING').length >= 2` / MEETING 0 / PROJECT 0 with NO TOPIC,
  // which is exactly the shape the bug had: the kind decided and the topic was
  // ignored. Deleting them is the point of the change, not collateral.
  assert.ok(extrasFor('LEARNING', 'chemistry').length >= 2, 'a school subject lost its audience question')
  // MEETING and PROJECT ask nothing. The wizard already gives a meeting a whole
  // format step, so a clarifier beside it would be the same question twice.
  assert.equal(extrasFor('MEETING').length, 0, 'a meeting gained a duplicate of the format step')
  assert.equal(extrasFor('PROJECT').length, 0, 'a project asks nothing before it is filed')

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
  assert.equal(normalizeExtras('MEETING', 'contract', { audience: 'pupil' }), null)
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
  for (const f of ['app/work/(provider)/requests/[id]/OfferForm.tsx', 'app/api/provider/offers/route.ts']) {
    assert.match(read(f), /RequestOfferInput/, `${f} does not use the shared schema`)
  }
})

test('the ceilings admit what a person actually types', () => {
  // Pinned as VALUES rather than as source text, so a ceiling cannot be quietly
  // tightened into the certificates bug.
  const ok = {
    kind: 'MEETING',
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
  /* ⚠️ THE DESCRIPTION IS REQUIRED SINCE 2026-09-04, and these two lines
     pinned the opposite („a short one is simply a short one, the admin's call
     is the quality gate"). Owner: „ტექსტი სავალდებულო უნდა იყოს." The floor is
     twelve characters — about three Georgian words — so a real sentence passes
     and a keysmash does not. */
  assert.equal(ServiceRequestInput.safeParse({ ...ok, description: 'მჭირდება იურისტი' }).success, true)
  assert.equal(ServiceRequestInput.safeParse({ ...ok, description: '' }).success, false)
  assert.equal(ServiceRequestInput.safeParse({ ...ok, description: 'აა' }).success, false,
    'two characters pass — the floor is not doing anything')
  // A foreign number with its country code — the diaspora case lib/phone exists
  // to admit, and this form gets it for free by using THE phone rule.
  assert.equal(ServiceRequestInput.safeParse({ ...ok, phone: '+4915112345678' }).success, true)
  assert.equal(ServiceRequestInput.safeParse({ ...ok, phone: '123' }).success, false)

  // ── THE CROSS-FIELD RULES — the reason these are not DB enums ──────────
  // Three answers only mean anything beside the kind they were given for, and
  // each mismatch is refused: a chemistry topic on a legal project, a
  // per-lesson band on a project, a frequency on a consultation.
  assert.equal(ServiceRequestInput.safeParse({ ...ok, topic: 'chemistry' }).success, false,
    'a LEARNING topic was accepted on a MEETING')
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

  /* ⚠️ THE REQUIRED SENTENCE MOVED (2026-09-01, the canvas). It was `message`
   * with a 20-character floor, on the argument that a number with no sentence
   * beside it is a guess. That argument survives — it just names a different
   * field: what a client cannot compare is not „did they write something" but
   * „does 90₾ include the materials", and only a short structured line can be
   * printed on all three offer cards at once. `message` is the provider's own
   * note now and is optional on both artboards. */
  const offer = {
    requestId: 'req_1', priceGel: 1200,
    priceIncludes: 'მასალა და ტრანსპორტი ფასში შედის',
    message: 'გავაკეთებ სრულ აუდიტს ორ კვირაში.',
  }
  assert.equal(RequestOfferInput.safeParse(offer).success, true, 'a minimal real offer is rejected')
  assert.equal(RequestOfferInput.safeParse({ ...offer, message: 'ა'.repeat(4000) }).success, true)
  assert.equal(RequestOfferInput.safeParse({ ...offer, message: 'ა'.repeat(4001) }).success, false)
  // The note may be empty; what the price covers may not, and 120 is the width
  // an offer card can print without an ellipsis eating the answer.
  assert.equal(RequestOfferInput.safeParse({ ...offer, message: '' }).success, true)
  assert.equal(RequestOfferInput.safeParse({ ...offer, priceIncludes: 'ა'.repeat(120) }).success, true)
  assert.equal(RequestOfferInput.safeParse({ ...offer, priceIncludes: 'ა'.repeat(121) }).success, false)
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
  assert.match(route, /if\s+\(\(parsed\.data\.website\s+\?\?\s+''\)\s+!==\s+''\)/,
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
    kind: 'MEETING', topic: 'accounting',
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
    ...({ kind: 'MEETING', topic: 'contract',
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
  assert.match(patch, /await\s+audit\(admin\.id,\s+status\s+\?\s+`request\.\$\{status\.toLowerCase\(\)\}`\s+:\s+'request\.update'/)
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

test('verifying does not notify anybody — sending is its own action', () => {
  // ⚠️ THIS TEST USED TO PIN THE OPPOSITE ARRANGEMENT, and the new one is the
  // stronger guarantee. Sending was a side effect of the NEW → VERIFIED edge,
  // guarded by a transition check so that re-saving a note did not re-notify
  // everybody. That guard is now unnecessary: PATCH cannot notify at all.
  //
  // Fusing them meant the operator could not verify without broadcasting, could
  // not choose who heard, and could not re-send. Owner, 2026-08-18: „ხელით
  // მართვაც დამატე." Two actions, and this asserts they stayed apart.
  const patch = codeOf('app/api/admin/requests/[id]/route.ts')
  const patchBody = patch.slice(patch.indexOf('export async function PATCH'), patch.indexOf('export async function POST'))
  assert.doesNotMatch(patchBody, /mailVerifiedRequest\(/,
    'PATCH sends again — verifying must not broadcast')
  assert.match(patch, /export async function POST/,
    'the explicit send action is gone')
  // …and it must refuse to advertise a request nobody may bid on.
  assert.match(patch, /row\.status !== 'VERIFIED'[\s\S]{0,120}NOT_VERIFIED/,
    'the send action stopped requiring a verified request')
  // The bell and the mail both live in lib/requestJobs → mailVerifiedRequest,
  // so the cron's 6-hour re-mail runs the same code as the first one. Two
  // copies of „who should hear about this" is how the two end up disagreeing.
  assert.match(patch, /mailVerifiedRequest\(/, 'the route no longer routes through the shared mailer')
  assert.match(codeOf('lib/requestJobs.ts'), /notifyMany\(/, 'the shared mailer stopped ringing the bell')
  // The support address is READ, never typed — an unrouted literal drops mail
  // silently (lib/supportEmails says so at length).
  const create = read('app/api/requests/route.ts')
  assert.match(create, /import\s+\{\s+SUPPORT_EMAIL\s+\}\s+from\s+'@\/lib\/supportEmails'/)
  assert.doesNotMatch(create, /@mcodne\.ge|@gmail\.com/, 'an email address was typed as a literal')
})

/* ═══════════ 11. it does not touch the booking product ═════════════════ */

test('the subsystem shares nothing with bookings, packages or B2B', () => {
  // The one architectural promise, and the one that decays quietly: a request
  // that grew a `startAt` is the point at which two products become one
  // unmaintainable one.
  // Case-SENSITIVE, and matching the two spellings a Prisma model actually has
  // in code: the client accessor (prisma.booking) and the type (Booking).
  // Deliberately NOT /i — 'MEETING' is one of this subsystem's own KIND
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
    'app/request/[ref]/page.tsx',
    'lib/requestTopics.ts',
    'app/work/(provider)/requests/page.tsx',
    'app/work/(provider)/offers/page.tsx',
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
  // The /me HOME does not list service requests and must not be pointed at as
  // if it did — /me/requests (D7) is the page that does, and only for a signed-
  // in owner; a client who has just sent a request usually has no session yet.
  assert.ok(!/["'`]\/me(["'`?#])/.test(thanks),
    'the thanks screen links to /me, which does not show requests')
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
  assert.match(route, /website\s+\?\?\s+''\)\s+!==\s+''\)\s+\{[\s\S]{0,400}?ok:\s+true/,
    'the honeypot branch stopped answering ok:true — it now tells bots they were caught')
})

test('a bar that hosts the account menu lifts itself while it is open', () => {
  /* ⚠️ THE MENU WAS PAINTED UNDER A PROGRESS RAIL (2026-09-03). Every top bar
     on the site is `sticky` WITH a z-index, which opens a stacking context —
     so the dropdown inside it asks for `z-50` and is worth whatever the header
     is worth. Any SECOND sticky element at the same layer, later in the DOM,
     then covers the open menu. The intake's progress rail is `z-chrome`, the
     bar was `z-chrome`, and the account menu came out cut in half. Owner:
     „ასეთი პრობლემები არ უნდა ქონდეს საიტს."

     `PublicTopBar` already knew the fix — it lifts to `z-drawer` while the
     MOBILE DRAWER is open, and its own comment explains why a child cannot
     escape. What it did not do was the same thing for the menu.

     Pinned for all three bars rather than the one screen that showed it: the
     collision needs only a sticky sub-header, and /work and /me have pages
     that carry one. */
  for (const f of [
    'components/PublicTopBar.tsx',
    'components/work/WorkspaceTopBar.tsx',
    'components/me/ClientTopBar.tsx',
  ]) {
    const src = codeOf(f)
    assert.match(src, /<UserMenu[^>]*onOpenChange=/,
      `${f} hosts the account menu and is never told when it opens`)
    assert.match(src, /menuOpen[^\n]*\?[^\n]*'z-drawer'/,
      `${f} does not lift itself while the account menu is open — the menu paints under any sticky sub-header`)
  }
})

test('every screen the run can produce is a screen the wizard draws', () => {
  /* ⚠️ THIS TEST EXISTS BECAUSE THE FUNNEL SHIPPED BROKEN (2026-09-03).
     The budget screen and the per-clarifier screens were added to `stepsFor`,
     to the `options` list and to `pickOption` — and NOT to the render. So the
     wizard drew a heading with nothing under it and no way forward: a dead end
     on the one page this product depends on, live, found by the owner („რა
     არის ესა?"). Types cannot see it: a step id is a string and a missing JSX
     branch is not an error.

     The same commit had a second instance. The timing screen's render was
     guarded on `extras.length === 0`, which was true while the clarifiers
     shared that page; once they moved out, `extras` was still computed for the
     timing step and every topic WITH a clarifier drew no options either.

     A step needs THREE things — a place in the run, a way to answer, and
     something that draws it — and the run only ever checked the first two.
     This is the third. */
  const { withTopic, stepsFor, EMPTY_DRAFT } =
    require('../app/request/_model') as typeof import('../app/request/_model')
  const wizard = codeOf('app/request/RequestWizard.tsx')

  const ids = new Set<string>()
  for (const g of TOPIC_GROUPS) for (const t of g.topics) {
    for (const st of stepsFor(withTopic(EMPTY_DRAFT, t.id))) ids.add(st.id)
  }
  for (const st of stepsFor(EMPTY_DRAFT)) ids.add(st.id)

  for (const id of ids) {
    // A clarifier screen is drawn by `step.extraId`, not by its own id — there
    // is one branch for all of them, which is the point of the id scheme.
    /* ⚠️ THE `{` MATTERS. `step.id === 'budget'` also appears in `pickOption`,
       so a bare `includes` was satisfied by the handler and passed on the very
       bug this test was written for — checked by deleting the render and
       watching it stay green. A RENDER branch opens with `{step.id === …` and
       nothing else in this file does. */
    const drawn = id.startsWith('extra:')
      ? wizard.includes('{step.extraId && (')
      : wizard.includes(`{step.id === '${id}'`)
    assert.ok(drawn, `the run produces a „${id}" screen and nothing in the wizard draws it`)
  }
  // …and the guard that silently emptied the timing screen must not come back.
  assert.doesNotMatch(wizard, /step\.id === 'timing' && extras\.length/,
    'the timing screen is gated on a clarifier count again — it drew nothing for half the topics')

  /* ⚠️ AND THE THIRD PART: A SCREEN MUST ALSO BE ABLE TO END (2026-09-04).
     The note above says a step needs three things — a place in the run, a way
     to answer, and something that draws it. That was one short. The clarifiers
     moved to their own screens on 2026-09-03, the RENDER was corrected in that
     commit, and `pickOption` was not: it still asked `extras.length > 0` on the
     timing step and took the „record, do not advance" branch, which had been
     written for a stacked page whose „გავაგრძელოთ" button no longer existed.
     So on every topic that HAS a clarifier the last question of the details
     stage recorded the tap and went nowhere. Owner, with a screenshot of step
     4 of 6: „ბაგი ვიპოვე, ამის მერე არ გადადის."
     Produce · draw · ADVANCE. Anything that records without advancing needs a
     visible way out on the same screen, and only two screens have one. */
  /* The PICK handler alone. Slicing it off means a render branch — which also
     spells `step.id === '…'` — can never stand in for a handler that moves. */
  const handler = wizard.slice(wizard.indexOf('const pickOption ='))
  const ADVANCE_EXEMPT = new Set([
    'budget',   // has „გავაგრძელოთ" — a typed amount must not advance mid-number
    'photos',   // has „გავაგრძელოთ" / „გამოტოვება"
    'contact',  // the last screen; its action is „გაგზავნა"
    'what',     // a search field, not an option list
    'notes',    // free text
  ])
  for (const id of ids) {
    if (id.startsWith('extra:') || ADVANCE_EXEMPT.has(id)) continue
    /* Two spellings both advance and both are correct: `pickAndGo` patches the
       draft and moves, `advance(d, …)` is used where the handler has already
       built the draft it wants to hand on (the „kind" screen fires an analytics
       event between the two). What is pinned is that SOMETHING moves — not
       which helper does it.
       Read as a window of text after the branch opens rather than as one
       regex: the handler bodies contain object literals, so a `[^}]*` span
       stops at the first brace and reports a working screen as broken. */
    const at = handler.indexOf(`step.id === '${id}'`)
    assert.ok(at >= 0, `pickOption has no branch for the „${id}" screen`)
    /* ⚠️ THE WINDOW ENDS AT THE NEXT BRANCH, and that is the whole assertion.
       A fixed 420-character look-ahead was the first version and it passed on
       the very bug this pins: the branches are one-liners, so the window ran
       straight into `step.id === 'city'` next door and found ITS `pickAndGo`.
       Proved by putting the bug back and watching the test stay green — the
       same way the „draws it" half above was proved. */
    const nextBranch = handler.indexOf("step.id === '", at + 1)
    const body = handler.slice(at, nextBranch > at ? nextBranch : at + 420)
    assert.ok(/pickAndGo|advance\(/.test(body),
      `picking on the „${id}" screen never advances — the run can reach it and never leave it`)
  }
})

test('the money question is a REQUIRED BAND, never a number and never a refusal', () => {
  /* ⚠️ THIS TEST HAS NOW PINNED BOTH ANSWERS, AND THE THIRD VERSION IS THE
     INTERESTING ONE. It first guarded a warning under a budget ladder; on
     2026-08-19 the owner deleted the screen („არ გვინდა ბიუჯეტი საერთოდ") and
     it was rewritten to pin the ABSENCE, warning that „a money question is the
     easiest thing in the world to add back just optionally". On 2026-09-03 the
     owner asked for it back — „სავალდებულო გავხადოთ ბიუჯეტის რეინჯის მითითება
     მაინც" — and the old note's fear is exactly what this version rules out: it
     did NOT come back optionally, and it did not come back as a number.

     What forced it is written at the step in _model: the contact fee is priced
     off this band now, and 19 of 20 live requests carried no budget for it to
     read. */
  const w = codeOf('app/request/RequestWizard.tsx')
  const m = codeOf('app/request/_model.ts')
  assert.match(m, /id: 'budget'/, 'stepsFor stopped listing the budget screen')
  assert.match(w, /step\.id === 'budget'/, 'the wizard stopped rendering the budget screen')
  assert.match(w, /BUDGET_BANDS\[kind\]/, 'the budget screen stopped offering this kind‘s own bands')

  /* ⚠️ AND IT SAYS WHAT THE NUMBER MEASURES (2026-09-03). „20–40₾" is per
     LESSON on a learning request and the WHOLE JOB on a project — the same
     five labels meaning four different things. The provider's job card has
     always printed the unit (`budgetLabel` ends „…ერთ გამოძახებაზე"); the
     person choosing the band was the only one who was not told. Owner, looking
     at the bare ladder: „ესე ვერ მიხვდება." */
  assert.match(w, /step\.id === 'budget' &&[\s\S]{0,200}?KIND\[kind\]\.unitLabel/,
    'the budget screen stopped saying whether the band is per lesson, per visit or for the whole job')
  // …and the unit is the ONE table, never retyped: four kinds, four words.
  for (const k of REQUEST_KINDS) {
    assert.ok(KIND[k].unitLabel.trim().length > 0, `${k} has no unit for its budget bands`)
  }

  // ⚠️ REQUIRED, WHICH HERE MEANS „NOT SKIPPABLE". The photo screen is the only
  // one in the run that carries `skippable`; a budget screen that grew one
  // would be the optional question the previous version of this test warned
  // about, wearing a required screen's clothes.
  const { withTopic, stepsFor, EMPTY_DRAFT } =
    require('../app/request/_model') as typeof import('../app/request/_model')
  const budgetStep = stepsFor(withTopic(EMPTY_DRAFT, 'chemistry')).find(s => s.id === 'budget')
  assert.ok(budgetStep, 'the budget screen is not in a real run')
  assert.ok(!budgetStep!.skippable, 'the budget screen became skippable — that is the optional question again')

  // ⚠️ AND IT STILL DOES NOT REFUSE ANYBODY. `budgetIsBelowFloor` is called by
  // no route and this is the assertion that keeps it that way: the question is
  // back to PRICE a lead, not to turn a cheap job away at the door. The rule
  // stays intact and dormant, for the day unservable requests are the problem.
  assert.doesNotMatch(codeOf('app/api/requests/route.ts'), /budgetIsBelowFloor\(/,
    'the intake refuses a low band again — the question came back as a gate')
  assert.equal(budgetIsBelowFloor('LEARNING', 'l0'), true)
  assert.equal(budgetIsBelowFloor('LEARNING', 'l1'), false)
})

test('the record folds — the live question does not sink', () => {
  // Measured before this change, at 1440×900: the live question sat at y=302
  // with one answer behind it and y=769 with six, because every answered pair
  // added 93px of bubbles above it. By the sixth there were 131px left under
  // the question — less than the option rows need — so the wizard got HARDER
  // to use the further you got.
  //
  // Products that keep a real transcript (Lemonade, Intercom) pin the composer
  // to a fixed pane and let old messages scroll away behind it; products with a
  // document layout (Typeform, Bark, Thumbtack) show one question and no
  // transcript. This was the second layout carrying the first one's content.
  // ⚠️ THIS TEST PINNED A HALFWAY HOUSE AND NOW PINS THE END STATE. The first
  // fix folded the OLD answers into chips but kept the newest exchange as a
  // pair of bubbles, „so the seam into the live question still reads as a
  // conversation". That seam was the remaining defect: it put a grey bubble and
  // a filled brand-600 bubble directly above the question, and since the
  // question and the option labels are both `text-body`, the loudest element on
  // the screen was the answer the person had already given. All chips now.
  const t = codeOf('app/request/_transcript.tsx')

  // No bubbles left at all — neither ours nor theirs.
  assert.doesNotMatch(t, /bg-brand-600/,
    'the filled answer bubble is back — it outshouts the question above the options')
  assert.doesNotMatch(t, /bg-ink-75/,
    'the grey question bubble is back inside the record')
  // Every answer stays editable. A record that cost the edit affordance would
  // be a summary, and a summary is what this replaced.
  assert.match(t, /aria-label=\{`შეცვლა: \$\{label\}`\}/,
    'an answer is no longer a control — the record became read-only')
  // The instruction line is gone: a row of chips does not need to be explained,
  // and a sentence printed on every screen of a run is furniture.
  assert.doesNotMatch(t, /პასუხზე დააჭირე/,
    'the hint line is back — it was an instruction on every screen of the run')

  // …and the question it must not sink under is now the page's loudest element,
  // at ONE size across the whole run. It rendered at `text-body` on steps 2..n
  // — exactly the size of the option labels below it — and `text-h1` on step 1,
  // so the run changed voice after the first tap.
  const w = codeOf('app/request/RequestWizard.tsx')
  assert.match(w, /<h1 className="font-display text-h1 font-bold/,
    'the live question is no longer an h1 at text-h1 — a question set at its answers’ size is a label')
  assert.doesNotMatch(w, /<Ask/,
    'the question went back into a bubble component')
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
    kind: 'MEETING', topic: 'contract',
    budgetBand: 'c2', timing: 'this_week',
    format: 'IN_PERSON', city: 'BATUMI',
  }
  // No money bubble: the question is not asked, so there is no exchange to
  // restate. `budgetLabel` is still the one owner of that vocabulary for the
  // rows already in the database — see the label test below.
  assert.equal(answerLabel('budget', d), null, 'a budget bubble appeared for a question nobody was asked')
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
  assert.equal(answerLabel('timing', EMPTY_DRAFT), null, 'an unanswered screen produced a bubble')
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

/* ═══════════ 12. three ways to name a price ════════════════════════════ */

test('a price says which of three things it is', () => {
  const { offerPriceLabel, OFFER_PRICE_KINDS, ALL_OFFER_PRICE_KINDS, OFFER_PRICE_FIELD, RequestOfferInput } =
    require('../lib/requests') as typeof import('../lib/requests')

  // ⚠️ ONE INTEGER WAS MAKING HONEST TRADESPEOPLE LIE. Somebody driving out to
  // look at a leak often cannot name a number, and a form demanding one gets an
  // invented figure or no bid at all.
  assert.equal(offerPriceLabel(80, 'FIXED'), '80₾')
  assert.equal(offerPriceLabel(80, 'FROM'), '80₾-დან')
  assert.match(offerPriceLabel(20, 'ON_SITE'), /გამოძახება 20₾/)
  // A free call-out is a selling point and must say so — „0₾" reads as an
  // unfilled field.
  assert.match(offerPriceLabel(0, 'ON_SITE'), /უფასოდ/)
  // ⚠️ HOURLY, ADDED 2026-09-01 (the owner's design canvas — both artboards draw
  // it as the third chip). The unit rides ON the number rather than sitting in a
  // chip beside it, because the client's offer list sets an hourly rate directly
  // under a fixed total and „90₾" twice with the difference two elements away is
  // the misquote this whole column exists to prevent.
  assert.equal(offerPriceLabel(90, 'HOURLY'), '90₾/სთ')
  // An unknown kind falls back to the plain number rather than throwing: a row
  // written before this column existed must still render.
  assert.equal(offerPriceLabel(80, 'WHATEVER'), '80₾')

  // ⚠️ ZERO IS LEGAL ONLY ON ON_SITE. „0₾ ფიქსირებული" is somebody who did not
  // fill the field in; the database CHECK carries the same rule, so neither
  // layer is load-bearing alone.
  /* ⚠️ `priceIncludes` IS THE REQUIRED SENTENCE NOW, NOT `message` (2026-09-01,
   * the canvas: „რას მოიცავს ფასი", printed under the price on every offer card
   * in the client's room). `message` kept its ceiling and lost its floor — the
   * canvas placeholders it „არასავალდებულო" on both artboards. */
  const base = { requestId: 'r1', priceIncludes: 'მასალა ფასში შედის', daysEstimate: null }
  assert.equal(RequestOfferInput.safeParse({ ...base, priceGel: 100 }).success, true,
    'an offer without a message was refused — the note is optional now')
  assert.equal(RequestOfferInput.safeParse({ requestId: 'r1', priceGel: 100 }).success, false,
    'an offer with no „what the price covers" was accepted')
  assert.equal(RequestOfferInput.safeParse({ ...base, priceGel: 100, priceIncludes: 'კი' }).success, false,
    'a two-letter answer passed for what the price covers')
  assert.equal(RequestOfferInput.safeParse({ ...base, priceGel: 0, priceKind: 'ON_SITE' }).success, true)
  assert.equal(RequestOfferInput.safeParse({ ...base, priceGel: 0, priceKind: 'FIXED' }).success, false,
    'a zero fixed price was accepted')
  assert.equal(RequestOfferInput.safeParse({ ...base, priceGel: 100, priceKind: 'NOPE' }).success, false)
  // Omitted → FIXED, so every offer written before this column existed still
  // parses and still means what it meant.
  const d = RequestOfferInput.safeParse({ ...base, priceGel: 100 })
  assert.equal(d.success && d.data.priceKind, 'FIXED')

  /* ⚠️ TWO LISTS SINCE 2026-09-01, THE SAME SPLIT `ALL_FORMATS` / `FORMATS`
   * MAKES — and the pin that matters is the FIRST one. The vocabulary may never
   * shrink: ON_SITE is no longer offered by the form but is stored on live rows,
   * and the day it leaves this array five surfaces start printing „ON_SITE" as a
   * raw latin id. The form's own list is free to change with the design. */
  assert.equal(OFFER_PRICE_KINDS.length, 3, 'the form stopped offering exactly three kinds')
  for (const k of ['FIXED', 'FROM', 'ON_SITE', 'HOURLY']) {
    assert.ok((ALL_OFFER_PRICE_KINDS as readonly string[]).includes(k),
      `the vocabulary forgot „${k}" — every row storing it now renders a raw id`)
  }
  // Every kind, offered or not, can be parsed and can be labelled. A legacy row
  // that cannot be re-saved is a row the admin panel cannot touch.
  for (const k of ALL_OFFER_PRICE_KINDS) {
    assert.equal(RequestOfferInput.safeParse({ ...base, priceGel: 100, priceKind: k }).success, true, k)
    assert.ok(OFFER_PRICE_FIELD[k].label.length > 0, `„${k}" has no name for its amount box`)
  }
})

test('the database allows exactly the three zeroes it should', () => {
  // The CHECK had to change: INVITED rows carry 0 because a conversation has no
  // price, and that broke every „მიმოწერა" tap the day it shipped. Stated
  // explicitly rather than relaxed to `>= 0` — a plain offer with no price is
  // still a mistake.
  const boot = read('lib/dbBoot.ts')
  assert.match(boot, /RequestOffer_price_positive[\s\S]{0,400}"status" = 'INVITED'/,
    'the INVITED zero is refused again — the invite button would 500')
  assert.match(boot, /RequestOffer_price_positive[\s\S]{0,400}"priceKind" = 'ON_SITE'/,
    'a free call-out is refused')
  assert.match(boot, /DROP CONSTRAINT IF EXISTS "RequestOffer_price_positive"/,
    'the old constraint is no longer replaced — CREATE TABLE IF NOT EXISTS cannot repair a live table')
})

test('the budget is a band, and the ladder is the only way to answer it', () => {
  const {
    serviceRequestRow, ServiceRequestInput, budgetIsBelowFloor,
  } = require('../lib/requests') as typeof import('../lib/requests')

  // ⚠️ THE TYPED AMOUNT LIVED HERE FOR ONE DAY (2026-08-18 → 2026-08-19). The
  // field, `budgetAmount`, `amountIsBelowFloor` and `budgetFloorFor` all went
  // together — see app/request/RequestWizard's budget step for the reasons.
  // What this test now holds is that they went TOGETHER: a schema that still
  // accepted the key while the screen no longer sent it would be a silent
  // second way to write a request.
  const base = {
    kind: 'SERVICE' as const, topic: 'clean-flat', description: 'ბინის დალაგება, ორი ოთახი',
    timing: 'tomorrow', format: 'IN_PERSON' as const, city: 'TBILISI' as const,
    details: {}, contactName: 'ნინო', phone: '599112233', email: 'n@example.ge',
  }

  // A band is the answer, and the row's numbers come from the ladder.
  const banded = ServiceRequestInput.safeParse({ ...base, budgetBand: 's2' })
  assert.equal(banded.success, true, banded.success ? '' : JSON.stringify(banded.error.issues))
  if (banded.success) {
    const row = serviceRequestRow(banded.data)
    assert.equal(row.budgetMin, 60)
    assert.ok(row.budgetMax !== null && row.budgetMax >= row.budgetMin)
  }

  // No band = no budget, whatever else the body carries. A crafted POST holding
  // the retired key is stripped by zod and then refused here — it cannot write
  // a range the ladder does not have.
  assert.equal(ServiceRequestInput.safeParse({ ...base, budgetBand: '' }).success, false,
    'a request with no budget band was accepted')
  const crafted = ServiceRequestInput.safeParse({ ...base, budgetBand: '', budgetAmount: 45 })
  assert.equal(crafted.success, false, 'the retired budgetAmount still answers the budget question')
  const smuggled = ServiceRequestInput.safeParse({ ...base, budgetBand: 's2', budgetAmount: 45 })
  assert.equal(smuggled.success, true)
  if (smuggled.success) {
    assert.equal((smuggled.data as Record<string, unknown>).budgetAmount, undefined,
      'budgetAmount survived the parse')
    assert.equal(serviceRequestRow(smuggled.data).budgetMin, 60, 'a crafted amount moved the row')
  }

  // The floor is a property of a band id again — one rule, one control.
  assert.equal(budgetIsBelowFloor('SERVICE', 's0'), true)
  assert.equal(budgetIsBelowFloor('SERVICE', 's2'), false)

  // …and the screen it belonged to draws no number field any more.
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const dir = path.join(__dirname, '..', 'app', 'request')
  const src = fs.readdirSync(dir)
    .filter((f: string) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f: string) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
  // The two shapes the field had: the control, and the draft key it patched.
  // (The word „budgetAmount" itself still appears once, in _model's revive
  // step, which DELETES it off a draft written before the removal — that is the
  // migration, not the field, so the assertion is on the patch form.)
  /* ⚠️ THE NUMBER FIELD IS BACK AND THE RULE IS NOT (2026-09-03). Owner:
     „ჩასაწერი ველი მინდა." This assertion used to read
         assert.ok(!/type="number"/.test(src), 'the intake grew a number input again')
     and it was pinning two things at once — that no amount reaches the WIRE,
     and that no box on the SCREEN takes one. Only the first was ever the rule.

     The screen now has both: the ladder, and a box for somebody who already
     knows their figure. What the box does is RESOLVE the number to the band it
     falls into and store that band — so the wire format is unchanged and every
     assertion above still holds, which is why they are untouched. The thing
     that must never come back is a second way to WRITE a budget, and that is
     what the second line still pins. */
  assert.ok(!/budgetAmount:/.test(src), 'something writes a typed budget onto the draft again')
  const wizard = codeOf('app/request/RequestWizard.tsx')
  assert.match(wizard, /id="req-budget-amount"/, 'the typed-amount box is gone from the budget screen')
  // …and it advances by BAND. `pickAndGo({ budgetBand: … })` is the only exit;
  // anything patching an amount onto the draft would trip the line above.
  assert.match(wizard, /amountBand[\s\S]{0,200}?budgetBand: amountBand\.id/,
    'the typed amount stopped resolving to a band before it advances')
})

test('the client is told their request exists, at the moment they send it', () => {
  // ⚠️ THE HOLE THIS CLOSES. Submitting mailed exactly ONE address — the
  // operator's inbox. The client's code and link lived on the thanks SCREEN and
  // nowhere else, so closing the tab before the first offer arrived left them
  // with no route back to their own request. Owner, 2026-08-18: „ვთქვათ
  // ჩამეკეცა — მერე როდის და როგორ უნდა ვნახო?"
  //
  // The address was already required (2026-08-17, „every client notification is
  // an email and there is no SMS"), which makes the omission worse, not better:
  // we insisted on it and then did not use it for the first notification.
  const route = read('app/api/requests/route.ts')
  assert.match(route, /requestReceivedClientEmail/,
    'the client no longer gets a receipt — closing the tab loses the request')

  // ⚠️ SENT ON A REJECTED REQUEST TOO, and this is deliberate. Being told „we
  // cannot help at this budget" and being told nothing are different things,
  // and the thread on their page is open precisely so a refused person can ask
  // „და 300₾-ზე?" — a thread they cannot find is not open.
  const receipt = route.indexOf('requestReceivedClientEmail')
  const rejectedGate = route.indexOf('if (!rejected) {')
  assert.ok(receipt > 0 && rejectedGate > 0 && receipt < rejectedGate,
    'the client receipt moved inside the !rejected branch — a refused person would hear nothing')

  // It must carry the way back, not just the news.
  const tpl = read('lib/emailTemplates.ts')
  assert.match(tpl, /requestReceivedClientEmail[\s\S]{0,900}\/request\/\$\{o\.publicRef\}/,
    'the receipt stopped linking to the request page')
})

test('„მე ავირჩევ" is a preference about a button, not about who hears you', () => {
  const { PICK_MODES, PICK_MODE_OPTION, ServiceRequestInput, serviceRequestRow } =
    require('../lib/requests') as typeof import('../lib/requests')

  assert.deepEqual([...PICK_MODES], ['OFFERS', 'SELF'])
  for (const m of PICK_MODES) {
    assert.ok(PICK_MODE_OPTION[m].label, `${m} has no label`)
    assert.ok(PICK_MODE_OPTION[m].hint, `${m} has no hint — the choice would be unexplained`)
  }

  // Omitted → OFFERS, so a request written before the question existed still
  // parses and still means what it meant.
  const base = {
    kind: 'SERVICE' as const, topic: 'clean-flat', description: 'ბინის დალაგება, ორი ოთახი',
    budgetBand: 's2', timing: 'tomorrow', format: 'IN_PERSON' as const,
    city: 'TBILISI' as const, details: {}, contactName: 'ნინო',
    phone: '599112233', email: 'n@example.ge',
  }
  const d = ServiceRequestInput.safeParse(base)
  assert.equal(d.success && d.data.pickMode, 'OFFERS')
  if (d.success) assert.equal(serviceRequestRow(d.data).pickMode, 'OFFERS')

  const self = ServiceRequestInput.safeParse({ ...base, pickMode: 'SELF' })
  assert.equal(self.success && serviceRequestRow(self.data).pickMode, 'SELF')
  assert.equal(ServiceRequestInput.safeParse({ ...base, pickMode: 'NOPE' }).success, false)

  /* ⚠️ THE QUESTION IS GONE, SO THE GATE IS TOO (2026-08-29). Owner:
   * „ყველაფერი უნდა იყოს მარტივად… მაქსიმალურად მარტივად, ორივეს მხარეს."
   *
   * The 2026-08-18 rule („მხოლოდ ამ შემთხვევაში უნდა ჰქონდეს ღილაკი") existed
   * to stop the list overriding a STATED preference. The wizard no longer asks
   * for one, so there is nothing to override — and what is left is a person
   * waiting with nothing to do beside a list of people who could help.
   *
   * ⚠️ WHAT WAS ACTUALLY LOAD-BEARING SURVIVES, and it is asserted below and
   * in the paragraph after: the mode never decided who is TOLD about the
   * request, and `!hasOffers` still hides the list the moment a real offer
   * arrives. Those two are the rule; the gate was its 2026-08-18 shape. */
  /* ⚠️ THE PANEL THAT HELD THE EXPERT LIST IS GONE (2026-09-01) — see
     „the two screens describe one journey". The list was gated on
     `!hasOffers`, so it disappeared the moment a real offer arrived; with the
     panel deleted nothing renders it at all, which satisfies that rule the
     blunt way. What was NEVER about the panel, and is the actual subject of
     this test, is asserted below: the mode a client picked must not decide who
     is TOLD about their request. */
  // The wizard must not ask it: one screen fewer is the whole change.
  assert.doesNotMatch(read('app/request/_model.ts'), /id: 'mode'/,
    'the „როგორ გირჩევნია?" step is back in the run')
  const create = read('app/api/requests/route.ts')
  assert.doesNotMatch(create, /pickMode[\s\S]{0,120}mailVerifiedRequest/,
    'routing became conditional on pickMode — a button preference must not silence a request')
})

test('one city means the question is not asked, and the vocabulary still reads', () => {
  // ⚠️ TWO LISTS, AND THE SPLIT IS THE POINT (2026-08-20). Owner: „მხოლოდ
  // თბილისში იყოს ჯერ ჯობია." `CITIES` is what the site OFFERS; `ALL_CITIES`
  // is every id the database has ever stored and may never shrink.
  //
  // The failure this guards is silent in both directions: narrowing the
  // vocabulary makes an old row print „BATUMI" as a raw latin id, and NOT
  // narrowing the offered list keeps a picker that collects requests into
  // cities where nobody is listed — which the client only discovers after
  // typing their name and phone.
  assert.ok(ALL_CITIES.length >= CITIES.length, 'the vocabulary shrank below what is offered')
  assert.ok(ALL_CITIES.some(c => c.id === 'BATUMI'), 'the vocabulary forgot a stored id')
  assert.equal(cityLabel('BATUMI'), 'ბათუმი', 'a stored city reads as a raw id')
  assert.equal(ONE_CITY, CITIES.length === 1)

  // While there is one city, no run may ask for it.
  const { withTopic, stepsFor, EMPTY_DRAFT } =
    require('../app/request/_model') as typeof import('../app/request/_model')
  if (ONE_CITY) {
    for (const g of TOPIC_GROUPS) {
      for (const t of g.topics) {
        const ids = stepsFor(withTopic(EMPTY_DRAFT, t.id)).map(s => s.id)
        assert.ok(!ids.includes('city'), `${t.id} still asks a question with one answer`)
      }
    }
    // …and the draft still carries the value the screen would have collected,
    // so the row is written exactly as before.
    assert.equal(EMPTY_DRAFT.city, 'TBILISI')
    assert.equal(ServiceRequestInput.safeParse({
      kind: 'SERVICE', topic: 'clean-flat', description: 'ბინის დალაგება',
      budgetBand: 'x', timing: 'flexible', format: 'IN_PERSON', city: 'TBILISI',
      contactName: 'ნინო მაგალიძე', phone: '555123456', email: 'nino@example.ge',
    }).success, true, 'a service request stopped parsing without the city screen')
  }
})

test('two formats are offered, and the retired third still reads', () => {
  /* ⚠️ THE SAME SPLIT AS THE CITIES, one question over (2026-08-31). Owner,
   * after tapping „ადგილზე" and getting nowhere: „სულერთია წაშალე. იყოს
   * ადგილზე და ონლაინ."
   *
   * Two silent failures, in opposite directions — exactly the pair the city
   * test above guards:
   *   · narrow the VOCABULARY and every row written before today prints
   *     „EITHER" as a raw latin id on six surfaces (the admin table, the
   *     provider's job page, the client's request page, the mail);
   *   · narrow the WIRE and a draft revived from sessionStorage across the
   *     deploy meets „INVALID" on the last screen for an answer it did give. */
  const { ALL_FORMATS, FORMATS, formatLabel } =
    require('../lib/requestTopics') as typeof import('../lib/requestTopics')

  assert.deepEqual(FORMATS.map(f => f.id), ['ONLINE', 'IN_PERSON'],
    'the format screen offers something other than the two the owner asked for')
  assert.ok(!FORMATS.some(f => f.id === 'EITHER'), '„სულერთია" is back on the screen')
  assert.ok(ALL_FORMATS.some(f => f.id === 'EITHER'), 'the vocabulary forgot a stored id')
  assert.equal(formatLabel('EITHER'), 'სულერთია', 'a stored format reads as a raw id')

  // A row written before the change still parses — the wire is the vocabulary.
  // The fixture the city test above uses, varied only in the format.
  const base = {
    kind: 'SERVICE', topic: 'clean-flat', description: 'ბინის დალაგება',
    budgetBand: 'x', timing: 'flexible', city: 'TBILISI' as const,
    contactName: 'ნინო მაგალიძე', phone: '555123456', email: 'nino@example.ge',
  }
  assert.equal(ServiceRequestInput.safeParse({ ...base, format: 'EITHER' }).success, true,
    'a draft revived with the retired format is refused at submit')
  for (const f of FORMATS) {
    assert.equal(ServiceRequestInput.safeParse({ ...base, format: f.id }).success, true,
      `${f.id} is offered on screen and refused on the wire`)
  }

  /* ⚠️ AND „ადგილზე" MUST ADVANCE WHILE THERE IS ONE CITY. It held the screen
   * waiting for a city list that `!ONE_CITY` stops drawing, so the run had no
   * way forward at all — the bug that started this change. Source-level because
   * the branch lives inside a client component and there is no renderer here;
   * the assertion is on the GUARD, which is the thing that was missing. */
  const w = codeOf('app/request/RequestWizard.tsx')
  assert.match(w, /if \(id === 'IN_PERSON' && !ONE_CITY\) \{ patch\(/,
    'the in-person branch holds the screen again without checking there is a city list to show')
  assert.doesNotMatch(w, /id === 'ONLINE' \|\| id === 'EITHER'/,
    'the advance is listed by id again — „ადგილზე" falls through it and strands the run')
})

test('a request may carry photos, and they never ride in a list', () => {
  /* ⚠️ WHY THE STEP EXISTS (2026-08-29). Owner: „ყველაფერი უნდა იყოს
   * მარტივად… მაქსიმალურად მარტივად, ორივეს მხარეს." A photo of the leaking
   * tap is the cheapest thing a client can give and the most useful thing a
   * provider can get: it is what lets a first offer name a real price instead
   * of opening a conversation to find one out. Airtasker makes it its own
   * screen and this is the same move. */
  // The same shape the fixture above uses — an email is required (a client
  // who cannot be told an offer arrived is not a request this site accepts).
  const base = {
    kind: 'SERVICE', topic: 'plumb-leak',
    description: 'ონკანი ჟონავს სამზარეულოში.',
    budgetBand: 's1', timing: 'today', format: 'IN_PERSON', city: 'TBILISI',
    contactName: 'ნინო მაგალიძე', phone: '555123456', email: 'nino@example.ge',
  }

  // ⚠️ OPTIONAL, AND THAT IS THE LOAD-BEARING HALF. The person with water on
  // the floor has nothing to upload and their request is exactly the one that
  // must still arrive — an empty array and an absent key both mean „none".
  const none = ServiceRequestInput.safeParse(base)
  assert.equal(none.success, true, 'a request without photos was refused')
  if (none.success) assert.deepEqual(serviceRequestRow(none.data).photos, [])

  const img = 'data:image/webp;base64,AAAA'
  const one = ServiceRequestInput.safeParse({ ...base, photos: [img] })
  assert.equal(one.success && serviceRequestRow(one.data).photos.length, 1)

  // The ceiling, and the refusal of anything that is not an image: the column
  // is rendered as an <img>, so a non-image is either a mistake or a crafted
  // body. Same rule the provider intake uses (lib/providerApplication).
  assert.equal(
    ServiceRequestInput.safeParse({ ...base, photos: Array(MAX_REQUEST_PHOTOS + 1).fill(img) }).success,
    false, 'the photo ceiling stopped being enforced')
  assert.equal(
    ServiceRequestInput.safeParse({ ...base, photos: ['https://example.com/x.png'] }).success,
    false, 'a non-data URI was accepted into the photo column')

  /* ⚠️ AND THEY MUST NEVER RIDE IN A LIST. These are base64 blobs on a table
   * the queue, the offers list and the admin panel all read; one careless
   * `photos: true` in a list select would put megabytes on the wire. Exactly
   * one file may select them: the detail page for a single request. */
  const ALLOWED = 'app/work/(provider)/requests/[id]/page.tsx'
  const offenders = sourceFiles()
    .filter(f => /photos:\s*true/.test(readFileSync(f, 'utf8')))
    .map(f => relative(ROOT, f))
    .filter(f => f !== ALLOWED)
  assert.deepEqual(offenders, [],
    `these files select the photo blobs into a payload: ${offenders.join(', ')}`)
})

test('the intake offers only work somebody can actually answer', () => {
  /* ⚠️ THE WIZARD WAS A QUEUE WITH NO OTHER SIDE (fixed 2026-08-30). Owner:
   * „როდესაც სერვისი არაა გამოტანილი სერჩში, ვერ უნდა გაგზავნოს… და ისინი უნდა
   * იყოს, რომლებიც გვყავს კატეგორიაში და დამატებული."
   *
   * Measured that day: 148 topics offered, 46 with a live provider. 102 of them
   * — 69% — were a request that could reach nobody, and 19 of the 28 groups
   * were empty end to end. Somebody describing an IELTS course walked five
   * screens to wait forever.
   */
  const server = read('lib/requestsServer.ts')
  assert.match(server, /export async function coveredTopicIds/,
    'the live-supply read is gone — the intake has nothing to narrow by')

  /* ⚠️ DERIVED, NEVER LISTED — the owner's „პარალელურად". A trade becomes
   * offerable the moment a provider ticks it and stops when the last one
   * un-ticks it, because the set is a query over the roster rather than a
   * constant somebody has to remember to edit. */
  /* ⚠️ `available` ALONE SINCE 2026-09-04, AND THE `published` HALF WAS REMOVED
   * ON PURPOSE. This assertion used to demand the pair. On the day `published`
   * became DERIVED from profile completeness (lib/profileCompleteness) the two
   * halves stopped meaning the same kind of thing:
   *
   *   · `available` — the provider's OWN answer: „I am not taking work." Still
   *     required here, which is the whole point of the sentence below.
   *   · `published` — OUR judgement of whether their card is fit to be seen.
   *     Nothing to do with whether the work can be done.
   *
   * Keeping it would have deleted SIX topics from the client's form the moment
   * the completeness gate landed — clean-flat · clean-deep · clean-repair ·
   * clean-office · clean-sofa · clean-window, the whole cleaning family,
   * because the one profile covering them was missing a category. Measured
   * that day. Nobody would have seen a bug: the provider simply would never
   * have been texted, because the request could never have been FILED.
   *
   * Owner, 2026-09-04: „შეუვსებელს ოფერი უნდა მიდიოდეს ტელეფონზე და მეილზე რომ
   * კლიენტი იშოვს და ინიციატივა ქონდეს." */
  assert.match(server, /where: \{ available: true \},/,
    'coveredTopicIds stopped asking for LIVE supply — a paused provider is not supply')
  const covered = server.slice(server.indexOf('export async function coveredTopicIds'))
  assert.doesNotMatch(covered.slice(0, covered.indexOf('\n}')), /published/,
    'coveredTopicIds filters on `published` again — an unfinished card would silently delete its topics from the intake, and the request that would have reached its owner is never filed')
  assert.doesNotMatch(server.slice(server.indexOf('coveredTopicIds')), /const COVERED|\[\s*'[a-z-]+',\s*'[a-z-]+'/,
    'the covered set became a hand-kept list — it must stay a query')

  // It reaches the screen, and it narrows BOTH the browse list and the search.
  assert.match(read('app/request/page.tsx'), /covered=\{covered\}/,
    'the page stopped passing live supply to the wizard')
  assert.match(read('app/request/RequestWizard.tsx'), /onlyTopics=\{to\?\.topics \?\? covered\}/,
    'the wizard stopped narrowing, or stopped letting a direct target win')
  const step = read('app/request/_stepWhat.tsx')
  assert.match(step, /only\.size \? all\.filter\(h => only\.has\(h\.topic\.id\)\) : all/,
    'the search stopped honouring the narrowing — an unanswerable topic is offerable again')

  /* ⚠️ AND NOTHING IS LOST BY NARROWING. Whoever types words that match no
   * offered topic still reaches the free-text escape, which files under
   * OTHER_TOPIC and routes to EVERYONE rather than to a filed specialist. The
   * narrowing removes dead ends, not requests — if that escape ever goes, this
   * change becomes a way to lose demand. */
  assert.match(step, /onFreeText\(q\.trim\(\)\)/,
    'the „მაინც მოგვწერე" escape is gone — narrowing without it loses requests')

  /* 🔒 …AND NARROWING MUST NOT OPEN THE BROWSE PANEL (2026-09-02).
   *
   * This is the bug that arrived WITH `covered` and stood for three days. The
   * panel seeded itself open on `onlyTopics.length > 0`, a condition that meant
   * „a `?to=` provider narrowed this list" when it was written and became
   * „always" the moment `covered` — the roster's whole offerable set, never
   * empty — started arriving through the same prop. Every visitor to /request
   * landed on the folded catalogue the owner deleted on 2026-08-19: „როცა ჩათს
   * მოსაძებნად დაჭერ, მაშინ იშლებოდეს ქვევით… და არა ესე ჩამოწერილი."
   *
   * The two senses of „narrowed" are separate props now, and this pins that:
   * the initial open may read the query and `narrowed`, never the array. */
  const openInit = step.slice(step.indexOf('const [open, setOpen] = useState('))
    .slice(0, step.slice(step.indexOf('const [open, setOpen] = useState(')).indexOf('\n'))
  assert.doesNotMatch(openInit, /onlyTopics/,
    'the browse panel opens on onlyTopics again — `covered` is never empty, so that is every visitor')
  assert.match(openInit, /narrowed/,
    'the panel lost the one narrowing that SHOULD open it — a client who picked a provider')
  assert.match(read('app/request/RequestWizard.tsx'), /narrowed=\{Boolean\(to\?\.topics\?\.length\)\}/,
    'the wizard stopped telling the step which kind of narrowing this is')
})

/* ═══════════ the client's own way out ═══════════════════════════════════ */

test('a client can cancel their own request — and cannot make a paid-for one vanish', () => {
  // ⚠️ ADDED WITH THE ROUTE (2026-09-01). The client was the one party with no
  // exit: a provider withdraws an offer, an admin closes a row, the cron closes
  // an abandoned one, and the person who OPENED it could only walk away. That
  // matters beyond tidiness — a standing request is billed to somebody else,
  // 1₾ every time a provider opens the contact on it.
  const src = codeOf('app/api/requests/[ref]/cancel/route.ts')

  // 1. CLAIMED, NOT CHECKED. The status must ride in the `where` so the database
  //    decides the race; reading it first would let a cancel land in the instant
  //    an offer arrives, and that provider would have paid for nothing.
  assert.match(src, /updateMany\(/, 'the cancel does not claim the row')
  assert.match(src, /status: \{ in: \['NEW', 'VERIFIED'\] \}/,
    'the claim does not name the states it believes it is leaving')
  assert.match(src, /claimed\.count !== 1/, 'the claim result is not checked — two tabs could both win')
  assert.match(src, /status: 409/, 'a lost race is not answered with 409')

  // 2. IT IS YOURS OR IT DOES NOT EXIST. Anything softer confirms a live
  //    reference to a stranger, and the reference is a credential.
  assert.match(src, /viewer\.user\?\.id/, 'ownership is not checked against the signed-in user')
  assert.match(src, /noteRefMiss\(req\)/, 'a wrong reference is not counted')

  // 3. THE BOUND. Once an offer exists a provider has written a real answer and
  //    been charged for it; the honest exit is to choose, not to erase.
  assert.match(src, /offerCount > 0/, 'the route lets a request with offers be cancelled')
  assert.match(src, /offerCount: 0/, 'the claim does not re-assert the bound it just read')

  // 4. THE MONEY GOES BACK. Same call the admin close uses.
  assert.match(src, /refundDeadRequest\(/, 'contacts already paid for are not refunded')

  // 5. The control must not promise what the route refuses.
  // ⚠️ IN `_room.tsx` SINCE 2026-09-02 — one room, two addresses; the control
  // is drawn once and therefore guarded once, for the reader of either.
  const page = codeOf('app/request/[ref]/_room.tsx')
  assert.match(page, /data\.offers\.length === 0/, 'the cancel button is shown once offers exist')
  assert.match(page, /data\.ownerUserId === viewerUserId/, 'the cancel button is shown to somebody who does not own the request')
})
