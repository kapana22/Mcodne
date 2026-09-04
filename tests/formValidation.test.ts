// DO THE TWO HALVES OF EVERY FORM AGREE, AND CAN A REFUSAL NAME ITS FIELD?
//
// Run: npx tsx tests/formValidation.test.ts
//
// ⚠️ WHY (2026-08-31). Owner: „ვალიდაციები არ მუშაობს." Two shipped defects
// that no existing test could see, and this file exists because of their SHAPE
// rather than their content:
//
//   1. app/work/account posted `{ current, next }` to POST /api/me/password,
//      which parses `{ currentPassword, newPassword }`. Every provider password
//      change had been failing — with the screen reporting „პაროლი უნდა იყოს
//      მინიმუმ 8 სიმბოლო", a false statement about a password that was fine.
//      `tsc` cannot see this: both objects are perfectly good TypeScript.
//   2. /signin translated a 400 INVALID into the same „minimum 8" sentence,
//      while the sign-in route imposes NO length on a password (`min(1)`) and
//      the only thing it can refuse is a malformed email address.
//
// Both are one class of bug: a rule stated twice, in two files, in two
// languages. So this file does not check messages — it checks AGREEMENT.
// Everything below either
//   • runs one shared rule over a table (`passwordError`, `emailFormatError`),
//   • runs a shared SCHEMA over the body a form actually builds, or
//   • asserts that every field a schema can refuse has a Georgian word in
//     lib/validationMessages, so no refusal falls back to „შეავსე ველები
//     სწორად." — a sentence that names nothing, on forms with eight boxes.
//
// Nothing here asserts markup. A message can be restyled, a label reworded and
// a field reordered without touching this file; a RULE cannot move without it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

import {
  PWD_MIN, PWD_MAX, PWD_MIN_MSG, PWD_MAX_MSG, PasswordChangeInput, passwordError,
} from '../lib/passwordPolicy'
import { emailFormatError } from '../lib/emailRule'
import { phoneFormatError } from '../lib/phone'
import { validationIssueMessage } from '../lib/validationMessages'
import { ServiceRequestInput, RequestOfferInput } from '../lib/requests'
import { ProviderApplicationInput, MASTER, providerApplicationBody } from '../lib/providerApplication'

const GEORGIAN = /[Ⴀ-ჿ]/
const ROOT = join(__dirname, '..')

/* ═══════════ 1 · THE PASSWORD IS ONE RULE ═══════════════════════════════ */

test('the password-change body is the schema the route parses, not a lookalike', () => {
  // THE BUG, verbatim: what app/work/account sent until 2026-08-31.
  const shipped = { current: 'oldpassword1', next: 'newpassword1' }
  assert.equal(
    PasswordChangeInput.safeParse(shipped).success, false,
    'the old { current, next } body must be refused — it was silently failing in production',
  )
  // …and the shape both forms now build by parsing.
  assert.equal(
    PasswordChangeInput.safeParse({ currentPassword: 'oldpassword1', newPassword: 'newpassword1' }).success,
    true,
  )
})

test('passwordError and the shared schema refuse exactly the same passwords', () => {
  const cases = [
    '',                          // empty
    'a'.repeat(PWD_MIN - 1),     // one short
    'a'.repeat(PWD_MIN),         // the floor
    'a'.repeat(PWD_MAX),         // the ceiling
    'a'.repeat(PWD_MAX + 1),     // one over
  ]
  for (const pw of cases) {
    const helperSaysOk = passwordError(pw) === null
    const schemaSaysOk = PasswordChangeInput
      .safeParse({ currentPassword: 'x', newPassword: pw }).success
    assert.equal(
      helperSaysOk, schemaSaysOk,
      `the form's check and the route's schema disagree on a ${pw.length}-character password`,
    )
  }
})

test('both bounds have a Georgian sentence — a refusal is never silent', () => {
  assert.equal(passwordError('a'.repeat(PWD_MIN - 1)), PWD_MIN_MSG)
  assert.equal(passwordError('a'.repeat(PWD_MAX + 1)), PWD_MAX_MSG)
  for (const m of [PWD_MIN_MSG, PWD_MAX_MSG]) assert.ok(GEORGIAN.test(m), `not Georgian: ${m}`)
})

