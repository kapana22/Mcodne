import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

// Sign in as tutor
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'giorgi.meladze@mcodne.ge')
await page.fill('input[type=password]', 'tutor1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/tutor/, { timeout: 8000 })
await page.waitForTimeout(1500)

// Click "ხელმისაწვდომობის რედაქტირება" button — should switch to calendar section
await page.click('button:has-text("ხელმისაწვდომობის რედაქტირება") >> nth=0').catch(() => {})
await page.waitForTimeout(1000)
console.log('After "ხელმისაწვდომობის რედაქტირება":', page.url())

// Click "ფასის შეცვლა" — should switch to profile section
await page.goto(`${BASE}/tutor`)
await page.waitForTimeout(1500)
await page.click('button:has-text("ფასის შეცვლა") >> nth=0').catch(() => {})
await page.waitForTimeout(1000)
console.log('After "ფასის შეცვლა":', page.url())

// Sign in as admin
await ctx.clearCookies()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'admin@mcodne.ge')
await page.fill('input[type=password]', 'admin1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/admin/, { timeout: 8000 })
await page.waitForTimeout(1500)

// Click a queue item (A-0247) — should switch to moderation
await page.click('button:has-text("A-0247") >> nth=0').catch(() => {})
await page.waitForTimeout(1000)
console.log('After queue item click:', page.url())

// Click "SLA რეპორტი" — should switch to analytics
await page.goto(`${BASE}/admin`)
await page.waitForTimeout(1500)
await page.click('button:has-text("SLA რეპორტი")').catch(() => {})
await page.waitForTimeout(1000)
console.log('After "SLA რეპორტი":', page.url())

await browser.close()
