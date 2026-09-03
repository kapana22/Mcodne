/*
 * The SMS transport — lib/sms.ts (sender.ge).
 *
 * Run: npx tsx --test tests/sms.test.ts
 *
 * Why this file exists. Three of these assertions are the only thing standing
 * between a code change and a bill, or a 3am text to somebody who was promised
 * silence:
 *
 *   1. NOTHING SENDS BY DEFAULT. A key in the environment is necessary and
 *      never sufficient — the mailer once shipped the other shape and went on
 *      sending through its own off switch (lib/mailer, 2026-08-31).
 *   2. A NON-GEORGIAN NUMBER IS REFUSED, LOUDLY. lib/phone accepts
 *      international numbers on purpose; this provider dials Georgian mobiles
 *      only, and the gap has to surface as a failed result rather than as a
 *      message that quietly never went.
 *   3. THE TEXT IS NEVER LOGGED ONCE MESSAGES ARE REALLY GOING OUT. Most of
 *      them are one-time codes and the deploy log is not where a credential
 *      belongs.
 *
 * The wire format is pinned too — field names and the smsno/priority values are
 * the provider's, not ours, and a rename here is a silent no-send there.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { smsDestination, smsParts, sendSms, mask } from '../lib/sms'

/** Runs `fn` with the given env, a stubbed fetch and a captured console. */
async function withEnv(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch | null,
  fn: (calls: { requests: { url: string; body: URLSearchParams }[]; logs: string[] }) => Promise<void>,
) {
  const prevEnv = { ...process.env }
  const prevFetch = globalThis.fetch
  const { log, warn, error } = console
  const requests: { url: string; body: URLSearchParams }[] = []
  const logs: string[] = []
  const capture = (...a: unknown[]) => { logs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')) }

  // The senders are real; the LOG ROW is not wanted in a shared table.

  process.env.MESSAGE_LOG = 'off'

  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  // Any fetch a test did not authorise is a bug, not a pass.
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? '')) })
    if (!fetchImpl) throw new Error('fetch called when nothing should have been sent')
    return fetchImpl(url as never, init)
  }) as typeof fetch
  console.log = capture; console.warn = capture; console.error = capture

  try {
    await fn({ requests, logs })
  } finally {
    process.env = prevEnv
    globalThis.fetch = prevFetch
    console.log = log; console.warn = warn; console.error = error
  }
}

