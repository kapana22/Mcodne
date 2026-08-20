// THE TWO DOORS — lib/requestTopics' vertical split, executed.
//
// Run: npx tsx --test tests/verticals.test.ts   (also in `npm run check`)
//
// WHY THIS FILE EXISTS. The split is a UI narrowing over ONE intake: the entry
// door decides which half of the catalogue is drawn, and after that everything
// is the same wizard, the same ServiceRequest row, the same admin queue. That
// shape has exactly two failure modes and neither one raises anything:
//
//   · THE LISTS BLUR. A trade drawn on the expert door, or a school subject on
//     the trades door, is the confusion the owner asked us to remove („მკვეთრად
//     უნდა გაიმიჯნოს, რომ ესენი არ აირიოს") — and it comes back silently,
//     because both lists are derived from `kinds` and a single edit to a
//     group's `kinds` moves it across the page with no other symptom.
//   · THE SPLIT LEAKS INWARDS. If the narrowing ever reaches the matcher, a
//     person who types „დალაგება" on the expert side stops being filed under
//     cleaning and their request is simply lost. A separation that loses a
//     request is worse than the confusion it fixed — see the comment on
//     VERTICALS, which is what §G is written from.
//
// tests/serviceProfile.test.ts §L makes the sibling argument for the launch
// gate (what is OFFERED vs what is UNDERSTOOD); this file is about which SIDE
// of the page a thing is offered on.

import test from 'node:test'
import assert from 'node:assert/strict'
import { routeRequest } from '../lib/requestRouting'
import { HOME_TRADES, HOME_TRADE_IDS, isKnownServiceTopic } from '../lib/serviceMarks'

import {
  VERTICALS, isVertical, browseGroupsFor, verticalOfTopic,
  VERTICAL_COPY, suggestedFor,
  SERVICE_BROWSE_GROUPS, EXPERT_BROWSE_GROUPS, BROWSABLE_GROUPS,
  groupIsService, LIVE_SERVICE_GROUP_IDS,
  TOPIC_GROUPS, searchAllTopics, topicById,
  type Vertical, type TopicGroup,
} from '../lib/requestTopics'
import { checkGeorgianCopy } from '../lib/georgianOrthography'

const idsOf = (gs: TopicGroup[]) => gs.map(g => g.id)
const sorted = (xs: string[]) => [...xs].sort()

/* ═══════════ A. the two lists ARE the catalogue, exactly once ═══════════ */

test('§A every browsable group is on exactly one door', () => {
  const service = idsOf(SERVICE_BROWSE_GROUPS)
  const expert = idsOf(EXPERT_BROWSE_GROUPS)
  const browsable = idsOf(BROWSABLE_GROUPS)

  assert.ok(service.length > 0, 'the trades door draws nothing')
  assert.ok(expert.length > 0, 'the expert door draws nothing')

  // ⚠️ SET ARITHMETIC, NOT A COUNT. Pinning „4 and 23" would fail the day a
  // group is legitimately added and would say nothing about the property that
  // matters. The property is a PARTITION.
  const union = new Set([...service, ...expert])

  // ON BOTH DOORS: the same group drawn twice. Nothing errors — the person
  // simply meets „სანტექნიკა" in a list that promised them consultants, which
  // is precisely the mixing the split exists to end.
  assert.equal(union.size, service.length + expert.length,
    `a group is on both doors: ${service.filter(id => expert.includes(id)).join(', ')}`)

  // ON NEITHER DOOR: a live group nobody can reach. It is not in the accordion,
  // so the only way to that topic is typing its exact name — the group is
  // effectively deleted from the product while still costing us a place in
  // every list, count and test that reads the catalogue.
  assert.deepEqual(sorted([...union]), sorted(browsable),
    'the two doors do not add up to BROWSABLE_GROUPS — a group is drawn nowhere, or one is drawn that is not browsable')

  // …and the accessor a screen actually calls must return the same two lists.
  assert.deepEqual(idsOf(browseGroupsFor('SERVICE')), service)
  assert.deepEqual(idsOf(browseGroupsFor('EXPERT')), expert)
})

/* ═══════════ B. no trade on the expert door, no expert on the trades ════ */

