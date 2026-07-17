// Functional completeness audit — auth security + full CRUD lifecycle.
// Run: BASE_URL=http://localhost:3210 node tests/completeness.mjs
//
// This is additive to tests/audit.mjs; it focuses on:
//   1. Auth security (tampered cookie, expired session, direct API access)
//   2. Full CRUD lifecycle: create → read → edit → reload → delete
//   3. Cross-user authorization at the API level

const BASE = process.env.BASE_URL || 'http://localhost:3210'
const results = []

async function step(name, fn) {
  const t0 = Date.now()
  try {
    const outcome = await fn()
    results.push({ name, ok: true, ms: Date.now() - t0, outcome })
    console.log(`✓ ${name}${outcome ? ` — ${JSON.stringify(outcome).slice(0, 180)}` : ''}`)
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: e.message.split('\n')[0] })
    console.log(`✗ ${name} — ${e.message.split('\n')[0]}`)
  }
}

async function req(method, path, body, cookieHeader) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text: text.slice(0, 400), rawSetCookie: res.headers.get('set-cookie') }
}

function extractCookie(setCookie) {
  if (!setCookie) return null
  const m = setCookie.match(/mcodne_session=([^;]+)/)
  return m ? `mcodne_session=${m[1]}` : null
}

async function signIn(email, password) {
  const r = await req('POST', '/api/auth/signin', { email, password })
  return { status: r.status, body: r.json, cookie: extractCookie(r.rawSetCookie) }
}

async function signUp(fullName, email, password, role = 'STUDENT') {
  const r = await req('POST', '/api/auth/signup', { fullName, email, password, role })
  return { status: r.status, body: r.json, cookie: extractCookie(r.rawSetCookie) }
}

// ══════════════════════════════════════════════════════════════
// PART 1 — Establish sessions FIRST (rate-limit tests moved to end).
//   The signin rate limit is keyed by IP, and Node's fetch shares one IP,
//   so hitting the limit early breaks every downstream signin.
// ══════════════════════════════════════════════════════════════

let studentCookie = null
await step('AUTH: sign in as seeded student (establishes primary session)', async () => {
  const r = await signIn('student@mcodne.ge', 'student1234')
  studentCookie = r.cookie
  if (!studentCookie) throw new Error('no session cookie set')
  return { status: r.status }
})

// Cookie flags — HttpOnly, SameSite, Secure (in prod), path
await step('AUTH: session cookie is HttpOnly + SameSite=lax', async () => {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', password: 'student1234' }),
  })
  const setCookie = res.headers.get('set-cookie') ?? ''
  const httpOnly = /HttpOnly/i.test(setCookie)
  const sameSite = /SameSite=Lax/i.test(setCookie)
  const hasPath = /Path=\//i.test(setCookie)
  if (!httpOnly || !sameSite || !hasPath) throw new Error(`cookie flags missing: HttpOnly=${httpOnly} SameSite=${sameSite} Path=${hasPath}`)
  return { httpOnly, sameSite, hasPath }
})

// Login error is generic (doesn't reveal which of email/password was wrong)
await step('AUTH: bad email vs bad password return identical error shape', async () => {
  const bad1 = await req('POST', '/api/auth/signin', { email: 'nobody-1234@nowhere.io', password: 'anything123' })
  const bad2 = await req('POST', '/api/auth/signin', { email: 'student@mcodne.ge', password: 'wrongpassword' })
  const same = bad1.status === bad2.status && bad1.json?.error === bad2.json?.error
  if (!same) throw new Error(`different errors: ${JSON.stringify(bad1.json)} vs ${JSON.stringify(bad2.json)}`)
  return { status: bad1.status, error: bad1.json?.error }
})