const ok200 = (body: unknown) => (async () =>
  new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
const fail = (status: number, body: unknown) => (async () =>
  new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

/* ── the destination ─────────────────────────────────────────────────────── */

test('every shape a Georgian mobile is typed in becomes the 9 digits sender.ge wants', () => {
  for (const v of ['555123456', '+995555123456', '995555123456', '+995 555 12 34 56', ' 555-12-34-56 ']) {
    assert.equal(smsDestination(v), '555123456', `უნდა მიიღოს: ${v}`)
  }
})

test('a number this provider cannot dial is null, not a mangled string', () => {
  // The middle two are VALID numbers that lib/phone accepts on purpose — the
  // diaspora vertical is built for them. They are simply not SMS-able here.
  for (const v of ['', null, undefined, '+4915112345678', '+995322123456', '5551234', '322123456']) {
    assert.equal(smsDestination(v), null, `უნდა უარყოს: ${String(v)}`)
  }
})

/* ── the cost ────────────────────────────────────────────────────────────── */

test('Georgian counts as UCS-2 — 70 in one part, 67 per part after that', () => {
  assert.equal(smsParts(''), 0)
  assert.equal(smsParts('მცოდნე: დადასტურების კოდი 123456'), 1)
  assert.equal(smsParts('ა'.repeat(70)), 1)
  assert.equal(smsParts('ა'.repeat(71)), 2)
  assert.equal(smsParts('ა'.repeat(134)), 2)
  assert.equal(smsParts('ა'.repeat(135)), 3)
})

test('plain ASCII gets the GSM-7 allowance, and ₾ does not', () => {
  assert.equal(smsParts('a'.repeat(160)), 1)
  assert.equal(smsParts('a'.repeat(161)), 2)
  assert.equal(smsParts(`${'a'.repeat(70)}₾`), 2) // one lari sign → UCS-2 → 71 units
})

/* ── nothing sends by default ────────────────────────────────────────────── */

test('with no configuration at all it logs and sends nothing', async () => {
  await withEnv({ SMS_MODE: undefined, SENDER_GE_API_KEY: undefined, SMS_ONLY_AFTER: undefined }, null, async ({ requests, logs }) => {
    const r = await sendSms({ key: 'test.manual', to: '555123456', text: 'კოდი 1234' })
    assert.deepEqual({ ok: r.ok, mode: r.mode }, { ok: true, mode: 'log' })
    assert.equal(requests.length, 0)
    assert.ok(logs.some(l => l.includes('კოდი 1234')), 'log mode exists to show the text')
  })
})

test('⚠️ A KEY ALONE NEVER SENDS — the whole point of this module', async () => {
  await withEnv({ SMS_MODE: undefined, SENDER_GE_API_KEY: 'live-key', SMS_ONLY_AFTER: undefined }, null, async ({ requests }) => {
    const r = await sendSms({ key: 'test.manual', to: '555123456', text: 'გამარჯობა' })
    assert.equal(r.mode, 'log')
    assert.equal(requests.length, 0, 'a configured key must not be able to send on its own')
  })
})

test('SMS_MODE=off stops a fully configured sender, and still shows the text', async () => {
  await withEnv({ SMS_MODE: 'off', SENDER_GE_API_KEY: 'live-key', SMS_ONLY_AFTER: undefined }, null, async ({ requests, logs }) => {
    const r = await sendSms({ key: 'test.manual', to: '555123456', text: 'გამარჯობა' })
    assert.deepEqual({ ok: r.ok, mode: r.mode }, { ok: true, mode: 'off' })
    assert.equal(requests.length, 0)
    assert.ok(logs.some(l => l.includes('გამარჯობა')))
  })
})

test('half a configuration is read as „do not send"', async () => {
  await withEnv({ SMS_MODE: 'send', SENDER_GE_API_KEY: undefined, SMS_ONLY_AFTER: undefined }, null, async ({ requests }) => {
    const r = await sendSms({ key: 'test.manual', to: '555123456', text: 'x' })
    assert.deepEqual({ ok: r.ok, mode: r.mode }, { ok: true, mode: 'log-no-key' })
    assert.equal(requests.length, 0)
  })
})

test('an unsendable number is refused before every other branch, even when dark', async () => {
  await withEnv({ SMS_MODE: undefined, SENDER_GE_API_KEY: undefined, SMS_ONLY_AFTER: undefined }, null, async () => {
    const r = await sendSms({ key: 'test.manual', to: '+4915112345678', text: 'x' })
    // ok:false is the contract a caller falls back to email on.
    assert.deepEqual({ ok: r.ok, mode: r.mode }, { ok: false, mode: 'unsupported-destination' })
  })
})

/* ── the wire format ─────────────────────────────────────────────────────── */

test('a real send posts sender.ge exactly the fields it documents', async () => {
  const body = { data: [{ messageId: '123KUxuhiGyDN3', statusId: 1, qnt: 1 }] }
  await withEnv({ SMS_MODE: 'send', SENDER_GE_API_KEY: 'live-key', SMS_ONLY_AFTER: undefined }, ok200(body), async ({ requests, logs }) => {
    const r = await sendSms({ key: 'test.manual', to: '+995 555 12 34 56', text: 'მცოდნე: კოდი 4321' })
    assert.deepEqual(
      { ok: r.ok, mode: r.mode, messageId: r.messageId, parts: r.parts },
      { ok: true, mode: 'send', messageId: '123KUxuhiGyDN3', parts: 1 },
    )
    assert.equal(requests.length, 1)
    const [req] = requests
    assert.equal(req.url, 'https://sender.ge/api/send.php')
    assert.equal(req.body.get('apikey'), 'live-key')
    assert.equal(req.body.get('destination'), '555123456', 'nine digits, no country code')
    assert.equal(req.body.get('smsno'), '2', 'informational — no advertising suffix')
    assert.equal(req.body.get('priority'), '0', 'the subscription check is respected unless asked')
    assert.equal(req.body.get('content'), 'მცოდნე: კოდი 4321')

    // ⚠️ and the words never reach the log once messages really go out.
    assert.ok(!logs.some(l => l.includes('4321')), 'a live send must not print the text')
  })
})

test('the two flags that change what the recipient gets are not defaults', async () => {
  const body = { data: [{ messageId: 'm1', statusId: 1, qnt: 2 }] }
  await withEnv({ SMS_MODE: 'send', SENDER_GE_API_KEY: 'k', SMS_ONLY_AFTER: undefined }, ok200(body), async ({ requests }) => {
    await sendSms({ key: 'test.manual', to: '555123456', text: 'ad', kind: 'ad', skipSubscriptionCheck: true })
    assert.equal(requests[0].body.get('smsno'), '1', 'an ad carries the SmsNo')
    assert.equal(requests[0].body.get('priority'), '1')
  })
})

/* ── the failures, each of which silently drops a real message ───────────── */

test('every documented error status comes back as a distinct, unsuccessful mode', async () => {
  for (const [status, message] of [[401, 'Invalid API key'], [402, 'Insufficient balance'], [403, 'Access denied'], [503, 'Service temporarily unavailable']] as const) {
    await withEnv({ SMS_MODE: 'send', SENDER_GE_API_KEY: 'k', SMS_ONLY_AFTER: undefined }, fail(status, { message }), async ({ logs }) => {
      const r = await sendSms({ key: 'test.manual', to: '555123456', text: 'x' })
      assert.deepEqual({ ok: r.ok, mode: r.mode, status: r.status }, { ok: false, mode: `sender-http-${status}`, status })
      // Prod monitoring is `grep [server-error]`; without the prefix the drop
      // leaves no trace, and 402 in particular is „top the account up".
      assert.ok(logs.some(l => l.includes('[server-error]') && l.includes(message)), `${status} must name itself in the log`)
    })
  }
})

test('a 200 that queued nothing is a failure, whatever the status line says', async () => {
  await withEnv({ SMS_MODE: 'send', SENDER_GE_API_KEY: 'k', SMS_ONLY_AFTER: undefined }, ok200({ message: 'Something else' }), async () => {
    const r = await sendSms({ key: 'test.manual', to: '555123456', text: 'x' })
    assert.deepEqual({ ok: r.ok, mode: r.mode }, { ok: false, mode: 'sender-no-id' })
  })
})

test('a network failure is caught, not thrown at the caller', async () => {
  const boom = (async () => { throw new Error('ETIMEDOUT') }) as unknown as typeof fetch
  await withEnv({ SMS_MODE: 'send', SENDER_GE_API_KEY: 'k', SMS_ONLY_AFTER: undefined }, boom, async () => {
    const r = await sendSms({ key: 'test.manual', to: '555123456', text: 'x' })
    assert.deepEqual({ ok: r.ok, mode: r.mode }, { ok: false, mode: 'sender-error' })
  })
})

/* ── the log ─────────────────────────────────────────────────────────────── */

test('a masked number tells two recipients apart and cannot be dialled', () => {
  // the same phone stored two ways leaves the same trace
  assert.equal(mask('+995555123456'), '555***456')
  assert.equal(mask('555123456'), '555***456')
  assert.equal(mask('+4915112345678'), '+49***678')
  assert.equal(mask('555123999'), '555***999')
  assert.equal(mask(''), '***')
})