test('§B every topic on a door belongs to that door’s vertical', () => {
  // ⚠️ THIS IS THE ASSERTION THAT CATCHES `kinds: S` ADDED TO AN EXPERT GROUP.
  // Both lists are derived from `kinds`, so that one edit silently moves an
  // entire group — „ფსიქოლოგია" would appear under „ხელოსანი მოვა", priced per
  // visit, asking for an address. Walking the TOPICS rather than the groups is
  // deliberate: `verticalOfTopic` is what the screen reads once the search box
  // has crossed the line, and it is a separate lookup that can disagree.
  for (const g of SERVICE_BROWSE_GROUPS) {
    assert.ok(groupIsService(g), `„${g.label}" is on the trades door but is not a service group`)
    for (const t of g.topics) {
      assert.equal(verticalOfTopic(t.id), 'SERVICE',
        `„${t.label}" is drawn on the trades door and resolves to the expert side`)
    }
  }
  for (const g of EXPERT_BROWSE_GROUPS) {
    assert.ok(!groupIsService(g), `„${g.label}" is on the expert door and is a trade — it asks for an address`)
    for (const t of g.topics) {
      assert.equal(verticalOfTopic(t.id), 'EXPERT',
        `„${t.label}" is drawn on the expert door and resolves to a trade`)
    }
  }

  // `verticalOfTopic` answers from the FIRST group holding the id, so two
  // groups sharing one topic id would make the answer depend on file order —
  // and the id is what the database stores. („ბუღალტერია" exists twice on
  // purpose and carries two ids, `accounting-l` and `accounting`, which is the
  // shape this check requires of every future duplicate label.)
  const all = TOPIC_GROUPS.flatMap(g => g.topics.map(t => t.id))
  const dupes = all.filter((id, i) => all.indexOf(id) !== i)
  assert.deepEqual(dupes, [], `a topic id is in two groups: ${dupes.join(', ')}`)

  // An id that is not in the catalogue is not silently assigned a side — the
  // copy would follow a vertical nothing is actually in.
  assert.equal(verticalOfTopic('not-a-topic'), null)
  assert.equal(verticalOfTopic(null), null)
  // „სხვა" is in no group by design (it is the escape hatch), so it has no
  // vertical either — the door it was tapped on keeps its own copy.
  assert.equal(verticalOfTopic('other'), null)
})

/* ═══════════ C. the trades door only offers OPEN trades ════════════════ */

test('§C the trades door draws nothing but the live groups', () => {
  // A closed group on this door is a promise of work nobody can do: the client
  // describes a job, waits, and hears nothing — and they do not conclude that
  // one category is empty, they conclude the site is. See LIVE_SERVICE_GROUP_IDS.
  const live = new Set(LIVE_SERVICE_GROUP_IDS)
  for (const g of SERVICE_BROWSE_GROUPS) {
    assert.ok(live.has(g.id), `„${g.label}" is offered on the trades door and is not open for business`)
  }

  // The other direction of the same mistake, and it is just as silent: an id in
  // the launch list that matches no group opens nothing. „We opened moving" and
  // the door looks identical to the day before.
  for (const id of LIVE_SERVICE_GROUP_IDS) {
    assert.ok(SERVICE_BROWSE_GROUPS.some(g => g.id === id),
      `„${id}" is listed as live but no group by that id is drawn — a typo opens nothing`)
  }
})

/* ═══════════ D. every door can speak ═══════════════════════════════════ */

test('§D every vertical has complete copy and every chip resolves', () => {
  for (const v of VERTICALS) {
    const c = VERTICAL_COPY[v]
    assert.ok(c, `${v} has no copy at all — the door renders blank`)
    // Each of the four is a visible sentence on the first screen a visitor
    // meets. An empty one is not an error, it is a heading that is just gone.
    for (const field of ['label', 'title', 'hint', 'placeholder'] as const) {
      assert.equal(typeof c[field], 'string', `${v}.${field} is not a string`)
      assert.ok(c[field].trim().length > 0, `${v}.${field} is empty — the door ships a blank ${field}`)
    }

    // ⚠️ THE CHIP ROW SHRINKS IN SILENCE. `suggestedFor` FILTERS rather than
    // throws, and it has to: this module is in middleware's import graph, so a
    // module-load throw over a renamed topic takes down every route on the
    // site. The cost of the filter is that a dead id costs one chip and nothing
    // reports it — the row is simply shorter, on a screen nobody has a baseline
    // for. This is where that is caught instead.
    const resolved = suggestedFor(v)
    const missing = c.suggested.filter(id => !resolved.some(t => t.id === id))
    assert.deepEqual(missing, [],
      `${v}: these suggested chips no longer resolve to a topic: ${missing.join(', ')}`)
    assert.equal(resolved.length, c.suggested.length)
    assert.ok(resolved.length > 0, `${v} opens with no examples — the blank start this row exists to fix`)
  }
})

