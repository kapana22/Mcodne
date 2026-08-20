import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

async function shot(url, name) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `/tmp/mcodne-screens/${name}.png`, fullPage: false })
  const size = await page.evaluate(() => document.body.scrollHeight)
  console.log(`  ${name}: viewport captured, page height=${size}px`)
}

await shot('/', 'landing')
await shot('/tutors', 'tutors')
await shot('/signin', 'signin')
await shot('/signin?view=signup', 'signup')
await shot('/apply', 'apply')

// Sign in as student
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/, { timeout: 8000 })
await shot('/me', 'student')

// Get tutor & booking IDs
const tutorsRes = await fetch(`${BASE}/api/tutors`)
const tutors = await tutorsRes.json()
await shot(`/tutors/${tutors[0].id}`, 'expert-profile')

const bookingsRes = await fetch(`${BASE}/api/student/bookings`, {
  headers: { cookie: (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ') }
})
const bookings = await bookingsRes.json()
if (bookings[0]) {
  await shot(`/me/bookings/${bookings[0].id}`, 'booking-detail')
  await shot(`/session/${bookings[0].id}`, 'session')
}

// Admin
await ctx.clearCookies()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'admin@mcodne.ge')
await page.fill('input[type=password]', 'admin1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/admin/, { timeout: 8000 })
await shot('/admin', 'admin')

// Tutor
await ctx.clearCookies()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'giorgi.meladze@mcodne.ge')
await page.fill('input[type=password]', 'tutor1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/tutor/, { timeout: 8000 })
await shot('/work', 'tutor')

await browser.close()
console.log('done')
