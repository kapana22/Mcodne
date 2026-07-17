import { chromium } from 'playwright'
const BASE = process.env.BASE_URL || 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })

const ctx = await browser.newContext()
const page = await ctx.newPage()

const errs = []
page.on('pageerror', e => errs.push({ type: 'pageerror', msg: e.message.split('\n')[0], url: page.url() }))
page.on('console', m => { if (m.type() === 'error') errs.push({ type: 'console', msg: m.text().slice(0, 200), url: page.url() }) })

// Sign in
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/, { timeout: 8000 })
await page.waitForTimeout(2000)

console.log('=== Student dashboard ===')
console.log('URL:', page.url())
// Click each visible button/tab
const buttons = await page.$$('button, a[role="button"]')
console.log('total interactive elements:', buttons.length)

// Sample a few by clicking
for (let i = 0; i < Math.min(buttons.length, 20); i++) {
  try {
    const b = buttons[i]
    const text = (await b.textContent())?.trim().slice(0, 30) ?? ''
    if (!text) continue
    await b.click({ trial: true, timeout: 500 }).catch(() => {})
  } catch {}
}
await page.waitForTimeout(500)

// Check /tutor as student — should redirect
console.log('\n=== /tutor as student ===')
const r1 = await page.goto(`${BASE}/tutor`, { waitUntil: 'networkidle' })
console.log('  URL after:', page.url(), '  status:', r1?.status())

console.log('\n=== /admin as student ===')
const r2 = await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
console.log('  URL after:', page.url(), '  status:', r2?.status())

// Signin as admin
console.log('\n=== Sign in as admin ===')
await ctx.clearCookies()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'admin@mcodne.ge')
await page.fill('input[type=password]', 'admin1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/admin/, { timeout: 8000 })
await page.waitForTimeout(2000)
console.log('URL:', page.url())

// Try admin tabs
const tabs = ['მოდერაცია', 'დავები', 'მომხმარებელი', 'ფინანსები', 'ანალიტიკა']
for (const t of tabs) {
  const btn = await page.$(`button:has-text("${t}")`)
  if (btn) {
    await btn.click().catch(() => {})
    await page.waitForTimeout(700)
    console.log(`Clicked ${t} tab`)
  }
}

// Try tutor dashboard
console.log('\n=== Sign in as tutor ===')
await ctx.clearCookies()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'giorgi.meladze@mcodne.ge')
await page.fill('input[type=password]', 'tutor1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/tutor/, { timeout: 8000 })
await page.waitForTimeout(2000)
console.log('URL:', page.url())

// Try tutor sidebar nav
const tutorNavs = ['დღეს', 'კალენდარი', 'მოთხოვნა', 'შემოსავალი', 'შეტყობინება', 'შეფასება', 'კონსულტაცია', 'პროფილი', 'პარამეტრი', 'დახმარება']
for (const t of tutorNavs) {
  const btn = await page.$(`button:has-text("${t}")`)
  if (btn) {
    await btn.click().catch(() => {})
    await page.waitForTimeout(500)
    console.log(`Clicked ${t}`)
  }
}

console.log('\n' + '='.repeat(70))
console.log('ERRORS DETECTED:')
if (errs.length === 0) console.log('  (none)')
else errs.forEach(e => console.log(`  [${e.type}] ${e.url} :: ${e.msg}`))

await browser.close()
