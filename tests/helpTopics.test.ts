/*
 * The help widget's content + context ordering.
 *
 * Run with:  npx tsx tests/helpTopics.test.ts
 *
 * Two things are pinned here, and both are silent when they break.
 *
 * 1. The ROUTE MAP points at questions by PREFIX. Rewording a question in
 *    lib/helpTopics is a normal, harmless-looking edit — and it detaches every
 *    lead entry that pointed at the old wording. Nothing errors: the widget
 *    just quietly stops being context-aware and shows the generic list, which
 *    is the entire feature gone with no symptom.
 *
 * 2. The ANSWERS must never hardcode a number that lives in lib/flags. „24
 *    საათი" typed into an answer becomes a lie the day CANCEL_CUTOFF_HOURS
 *    changes, and this is one of the two answers (with the payment tense) that
 *    costs real money when wrong.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_TOPICS, topicsForRoute, HELP_VISIBLE, HELP_EVENTS, normalizeRoute } from '../lib/helpTopics'
import { parseEventBody } from '../components/booking/funnelEvents'
import { CANCEL_CUTOFF_HOURS, COMMISSION_PCT } from '../lib/flags'

const ROOT = join(import.meta.dirname, '..')
const source = readFileSync(join(ROOT, 'lib/helpTopics.ts'), 'utf8')

test('there is content, and every topic carries a question, an answer and a group', () => {
  assert.ok(ALL_TOPICS.length >= 10, `only ${ALL_TOPICS.length} topics`)
  for (const t of ALL_TOPICS) {
    assert.ok(t.q.trim().length > 5, `empty question: ${JSON.stringify(t)}`)
    assert.ok(t.a.trim().length > 20, `answer too short to help: ${t.q}`)
    assert.ok(t.group.trim().length > 0, `no group: ${t.q}`)
  }
})

test('the route map is not empty — the context feature is the whole point', () => {
  // Its entries are checked against the real ids further down; this only
  // guards against the map being emptied or moved without anyone noticing,
  // since an empty map degrades silently to „a smaller /help".
  const leads = [...source.matchAll(/lead: \[([^\]]+)\]/g)]
    .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))
  assert.ok(leads.length >= 10, 'the route map looks empty — did it move?')
})

test('every route returns a full, non-empty, duplicate-free list', () => {
  const routes = ['/', '/tutors', '/experts/some-expert', '/join', '/signup', '/signin',
                  '/me/bookings/abc', '/work/schedule', '/blog/x', '', null, undefined]
  for (const r of routes) {
    const got = topicsForRoute(r as string)
    assert.equal(got.length, ALL_TOPICS.length, `route ${r} dropped or duplicated topics`)
    assert.equal(new Set(got.map(t => t.q)).size, got.length, `route ${r} has duplicates`)
  }
})

test('context ordering actually differs by route — otherwise it is just /help', () => {
  const first = (r: string) => topicsForRoute(r).slice(0, HELP_VISIBLE).map(t => t.q).join('|')
  assert.notEqual(first('/join'), first('/experts/x'))
  assert.notEqual(first('/join'), first('/'))
  // The most specific prefix wins: a profile is not the browse page.
  assert.notEqual(first('/experts/x'), first('/tutors'))
})

test('the expert-side routes lead with the money questions', () => {
  // Someone stops mid-application over commission and payout timing, not over
  // „what is mcodne".
  const top = topicsForRoute('/join').slice(0, 3).map(t => t.q).join(' ')
  assert.match(top, /ექსპერტი/)
  assert.match(top, /კომისი|თანხას/)
})

test('answers read the flags — they never hardcode the numbers', () => {
  // A typed „24 საათი" or „15%" survives a constant change and starts lying.
  assert.match(source, /CANCEL_CUTOFF_HOURS/)
  assert.match(source, /COMMISSION_PCT/)
  assert.match(source, /PAYMENTS_LIVE/)
  // Checked on the SOURCE, not on the rendered answer — this is the trap that
  // caught the first version of this test. `CANCEL_CUTOFF_HOURS` IS 24, so a
  // perfectly correct `${CANCEL_CUTOFF_HOURS} საათ` renders as „24 საათ" and is
  // indistinguishable from a hardcoded one once evaluated. Only the source can
  // tell a constant from a literal. Comments stripped first: the file's own
  // header explains the rule using the very literal it bans.
  // Two checks instead of parsing TypeScript source for string literals — the
  // first version tried that and its regex silently dropped 5 of 17 answers
  // (the flag-gated ternaries span lines), so it „passed" on a subset.
  //
  //   1. the source READS each constant, and
  //   2. the rendered answer actually CONTAINS that constant's value,
  //
  // which together prove the interpolation is present AND lands in the right
  // answer — without caring how the literal is written.
  const code = source.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(code, /\$\{CANCEL_CUTOFF_HOURS\}/, 'nothing reads CANCEL_CUTOFF_HOURS')
  const cancelAnswer = ALL_TOPICS.find(t => /აუქმ/.test(t.q) || /აუქმ/.test(t.a))?.a
  assert.ok(cancelAnswer, 'the cancellation answer disappeared')
  assert.ok(
    cancelAnswer!.includes(String(CANCEL_CUTOFF_HOURS)),
    `the cancellation answer does not mention the current window (${CANCEL_CUTOFF_HOURS}h)`,
  )
  const commissionAnswer = ALL_TOPICS.find(t => /კომისი/.test(t.q) || /კომისი/.test(t.a))?.a
  if (commissionAnswer) {
    assert.match(code, /\$\{COMMISSION_PCT\}/, 'nothing reads COMMISSION_PCT')
    assert.ok(commissionAnswer.includes(String(COMMISSION_PCT)), 'the commission answer is out of step with the flag')
  }
})

test('/help and the widget read ONE source', () => {
  // The whole reason the content moved out of the page.
  const page = readFileSync(join(ROOT, 'app/help/page.tsx'), 'utf8')
  assert.match(page, /from '@\/lib\/helpTopics'/)
  assert.ok(!/const GROUPS: FaqGroup\[\] = \[/.test(page), '/help declared its own copy again')
})

test('the widget events are ACCEPTED by the /api/events validator', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // THIS TEST USED TO PASS WHILE THE FEATURE WAS 100% DEAD. It grepped
  // funnelEvents.ts for `Object.values(HELP_EVENTS)` and for the three prop-key
  // strings — both of which were present and correct — and concluded the events
  // were allowed. They were not: `parseEventBody` refused every string prop
  // except flowId/code/tutorId, and separately required a flowId the widget
  // never sends. All three events 400'd, the beacon is fire-and-forget, and not
  // one row was ever written.
  //
  // The lesson is the test's real subject: an allow-list has a FUNCTION, so
  // call the function. A grep can only ever confirm that the code looks like
  // the code you expected to write.
  // ─────────────────────────────────────────────────────────────────────────
  const cases: { label: string; body: unknown }[] = [
    { label: 'opened', body: { name: HELP_EVENTS.opened, props: { route: normalizeRoute('/join') } } },
    { label: 'question', body: { name: HELP_EVENTS.question, props: { route: normalizeRoute('/experts/nino-x'), q: ALL_TOPICS[0].id } } },
    { label: 'unresolved', body: { name: HELP_EVENTS.unresolved, props: { route: normalizeRoute('/'), seen: HELP_VISIBLE } } },
  ]
  for (const c of cases) {
    const got = parseEventBody(c.body)
    assert.equal(got.ok, true, `${c.label} is rejected: ${got.ok ? '' : got.reason}`)
  }

  // Every shipped question id must survive the round trip — a new topic whose
  // id the validator refuses would kill that one question's data only, which is
  // exactly the kind of partial failure nobody notices.
  for (const t of ALL_TOPICS) {
    const got = parseEventBody({ name: HELP_EVENTS.question, props: { route: '/', q: t.id } })
    assert.equal(got.ok, true, `topic id '${t.id}' is not accepted by the validator`)
  }

  // Every route the app can produce must normalise into something acceptable —
  // including the ones with ids, Georgian slugs and query strings, since a
  // rejected beacon is silent.
  const routes = ['/', '/tutors', '/experts/nino-kapanadze-a1b2', '/join', '/signin',
                  '/me/bookings/clx0000000000000000000000', '/blog/რატომ-მცოდნე',
                  '/experts/biznes-konsultanti?utm_source=x', '/' + 'a'.repeat(200)]
  for (const r of routes) {
    const got = parseEventBody({ name: HELP_EVENTS.opened, props: { route: normalizeRoute(r) } })
    assert.equal(got.ok, true, `route ${r} normalises to something the API rejects`)
  }

  // …and the free-text firewall must still hold: `q` and `route` are string
  // props, and opening them up is exactly how free text could start arriving.
  assert.equal(parseEventBody({ name: HELP_EVENTS.question, props: { route: '/', q: 'ტექსტი რომელსაც ვწერ' } }).ok, false,
    'q accepts arbitrary text — the free-text firewall is open')
  assert.equal(parseEventBody({ name: HELP_EVENTS.opened, props: { route: 'https://evil.example/x' } }).ok, false,
    'route accepts a full URL')
  // The funnel invariant the help exemption must NOT have weakened.
  assert.equal(parseEventBody({ name: 'booking_flow_opened', props: {} }).ok, false,
    'a booking event no longer requires a flowId')

  // And the widget must actually fire all three.
  const widget = readFileSync(join(ROOT, 'components/HelpWidget.tsx'), 'utf8')
  for (const e of ['opened', 'question', 'unresolved']) {
    assert.ok(widget.includes(`HELP_EVENTS.${e}`), `the widget never fires HELP_EVENTS.${e}`)
  }
})

test('the widget sends topic IDS, never the question text', () => {
  // The text is capped at 64 chars by the API and changes with every copy edit;
  // an id does neither. Guard both ends: the widget must pass `t.id`, and no
  // question's text may accidentally be a legal id.
  const widget = readFileSync(join(ROOT, 'components/HelpWidget.tsx'), 'utf8')
  assert.match(widget, /q:\s*t\.id/, 'the widget sends something other than the topic id')
  assert.ok(!/q:\s*t\.q/.test(widget), 'the widget is sending the question TEXT again')
})

test('the typed question is answered LOCALLY — no model, no API, nothing generated', () => {
  // The widget accepts free text (owner's call, 2026-08-04). What makes that
  // safe is not the absence of an input but the absence of GENERATION: every
  // reply is one of the paragraphs in lib/helpTopics, chosen by lib/helpSearch
  // in the browser. The worst case is the wrong existing answer, which a person
  // can see and reject — never a confident invention about refunds or pricing.
  //
  // So the invariant is: the only endpoint this file may call is the analytics
  // beacon. An answer must never arrive over the network.
  const widget = readFileSync(join(ROOT, 'components/HelpWidget.tsx'), 'utf8')
  assert.match(widget, /from '@\/lib\/helpSearch'/, 'the widget no longer uses the local matcher')

  // The invariant is „no ANSWER comes over the network", not „no request ever".
  // So this is an ALLOW-LIST, and each entry is here because it demonstrably
  // cannot produce a reply:
  //   /api/help/message → sends the person's problem TO a human. One direction;
  //                       its response is `{ok:true}` and is never rendered as
  //                       an answer.
  //   /api/events       → the analytics beacon, fire-and-forget.
  // Anything else — an /api/chat, an /api/ai, a proxy — must fail this test,
  // because that is exactly how „it only summarises the FAQ" becomes a model
  // inventing a refund policy.
  const ALLOWED = ['/api/help/message', '/api/events']
  const endpoints = [...widget.matchAll(/fetch\(\s*['"`]([^'"`]+)/g)].map(m => m[1])
  const rogue = endpoints.filter(e => !ALLOWED.includes(e))
  assert.deepEqual(rogue, [], `the widget fetches an endpoint that could answer for it: ${rogue.join(', ')}`)
  for (const bad of ['anthropic', 'openai', 'api.', '/api/chat', '/api/ai', 'completions']) {
    assert.ok(!widget.includes(bad), `the widget reaches for '${bad}' — answers must be local`)
  }
  assert.match(widget, /ვერ ვიპოვე პასუხი/, 'the escape hatch to a human disappeared')
  // And the honest third outcome must still be reachable in the UI.
  assert.match(widget, /bot-none/, 'the „I have no answer for this" branch is gone')
})

test('the unanswered bubble opens a form to a HUMAN, in the thread', () => {
  // It used to link to /contact. A page change at the moment somebody is
  // already stuck is where the report was lost — they are mid-typing, so the
  // form belongs where they already are.
  const widget = readFileSync(join(ROOT, 'components/HelpWidget.tsx'), 'utf8')
  assert.match(widget, /'\/api\/help\/message'/, 'the in-chat problem form is gone')
  assert.match(widget, /<textarea/, 'there is no box to describe the problem in')
  // Never claim delivery before the server confirms the row exists.
  assert.match(widget, /setMsgState\('sent'\)/)
  const sentIdx = widget.indexOf("setMsgState('sent')")
  const guardIdx = widget.indexOf("if (!res.ok || !j?.ok) { setMsgState('error'); return }")
  assert.ok(guardIdx > 0 && guardIdx < sentIdx,
    'the widget says „sent" without checking the server answered ok')
})

test('a typed question is redacted before it is recorded, and only when unanswered', () => {
  const widget = readFileSync(join(ROOT, 'components/HelpWidget.tsx'), 'utf8')
  // The ONLY trackHelp call that may carry `text` is the unanswered one.
  const textCalls = [...widget.matchAll(/trackHelp\(([^)]*text[^)]*)\)/g)].map(m => m[1])
  assert.equal(textCalls.length, 1, `expected exactly one text-carrying event, got ${textCalls.length}`)
  assert.match(textCalls[0], /HELP_EVENTS\.unanswered/, '`text` is attached to the wrong event')
  assert.match(textCalls[0], /redactQuery\(/, 'the typed question is sent without redaction')
  // And the person is told, in the panel, before they type.
  assert.match(widget, /კითხვას ვინახავ/, 'the disclosure under the input is gone')
})

test('the `text` prop is accepted ONLY on help_unanswered', () => {
  // The one deliberate hole in the free-text firewall. If it widens to a second
  // event, words a user typed start arriving under events that promise facts.
  const good = parseEventBody({ name: HELP_EVENTS.unanswered, props: { route: '/', text: 'რა ღირს ჩინური' } })
  assert.equal(good.ok, true, `the unanswered event is rejected: ${good.ok ? '' : good.reason}`)

  for (const name of [HELP_EVENTS.opened, HELP_EVENTS.question, HELP_EVENTS.unresolved, 'booking_flow_opened']) {
    const r = parseEventBody({ name, props: { route: '/', flowId: 'abcd1234', text: 'თავისუფალი ტექსტი' } })
    assert.equal(r.ok, false, `'${name}' accepted a free-text prop — the firewall is open`)
  }
  // Bounded: no pasted document, no empty row.
  assert.equal(parseEventBody({ name: HELP_EVENTS.unanswered, props: { text: 'ა'.repeat(121) } }).ok, false,
    'an over-long question is accepted')
  assert.equal(parseEventBody({ name: HELP_EVENTS.unanswered, props: { text: '   ' } }).ok, false,
    'a blank question is stored as a row')
})

test('the „წერს…" beat stays a beat, and reduced motion skips it entirely', () => {
  // Faking thinking time on an answer that is already written is time taken
  // from someone who came here stuck. Cap it, and never make a person with
  // prefers-reduced-motion wait for a fake.
  const widget = readFileSync(join(ROOT, 'components/HelpWidget.tsx'), 'utf8')
  const ms = Number(widget.match(/const TYPING_MS = (\d+)/)?.[1])
  assert.ok(Number.isFinite(ms), 'TYPING_MS is gone — was the typing beat rewritten?')
  assert.ok(ms <= 300, `the typing beat is ${ms}ms; anything over 300 is theatre`)
  assert.match(widget, /prefers-reduced-motion/, 'the typing beat ignores prefers-reduced-motion')
  // Frozen motion must not be the only carrier of „working" (the spinner rule).
  assert.match(widget, /წერს…/, 'the typing state has no words, only movement')
})

test('every answer action is internal and role-honest', () => {
  for (const t of ALL_TOPICS) {
    const a = t.action
    if (!a) continue
    assert.ok(a.href.startsWith('/') && !a.href.startsWith('//'),
      `topic '${t.id}' action leaves the site: ${a.href}`)
    assert.ok(a.label.trim().length > 2, `topic '${t.id}' has an empty action label`)
    // The role-correctness rule: an apply CTA may never be shown to someone who
    // is already an expert, so /join actions must be gated.
    if (a.href.startsWith('/join')) {
      assert.equal(a.gate, 'apply', `topic '${t.id}' points at /join without gate: 'apply'`)
    }
    // /settings bounces an anonymous visitor to /signin — a dead end dressed
    // as an answer.
    if (a.href.startsWith('/settings')) {
      assert.equal(a.gate, 'auth', `topic '${t.id}' points at /settings without gate: 'auth'`)
    }
  }
  // And the widget must actually apply both gates rather than just carrying them.
  const widget = readFileSync(join(ROOT, 'components/HelpWidget.tsx'), 'utf8')
  // Capabilities since 2026-08-19 (a master keeps role CLIENT — the role gate
  // invited providers to become providers). Same contract: the gate is applied.
  assert.match(widget, /showJoinInvite/, 'the widget renders apply actions without the join gate')
  assert.match(widget, /gate === 'auth'/, 'the widget renders auth-only actions to anonymous visitors')
})

test('every topic id is unique, stable-looking and route-map complete', () => {
  const ids = ALL_TOPICS.map(t => t.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate topic ids')
  for (const id of ids) assert.match(id, /^[a-z0-9-]{2,40}$/, `id '${id}' is not a slug`)
  // The route map now points at ids. An id that matches nothing would silently
  // drop that lead entry — the same failure the old text-prefix map had.
  const leads = [...source.matchAll(/lead: \[([^\]]+)\]/g)]
    .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))
  const orphans = leads.filter(id => !ids.includes(id))
  assert.deepEqual(orphans, [], `route-map ids that match no question: ${orphans.join(', ')}`)
})
