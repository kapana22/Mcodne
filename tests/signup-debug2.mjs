import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.goto('http://localhost:3000/signin?view=signup', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

await page.fill('input[placeholder*="ანი"]', 'ტესტ')
await page.fill('input[type="email"]', 'test@x.com')
await page.fill('input[type="password"]', 'pass1234')

// Try to check the agreement checkbox via label click
const agreeLabel = await page.$('text=ვეთანხმები')
console.log('agree label found:', !!agreeLabel)
if (agreeLabel) {
  await agreeLabel.click()
  await page.waitForTimeout(200)
}

// Alternative: click checkbox input via .check()
const checkbox = await page.$('input[type="checkbox"]')
console.log('checkbox found:', !!checkbox)
if (checkbox) {
  const checked1 = await checkbox.isChecked().catch(() => 'err')
  console.log('checked before:', checked1)
  await checkbox.check({ force: true }).catch(e => console.log('check err:', e.message))
  const checked2 = await checkbox.isChecked().catch(() => 'err')
  console.log('checked after:', checked2)
}

await page.waitForTimeout(300)

const btn = await page.$('button[type="submit"]:has-text("ანგარიშის შექმნა")')
if (btn) {
  const disabled = await btn.isDisabled()
  console.log('submit disabled:', disabled)
}

await browser.close()
