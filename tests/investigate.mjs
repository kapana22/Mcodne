import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

// Sign in
await page.goto('https://mcodne.ge/signin')
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/)
await page.waitForTimeout(1000)

// Get tutor and navigate to profile
const tutors = await (await fetch('https://mcodne.ge/api/tutors')).json()
await page.goto(`https://mcodne.ge/tutors/${tutors[0].id}`)
await page.waitForTimeout(2500)

console.log('=== EXPERT PROFILE BUTTONS ===')
const bookingButtons = await page.$$eval('button', els => els.map(e => ({
  text: (e.textContent || '').trim().slice(0, 60),
  visible: e.offsetParent !== null,
  disabled: e.disabled,
})).filter(b => b.text.match(/დაიჯავშ|ჯავშ|დაიწყე|გაცნო|შესვ|book|Book/i)))
bookingButtons.forEach(b => console.log(`  "${b.text}" visible=${b.visible} disabled=${b.disabled}`))

console.log('\n=== ALL VISIBLE PRIMARY CTAs ===')
const primary = await page.$$eval('button.bg-brand-500, button.bg-brand-600, button.bg-accent-500', els => els.slice(0, 15).map(e => ({
  text: (e.textContent || '').trim().slice(0, 60),
  visible: e.offsetParent !== null,
})))
primary.forEach(b => console.log(`  "${b.text}"`))

console.log('\n=== BOOKING DETAIL MESSAGE INPUT ===')
const bookings = await (await fetch('https://mcodne.ge/api/student/bookings', {
  headers: { cookie: (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ') }
})).json()
if (bookings[0]) {
  await page.goto(`https://mcodne.ge/student/bookings/${bookings[0].id}`)
  await page.waitForTimeout(2000)
  const inputs = await page.$$eval('textarea, input[type=text], [contenteditable]', els => els.map(e => ({
    tag: e.tagName,
    placeholder: e.getAttribute('placeholder') || '',
    visible: e.offsetParent !== null,
  })))
  console.log(`Found ${inputs.length} text inputs:`)
  inputs.forEach(i => console.log(`  ${i.tag} placeholder="${i.placeholder}" visible=${i.visible}`))
}

await browser.close()