/* ═══════════ E. the chips belong to the door they sit on ═══════════════ */

test('§E every suggested chip is of its own vertical, and open', () => {
  for (const v of VERTICALS) {
    for (const t of suggestedFor(v)) {
      // A „ბინის დალაგება" chip on the expert door is the mixing the whole
      // split exists to stop, and it would be made in the most prominent place
      // on the screen — the one row a visitor reads before anything is typed.
      assert.equal(verticalOfTopic(t.id), v,
        `„${t.label}" is a ${verticalOfTopic(t.id)} topic and it is the first thing on the ${v} door`)

      // …and it must point into a group that door actually draws. A chip into a
      // closed trade is the §C promise made in that same prominent place, where
      // it is not even reachable by browsing afterwards.
      assert.ok(browseGroupsFor(v).some(g => g.topics.some(x => x.id === t.id)),
        `„${t.label}" is a chip on the ${v} door and its group is not offered there`)
    }
  }
})

/* ═══════════ F. the door parameter is somebody else’s input ════════════ */

test('§F isVertical refuses anything that is not one of the two', () => {
  // This guards a URL parameter anybody can craft. A permissive check hands a
  // crafted value straight to `VERTICAL_COPY[v]` and `browseGroupsFor(v)` —
  // undefined copy, a blank screen, and with „__proto__" something worse than
  // blank. It is also what a stale link with the old capitalisation hits.
  for (const v of VERTICALS) assert.ok(isVertical(v), `${v} is in VERTICALS and fails its own guard`)

  for (const junk of [
    '', ' ', 'service', 'expert', 'SERVICES', 'EXPERTS', 'SERVICE ', 'Service',
    'both', 'ALL', '__proto__', 'constructor', 'toString', '0', 'null', 'undefined',
  ]) {
    assert.equal(isVertical(junk), false, `isVertical accepted „${junk}"`)
  }
  assert.equal(isVertical(null), false)
  assert.equal(isVertical(undefined), false)
})

/* ═══════════ G. THE NET — the split is UI only ═════════════════════════ */

test('§G search still crosses the line, in both directions', () => {
  // ⚠️ THE MOST IMPORTANT TEST IN THIS FILE, and the reason is on VERTICALS:
  // the door narrows what is OFFERED and touches nothing that is stored or
  // matched. If `searchAllTopics` is ever filtered by vertical, somebody who
  // came through the expert door and typed „დალაგება" stops being filed under
  // cleaning — no error, no empty state worth noticing, the request simply
  // never reaches the queue. A separation that loses a request is worse than
  // the confusion it fixed.
  const found = (q: string) => searchAllTopics(q, 24).map(h => h.topic.id)

  const CROSSING: [string, string][] = [
    ['დალაგება', 'clean-flat'],      // a trade word, typed by whoever
    ['სანტექნიკოსი', 'plumb-leak'],  // the trade's own name, which is what people type
    ['მათემატიკა', 'math'],          // a school subject
    ['ინგლისური', 'english'],
    ['იურისტი', 'contract'],         // reached through `alt`, not the label
    ['ბუღალტერია', 'accounting'],
  ]
  for (const [query, expected] of CROSSING) {
    assert.ok(found(query).includes(expected),
      `„${query}" no longer finds ${expected} — one search box, or the request is lost`)
  }

  // Stated as the property rather than as six examples: ONE query set reaches
  // BOTH verticals. A filter added anywhere in the search path makes exactly
  // half of this go quiet.
  const verticals = new Set(
    CROSSING.flatMap(([q]) => found(q)).map(id => verticalOfTopic(id)),
  )
  assert.ok(verticals.has('SERVICE') && verticals.has('EXPERT'),
    `one query set reached only ${[...verticals].join(', ')} — search is being filtered by vertical`)

  // And the SAME distinction the gate makes: what is not OFFERED is still
  // UNDERSTOOD. „მათემატიკა" belongs to a group no door draws since 2026-08-20
  // (DORMANT_GROUP_IDS — positioning, not staffing), and it must still land on
  // its own topic rather than dissolve into „სხვა". That row is the signal that
  // says what people are asking for that the site has decided not to sell yet;
  // losing it means deciding blind next time.
  //
  // ⚠️ THE FIXTURE MOVED FROM `rep-door` TO `math` because the repairs group
  // was OPENED that same day. Do not delete this assertion when its topic
  // opens — point it at whatever is closed then; the property is the gate, not
  // the example.
  const closed = found('მათემატიკა')
  assert.ok(closed.includes('math'),
    'a closed group stopped being matched — the gate leaked out of the picker and into the vocabulary')
  assert.ok(!BROWSABLE_GROUPS.some(g => g.topics.some(t => t.id === 'math')),
    'math became browsable — pick another closed topic for this assertion, do not delete it')
  assert.ok(topicById('rep-door'), 'rep-door left the catalogue')
})

