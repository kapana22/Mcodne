import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

// Login as tutor
await page.goto('https://mcodne.ge/signin')
await page.fill('input[type=email]', 'giorgi.meladze@mcodne.ge')
await page.fill('input[type=password]', 'tutor1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/tutor/)

const cookie = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ')
const data = await (await fetch('https://mcodne.ge/api/tutor/bookings', { headers: { cookie } })).json()
const bookingId = data.bookings?.[0]?.id
console.log(`Tutor's first booking: ${bookingId}`)

if (bookingId) {
  // Try /student/bookings/[id]
  console.log('\n=== Tutor accessing /student/bookings/[id] ===')
  const r = await page.goto(`https://mcodne.ge/student/bookings/${bookingId}`)
  await page.waitForTimeout(2000)
  console.log(`  Status: ${r?.status()}, URL: ${page.url()}`)

  const compose = await page.$('textarea[placeholder*="მიუწერე"]')
  console.log(`  Message compose visible for tutor: ${!!compose}`)

  // Try API directly
  const bkRes = await fetch(`https://mcodne.ge/api/bookings/${bookingId}`, { headers: { cookie } })
  console.log(`  GET /api/bookings/${bookingId}: ${bkRes.status}`)

  // Try posting a message as tutor
  const msg = await fetch('https://mcodne.ge/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ bookingId, body: 'გამარჯობა სტუდენტო — ტუტორისგან' }),
  })
  console.log(`  POST /api/messages as tutor: ${msg.status}`)
}

// Now test admin reject
console.log('\n=== ADMIN REJECT flow ===')
await ctx.clearCookies()
await page.goto('https://mcodne.ge/signin')
await page.fill('input[type=email]', 'admin@mcodne.ge')
await page.fill('input[type=password]', 'admin1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/admin/)
const adminCookie = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ')
const apps = await (await fetch('https://mcodne.ge/api/admin/applications', { headers: { cookie: adminCookie } })).json()
const submitted = apps.filter(a => a.status === 'SUBMITTED')
console.log(`  SUBMITTED applications: ${submitted.length}`)
if (submitted[0]) {
  const rejectRes = await fetch(`https://mcodne.ge/api/applications/${submitted[0].id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ action: 'reject', note: 'test reject' }),
  })
  console.log(`  PATCH reject: ${rejectRes.status}`)
}

await browser.close()
