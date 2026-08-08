// Unit tests for the booking-funnel instrumentation contract
// (components/booking/funnelEvents.ts) — the validation POST /api/events runs
// on every unauthenticated write.
//
// Run: npx tsx tests/bookingFunnelEvents.test.ts
//
// Pure unit test (no browser, no dev server, no DB), in the style of
// tests/availability.test.ts. The local dev server does not run on this machine
// (Node 26 vs Next 15.5), so the endpoint's *decisions* are pinned here rather
// than by poking a live route. What it locks down:
//
//   1. NAME ALLOW-LIST — only the seven funnel constants are writable. A client
//      must never be able to name a row, or the table becomes an open dumping
//      ground and the funnel becomes unreadable.
//   2. PROPS BOUNDING — allow-listed keys, scalars only, hard caps. Nesting,
//      arrays, unknown keys and oversized strings are refused, not trimmed.
//   3. THE FREE-TEXT FIREWALL — the two string props are regex-constrained
//      (flowId, code); every other key is refused when given a string. This is
//      what makes it structurally impossible to log the intake — someone's
//      words about a personal problem — even by mistake.
//   4. REJECT PATH — every refusal returns ok:false with a reason, so the route
//      answers a plain 400 and never a half-written row.
//
// Deterministic: no Math.random(), no clock reads except through explicit
// `now` arguments.

import {
  BOOKING_FUNNEL_EVENTS,
  BOOKING_FUNNEL_EVENT_NAMES,
  BOOKING_FUNNEL_PROP_KEYS,
  MAX_PROP_KEYS,
  MAX_PROP_STRING,
  MAX_BODY_CHARS,
  FLOW_ID_RE,
  parseEventBody,
  newFlowId,
  leadDays,
  trackFunnel,
} from '../components/booking/funnelEvents'

/* ───── tiny assert harness (✓/✗, exit 1 on failure — matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const FLOW = 'a1b2c3d4e5f60718' // 16 hex chars — a realistic newFlowId() output
const ok = (raw: unknown) => parseEventBody(raw).ok
const reason = (raw: unknown) => {
  const r = parseEventBody(raw)
  return r.ok ? '(accepted)' : r.reason
}

/* ───── 1. the name allow-list ───── */

for (const name of BOOKING_FUNNEL_EVENT_NAMES) {
  check(`name allow-list: accepts ${name}`, ok({ name, props: { flowId: FLOW } }))
}

check('name allow-list: exactly seven events',
  BOOKING_FUNNEL_EVENT_NAMES.length === 7, String(BOOKING_FUNNEL_EVENT_NAMES.length))

check('name allow-list: no duplicate names',
  new Set(BOOKING_FUNNEL_EVENT_NAMES).size === BOOKING_FUNNEL_EVENT_NAMES.length)

// The whole point: a client cannot mint a row name.
for (const bad of [
  'booking_flow_opened_', 'BOOKING_FLOW_OPENED', 'signup_completed', 'admin_promoted',
  'drop table', '', 'booking_', 'user_password_reset',
]) {
  check(`name allow-list: rejects "${bad}"`, !ok({ name: bad, props: { flowId: FLOW } }),
    reason({ name: bad, props: { flowId: FLOW } }))
}

check('name allow-list: rejects a non-string name',
  !ok({ name: 42, props: { flowId: FLOW } }))
check('name allow-list: rejects a missing name',
  !ok({ props: { flowId: FLOW } }))
check('name allow-list: rejects an object name (no coercion)',
  !ok({ name: { toString: () => BOOKING_FUNNEL_EVENTS.opened }, props: { flowId: FLOW } }))

/* ───── 2. body shape ───── */

const OPENED = BOOKING_FUNNEL_EVENTS.opened

check('body: rejects null', !ok(null))
check('body: rejects an array', !ok([{ name: OPENED, props: { flowId: FLOW } }]))
check('body: rejects a bare string', !ok('booking_flow_opened'))
check('body: rejects a number', !ok(7))
check('body: props may be omitted only if… it cannot — flowId is mandatory',
  !ok({ name: OPENED }), reason({ name: OPENED }))
