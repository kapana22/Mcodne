/*
 * HIRING SOMEBODY DIRECTLY — `/request?to=<slug>` (2026-08-19).
 *
 * Run with:  npx tsx --test tests/hireDirect.test.ts
 *
 * WHY THIS FILE EXISTS. The client has two verbs — „დაჯავშნე" and „აღწერე" —
 * and until today only the first could be aimed at a person. „აღწერე" opened an
 * anonymous form: a visitor who had read somebody's profile, looked at their
 * work photos and decided on THEM had to describe the job to nobody in
 * particular, post it into the void, and hope that person happened to bid. The
 * mechanism for writing to somebody first already existed (an INVITED offer,
 * lib/requestInvite) — it was simply unreachable until a request existed.
 *
 * What this file pins is the four things that make that safe:
 *   1. `?to=` resolves ONLY to a provider the catalogue itself shows, and an
 *      unknown or hidden one is IGNORED — never a 404 on the intake.
 *   2. The offer it opens is INVITED, carries no price, and touches nothing
 *      about `offerCount` / `offerLimit`.
 *   3. The contact-masking rule is untouched: a client who wrote to five people
 *      has chosen nobody, and nobody's number opens.
 *   4. The invite has ONE definition and both callers use it.
 *
 * Plus the two shortenings this bought: the wizard drops its first stage when —
 * and only when — a topic could honestly be inferred, and the two profile CTAs
 * carry the recipient while staying behind `requestsOn()`.
 *
 * It EXECUTES the pure half (lib/requestTopics → topicsForProvider, the wizard's
 * step/stage derivation) and reads SOURCE for the half that needs a database.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))
/** Source with the comments stripped, so a rule quoted in prose can never pass
 *  for the rule being implemented. */
const codeOf = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')

const TARGET = 'lib/requestTarget.ts'
const INVITE = 'lib/requestInvite.ts'

/* ═══════════ A. the invite has ONE definition ═══════════════════════════ */

test('§A the INVITED offer is written in exactly one place, and both callers use it', () => {
  assert.ok(has(INVITE), 'lib/requestInvite.ts is missing — the helper is the whole point')
  const helper = codeOf(INVITE)
  // The definition: status gate, allowlist, the row, the notification.
  assert.match(helper, /export async function inviteProviderToRequest/)
  assert.match(helper, /status: 'INVITED'/)
  assert.match(helper, /providerKind: 'EXPERT'/)
  assert.match(helper, /type: 'REQUEST_INVITE'/)

  // ⚠️ AND NOBODY ELSE WRITES ONE. `status: 'INVITED'` on a `create` is the
  // signature of a second copy; the two callers must go through the helper.
  const ROUTE = 'app/api/requests/[ref]/invite/route.ts'
  const CREATE = 'app/api/requests/route.ts'
  for (const f of [ROUTE, CREATE]) {
    assert.match(codeOf(f), /inviteProviderToRequest/, `${f} does not call the shared helper`)
    assert.doesNotMatch(codeOf(f), /status: 'INVITED'/,
      `${f} writes its own INVITED row — the four guarantees now exist twice`)
    assert.doesNotMatch(codeOf(f), /requestOffer\.create/,
      `${f} creates an offer directly instead of going through lib/requestInvite`)
  }
  // One import site each, so „both callers" is literally true.
  assert.equal((codeOf(ROUTE).match(/inviteProviderToRequest/g) ?? []).length >= 1, true)
  assert.equal((codeOf(CREATE).match(/inviteProviderToRequest/g) ?? []).length >= 1, true)
})

