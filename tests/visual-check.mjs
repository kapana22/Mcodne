import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

async function checkPage(url, opts = {}) {
  const errs = []
  page.removeAllListeners('pageerror')
  page.removeAllListeners('console')
  page.on('pageerror', e => errs.push({ type: 'pageerror', msg: e.message.split('\n')[0] }))
  page.on('console', m => { if (m.type() === 'error') errs.push({ type: 'console', msg: m.text().slice(0, 200) }) })
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // Check for Next.js error markers
  const errorBanner = await page.$('text=/Application error|Something went wrong|500|Unhandled/i')
  const isBlank = await page.evaluate(() => document.body.innerText.trim().length < 100)
  const has404 = await page.$('text=/404|not found/i')

  return {
    url,
    errors: errs.length,
    errList: errs,
    errorBanner: !!errorBanner,
    isBlank,
    has404: !!has404,
    bodySize: await page.evaluate(() => document.body.innerText.length),
  }
}

// Sign in as student first
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/, { timeout: 8000 })

const pages = [
  '/', '/tutors', '/apply', '/signin', '/me',
]

// Real IDs
const tutorsRes = await fetch(`${BASE}/api/tutors`)
const tutors = await tutorsRes.json()
pages.push(`/tutors/${tutors[0].id}`)

const bookingsRes = await fetch(`${BASE}/api/student/bookings`, {
  headers: { cookie: (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ') }
})
const bookings = await bookingsRes.json()
if (bookings[0]) {
  pages.push(`/me/bookings/${bookings[0].id}`)
  pages.push(`/session/${bookings[0].id}`)
}

for (const p of pages) {
  const r = await checkPage(p)
  const flags = []
  if (r.errorBanner) flags.push('ERROR-BANNER')
  if (r.isBlank) flags.push('BLANK-PAGE')
  if (r.has404) flags.push('404')
  if (r.errors) flags.push(`${r.errors}-JS-ERRS`)
  console.log(`${flags.length ? '✗' : '✓'} ${p} body=${r.bodySize}b ${flags.join(',') || 'ok'}`)
  r.errList.slice(0, 2).forEach(e => console.log(`   [${e.type}] ${e.msg}`))
}

// Also test admin
await ctx.clearCookies()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'admin@mcodne.ge')
await page.fill('input[type=password]', 'admin1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/admin/, { timeout: 8000 })

for (const p of ['/admin']) {
  const r = await checkPage(p)
  const flags = []
  if (r.errorBanner) flags.push('ERROR-BANNER')
  if (r.isBlank) flags.push('BLANK-PAGE')
  if (r.has404) flags.push('404')
  if (r.errors) flags.push(`${r.errors}-JS-ERRS`)
  console.log(`${flags.length ? '✗' : '✓'} ${p} body=${r.bodySize}b ${flags.join(',') || 'ok'}`)
  r.errList.slice(0, 2).forEach(e => console.log(`   [${e.type}] ${e.msg}`))
}

// Also test tutor
await ctx.clearCookies()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'giorgi.meladze@mcodne.ge')
await page.fill('input[type=password]', 'tutor1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/tutor/, { timeout: 8000 })

for (const p of ['/work']) {
  const r = await checkPage(p)
  const flags = []
  if (r.errorBanner) flags.push('ERROR-BANNER')
  if (r.isBlank) flags.push('BLANK-PAGE')
  if (r.has404) flags.push('404')
  if (r.errors) flags.push(`${r.errors}-JS-ERRS`)
  console.log(`${flags.length ? '✗' : '✓'} ${p} body=${r.bodySize}b ${flags.join(',') || 'ok'}`)
  r.errList.slice(0, 2).forEach(e => console.log(`   [${e.type}] ${e.msg}`))
}

await browser.close()