check('body: rejects array props', !ok({ name: OPENED, props: [1, 2, 3] }))
check('body: rejects null props', !ok({ name: OPENED, props: null }))

/* ───── 3. the flow id — the stitching key ───── */

check('flowId: required (a row with no flowId cannot be stitched to an attempt)',
  !ok({ name: OPENED, props: { durationMin: 60 } }), reason({ name: OPENED, props: { durationMin: 60 } }))
check('flowId: accepts 8 chars (lower bound)', ok({ name: OPENED, props: { flowId: 'abcd1234' } }))
check('flowId: accepts 32 chars (upper bound)', ok({ name: OPENED, props: { flowId: 'a'.repeat(32) } }))
check('flowId: rejects 7 chars', !ok({ name: OPENED, props: { flowId: 'abcd123' } }))
check('flowId: rejects 33 chars', !ok({ name: OPENED, props: { flowId: 'a'.repeat(33) } }))
check('flowId: rejects uppercase/punctuation (no smuggling)',
  !ok({ name: OPENED, props: { flowId: 'ABCD-1234' } }))
check('flowId: rejects an email shaped value (no PII through the id)',
  !ok({ name: OPENED, props: { flowId: 'someone@example.com' } }))
check('flowId: rejects a number', !ok({ name: OPENED, props: { flowId: 12345678 } }))

// newFlowId() must satisfy the very regex the server enforces, or every event
// the flow emits would silently 400.
const ids = Array.from({ length: 200 }, () => newFlowId())
check('newFlowId: every generated id passes FLOW_ID_RE',
  ids.every(id => FLOW_ID_RE.test(id)), ids.find(id => !FLOW_ID_RE.test(id)))
check('newFlowId: ids are distinct (200 draws, no collision)',
  new Set(ids).size === 200, String(new Set(ids).size))
check('newFlowId: round-trips through the parser',
  ids.every(id => ok({ name: OPENED, props: { flowId: id } })))

/* ───── 4. prop keys — allow-list, not a size cap ───── */

for (const k of BOOKING_FUNNEL_PROP_KEYS) {
  // Give each key a value of a type it is allowed to carry.
  const v: string | number | boolean =
    k === 'flowId' ? FLOW : k === 'code' ? 'SLOT_TAKEN' : 1
  const body = { name: OPENED, props: { flowId: FLOW, [k]: v } }
  check(`prop key: accepts "${k}"`, ok(body), reason(body))
}

for (const k of ['goal', 'notes', 'topic', 'email', 'userId', 'name', '__proto__', 'studentNotes']) {
  const body = { name: OPENED, props: { flowId: FLOW, [k]: 'anything' } }
  check(`prop key: rejects "${k}"`, !ok(body), reason(body))
}

check('prop keys: caps the count',
  MAX_PROP_KEYS === 16 && !ok({
    name: OPENED,
    props: Object.fromEntries([['flowId', FLOW], ...Array.from({ length: MAX_PROP_KEYS }, (_, i) => [`k${i}`, 1])]),
  }))

/* ───── 5. prop values — scalars only, and the free-text firewall ───── */

check('prop value: accepts booleans', ok({ name: OPENED, props: { flowId: FLOW, preloaded: true } }))
check('prop value: accepts numbers', ok({ name: OPENED, props: { flowId: FLOW, notesLen: 137 } }))
check('prop value: accepts zero', ok({ name: OPENED, props: { flowId: FLOW, leadDays: 0 } }))

check('prop value: rejects NaN', !ok({ name: OPENED, props: { flowId: FLOW, leadDays: NaN } }))
check('prop value: rejects Infinity', !ok({ name: OPENED, props: { flowId: FLOW, leadDays: Infinity } }))
check('prop value: rejects an absurd magnitude', !ok({ name: OPENED, props: { flowId: FLOW, priceGel: 1e12 } }))
check('prop value: rejects null', !ok({ name: OPENED, props: { flowId: FLOW, tierCount: null } }))
check('prop value: rejects a nested object', !ok({ name: OPENED, props: { flowId: FLOW, tierCount: { a: 1 } } }))
check('prop value: rejects an array', !ok({ name: OPENED, props: { flowId: FLOW, tierCount: [1] } }))