test('§A the four guarantees survived the move', () => {
  const helper = codeOf(INVITE)
  // NO PRICE. Zero is „no price yet" and the column is required — the row must
  // never be given a real one here.
  assert.match(helper, /priceGel: 0/)
  assert.match(helper, /message: ''/)
  // NOT ACCEPTABLE, and NO PLACE CONSUMED: the helper must not touch the
  // counters an ordinary bid moves.
  assert.doesNotMatch(helper, /offerCount|offerLimit/,
    'the invite now counts against the offer limit — an invitation is not a bid')
  assert.doesNotMatch(helper, /status: 'ACCEPTED'|acceptedAt/)
  // ONLY AN ALLOWLISTED PROVIDER — a request reference must not become a way to
  // message any account on the site.
  assert.match(helper, /requestAccess\.findFirst[\s\S]{0,160}active: true/)
  // A settled or dead request takes no new threads.
  assert.match(helper, /status !== 'NEW' && [\s\S]{0,40}!== 'VERIFIED'/)
  // IDEMPOTENT: a second tap lands in the conversation that exists.
  assert.match(helper, /findFirst[\s\S]{0,140}requestId: request\.id, expertUserId/)
})

test('§A the contact still opens on ACCEPTANCE ONLY — the masking rule is untouched', () => {
  // The seal is lib/requestChat's, and nothing in this feature may relax it.
  const chat = read('lib/requestChat.ts')
  assert.match(chat, /ACCEPTED/, 'the masking rule no longer mentions the one status that opens a contact')
  for (const f of [INVITE, TARGET, 'app/api/requests/route.ts']) {
    assert.doesNotMatch(codeOf(f), /maskContacts|unmask|revealContact/i,
      `${f} touches the contact-masking rule — the phone opens on acceptance and nowhere else`)
  }
  // …and the invite hands back no phone, no email, no publicRef.
  assert.doesNotMatch(codeOf(INVITE), /phone|publicRef/i,
    'the invite helper has learned about the client’s credential or their number')
})

/* ═══════════ B. `?to=` resolves only to somebody the catalogue shows ════ */

test('§B `?to=` is resolved server-side, against the catalogue’s own rules', () => {
  assert.ok(has(TARGET), 'lib/requestTarget.ts is missing')
  const t = codeOf(TARGET)
  // ⚠️ THE RULES ARE IMPORTED, NEVER RE-TYPED. A fourth hand-written copy of
  // „who is public" is a copy that drifts, and the drift is invisible: the
  // recipient line would name somebody the catalogue hides.
  assert.match(t, /import\s+\{\s+PUBLIC_TUTOR\s+\}\s+from\s+'\.\/tutorsQuery'/)
  assert.match(t, /import\s+\{\s+PUBLIC\s+as\s+PUBLIC_MASTER\s+\}\s+from\s+'@\/app\/experts\/_masterData'/)
  assert.match(t, /PUBLIC_MASTER/, 'the master lookup does not apply the catalogue’s rule')
  assert.match(t, /PUBLIC_TUTOR/, 'the expert lookup does not apply the catalogue’s rule')
  // Both exports still exist and still say what they said.
  assert.match(read('app/experts/_masterData.ts'), /export const PUBLIC = \{[\s\S]{0,300}published: true/)
  assert.match(read('lib/tutorsQuery.ts'), /export const PUBLIC_TUTOR = \{[\s\S]{0,900}available: true/)
  assert.match(read('lib/tutorsQuery.ts'), /const where: any = \{ \.\.\.PUBLIC_TUTOR \}/,
    'queryTutors no longer builds its where from the shared rule — the two can now disagree')
  // No base64 column is ever selected for a one-line recipient label.
  assert.doesNotMatch(t, /photoUrl:\s*true|workPhotos:\s*true|avatarUrl:\s*true,\s*\}\s*\}\s*\)\s*$/m,
    'the resolver selects an image column')
  assert.match(t, /\/api\/masters\/\$\{row\.id\}\/photo/, 'the master photo must be the route, never the column')
  assert.match(t, /avatarSrc\(/, 'the expert photo must go through avatarSrc')
})

