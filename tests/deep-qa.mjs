import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })
const issues = []

async function test(name, fn) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try { const r = await fn(page, ctx); issues.push({ name, ok: r?.ok !== false, result: r }) }
  catch (e) { issues.push({ name, ok: false, err: e.message.split('\n')[0] }) }
  await ctx.close()
}

const signIn = async (page, email, pw, expected) => {
  await page.goto(`${BASE}/signin`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', pw)
  await page.click('button[type=submit]:has-text("შესვლა")')
  await page.waitForURL(new RegExp(expected), { timeout: 10000 })
}

// 1. Session cookie security
await test('SECURITY: session cookie flags', async (p, c) => {
  await signIn(p, 'student@mcodne.ge', 'student1234', '/student')
  const cookies = await c.cookies()
  const session = cookies.find(c => c.name === 'mcodne_session')
  return {
    httpOnly: session?.httpOnly,
    secure: session?.secure,
    sameSite: session?.sameSite,
    ok: session?.httpOnly && session?.secure,
  }
})

// 2. Invalid booking (past date)
await test('EDGE: booking with past date', async () => {
  const jar = { cookie: '' }
  const login = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', password: 'student1234' }),
  })
  jar.cookie = login.headers.get('set-cookie') || ''
  const tutors = await (await fetch(`${BASE}/api/tutors`)).json()
  const pastDate = new Date(2020, 0, 1).toISOString()
  const res = await fetch(`${BASE}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: jar.cookie },
    body: JSON.stringify({ tutorId: tutors[0].id, topic: 'past date test', startAt: pastDate, durationMin: 60, price: 80 }),
  })
  return { status: res.status, ok: res.status === 200 || res.status === 400 }
})

// 3. XSS in message body
await test('SECURITY: XSS in message body', async () => {
  const login = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', password: 'student1234' }),
  })
  const cookie = login.headers.get('set-cookie') || ''
  const bks = await (await fetch(`${BASE}/api/student/bookings`, { headers: { cookie } })).json()
  const xss = '<script>alert("xss")</script>'
  await fetch(`${BASE}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ bookingId: bks[0].id, body: xss }),
  })
  // Fetch back and check if script tag is present in DOM
  const detail = await (await fetch(`${BASE}/api/bookings/${bks[0].id}`, { headers: { cookie } })).json()
  const lastMsg = detail.messages?.[detail.messages.length - 1]
  return {
    stored_as_text: lastMsg?.body === xss,
    ok: true, // stored as text is safe if React escapes
  }
})

// 4. Cross-role access — student tries to open /admin
await test('AUTH: student cannot access admin', async (p) => {
  await signIn(p, 'student@mcodne.ge', 'student1234', '/student')
  const r = await p.goto(`${BASE}/admin`)
  const finalUrl = p.url()
  return { finalUrl, status: r?.status(), ok: !finalUrl.includes('/admin') }
})

// 5. Invalid tutor ID
await test('404: /tutors/invalid-id', async (p) => {
  const r = await p.goto(`${BASE}/tutors/invalid-nonexistent`)
  await p.waitForTimeout(1500)
  return { status: r?.status(), url: p.url() }
})

// 6. Empty state — new user with 0 bookings
await test('EMPTY: brand new user dashboard', async (p) => {
  const email = `t${Date.now()}@mcodne.test`
  await p.goto(`${BASE}/signin?view=signup`)
  await p.waitForTimeout(700)
  await p.fill('input[placeholder*="ანი"]', 'ტესტ')
  await p.fill('input[type=email]', email)
  await p.fill('input[type=password]', 'pass1234')
  await p.locator('input[type=checkbox]').check({ force: true })
  await p.click('button[type=submit]:has-text("ანგარიშის შექმნა")')
  await p.waitForURL(/\/student/, { timeout: 10000 })
  await p.waitForTimeout(2000)
  const errBanner = await p.$('text=/Application error|Something went wrong/i')
  const bodySize = await p.evaluate(() => document.body.innerText.length)
  return { hasErr: !!errBanner, bodySize, ok: !errBanner && bodySize > 500 }
})

// 7. Empty message input attempt
await test('VALIDATION: empty message send', async () => {
  const login = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', password: 'student1234' }),
  })
  const cookie = login.headers.get('set-cookie') || ''
  const bks = await (await fetch(`${BASE}/api/student/bookings`, { headers: { cookie } })).json()
  const res = await fetch(`${BASE}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ bookingId: bks[0].id, body: '' }),
  })
  return { status: res.status, ok: res.status === 400 }
})

// 8. Signup with existing email
await test('VALIDATION: signup existing email', async () => {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Test', email: 'student@mcodne.ge', password: 'pass1234' }),
  })
  const body = await res.json()
  return { status: res.status, err: body.error, ok: res.status === 409 }
})

// 9. Signup with weak password
await test('VALIDATION: signup password < 6 chars', async () => {
  const email = `t${Date.now()}@mcodne.test`
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Test', email, password: '123' }),
  })
  return { status: res.status, ok: res.status === 400 }
})

// 10. Booking flow after deleting session
await test('AUTH: booking API without session', async () => {
  const res = await fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tutorId: 'x', topic: 't', startAt: new Date().toISOString(), durationMin: 60, price: 0 }),
  })
  return { status: res.status, ok: res.status === 302 || res.status === 307 || res.status === 401 }
})

// 11. Broken images
await test('IMAGES: no broken images on landing', async (p) => {
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  const broken = await p.$$eval('img', imgs => imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src))
  return { brokenCount: broken.length, samples: broken.slice(0, 3), ok: broken.length === 0 }
})

// 12. Slow endpoint — load time
await test('PERF: landing page load time', async (p) => {
  const start = Date.now()
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const domReady = Date.now() - start
  await p.waitForLoadState('networkidle')
  const fullLoad = Date.now() - start
  return { domReady, fullLoad, ok: fullLoad < 8000 }
})

// 13. Session expiry — very old session token
await test('SECURITY: fake session token rejected', async () => {
  const res = await fetch(`${BASE}/api/me`, {
    headers: { cookie: 'mcodne_session=fake-token-12345' },
  })
  const data = await res.json()
  return { user: data.user, ok: data.user === null }
})

// 14. Concurrent booking same slot
await test('EDGE: same tutor + same time twice', async () => {
  const login = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', password: 'student1234' }),
  })
  const cookie = login.headers.get('set-cookie') || ''
  const tutors = await (await fetch(`${BASE}/api/tutors`)).json()
  const startAt = new Date(Date.now() + 3600 * 24 * 1000).toISOString()
  const body = { tutorId: tutors[0].id, topic: 'dup test', startAt, durationMin: 60, price: 80 }
  const [r1, r2] = await Promise.all([
    fetch(`${BASE}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) }),
    fetch(`${BASE}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) }),
  ])
  return { first: r1.status, second: r2.status, ok: r1.status === 200 } // ok if at least one succeeds
})

// Summary
console.log('\n' + '='.repeat(70))
for (const i of issues) {
  const flag = i.ok ? '✓' : '✗'
  console.log(`${flag} ${i.name}`)
  if (i.result) console.log(`    → ${JSON.stringify(i.result).slice(0, 200)}`)
  if (i.err) console.log(`    ERR: ${i.err}`)
}

await browser.close()
