// Full-surface UX audit sweep: all routes × guest/student/tutor × 1440/390.
// Captures screenshots + console errors + overflow + footer/h1 presence.
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3000'
const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-kapana-Desktop-Tutor/1141fbfc-6439-42b3-aa12-d63cc0dafd6b/scratchpad/audit1'
fs.mkdirSync(OUT, { recursive: true })

const CREDS = {
  student: { email: 'student@mcodne.ge', password: 'student1234' },
  tutor: { email: 'giorgi.meladze@mcodne.ge', password: 'tutor1234' },
}

const report = []
const browser = await chromium.launch({ headless: true })

async function makeContext(role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  if (role === 'guest') return ctx
  const page = await ctx.newPage()
  const r = await page.request.post(`${BASE}/api/auth/signin`, { data: CREDS[role] })
  if (!r.ok()) {
    // fallback: UI login
    await page.goto(`${BASE}/signin`)
    await page.fill('input[type=email]', CREDS[role].email)
    await page.fill('input[type=password]', CREDS[role].password)
    await page.click('button[type=submit]')
    await page.waitForTimeout(2500)
  }
  await page.close()
  return ctx
}

async function auditPage(ctx, role, route, name, vp) {
  const page = await ctx.newPage()
  await page.setViewportSize(vp)
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
  let status = null, finalUrl = '', info = {}
  try {
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 20000 }))
    status = resp?.status() ?? null
    await page.waitForTimeout(2500)
    finalUrl = page.url().replace(BASE, '')
    info = await page.evaluate(() => {
      const de = document.documentElement
      const overflowX = de.scrollWidth - de.clientWidth
      const h1 = document.querySelector('h1')?.textContent?.trim().slice(0, 60) || null
      const footer = !!document.querySelector('footer')
      const bodyLen = document.body?.innerText?.length ?? 0
      // widest offender if overflow
      let offender = null
      if (overflowX > 2) {
        let worst = null, worstW = de.clientWidth
        document.querySelectorAll('body *').forEach(el => {
          const r = el.getBoundingClientRect()
          if (r.right > worstW + 2 && r.width < de.scrollWidth + 50) { worst = el; worstW = r.right }
        })
        if (worst) offender = (worst.tagName + '.' + String(worst.className).split(' ').slice(0, 3).join('.')).slice(0, 90)
      }
      const englishMonths = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(document.body.innerText)
      return { overflowX, h1, footer, bodyLen, offender, englishMonths }
    })
    const shot = `${OUT}/${role}-${vp.width}-${name}.png`
    await page.screenshot({ path: shot, fullPage: vp.width > 400 }).catch(() => {})
  } catch (e) {
    errors.push('NAV FAIL: ' + String(e).slice(0, 150))
  }
  report.push({ role, vp: vp.width, route, name, status, finalUrl: finalUrl !== route ? finalUrl : undefined, ...info, errors: errors.length ? [...new Set(errors)].slice(0, 4) : undefined })
  await page.close()
}

// discover dynamic ids via APIs / page scrape
async function discover(ctx) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/tutors`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {})
  await page.waitForSelector('a[href^="/tutors/"]', { timeout: 15000 }).catch(() => {})
  const tutorId = await page.evaluate(() => document.querySelector('a[href^="/tutors/"]')?.getAttribute('href')?.split('/')[2] || null)
  await page.close()
  return { tutorId }
}
async function firstLink(ctx, listRoute, prefix) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}${listRoute}`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const id = await page.evaluate((p) => {
    const a = document.querySelector(`a[href^="${p}"]`)
    return a ? a.getAttribute('href').replace(p, '').split(/[?#]/)[0] : null
  }, prefix)
  await page.close()
  return id
}

const guest = await makeContext('guest')
const student = await makeContext('student')
const tutor = await makeContext('tutor')

const { tutorId } = await discover(guest)
const sBookingId = await firstLink(student, '/me/bookings', '/me/bookings/')
const sMsgId = await firstLink(student, '/me/messages', '/me/messages/')
const tBookingId = await firstLink(tutor, '/work/bookings', '/work/bookings/')
const tMsgId = await firstLink(tutor, '/work/messages', '/work/messages/')
console.log('discovered ids:', { tutorId, sBookingId, sMsgId, tBookingId, tMsgId })

const PUBLIC = [
  ['/', 'home'], ['/tutors', 'tutors'], ['/tutors?q=მათემატიკა', 'tutors-search'],
  tutorId && [`/tutors/${tutorId}`, 'tutor-detail'],
  ['/categories', 'categories'], ['/discover', 'discover'], ['/about', 'about'],
  ['/blog', 'blog'], ['/contact', 'contact'], ['/help', 'help'], ['/apply', 'apply'],
  ['/privacy', 'privacy'], ['/terms', 'terms'],
  ['/signin', 'signin'], ['/signup', 'signup'], ['/nonexistent-xyz', '404'],
].filter(Boolean)
const STUDENT = [
  ['/me', 'dashboard'], ['/me/bookings', 'bookings'],
  sBookingId && [`/me/bookings/${sBookingId}`, 'booking-detail'],
  ['/me/messages', 'messages'],
  sMsgId && [`/me/messages/${sMsgId}`, 'message-detail'],
  ['/me/favorites', 'favorites'], ['/me/profile', 'profile'],
  ['/settings', 'settings'], ['/notifications', 'notifications'],
  ['/signin', 'signin-when-authed'], ['/work', 'role-mismatch-tutor'],
].filter(Boolean)
const TUTOR = [
  ['/work', 'dashboard'], ['/work/bookings', 'bookings'],
  tBookingId && [`/work/bookings/${tBookingId}`, 'booking-detail'],
  ['/work/messages', 'messages'],
  tMsgId && [`/work/messages/${tMsgId}`, 'message-detail'],
  ['/work/profile', 'profile'], ['/work/schedule', 'schedule'], ['/work/earnings', 'earnings'],
  ['/settings', 'settings'], ['/signin', 'signin-when-authed'], ['/me', 'role-mismatch-student'],
].filter(Boolean)

const VPS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }]
for (const vp of VPS) {
  for (const [r, n] of PUBLIC) await auditPage(guest, 'guest', r, n, vp)
  for (const [r, n] of STUDENT) await auditPage(student, 'student', r, n, vp)
  for (const [r, n] of TUTOR) await auditPage(tutor, 'tutor', r, n, vp)
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
// concise console summary: only rows with problems
for (const r of report) {
  const probs = []
  if (r.status && r.status >= 400 && r.name !== '404') probs.push(`HTTP ${r.status}`)
  if (r.overflowX > 2) probs.push(`overflowX +${r.overflowX}px ${r.offender || ''}`)
  if (r.errors) probs.push(`console: ${r.errors[0]}`)
  if (r.footer === false) probs.push('no-footer')
  if (!r.h1) probs.push('no-h1')
  if (r.englishMonths) probs.push('EN-dates')
  if (r.finalUrl) probs.push(`→ ${r.finalUrl}`)
  if (r.bodyLen < 300) probs.push(`thin-body ${r.bodyLen}`)
  if (probs.length) console.log(`[${r.role}@${r.vp}] ${r.route} :: ${probs.join(' | ')}`)
}
console.log(`\nTotal pages audited: ${report.length}. Full report: ${OUT}/report.json`)
await browser.close()
