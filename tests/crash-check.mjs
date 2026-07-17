import { chromium } from 'playwright'
const BASE = process.env.BASE_URL || 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })

const routes = [
  '/',
  '/signin',
  '/signin?view=signup',
  '/signin?view=verify',
  '/signin?view=reset',
  '/signin?view=onboarding',
  '/tutors',
  '/tutors?q=Series%20A',
  '/apply',
]

// Also test authed pages
const authedRoutes = [
  '/student',
  '/tutor',
  '/admin',
  '/tutors/notfound-id',
  '/student/bookings/notfound-id',
  '/session/notfound-id',
]

async function testRoute(url, cookies = []) {
  const ctx = await browser.newContext()
  if (cookies.length) await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  const errors = []
  const consoleErrors = []
  const failedRequests = []
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]))
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('requestfailed', r => failedRequests.push(`${r.url()}: ${r.failure()?.errorText}`))
  page.on('response', r => { if (r.status() >= 500) failedRequests.push(`${r.status()} ${r.url()}`) })
  try {
    const resp = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1500)
    const status = resp?.status()
    const title = await page.title().catch(() => '')
    await ctx.close()
    return { url, status, title, errors, consoleErrors, failedRequests }
  } catch (e) {
    await ctx.close()
    return { url, err: e.message.split('\n')[0], errors, consoleErrors, failedRequests }
  }
}

// Test public routes
console.log('=== PUBLIC ===')
for (const r of routes) {
  const res = await testRoute(r)
  const status = res.status ?? 'ERR'
  const hasErr = res.errors.length || res.consoleErrors.length || res.failedRequests.length
  console.log(`${hasErr ? '✗' : '✓'} ${status} ${r}`)
  res.errors.slice(0, 2).forEach(e => console.log('   PAGE ERR:', e))
  res.consoleErrors.slice(0, 3).forEach(e => console.log('   CONSOLE:', e.slice(0, 120)))
  res.failedRequests.slice(0, 3).forEach(e => console.log('   REQ:', e))
  if (res.err) console.log('   NAV ERR:', res.err)
}

// Sign in and get session cookie for authed routes
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.goto(`${BASE}/signin`)
await page.fill('input[type=email]', 'student@mcodne.ge')
await page.fill('input[type=password]', 'student1234')
await page.click('button[type=submit]:has-text("შესვლა")')
await page.waitForURL(/\/student/, { timeout: 8000 })
const cookies = await ctx.cookies()
await ctx.close()

console.log('\n=== AUTHED (as student) ===')
for (const r of authedRoutes) {
  const res = await testRoute(r, cookies)
  const status = res.status ?? 'ERR'
  const hasErr = res.errors.length || res.consoleErrors.length || res.failedRequests.length
  console.log(`${hasErr ? '✗' : '✓'} ${status} ${r}`)
  res.errors.slice(0, 2).forEach(e => console.log('   PAGE ERR:', e))
  res.consoleErrors.slice(0, 3).forEach(e => console.log('   CONSOLE:', e.slice(0, 120)))
  res.failedRequests.slice(0, 3).forEach(e => console.log('   REQ:', e))
  if (res.err) console.log('   NAV ERR:', res.err)
}

await browser.close()