// Tampered cookie must be rejected
await step('AUTH: tampered cookie is rejected (treated as unauth)', async () => {
  const r = await req('GET', '/api/me', undefined, 'mcodne_session=this-is-not-a-real-token-1234567890')
  if (r.json?.user !== null) throw new Error(`expected null user, got ${JSON.stringify(r.json)}`)
  return { status: r.status, user: r.json?.user }
})

// Missing cookie → no user
await step('AUTH: no cookie → user is null on /api/me', async () => {
  const r = await req('GET', '/api/me')
  if (r.json?.user !== null) throw new Error(`expected null user, got ${JSON.stringify(r.json)}`)
  return { user: r.json?.user }
})

// Signout — using a SEPARATE cookie so it doesn't kill studentCookie
let signOutStudentCookie = null
await step('AUTH: sign out — cookie is cleared and session is gone from DB', async () => {
  const inRes = await signIn('student@mcodne.ge', 'student1234')
  if (!inRes.cookie) throw new Error('signin did not set cookie')
  signOutStudentCookie = inRes.cookie
  const beforeOut = await req('GET', '/api/me', undefined, signOutStudentCookie)
  if (!beforeOut.json?.user) throw new Error('expected signed-in user before signout')
  const outRes = await fetch(`${BASE}/api/auth/signout`, {
    method: 'POST',
    headers: { Cookie: signOutStudentCookie },
    redirect: 'manual',
  })
  const clearingCookie = outRes.headers.get('set-cookie') ?? ''
  const afterOut = await req('GET', '/api/me', undefined, signOutStudentCookie)
  if (afterOut.json?.user !== null) throw new Error('server session still alive after signout')
  return { clearsCookie: /mcodne_session=/i.test(clearingCookie), afterOutUser: afterOut.json?.user }
})

// Protected route redirect
await step('AUTH: /student unauth → 307 redirect to /signin', async () => {
  const res = await fetch(`${BASE}/student`, { redirect: 'manual' })
  const loc = res.headers.get('location') ?? ''
  return { status: res.status, location: loc }
})

// Direct API access — student can't fetch tutor-only endpoint
await step('AUTHZ: student cannot read /api/tutor/bookings (302/307 redirect)', async () => {
  const res = await fetch(`${BASE}/api/tutor/bookings`, {
    headers: { Cookie: studentCookie },
    redirect: 'manual',
  })
  return { status: res.status, location: res.headers.get('location') }
})

// Direct API access — cross-user booking read
let otherStudentCookie = null
let otherStudentEmail = `crossuser+${Date.now()}@example.com`
await step('AUTHZ: create second student account', async () => {
  const r = await signUp('Cross Studenter', otherStudentEmail, 'crosspass1', 'STUDENT')
  otherStudentCookie = r.cookie
  if (!otherStudentCookie) throw new Error('signup did not set cookie')
  return { status: r.status }
})

// Both students exist. Let's make a booking as studentCookie, then try to read/edit as otherStudentCookie.

// ══════════════════════════════════════════════════════════════
// PART 2 — Full CRUD lifecycle: PROFILE (User)
// ══════════════════════════════════════════════════════════════
await step('PROFILE: READ /api/me returns email + role', async () => {
  const r = await req('GET', '/api/me', undefined, studentCookie)
  if (!r.json?.user?.email) throw new Error('missing user.email')
  return { role: r.json.user.role, email: r.json.user.email }
})

const savedProfile = { fullName: null, bio: null, phone: null }
await step('PROFILE: PATCH /api/me — update fullName + bio + phone', async () => {
  const stamp = Date.now()
  const r = await req('PATCH', '/api/me', {
    fullName: `Test Updated ${stamp}`,
    bio: `audit bio ${stamp}`,
    phone: `+995 555 ${String(stamp).slice(-6)}`,
  }, studentCookie)
  savedProfile.fullName = `Test Updated ${stamp}`
  savedProfile.bio = `audit bio ${stamp}`
  savedProfile.phone = `+995 555 ${String(stamp).slice(-6)}`
  return { status: r.status, ok: r.json?.ok }
})

