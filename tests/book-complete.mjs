import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

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

const tutors = await (await fetch('https://mcodne.ge/api/tutors')).json()
await page.goto(`https://mcodne.ge/tutors/${tutors[0].id}`)
await page.waitForTimeout(3000)

// Open modal
await page.locator('button:has-text("დაჯავშნა")').first().scrollIntoViewIfNeeded()
await page.locator('button:has-text("დაჯავშნა")').first().click({ force: true })
await page.waitForTimeout(1500)

// Modal buttons — click "შემდეგი — დეტალები"
console.log('Step 1: clicking "შემდეგი — დეტალები"')
await page.locator('button:has-text("შემდეგი — დეტალები")').click().catch(e => console.log('  err:', e.message.split('\n')[0]))
await page.waitForTimeout(1500)

console.log('Step 2: clicking "შემდეგი — გადახდა"')
await page.locator('button:has-text("შემდეგი — გადახდა")').click().catch(e => console.log('  err:', e.message.split('\n')[0]))
await page.waitForTimeout(1500)

console.log('Step 3: clicking payment button')
await page.locator('button:has-text("გადახდა"), button:has-text("უფასო ჯავშნა")').last().click().catch(e => console.log('  err:', e.message.split('\n')[0]))
await page.waitForTimeout(3000)

console.log('Final URL:', page.url())

// Check if booking count increased
const bookings = await (await fetch('https://mcodne.ge/api/student/bookings', {
  headers: { cookie: (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ') }
})).json()
console.log(`Student bookings after: ${bookings.length}`)

await browser.close()
