import { chromium } from 'playwright'
const OUT = '/private/tmp/claude-501/-Users-kapana-Desktop-Tutor/44072f55-6e88-4ece-8be4-121c74c8e21b/scratchpad'
const BASE = 'http://localhost:3000'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.addInitScript(() => {
  try { window.localStorage.setItem('mcodne:cookie-consent', 'accepted') } catch {}
})
page.on('pageerror', e => console.log('PAGE ERROR:', String(e).slice(0, 300)))
await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
await page.locator('input[type="email"]').pressSequentially('giorgi.meladze@mcodne.ge')
await page.locator('input[type="password"]').pressSequentially('tutor1234')
await page.click('button[type="submit"]')
await page.waitForURL(u => !String(u).includes('/signin'), { timeout: 25000 }).catch(() => {})
await page.goto(`${BASE}/tutor/profile`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(4000)
await page.screenshot({ path: `${OUT}/profile-390.png`, fullPage: false })
// expand every collapsed group so delete buttons are reachable
const headers = page.locator('button:has(svg)').filter({ hasText: /სერვისები|ვიდეო|კრედენშ|სანდოობ|ანგარიშ/ })
const hc = await headers.count()
for (let i = 0; i < hc; i++) { try { await headers.nth(i).click({ timeout: 1500 }) } catch {} }
await page.waitForTimeout(800)
const delCount = await page.locator('button[aria-label*="წაშლა"]').count()
console.log('delete buttons found:', delCount)
if (delCount > 0) {
  await page.locator('button[aria-label*="წაშლა"]').first().click()
  await page.waitForTimeout(600)
  const dlg = await page.locator('[role="alertdialog"]').count()
  console.log('alertdialog open (want 1):', dlg)
  await page.screenshot({ path: `${OUT}/profile-confirm-390.png` })
  await page.locator('[role="alertdialog"] button', { hasText: 'გაუქმება' }).click()
}
// native confirm() should never fire — fail loudly if it does
page.on('dialog', d => { console.log('NATIVE DIALOG APPEARED (bad):', d.message()); d.dismiss() })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
console.log('horizontal overflow:', overflow)
await browser.close()
