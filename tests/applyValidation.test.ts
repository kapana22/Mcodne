/*
 * The apply form and POST /api/applications must never disagree.
 *
 * Run with:  npx tsx tests/applyValidation.test.ts
 *
 * THE BUG THIS PREVENTS (production, 2026-08-06). The API gated `fullName` on
 * Georgian script; the form did not — and the form PRE-FILLS the name from the
 * signed-in Google account, which for Georgian users is very often Latin. So
 * the applicant passed every client check with a value they never typed, got
 * 400 INVALID_TEXT, and the client dropped the server's explanatory `message`
 * on the floor and showed „სცადე თავიდან". Nothing in the form could tell them
 * the NAME was the problem. They retry, then leave.
 *
 * Two things are pinned here, and only these two matter:
 *   1. VALUE — each rule accepts and refuses what it claims to.
 *   2. CONTRACT — the form is the stricter side, the 400 body always carries a
 *      field AND a Georgian sentence, and the client actually reads them.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  APPLY,
  applyValidationFailure,
  bioError,
  nameError,
  priceError,
  refine,
  specialtyError,
  urlError,
  videoError,
  yearsError,
} from '../lib/applyValidation'

const GEO_BIO = 'ვეხმარები მცირე ბიზნესს ფინანსური აღრიცხვის და გადასახადების საკითხებში, ყოველდღიურად.'

test('the name rule catches what the form used to let through', () => {
  // The exact production shape: a Latin name straight from a Google account.
  assert.ok(nameError('INFINITY PRODUCTION'), 'a Latin name must be refused')
  assert.ok(nameError('Nino Beridze'), 'the common Google-account shape must be refused')
  assert.equal(nameError('ნინო ბერიძე'), null)
  assert.ok(nameError('ნ')?.includes('სახელი'), 'too short must still name the field')
  assert.ok(nameError('ა'.repeat(APPLY.NAME_MAX + 1)), 'the column is bounded')
  // The message has to carry the FIX, not just the refusal — this one usually
  // fires on a value the applicant never typed.
  assert.match(nameError('Nino Beridze')!, /ქართულად/)
})

test('the bio rule bounds both ends, and the form is the stricter side', () => {
  assert.ok(APPLY.BIO_MIN >= APPLY.BIO_MIN_API, 'the form must never accept less than the API')
  assert.ok(bioError('მოკლე'), 'under the floor')
  assert.equal(bioError(GEO_BIO), null)
  // The textarea had no maxLength and the API caps at 2000 — a long bio 400d
  // with no field named. Both ends are now the same number.
  assert.ok(bioError('ა'.repeat(APPLY.BIO_MAX + 1)))
  // Anything the FORM accepts, the API accepts. That is the whole contract.
  assert.equal(bioError(GEO_BIO, APPLY.BIO_MIN_API), null)
  // …and the script gate applies to the bio too.
  assert.ok(bioError('I help small businesses with accounting and tax questions every day.'))
})

test('price refuses the values the API silently 400d on', () => {
  assert.equal(priceError(80), null)
  assert.ok(priceError(79.5), 'type=number reaches decimals; the API takes an integer')
  assert.ok(priceError(0), 'no paid service yet')
  assert.ok(priceError(APPLY.PRICE_MIN - 1))
  assert.ok(priceError(APPLY.PRICE_MAX + 1))
})

test('optional fields are optional — but a filled one is checked', () => {
  assert.equal(yearsError(''), null)
  assert.equal(yearsError('5'), null)
  assert.ok(yearsError('5.5'))
  assert.ok(yearsError(String(APPLY.YEARS_MAX + 1)))
  assert.equal(urlError('', 'ვებგვერდი'), null)
  assert.ok(urlError('x'.repeat(APPLY.URL_MAX + 1), 'ვებგვერდი'))
  assert.equal(videoError(''), null)
  assert.equal(videoError('https://youtu.be/dQw4w9WgXcQ'), null)
  assert.ok(videoError('https://vimeo.com/12345'))
  assert.equal(specialtyError('მარკეტინგი'), null)
  assert.ok(specialtyError('ა'))
})

test('a 400 always names a field and says what to do', () => {
  // Exactly the shape zod hands us for our own refinements.
  const fail = applyValidationFailure({
    issues: [{ code: 'custom', message: nameError('Nino Beridze')!, path: ['fullName'] }],
  })
  assert.equal(fail.code, 'INVALID_TEXT')
  assert.equal(fail.field, 'fullName')
  assert.match(fail.message, /[Ⴀ-ჿ]/, 'the sentence must be Georgian, not zod English')

  // A type error (no rule ran) must still produce a Georgian sentence.
  const typeFail = applyValidationFailure({
    issues: [{ code: 'invalid_type', message: 'Expected number, received string', path: ['hourlyRate'] }],
  })
  assert.equal(typeFail.code, 'INVALID')
  assert.equal(typeFail.field, 'hourlyRate')
  assert.match(typeFail.message, /ფასი/, 'the fallback names the field in the applicant’s words')

  // The video field keeps the code it had before this file existed.
  assert.equal(
    applyValidationFailure({ issues: [{ code: 'custom', message: videoError('nope')!, path: ['introVideoUrl'] }] }).code,
    'INVALID_VIDEO_URL',
  )
})

test('refine() forwards the rule verbatim into zod', () => {
  const issues: { code: string; message: string }[] = []
  refine(nameError)('Nino Beridze', { addIssue: i => issues.push(i) })
  assert.equal(issues.length, 1)
  assert.equal(issues[0].message, nameError('Nino Beridze'))
  refine(nameError)('ნინო ბერიძე', { addIssue: () => assert.fail('a valid name must add no issue') })
})

/* ── the contract, read off the two files that have to honour it ── */
const api = readFileSync(new URL('../app/api/applications/route.ts', import.meta.url), 'utf8')
/* /apply is split across `app/apply/_*.tsx` — ApplyClient.tsx is only the
   container now. These assertions are about the FORM as a whole, so read the
   directory rather than a filename the next split would invalidate. */
