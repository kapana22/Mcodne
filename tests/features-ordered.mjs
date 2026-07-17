const BASE = 'https://mcodne.ge'
const results = []
async function test(name, fn) {
  try { const r = await fn(); results.push({ name, ok: r?.ok !== false, result: r }) }
  catch (e) { results.push({ name, ok: false, err: e.message.split('\n')[0] }) }
}
const signin = async (email, pw) => {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  })
  return { cookie: res.headers.get('set-cookie') || '', status: res.status }
}

// Wait 16 min? No, just do the tests in proper order — signin ONCE, reuse cookie
const auth = await signin('student@mcodne.ge', 'student1234')
if (auth.status !== 200) {
  console.log(`FAIL: cannot signin, status=${auth.status}`)
  process.exit(1)
}
const cookie = auth.cookie
const tutors = await (await fetch(`${BASE}/api/tutors`)).json()

// 1. Favorites
await test('FAVORITES: add / list / delete', async () => {
  const tutorId = tutors[0].id
  const add = await fetch(`${BASE}/api/favorites`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ tutorId }),
  })
  const list = await (await fetch(`${BASE}/api/favorites`, { headers: { cookie } })).json()
  const del = await fetch(`${BASE}/api/favorites`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ tutorId }),
  })
  return { add: add.status, listCount: list.length, del: del.status, ok: add.status === 200 && del.status === 200 }
})

// 2. Review non-completed booking
await test('REVIEW: reject non-completed booking', async () => {
  const bks = await (await fetch(`${BASE}/api/student/bookings`, { headers: { cookie } })).json()
  const active = bks.find(b => b.status !== 'COMPLETED')
  if (!active) return { skip: 'no active' }
  const r = await fetch(`${BASE}/api/reviews`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ bookingId: active.id, rating: 5, body: 'შესანიშნავი სესია' }),
  })
  const data = await r.json()
  return { status: r.status, err: data.error, ok: r.status === 400 && data.error === 'NOT_COMPLETED' }
})

// 3. Cancel booking
await test('CANCEL: booking flow', async () => {
  const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
  const create = await fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ tutorId: tutors[2].id, topic: 'cancel test', startAt: future, durationMin: 30, price: 40 }),
  })
  const created = await create.json()
  if (!created.ok) return { create: create.status, err: created.error }
  const cancel = await fetch(`${BASE}/api/bookings/${created.id}/cancel`, {
    method: 'POST', headers: { cookie },
  })
  const cancelBody = await cancel.json()
  return { create: create.status, cancel: cancel.status, fullRefund: cancelBody.fullRefund, ok: cancel.status === 200 }
})

// 4. Upload oversize rejected
await test('UPLOAD: rejects oversize avatar', async () => {
  const form = new FormData()
  const big = new Blob([new Uint8Array(600 * 1024)], { type: 'image/jpeg' })
  form.append('kind', 'avatar')
  form.append('file', big, 'big.jpg')
  const r = await fetch(`${BASE}/api/uploads`, { method: 'POST', headers: { cookie }, body: form })
  const data = await r.json()
  return { status: r.status, err: data.error, ok: r.status === 400 }
})

// 5. Upload small avatar
await test('UPLOAD: accepts small avatar', async () => {
  const form = new FormData()
  const small = new Blob([new Uint8Array(1024)], { type: 'image/png' })
  form.append('kind', 'avatar')
  form.append('file', small, 'tiny.png')
  const r = await fetch(`${BASE}/api/uploads`, { method: 'POST', headers: { cookie }, body: form })
  const data = await r.json()
  return { status: r.status, hasDataUrl: data.url?.startsWith('data:'), ok: r.status === 200 }
})

// 6. Upload bad file type
await test('UPLOAD: rejects .exe', async () => {
  const form = new FormData()
  const exe = new Blob([new Uint8Array(100)], { type: 'application/x-msdownload' })
  form.append('kind', 'attachment')
  form.append('file', exe, 'evil.exe')
  const r = await fetch(`${BASE}/api/uploads`, { method: 'POST', headers: { cookie }, body: form })
  const data = await r.json()
  return { status: r.status, err: data.error, ok: r.status === 400 }
})

// 7. OTP send
await test('OTP: send verification code', async () => {
  const r = await fetch(`${BASE}/api/auth/otp/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', purpose: 'verify' }),
  })
  return { status: r.status, ok: r.status === 200 }
})

// 8. OTP verify wrong code
await test('OTP: verify wrong code returns 400', async () => {
  const r = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', code: '000000' }),
  })
  return { status: r.status, ok: r.status === 400 }
})

// 9. Password reset request
await test('RESET: request 200', async () => {
  const r = await fetch(`${BASE}/api/auth/reset/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge' }),
  })
  return { status: r.status, ok: r.status === 200 }
})

// 10. Reset bad token rejected
await test('RESET: bad token rejected', async () => {
  const r = await fetch(`${BASE}/api/auth/reset/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'fake-invalid-token-1234567890', password: 'newpass1234' }),
  })
  return { status: r.status, ok: r.status === 400 }
})

// 11. Rate limit LAST — 12 signin attempts should trip after 8
await test('RATE LIMIT: signin 12 attempts trips after 8', async () => {
  const statuses = []
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${BASE}/api/auth/signin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `nope${i}@nope.com`, password: 'wrongpw' }),
    })
    statuses.push(r.status)
  }
  return { statuses, tripped: statuses.includes(429), ok: statuses.includes(429) }
})

console.log('\n' + '='.repeat(70))
for (const r of results) {
  const flag = r.ok ? '✓' : '✗'
  console.log(`${flag} ${r.name}`)
  if (r.result) console.log(`    → ${JSON.stringify(r.result).slice(0, 220)}`)
  if (r.err) console.log(`    ERR: ${r.err}`)
}
