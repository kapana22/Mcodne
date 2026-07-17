import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

const errs = []
page.on('pageerror', e => errs.push(e.message.split('\n')[0]))
page.on('response', async r => {
  if (r.url().includes('/api/bookings') && r.request().method() === 'POST') {
    console.log(`POST /api/bookings → ${r.status()}: ${(await r.text()).slice(0, 200)}`)
  }
})

await page.goto('https://mcodne.ge/signin')
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/)
await page.waitForTimeout(1500)

const tutors = await (await fetch('https://mcodne.ge/api/tutors')).json()
await page.goto(`https://mcodne.ge/tutors/${tutors[0].id}`)
await page.waitForTimeout(2500)

// Click first visible "დაჯავშნა"
const bookBtns = page.locator('button:has-text("დაჯავშნა")')
const count = await bookBtns.count()
console.log(`Total "დაჯავშნა" buttons: ${count}`)

for (let i = 0; i < count; i++) {
  const btn = bookBtns.nth(i)
  const visible = await btn.isVisible()
  const box = await btn.boundingBox()
  console.log(`  #${i}: visible=${visible} box=${JSON.stringify(box)}`)
}

// Click the first visible one
await bookBtns.first().scrollIntoViewIfNeeded()
await page.waitForTimeout(500)
await bookBtns.first().click({ force: true })
await page.waitForTimeout(2000)

const modal = await page.$('[class*="fixed inset-0"], [role=dialog], .fixed.z-50')
console.log(`Modal appeared: ${!!modal}`)

// Try to walk through the modal
if (modal) {
  for (let step = 0; step < 4; step++) {
    // Take screenshot of current step
    await page.screenshot({ path: `/tmp/book-step-${step}.png` })
    const nextBtn = await page.$('button[type=submit]:visible, button:visible:has-text("შემდეგი"), button:visible:has-text("გადახდა"), button:visible:has-text("დაასრულე"), button:visible:has-text("ჯავშნა")')
    if (!nextBtn) { console.log(`Step ${step}: no next button`); break }
    const text = (await nextBtn.textContent())?.trim().slice(0, 40)
    const disabled = await nextBtn.isDisabled()
    console.log(`Step ${step}: "${text}" disabled=${disabled}`)
    if (disabled) break
    await nextBtn.click({ force: true })
    await page.waitForTimeout(1200)
  }
}

console.log('\nURL after:', page.url())
console.log('Page errors:', errs.length)
errs.forEach(e => console.log(`  ERR: ${e}`))

await browser.close()
