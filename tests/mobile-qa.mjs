import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })

const VIEWPORTS = [
  { name: 'mobile-sm', width: 375, height: 667 },  // iPhone SE
  { name: 'mobile-md', width: 390, height: 844 },  // iPhone 12
  { name: 'tablet',    width: 768, height: 1024 }, // iPad
]

const ROUTES = ['/', '/tutors', '/signin', '/signin?view=signup', '/apply']
const results = []

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  const page = await ctx.newPage()

  for (const route of ROUTES) {
    const errs = []
    page.removeAllListeners('pageerror')
    page.removeAllListeners('console')
    page.on('pageerror', e => errs.push(e.message.split('\n')[0]))
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })

    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1500)

    // Check horizontal scroll (bad responsive)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

    // Check touch target sizes (buttons < 44px are bad)
    const smallTouchTargets = await page.$$eval('button, a[href]', els => els.filter(e => {
      if (e.offsetParent === null) return false
      const r = e.getBoundingClientRect()
      return r.height > 0 && r.height < 32 && r.width < 32
    }).length)

    // Check if hamburger menu is present on mobile
    const hamburgerVisible = await page.$$eval('button[aria-label*="მენიუ"], button[aria-label*="menu"]', els => els.filter(e => e.offsetParent !== null).length)

    // Test hamburger click
    let mobMenuWorks = false
    if (hamburgerVisible > 0) {
      try {
        await page.click('button[aria-label*="მენიუ"], button[aria-label*="menu"]', { timeout: 3000 })
        await page.waitForTimeout(500)
        const drawer = await page.$('[class*="fixed top-0 right-0 bottom-0"], [class*="fixed inset-y"]')
        mobMenuWorks = !!drawer
        if (drawer) {
          const closeBtn = await page.$('button[aria-label="დახურვა"]')
          if (closeBtn) await closeBtn.click()
        }
      } catch {}
    }

    // Check if any content is cut off
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight)

    results.push({
      vp: vp.name,
      route,
      overflow,
      smallTouchTargets,
      hamburgerVisible,
      mobMenuWorks,
      bodyHeight,
      errCount: errs.length,
      errs: errs.slice(0, 2),
    })
  }
  await ctx.close()
}

console.log('=== MOBILE / RESPONSIVE QA ===\n')
for (const r of results) {
  const bad = r.overflow > 0 || r.smallTouchTargets > 3 || r.errCount > 0
  console.log(`${bad ? '✗' : '✓'} [${r.vp}] ${r.route}`)
  console.log(`    overflow: ${r.overflow}px, small-tap: ${r.smallTouchTargets}, hamburger: ${r.hamburgerVisible}, mobMenu: ${r.mobMenuWorks}, err: ${r.errCount}`)
  r.errs.forEach(e => console.log(`      ERR: ${e}`))
}

await browser.close()
