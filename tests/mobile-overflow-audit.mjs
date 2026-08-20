// Mobile responsiveness audit — hunts horizontal overflow, hidden burger
// menus, and text that overflows its container. Runs at 360 + 390px across
// guest/student/tutor. Georgian mtavruli (font-feature "case") makes headings
// wider than Latin, so this is where the "text escapes the box" bugs surface.
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3000'
const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-kapana-Desktop-Tutor/1141fbfc-6439-42b3-aa12-d63cc0dafd6b/scratchpad/mobile1'
fs.mkdirSync(OUT, { recursive: true })

const CREDS = {
  student: { email: 'student@mcodne.ge', password: 'student1234' },
  tutor: { email: 'giorgi.meladze@mcodne.ge', password: 'tutor1234' },
}
const browser = await chromium.launch({ headless: true })
const report = []

async function ctxFor(role) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  if (role !== 'guest') {
    const p = await ctx.newPage()
    await p.request.post(`${BASE}/api/auth/signin`, { data: CREDS[role], timeout: 120000 })
    await p.close()
  }
  return ctx
}

async function audit(ctx, role, route, name, width) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width, height: 844 })
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(`${BASE}${route}`, { waitUntil: 'load' }))
    await page.waitForTimeout(2200)
    const facts = await page.evaluate((vw) => {
      const de = document.documentElement
      const docOverflow = de.scrollWidth - vw
      // Find every element whose right edge escapes the viewport.
      const offenders = []
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return
        // element itself pushes past the right edge by >1px and isn't full-bleed decor
        if (r.right > vw + 1 && r.left >= -1 && r.width <= vw + 40) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || '').split(' ').slice(0, 4).join('.').slice(0, 70),
            right: Math.round(r.right),
            over: Math.round(r.right - vw),
            text: (el.textContent || '').trim().slice(0, 32),
          })
        }
      })
      // Text that overflows its own box (word too long / no wrap).
      const textClip = []
      document.querySelectorAll('h1,h2,h3,h4,a,button,span,p,div').forEach(el => {
        if (el.children.length > 0) return // leaf-ish only
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          const st = getComputedStyle(el)
          if (st.overflow === 'visible' || st.textOverflow === 'clip' || st.whiteSpace === 'nowrap') {
            textClip.push({
              tag: el.tagName.toLowerCase(),
              cls: String(el.className || '').split(' ').slice(0, 3).join('.').slice(0, 50),
              over: el.scrollWidth - el.clientWidth,
              text: (el.textContent || '').trim().slice(0, 30),
            })
          }
        }
      })
      // Burger button present + visible at this width?
      const burger = document.querySelector('button[aria-label="მენიუ"]')
      const burgerVisible = burger ? (burger.getBoundingClientRect().width > 0 && getComputedStyle(burger).display !== 'none') : false
      return {
        docOverflow,
        offenders: offenders.sort((a, b) => b.over - a.over).slice(0, 6),
        textClip: textClip.slice(0, 6),
        burgerPresent: !!burger,
        burgerVisible,
      }
    }, width)
    await page.screenshot({ path: `${OUT}/${role}-${width}-${name}.png`, fullPage: false })
    report.push({ role, width, route, name, ...facts })
  } catch (e) {
    report.push({ role, width, route, name, error: String(e).slice(0, 120) })
  }
  await page.close()
}

async function firstId(ctx, list, prefix) {
  const p = await ctx.newPage()
  await p.goto(`${BASE}${list}`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {})
  await p.waitForTimeout(1800)
  const id = await p.evaluate((pre) => {
    const a = document.querySelector(`a[href^="${pre}"]`)
    return a ? a.getAttribute('href').replace(pre, '').split(/[?#]/)[0] : null
  }, prefix)
  await p.close()
  return id
}

const guest = await ctxFor('guest')
const student = await ctxFor('student')
const tutor = await ctxFor('tutor')

const tutorId = await firstId(guest, '/tutors', '/tutors/')
const sBooking = await firstId(student, '/me/bookings', '/me/bookings/')

const GUEST = [['/', 'home'], ['/tutors', 'tutors'], tutorId && [`/tutors/${tutorId}`, 'profile'], ['/categories', 'categories'], ['/about', 'about'], ['/help', 'help'], ['/contact', 'contact'], ['/signin', 'signin'], ['/apply', 'apply']].filter(Boolean)
const STUDENT = [['/me', 'dashboard'], ['/me/bookings', 'bookings'], sBooking && [`/me/bookings/${sBooking}`, 'booking-detail'], ['/me/messages', 'messages'], ['/me/favorites', 'favorites'], ['/settings', 'settings']].filter(Boolean)
const TUTOR = [['/work', 'dashboard'], ['/work/bookings', 'bookings'], ['/work/schedule', 'schedule'], ['/work/earnings', 'earnings'], ['/work/profile', 'profile']].filter(Boolean)

for (const w of [360, 390]) {
  for (const [r, n] of GUEST) await audit(guest, 'guest', r, n, w)
  for (const [r, n] of STUDENT) await audit(student, 'student', r, n, w)
  for (const [r, n] of TUTOR) await audit(tutor, 'tutor', r, n, w)
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
for (const r of report) {
  const p = []
  if (r.error) { console.log(`[${r.role}@${r.width}] ${r.route} :: ERROR ${r.error}`); continue }
  if (r.docOverflow > 1) p.push(`DOC-OVERFLOW +${r.docOverflow}px`)
  if (r.offenders?.length) p.push(`offenders: ${r.offenders.map(o => `${o.tag}.${o.cls}(+${o.over} "${o.text}")`).join(' ; ')}`)
  if (r.textClip?.length) p.push(`text-clip: ${r.textClip.map(t => `"${t.text}"(+${t.over})`).join(' ; ')}`)
  if (r.burgerPresent && !r.burgerVisible) p.push('BURGER-HIDDEN')
  if (!r.burgerPresent && ['home','tutors','profile','categories','about','help','contact','signin','apply'].includes(r.name)) p.push('BURGER-MISSING')
  if (p.length) console.log(`[${r.role}@${r.width}] ${r.route} :: ${p.join(' | ')}`)
}
console.log(`\n${report.length} views audited → ${OUT}`)
await browser.close()
