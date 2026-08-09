/*
 * The phone rule — lib/phone.ts.
 *
 * Run: npx tsx --test tests/phone.test.ts
 *
 * Why this file exists: the number is now REQUIRED at signup, so this rule is
 * the first thing standing between a new user and the product. Two failure
 * directions matter and they pull against each other:
 *
 *   too loose  — „5" or „aaa" is stored and the expert can never be called
 *   too strict — a diaspora client with a German number cannot register at all,
 *                which is the audience the /abroad vertical was built for
 *
 * So the Georgian shape is pinned exactly, and international numbers are pinned
 * as ACCEPTED. If someone ever "tidies" this into a +995-only regex, the second
 * block fails and says why.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, isGeorgianMobile, phoneFormatError, formatPhone } from '../lib/phone'

test('normalize keeps the digits and one leading +, drops the noise', () => {
  assert.equal(normalizePhone(' 555 12 34 56 '), '555123456')
  assert.equal(normalizePhone('+995 (555) 12-34-56'), '+995555123456')
  assert.equal(normalizePhone('555.12.34.56'), '555123456')
  assert.equal(normalizePhone(''), '')
  assert.equal(normalizePhone(null), '')
  assert.equal(normalizePhone(undefined), '')
})

test('a Georgian mobile is accepted in all three shapes it is typed in', () => {
  for (const v of ['555123456', '+995555123456', '995555123456', '+995 555 12 34 56']) {
    assert.equal(phoneFormatError(v, { required: true }), null, `უნდა მიიღოს: ${v}`)
    assert.ok(isGeorgianMobile(normalizePhone(v)))
  }
})

test('a Georgian number of the wrong shape is refused', () => {
  for (const v of ['5551234', '55512345678', '322123456', '123456789']) {
    assert.notEqual(phoneFormatError(v, { required: true }), null, `უნდა უარყოს: ${v}`)
  }
})

test('international numbers are ACCEPTED — the diaspora vertical depends on it', () => {
  // Germany, UK, US, Turkey, Israel — real shapes a Georgian abroad would type.
  for (const v of ['+49 30 1234567', '+44 20 7946 0958', '+1 415 555 2671', '+90 532 123 45 67', '+972 50 123 4567']) {
    assert.equal(phoneFormatError(v, { required: true }), null, `უნდა მიიღოს: ${v}`)
  }
})

test('a foreign number without its country code is refused, and says so', () => {
  const msg = phoneFormatError('30 1234567', { required: true })
  assert.notEqual(msg, null)
  assert.match(String(msg), /ქვეყნის კოდით|\+49/)
})

test('+ with an implausible digit count is refused at both ends', () => {
  assert.notEqual(phoneFormatError('+123', { required: true }), null)
  assert.notEqual(phoneFormatError('+1234567890123456', { required: true }), null)
})

test('required is the CALLER’s business, not the rule’s', () => {
  // signup / the missing-phone prompt
  assert.notEqual(phoneFormatError('', { required: true }), null)
  // /apply and the profile editor, where empty means „not provided"
  assert.equal(phoneFormatError('', { required: false }), null)
  assert.equal(phoneFormatError(null), null)
})

test('display format never invents digits', () => {
  assert.equal(formatPhone('555123456'), '+995 555 123 456')
  assert.equal(formatPhone('+995555123456'), '+995 555 123 456')
  assert.equal(formatPhone('+49301234567'), '+49301234567')
  assert.equal(formatPhone(''), '')
})
