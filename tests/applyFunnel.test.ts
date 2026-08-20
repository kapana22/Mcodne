// Guards the browser→server event contract for BOTH funnels.
//
// Run: npx tsx tests/applyFunnel.test.ts
//
// `/api/events` is an UNAUTHENTICATED write, and its only defence is
// `parseEventBody`: a fixed name allow-list plus allow-listed scalar prop keys.
// Adding the apply funnel widened both lists, so these pins exist to prove the
// widening did not open the door — and to catch the two mistakes that were
// actually made while building it:
//
//   1. `newApplyFlowId()` first returned `crypto.randomUUID()`. `FLOW_ID_RE` is
//      `^[a-z0-9]{8,32}$`, so the hyphens failed validation and EVERY apply
//      event was rejected at the API. The funnel would have shipped recording
//      nothing while looking perfectly healthy.
//   2. The failure reason was first sent under a new key, `reason`. Only
//      flowId / code / tutorId may be strings — the free-text firewall — so it
//      too was silently refused. It now reuses `code`.
import { parseEventBody, BOOKING_FUNNEL_EVENTS, FLOW_ID_RE } from '../components/booking/funnelEvents'
import { APPLY_FUNNEL_EVENTS, APPLY_FUNNEL_PROP_KEYS, newApplyFlowId } from '../app/join/_expert/applyFunnelEvents'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const accepts = (body: unknown) => parseEventBody(body).ok

/* ═══════════ 1. the flowId shape IS the contract ══════════════════════════ */

{
  for (let i = 0; i < 50; i++) {
    const id = newApplyFlowId()
    if (!FLOW_ID_RE.test(id)) { check(`generated flowId matches FLOW_ID_RE`, false, id); break }
    if (i === 49) check('every generated flowId matches FLOW_ID_RE (50 samples)', true)
  }
  // The exact regression: a UUID is NOT an acceptable flowId.
  check('a hyphenated UUID is refused as a flowId (the bug)',
    !accepts({ name: APPLY_FUNNEL_EVENTS.opened, props: { flowId: '123e4567-e89b-42d3-a456-426614174000' } }))
}

/* ═══════════ 2. every apply event is accepted ════════════════════════════ */

{
  const F = newApplyFlowId()
  check('opened', accepts({ name: APPLY_FUNNEL_EVENTS.opened, props: { flowId: F, resumed: false } }))
  check('profileDone with its real props',
    accepts({ name: APPLY_FUNNEL_EVENTS.profileDone, props: { flowId: F, step: 1, catCount: 2, headlineLen: 40, bioLen: 180, hasPhone: true, hasPhoto: true, certCount: 2 } }))
  check('pricingDone with its real props',
    accepts({ name: APPLY_FUNNEL_EVENTS.pricingDone, props: { flowId: F, step: 2, serviceCount: 3, priceGel: 80 } }))
  check('submitted', accepts({ name: APPLY_FUNNEL_EVENTS.submitted, props: { flowId: F, step: 3 } }))
  check('failed carries a code', accepts({ name: APPLY_FUNNEL_EVENTS.failed, props: { flowId: F, step: 3, code: 'INVALID' } }))
  check('failed carries CLIENT_VALIDATION', accepts({ name: APPLY_FUNNEL_EVENTS.failed, props: { flowId: F, step: 3, code: 'CLIENT_VALIDATION' } }))
  check('failed carries NETWORK', accepts({ name: APPLY_FUNNEL_EVENTS.failed, props: { flowId: F, step: 3, code: 'NETWORK' } }))
}

/* ═══════════ 3. widening did not weaken the firewall ═════════════════════ */

{
  const F = newApplyFlowId()
  check('the booking funnel still passes', accepts({ name: BOOKING_FUNNEL_EVENTS.opened, props: { flowId: F } }))
  check('an invented event name is refused', !accepts({ name: 'apply_made_up', props: { flowId: F } }))
  check('an un-listed prop key is refused', !accepts({ name: APPLY_FUNNEL_EVENTS.opened, props: { flowId: F, note: 'hi' } }))
  check('FREE TEXT under a numeric key is refused',
    !accepts({ name: APPLY_FUNNEL_EVENTS.profileDone, props: { flowId: F, bioLen: 'ჩემი ბიოგრაფია' } }))
  check('a free-text `code` is refused (must be SCREAMING_SNAKE)',
    !accepts({ name: APPLY_FUNNEL_EVENTS.failed, props: { flowId: F, code: 'ჩავარდა რადგან…' } }))
  check('`reason` is not a key — it was renamed to `code`',
    !APPLY_FUNNEL_PROP_KEYS.includes('reason' as never))
  check('a missing flowId is refused', !accepts({ name: APPLY_FUNNEL_EVENTS.opened, props: { step: 1 } }))
  check('a nested object is refused', !accepts({ name: APPLY_FUNNEL_EVENTS.opened, props: { flowId: F, step: { a: 1 } } }))
  check('null props are refused', !accepts({ name: APPLY_FUNNEL_EVENTS.opened, props: null }))
}

/* ═══════════ 4. no key may carry what the applicant typed ════════════════ */

{
  // The whole privacy rule in one assertion: apart from the three
  // structurally-constrained ids, no allow-listed key accepts a string.
  const F = newApplyFlowId()
  const STRING_OK = new Set(['flowId', 'code', 'tutorId'])
  const leaks = APPLY_FUNNEL_PROP_KEYS.filter(k =>
    !STRING_OK.has(k) && accepts({ name: APPLY_FUNNEL_EVENTS.opened, props: { flowId: F, [k]: 'თავისუფალი ტექსტი' } }))
  check('no prop key accepts free text', leaks.length === 0, leaks.join(', '))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
