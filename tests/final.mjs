import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })

const results = []
async function test(name, fn) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    const outcome = await fn(page)
    results.push({ name, ok: true, outcome })
  } catch (e) {
    results.push({ name, ok: false, err: e.message.split('\n')[0] })
  }
  await ctx.close()
}

await test('LANDING → დაიწყე', async p => { await p.goto(`${BASE}/`); await p.click('button:has-text("დაიწყე") >> nth=0'); await p.waitForTimeout(1500); return p.url() })
await test('LANDING → შესვლა', async p => { await p.goto(`${BASE}/`); await p.click('button:has-text("შესვლა") >> nth=0'); await p.waitForTimeout(1500); return p.url() })
await test('LANDING → search', async p => { await p.goto(`${BASE}/`); await p.fill('input[placeholder*="fundraising"]', 'Series A'); await p.click('button:has-text("ექსპერტის ძიება")'); await p.waitForTimeout(1500); return p.url() })
await test('SIGNIN student', async p => { await p.goto(`${BASE}/signin`); await p.fill('input[type=email]', 'student@mcodne.ge'); await p.fill('input[type=password]', 'student1234'); await Promise.all([p.waitForURL(/\/student/, { timeout: 8000 }).catch(() => {}), p.click('button[type=submit]:has-text("შესვლა")')]); await p.waitForTimeout(1500); return p.url() })
await test('SIGNIN admin', async p => { await p.goto(`${BASE}/signin`); await p.fill('input[type=email]', 'admin@mcodne.ge'); await p.fill('input[type=password]', 'admin1234'); await Promise.all([p.waitForURL(/\/admin/, { timeout: 8000 }).catch(() => {}), p.click('button[type=submit]:has-text("შესვლა")')]); await p.waitForTimeout(1500); return p.url() })
await test('SIGNUP student', async p => {
  const email = `bt${Date.now()}@mcodne.test`
  await p.goto(`${BASE}/signin?view=signup`)
  await p.waitForTimeout(700)
  await p.fill('input[placeholder*="ანი"]', 'ტესტ ერი')
  await p.fill('input[type=email]', email)
  await p.fill('input[type=password]', 'pass1234')
  const cb = await p.$('input[type="checkbox"]')
  if (cb) await cb.check({ force: true })
  await p.waitForTimeout(200)
  await Promise.all([p.waitForURL(/\/(student|apply)/, { timeout: 10000 }).catch(() => {}), p.click('button[type=submit]:has-text("ანგარიშის შექმნა")')])
  await p.waitForTimeout(1500)
  return `${email} → ${p.url()}`
})
await test('TUTORS listing', async p => { await p.goto(`${BASE}/tutors`); await p.waitForTimeout(2000); const n = await p.$$eval('a[href^="/tutors/"]', els => els.length); return `${n} tutor cards` })
await test('APPLY loads', async p => { await p.goto(`${BASE}/apply`); const has = await p.$('button:has-text("შემდეგი")'); return has ? 'next button present' : 'missing' })

console.log('\n' + '='.repeat(60))
results.forEach(r => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.outcome ? ' → ' + r.outcome : ''}${r.err ? ' ✗ ' + r.err : ''}`))
await browser.close()
