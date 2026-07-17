import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

const problems = []
page.on('pageerror', e => problems.push({ type: 'PAGE-ERROR', page: page.url(), msg: e.message.split('\n')[0] }))
page.on('response', r => {
  if (r.status() >= 400) problems.push({ type: r.status() >= 500 ? '5XX' : '4XX', page: page.url(), msg: `${r.status()} ${new URL(r.url()).pathname}` })
})
page.on('requestfailed', r => {
  const err = r.failure()?.errorText
  if (err !== 'net::ERR_ABORTED') problems.push({ type: 'REQ-FAIL', page: page.url(), msg: `${r.url().slice(0, 80)}: ${err}` })
})

// Test suite
const routes = [
  { p: '/', name: 'Landing' },
  { p: '/signin', name: 'Signin' },
  { p: '/signin?view=signup', name: 'Signup' },
  { p: '/tutors', name: 'Tutors' },
  { p: '/apply', name: 'Apply' },
]

for (const r of routes) {
  problems.length = 0
  await page.goto(`${BASE}${r.p}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const brokenImgs = await page.$$eval('img', imgs => imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src))
  const errs404 = problems.filter(p => p.type === '4XX').length
  const errs5xx = problems.filter(p => p.type === '5XX').length
  const jsErrs = problems.filter(p => p.type === 'PAGE-ERROR').length
  const reqFails = problems.filter(p => p.type === 'REQ-FAIL').length
  const status = jsErrs || errs5xx || brokenImgs.length > 2 || reqFails ? '✗' : '✓'
  console.log(`${status} ${r.name} (${r.p})`)
  if (jsErrs) problems.filter(p => p.type === 'PAGE-ERROR').forEach(p => console.log(`   JS: ${p.msg}`))
  if (errs5xx) problems.filter(p => p.type === '5XX').forEach(p => console.log(`   5XX: ${p.msg}`))
  if (brokenImgs.length) console.log(`   BROKEN-IMG (${brokenImgs.length}): ${brokenImgs.slice(0, 2).join(', ')}`)
  if (reqFails) problems.filter(p => p.type === 'REQ-FAIL').forEach(p => console.log(`   FAIL: ${p.msg}`))
}

await browser.close()
