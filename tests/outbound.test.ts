/*
 * The outbound registry — lib/outbound.ts.
 *
 * Run: npx tsx --test tests/outbound.test.ts
 *
 * ⚠️ WHAT THIS FILE DOES *NOT* NEED TO CHECK. „every send names a registered
 * key" is enforced by the COMPILER — `sendMail` and `sendSms` take an
 * `OutboundKey`, so an unregistered message does not build. That is a stronger
 * pin than any test, and it is why this file is short.
 *
 * What is left is the other direction, which the compiler cannot see: a row in
 * the registry that nothing sends. The admin tab lists these rows as „what this
 * site sends", so a dead one is a promise on screen that no code keeps — the
 * same failure as a feature flag with no reader (CLAUDE.md), one screen further
 * out.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { OUTBOUND, outboundDef, outboundLabel, canToggle, AUDIENCE_LABEL, CHANNEL_LABEL } from '../lib/outbound'
import { MESSAGE_TEXTS, MESSAGE_TEXT_DEFAULTS } from '../lib/messageTextDefs'
import { SITE_TEXTS } from '../lib/siteTextDefs'
import { smsParts } from '../lib/sms'

const ROOT = join(import.meta.dirname, '..')

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, e)
    const st = statSync(join(ROOT, rel))
    if (st.isDirectory()) sources(rel, out)
    else if (/\.tsx?$/.test(e)) out.push(readFileSync(join(ROOT, rel), 'utf8'))
  }
  return out
}
const CODE = [...sources('app'), ...sources('lib'), ...sources('scripts')].join('\n')

test('no two rows claim the same key', () => {
  const seen = new Set<string>()
  for (const d of OUTBOUND) {
    assert.ok(!seen.has(d.key), `duplicate key: ${d.key}`)
    seen.add(d.key)
  }
})

test('every registered message is actually sent by something', () => {
  for (const d of OUTBOUND) {
    // The key appears at a call site as `key: 'x'`, or as a branch feeding one
    // (`? 'auth.otpVerify' : …`), or as the argument of a helper that passes it
    // through. All three read as the quoted literal in the source.
    assert.ok(CODE.includes(`'${d.key}'`), `nothing sends ${d.key} — dead registry row`)
  }
})

test('every message names at least one channel, and mail is one of them today', () => {
  for (const d of OUTBOUND) {
    assert.ok(d.channels.length > 0, `${d.key} has no channel`)
    // Not a law — a statement of where the product is. SMS is an addition to a
    // letter, never the only way somebody hears something, because a third of
    // the people in the database have no Georgian mobile (measured 2026-09-02:
    // 27 of 56 users, 20 of 26 active providers).
    //
    // \u26a0\ufe0f NARROWED, NOT DELETED, ON 2026-09-04. The note here used to say
    // „do not delete it to make an SMS-only message pass", and that instruction
    // is kept for every message it was written about. `auth.phoneCode` is the
    // one case it cannot describe: it is the code that REGISTERS somebody by
    // phone, and its recipient is a nine-digit number that, the first time, has
    // no account and therefore no address anywhere in the system. There is
    // nothing to add a letter to. Any OTHER key appearing in this set is the
    // drift the rule was written to catch.
    const smsOnlyByNature = new Set(['auth.phoneCode'])
    if (!smsOnlyByNature.has(d.key)) {
      assert.ok((d.channels as readonly string[]).includes('mail'), `${d.key} is SMS-only`)
    }
  }
})

test('a code the recipient is waiting for is marked as one', () => {
  const credentials = OUTBOUND.filter(d => 'credential' in d).map(d => d.key)
  // If a new OTP-shaped message appears it belongs here, because `credential`
  // is what tells the admin tab never to render the body.
  // `auth.phoneCode` joined them on 2026-09-04. It is the strongest of the
  // four: registration by phone is passwordless, so that code is not a second
  // factor on top of a password, it IS the whole credential.
  assert.deepEqual(credentials.sort(), ['auth.otpReset', 'auth.otpVerify', 'auth.passwordReset', 'auth.phoneCode'])
})

test('every audience and channel in use has a Georgian label', () => {
  for (const d of OUTBOUND) {
    assert.ok(AUDIENCE_LABEL[d.audience], `no label for audience ${d.audience}`)
    for (const c of d.channels) assert.ok(CHANNEL_LABEL[c], `no label for channel ${c}`)
  }
})

test('a key that no longer exists still renders as something', () => {
  // A MessageLog row outlives a rename of the key it names — the table is
  // history, and history must not go blank because the code moved on.
  assert.equal(outboundDef('request.verified.tutor'), null)
  assert.equal(outboundLabel('request.verified.tutor'), 'request.verified.tutor')
  assert.equal(outboundLabel('auth.welcome'), 'მოგესალმებით')
})

/* ── what an operator is not allowed to switch off ──────────────────────────
 *
 * These three assertions are the reason `canToggle` exists at all, and each is
 * somebody's actual problem rather than tidiness. They are pinned here because
 * the rule is enforced on the SERVER (lib/outboundSettings → setMessageState)
 * and merely OBEYED on screen — a rule that only hides a toggle is a rule that
 * anybody with `curl` walks around.
 */
test('a code the recipient is waiting for has no off switch', () => {
  // A password-reset code with a checkbox beside it is a person locked out of
  // their own account by a control they will never see.
  for (const k of ['auth.otpVerify', 'auth.otpReset', 'auth.passwordReset']) {
    assert.equal(canToggle(k, 'mail'), false, `${k} must not be switchable`)
  }
})

