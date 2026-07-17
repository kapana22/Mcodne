import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } })
const page = await ctx.newPage()

for (const url of ['/tutors', '/apply']) {
  console.log(`\n=== ${url} — small tap targets ===`)
  await page.goto(`https://mcodne.ge${url}`, { waitUntil: 'networkidle' })
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
          aria: el.getAttribute('aria-label') || '',
          w: Math.round(r.width),
          h: Math.round(r.height),
          cls: (el.className || '').toString().slice(0, 80),
        })
      }
    })
    return bad
  })
  small.forEach(s => console.log(`  ${s.w}x${s.h} "${s.text}" aria="${s.aria}"`))
}

await browser.close()