/* ═══════════ H. the words themselves ═══════════════════════════════════ */

test('§H the door copy is written in Georgian punctuation', () => {
  // Same argument as tests/georgianOrthography.test.ts: none of this is visible
  // to tsc or to the build — the page renders, only the language is wrong. And
  // these particular strings are the first sentence of the product, printed
  // above everything else on the entry screen.
  for (const v of VERTICALS) {
    const c = VERTICAL_COPY[v]
    for (const field of ['label', 'title', 'hint', 'placeholder'] as const) {
      const s = c[field]

      // An ASCII " in our own copy is either a stray straight quote or a „
      // closed the English way. Georgian uses „…“ and nothing here needs a " at
      // all, so the flat rule is the readable one.
      assert.ok(!s.includes('"'), `${v}.${field} carries an ASCII double quote: ${s}`)

      // The shared rule, so this file and the CMS door judge the same string
      // the same way rather than forking the pattern.
      const bad = checkGeorgianCopy(s).filter(x => x.id === 'ascii-close-quote')
      assert.deepEqual(bad, [], `${v}.${field}: ${bad.map(x => x.fix).join('; ')}`)

      // Every „ that is opened is closed with “ (U+201C) — an unclosed one
      // reads as a typo in the biggest text on the screen.
      const open = (s.match(/„/g) ?? []).length
      const close = (s.match(/“/g) ?? []).length
      assert.equal(open, close, `${v}.${field} opens ${open} „ and closes ${close} “: ${s}`)
    }
  }
})

/* ═══════════ §I the home trades row ═════════════════════════════════════ */
// The six tiles on the front page. Every failure mode here is silent: a renamed
// topic makes a tile vanish, a closed one makes it a promise of work nobody can
// do, and a repeated icon makes two tiles read as one thing — none of which
// errors, and none of which anybody would notice from the code.

test('§I every home trade tile names a real, OPEN service topic', () => {
  for (const id of HOME_TRADE_IDS) {
    assert.ok(isKnownServiceTopic(id),
      `„${id}" is not a service topic at all — it was renamed or retired, and the tile silently disappeared from the home page`)
  }
  // Closed is a decision and the filter handles it; the row must still be full.
  assert.equal(HOME_TRADES.length, HOME_TRADE_IDS.length,
    `${HOME_TRADE_IDS.length - HOME_TRADES.length} of the home tiles point at a CLOSED trade — the front page is promising work nobody can be routed`)
})

test('§I the row is six tiles', () => {
  // Owner asked for six („გაფართოვდეს, 6 რომ იყოს მაგალითად") and the layout is
  // built on it: lg:grid-cols-6 is one clean row, and grid-cols-2 on a phone is
  // three clean rows. Five or seven leaves a ragged last row on every breakpoint.
  assert.equal(HOME_TRADES.length, 6)
})

