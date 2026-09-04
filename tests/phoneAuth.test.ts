// REGISTRATION AND SIGN-IN BY PHONE — what must stay true.
//
// Run: npx tsx tests/phoneAuth.test.ts   (also in `npm run check`)
//
// Owner, 2026-09-04: „მე მინდა დავამატოთ მობილურით რეგისტრაცია." Chosen shape:
// a number, a six-digit SMS, no password ever.
//
// These pin BEHAVIOUR — they call the functions and drive the row through its
// whole life. The three that need a database SKIP rather than fail when there
// is none, for the reason tests/mailer gives: a unit gate that turns red on a
// missing DATABASE_URL teaches people to ignore it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalPhone, normalizePhone, isGeorgianMobile } from '../lib/phone'
import { phoneLoginKey, MAX_ATTEMPTS } from '../lib/phoneAuth'
import { profileBlockers, isProfileComplete, faceFrom } from '../lib/profileCompleteness'
import { OUTBOUND, isCredential, canToggle } from '../lib/outbound'

/* ═══════════ one number, one spelling ═══════════════════════════════════ */

test('the same phone typed three ways is one string', () => {
  // ⚠️ THE WHOLE REASON `canonicalPhone` EXISTS. Production held all three
  // shapes (measured 2026-09-04: 27 rows, of which „599019505",
  // „+995577971401" and „995…" all appeared), and `normalizePhone` — which only
  // strips punctuation — left them as three different strings. No unique index
  // can see through that, and a credential three strings can spell is not one.
  const shapes = ['599 01 95 05', '599019505', '995599019505', '+995599019505', '+995 599 01 95 05']
  const out = new Set(shapes.map(canonicalPhone))
  assert.equal(out.size, 1, `three spellings became ${out.size} strings: ${[...out].join(' · ')}`)
  assert.equal([...out][0], '+995599019505')
  // And the thing it replaced genuinely could not do this — if this ever passes,
  // canonicalPhone has stopped being needed and the comment above is stale.
  assert.ok(new Set(shapes.map(normalizePhone)).size > 1, 'normalizePhone no longer differs')
})

test('canonicalising twice changes nothing', () => {
  // The migration's UPDATE re-runs on every boot whose fingerprint changed.
  for (const v of ['599019505', '+995599019505', '+4930123456', '']) {
    assert.equal(canonicalPhone(canonicalPhone(v)), canonicalPhone(v), v)
  }
})

test('a foreign number keeps its own country code', () => {
  // lib/phone accepts international numbers on purpose. Guessing +995 onto a
  // Berlin landline would dial a stranger in Tbilisi.
  assert.equal(canonicalPhone('+49 30 1234567'), '+49301234567')
  assert.equal(isGeorgianMobile(canonicalPhone('+49301234567')), false)
})

test('the phone door refuses every number it cannot text', () => {
  // sender.ge dials Georgian mobiles and nothing else (lib/sms →
  // smsDestination). Offering the form to anyone else is a door onto a wall:
  // they would wait for a code that was never sendable. Those people keep the
  // address-and-password path, which is why it was not removed.
  assert.equal(phoneLoginKey('599019505'), '+995599019505')
  assert.equal(phoneLoginKey('+995 599 01 95 05'), '+995599019505')
  assert.equal(phoneLoginKey('+49301234567'), null, 'a German mobile cannot be texted from here')
  assert.equal(phoneLoginKey('322123456'), null, 'a Tbilisi landline is not a mobile')
  assert.equal(phoneLoginKey(''), null)
  assert.equal(phoneLoginKey(null), null)
})

/* ═══════════ the code's whole life ══════════════════════════════════════ */