test('§B an unknown, hidden or malformed `to` is IGNORED — the form still works', () => {
  const t = codeOf(TARGET)
  // Null, not notFound(): taking the whole intake away over a decoration.
  assert.doesNotMatch(t, /notFound\(\)|redirect\(/,
    'lib/requestTarget 404s or redirects — an unresolvable ?to= must simply be ignored')
  assert.match(t, /return null/)
  // Bounded before it reaches a query — this is a URL anybody can craft.
  assert.match(t, /\[a-z0-9-\]\{1,80\}/)
  // A DB wobble is answered the same way.
  assert.match(t, /catch \{[\s\S]{0,120}return null/)
  // The page passes it down and never gates on it.
  const page = codeOf('app/request/page.tsx')
  assert.match(page, /resolveRequestTarget\(/)
  assert.doesNotMatch(page, /if \(!target\) notFound\(\)/,
    'the intake now 404s when the recipient cannot be resolved')
  assert.match(page, /to=\{target[\s\S]{0,200}: null\}/)
})

test('§B the SLUG is what crosses the wire, and the server resolves it again', () => {
  // The browser holds a public address, not a decision.
  const wiz = codeOf('app/request/RequestWizard.tsx')
  assert.match(wiz, /to: to\.slug/, 'the wizard sends something other than the public slug')
  assert.doesNotMatch(wiz, /expertUserId|userId/,
    'a user id reached the browser — the endpoint resolves the recipient itself')
  const create = codeOf('app/api/requests/route.ts')
  assert.match(create, /resolveRequestTarget\(toRaw/,
    'the endpoint trusts the body instead of resolving the slug again')
  // The invite is best-effort: it can never cost somebody their request.
  // The window widened when the invite gained its second job — dropping
  // `offerLimit` to 1 so an addressed request is not also broadcast. What is
  // pinned is unchanged: the whole thing sits inside a try/catch, because the
  // REQUEST is the deliverable and a failed invite may never cost it.
  assert.match(create, /try\s+\{[\s\S]{0,2000}inviteProviderToRequest[\s\S]{0,2000}\}\s+catch/)
  // ⚠️ ADDRESSED, NOT BROADCAST (2026-08-20) — owner: „თუ მცოდნესთან აგზავნის,
  // მხოლოდ მცოდნესთან უნდა მივიდეს." Before this, a request that named somebody
  // kept the default three places and went to every matching provider, so the
  // client who pressed „დაკვეთა" on a priced row got two cold quotes from
  // strangers. One existing column carries it; nothing else needed a new state.
  assert.match(create, /offerLimit: 1/,
    'a targeted request no longer closes its own places — it is broadcast again')
  // …and `to` is not a column: the row records what was asked for, not the aim.
  assert.doesNotMatch(read('lib/requests.ts'), /^\s*to:\s*z\./m,
    'the wire schema grew a `to` field — the aim is the INVITED offer, not the request row')
})

/* ═══════════ C. the topics a provider implies ══════════════════════════ */

test('§C a provider’s own offering is turned into topics — or into nothing', () => {
  const { topicsForProvider, kindsOfTopic } =
    require('../lib/requestTopics') as typeof import('../lib/requestTopics')

  // A master: their trade ids, exactly, and only ones the vocabulary knows.
  const plumber = topicsForProvider({ kind: 'MASTER', services: ['plumb-leak', 'not-a-topic'] })
  assert.deepEqual(plumber, ['plumb-leak'])
  // …and a trade is unambiguous by construction, which is what lets the wizard
  // shorten at all.
  assert.deepEqual(kindsOfTopic('plumb-leak'), ['SERVICE'])

  // An expert by PROFESSION — the sharper of the two signals, so it wins alone.
  const accountant = topicsForProvider({
    kind: 'EXPERT', professions: ['ბუღალტერი'], categorySlug: 'tax',
  })
  assert.ok(accountant.includes('accounting'))
  assert.ok(accountant.includes('vat'))
  assert.ok(!accountant.includes('audit'), 'an auditor’s topic was matched to a bookkeeper')

  // …falling back to the SPHERE when no profession is named.
  const bySphere = topicsForProvider({ kind: 'EXPERT', professions: [], categorySlug: 'law' })
  assert.ok(bySphere.length > 1)
  assert.ok(bySphere.includes('contract'))

  // Whole label, never a substring — the rule lib/requestRouting already makes.
  assert.deepEqual(topicsForProvider({ kind: 'EXPERT', professions: ['იურ'], categorySlug: null }), [])
  // Nothing to go on → nothing inferred. The wizard then behaves as it always did.
  assert.deepEqual(topicsForProvider({ kind: 'EXPERT', professions: [], categorySlug: null }), [])
  assert.deepEqual(topicsForProvider({ kind: 'MASTER', services: [] }), [])

  // ⚠️ NEVER A LEARNING OR SERVICE TOPIC FOR AN EXPERT — the line
  // tests/taxonomy.test.ts draws between the two vocabularies.
  const everySphere = topicsForProvider({ kind: 'EXPERT', professions: [], categorySlug: 'tax' })
  for (const id of everySphere) {
    assert.ok(!kindsOfTopic(id).includes('LEARNING'), `${id} is a school subject`)
    assert.ok(!kindsOfTopic(id).includes('SERVICE'), `${id} is a trade`)
  }
})

/* ═══════════ D. the wizard shortens only when it honestly can ══════════ */

test('§D the „რა გჭირდება" stage goes only when ONE unambiguous topic was inferred', () => {
  const { EMPTY_DRAFT, withTarget, stepsFor, stagesFor } =
    require('../app/request/_model') as typeof import('../app/request/_model')

  // Nothing inferred → exactly the run it always was.
  const bare = withTarget(EMPTY_DRAFT, [])
  assert.equal(bare.topicPinned, false)
  assert.equal(stepsFor(bare)[0].id, 'what')
  assert.deepEqual(stagesFor(bare).map(s => s.id), ['what', 'detail', 'contact'])

  // ONE unambiguous topic → the screen AND the stage go, and the topic is set.
  const pinned = withTarget(EMPTY_DRAFT, ['plumb-leak'])
  assert.equal(pinned.topic, 'plumb-leak')
  assert.equal(pinned.kind, 'SERVICE', 'the kind must be derived, never asked')
  assert.equal(pinned.topicPinned, true)
  const steps = stepsFor(pinned)
  assert.ok(!steps.some(s => s.id === 'what'), 'the topic question is still being asked')
  assert.ok(!steps.some(s => s.id === 'kind'))
  assert.deepEqual(stagesFor(pinned).map(s => s.id), ['detail', 'contact'])
  // …and the run still ends where it always did.
  assert.equal(steps[steps.length - 1].id, 'contact')

  // ONE topic that is AMBIGUOUS → the topic is set, the screen STAYS, because
  // the question it now asks („რა სახის დახმარება?") is still open.
  const ambiguous = withTarget(EMPTY_DRAFT, ['contract'])
  assert.equal(ambiguous.topic, 'contract')
  assert.equal(ambiguous.kind, '')
  assert.equal(ambiguous.topicPinned, false)
  assert.equal(stepsFor(ambiguous)[0].id, 'what')

  // SEVERAL topics → nothing is chosen for anybody. Never silently submitting a
  // wrong topic is the whole rule.
  const several = withTarget(EMPTY_DRAFT, ['accounting', 'vat'])
  assert.equal(several.topic, '')
  assert.equal(several.topicPinned, false)
  assert.equal(stepsFor(several)[0].id, 'what')
})

test('§D a restored draft can never shorten a wizard that carries no `?to=`', () => {
  const { reviveDraft, EMPTY_DRAFT, withTarget } =
    require('../app/request/_model') as typeof import('../app/request/_model')
  const saved = JSON.parse(JSON.stringify(withTarget(EMPTY_DRAFT, ['plumb-leak'])))
  assert.equal(saved.topicPinned, true)
  // The URL open NOW is what decides — same rule `vertical` follows.
  assert.equal(reviveDraft(saved).topicPinned, false)
  // …and the wizard re-applies it from the URL, not from storage.
  const wiz = read('app/request/RequestWizard.tsx')
  assert.match(wiz, /withTarget\(withAccountContact\(\{\s+\.\.\.d,\s+vertical\s+\},\s+account\),\s+to\?\.topics\s+\?\?\s+\[\],\s+!!to\)/,
    'the restore path no longer re-applies the recipient from the URL')
})

test('§D the first screen is narrowed, never emptied, and keeps its way out', () => {
  const what = read('app/request/_stepWhat.tsx')
  assert.match(what, /onlyTopics\?: string\[\]/)
  assert.match(what, /narrowedGroups\(vertical, only\)/)
  // Empty = no narrowing, never „no topics".
  assert.match(what, /if \(!only\.size\) return all/)
  // „სხვა" and the free-text escape survive a narrowed list: somebody may want
  // what this provider does not list, and the honest answer is still a request.
  assert.match(what, /OTHER_TOPIC/)
  assert.match(what, /onFreeText\(q\.trim\(\)\)/)
  // The wizard hands the provider's topics in, and nothing else.
  assert.match(read('app/request/RequestWizard.tsx'), /onlyTopics=\{to\?\.topics \?\? \[\]\}/)
})

test('§D the shell names the recipient, and the stage row is derived', () => {
  const shell = read('app/request/_shell.tsx')
  assert.match(shell, /steps=\{stages\}/, 'the stage row is a hand-kept list again')
  assert.match(shell, /მოთხოვნა გაეგზავნება/)
  assert.match(read('app/request/RequestWizard.tsx'), /stages=\{stagesFor\(draft\)\}/)
  // A statement, not a control — there is nothing to change here.
  assert.doesNotMatch(shell, /to && \([\s\S]{0,400}<(button|Link|a)\b/,
    'the recipient line became a control')
})

/* ═══════════ E. the two profile CTAs ═══════════════════════════════════ */

test('§E both profile CTAs carry the recipient and stay behind requestsOn()', () => {
  // The master's: one address, stated in the model, with the slug appended.
  // ⚠️ THE PATHS MOVED IN STAGE 11 (2026-08-19), the mechanism did not: the
  // provider profile answers at /experts/<slug> now, so its model and its CTA
  // are ./_providerData and ./_providerCta inside app/experts/[slug].
  const data = read('app/experts/[slug]/_providerData.ts')
  assert.match(data, /export const requestHrefFor/)
  assert.match(data, /&to=\$\{encodeURIComponent\(p\.slug\s+\|\|\s+p\.id\)\}/)
  // ⚠️ AND THE SERVICE THEY TAPPED, AS `?q=` (2026-08-20). The priced list is
  // the provider page's centre, and its button opened a form whose FIRST
  // question was „რა გჭირდება" — which the client had just answered by pressing
  // „დაკვეთა" on a named row. `q` is the search box's own parameter, read by
  // app/request/page since the wizard was built, so nothing new was invented;
  // it is a SEED, not a decision, and it is capped on both sides.
  assert.match(data, /&q=\$\{encodeURIComponent\(service\.slice\(0,\s+60\)\)\}/,
    'the order button stopped carrying the service into the wizard')
  assert.match(read('app/experts/[slug]/_providerBlocks.tsx'), /requestHrefFor\(p, s\.label\)/,
    'the priced row no longer passes its own label')
  assert.match(read('app/request/page.tsx'), /sp\.q === 'string'/,
    'the wizard stopped reading ?q — the seed would land nowhere')
  assert.match(read('app/experts/[slug]/_providerCta.tsx'), /requestHrefFor\(master\)/)
  // …gated in the PAGE, exactly as before (the profile must survive the flag
  // being off — it is an indexable page).
  assert.match(read('app/experts/[slug]/page.tsx'), /requestsOn\(\)/)

  // The expert's: BOOKING STAYS PRIMARY, the request path is the secondary.
  const page = read('app/experts/[slug]/page.tsx')
  assert.match(page, /requestsOn\(\)\s+\?\s+`\/request\?to=\$\{encodeURIComponent\(resolved\?\.slug\s+\|\|\s+id\)\}`\s+:\s+null/,
    'the expert CTA is not gated on the flag, or no longer carries the slug')
  const booking = read('app/experts/[slug]/_booking.tsx')
  assert.match(booking, /დაჯავშნე/, 'booking stopped being the profile’s primary action')
  // ⚠️ IT NO LONGER TAKES THE MESSAGE BUTTON'S SLOT (2026-08-20). This used to
  // assert `requestHref ? (…variant="secondary"` — a TERNARY, i.e. the request
  // button REPLACING the message button. That was argued from „the two are the
  // same intent"; they are not. A message is one question in a thread, a
  // request is a multi-step brief that opens offers, and handing the form to
  // somebody who wanted to ask „ამას აკეთებ?" is how the question stops being
  // asked at all. Owner, 2026-08-20: „რამდენიმე ვარიანტი უნდა ქონდეს."
  //
  // What replaces the old pin is the property that actually matters: BOTH are
  // reachable, and they are NOT peers. The request is the secondary BUTTON; the
  // question is a quiet text link under it. Hierarchy is what keeps a rail from
  // arguing with itself — not the number of controls.
  assert.match(booking, /requestHref\s+&&\s+\([\s\S]{0,400}variant="secondary"[\s\S]{0,200}გამოაგზავნე\s+მოთხოვნა/,
    'the request path is no longer the rail’s secondary button')
  assert.match(booking, /requestHref \?[\s\S]{0,600}ან დაუსვი კითხვა/,
    'the question link vanished — the request button is swallowing the message path again')
  assert.doesNotMatch(booking, /ან დაუსვი კითხვა[\s\S]{0,200}variant="hero"/,
    'the question was promoted to a primary CTA — it is the cheapest act on the page, not the loudest')
  assert.doesNotMatch(booking, /requestHref[\s\S]{0,200}variant="hero"/,
    'the request path was promoted to a primary CTA on the expert profile')
  // Never while messaging has already been promoted TO primary — the rail must
  // not show two doors to the same next step.
  assert.match(booking, /canMessage && !messagePromoted/)
  // The flag is read ONCE, in the page: the parts carry the value, not the env.
  for (const f of ['app/experts/[slug]/_booking.tsx', 'app/experts/[slug]/client.tsx']) {
    assert.doesNotMatch(read(f), /requestsOn\(|FEATURE_REQUESTS/,
      `${f} reads the flag itself — two surfaces on one page can now disagree`)
  }
})

test('§F a named provider gets ONE screen, not six', () => {
  // Measured on the live site before the change: after choosing somebody, the
  // client still answered where / how many rooms / budget / when / which city /
  // how — six screens — before a word reached the person they had picked. Those
  // questions exist so a STRANGER can quote blind; a named provider asks in the
  // thread. Owner: „მინდა რომ მარტივად, სწრაფად და კომფორტულად იყოს."
  const { stepsFor, EMPTY_DRAFT } = require('../app/request/_model') as typeof import('../app/request/_model')
  const direct = stepsFor({ ...EMPTY_DRAFT, directTo: true, topic: 'plumbing', kind: 'SERVICE', topicPinned: true })
  assert.deepEqual(direct.map(s => s.id), ['contact'], 'a message to one person is more than one screen again')
  // …and an open request is untouched: nobody chosen, every question earns its screen.
  const open = stepsFor({ ...EMPTY_DRAFT, topic: 'plumbing', kind: 'SERVICE', topicPinned: true })
  assert.ok(open.length > 3, 'the open request lost the questions a blind quote needs')
  assert.ok(!open.some(s => s.id === 'what'), 'a pinned topic still asks the first question')
})

/* ── §G. THE ONE-SCREEN RUN CAN ACTUALLY SEND ────────────────────────────────
 *
 * The most expensive kind of bug this file exists to stop, and it shipped on
 * 2026-08-19 before this test was written: collapsing the run to one screen is
 * a change to what is ASKED, and every question dropped is a field the wire
 * schema still demanded. The page rendered perfectly, typed perfectly, passed
 * the whole gate — and answered „INVALID" to every person who pressed send.
 * Nothing in a screenshot, a type check or a source-text pin could see it.
 *
 * So this one EXECUTES the real path: build the draft the wizard holds at the
 * end of a one-screen run and hand it to the very parser the wizard calls.
 */
test('a one-screen direct message parses against the wire schema', async () => {
  const { ServiceRequestInput, TOPIC_GROUPS, kindsOfTopic } = await import('../lib/requests')
  const { EMPTY_DRAFT, withTarget, stepsFor } = await import('../app/request/_model')
  const all = TOPIC_GROUPS.flatMap(g => g.topics as { id: string }[])
  const single = all.filter(t => kindsOfTopic(t.id).length === 1)
  assert.ok(single.length > 0, 'no single-kind topic left — the fixture below is meaningless')

  for (const t of single.slice(0, 12)) {
    const d = {
      ...withTarget(EMPTY_DRAFT, [t.id], true),
      description: 'ონკანი წვეთავს სამზარეულოში',
      contactName: 'გიორგი', phone: '555123456', email: 'a@b.ge',
    }
    assert.equal(d.directTo, true, `${t.id}: a chosen provider with one kind must shorten the run`)
    assert.deepEqual(stepsFor(d).map(s => s.id), ['contact'], `${t.id}: the run must be one screen`)
    const r = ServiceRequestInput.safeParse(d)
    assert.ok(r.success, `${t.id}: the one-screen draft was refused — ${
      r.success ? '' : r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
})

test('directTo is never true while a question is still unanswered', async () => {
  const { EMPTY_DRAFT, withTarget, stepsFor } = await import('../app/request/_model')
  // Two topics: the provider does more than one thing, so the topic cannot be
  // inferred and the screens that ask it must survive.
  const two = withTarget(EMPTY_DRAFT, ['math', 'physics'], true)
  assert.equal(two.directTo, false, 'a provider with two topics cannot shorten the run')
  assert.ok(stepsFor(two).length > 1, 'the run must keep its questions when the topic is unknown')
  // Nobody chosen at all.
  const none = withTarget(EMPTY_DRAFT, ['math'], false)
  assert.equal(none.directTo, false, 'no recipient, no shortening')
})

/* ═══════════ §H the provider is TOLD they were chosen ════════════════════ */

test('§H an INVITED request is marked in the provider feed', () => {
  // ⚠️ THE MECHANISM WAS COMPLETE AND THE OUTCOME WAS NOT (2026-08-20). Every
  // step of `?to=` was already built and pinned above: the profile carries the
  // slug, the wizard names the recipient, the endpoint re-resolves it and opens
  // an INVITED offer. Then the request landed in the provider's queue looking
  // exactly like a broadcast one — so the person who had ALREADY been chosen
  // read it as a three-way race and priced it like one. The choice was made,
  // recorded, and thrown away one screen before it mattered.
  //
  // What is pinned: the feed asks WHICH rows are invited, and it asks in ONE
  // query over the ids it already has (a per-card lookup on a 100-row page is
  // 100 round trips), and the answer reaches the card.
  const feed = read('app/work/(provider)/requests/page.tsx')
  assert.match(feed, /status: 'INVITED'/, 'the feed no longer asks which requests named this provider')
  // The lookup runs BEFORE the feed query now, because its answer is both the
  // label and the FILTER — see the OR below.
  assert.match(feed, /const\s+invited\s+=\s+new\s+Map\(mineInvited\.map\(o\s+=>\s+\[o\.requestId,\s+o\.createdAt\]\)\)/,
    'the invited map is gone — the feed can no longer tell an addressed request from an open one, nor time it')
  // ⚠️ AND IT IS THE EXCLUSION. `offerLimit` is 1 only on a request that named
  // somebody, so the queue is „anything with room for anybody, plus what was
  // addressed to me". A request addressed to somebody else matches neither arm.
  assert.match(feed, /\{ offerLimit: \{ gt: 1 \} \}/,
    'the open queue stopped excluding addressed requests — they are broadcast again')
  assert.match(feed, /id: \{ in: \[\.\.\.invited\.keys\(\)\] \}/,
    'the recipient lost their own addressed request from the queue')
  assert.match(feed, /expertUserId: me\.userId.*companyId: me\.companyId/s,
    'the lookup must be scoped to THIS provider — both identities, as everywhere else')
  assert.match(feed, /invited\.has\(r\.id\)/, 'the card stopped reading the invited set')
  assert.match(feed, /შენ აგირჩია/, 'the words that tell the provider they were chosen are gone')
})

/* ═══════════ §I an addressed request goes to ONE person ═════════════════ */

test('§I only the named provider can see or answer an addressed request', () => {
  // ⚠️ THE RULE, IN THE OWNER'S WORDS (2026-08-20): „თუ მცოდნესთან აგზავნის,
  // მხოლოდ მცოდნესთან უნდა მივიდეს." Until this, `?to=` opened the invited
  // thread and changed nothing else: `offerLimit` kept its default 3 and the
  // provider queue had no exclusion, so a client who had read one profile, seen
  // one price and pressed „დაკვეთა" was answered by strangers. The „შენ
  // აგირჩია" badge was true and useless — chosen, and still in a race.
  //
  // ONE COLUMN CARRIES IT. `offerLimit: 1` is written by the invite and read by
  // everything that already asks „is there room" — no new column, no second
  // state machine, and one value for the client's button to raise.
  const create = read('app/api/requests/route.ts')
  assert.match(create, /offerLimit: 1/, 'a targeted request is broadcast again')

  const feed = read('app/work/(provider)/requests/page.tsx')
  assert.match(feed, /\{ offerLimit: \{ gt: 1 \} \}/, 'the open queue stopped excluding addressed requests')
  assert.match(feed, /id: \{ in: \[\.\.\.invited\.keys\(\)\] \}/, 'the recipient lost their own request from the queue')

  // The clock is the PROVIDER's, because the asymmetry is that a client can
  // always act and a provider can always stall.
  assert.match(feed, /უპასუხე/, 'the exclusivity window is no longer shown to the provider')
  assert.match(read('lib/requestLive.ts'), /export const DIRECT_WINDOW_MS/, 'the window constant is gone')

  // ⚠️ AND NOTHING OPENS BY ITSELF. The endpoint is the ONLY writer that raises
  // the limit, it is a POST, and it claims conditionally so a second tab cannot
  // double-apply it. An automatic timer would publish a private choice to
  // strangers with nobody pressing anything — and every automated message this
  // platform sends is an email (there is no SMS), so the client would learn of
  // it by receiving quotes they never asked for.
  const open = read('app/api/requests/[ref]/open/route.ts')
  assert.match(open, /where: \{ publicRef: ref, offerLimit: 1 \}/, 'the opener stopped guarding on the addressed state')
  assert.match(open, /DEFAULT_OFFER_LIMIT/, 'the opener invents its own number instead of reading the one default')
  // Comments stripped: the prose above explains at length why nothing expires,
  // and a pin that reads its own explanation as a violation is a pin that can
  // only be satisfied by deleting the reasoning.
  assert.doesNotMatch(codeOf('app/api/requests/[ref]/open/route.ts'), /setTimeout|setInterval/,
    'the opener grew an automatic path — it must be a person pressing a button')

  // ⚠️ AND SO IS THE OPERATOR. This subsystem's safety net is that a human
  // phones every request; „0/1" in an offers header reads as „nobody has bid",
  // not as „this client chose somebody". The same panel lets an admin raise the
  // limit, i.e. undo the client's choice, so the state must be legible ABOVE
  // that field, in words.
  const admin = read('app/admin/_requests.tsx')
  assert.match(admin, /r\.offerLimit === 1/, 'the admin panel stopped detecting an addressed request')
  assert.match(admin, /status === 'INVITED'/, 'the addressed state must be the PAIR — a limit of 1 alone is not it')
  assert.match(admin, /სხვა ვერავინ ხედავს/, 'the operator is no longer told the request is private')

  // The client is told which state they are in, in words that match it.
  const live = read('app/request/_live.tsx')
  assert.match(live, /addressedTo/, 'the client page cannot tell an addressed request from a tender')
  assert.match(live, /მხოლოდ ის ხედავს ამ მოთხოვნას/, 'the client is no longer told the request is private')
  assert.match(live, /გავხსნა სხვებისთვის/, 'the way out is gone — an unanswered request is a dead end again')
})
