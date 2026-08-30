// The intake funnel — /api/admin/funnel and the „ძაბრი" tab.
// Run: npx tsx --test tests/requestFunnel.test.ts
//
// Its ancestor had no test file and the cost was six days: the booking funnel's
// admin surface was deleted 2026-08-24, the wizard kept firing its own events,
// and nothing read them until 2026-08-30. Nothing broke, because a dashboard
// with no reader looks exactly like one with no traffic. These pin the ways it
// could go quiet again while still compiling.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { REQUEST_FUNNEL_EVENTS } from '../app/request/requestFunnelEvents'
import { REQUEST_PATH_PREFIXES } from '../lib/requests'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const route = read('app/api/admin/funnel/route.ts')
const tab = read('app/admin/_funnel.tsx')
const wizard = read('app/request/RequestWizard.tsx')

/* ═══════════ A. instrument and reader stay in step ═════════════════════ */

test('§A every event the wizard can fire is known to the reader', () => {
  // The mirror of the 2026-08-24 failure: a step added to /request that never
  // reaches the funnel, invisible because the other four still draw.
  const unread = Object.entries(REQUEST_FUNNEL_EVENTS)
    .filter(([key]) => !new RegExp(`REQUEST_FUNNEL_EVENTS\\.${key}\\b`).test(route))
    .map(([, v]) => v)
  assert.deepEqual(unread, [], 'the wizard fires an event the funnel never asks for')
})

test('§A the reader imports the names, never re-types them', () => {
  // A literal would survive a rename in the wizard and return zero forever.
  assert.match(route, /import \{ REQUEST_FUNNEL_EVENTS \} from '@\/app\/request\/requestFunnelEvents'/)
  for (const name of Object.values(REQUEST_FUNNEL_EVENTS)) {
    assert.ok(!route.includes(`'${name}'`), `'${name}' is typed as a literal`)
  }
})

test('§A the wizard still fires them', () => {
  for (const key of Object.keys(REQUEST_FUNNEL_EVENTS)) {
    assert.match(wizard, new RegExp(`REQUEST_FUNNEL_EVENTS\\.${key}\\b`),
      `RequestWizard stopped firing ${key} — the funnel shows a cliff that is not real`)
  }
})

/* ═══════════ B. the numbers are honest ════════════════════════════════ */

test('§B staff flows are excluded from every stitched read', () => {
  // Measured 2026-08-05 on the booking funnel: 68 of 132 flows were the
  // operator's own. /request is walked every time the owner changes it.
  const stitched = route.match(/SELECT "props"->>'flowId' AS flow/g) ?? []
  assert.ok(stitched.length >= 3, `only ${stitched.length} stitched queries — did the route move?`)
  const excluded = route.match(/"props"->>'flowId' NOT IN \(\$\{STAFF_FLOWS\}\)/g) ?? []
  assert.ok(excluded.length >= stitched.length,
    `${stitched.length} queries stitch flows, ${excluded.length} exclude staff`)
})

test('§B the excluded count is reported, not silently dropped', () => {
  assert.match(route, /staffFlows:/)
  assert.match(tab, /staffFlows/)
})

test('§B reach is cumulative, never sequential', () => {
  // Dropped beacons, and a deep link that emits topic_chosen before
  // kind_chosen — sequential counting invents drop-offs.
  assert.match(route, /GREATEST\(s_open, s_kind, s_topic, s_details, s_sent\)/)
  assert.match(wizard, /REQUEST_FUNNEL_EVENTS\.topicChosen[\s\S]{0,400}REQUEST_FUNNEL_EVENTS\.kindChosen/,
    'the topic-before-kind path is gone — if truly gone, this test may go too')
})

test('§B failed and abandoned never double-count', () => {
  assert.match(route, /AS "failed"/)
  assert.match(route, /s_sent = 0 AND s_failed = 0 THEN 1 ELSE 0 END\), 0\)::int AS "abandoned"/)
})

test('§B an unknown kind is shown as itself, never coerced', () => {
  // kindOf() answers „MEETING" for anything it does not recognise: right in a
  // form, a lie in a table. Asserted on the import — the file names kindOf in
  // the comment explaining why it is not used.
  const imported = tab.match(/import \{([^}]*)\} from '@\/lib\/requestTopics'/)?.[1] ?? ''
  assert.ok(!/\bkindOf\b/.test(imported), 'the tab imports kindOf()')
  assert.match(route, /<> 'pending'/, "the 'pending' placeholder is counted as a kind")
})

test('§B the per-kind breakdown names its denominator', () => {
  // request_opened carries no kind, so those percentages are not a share of
  // everyone who opened. The number cannot say that; the copy has to.
  assert.match(tab, /ბაზა აქ არის/)
})

/* ═══════════ C. wiring ════════════════════════════════════════════════ */

test('§C the route gates feature before role, and the middleware knows it', () => {
  assert.ok(route.indexOf('requestsViewer()') < route.indexOf("requireRoleApi('ADMIN')"),
    'role is checked before the feature — the flag becomes probeable')
  assert.ok((REQUEST_PATH_PREFIXES as readonly string[]).includes('/api/admin/funnel'),
    '/api/admin/funnel left REQUEST_PATH_PREFIXES')
})

test('§C the period is an allow-list', () => {
  // An unbounded N is a full table scan triggerable from the address bar.
  assert.match(route, /const ALLOWED_DAYS = \[7, 30, 90\] as const/)
  assert.match(route, /ALLOWED_DAYS as readonly number\[\]\)\.includes\(asked\)/)
})

test('§C the tab reads live, and degrades instead of 500ing', () => {
  assert.match(tab, /cache: 'no-store'/)
  const catches = route.match(/\.catch\(\(\) => \[\]\)/g) ?? []
  assert.ok(catches.length >= 6, `only ${catches.length} reads degrade`)
})