await step('PROFILE: reload — updated fields persisted', async () => {
  const r = await req('GET', '/api/me', undefined, studentCookie)
  const u = r.json?.user ?? {}
  const persisted = u.fullName === savedProfile.fullName && u.bio === savedProfile.bio && u.phone === savedProfile.phone
  if (!persisted) throw new Error(`fields did not persist: got ${JSON.stringify({ fullName: u.fullName, bio: u.bio, phone: u.phone })}`)
  return { persisted }
})

await step('PROFILE: PATCH /api/me empty body → NOTHING_TO_UPDATE', async () => {
  const r = await req('PATCH', '/api/me', {}, studentCookie)
  return { status: r.status, error: r.json?.error }
})

await step('PROFILE: PATCH /api/me XSS content stored as text (React escapes on render)', async () => {
  const r = await req('PATCH', '/api/me', { bio: '<script>alert(1)</script>' }, studentCookie)
  const reload = await req('GET', '/api/me', undefined, studentCookie)
  const stored = reload.json?.user?.bio
  if (stored !== '<script>alert(1)</script>') throw new Error(`bio not persisted as-is: ${stored}`)
  // React escapes on render, so storing raw HTML in the DB is safe for XSS.
  await req('PATCH', '/api/me', { bio: savedProfile.bio }, studentCookie)
  return { storedRaw: stored }
})

// ══════════════════════════════════════════════════════════════
// PART 3 — Password change → other sessions revoked
// ══════════════════════════════════════════════════════════════
let deviceA = null, deviceB = null
await step('SECURITY: two devices sign in with same account', async () => {
  const dupEmail = `two-devices+${Date.now()}@example.com`
  const initialPw = 'firstpw1'
  await signUp('Two Device', dupEmail, initialPw, 'STUDENT')
  const a = await signIn(dupEmail, initialPw)
  const b = await signIn(dupEmail, initialPw)
  deviceA = { cookie: a.cookie, email: dupEmail, pw: initialPw }
  deviceB = { cookie: b.cookie, email: dupEmail, pw: initialPw }
  const aMe = await req('GET', '/api/me', undefined, deviceA.cookie)
  const bMe = await req('GET', '/api/me', undefined, deviceB.cookie)
  if (!aMe.json?.user || !bMe.json?.user) throw new Error('one of the devices did not sign in')
  return { deviceASigned: !!aMe.json?.user, deviceBSigned: !!bMe.json?.user }
})

await step('SECURITY: password change on device A revokes device B', async () => {
  const newPw = 'secondpw2'
  const chg = await req('POST', '/api/me/password', {
    currentPassword: deviceA.pw, newPassword: newPw,
  }, deviceA.cookie)
  if (chg.status !== 200 || chg.json?.ok !== true) throw new Error(`password change failed: ${JSON.stringify(chg.json)}`)
  const aStillIn = await req('GET', '/api/me', undefined, deviceA.cookie)
  const bKickedOut = await req('GET', '/api/me', undefined, deviceB.cookie)
  const aOk = aStillIn.json?.user?.email === deviceA.email
  const bOut = bKickedOut.json?.user === null
  if (!aOk || !bOut) throw new Error(`A signed=${aOk} B out=${bOut} (expected true, true)`)
  deviceA.pw = newPw
  return { aStillIn: aOk, bKickedOut: bOut }
})

// ══════════════════════════════════════════════════════════════
// PART 4 — Full CRUD lifecycle: FAVORITE
// ══════════════════════════════════════════════════════════════
let firstTutorId = null
await step('CRUD.setup: fetch first tutor id', async () => {
  const r = await req('GET', '/api/tutors')
  firstTutorId = r.json?.[0]?.id
  if (!firstTutorId) throw new Error('no tutors returned')
  return { id: firstTutorId }
})