const form = readdirSync(new URL('../app/apply/', import.meta.url))
  .filter(f => f.endsWith('.tsx'))
  .sort()
  .map(f => readFileSync(new URL(`../app/apply/${f}`, import.meta.url), 'utf8'))
  .join('\n')

test('the API states no bound of its own for a shared field', () => {
  // A `.min(20)` / `.max(500)` back in the schema is how the two sides drift
  // apart again — the numbers live in APPLY, the rules in lib/applyValidation.
  for (const field of ['fullName', 'specialty', 'motivation', 'hourlyRate', 'yearsExp']) {
    const line = api.split('\n').find(l => l.trim().startsWith(`${field}:`)) ?? ''
    assert.ok(line.includes('refine('), `${field} must go through the shared rule`)
    assert.ok(!/\.(min|max)\(/.test(line), `${field} restated its own bound: ${line.trim()}`)
  }
})

test('the API answers with field AND message on every 400', () => {
  assert.match(api, /applyValidationFailure\(parsed\.error\)/)
  assert.match(api, /field: fail\.field/)
  assert.match(api, /message: fail\.message/)
})

test('the form READS the server sentence — the regression that started this', () => {
  assert.match(form, /typeof data\?\.message === 'string'/,
    'the API explains the refusal in `message`; ignoring it is what left applicants stuck')
  assert.match(form, /SERVER_FIELD\[String\(data\?\.field/,
    'knowing which field refused is useless unless the form jumps to it')
})

test('the form checks the name before the API does — each box on its own', () => {
  // It used to join the two boxes and validate the pair, so „ნინო" + „Beridze"
  // put the red line under სახელი — the field that was right. Both are gated
  // now, separately, and the second carries its own label so the message says
  // „გვარი" rather than „name and surname".
  assert.match(form, /nameError\(form\.firstName\)/, 'step 1 must gate the first name')
  assert.match(form, /nameError\(form\.lastName, *'გვარი'\)/, 'step 1 must gate the surname separately')
  assert.match(form, /const NameScriptHint/, 'and say it before the gate — the value is pre-filled')
})

/* ═══════════ the STRICT name rule (2026-08-12, owner) ═══════════════════
 *
 * `checkGeorgian` is a SHARE test — half the letters — and that is correct for
 * prose, where „Google Ads-ის სპეციალისტი" is real Georgian business copy. It
 * is the wrong instrument for a NAME, and the live data proves it: „Marietta
 * Dzvelaia" passed it, and „luka kapanadze" is an ADMIN row. A name carries no
 * brands, no acronyms, no tools and no digits, so nothing is lost by requiring
 * Georgian letters outright.
 */
test('a name must be Georgian letters — not „half the letters"', () => {
  assert.equal(nameError('ნინო ბერიძე'), null)
  // A double surname keeps its hyphen; mtavruli is Georgian too.
  assert.equal(nameError('ჯავახიშვილი-ბერიძე'), null)
  assert.equal(nameError('ᲜᲘᲜᲝ ᲑᲔᲠᲘᲫᲔ'), null)

  // The two shapes that got in through the unvalidated signup route.
  assert.match(nameError('luka kapanadze') ?? '', /ქართულად/)
  assert.match(nameError('Marietta Dzvelaia') ?? '', /ქართულად/)
  // Half-and-half used to PASS the share test. It must not.
  assert.match(nameError('ნინო Beridze') ?? '', /ქართულად/)
  // A name has no digits in it.
  assert.match(nameError('ნინო 2') ?? '', /ქართულად/)
})

test('the name rule still yields to the length rules first', () => {
  // „fill it in" must win over „write it in Georgian" — an empty field is not a
  // script problem, and naming the wrong fix is how a form loses somebody.
  assert.match(nameError('') ?? '', /შეავსე/)
  assert.match(nameError('ა') ?? '', /შეავსე/)
})
