import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.goto('http://localhost:3000/signin?view=signup', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

// Check all submit buttons and their visibility
const buttons = await page.$$eval('button[type="submit"]', els => els.map(e => ({
  text: e.textContent?.trim().slice(0, 60),
  visible: e.offsetParent !== null,
  disabled: e.disabled,
  rect: e.getBoundingClientRect ? { top: Math.round(e.getBoundingClientRect().top), height: Math.round(e.getBoundingClientRect().height) } : null,
})))
console.log('SUBMIT BUTTONS:')
buttons.forEach((b, i) => console.log(`  ${i}: text="${b.text}" visible=${b.visible} disabled=${b.disabled} rect=${JSON.stringify(b.rect)}`))

// Fill fields and check disabled state
await page.fill('input[placeholder*="ანი"]', 'ტესტ').catch(() => console.log('name fill failed'))
await page.fill('input[type="email"]', 'test@x.com').catch(() => console.log('email fill failed'))
await page.fill('input[type="password"]', 'pass1234').catch(() => console.log('pw fill failed'))

await page.waitForTimeout(300)

console.log('\nAFTER FILLING:')
const buttons2 = await page.$$eval('button[type="submit"]', els => els.map(e => ({
  text: e.textContent?.trim().slice(0, 60),
  visible: e.offsetParent !== null,
  disabled: e.disabled,
})))
buttons2.forEach((b, i) => console.log(`  ${i}: text="${b.text}" visible=${b.visible} disabled=${b.disabled}`))

await browser.close()
