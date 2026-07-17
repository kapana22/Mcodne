import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

const results = []

async function test(name, fn) {
  const errors = []
  const requests = []
  page.removeAllListeners('pageerror')
  page.removeAllListeners('console')
  page.removeAllListeners('request')
  page.on('pageerror', e => errors.push(`ERR: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`) })
  page.on('request', r => { if (r.url().includes('/api/')) requests.push(`${r.method()} ${new URL(r.url()).pathname}`) })

  try {
    const outcome = await fn()
    results.push({ name, ok: true, outcome, errors, requests })
  } catch (e) {
    results.push({ name, ok: false, err: e.message.split('\n')[0], errors, requests })
  }
}

// 1. Landing hero CTA
await test('LANDING: "დაიწყე" hero CTA', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.click('button:has-text("დაიწყე") >> nth=0')
  await page.waitForTimeout(1500)
  return page.url()
})

// 2. Landing search
await test('LANDING: search → /tutors?q=', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder*="fundraising"]', 'Series A')
  await page.click('button:has-text("ექსპერტის ძიება")')
  await page.waitForTimeout(1500)
  return page.url()
})

// 3. Landing → შესვლა link
await test('LANDING: "შესვლა" nav → /signin', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.click('button:has-text("შესვლა") >> nth=0')
  await page.waitForTimeout(1500)
  return page.url()
})

// 4. Signin flow
await test('SIGNIN: student', async () => {
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'student@mcodne.ge')
  await page.fill('input[type="password"]', 'student1234')
  await Promise.all([
    page.waitForURL(/\/student/, { timeout: 8000 }).catch(() => {}),
    page.click('button[type="submit"]:has-text("შესვლა")'),
  ])
  await page.waitForTimeout(1000)
  return page.url()
})

// 5. Signout
await test('SIGNOUT: /api/auth/signout', async () => {
  await page.goto(`${BASE}/api/auth/signout`, { waitUntil: 'domcontentloaded' })
  return page.url()
})

// 6. Signup — go directly with ?view=signup
await test('SIGNUP: /signin?view=signup student flow', async () => {
  const email = `bt${Date.now()}@mcodne.test`
  await page.goto(`${BASE}/signin?view=signup`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800) // let useEffect fire

  // Fill fields
  await page.fill('input[placeholder*="ანი"]', 'ტესტ ერი')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'pass1234')

  // Check agreement - the visible span is styled; click the label
  const checkbox = await page.$('input[type="checkbox"]')
  if (checkbox) await checkbox.check({ force: true })

  await page.waitForTimeout(300)
  // scroll to submit button and click
  const submit = await page.$('button[type="submit"]:has-text("ანგარიშის შექმნა")')
  if (!submit) return 'submit button not found'
  await submit.scrollIntoViewIfNeeded()
  await Promise.all([
    page.waitForURL(/\/(student|apply)/, { timeout: 10000 }).catch(() => {}),
    submit.click(),
  ])
  await page.waitForTimeout(1500)
  return `email=${email} → ${page.url()}`
})

// 7. Apply page next button
await test('APPLY: click "შემდეგი" navigates step', async () => {
  await page.goto(`${BASE}/apply`, { waitUntil: 'networkidle' })
  const stepBefore = await page.$$eval('.font-mono', els => els.map(e => e.textContent).join('|')).catch(() => '')
  const btn = await page.$('button:has-text("შემდეგი")')
  if (!btn) return 'no next button'
  await btn.click()
  await page.waitForTimeout(500)
  return 'clicked'
})

// 8. Tutors listing
await test('TUTORS: loads real data', async () => {
  await page.goto(`${BASE}/tutors`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const tutorNames = await page.$$eval('h3, .font-display', els => els.slice(0, 5).map(e => e.textContent))
  return `first h3s: ${tutorNames.slice(0, 3).join(', ')}`
})

// Summary
console.log('\n' + '='.repeat(70))
for (const r of results) {
  const flag = r.ok ? '✓' : '✗'
  console.log(`${flag} ${r.name}`)
  if (r.outcome) console.log(`    → ${r.outcome}`)
  if (r.err) console.log(`    ERR: ${r.err}`)
  if (r.errors.length) r.errors.slice(0, 3).forEach(e => console.log(`    ${e}`))
  if (r.requests.length) r.requests.slice(0, 3).forEach(x => console.log(`    api: ${x}`))
}

await browser.close()