test('a code is single-use, and five wrong guesses kill it', async () => {
  const { prisma } = await import('../lib/prisma')
  const { issuePhoneCode, checkPhoneCode, redeemPhoneTicket } = await import('../lib/phoneAuth')

  // A number no human holds — 555000000 is inside the mobile range and is not
  // in the database (checked below before anything is written).
  const phone = '+995555000000'
  const reachable = await prisma.phoneOtp.count({ where: { phone } }).then(() => true, () => false)
  if (!reachable) { console.log('  (no database — skipped)'); return }
  await prisma.phoneOtp.deleteMany({ where: { phone } })

  // ── the happy path
  const { code } = await issuePhoneCode(phone)
  assert.match(code, /^\d{6}$/, 'six digits')

  const stored = await prisma.phoneOtp.findFirst({ where: { phone } })
  assert.ok(stored, 'a row was written')
  assert.notEqual(stored!.codeHash, code, 'THE CODE IS NEVER STORED IN CLEAR — it is the only credential a passwordless account has')

  const ok = await checkPhoneCode(phone, code)
  assert.equal(ok.ok, true, 'the right code is accepted')

  // ── and it cannot be answered twice
  const again = await checkPhoneCode(phone, code)
  assert.equal(again.ok, false, 'a consumed code was accepted a second time')

  // ── the ticket is single-use too, or a replay mints a second account
  assert.ok(ok.ok && ok.ticket)
  const first = await redeemPhoneTicket((ok as { ticket: string }).ticket)
  assert.equal(first, phone, 'the ticket names the number it was issued for')
  const replay = await redeemPhoneTicket((ok as { ticket: string }).ticket)
  assert.equal(replay, null, 'a spent ticket was accepted again')

  // ── the attempt floor. lib/rateLimit lives in one instance's memory and
  //    forgets everything on deploy; this counter is in the row.
  await prisma.phoneOtp.deleteMany({ where: { phone } })
  const second = await issuePhoneCode(phone)
  const wrong = second.code === '000000' ? '111111' : '000000'
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    assert.equal((await checkPhoneCode(phone, wrong)).ok, false, `wrong guess ${i + 1} was accepted`)
  }
  const afterBurn = await checkPhoneCode(phone, second.code)
  assert.equal(afterBurn.ok, false, 'the RIGHT code still worked after five wrong ones — the row is not burned')

  await prisma.phoneOtp.deleteMany({ where: { phone } })
  await prisma.$disconnect()
})

test('issuing a new code retires the old one', async () => {
  const { prisma } = await import('../lib/prisma')
  const { issuePhoneCode, checkPhoneCode } = await import('../lib/phoneAuth')
  const phone = '+995555000001'
  const reachable = await prisma.phoneOtp.count({ where: { phone } }).then(() => true, () => false)
  if (!reachable) { console.log('  (no database — skipped)'); return }
  await prisma.phoneOtp.deleteMany({ where: { phone } })

  // Two live codes for one number doubles the guessing surface AND means „the
  // last SMS" is not reliably the one that works, which is a support ticket
  // every single time.
  const first = await issuePhoneCode(phone)
  const second = await issuePhoneCode(phone)
  assert.equal(await prisma.phoneOtp.count({ where: { phone, consumed: false } }), 1, 'two live codes for one number')
  assert.equal((await checkPhoneCode(phone, first.code)).ok, false, 'the superseded code still worked')
  assert.equal((await checkPhoneCode(phone, second.code)).ok, true, 'the newest code did not work')

  await prisma.phoneOtp.deleteMany({ where: { phone } })
  await prisma.$disconnect()
})