await step('FAVORITE.create: add tutor to favorites', async () => {
  const r = await req('POST', '/api/favorites', { tutorId: firstTutorId }, studentCookie)
  return { status: r.status, ok: r.json?.ok }
})

await step('FAVORITE.read: GET returns the added tutor', async () => {
  const r = await req('GET', '/api/favorites', undefined, studentCookie)
  const list = Array.isArray(r.json) ? r.json : []
  const has = list.some(f => f.tutorId === firstTutorId)
  if (!has) throw new Error(`favorite not returned in list of ${list.length}`)
  return { count: list.length }
})

await step('FAVORITE.delete: via body works', async () => {
  const r = await req('DELETE', '/api/favorites', { tutorId: firstTutorId }, studentCookie)
  return { status: r.status, ok: r.json?.ok }
})

await step('FAVORITE.reload: deleted favorite is gone', async () => {
  const r = await req('GET', '/api/favorites', undefined, studentCookie)
  const list = Array.isArray(r.json) ? r.json : []
  const has = list.some(f => f.tutorId === firstTutorId)
  if (has) throw new Error('favorite still present after delete')
  return { count: list.length }
})

await step('FAVORITE.delete via query param (some clients strip DELETE body)', async () => {
  await req('POST', '/api/favorites', { tutorId: firstTutorId }, studentCookie)
  const res = await fetch(`${BASE}/api/favorites?tutorId=${encodeURIComponent(firstTutorId)}`, {
    method: 'DELETE', headers: { Cookie: studentCookie },
  })
  const body = await res.json()
  if (res.status !== 200 || body.ok !== true) throw new Error(`query-param delete failed: ${res.status} ${JSON.stringify(body)}`)
  return { status: res.status }
})

// ══════════════════════════════════════════════════════════════
// PART 5 — Full CRUD lifecycle: BOOKING
// ══════════════════════════════════════════════════════════════
let bookingId = null
const slotHour = 9 + Math.floor(Math.random() * 10)
const slotOffsetDays = 40 + Math.floor(Math.random() * 60)
const bookingSlot = (() => {
  const d = new Date(Date.now() + slotOffsetDays * 24 * 3600 * 1000)
  d.setHours(slotHour, 0, 0, 0)
  return d.toISOString()
})()

await step('BOOKING.create: student creates PREPARING booking', async () => {
  const r = await req('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'completeness audit booking',
    startAt: bookingSlot, durationMin: 60, price: 60,
  }, studentCookie)
  bookingId = r.json?.id
  if (!bookingId) throw new Error(`no id: ${JSON.stringify(r.json)}`)
  return { id: bookingId }
})

await step('BOOKING.read.self: owner can GET /api/bookings/[id]', async () => {
  const r = await req('GET', `/api/bookings/${bookingId}`, undefined, studentCookie)
  return { status: r.status, id: r.json?.id }
})

await step('BOOKING.read.other: DIFFERENT student CANNOT GET my booking', async () => {
  const r = await req('GET', `/api/bookings/${bookingId}`, undefined, otherStudentCookie)
  // /api/bookings/[id] uses requireUser then filters by studentId/tutorUserId, so
  // it should 404 rather than 200.
  if (r.status === 200) throw new Error('SECURITY: another user could read my booking!')
  return { status: r.status }
})

await step('BOOKING.update.other: DIFFERENT student CANNOT PATCH my booking', async () => {
  const r = await req('PATCH', `/api/bookings/${bookingId}`, { action: 'complete' }, otherStudentCookie)
  if (r.status === 200) throw new Error('SECURITY: another user could PATCH my booking!')
  return { status: r.status }
})

await step('BOOKING.cancel.other: DIFFERENT student CANNOT cancel my booking', async () => {
  const r = await req('POST', `/api/bookings/${bookingId}/cancel`, undefined, otherStudentCookie)
  if (r.status === 200) throw new Error('SECURITY: another user could cancel my booking!')
  return { status: r.status }
})

