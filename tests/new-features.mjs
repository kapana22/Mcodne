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

// 1. Rate limiting on signin
await test('RATE LIMIT: signin 9 attempts', async () => {
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

// 2. OTP send
await test('OTP: send verification code', async () => {
  const r = await fetch(`${BASE}/api/auth/otp/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', purpose: 'verify' }),
  })
  return { status: r.status, ok: r.status === 200 }
})

// 3. OTP verify with wrong code
await test('OTP: verify wrong code returns 400', async () => {
  const r = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge', code: '000000' }),
  })
  return { status: r.status, ok: r.status === 400 }
})

// 4. Password reset request
await test('RESET: request', async () => {
  const r = await fetch(`${BASE}/api/auth/reset/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@mcodne.ge' }),
  })
  return { status: r.status, ok: r.status === 200 }
})

// 5. Password reset confirm with bad token
await test('RESET: bad token rejected', async () => {
  const r = await fetch(`${BASE}/api/auth/reset/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'fake-invalid-token-1234567890', password: 'newpass1234' }),
  })
  return { status: r.status, ok: r.status === 400 }
})

// 6. Favorites add + list + delete
await test('FAVORITES: add / list / delete', async () => {
  const auth = await signin('student@mcodne.ge', 'student1234')
  const tutors = await (await fetch(`${BASE}/api/tutors`)).json()
  const tutorId = tutors[0].id

  const add = await fetch(`${BASE}/api/favorites`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: auth.cookie },
    body: JSON.stringify({ tutorId }),
  })
  const list = await fetch(`${BASE}/api/favorites`, { headers: { cookie: auth.cookie } })
  const listBody = await list.json()
  const del = await fetch(`${BASE}/api/favorites`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', cookie: auth.cookie },
    body: JSON.stringify({ tutorId }),
  })
  return {
    add: add.status,
    listCount: listBody.length,
    del: del.status,
    ok: add.status === 200 && del.status === 200,
  }
})

// 7. Review requires COMPLETED booking
await test('REVIEW: reject non-completed booking', async () => {
  const auth = await signin('student@mcodne.ge', 'student1234')
  const bks = await (await fetch(`${BASE}/api/student/bookings`, { headers: { cookie: auth.cookie } })).json()
  const active = bks.find(b => b.status !== 'COMPLETED')
  if (!active) return { skip: 'no active booking' }
  const r = await fetch(`${BASE}/api/reviews`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: auth.cookie },
    body: JSON.stringify({ bookingId: active.id, rating: 5, body: 'შესანიშნავი სესია' }),
  })
  return { status: r.status, ok: r.status === 400 }
})

// 8. Booking cancel
await test('CANCEL: booking flow', async () => {
  const auth = await signin('student@mcodne.ge', 'student1234')
  const tutors = await (await fetch(`${BASE}/api/tutors`)).json()
  const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
  const create = await fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: auth.cookie },
    body: JSON.stringify({ tutorId: tutors[2].id, topic: 'cancel test', startAt: future, durationMin: 30, price: 40 }),
  })
  const created = await create.json()
  if (!created.ok) return { create: create.status, err: created.error }
  const cancel = await fetch(`${BASE}/api/bookings/${created.id}/cancel`, {
    method: 'POST', headers: { cookie: auth.cookie },
  })
  const cancelBody = await cancel.json()
  return { create: create.status, cancel: cancel.status, fullRefund: cancelBody.fullRefund, ok: cancel.status === 200 }
})

// 9. Upload rejects large file
await test('UPLOAD: rejects oversize', async () => {
  const auth = await signin('student@mcodne.ge', 'student1234')
  const form = new FormData()
  const big = new Blob([new Uint8Array(600 * 1024)], { type: 'image/jpeg' }) // 600KB > 500KB avatar limit
  form.append('kind', 'avatar')
  form.append('file', big, 'big.jpg')
  const r = await fetch(`${BASE}/api/uploads`, { method: 'POST', headers: { cookie: auth.cookie }, body: form })
  return { status: r.status, ok: r.status === 400 }
})

// 10. Upload accepts small avatar
await test('UPLOAD: accepts small avatar', async () => {
  const auth = await signin('student@mcodne.ge', 'student1234')
  const form = new FormData()
  const small = new Blob([new Uint8Array(1024)], { type: 'image/png' }) // 1KB
  form.append('kind', 'avatar')
  form.append('file', small, 'tiny.png')
  const r = await fetch(`${BASE}/api/uploads`, { method: 'POST', headers: { cookie: auth.cookie }, body: form })
  const body = await r.json()
  return { status: r.status, hasUrl: typeof body.url === 'string' && body.url.startsWith('data:'), ok: r.status === 200 }
})

// Summary
console.log('\n' + '='.repeat(70))
for (const r of results) {
  const flag = r.ok ? '✓' : '✗'
  console.log(`${flag} ${r.name}`)
  if (r.result) console.log(`    → ${JSON.stringify(r.result).slice(0, 220)}`)
  if (r.err) console.log(`    ERR: ${r.err}`)
}
