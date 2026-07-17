import { chromium } from 'playwright'
const BASE = 'https://mcodne.ge'
const browser = await chromium.launch({ headless: true })

const issues = []
async function runTest(name, fn) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const errs = []
  const apiFails = []
  page.on('pageerror', e => errs.push(`PAGE-ERROR: ${e.message.split('\n')[0]}`))
  page.on('console', m => { if (m.type() === 'error') errs.push(`CONSOLE: ${m.text().slice(0, 250)}`) })
  page.on('response', async r => {
    if (r.url().includes('/api/') && r.status() >= 400) {
      let body = ''
      try { body = (await r.text()).slice(0, 200) } catch {}
      apiFails.push(`${r.status()} ${new URL(r.url()).pathname}: ${body}`)
    }
  })
  try {
    const result = await fn(page, ctx)
    if (errs.length || apiFails.length) {
      issues.push({ name, ok: false, result, errs, apiFails })
    } else {
      issues.push({ name, ok: true, result })
    }
  } catch (e) {
    issues.push({ name, ok: false, err: e.message.split('\n')[0], errs, apiFails })
  }
  await ctx.close()
}

const login = async (page, email, pw, expectedPath) => {
  await page.goto(`${BASE}/signin`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', pw)
  await page.click('button[type=submit]:has-text("შესვლა")')
  await page.waitForURL(new RegExp(expectedPath), { timeout: 10000 })
  await page.waitForTimeout(1500)
}

// 1. Full booking flow — student signs in, opens tutor profile, books
await runTest('BOOK: full flow via /api/bookings', async (page, ctx) => {
  await login(page, 'student@mcodne.ge', 'student1234', '/student')
  const tutors = await (await fetch(`${BASE}/api/tutors`)).json()
  await page.goto(`${BASE}/tutors/${tutors[0].id}`)
  await page.waitForTimeout(2000)

  // Try to open booking modal via any "დაჯავშ" button
  const bookBtn = await page.$('button:has-text("დაჯავშ"), button:has-text("გაცნობა"), button:has-text("დაიწყე")')
  if (!bookBtn) return { step: 'no book button' }
  await bookBtn.click()
  await page.waitForTimeout(1500)

  // Advance modal through steps
  for (let i = 0; i < 5; i++) {
    const next = await page.$('button:has-text("შემდეგი"), button:has-text("გადახდა"), button:has-text("ჯავშნა"), button[type=submit]:has-text("დაასრულე")')
    if (!next) break
    const disabled = await next.isDisabled().catch(() => false)
    if (disabled) return { step: i, blocked: true, buttonText: (await next.textContent())?.trim() }
    await next.click()
    await page.waitForTimeout(1200)
  }

  return { step: 'submitted', url: page.url() }
})

// 2. Apply flow — sign in, go to apply, submit
await runTest('APPLY: full flow → /api/applications', async (page) => {
  await login(page, 'student@mcodne.ge', 'student1234', '/student')
  await page.goto(`${BASE}/apply`)
  await page.waitForTimeout(2000)

  // Click "შემდეგი" through all steps until submitted
  for (let i = 0; i < 6; i++) {
    const btn = await page.$('button:has-text("წარდგენა მოდერაციისთვის"), button:has-text("შემდეგი — წარდგენა"), button:has-text("შემდეგი")')
    if (!btn) return { step: i, noButton: true }
    const disabled = await btn.isDisabled()
    if (disabled) return { step: i, blocked: true }
    const text = (await btn.textContent())?.trim().slice(0, 40)
    await btn.click()
    await page.waitForTimeout(1500)
    if (text?.includes('წარდგენა მოდერაციისთვის')) return { step: i, submitted: true, url: page.url() }
  }
  return { step: 'timeout' }
})

// 3. Message send — student on booking detail
await runTest('MSG: send message on booking detail', async (page, ctx) => {
  await login(page, 'student@mcodne.ge', 'student1234', '/student')
  const jar = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ')
  const bookings = await (await fetch(`${BASE}/api/student/bookings`, { headers: { cookie: jar } })).json()
  if (!bookings.length) return { skip: 'no bookings' }
  await page.goto(`${BASE}/student/bookings/${bookings[0].id}`)
  await page.waitForTimeout(2000)

  // Try to find message input and send
  const textareas = await page.$$('textarea, input[placeholder*="მიუწერე"], input[placeholder*="შეტ"]')
  if (!textareas.length) return { noInput: true }

  await textareas[0].fill('ტესტ შეტყობინება ' + Date.now())
  await page.waitForTimeout(300)
  const send = await page.$('button:has-text("გაგზავნა"), button[aria-label*="send"], button:has(svg)')
  if (!send) return { noSendBtn: true }
  await send.click()
  await page.waitForTimeout(1500)
  return { done: 'clicked' }
})

// 4. Session enter from booking detail
await runTest('SESSION: enter via booking detail', async (page, ctx) => {
  await login(page, 'student@mcodne.ge', 'student1234', '/student')
  const jar = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ')
  const bookings = await (await fetch(`${BASE}/api/student/bookings`, { headers: { cookie: jar } })).json()
  if (!bookings.length) return { skip: 'no bookings' }
  await page.goto(`${BASE}/student/bookings/${bookings[0].id}`)
  await page.waitForTimeout(1500)
  const enter = await page.$('button:has-text("ვიდეო-ოთახში"), button:has-text("ოთახში შესვლა"), a:has-text("სესია")')
  if (!enter) return { noEnterBtn: true }
  await enter.click()
  await page.waitForTimeout(2000)
  return { url: page.url() }
})

// 5. Admin approve application flow
await runTest('ADMIN: approve application', async (page) => {
  await login(page, 'admin@mcodne.ge', 'admin1234', '/admin')
  await page.goto(`${BASE}/admin#moderation`)
  await page.waitForTimeout(2000)

  const approve = await page.$('button:has-text("დაამტკიცე")')
  if (!approve) return { noApproveBtn: true }
  const disabled = await approve.isDisabled().catch(() => false)
  if (disabled) return { disabled: true }
  // Not clicking to avoid modifying data — just verify present + enabled
  return { present: true, disabled }
})

// 6. Tutor dashboard sections all render
await runTest('TUTOR: all 10 hash sections load', async (page) => {
  await login(page, 'giorgi.meladze@mcodne.ge', 'tutor1234', '/tutor')
  const sections = ['today', 'calendar', 'requests', 'earnings', 'messages', 'reviews', 'consultations', 'profile', 'settings', 'help']
  const results = {}
  for (const s of sections) {
    await page.goto(`${BASE}/tutor#${s}`)
    await page.waitForTimeout(700)
    const bodySize = await page.evaluate(() => document.body.innerText.length)
    const hasErr = await page.$('text=/Application error|Something went wrong/i').then(el => !!el)
    results[s] = { bodySize, hasErr }
  }
  return results
})

// 7. Admin all 6 tabs load
await runTest('ADMIN: all 6 hash tabs load', async (page) => {
  await login(page, 'admin@mcodne.ge', 'admin1234', '/admin')
  const tabs = ['overview', 'moderation', 'disputes', 'users', 'finance', 'analytics']
  const results = {}
  for (const t of tabs) {
    await page.goto(`${BASE}/admin#${t}`)
    await page.waitForTimeout(700)
    const bodySize = await page.evaluate(() => document.body.innerText.length)
    const hasErr = await page.$('text=/Application error|Something went wrong/i').then(el => !!el)
    results[t] = { bodySize, hasErr }
  }
  return results
})

// 8. Category filter on tutors
await runTest('TUTORS: category filter', async (page) => {
  await page.goto(`${BASE}/tutors?category=business`)
  await page.waitForTimeout(2000)
  const links = await page.$$eval('a[href^="/tutors/"], article', els => els.length)
  return { cards: links }
})

// 9. Search query on tutors
await runTest('TUTORS: search query', async (page) => {
  await page.goto(`${BASE}/tutors?q=Series`)
  await page.waitForTimeout(2000)
  const bodySize = await page.evaluate(() => document.body.innerText.length)
  return { bodySize }
})

// 10. Sign out with real redirect
await runTest('SIGNOUT: /api/auth/signout redirects to origin', async (page) => {
  await login(page, 'student@mcodne.ge', 'student1234', '/student')
  await page.goto(`${BASE}/api/auth/signout`)
  await page.waitForTimeout(1500)
  return { url: page.url() }
})

// Summary
console.log('\n' + '='.repeat(70))
for (const i of issues) {
  const flag = i.ok ? '✓' : '✗'
  console.log(`${flag} ${i.name}`)
  if (i.result) console.log(`    result: ${JSON.stringify(i.result).slice(0, 200)}`)
  if (i.err) console.log(`    ERR: ${i.err}`)
  if (i.errs?.length) i.errs.slice(0, 3).forEach(e => console.log(`    ${e}`))
  if (i.apiFails?.length) i.apiFails.slice(0, 3).forEach(e => console.log(`    API: ${e}`))
}

await browser.close()