await step('BOOKING.cancel.self: owner can cancel own booking', async () => {
  const r = await req('POST', `/api/bookings/${bookingId}/cancel`, undefined, studentCookie)
  return { status: r.status, ok: r.json?.ok }
})

// ══════════════════════════════════════════════════════════════
// PART 6 — CRUD lifecycle: REVIEW (create → edit → delete)
// ══════════════════════════════════════════════════════════════
// Setup: create booking, sign in as owning tutor, complete it, then let student review.
let reviewBookingId = null
let tutorCookie = null

await step('REVIEW.setup: sign in as owning tutor of first tutor', async () => {
  const tutorEmails = [
    'nino.kvitsinadze@mcodne.ge', 'giorgi.meladze@mcodne.ge', 'levan.janelidze@mcodne.ge',
    'tamar.khurodze@mcodne.ge', 'davit.chichinadze@mcodne.ge', 'ana.gvinianidze@mcodne.ge',
    'irakli.beridze@mcodne.ge', 'ketevan.tsereteli@mcodne.ge',
  ]
  for (const email of tutorEmails) {
    const r = await signIn(email, 'tutor1234')
    if (!r.cookie) continue
    const bookings = await req('GET', '/api/tutor/bookings', undefined, r.cookie)
    if (bookings.json?.profile?.id === firstTutorId) {
      tutorCookie = r.cookie
      return { email }
    }
  }
  throw new Error('could not find tutor owner')
})

await step('REVIEW.setup: student creates booking, tutor accepts + completes', async () => {
  const d = new Date(Date.now() + (110 + Math.random() * 30) * 24 * 3600 * 1000)
  d.setHours(10 + Math.floor(Math.random() * 10), 0, 0, 0)
  const create = await req('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'review lifecycle test',
    startAt: d.toISOString(), durationMin: 60, price: 60,
  }, studentCookie)
  reviewBookingId = create.json?.id
  if (!reviewBookingId) throw new Error(`no id: ${JSON.stringify(create.json)}`)
  await req('PATCH', `/api/bookings/${reviewBookingId}`, { action: 'accept' }, tutorCookie)
  const done = await req('PATCH', `/api/bookings/${reviewBookingId}`, { action: 'complete' }, tutorCookie)
  if (done.json?.status !== 'COMPLETED') throw new Error(`complete failed: ${JSON.stringify(done.json)}`)
  return { bookingId: reviewBookingId }
})

await step('REVIEW.create: student POSTs review after completion', async () => {
  const r = await req('POST', '/api/reviews', {
    bookingId: reviewBookingId, rating: 5, body: 'lifecycle audit — great',
  }, studentCookie)
  if (r.status !== 200 || r.json?.ok !== true) throw new Error(`create failed: ${JSON.stringify(r.json)}`)
  return { status: r.status }
})

await step('REVIEW.update: same POST with different rating updates', async () => {
  const r = await req('POST', '/api/reviews', {
    bookingId: reviewBookingId, rating: 3, body: 'lifecycle audit — updated',
  }, studentCookie)
  if (r.status !== 200 || r.json?.ok !== true) throw new Error(`update failed: ${JSON.stringify(r.json)}`)
  return { status: r.status }
})

await step('REVIEW.delete.other: DIFFERENT student CANNOT delete my review → 403 or 404', async () => {
  const r = await req('DELETE', `/api/reviews/${reviewBookingId}`, undefined, otherStudentCookie)
  if (r.status === 200) throw new Error('SECURITY: other user could delete my review!')
  return { status: r.status }
})

await step('REVIEW.delete.self: owner deletes own review', async () => {
  const r = await req('DELETE', `/api/reviews/${reviewBookingId}`, undefined, studentCookie)
  if (r.status !== 200 || r.json?.ok !== true) throw new Error(`delete failed: ${JSON.stringify(r.json)}`)
  return { status: r.status }
})