test('our own inbox has no off switch', () => {
  // `inbox.*` is us RECEIVING. Switching one off spares nobody a message; it
  // drops a stranger's question on the floor with nobody told.
  for (const d of OUTBOUND.filter(x => x.audience === 'inbox')) {
    assert.equal(canToggle(d.key, 'mail'), false, `${d.key} must not be switchable`)
  }
})

test('an ordinary message can be switched off, and SMS only where it is wired', () => {
  assert.equal(canToggle('request.verified.provider', 'mail'), true)
  assert.equal(canToggle('request.verified.provider', 'sms'), true)
  // Not wired for SMS → no switch, because a control that does nothing when
  // you flip it is worse than no control (CLAUDE.md, on flags with no reader).
  //
  // ⚠️ THIS USED TO NAME `request.done.client`, AND THAT KEY GREW AN SMS. The
  // assertion was pinning the ABSENCE of a feature rather than the rule, so
  // wiring the text made a passing test fail while nothing at all was wrong.
  // `auth.welcome` is mail-only because a welcome letter is the one message
  // with nothing urgent in it, and a billed part cannot be justified for it.
  // If that ever changes, re-point this line again rather than deleting it.
  assert.equal(canToggle('auth.welcome', 'sms'), false)
  assert.equal(canToggle('nonsense.key', 'mail'), false)
})

test('every message that offers an SMS switch actually sends one', () => {
  // The other direction of the same rule: `channels: ['mail','sms']` promises a
  // working switch, so something must call sendSms with that key. A switch that
  // does nothing when you flip it is worse than no switch at all — the same
  // reasoning CLAUDE.md applies to a flag with no reader.
  /* ⚠️ IT USED TO REQUIRE THE CALL ON ONE LINE, AND THAT IS NOT THE RULE
     (fixed 2026-09-04). The check was `CODE.includes("sendSms({ key: 'x'")`,
     which passes only for a call written flat. `request.done.client` is wired
     — correctly, inside a guard, wrapped across lines the way every other
     await in that handler is — and this failed anyway, reporting „nothing calls
     sendSms" about a call sitting four lines below it. A pin that breaks on a
     line wrap is pinning the formatting, not the behaviour (CLAUDE.md, on
     regexes over source text being a last resort).

     Asked as „does some `sendSms(` call name this key" instead: still a source
     pin — nothing here can execute a send — but one that survives a reformat. */
  const SENDS = [...CODE.matchAll(/sendSms\(\s*\{[^}]*?key:\s*'([^']+)'/g)].map(m => m[1])
  for (const d of OUTBOUND.filter(x => (x.channels as readonly string[]).includes('sms'))) {
    assert.ok(
      SENDS.includes(d.key),
      `${d.key} lists sms but nothing calls sendSms({ key: '${d.key}' … })`,
    )
  }
})

/* ── the copy an owner can edit ─────────────────────────────────────────── */

test('every editable message string belongs to a registered message', () => {
  // `shell` is the frame every letter is drawn in rather than a message of its
  // own — one group, twenty readers. Everything else must name a real message,
  // or the editor offers a field that changes nothing anybody receives.
  const known = new Set([...OUTBOUND.map(d => d.key as string), 'shell'])
  for (const g of MESSAGE_TEXTS) {
    // A RETIRED group is the one exception, and it is the mirror image: its
    // message is no longer sendable, so it left the registry — but the key must
    // stay known, because `msg.<key>.<part>` is a SiteText key a production row
    // may hold copy under. The admin editor hides it; nothing offers a field.
    if (g.retired) { assert.ok(!known.has(g.key), `${g.key} is retired but still registered as sendable`); continue }
    assert.ok(known.has(g.key), `${g.key} has editable copy but is not in the registry`)
    assert.ok(g.texts.length > 0, `${g.key} has an empty copy group`)
  }
})

test('every default is the string that ships, and none is empty', () => {
  // An empty default would send an empty subject the day somebody deletes the
  // row — the fallback has to be real copy, not a blank.
  for (const [key, val] of Object.entries(MESSAGE_TEXT_DEFAULTS)) {
    assert.ok(val.trim().length > 0, `${key} has an empty default`)
  }
})

test('the SMS default fits one part', () => {
  // Georgian is UCS-2: 70 characters in one part and every part is billed
  // (lib/sms → smsParts). Nothing STOPS an owner writing a longer one — that is
  // their call and the editor says what it costs — but the shipped default must
  // not quietly bill two.
  for (const g of MESSAGE_TEXTS) {
    for (const t of g.texts) {
      if (t.part !== 'sms') continue
      assert.ok(smsParts(t.default) === 1, `${g.key} sms default is ${smsParts(t.default)} parts: ${t.default}`)
    }
  }
})

test('a placeholder named in a default is one the sender actually fills', () => {
  // `{ref}` in a string nothing passes a ref to renders as nothing at all, which
  // reads as a typo in somebody's inbox. The declared `vars` are the contract.
  for (const g of MESSAGE_TEXTS) {
    for (const t of g.texts) {
      const used = [...t.default.matchAll(/\{(\w+)\}/g)].map(m => m[1])
      for (const u of used) {
        assert.ok(t.vars?.includes(u), `${g.key}.${t.part} uses {${u}} but does not declare it`)
      }
    }
  }
})

test('the editable copy is reachable from the site-text editor', () => {
  // It rides SITE_TEXTS on purpose (lib/siteTextDefs → MESSAGE_COPY): one
  // editor, one save route, one invalidation. If this ever stops being true the
  // owner is back to „სადა ტექსტები ვერ ვნახე ადმინშში".
  const inEditor = new Set(SITE_TEXTS.map(t => t.key))
  for (const key of Object.keys(MESSAGE_TEXT_DEFAULTS)) {
    assert.ok(inEditor.has(key), `${key} is not offered by the admin editor`)
  }
})