test('§I no two tiles draw the same mark', () => {
  // components/Icon → CatIcon's own header records fourteen spheres sharing
  // seven drawings, found only by counting. Six tiles side by side in one row
  // is where that failure is most visible, so it is asserted rather than
  // trusted.
  const seen = new Map<string, string>()
  for (const m of HOME_TRADES) {
    const prev = seen.get(m.icon)
    assert.equal(prev, undefined,
      `„${m.topic}" and „${prev}" both draw „${m.icon}" — on a row of six the eye reads them as one thing`)
    seen.set(m.icon, m.topic)
  }
})

test('§I every tile is a SERVICE topic, never an expert one', () => {
  // The row sits on a page that also carries the expert sphere grid, and its
  // links all set `for=service`. A tutoring topic in here would open the trades
  // door onto a catalogue that does not contain it.
  for (const m of HOME_TRADES) {
    assert.equal(verticalOfTopic(m.topic), 'SERVICE',
      `„${m.topic}" is on the trades row but is not a trade`)
  }
})

/* ═══════════ §J the trades are ROUTED, not broadcast ════════════════════ */
// ⚠️ MEASURED FAILURE, 2026-08-18. A Tbilisi flat-cleaning request was mailed
// to ALL SIX allowlisted providers — the Batumi electrician, the appliance
// repairman and the plumber included. Cause: `routeRequest` matched on
// `categoryId`, a trades request has none (the sphere table is the EXPERT
// taxonomy and no service topic maps into it), so every single one fell through
// to the EVERYONE fallback.
//
// lib/requestJobs opens by saying it exists so this platform is not the
// lead-mill whose providers drown in work they cannot do. The trades path was
// exactly that. Harmless at five masters; fatal at fifty, and it fails silently
// in both directions — nothing reports „that mail was useless".

const P = (userId: string, services: string[], areas: string[]) =>
  ({ userId, categoryId: null, services, areas })

test('§J a trades request reaches only the masters who cover it', () => {
  const providers = [
    P('cleaner-tbilisi', ['clean-flat', 'clean-deep'], ['TBILISI']),
    P('cleaner-batumi', ['clean-flat'], ['BATUMI']),
    P('plumber', ['plumb-leak'], ['TBILISI']),
    { userId: 'expert', categoryId: 'cat-law' },
  ]
  const r = routeRequest(null, providers, { topic: 'clean-flat', city: 'TBILISI' })
  assert.equal(r.audience, 'TARGETED',
    'a trades request is being broadcast again — every provider gets every job')
  assert.deepEqual(r.recipients, ['cleaner-tbilisi'],
    `wrong audience: ${r.recipients.join(', ')}`)
})

test('§J a city the master does not travel to is not their work', () => {
  const providers = [P('a', ['clean-flat'], ['BATUMI'])]
  // Nobody covers it → the fallback, deliberately: silence would teach us
  // nothing about demand we cannot serve. See routeRequest's header.
  const r = routeRequest(null, providers, { topic: 'clean-flat', city: 'TBILISI' })
  assert.equal(r.audience, 'EVERYONE')
})

test('§J a master with no cities is matched on trade alone', () => {
  // An empty `areas` is „I have not said", not „nowhere". A profile written
  // before the column existed must not become unroutable because of it.
  const providers = [P('a', ['plumb-leak'], [])]
  const r = routeRequest(null, providers, { topic: 'plumb-leak', city: 'KUTAISI' })
  assert.deepEqual(r.recipients, ['a'])
})

test('§J the expert path is untouched', () => {
  // The sphere match must keep working exactly as it did — this change adds a
  // branch in front of it, and a regression here would silently unfile every
  // consultation on the platform.
  const providers = [
    { userId: 'lawyer', categoryId: 'cat-law' },
    { userId: 'accountant', categoryId: 'cat-fin' },
  ]
  assert.deepEqual(routeRequest('cat-law', providers).recipients, ['lawyer'])
  assert.equal(routeRequest(null, providers).audience, 'EVERYONE')
  // …and a topic nobody lists does not hijack the sphere match.
  const mixed = routeRequest('cat-law', providers, { topic: 'clean-flat', city: 'TBILISI' })
  assert.deepEqual(mixed.recipients, ['lawyer'])
})