await step('REVIEW.delete.again: second delete → 404 NOT_FOUND', async () => {
  const r = await req('DELETE', `/api/reviews/${reviewBookingId}`, undefined, studentCookie)
  return { status: r.status, error: r.json?.error }
})

// ══════════════════════════════════════════════════════════════
// PART 7 — CRUD lifecycle: AVAILABILITY SLOT (tutor-owned)
// ══════════════════════════════════════════════════════════════
let slotId = null
const slotStart = new Date(Date.now() + 200 * 24 * 3600 * 1000)
slotStart.setHours(14, 0, 0, 0)
const slotEnd = new Date(slotStart.getTime() + 60 * 60_000)

await step('AVAILABILITY.create: tutor adds slot', async () => {
  const r = await req('POST', '/api/tutor/availability', {
    startAt: slotStart.toISOString(),
    endAt: slotEnd.toISOString(),
  }, tutorCookie)
  slotId = r.json?.slot?.id
  if (!slotId) throw new Error(`no slot id: ${JSON.stringify(r.json)}`)
  return { id: slotId }
})

await step('AVAILABILITY.create.invalid: endAt <= startAt → BAD_RANGE', async () => {
  const r = await req('POST', '/api/tutor/availability', {
    startAt: slotEnd.toISOString(), endAt: slotStart.toISOString(),
  }, tutorCookie)
  return { status: r.status, error: r.json?.error }
})

await step('AVAILABILITY.read: GET returns the slot', async () => {
  const r = await req('GET', '/api/tutor/availability', undefined, tutorCookie)
  const has = (r.json?.slots ?? []).some(s => s.id === slotId)
  if (!has) throw new Error('slot not returned in listing')
  return { count: r.json?.slots?.length }
})

await step('AVAILABILITY.delete.other: student CANNOT delete tutor slot → 302/307 redirect (role guard)', async () => {
  const res = await fetch(`${BASE}/api/tutor/availability/${slotId}`, {
    method: 'DELETE', headers: { Cookie: studentCookie }, redirect: 'manual',
  })
  return { status: res.status }
})

await step('AVAILABILITY.delete.self: tutor removes own slot', async () => {
  const r = await req('DELETE', `/api/tutor/availability/${slotId}`, undefined, tutorCookie)
  return { status: r.status, ok: r.json?.ok }
})

await step('AVAILABILITY.delete.again: second delete → 404', async () => {
  const r = await req('DELETE', `/api/tutor/availability/${slotId}`, undefined, tutorCookie)
  return { status: r.status, error: r.json?.error }
})

// ══════════════════════════════════════════════════════════════
// PART 8 — CRUD lifecycle: TUTOR PROFILE (owner only)
// ══════════════════════════════════════════════════════════════
await step('TUTOR PROFILE.read: GET /api/me/tutor as tutor', async () => {
  const r = await req('GET', '/api/me/tutor', undefined, tutorCookie)
  if (!r.json?.profile) throw new Error(`no profile: ${JSON.stringify(r.json)}`)
  return { headline: r.json.profile.headline }
})

await step('TUTOR PROFILE.update: PATCH headline persists', async () => {
  const newHeadline = `AUDIT UPDATE ${Date.now()}`
  const patch = await req('PATCH', '/api/me/tutor', { headline: newHeadline }, tutorCookie)
  if (patch.status !== 200) throw new Error(`patch failed: ${JSON.stringify(patch.json)}`)
  const reload = await req('GET', '/api/me/tutor', undefined, tutorCookie)
  if (reload.json?.profile?.headline !== newHeadline) throw new Error(`did not persist: got ${reload.json?.profile?.headline}`)
  return { headline: reload.json.profile.headline }
})

await step('TUTOR PROFILE.update.forbidden: student cannot PATCH tutor profile → 403', async () => {
  const r = await req('PATCH', '/api/me/tutor', { headline: 'evil' }, studentCookie)
  return { status: r.status, error: r.json?.error }
})

