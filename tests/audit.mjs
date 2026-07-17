// Functional audit — happy path + invalid input + edge cases
// Run: BASE_URL=http://localhost:3210 node tests/audit.mjs
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3210'
const results = []

const browser = await chromium.launch({ headless: true })
const baseCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await baseCtx.newPage()

let currentErrors = []
let currentRequests = []
page.on('pageerror', e => currentErrors.push(`ERR: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') currentErrors.push(`CONSOLE: ${m.text().slice(0, 200)}`) })
page.on('request', r => { if (r.url().includes('/api/')) currentRequests.push(`${r.method()} ${new URL(r.url()).pathname}`) })

async function step(name, fn) {
  currentErrors = []; currentRequests = []
  const t0 = Date.now()
  try {
    const outcome = await fn()
    results.push({ name, ok: true, ms: Date.now() - t0, outcome, errors: [...currentErrors], requests: [...currentRequests] })
    console.log(`✓ ${name}${outcome ? ` — ${JSON.stringify(outcome).slice(0, 160)}` : ''}`)
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: e.message.split('\n')[0], errors: [...currentErrors], requests: [...currentRequests] })
    console.log(`✗ ${name} — ${e.message.split('\n')[0]}`)
  }
}

// Small helper: hit an API directly
async function api(method, path, body, cookieHeader) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text: text.slice(0, 400) }
}

// ────────── 1. HOME PAGE ──────────
await step('HOME: loads without console errors', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  return { title: await page.title() }
})

await step('HOME: hero search redirects to /tutors?q=', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const input = page.locator('input[placeholder*="Series A"], input[placeholder*="fundraising"], header input[type="text"], main input[type="text"]').first()
  await input.fill('SEO')
  await input.press('Enter')
  await page.waitForTimeout(1200)
  return { url: page.url() }
})

// ────────── 2. TUTORS LISTING ──────────
await step('TUTORS: list loads and shows cards', async () => {
  await page.goto(`${BASE}/tutors`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const cards = await page.locator('article, [data-tutor], a[href^="/tutors/"]').count()
  return { cards }
})

await step('TUTORS: API returns seed data', async () => {
  const r = await api('GET', '/api/tutors')
  return { status: r.status, count: Array.isArray(r.json) ? r.json.length : 'not-array' }
})

await step('TUTORS: search by query returns matching subset', async () => {
  const r = await api('GET', '/api/tutors?q=McKinsey')
  return { status: r.status, count: Array.isArray(r.json) ? r.json.length : 'na' }
})

await step('TUTORS: search by non-existent term returns empty array', async () => {
  const r = await api('GET', '/api/tutors?q=zzzzz-no-match-zzzz')
  return { status: r.status, count: Array.isArray(r.json) ? r.json.length : 'na' }
})

// ────────── 3. TUTOR DETAIL ──────────
let firstTutorId = null
await step('TUTORS: fetch first id from API', async () => {
  const r = await api('GET', '/api/tutors')
  firstTutorId = r.json?.[0]?.id
  return { id: firstTutorId }
})

await step('TUTOR DETAIL: page loads for existing id', async () => {
  if (!firstTutorId) throw new Error('no tutor id from earlier step')
  await page.goto(`${BASE}/tutors/${firstTutorId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  return { url: page.url() }
})

await step('TUTOR DETAIL: API 404 for bad id', async () => {
  const r = await api('GET', '/api/tutors/does-not-exist')
  return { status: r.status, body: r.json }
})

await step('TUTOR DETAIL: page for bad id — does it crash?', async () => {
  await page.goto(`${BASE}/tutors/definitely-not-a-real-id`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  return { url: page.url(), title: await page.title() }
})

// ────────── 4. AUTH — SIGNUP ──────────
const TEST_EMAIL = `qa+${Date.now()}@example.com`
const TEST_PASS = 'testpassword123'
let sessionCookie = null

await step('AUTH: signup — happy path (valid data)', async () => {
  const r = await api('POST', '/api/auth/signup', {
    fullName: 'QA Bot',
    email: TEST_EMAIL,
    password: TEST_PASS,
    role: 'STUDENT',
  })
  // capture session cookie
  return { status: r.status, body: r.json }
})

await step('AUTH: signup — invalid email rejected', async () => {
  const r = await api('POST', '/api/auth/signup', {
    fullName: 'X', email: 'not-an-email', password: 'testpass1',
  })
  return { status: r.status, body: r.json }
})

await step('AUTH: signup — short password rejected', async () => {
  const r = await api('POST', '/api/auth/signup', {
    fullName: 'X X', email: 'a@b.co', password: '123',
  })
  return { status: r.status, body: r.json }
})

await step('AUTH: signup — duplicate email rejected', async () => {
  const r = await api('POST', '/api/auth/signup', {
    fullName: 'QA Bot 2', email: TEST_EMAIL, password: TEST_PASS,
  })
  return { status: r.status, body: r.json }
})

await step('AUTH: signup — missing required fields rejected', async () => {
  const r = await api('POST', '/api/auth/signup', { email: 'a@b.co' })
  return { status: r.status, body: r.json }
})

await step('AUTH: signup — XSS in fullName is stored (not sanitized)', async () => {
  const r = await api('POST', '/api/auth/signup', {
    fullName: '<script>alert(1)</script>Attacker',
    email: `xss+${Date.now()}@x.com`, password: TEST_PASS,
  })
  return { status: r.status, body: r.json }
})

// ────────── 5. AUTH — SIGNIN (with cookies via browser context) ──────────
await step('AUTH: signin — bad credentials rejected', async () => {
  const r = await api('POST', '/api/auth/signin', {
    email: 'nobody@nowhere.io', password: 'wrongpassword',
  })
  return { status: r.status, body: r.json }
})

await step('AUTH: signin — seeded student login works', async () => {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', password: 'student1234' }),
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) {
    const match = setCookie.match(/mcodne_session=([^;]+)/)
    if (match) sessionCookie = `mcodne_session=${match[1]}`
  }
  const json = await res.json()
  return { status: res.status, body: json, cookie: !!sessionCookie }
})

await step('AUTH: me — returns user info when signed in', async () => {
  const r = await api('GET', '/api/me', null, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('AUTH: me — returns null user when unsigned', async () => {
  const r = await api('GET', '/api/me', null)
  return { status: r.status, body: r.json }
})

// ────────── 6. BOOKINGS ──────────
await step('BOOKINGS: GET without auth → 401', async () => {
  const r = await api('GET', '/api/bookings')
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: GET with auth returns list', async () => {
  const r = await api('GET', '/api/bookings', null, sessionCookie)
  return { status: r.status, count: Array.isArray(r.json) ? r.json.length : 'na' }
})

await step('BOOKINGS: POST past date rejected', async () => {
  const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const r = await api('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'test past', startAt: past,
    durationMin: 60, price: 60,
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: POST — non-existent tutor rejected', async () => {
  const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const r = await api('POST', '/api/bookings', {
    tutorId: 'no-such-tutor', topic: 'x', startAt: future,
    durationMin: 60, price: 60,
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: POST — invalid duration rejected (too short)', async () => {
  const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const r = await api('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'topic', startAt: future,
    durationMin: 5, price: 60,
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: POST — negative price accepted? (edge)', async () => {
  const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const r = await api('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'topic', startAt: future,
    durationMin: 60, price: -100,
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: POST — topic too short (<3) rejected', async () => {
  const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const r = await api('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'ab', startAt: future,
    durationMin: 60, price: 60,
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

// Happy path booking
let createdBookingId = null
// randomize slot to prevent collisions across audit runs
const slotOffsetDays = 30 + Math.floor(Math.random() * 60)
const slotHour = 9 + Math.floor(Math.random() * 10)
const bookingSlot = (() => {
  const d = new Date(Date.now() + slotOffsetDays * 24 * 3600 * 1000)
  d.setHours(slotHour, 0, 0, 0)
  return d.toISOString()
})()

await step('BOOKINGS: POST — happy path booking created', async () => {
  const r = await api('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'audit test session',
    startAt: bookingSlot, durationMin: 60, price: 60,
    studentNotes: 'automated test',
  }, sessionCookie)
  createdBookingId = r.json?.id
  return { status: r.status, id: createdBookingId }
})

await step('BOOKINGS: POST — double-book same slot rejected (SLOT_TAKEN)', async () => {
  const r = await api('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'audit test session 2',
    startAt: bookingSlot, durationMin: 60, price: 60,
  }, sessionCookie)
  const passed = r.status === 409 && r.json?.error === 'SLOT_TAKEN'
  if (!passed) throw new Error(`expected 409/SLOT_TAKEN, got ${r.status} ${JSON.stringify(r.json)}`)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: POST — partial overlap rejected', async () => {
  const overlap = new Date(new Date(bookingSlot).getTime() + 30 * 60 * 1000).toISOString()
  const r = await api('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'audit test session 3',
    startAt: overlap, durationMin: 60, price: 60,
  }, sessionCookie)
  const passed = r.status === 409 && r.json?.error === 'SLOT_TAKEN'
  if (!passed) throw new Error(`expected 409/SLOT_TAKEN for overlap, got ${r.status} ${JSON.stringify(r.json)}`)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: cancel — happy path', async () => {
  if (!createdBookingId) throw new Error('no bookingId')
  const r = await api('POST', `/api/bookings/${createdBookingId}/cancel`, null, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: cancel already cancelled — rejected', async () => {
  if (!createdBookingId) throw new Error('no bookingId')
  const r = await api('POST', `/api/bookings/${createdBookingId}/cancel`, null, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS: cancel non-existent — 404', async () => {
  const r = await api('POST', '/api/bookings/no-such-id/cancel', null, sessionCookie)
  return { status: r.status, body: r.json }
})

// ────────── 7. FAVORITES ──────────
await step('FAVORITES: POST without auth → 401', async () => {
  const r = await api('POST', '/api/favorites', { tutorId: firstTutorId })
  return { status: r.status, body: r.json }
})

await step('FAVORITES: POST — happy path add', async () => {
  const r = await api('POST', '/api/favorites', { tutorId: firstTutorId }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('FAVORITES: POST — duplicate is idempotent', async () => {
  const r = await api('POST', '/api/favorites', { tutorId: firstTutorId }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('FAVORITES: POST — nonexistent tutor → 404', async () => {
  const r = await api('POST', '/api/favorites', { tutorId: 'no-such-tutor' }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('FAVORITES: GET — returns list', async () => {
  const r = await api('GET', '/api/favorites', null, sessionCookie)
  return { status: r.status, count: Array.isArray(r.json) ? r.json.length : 'na' }
})

await step('FAVORITES: DELETE — happy path', async () => {
  const r = await api('DELETE', '/api/favorites', { tutorId: firstTutorId }, sessionCookie)
  return { status: r.status, body: r.json }
})

// ────────── 8. REVIEWS ──────────
await step('REVIEWS: POST — rating out of range rejected', async () => {
  const r = await api('POST', '/api/reviews', {
    bookingId: 'x', rating: 6, body: 'text at least 3 chars',
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('REVIEWS: POST — booking that isn\'t mine → 403', async () => {
  const r = await api('POST', '/api/reviews', {
    bookingId: 'bogus', rating: 5, body: 'ok cool',
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

// ────────── 9. MESSAGES ──────────
await step('MESSAGES: POST empty body rejected', async () => {
  const r = await api('POST', '/api/messages', { bookingId: 'x', body: '' }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('MESSAGES: POST 3000-char body rejected (>2000)', async () => {
  const r = await api('POST', '/api/messages', {
    bookingId: 'x', body: 'a'.repeat(3000),
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

// ────────── 10. APPLICATIONS ──────────
await step('APPLICATIONS: POST without auth → 401', async () => {
  const r = await api('POST', '/api/applications', {
    fullName: 'Anon', phone: '5551234', specialty: 'X',
    yearsExp: 5, hourlyRate: 100, motivation: 'x'.repeat(30),
  })
  return { status: r.status, body: r.json }
})

await step('APPLICATIONS: POST — hourlyRate below 10 rejected', async () => {
  const r = await api('POST', '/api/applications', {
    fullName: 'Test Applicant', phone: '5551234', specialty: 'consulting',
    yearsExp: 5, hourlyRate: 5, motivation: 'x'.repeat(30),
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('APPLICATIONS: POST — motivation too short (<20) rejected', async () => {
  const r = await api('POST', '/api/applications', {
    fullName: 'Test', phone: '5551234', specialty: 'x',
    yearsExp: 3, hourlyRate: 50, motivation: 'short',
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('APPLICATIONS: POST — happy path', async () => {
  const r = await api('POST', '/api/applications', {
    fullName: 'Test Applicant', phone: '555-1234', city: 'Tbilisi',
    specialty: 'startup mentoring', yearsExp: 7,
    hourlyRate: 90, motivation: 'I want to help students by ' + 'x'.repeat(30),
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

// ────────── 11. ADMIN gate ──────────
await step('ADMIN: /api/admin/stats without auth redirects (student not admin)', async () => {
  const r = await api('GET', '/api/admin/stats', null, sessionCookie)
  return { status: r.status, bodyPreview: r.text.slice(0, 100) }
})

// ────────── 12. UPLOADS ──────────
await step('UPLOADS: POST without auth → 401', async () => {
  const res = await fetch(`${BASE}/api/uploads`, { method: 'POST' })
  const text = await res.text()
  return { status: res.status, body: text.slice(0, 200) }
})

// ────────── 13. UI SMOKE ──────────
await step('UI: /apply page loads', async () => {
  await page.goto(`${BASE}/apply`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  return { url: page.url(), title: await page.title() }
})

await step('UI: /signin page loads', async () => {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  return { title: await page.title() }
})

await step('UI: /student redirects when unauthed', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/student`, { waitUntil: 'domcontentloaded' })
  const url = p.url()
  await ctx.close()
  return { url }
})

await step('UI: /admin redirects when unauthed', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
  const url = p.url()
  await ctx.close()
  return { url }
})

await step('UI: /tutor redirects when unauthed', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/tutor`, { waitUntil: 'domcontentloaded' })
  const url = p.url()
  await ctx.close()
  return { url }
})

await step('UI: help/privacy/terms load', async () => {
  const out = {}
  for (const path of ['/help', '/privacy', '/terms']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    out[path] = { title: await page.title(), url: page.url() }
  }
  return out
})

// ────────── 14. BROWSER: signin form UI ──────────
await step('UI SIGNIN: Google/Apple OAuth buttons are disabled (coming-soon)', async () => {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const g = page.locator('button:has-text("Google")').first()
  const a = page.locator('button:has-text("Apple")').first()
  const gDisabled = await g.isDisabled().catch(() => null)
  const aDisabled = await a.isDisabled().catch(() => null)
  if (!gDisabled || !aDisabled) throw new Error(`Expected disabled: google=${gDisabled} apple=${aDisabled}`)
  return { gDisabled, aDisabled }
})

// ────────── 15. UI: booking modal error surface ──────────
await step('UI TUTOR: booking modal renders on tutor detail page', async () => {
  if (!firstTutorId) throw new Error('no tutor id')
  await page.goto(`${BASE}/tutors/${firstTutorId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  // Just verify the page loaded and shows a booking-related button
  const bookBtn = await page.locator('button:has-text("დაჯავშნა"), button:has-text("უფასო")').first().count()
  return { hasBookingBtn: bookBtn > 0 }
})

// ────────── 16. UI: tutors empty state ──────────
await step('UI TUTORS: empty state renders when search returns nothing', async () => {
  await page.goto(`${BASE}/tutors?q=xxxxxxx-no-such-tutor`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  return { title: await page.title(), url: page.url() }
})

// ────────── 17. New endpoints ──────────
await step('ME PATCH: unauth → 401', async () => {
  const r = await api('PATCH', '/api/me', { fullName: 'X' })
  return { status: r.status, body: r.json }
})

await step('ME PATCH: update fullName (auth)', async () => {
  const r = await api('PATCH', '/api/me', { fullName: 'თამარ ლომიძე' }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('ME PATCH: bad current password rejected', async () => {
  const r = await api('PATCH', '/api/me', { currentPassword: 'wrong-current-pw', newPassword: 'newpass1' }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('ME PATCH: newPassword without currentPassword rejected', async () => {
  const r = await api('PATCH', '/api/me', { newPassword: 'newpass1' }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('ME PATCH: empty body rejected', async () => {
  const r = await api('PATCH', '/api/me', {}, sessionCookie)
  return { status: r.status, body: r.json }
})

// Booking PATCH — tutor accept/decline
// Setup: create a booking, then sign in as tutor (owner of that tutor) and accept it.
let newBookingForAcceptId = null
await step('BOOKINGS: create fresh PREPARING booking for accept test', async () => {
  if (!firstTutorId) throw new Error('no tutor id')
  const future = new Date(Date.now() + Math.floor(Math.random() * 60 + 60) * 24 * 3600 * 1000)
  future.setHours(9 + Math.floor(Math.random() * 12), 0, 0, 0)
  const r = await api('POST', '/api/bookings', {
    tutorId: firstTutorId, topic: 'audit tutor accept test',
    startAt: future.toISOString(), durationMin: 60, price: 60,
  }, sessionCookie)
  newBookingForAcceptId = r.json?.id
  return { status: r.status, id: newBookingForAcceptId }
})

let tutorCookie = null
await step('AUTH: sign in as tutor (owner of first tutor)', async () => {
  const tutorEmails = [
    'nino.kvitsinadze@mcodne.ge', 'giorgi.meladze@mcodne.ge', 'levan.janelidze@mcodne.ge',
    'tamar.khurodze@mcodne.ge', 'davit.chichinadze@mcodne.ge', 'ana.gvinianidze@mcodne.ge',
    'irakli.beridze@mcodne.ge', 'ketevan.tsereteli@mcodne.ge',
  ]
  // The first tutor was returned by /api/tutors (order: verified desc, rating desc).
  // We don't know which — try each until sign-in works and /api/tutor/bookings returns our booking.
  for (const email of tutorEmails) {
    const res = await fetch(`${BASE}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'tutor1234' }),
    })
    const setCookie = res.headers.get('set-cookie')
    if (!setCookie) continue
    const m = setCookie.match(/mcodne_session=([^;]+)/)
    if (!m) continue
    const cookie = `mcodne_session=${m[1]}`
    // check if this tutor owns firstTutorId
    const meRes = await fetch(`${BASE}/api/tutor/bookings`, { headers: { Cookie: cookie } })
    if (!meRes.ok) continue
    const body = await meRes.json()
    if (body?.profile?.id === firstTutorId) {
      tutorCookie = cookie
      return { email, ok: true }
    }
  }
  throw new Error('could not find tutor owner')
})

await step('BOOKINGS PATCH: unauth → 401', async () => {
  const r = await api('PATCH', `/api/bookings/${newBookingForAcceptId}`, { action: 'accept' })
  return { status: r.status, body: r.json }
})

await step('BOOKINGS PATCH: student cannot accept (not the tutor) → 404', async () => {
  const r = await api('PATCH', `/api/bookings/${newBookingForAcceptId}`, { action: 'accept' }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS PATCH: tutor accept happy path', async () => {
  const r = await api('PATCH', `/api/bookings/${newBookingForAcceptId}`, { action: 'accept' }, tutorCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS PATCH: accepting already-CONFIRMED → BAD_STATE', async () => {
  const r = await api('PATCH', `/api/bookings/${newBookingForAcceptId}`, { action: 'accept' }, tutorCookie)
  return { status: r.status, body: r.json }
})

await step('BOOKINGS PATCH: complete a CONFIRMED booking', async () => {
  const r = await api('PATCH', `/api/bookings/${newBookingForAcceptId}`, { action: 'complete' }, tutorCookie)
  return { status: r.status, body: r.json }
})

// Reviews after complete
await step('REVIEWS: after complete, student can leave review', async () => {
  const r = await api('POST', '/api/reviews', {
    bookingId: newBookingForAcceptId, rating: 5, body: 'audit test — great session',
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

await step('REVIEWS: upsert (second review updates existing)', async () => {
  const r = await api('POST', '/api/reviews', {
    bookingId: newBookingForAcceptId, rating: 4, body: 'audit test — updated review',
  }, sessionCookie)
  return { status: r.status, body: r.json }
})

// busySlots exposed on tutor detail
await step('TUTOR DETAIL API: returns busySlots array', async () => {
  const r = await api('GET', `/api/tutors/${firstTutorId}`)
  return { status: r.status, hasBusySlots: Array.isArray(r.json?.busySlots), sample: r.json?.busySlots?.[0] ?? null }
})

// Settings page
await step('UI: /settings redirects when unauthed', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  const url = p.url()
  await ctx.close()
  return { url }
})

await step('UI: /settings loads for signed-in user (shows profile fields)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([{ name: 'mcodne_session', value: sessionCookie.replace('mcodne_session=', ''), url: BASE }])
  const p = await ctx.newPage()
  await p.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  const hasNameField = await p.locator('input[type="text"]').first().count() > 0
  const hasPwField = await p.locator('input[type="password"]').first().count() > 0
  await ctx.close()
  return { hasNameField, hasPwField }
})

// ────────── SUMMARY ──────────
await browser.close()

const passed = results.filter(r => r.ok).length
const failed = results.filter(r => !r.ok).length
const withErrors = results.filter(r => r.errors.length > 0).length
console.log('\n═══════════════════════════════════════════════════')
console.log(`PASSED: ${passed} / ${results.length} · FAILED: ${failed} · WITH_PAGE_ERRORS: ${withErrors}`)
console.log('═══════════════════════════════════════════════════\n')

// Print full JSON to a file for downstream analysis
import { writeFileSync } from 'node:fs'
writeFileSync('/tmp/audit-results.json', JSON.stringify(results, null, 2))
console.log('Full report → /tmp/audit-results.json')
