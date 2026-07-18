// Mobile modal audit — opens every known modal/popup at 390×844 and captures
// screenshots + geometry facts (off-screen? scrollable? safe-area? width).
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3000'
const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-kapana-Desktop-Tutor/1141fbfc-6439-42b3-aa12-d63cc0dafd6b/scratchpad/modals1'
fs.mkdirSync(OUT, { recursive: true })

const VP = { width: 390, height: 844 }
const browser = await chromium.launch({ headless: true })
const report = []

// One login per role for the whole run — signin does bcrypt against a remote
// DB and can take >30s under dev-server load, so we cache the session cookie.
const cookieCache = {}
async function login(ctx, email, password) {
  if (!cookieCache[email]) {
    const p = await ctx.newPage()
    await p.request.post(`${BASE}/api/auth/signin`, { data: { email, password }, timeout: 120000 })
    cookieCache[email] = await ctx.cookies()
    await p.close()
    return
  }
  await ctx.addCookies(cookieCache[email])
}

async function measureModal(page) {
  return page.evaluate(() => {
    // find the top-most fixed overlay
    const els = [...document.querySelectorAll('div[class*="fixed"],aside[class*="fixed"]')]
      .filter(e => { const s = getComputedStyle(e); return s.position === 'fixed' && e.offsetWidth > 100 })
    if (!els.length) return null
    // the dialog box is usually the biggest child with a bg
    let dialog = document.querySelector('[role="dialog"],[role="alertdialog"]')
    if (!dialog) dialog = els[els.length - 1]
    const r = dialog.getBoundingClientRect()
    const vh = window.innerHeight, vw = window.innerWidth
    const cs = getComputedStyle(dialog)
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      overflowsViewport: r.height > vh - 8 || r.bottom > vh + 2 || r.top < -2,
      touchesBottom: Math.abs(r.bottom - vh) < 4,
      widthRatio: +(r.width / vw).toFixed(2),
      scrollable: dialog.scrollHeight > dialog.clientHeight + 4 ||
        [...dialog.querySelectorAll('div')].some(d => /auto|scroll/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 4),
      maxH: cs.maxHeight, borderRadius: cs.borderRadius,
    }
  })
}

async function run(name, role, url, actions) {
  const ctx = await browser.newContext({ viewport: VP })
  if (role === 'student') await login(ctx, 'student@mcodne.ge', 'student1234')
  if (role === 'tutor') await login(ctx, 'giorgi.meladze@mcodne.ge', 'tutor1234')
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000)
    for (const act of actions) {
      const loc = page.locator(act).first()
      await loc.waitFor({ state: 'visible', timeout: 8000 })
      await loc.click()
      await page.waitForTimeout(900)
    }
    const m = await measureModal(page)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    report.push({ name, url, ...m })
    console.log(`${name}: ${m ? JSON.stringify(m) : 'NO MODAL FOUND'}`)
  } catch (e) {
    report.push({ name, url, error: String(e).slice(0, 140) })
    console.log(`${name}: FAIL ${String(e).slice(0, 120)}`)
    await page.screenshot({ path: `${OUT}/${name}-FAIL.png` }).catch(() => {})
  }
  await ctx.close()
}

// dynamic ids
const idCtx = await browser.newContext({ viewport: VP })
await login(idCtx, 'student@mcodne.ge', 'student1234')
const idPage = await idCtx.newPage()
await idPage.goto(`${BASE}/student/bookings`, { waitUntil: 'networkidle' }).catch(() => {})
await idPage.waitForTimeout(2000)
const sBookingId = await idPage.evaluate(() => document.querySelector('a[href^="/student/bookings/"]')?.getAttribute('href')?.split('/')[3]?.split(/[?#]/)[0] || null)
await idCtx.close()
const tCtx = await browser.newContext({ viewport: VP })
await login(tCtx, 'giorgi.meladze@mcodne.ge', 'tutor1234')
const tPage = await tCtx.newPage()
await tPage.goto(`${BASE}/tutor/bookings`, { waitUntil: 'networkidle' }).catch(() => {})
await tPage.waitForTimeout(2000)
const tBookingId = await tPage.evaluate(() => document.querySelector('a[href^="/tutor/bookings/"]')?.getAttribute('href')?.split('/')[3]?.split(/[?#]/)[0] || null)
await tCtx.close()
console.log('ids:', { sBookingId, tBookingId })

// ── flows ──────────────────────────────────────────────────────────────
// guest
await run('guest-tutors-filters', 'guest', '/tutors', ['button:has-text("ფილტრები")'])
await run('guest-tutors-video', 'guest', '/tutors', ['button[aria-label*="ვიდეო"], button:has-text("ვიდეო")'])
// student
await run('student-dash-cancel', 'student', '/student', ['button:has-text("გაუქმება")'])
if (sBookingId) {
  await run('student-detail-cancel', 'student', `/student/bookings/${sBookingId}`, ['button:has-text("გაუქმება")'])
  await run('student-detail-reschedule', 'student', `/student/bookings/${sBookingId}`, ['button:has-text("გადადება")'])
  await run('student-detail-review', 'student', `/student/bookings/${sBookingId}?review=1`, [])
}
await run('student-settings-signout', 'student', '/settings', ['button:has-text("გასვლა")'])
await run('student-settings-delete', 'student', '/settings', ['button:has-text("წაშლა")'])
// tutor
await run('tutor-dash-decline', 'tutor', '/tutor', ['button:has-text("უარყოფა")'])
if (tBookingId) {
  await run('tutor-detail-reschedule', 'tutor', `/tutor/bookings/${tBookingId}`, ['button:has-text("გადადება")'])
}
await run('tutor-schedule-addslot', 'tutor', '/tutor/schedule', ['button:has-text("სლოტ")'])
await run('tutor-schedule-template', 'tutor', '/tutor/schedule', ['button:has-text("შაბლონ")'])
await run('tutor-profile-visibility', 'tutor', '/tutor/profile', ['button:has-text("დამალვა"), button:has-text("გამოქვეყნება")'])

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(`\ndone → ${OUT}`)
await browser.close()