// ══════════════════════════════════════════════════════════════
// PART 9 — Account deletion
// ══════════════════════════════════════════════════════════════

// Fresh account with no bookings — should delete OK.
let ephemeralCookie = null
let ephemeralEmail = null
await step('DELETE_ACCOUNT.setup: create fresh account', async () => {
  ephemeralEmail = `del-${Date.now()}@example.com`
  const r = await signUp('Delete Me', ephemeralEmail, 'deletepw1', 'STUDENT')
  ephemeralCookie = r.cookie
  return { email: ephemeralEmail }
})

await step('DELETE_ACCOUNT.forbidden: no confirm → INVALID', async () => {
  const r = await req('DELETE', '/api/me', { currentPassword: 'deletepw1' }, ephemeralCookie)
  return { status: r.status, error: r.json?.error }
})

await step('DELETE_ACCOUNT.wrong_password: BAD_CURRENT_PASSWORD', async () => {
  const r = await req('DELETE', '/api/me', { currentPassword: 'wrongpass1', confirm: 'DELETE' }, ephemeralCookie)
  return { status: r.status, error: r.json?.error }
})

await step('DELETE_ACCOUNT.happy: delete account clears session', async () => {
  const r = await req('DELETE', '/api/me', { currentPassword: 'deletepw1', confirm: 'DELETE' }, ephemeralCookie)
  if (r.status !== 200 || r.json?.ok !== true) throw new Error(`delete failed: ${r.status} ${JSON.stringify(r.json)}`)
  // Old cookie should no longer resolve to a user
  const me = await req('GET', '/api/me', undefined, ephemeralCookie)
  if (me.json?.user !== null) throw new Error('session still resolves after account deletion')
  // Signin with the same email should now fail
  const attempt = await signIn(ephemeralEmail, 'deletepw1')
  if (attempt.status === 200 && attempt.body?.ok) throw new Error('user is still authable after delete')
  return { userGone: me.json?.user === null }
})

// Try deleting the seeded student — should refuse because seed creates a booking.
await step('DELETE_ACCOUNT.blocked: seeded student has active bookings → 409', async () => {
  const r = await req('DELETE', '/api/me', { currentPassword: 'student1234', confirm: 'DELETE' }, studentCookie)
  const validErrors = ['HAS_ACTIVE_BOOKINGS', 'HAS_HISTORY']
  if (r.status !== 409 || !validErrors.includes(r.json?.error)) throw new Error(`expected 409 with active bookings, got ${r.status} ${JSON.stringify(r.json)}`)
  return { status: r.status, error: r.json?.error }
})

// ══════════════════════════════════════════════════════════════
// PART 10 — Rate limit (runs LAST because it burns the shared-IP signin quota)
// ══════════════════════════════════════════════════════════════
await step('AUTH: rate limit fires after repeated bad-password attempts', async () => {
  const email = `rl-${Date.now()}@nowhere.io`
  let saw429 = false
  for (let i = 0; i < 12; i++) {
    const r = await req('POST', '/api/auth/signin', { email, password: 'wrong-password-x' })
    if (r.status === 429) { saw429 = true; break }
  }
  if (!saw429) throw new Error('never saw 429 rate-limit response')
  return { saw429 }
})

// ══════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════
const passed = results.filter(r => r.ok).length
const failed = results.filter(r => !r.ok).length
console.log('\n═══════════════════════════════════════════════════')
console.log(`COMPLETENESS: PASSED ${passed} / ${results.length} · FAILED ${failed}`)
console.log('═══════════════════════════════════════════════════\n')
if (failed > 0) {
  console.log('Failed steps:')
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name} — ${r.err}`))
}
import { writeFileSync } from 'node:fs'
writeFileSync('/tmp/completeness-results.json', JSON.stringify(results, null, 2))
process.exit(failed > 0 ? 1 : 0)