test('a number two accounts claim is refused, never guessed', async () => {
  const { prisma } = await import('../lib/prisma')
  const { accountForPhone } = await import('../lib/phoneAuth')
  const rows = await prisma.user.groupBy({
    by: ['phone'],
    where: { phone: { not: null }, phoneVerified: false },
    _count: { _all: true },
  }).catch(() => null)
  if (!rows) { console.log('  (no database — skipped)'); return }

  // ⚠️ THIS IS NOT HYPOTHETICAL. Two production numbers are held by two
  // accounts each (measured 2026-09-04) — typed into a profile field back when
  // a phone was contact information rather than a credential. Handing the
  // handset's owner one of two strangers' accounts at random is worse than
  // asking them to use the address they registered with.
  const shared = rows.filter(r => r._count._all > 1).map(r => r.phone!)
  for (const phone of shared) {
    const a = await accountForPhone(phone)
    assert.equal(a.kind, 'ambiguous', `${phone} is held by ${rows.find(r => r.phone === phone)!._count._all} accounts and was resolved anyway`)
  }
  // An unheld number is 'none' — the caller then asks for a name.
  assert.deepEqual(await accountForPhone('+995555000002'), { kind: 'none' })
  await prisma.$disconnect()
})

/* ═══════════ the message it travels in ══════════════════════════════════ */

test('the sign-in code is a credential, and no cutoff may hold it', () => {
  // `MAIL_ONLY_AFTER` / `SMS_ONLY_AFTER` stop the site INITIATING contact with
  // people who were here before launch. Somebody staring at the code field
  // asked for this one — and for a passwordless account it is the only door
  // there is, so holding it locks them out with `ok: true` in the log.
  assert.equal(isCredential('auth.phoneCode'), true)
  assert.equal(isCredential('auth.otpReset'), true)
  assert.equal(isCredential('request.verified.provider'), false, 'a product notification must still obey the cutoff')
})

test('the code the door depends on is not switched off by default', () => {
  // Every other product SMS starts off, because a part is billed. This one is
  // the front door: phone registration is passwordless, so a person whose code
  // never arrives can neither register nor sign in.
  const d = OUTBOUND.find(x => x.key === 'auth.phoneCode')
  assert.ok(d, 'auth.phoneCode left the registry')
  assert.ok('smsByDefault' in d!, 'the phone code would ship switched off — a door that is locked')
  assert.deepEqual([...d!.channels], ['sms'], 'there is no address to mail a phone-registration code to')
  // It stays refusable — the owner may turn it off, and /api/auth/phone/start
  // reports the hold to the screen rather than pretending the code went.
  assert.equal(canToggle('auth.phoneCode', 'sms'), true)
})

test('the provider request SMS is on, as the owner asked', () => {
  // Owner, 2026-09-04: „როდესაც ექსპერტი დარეგისტრირდება და კატეგორიას აირჩევს
  // შეტყობინებები და შეთავაზებები მიდიოდეს ამ ნომერზე."
  const d = OUTBOUND.find(x => x.key === 'request.verified.provider')
  assert.ok(d && 'smsByDefault' in d, 'the one message that carries paid work is switched off again')
})

/* ═══════════ what may be seen ═══════════════════════════════════════════ */

test('a card with a face by either route counts as having one', () => {
  // ⚠️ THE MEASUREMENT THAT ALMOST EMPTIED THE SITE. 25 of 28 profiles have
  // `photoUrl = null` and 24 of those draw a perfectly good face from the
  // account avatar (app/experts/_providers → „THE PROFILE PHOTO FIRST, THE
  // ACCOUNT AVATAR SECOND"). A rule reading the column alone would have hidden
  // 28 of 28 providers. Asked as „is there a face", it hides 5.
  const base = { about: 'ა'.repeat(60), services: ['s'], areas: ['თბილისი'], categoryId: 'c' }
  assert.deepEqual(profileBlockers({ ...base, hasFace: faceFrom('data:…', null) }), [])
  assert.deepEqual(profileBlockers({ ...base, hasFace: faceFrom(null, 'data:…') }), [])
  assert.deepEqual(profileBlockers({ ...base, hasFace: faceFrom(null, null) }), ['ფოტო'])
})