test('no route states a password length of its own', () => {
  // ⚠️ A SOURCE SCAN, AND DELIBERATELY SO — this is the one claim here that
  // cannot be executed. A route that goes back to `z.string().min(8)` would
  // behave identically TODAY and drift the moment PWD_MIN changes, which is
  // precisely how /me/profile came to refuse at 6 while the endpoint refused at
  // 8. The only observable difference is in the source, so the source is what
  // is read. Keep it narrow: it matches a password field with a NUMERIC bound.
  const routes: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'route.ts') routes.push(p)
    }
  }
  walk(join(ROOT, 'app/api'))
  //
  // ⚠️ `min(1)` IS EXEMPT AND IT IS A DIFFERENT RULE. „non-empty" is what
  // /api/auth/signin and /api/me's `currentPassword` state, and they are RIGHT
  // to: a password created before a policy tightened must still sign its owner
  // in and must still unlock a change. Applying the floor to those two boxes
  // would lock the exact people the policy is for out of fixing it. What is
  // banned is a POLICY number typed out beside the schema.
  const offenders = routes.filter(p => {
    const src = readFileSync(p, 'utf8')
    return src
      .split('\n')
      .some(line =>
        /(?:password|Password)\s*:\s*z\.string\(\)/.test(line) &&
        // Drop the „non-empty" bound, then see whether a NUMBER is still stated.
        /\.(?:min|max)\(\s*\d+\s*\)/.test(line.replace(/\.min\(\s*1\s*\)/g, '')),
      )
  })
  assert.deepEqual(
    offenders.map(p => p.slice(ROOT.length + 1)), [],
    'import PWD_MIN / PWD_MAX from lib/passwordPolicy instead of typing the number',
  )
})

/* ═══════════ 2 · THE EMAIL IS ONE RULE ══════════════════════════════════ */

test('emailFormatError never disagrees with the z.string().email() every route runs', () => {
  const Email = z.string().email()
  const cases = [
    'anu@gmail.com', 'a@b.ge', 'ANU@GMAIL.COM',
    'ana@gmail',        // the typo that used to be blamed on the password
    'ana gmail.com', '@gmail.com', 'ana@', 'ana@@gmail.com', 'ana@gmail..com',
  ]
  for (const v of cases) {
    assert.equal(
      emailFormatError(v) === null, Email.safeParse(v.trim()).success,
      `form and route disagree on „${v}"`,
    )
  }
})

test('an empty address is „you have not answered", not „that is not an address"', () => {
  // Two different facts, and a form that conflates them tells somebody their
  // blank box is malformed. `required: false` is what /apply and the profile
  // editor pass, exactly as they do for lib/phone.
  assert.notEqual(emailFormatError(''), emailFormatError('ana@gmail'))
  assert.equal(emailFormatError('', { required: false }), null)
  assert.ok(GEORGIAN.test(emailFormatError('')!))
  assert.ok(GEORGIAN.test(emailFormatError('ana@gmail')!))
})

/* ═══════════ 3 · THE THREE RULES SHARE ONE CONTRACT ═════════════════════ */

test('phone, email and password all answer „null, or the sentence"', () => {
  // Same shape at every call site, so none can be applied as „is it truthy".
  for (const ok of [phoneFormatError('599123456'), emailFormatError('a@b.ge'), passwordError('a'.repeat(PWD_MIN))]) {
    assert.equal(ok, null)
  }
  for (const bad of [phoneFormatError('123', { required: true }), emailFormatError('nope'), passwordError('short')]) {
    assert.equal(typeof bad, 'string')
    assert.ok(GEORGIAN.test(bad as string), `not Georgian: ${bad}`)
  }
})

/* ═══════════ 4 · EVERY REFUSAL CAN NAME ITS FIELD ═══════════════════════ */

/**
 * The schemas both a form and its route parse with. Each is the „valid is
 * decided once" contract — so a field either has a Georgian word for it, or a
 * refusal on that field reads „შეავსე ველები სწორად." and the reader is left to
 * guess which of its boxes it means.
 *
 * That was live: /business refused `taxId` under four characters and could say
 * nothing better than the generic line, on a form with eight fields. That page
 * and its `BusinessLeadInput` went on 2026-09-03 with the B2B vertical; the
 * lesson it paid for is why the three schemas below are still checked.
 */
/**
 * Fields that are NOT a box somebody types into, so there is nothing to name.
 *
 * `requestId` is the address of the thread the offer belongs to — the form
 * never renders it and a person cannot mistype it. `yearsExp` is a column the
 * schema still accepts and NO form asks for any more (removed 2026-08-31, owner:
 * „გამოცდილება 0 წელი … წაშალე"). Everything else must have a word.
 */
