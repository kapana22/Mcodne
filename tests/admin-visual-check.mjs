// Admin panel visual check — 1440 + 390 captures of key tabs + the new
// required-reason confirm dialog.
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3000'
const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-kapana-Desktop-Tutor/1141fbfc-6439-42b3-aa12-d63cc0dafd6b/scratchpad/admin1'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
await p.request.post(`${BASE}/api/auth/signin`, { data: { email: 'admin@mcodne.ge', password: 'admin1234' }, timeout: 120000 })

for (const [hash, name] of [['', 'overview'], ['#moderation', 'moderation'], ['#users', 'users'], ['#bookings', 'bookings'], ['#disputes', 'disputes']]) {
  await p.goto(`${BASE}/admin${hash}`, { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(2000)
  await p.screenshot({ path: `${OUT}/1440-${name}.png` })
}
// mobile captures
await p.setViewportSize({ width: 390, height: 844 })
for (const [hash, name] of [['#users', 'users'], ['#bookings', 'bookings']]) {
  await p.goto(`${BASE}/admin${hash}`, { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(2000)
  await p.screenshot({ path: `${OUT}/390-${name}.png` })
}
// open the cancel dialog on bookings (mobile) if a cancellable row exists
const cancelBtn = p.locator('button:has-text("გაუქმება")').first()
if (await cancelBtn.isVisible().catch(() => false)) {
  await cancelBtn.click()
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}/390-cancel-dialog.png` })
}
console.log('admin captures →', OUT)
await browser.close()
