import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const EMAIL = 'student@mcodne.ge'
const PASSWORD = 'student1234'

const errors = []
const requests = []
const responses = []

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    errors.push(`[${msg.type()}] ${msg.text()}`)
  }
})
page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`))
page.on('request', req => {
  if (req.url().includes('/api/')) requests.push(`${req.method()} ${req.url()}`)
})
page.on('response', async res => {
  if (res.url().includes('/api/')) {
    const status = res.status()
    let body = ''
    try { body = (await res.text()).slice(0, 200) } catch {}
    responses.push(`${status} ${res.url()}: ${body}`)
  }
})

console.log('== 1. GOTO /signin ==')
await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' })
console.log('  URL:', page.url())
console.log('  Title:', await page.title())

console.log('\n== 2. Check page rendered ==')
const emailInput = await page.$('input[type="email"]')
const pwInputs = await page.$$('input[type="password"]')
const submitButtons = await page.$$('button[type="submit"]')
console.log('  email input found:', !!emailInput)
console.log('  password inputs found:', pwInputs.length)
console.log('  submit buttons found:', submitButtons.length)

console.log('\n== 3. Fill signin form ==')
if (emailInput) {
  await emailInput.fill(EMAIL)
  await pwInputs[0].fill(PASSWORD)
  console.log('  filled email + password')
}

console.log('\n== 4. Click signin button ==')
if (submitButtons[0]) {
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/signin')).catch(() => null),
    submitButtons[0].click(),
  ])
  await page.waitForTimeout(2000)
}

console.log('\n== 5. Result ==')
console.log('  URL after click:', page.url())

console.log('\n== API Requests ==')
requests.forEach(r => console.log('  →', r))

console.log('\n== API Responses ==')
responses.forEach(r => console.log('  ←', r))

console.log('\n== Console Errors / Page Errors ==')
if (errors.length === 0) console.log('  (none)')
else errors.slice(0, 30).forEach(e => console.log('  ', e))

await browser.close()