const NOT_A_CONTROL = new Set(['RequestOfferInput.requestId', 'ProviderApplicationInput.yearsExp'])

const SHARED_SCHEMAS: Array<[string, z.ZodTypeAny]> = [
  ['ServiceRequestInput', ServiceRequestInput],
  ['RequestOfferInput', RequestOfferInput],
  ['ProviderApplicationInput', ProviderApplicationInput],
]

test('no shared schema can refuse a field the interface has no word for', () => {
  const anonymous: string[] = []
  for (const [name, schema] of SHARED_SCHEMAS) {
    // An empty body makes every REQUIRED field produce an issue at once, which
    // is exactly the set a form has to be able to point at.
    const parsed = schema.safeParse({})
    assert.equal(parsed.success, false, `${name} accepted an empty body`)
    if (parsed.success) continue
    for (const issue of parsed.error.issues) {
      const field = typeof issue.path[0] === 'string' ? issue.path[0] : null
      assert.ok(field, `${name}: an issue with no field — a form cannot mark a box for it`)
      const text = validationIssueMessage(issue)
      assert.ok(GEORGIAN.test(text), `${name}.${field}: English leaked into the interface — „${text}"`)
      // The fallback names nothing. It is correct as a LAST resort and wrong as
      // the answer for a field the schema knows the name of.
      const key = `${name}.${field}`
      if (text === 'შეავსე ველები სწორად.' && !NOT_A_CONTROL.has(key)) anonymous.push(key)
    }
  }
  assert.deepEqual(
    anonymous, [],
    'add the field to FIELD_LABELS in lib/validationMessages — a refusal must name its box',
  )
})

/* ═══════════ 5 · THE INTAKE POINTS AT THE RIGHT BOX ═════════════════════ */

/** A draft the wizard would consider finished, so each case below changes ONE
 *  thing and the issue it produces is unambiguous.
 *
 *  ⚠️ `description` CARRIES A REAL SENTENCE SINCE 2026-09-04. It was `''` while
 *  the field was optional; the brief is now a required screen with a twelve
 *  character floor (owner: „ტექსტი სავალდებულო უნდა იყოს"), so an empty one
 *  made this draft invalid and every case below vacuous — the first issue
 *  reported was always „description", whatever the case had changed. */
const goodRequest = {
  kind: 'SERVICE' as const,
  topic: 'clean-flat',
  description: 'ბინის დალაგება, ორი ოთახი',
  pickMode: 'OFFERS' as const,
  budgetBand: 's2',
  timing: 'today',
  format: 'IN_PERSON' as const,
  city: 'TBILISI' as const,
  contactName: 'ნინო ბერიძე',
  phone: '599123456',
  email: 'nino@example.ge',
  details: {},
  website: '',
}

test('the request intake refuses each contact field under its own name', () => {
  // These three strings ARE the keys app/request/_stepContact marks. If a
  // schema field is renamed and this list is not, the form goes back to
  // printing the sentence under the button with nothing marked.
  const cases: Array<[string, Record<string, unknown>]> = [
    ['contactName', { contactName: 'ა' }],
    ['phone', { phone: '123' }],
    ['email', { email: 'nino@example' }],
  ]
  for (const [field, patch] of cases) {
    const parsed = ServiceRequestInput.safeParse({ ...goodRequest, ...patch })
    assert.equal(parsed.success, false, `${field} was accepted when it should not be`)
    if (parsed.success) continue
    assert.equal(
      parsed.error.issues[0].path[0], field,
      `the first issue does not name ${field} — the contact screen would mark the wrong box`,
    )
    assert.ok(GEORGIAN.test(validationIssueMessage(parsed.error.issues[0])))
  }
})

test('the good draft is actually good — otherwise every case above is vacuous', () => {
  const parsed = ServiceRequestInput.safeParse(goodRequest)
  assert.equal(
    parsed.success, true,
    parsed.success ? '' : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' · '),
  )
})

/* ═══════════ 6 · THE PROVIDER DOOR'S „დარჩა" LIST IS THE SCHEMA ═════════ */

/** What app/join/_provider/client.tsx builds. The „დარჩა" list under its submit
 *  is a mirror of these rules, so the mirror is checked against the original. */
