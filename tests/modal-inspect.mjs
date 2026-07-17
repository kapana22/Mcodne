import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

await page.goto('https://mcodne.ge/signin')
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/)

const tutors = await (await fetch('https://mcodne.ge/api/tutors')).json()
await page.goto(`https://mcodne.ge/tutors/${tutors[0].id}`)
await page.waitForTimeout(3000)

// Click booking button
await page.locator('button:has-text("დაჯავშნა")').first().scrollIntoViewIfNeeded()
await page.locator('button:has-text("დაჯავშნა")').first().click({ force: true })
await page.waitForTimeout(2000)

// Enumerate everything visible in the modal
const modal = await page.$('.fixed.z-50, [class*="fixed inset-0 z-50"]')
console.log(`Modal exists: ${!!modal}`)
if (modal) {
  const buttons = await modal.$$eval('button', els => els.filter(e => e.offsetParent !== null).map(e => ({
    text: (e.textContent || '').trim().slice(0, 60),
    type: e.getAttribute('type') || 'submit',
  })))
  console.log(`\nModal buttons (${buttons.length}):`)
  buttons.forEach((b, i) => console.log(`  #${i}: [${b.type}] "${b.text}"`))
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/modal.png' })
  console.log('\nScreenshot: /tmp/modal.png')
}

await browser.close()
