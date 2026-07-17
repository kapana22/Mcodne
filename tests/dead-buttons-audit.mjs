import { chromium } from 'playwright'
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })

// Sign in as admin to reach all pages
const signIn = async (email, pw) => {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/signin`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', pw)
  await page.click('button[type=submit]:has-text("შესვლა")')
  await page.waitForTimeout(2000)
  await page.close()
}

async function auditPage(url, name) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // Find every clickable button — check if it has onclick handler or is inside a form
  const audit = await page.evaluate(() => {
    const results = { buttons: [], links: [] }
    // Check all buttons
    document.querySelectorAll('button').forEach(b => {
      const text = (b.textContent || '').trim().slice(0, 50)
      const type = b.getAttribute('type') || 'submit'
      const isSubmit = type === 'submit'
      const insideForm = !!b.closest('form')
      const hasOnclick = !!b.onclick
      const hasReactHandler = Object.keys(b).some(k => k.startsWith('__reactProps'))
      let reactHasHandler = false
      if (hasReactHandler) {
        const propsKey = Object.keys(b).find(k => k.startsWith('__reactProps'))
        const props = b[propsKey]
        reactHasHandler = !!(props?.onClick || props?.onSubmit)
      }
      const disabled = b.disabled
      const visible = b.offsetParent !== null
      results.buttons.push({
        text, type, insideForm, hasOnclick, reactHasHandler, disabled, visible,
        isDead: !hasOnclick && !reactHasHandler && !(isSubmit && insideForm)
      })
    })
    // Check links (a tags)
    document.querySelectorAll('a').forEach(a => {
      const text = (a.textContent || '').trim().slice(0, 50)
      const href = a.getAttribute('href') || ''
      results.links.push({ text, href, dead: href === '#' || href === '' })
    })
    return results
  })

  const dead = audit.buttons.filter(b => b.isDead && b.visible && !b.disabled && b.text.length > 0)
  const wired = audit.buttons.filter(b => !b.isDead && b.visible)
  const deadLinks = audit.links.filter(l => l.dead && l.text.length > 0)

  await page.close()
  return { name, url, totalButtons: audit.buttons.length, wired: wired.length, dead: dead.length, deadButtons: dead.slice(0, 20), deadLinks: deadLinks.slice(0, 10) }
}

const publicPages = [
  { url: '/', name: 'Landing' },
  { url: '/signin', name: 'Signin' },
  { url: '/signin?view=signup', name: 'Signup' },
  { url: '/signin?view=verify', name: 'Verify' },
  { url: '/signin?view=reset', name: 'Reset' },
  { url: '/tutors', name: 'TutorsListing' },
  { url: '/apply', name: 'Apply' },
]

// Public audit (no signin)
console.log('=== PUBLIC PAGES ===')
for (const p of publicPages) {
  const r = await auditPage(p.url, p.name)
  console.log(`\n${r.name} (${r.url}): total=${r.totalButtons} wired=${r.wired} dead=${r.dead}`)
  if (r.deadButtons.length) {
    console.log('  DEAD BUTTONS:')
    r.deadButtons.forEach(b => console.log(`    "${b.text}" (type=${b.type})`))
  }
  if (r.deadLinks.length) {
    console.log('  DEAD LINKS (href=#):')
    r.deadLinks.forEach(l => console.log(`    "${l.text}"`))
  }
}

// Signed-in audit
console.log('\n\n=== SIGNED IN (student) ===')
await signIn('student@mcodne.ge', 'student1234')

const tutorsRes = await fetch(`${BASE}/api/tutors`)
const tutors = await tutorsRes.json()
const bookingsRes = await fetch(`${BASE}/api/student/bookings`, {
  headers: { cookie: (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ') }
})
const bookings = await bookingsRes.json()

const studentPages = [
  { url: '/student', name: 'StudentDash' },
  { url: `/tutors/${tutors[0].id}`, name: 'ExpertProfile' },
  ...(bookings[0] ? [
    { url: `/student/bookings/${bookings[0].id}`, name: 'BookingDetail' },
    { url: `/session/${bookings[0].id}`, name: 'VideoSession' },
  ] : []),
]

for (const p of studentPages) {
  const r = await auditPage(p.url, p.name)
  console.log(`\n${r.name} (${r.url}): total=${r.totalButtons} wired=${r.wired} dead=${r.dead}`)
  if (r.deadButtons.length) {
    console.log('  DEAD BUTTONS:')
    r.deadButtons.forEach(b => console.log(`    "${b.text}"`))
  }
}

// Admin
console.log('\n\n=== SIGNED IN (admin) ===')
await ctx.clearCookies()
await signIn('admin@mcodne.ge', 'admin1234')
const adminAudit = await auditPage('/admin', 'AdminOverview')
console.log(`\nAdmin (${adminAudit.url}): total=${adminAudit.totalButtons} wired=${adminAudit.wired} dead=${adminAudit.dead}`)
if (adminAudit.deadButtons.length) {
  console.log('  DEAD:')
  adminAudit.deadButtons.forEach(b => console.log(`    "${b.text}"`))
}

// Tutor
console.log('\n\n=== SIGNED IN (tutor) ===')
await ctx.clearCookies()
await signIn('giorgi.meladze@mcodne.ge', 'tutor1234')
const tutorAudit = await auditPage('/tutor', 'TutorDash')
console.log(`\nTutor (${tutorAudit.url}): total=${tutorAudit.totalButtons} wired=${tutorAudit.wired} dead=${tutorAudit.dead}`)
if (tutorAudit.deadButtons.length) {
  console.log('  DEAD:')
  tutorAudit.deadButtons.slice(0, 15).forEach(b => console.log(`    "${b.text}"`))
}

await browser.close()
