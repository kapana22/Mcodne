import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

const issues = []

// Sign in as student
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/, { timeout: 10000 })
await page.waitForTimeout(1500)

// List ALL navigable buttons/links in the sidebar/topbar
console.log('=== STUDENT DASHBOARD nav elements ===')
const navItems = await page.$$eval('nav a, nav button, aside a, aside button, header a, header button', els =>
  els.filter(e => e.offsetParent !== null).map(e => ({
    tag: e.tagName,
    text: (e.textContent || '').trim().slice(0, 40),
    href: e.getAttribute('href') || '',
    hasClick: !!e.onclick,
  }))
)
navItems.slice(0, 30).forEach(n => console.log(`  [${n.tag}] "${n.text}" href="${n.href}"`))

// Try clicking each nav item and see where it goes
console.log('\n=== CLICK EACH NAV ITEM ===')
const testPaths = [
  { selector: 'a[href="/student"], button:has-text("მთავარი")', name: 'მთავარი' },
  { selector: 'a:has-text("ჩემი ჯავშნები"), button:has-text("ჩემი ჯავშნები")', name: 'ჩემი ჯავშნები' },
  { selector: 'a:has-text("პროფილი"), button:has-text("პროფილი")', name: 'პროფილი' },
  { selector: 'a:has-text("სეთინგები"), a:has-text("პარამეტრები"), button:has-text("სეთინგები"), button:has-text("პარამეტრები")', name: 'პარამეტრები' },
  { selector: 'a:has-text("შენახული"), button:has-text("შენახული")', name: 'შენახული' },
  { selector: 'a:has-text("შეტყობინებები"), button:has-text("შეტყობინებები")', name: 'შეტყობინებები' },
  { selector: 'a:has-text("ექსპერტები"), button:has-text("ექსპერტები")', name: 'ექსპერტები' },
]

for (const t of testPaths) {
  await page.goto(`${BASE}/student`)
  await page.waitForTimeout(1000)
  const el = await page.$(t.selector)
  if (!el) { console.log(`  ${t.name}: NOT FOUND`); issues.push(`${t.name}: nav element missing`); continue }
  const before = page.url()
  await el.click({ force: true }).catch(() => {})
  await page.waitForTimeout(1500)
  const after = page.url()
  const worked = after !== before || after.includes('#')
  console.log(`  ${t.name}: ${before} → ${after} ${worked ? '✓' : '✗'}`)
  if (!worked) issues.push(`${t.name}: click did nothing`)
}

// Check what /profile, /settings, /messages routes actually resolve to
console.log('\n=== EXPECTED USER ROUTES ===')
for (const r of ['/student/profile', '/student/settings', '/student/messages', '/student/favorites', '/student/bookings']) {
  const resp = await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const status = resp?.status()
  const finalUrl = page.url()
  const bodySize = await page.evaluate(() => document.body?.innerText?.length ?? 0)
  console.log(`  ${r} → ${status} (${finalUrl}) body=${bodySize}b`)
  if (status === 404 || bodySize < 500) issues.push(`${r}: 404 or blank`)
}

console.log('\n' + '='.repeat(60))
console.log('ISSUES FOUND:')
if (issues.length === 0) console.log('  (none)')
else issues.forEach(i => console.log(`  ✗ ${i}`))

await browser.close()