// THE point: a numeric-by-contract key given a string is refused outright, so
// there is no key through which the user's own words could arrive.
check('free-text firewall: notesLen cannot carry a string',
  !ok({ name: OPENED, props: { flowId: FLOW, notesLen: 'დამეხმარე ბიზნესის გაყიდვაში' } }),
  reason({ name: OPENED, props: { flowId: FLOW, notesLen: 'x' } }))
check('free-text firewall: topicCustom cannot carry a string',
  !ok({ name: OPENED, props: { flowId: FLOW, topicCustom: 'სხვა თემა' } }))
check('free-text firewall: durationMin cannot carry a string',
  !ok({ name: OPENED, props: { flowId: FLOW, durationMin: '60' } }))

/* ───── 6. the error code — the failure terminal's payload ───── */

const FAILED = BOOKING_FUNNEL_EVENTS.failed
for (const code of ['SLOT_TAKEN', 'NO_AVAILABILITY', 'UNAUTHENTICATED', 'NETWORK', 'UNKNOWN', 'PAST_LOCAL']) {
  check(`code: accepts ${code}`, ok({ name: FAILED, props: { flowId: FLOW, code } }),
    reason({ name: FAILED, props: { flowId: FLOW, code } }))
}
check('code: rejects a sentence (codes are constants, not prose)',
  !ok({ name: FAILED, props: { flowId: FLOW, code: 'ეს დრო დაიკავეს — აირჩიე სხვა.' } }))
check('code: rejects punctuation/markup',
  !ok({ name: FAILED, props: { flowId: FLOW, code: '<script>alert(1)</script>' } }))
check('code: rejects an over-long value',
  !ok({ name: FAILED, props: { flowId: FLOW, code: 'A'.repeat(41) } }))
check('code: string cap sits below the key cap',
  MAX_PROP_STRING === 64 && MAX_PROP_STRING < MAX_BODY_CHARS)

/* ───── 7. accepted rows carry ONLY what was allow-listed ───── */

const good = parseEventBody({
  name: BOOKING_FUNNEL_EVENTS.created,
  props: { flowId: FLOW, tierCount: 3, durationMin: 60, priceGel: 120, leadDays: 4 },
})
check('accepted: returns the parsed name', good.ok && good.name === 'booking_created')
check('accepted: returns exactly the five props',
  good.ok && Object.keys(good.props).sort().join(',') === 'durationMin,flowId,leadDays,priceGel,tierCount',
  good.ok ? Object.keys(good.props).join(',') : '')
check('accepted: values survive unchanged',
  good.ok && good.props.priceGel === 120 && good.props.tierCount === 3)

/* ───── 8. leadDays — coarse, non-identifying, never negative ───── */

const T0 = Date.UTC(2026, 6, 28, 12, 0, 0)
check('leadDays: same instant → 0', leadDays(new Date(T0), T0) === 0)
check('leadDays: +2 days → 2', leadDays(new Date(T0 + 2 * 86_400_000), T0) === 2)
check('leadDays: +36h rounds to 2 (whole days only)',
  leadDays(new Date(T0 + 36 * 3_600_000), T0) === 2, String(leadDays(new Date(T0 + 36 * 3_600_000), T0)))
check('leadDays: a past start clamps to 0 (never negative)',
  leadDays(new Date(T0 - 5 * 86_400_000), T0) === 0)

/* ───── 9. the emitter is inert off-browser and never throws ───── */

let threw = false
try {
  // No `window` under tsx → must be a silent no-op, not a crash.
  trackFunnel(BOOKING_FUNNEL_EVENTS.opened, { flowId: FLOW })
} catch {
  threw = true
}
check('trackFunnel: no-ops outside the browser instead of throwing', !threw)

/* ───── summary ───── */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
