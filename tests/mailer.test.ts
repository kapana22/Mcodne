// The off switch, pinned as BEHAVIOUR: sendMail is called and nothing leaves.
//
// ⚠️ WHY THIS FILE EXISTS. On 2026-08-31 a user wrote to the owner that mail was
// arriving from a site that has not launched. Production had MAILER_MODE=send
// and a live Resend key, and the cleanup cron — every 15 minutes — was mailing
// „დასრულდა?" reminders to real clients. Owner: „ჯერ არაფერი არ უნდა მისდიოდეს
// მეილებზე… სანამ საიტი არ გამიმართება და რეალური მომხმარებლები არ შევლენ."
//
// Turning it off was one environment variable. The hole was that MAILER_MODE
// gated only the Resend branch: the Gmail branch was reached first and read
// nothing but its own two credentials, so GMAIL_USER + GMAIL_APP_PASSWORD would
// have kept sending straight past the switch. This asserts the order — off
// beats BOTH transports — by actually calling the function with each transport
// configured and checking nothing goes out.

import test from 'node:test'
import assert from 'node:assert/strict'

const KEYS = ['MAILER_MODE', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'RESEND_API_KEY'] as const

function withEnv(patch: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {}
  for (const k of KEYS) saved[k] = process.env[k]
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return fn().finally(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })
}

const LETTER = { to: 'someone@example.com', subject: 'x', html: '<p>x</p>' }

test('MAILER_MODE=off stops mail even with Gmail credentials present', async () => {
  const { sendMail } = await import('../lib/mailer')
  await withEnv(
    { MAILER_MODE: 'off', GMAIL_USER: 'a@b.c', GMAIL_APP_PASSWORD: 'x', RESEND_API_KEY: undefined },
    async () => {
      const r = await sendMail(LETTER)
      // `off` — not `gmail`, which is what this would have returned before the
      // switch moved ahead of the transports.
      assert.equal(r.mode, 'off', 'Gmail credentials walked past the off switch')
      assert.equal(r.ok, true, 'a suppressed letter must not read as a failure to the caller')
    },
  )
})

test('MAILER_MODE=off stops mail even with a Resend key present', async () => {
  const { sendMail } = await import('../lib/mailer')
  await withEnv(
    { MAILER_MODE: 'off', GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined, RESEND_API_KEY: 're_test_key' },
    async () => {
      const r = await sendMail(LETTER)
      assert.equal(r.mode, 'off', 'the Resend key walked past the off switch')
    },
  )
})

test('with no mail configuration at all, sendMail still only logs', async () => {
  // The default a fresh deployment lands on. It has always been log-only; this
  // pins that the new branch did not change it.
  const { sendMail } = await import('../lib/mailer')
  await withEnv(
    { MAILER_MODE: undefined, GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined, RESEND_API_KEY: undefined },
    async () => {
      const r = await sendMail(LETTER)
      assert.equal(r.mode, 'log')
      assert.equal(r.ok, true)
    },
  )
})

test('the off switch is read before either transport, in the source', () => {
  // The behaviour tests above cover the two transports we can configure without
  // a network. This one guards the ORDER itself, which is the whole fix: the
  // `off` return must appear before the Gmail branch, not after it.
  const src = require('node:fs').readFileSync('lib/mailer.ts', 'utf8') as string
  const off = src.indexOf("explicitMode === 'off'")
  const gmail = src.indexOf('if (gmailUser && gmailPass)')
  const resend = src.indexOf("explicitMode === 'send'")
  assert.ok(off > -1, 'the off switch is gone')
  assert.ok(off < gmail, 'the off switch sits after the Gmail transport again')
  assert.ok(off < resend, 'the off switch sits after the Resend transport again')
})