const goodApplication = {
  kind: 'INDIVIDUAL' as const,
  fullName: 'ნინო ბერიძე',
  phone: '599123456',
  companyName: null,
  taxId: null,
  services: ['clean-flat'],
  areas: ['TBILISI'],
  about: 'ა'.repeat(MASTER.ABOUT_MIN),
  yearsExp: null,
  calloutFee: null,
  // ⚠️ THE PRICE PAIR (2026-09-01). A complete application answers the price
  // question, and „შეთანხმებით" is one of the two ways to answer it — so the
  // fixture that every case below patches has to be an ANSWER, not a blank.
  // Before this line the whole table went vacuous the moment the pair rule
  // landed: `fullName at the floor` failed on a price, naming a field the case
  // was not about.
  priceFrom: null,
  priceOnAsk: true,
  priceList: {},
  photoUrl: 'data:image/webp;base64,AA',
  workPhotos: [],
}

test('the join form asks for exactly what the endpoint requires — no more, no less', () => {
  // Every entry is one line of the client's `need(...)` list. A client rule
  // that is STRICTER refuses what the server would take; LOOSER produces the
  // unexplained round trip the phone check used to („123456789" is nine
  // characters and satisfied a length test that the schema's phone rule then
  // refused).
  const cases: Array<[string, Record<string, unknown>, boolean]> = [
    ['fullName at the floor',   { fullName: 'ა'.repeat(MASTER.NAME_MIN) }, true],
    ['fullName one short',      { fullName: 'ა'.repeat(MASTER.NAME_MIN - 1) }, false],
    ['about at the floor',      { about: 'ა'.repeat(MASTER.ABOUT_MIN) }, true],
    ['about one short',         { about: 'ა'.repeat(MASTER.ABOUT_MIN - 1) }, false],
    ['no service ticked',       { services: [] }, false],
    ['no city ticked',          { areas: [] }, false],
    ['nine digits, no country', { phone: '123456789' }, false],
    ['a Georgian mobile',       { phone: '599123456' }, true],
    ['company with no name',    { kind: 'COMPANY', companyName: null }, false],
    ['company with a name',     { kind: 'COMPANY', companyName: 'შპს მაგალითი' }, true],
    // The price is answered by a number OR by the tick, and „neither" is the
    // state the plate used to leave almost everybody in — see the pair rule in
    // lib/providerApplication.
    ['a number, no tick',       { priceFrom: 200, priceOnAsk: false }, true],
    ['the tick, no number',     { priceFrom: null, priceOnAsk: true }, true],
    ['neither answer',          { priceFrom: null, priceOnAsk: false }, false],
    ['price key omitted',       { priceFrom: null, priceOnAsk: undefined }, false],
  ]
  for (const [label, patch, expected] of cases) {
    const parsed = ProviderApplicationInput.safeParse({ ...goodApplication, ...patch })
    assert.equal(parsed.success, expected, `${label}: expected ${expected ? 'accepted' : 'refused'}`)
  }
})

test('„შეთანხმებით" posts a null price, whatever is left in the box', () => {
  // ⚠️ THE TWO ANSWERS ARE SEPARATE PIECES OF STATE, so the body builder — not
  // the interface — is what has to make them exclusive. Type 80, tick
  // „შეთანხმებით", submit: the box still holds „80" for one render, and a body
  // carrying both is „ask me, and it is 80₾", which no card can print.
  const draft = {
    kind: 'INDIVIDUAL' as const,
    fullName: 'ნინო ბერიძე', phone: '599123456', companyName: '', taxId: '',
    services: ['clean-flat'], areas: ['TBILISI'], about: 'ა'.repeat(MASTER.ABOUT_MIN),
    calloutFee: '', priceFrom: '80', priceOnAsk: true,
  }
  assert.equal(providerApplicationBody(draft).priceFrom, null)
  assert.equal(providerApplicationBody({ ...draft, priceOnAsk: false }).priceFrom, 80)
  // And the application no longer carries per-service prices at all — one
  // price is the whole question (owner, 2026-09-01).
  assert.ok(!('priceList' in providerApplicationBody(draft)))
})

test('the join form and the schema judge a phone the same way', () => {
  // The client's `need(...)` calls `phoneFormatError`; so does the schema. One
  // rule, asked twice — which is the property, not the implementation.
  for (const v of ['599123456', '+995599123456', '123456789', '', '+4930123', '5991234']) {
    const clientSaysOk = phoneFormatError(v, { required: true }) === null
    const schemaSaysOk = ProviderApplicationInput.safeParse({ ...goodApplication, phone: v }).success
    assert.equal(clientSaysOk, schemaSaysOk, `form and schema disagree on „${v}"`)
  }
})

