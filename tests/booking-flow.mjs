import { chromium } from 'playwright'
const BASE = process.env.BASE_URL || 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

const errs = []
page.on('pageerror', e => errs.push({ type: 'pageerror', msg: e.message.split('\n')[0], url: page.url() }))
page.on('console', m => { if (m.type() === 'error') errs.push({ type: 'console', msg: m.text().slice(0, 250) }) })
page.on('response', r => { if (r.status() >= 400 && r.url().includes('/api/')) errs.push({ type: 'api', msg: `${r.status()} ${r.url()}` }) })

// Sign in as student
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/, { timeout: 8000 })

// Go to a tutor profile
const tutorsRes = await fetch(`${BASE}/api/tutors`)
const tutors = await tutorsRes.json()
const tutorId = tutors[0].id
await page.goto(`${BASE}/tutors/${tutorId}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

console.log(`=== Testing tutor profile: ${tutors[0].user.fullName} ===`)

// Try all major CTAs on expert profile
const CTAs = [
  { sel: 'button:has-text("დაიჯავშნე")', name: 'დაიჯავშნე' },
  { sel: 'button:has-text("სესია")', name: 'სესია' },
  { sel: 'button:has-text("კონსულტაცია")', name: 'კონსულტაცია' },
  { sel: 'button:has-text("პაკეტი")', name: 'პაკეტი' },
  { sel: 'button:has-text("Book")', name: 'Book' },
  { sel: 'button:has-text("გაცნობა")', name: 'გაცნობა' },
  { sel: 'button:has-text("დაწყება")', name: 'დაწყება' },
]

for (const cta of CTAs) {
  const btns = await page.$$(cta.sel)
  console.log(`Found ${btns.length} "${cta.name}" buttons`)
}

// Click "დაიჯავშნე" to open booking modal
await page.locator('button:has-text("დაიჯავშნე") >> nth=0').click().catch(() => {})
await page.waitForTimeout(1500)

console.log('\n=== Modal opened, checking ===')
const modal = await page.$('[class*="fixed inset-0"], [role="dialog"]')
console.log('Modal exists:', !!modal)

if (modal) {
  // Try to go through the modal steps by clicking "შემდეგი"
  for (let i = 0; i < 5; i++) {
    const next = await page.$('button:has-text("შემდეგი"), button:has-text("გადახდა"), button:has-text("ჯავშნა")')
    if (!next) { console.log(`Modal step ${i}: no next found`); break }
    const text = (await next.textContent())?.trim().slice(0, 40)
    const disabled = await next.isDisabled().catch(() => false)
    console.log(`Modal step ${i}: "${text}" disabled=${disabled}`)
    await next.click().catch(() => {})
    await page.waitForTimeout(1000)
  }
}

// Try navigating away from modal
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// Now test admin pages after signing in as admin
console.log('\n=== Sign in as admin ===')
await ctx.clearCookies()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'admin@mcodne.ge')
await page.fill('input[type=password]', 'admin1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/admin/, { timeout: 8000 })
await page.waitForTimeout(2000)

// Click each admin nav tab
const adminTabs = ['მიმოხილვა', 'მოდერაცია', 'დავები', 'მომხმარებელი', 'ფინანსები', 'ანალიტიკა']
for (const tab of adminTabs) {
  const btn = await page.$(`button:has-text("${tab}")`)
  if (btn) {
    const text = (await btn.textContent())?.trim().slice(0, 30)
    console.log(`Admin: clicking "${text}"`)
    await btn.click().catch(() => {})
    await page.waitForTimeout(1500)
  }
}

console.log('\n' + '='.repeat(70))
console.log('ERRORS DETECTED:')
if (errs.length === 0) console.log('  (none)')
else errs.slice(0, 20).forEach(e => console.log(`  [${e.type}] ${e.msg}`))

await browser.close()