test('every gap is named, in the words the provider will read', () => {
  const empty = profileBlockers({})
  assert.deepEqual(empty, ['ფოტო', 'აღწერა', 'სერვისი', 'ქალაქი', 'კატეგორია'])
  assert.equal(isProfileComplete({}), false)
  // The description floor is the application's own (MASTER.ABOUT_MIN = 40), not
  // a second number invented for the profile — somebody who satisfied the door
  // must not be refused by a rule nobody ever told them.
  const nearly = { hasFace: true, services: ['s'], areas: ['a'], categoryId: 'c' }
  assert.deepEqual(profileBlockers({ ...nearly, about: 'ა'.repeat(39) }), ['აღწერა'])
  assert.deepEqual(profileBlockers({ ...nearly, about: 'ა'.repeat(40) }), [])
})

test('an unfinished card still keeps its topics on the client form', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync('lib/requestsServer.ts', 'utf8')
  const fn = src.slice(src.indexOf('export async function coveredTopicIds'))
    .slice(0, src.slice(src.indexOf('export async function coveredTopicIds')).indexOf('\n}'))

  /* ⚠️ THIS IS THE HOLE THAT WOULD HAVE MADE THE SMS POINTLESS (2026-09-04).
     `coveredTopicIds` decides which topics the INTAKE OFFERS a client. It used
     to ask `published && available` — „the pair every routing read uses" — and
     on the day `published` became derived from completeness, that pair would
     have deleted six topics from the form: the whole cleaning family, because
     the one profile covering them was missing a category. Measured that day.

     Nobody would have seen a bug. The provider would simply never have been
     texted, because the request could never have been FILED — which is the one
     failure mode that cannot be recovered from downstream.

     Owner: „შეუვსებელს ოფერი უნდა მიდიოდეს ტელეფონზე და მეილზე რომ კლიენტი
     იშოვს და ინიციატივა ქონდეს." Verified behaviourally the same day by
     unpublishing the cleaning profile and re-asking: 44 topics both times. */
  assert.doesNotMatch(fn, /published/,
    'coveredTopicIds filters on `published` again — an unfinished card would silently delete its topics from the client form, and the request that would have reached them is never filed')
  assert.match(fn, /available: true/, 'a paused provider is still not supply')
})

test('an incomplete card cannot send an offer, but still hears about work', async () => {
  const { readFileSync } = await import('node:fs')
  const offers = readFileSync('app/api/provider/offers/route.ts', 'utf8')
  // ⚠️ HIDING THE CARD IS NOT ENOUGH ON ITS OWN. Routing is gated on
  // RequestAccess, not on `published`, so an incomplete provider still hears
  // about every request — and if they could answer one, the client would
  // receive an offer and click through to the empty profile we had just
  // decided was not fit to be seen.
  assert.match(offers, /PROFILE_INCOMPLETE/, 'the offer route no longer refuses an unfinished card')
  // ⚠️ AND THE SMS STILL GOES. Silence is what kills a new provider. Real work
  // waiting is the only strong reason to go and upload the photo, so the
  // notification is deliberately NOT gated on completeness.
  const jobs = readFileSync('lib/requestJobs.ts', 'utf8')
  assert.doesNotMatch(jobs, /profileBlockers|isProfileComplete/,
    'request routing grew a completeness gate — that silences the provider it was meant to fetch back')
  // ⚠️ AND BOTH CHANNELS. `routableProviders` keys the audience off
  // `RequestAccess`, never `published`; the loop then mails whoever has an
  // address AND texts whoever has a Georgian mobile. A phone-registered
  // provider has only the second, so removing either line silences somebody
  // completely.
  assert.doesNotMatch(
    jobs.slice(jobs.indexOf('export async function routableProviders'), jobs.indexOf('export async function notifyProviders')),
    /published/,
    'the routable audience grew a `published` filter — an unfinished card would stop hearing about work entirely')
  assert.match(jobs, /sendMail\(\{ key: 'request\.verified\.provider'/, 'the letter stopped going')
  assert.match(jobs, /sendSms\(\{ key: 'request\.verified\.provider'/, 'the text stopped going')
})
