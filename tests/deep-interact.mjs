import { chromium } from 'playwright'
const BASE = process.env.BASE_URL || 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })

const ctx = await browser.newContext()
const page = await ctx.newPage()

const errs = []
page.on('pageerror', e => errs.push({ type: 'pageerror', msg: e.message.split('\n')[0], url: page.url() }))
page.on('console', m => { if (m.type() === 'error') errs.push({ type: 'console', msg: m.text().slice(0, 200), url: page.url() }) })
page.on('response', r => { if (r.status() >= 500) errs.push({ type: 'http500', msg: `${r.status()} ${r.url()}`, url: page.url() }) })

// Get a real tutor ID
const tutorsRes = await fetch(`${BASE}/api/tutors`)
const tutors = await tutorsRes.json()
const tutorId = tutors[0]?.id
console.log(`Real tutor ID: ${tutorId} (${tutors[0]?.user?.fullName})`)

// Sign in as student first
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/, { timeout: 8000 })

// Visit real tutor profile
console.log(`\n=== /tutors/${tutorId} ===`)
await page.goto(`${BASE}/tutors/${tutorId}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
console.log('URL:', page.url())

// Try to click booking buttons
const bookButtons = await page.$$('button:has-text("დაჯავშნა"), button:has-text("დაიჯავშნე"), button:has-text("ჯავშანი")')
console.log(`Found ${bookButtons.length} booking buttons`)
for (let i = 0; i < Math.min(bookButtons.length, 3); i++) {
  await bookButtons[i].click().catch(() => {})
  await page.waitForTimeout(1500)
  // Check if modal opened
  const modal = await page.$('[class*="fixed inset-0"], [role="dialog"]')
  console.log(`Button ${i}: modal opened = ${!!modal}`)
  // Close if exists
  const close = await page.$('button[aria-label="დახურვა"], button[aria-label*="close"]')
  if (close) { await close.click().catch(() => {}); await page.waitForTimeout(500) }
}

// Visit real booking detail
const bookingsRes = await fetch(`${BASE}/api/student/bookings`, { headers: { cookie: (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ') } })
const bookings = await bookingsRes.json()
const bookingId = bookings[0]?.id
console.log(`\nReal booking ID: ${bookingId}`)

if (bookingId) {
  console.log(`=== /student/bookings/${bookingId} ===`)
  await page.goto(`${BASE}/student/bookings/${bookingId}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  console.log('URL:', page.url())

  // Try clicking status change buttons
  const statusButtons = await page.$$('button:has-text("სესია"), button:has-text("დახმარება"), button:has-text("გადადება")')
  console.log(`Found ${statusButtons.length} status buttons`)

  console.log(`\n=== /session/${bookingId} ===`)
  await page.goto(`${BASE}/session/${bookingId}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  console.log('URL:', page.url())

  // Try session controls
  const controls = await page.$$('button:has-text("დასრულება"), button[aria-label*="mic"], button[aria-label*="cam"]')
  console.log(`Found ${controls.length} control buttons`)
}

// Test apply page click "next" through all steps
console.log('\n=== /apply full flow ===')
await page.goto(`${BASE}/apply`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
for (let i = 0; i < 6; i++) {
  const next = await page.$('button:has-text("შემდეგი"), button:has-text("წარდგენა")')
  if (!next) { console.log(`Step ${i}: no next button`); break }
  const isDisabled = await next.isDisabled().catch(() => false)
  const text = (await next.textContent())?.trim().slice(0, 40)
  console.log(`Step ${i}: "${text}" disabled=${isDisabled}`)
  await next.click().catch(() => {})
  await page.waitForTimeout(1000)
}

console.log('\n' + '='.repeat(70))
console.log('ERRORS:')
if (errs.length === 0) console.log('  (none)')
else errs.forEach(e => console.log(`  [${e.type}] ${e.url}\n    ${e.msg}`))

await browser.close()
