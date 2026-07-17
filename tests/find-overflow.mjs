import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } })
const page = await ctx.newPage()

async function report(url) {
  console.log(`\n=== ${url} ===`)
  await page.goto(`https://mcodne.ge${url}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // Find elements wider than viewport
  const overflowing = await page.evaluate(() => {
    const vw = window.innerWidth
    const bad = []
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect()
      if (r.right > vw + 5 && el.offsetParent !== null) {
        // Skip if a parent is also overflowing (avoid duplicates)
        let parent = el.parentElement
        while (parent) {
          const pr = parent.getBoundingClientRect()
          if (pr.right > vw + 5) return
          parent = parent.parentElement
        }
        bad.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 100),
          right: Math.round(r.right),
          width: Math.round(r.width),
          overflow: Math.round(r.right - vw),
        })
      }
    })
    return bad.slice(0, 5)
  })
  overflowing.forEach(o => console.log(`  ${o.tag} width=${o.width}px right=${o.right}px overflow=+${o.overflow}px cls="${o.cls}"`))
}

await report('/tutors')
await report('/signin?view=signup')

// Small touch targets
console.log('\n=== SMALL TAP TARGETS on /apply ===')
await page.goto('https://mcodne.ge/apply', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const small = await page.evaluate(() => {
  const bad = []
  document.querySelectorAll('button, a[href]').forEach(el => {
    if (el.offsetParent === null) return
    const r = el.getBoundingClientRect()
    if (r.height > 0 && r.height < 32 && r.width < 32) {
      bad.push({
        tag: el.tagName,
        text: (el.textContent || '').trim().slice(0, 30),
        w: Math.round(r.width),
        h: Math.round(r.height),
      })
    }
  })
  return bad.slice(0, 10)
})
small.forEach(s => console.log(`  ${s.tag} ${s.w}x${s.h} "${s.text}"`))

await browser.close()