/* ═══════════ 7 · A REFUSAL CARRIES ITS PATH OUT OF THE ROUTE ════════════ */

test('an API refusal a form must act on carries `field` beside `message`', () => {
  // ⚠️ THE OTHER SOURCE SCAN, and the same justification as the one above:
  // whether a route SENDS the field cannot be observed without running it
  // against a database. These four are the routes whose forms mark a box from
  // the response — the ones where „the server said no" has to become „this box
  // is wrong" on a screen the person is already looking at.
  const mustNameTheField = [
    'app/api/contact/route.ts',
    'app/api/requests/route.ts',
    'app/api/me/route.ts',
    'app/api/auth/signup/route.ts',
  ]
  for (const rel of mustNameTheField) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    assert.match(src, /field:/, `${rel} refuses a body without naming the field`)
    assert.match(src, /message:/, `${rel} refuses a body without a sentence to show`)
  }
})

// ── 3. A GREY BUTTON AND THE SENTENCE UNDER IT ARE ONE RULE ────────────────
//
// ⚠️ ADDED 2026-08-31 AFTER A THIRD DEFECT OF THE SAME SHAPE. Each signup form
// on /signup stated its own completeness three times — in the button's
// `disabled={…}`, in the condition guarding the hint, and in the ternary that
// picks the hint's words. The phone box is required (the route parses
// `phone: z.string().min(1)` and each form's `submit` refuses an empty one) and
// it was named in none of the three, so the button went green and the hint went
// silent while a required field was still empty. Pressing it then produced an
// error for a field the form had just declared fine.
//
// `lib/signupCompleteness → firstMissing` is now the one copy, and this is what
// pins it: blank any single required field and the form must still know.

import { firstMissing, type SignupShape } from '../lib/signupCompleteness'

/** Complete and acceptable — every case below is this, minus one thing. */
const FULL_CLIENT: SignupShape = {
  first: 'ნინო', email: 'nino@example.ge', phone: '555123456', pw: 'parolia123', agree: true,
}
const FULL_PROVIDER: SignupShape = { ...FULL_CLIENT, last: 'ბერიძე' }

test('a complete form is complete — otherwise every case below is vacuous', () => {
  assert.equal(firstMissing(FULL_CLIENT), null)
  assert.equal(firstMissing(FULL_PROVIDER), null)
})

test('blank any ONE required field and the button still knows which', () => {
  const cases: [keyof SignupShape, unknown, string][] = [
    ['first', '', 'first'],
    ['email', '', 'email'],
    // The one that shipped broken. If this ever passes with `null`, the button
    // has gone green on an empty phone again.
    ['phone', '', 'phone'],
    ['phone', '   ', 'phone'],
    ['pw', 'short', 'password'],
    ['agree', false, 'agree'],
  ]
  for (const [key, value, expected] of cases) {
    for (const [who, full] of [['client', FULL_CLIENT], ['provider', FULL_PROVIDER]] as const) {
      const gap = firstMissing({ ...full, [key]: value })
      assert.ok(gap, `${who}: ${String(key)}=${JSON.stringify(value)} left the form submittable`)
      assert.equal(gap.field, expected, `${who}: blanking ${String(key)} named „${gap.field}"`)
      assert.ok(gap.message.trim().length > 0, `${who}: ${gap.field} has no sentence to print`)
    }
  }
})

test('the surname is asked for only by the form that has the box', () => {
  // `undefined` is „this form has no such field", NOT „it is empty" — the
  // client form sends one name and must not be held to a surname it never asks
  // for. It pays that check on the one name instead.
  assert.equal(firstMissing({ ...FULL_CLIENT, first: 'ნ' })?.field, 'first')
  assert.equal(firstMissing({ ...FULL_PROVIDER, first: 'ნ' }), null)
  assert.equal(firstMissing({ ...FULL_PROVIDER, last: '' })?.field, 'last')
})

test('neither form hand-rolls a completeness rule beside the shared one', () => {
  // The defect was three copies drifting apart, so what is pinned is that there
  // is one. A `disabled` that spells out field names again is that bug coming
  // back; `disabled={submitting || gap !== null}` is what it should read.
  const src = readFileSync(join(ROOT, 'app/signin/_signup.tsx'), 'utf8')
  for (const m of src.match(/disabled=\{[^}]*\}/g) ?? []) {
    assert.ok(
      !/first|last|email|phone|agree|pw\.length/.test(m),
      `a submit button still names fields itself: ${m} — ask firstMissing instead`,
    )
  }
})
