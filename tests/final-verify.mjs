import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const apis = []
page.on('response', r => {
  if (r.url().includes('/api/') && r.request().method() !== 'GET') {
    apis.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`)
  }
})

await page.goto('https://mcodne.ge/signin')
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/)
await page.waitForTimeout(1500)

const cookie = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ')
const bookings = await (await fetch('https://mcodne.ge/api/student/bookings', { headers: { cookie } })).json()

console.log('=== BOOKING DETAIL ===')
await page.goto(`https://mcodne.ge/student/bookings/${bookings[0].id}`)
await page.waitForTimeout(2500)

const composeInput = await page.$('textarea[placeholder*="მიუწერე"]')
console.log(`  Compose input present: ${!!composeInput}`)
if (composeInput) {
  await composeInput.fill('ტესტ შეტყობინება ' + Date.now())
  await page.locator('button:has-text("გაგზავნა")').click()
  await page.waitForTimeout(2500)
  const msgs = await page.$$('[class*="rounded-tr-sm"], [class*="rounded-tl-sm"]')
  console.log(`  Messages visible after send: ${msgs.length}`)
}

console.log('\n=== BOOKING FLOW ===')
const tutors = await (await fetch('https://mcodne.ge/api/tutors')).json()
await page.goto(`https://mcodne.ge/tutors/${tutors[1].id}`)
await page.waitForTimeout(2500)

await page.locator('button:has-text("დაჯავშნა")').first().scrollIntoViewIfNeeded()
await page.locator('button:has-text("დაჯავშნა")').first().click({ force: true })
await page.waitForTimeout(1200)
await page.locator('button:has-text("შემდეგი — დეტალები")').click()
await page.waitForTimeout(800)
await page.locator('button:has-text("შემდეგი — გადახდა")').click()
await page.waitForTimeout(800)
await page.locator('button:has-text("გადახდა"), button:has-text("უფასო ჯავშნა")').last().click()
await page.waitForTimeout(2500)

const bookingsAfter = await (await fetch('https://mcodne.ge/api/student/bookings', { headers: { cookie } })).json()
console.log(`  Bookings before: ${bookings.length}, after: ${bookingsAfter.length}`)

console.log('\n=== TUTOR SEES BOOKINGS ===')
await ctx.clearCookies()
await page.goto('https://mcodne.ge/signin')
await page.fill('input[type=email]', 'giorgi.meladze@mcodne.ge')
await page.fill('input[type=password]', 'tutor1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/tutor/)
const tutorCookie = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ')
const tutorData = await (await fetch('https://mcodne.ge/api/tutor/bookings', { headers: { cookie: tutorCookie } })).json()
console.log(`  Tutor bookings: ${tutorData.bookings?.length}`)
console.log(`  Stats: upcoming=${tutorData.stats?.upcoming}, completed=${tutorData.stats?.completed}, revenue=₾${tutorData.stats?.revenue}`)

console.log('\n=== WRITE APIs ===')
apis.forEach(a => console.log(`  ${a}`))

await browser.close()
