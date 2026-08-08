/*
 * Two payload rules that are INVISIBLE when broken — the page looks identical,
 * it is just megabytes heavier or 500s on a hand-typed URL.
 *
 * Run with:  npx tsx tests/apiPayloadHygiene.test.ts
 *
 * 1. NO RAW AVATARS IN LIST PAYLOADS. `User.avatarUrl` holds a base64 `data:`
 *    webp (~32 KB encoded — files live in Postgres, there is no bucket). Any
 *    route that selects it for N rows and hands the stored value straight to the
 *    browser ships N × 32 KB that no cache can ever reuse. This has been fixed
 *    route-by-route three times now (browse, applications, and 2026-08-03 the
 *    admin users list / expert bookings / message inbox) because nothing
 *    stopped the next one being written the old way. `lib/avatarSrc.ts` says it
 *    out loud: „USE IT IN EVERY LIST PAYLOAD … the bug this exists to prevent,
 *    and it is invisible."
 *
 * 2. NO `Number(searchParams.get(...))` AS A `take`. `Math.min(Number('abc'),
 *    200)` is NaN, Prisma throws on `take: NaN`, and a clamp becomes a 500.
 *    `lib/apiParams.ts` is the one parser.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseLimit, parseIntParam } from '../lib/apiParams'

const ROOT = join(import.meta.dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e === 'route.ts') out.push(p)
  }
  return out
}
const ROUTES = walk(join(ROOT, 'app/api'))

/* ═══════════ 1. avatars ═════════════════════════════════════════════════ */

// Routes that legitimately handle the RAW stored value: the one that serves the
// bytes, the one that writes them, the auth callback that stores Google's URL,
// and the strip helper's own consumers. Each is a single record, not a list.
const RAW_AVATAR_OK = new Set([
  'app/api/avatars/[id]/route.ts',      // serves the bytes; raw IS the job
  'app/api/uploads/route.ts',           // writes them
  'app/api/auth/google/callback/route.ts', // stores Google's https URL
  'app/api/me/route.ts',                // the caller's OWN avatar, one record
  'app/api/admin/applications/[id]/route.ts', // one application, moderator view
  'app/api/bookings/[id]/route.ts',     // one booking, two participants
  'app/api/admin/insights/route.ts',    // aggregates, avatar not returned
  'app/api/tutor/nav-badges/route.ts',
  'app/api/tutor/earnings/route.ts',
])

test('every API route selecting avatarUrl either shapes it or is on the reviewed list', () => {
  const offenders: string[] = []
  for (const abs of ROUTES) {
    const rel = relative(ROOT, abs)
    if (RAW_AVATAR_OK.has(rel)) continue
    // Comments stripped first — same reason the inbox test below does it: a
    // route that deliberately does NOT select the blob tends to say so in a
    // comment, and a naive match on the raw text flags the very note that
    // documents the fix. (app/api/tutor/enrollments/route.ts hit exactly this.)
    const src = readFileSync(abs, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    if (!/avatarUrl/.test(src)) continue
    if (/avatarSrc|stripTutorBlobs|stripAvatar/.test(src)) continue
    offenders.push(rel)
  }
  assert.deepEqual(
    offenders,
    [],
    `these routes select avatarUrl but never shape it — pass it through lib/avatarSrc, ` +
    `or add it to RAW_AVATAR_OK with a reason:\n  ${offenders.join('\n  ')}`,
  )
})

test('the message inbox does not pull avatar blobs for all 200 scanned rows', () => {
  // The inbox shows ONE avatar per partner; selecting avatarUrl on both `from`
  // and `to` of a 200-row scan read up to 400 blobs (~12 MB) to render a couple
  // of dozen faces. The partners' photos are fetched after the dedup instead.
  const src = readFileSync(join(ROOT, 'app/api/messages/route.ts'), 'utf8')
  const scan = src.slice(src.indexOf('const [preMsgs'), src.indexOf('preThreadInitiators(user.id)'))
  assert.ok(scan.length > 0, 'inbox scan query not found — update this test')
  // Comments stripped first: the block explains WHY avatarUrl is absent, so a
  // naive match on the raw text fails on the explanation itself.
  const code = scan.replace(/\/\/.*$/gm, '')
  assert.ok(!/avatarUrl/.test(code), 'the 200-row inbox scan is selecting avatarUrl again')
})

/* ═══════════ 2. limits ══════════════════════════════════════════════════ */

test('no route derives a Prisma `take` from a bare Number(searchParams…)', () => {
  const offenders: string[] = []
  for (const abs of ROUTES) {
    const src = readFileSync(abs, 'utf8')
    // The shape that produced NaN: Number(...) fed straight into a clamp.
    if (/Math\.min\(\s*Number\(\s*searchParams\.get/.test(src)) offenders.push(relative(ROOT, abs))
  }
  assert.deepEqual(offenders, [], `use parseLimit from lib/apiParams:\n  ${offenders.join('\n  ')}`)
})

test('parseLimit never returns NaN, zero, or a negative — for any input', () => {
  const spec = { fallback: 50, max: 200 }
  for (const raw of [null, undefined, '', ' ', 'abc', 'NaN', '-5', '0', '0.4', 'Infinity', '-Infinity', '1e999']) {
    const n = parseLimit(raw as string | null, spec)
    assert.ok(Number.isInteger(n), `parseLimit(${JSON.stringify(raw)}) = ${n} is not an integer`)
    assert.ok(n >= 1 && n <= spec.max, `parseLimit(${JSON.stringify(raw)}) = ${n} out of range`)
  }
})

test('parseLimit honours a valid limit and clamps an oversized one', () => {
  const spec = { fallback: 50, max: 200 }
  assert.equal(parseLimit('25', spec), 25)
  assert.equal(parseLimit('200', spec), 200)
  assert.equal(parseLimit('5000', spec), 200)
  assert.equal(parseLimit('3.7', spec), 3)   // floored, never fractional
  assert.equal(parseLimit(null, spec), 50)
})

test('parseIntParam clamps into range and falls back on garbage', () => {
  const spec = { fallback: 5, min: 1, max: 5 }
  assert.equal(parseIntParam('3', spec), 3)
  assert.equal(parseIntParam('99', spec), 5)
  assert.equal(parseIntParam('-2', spec), 1)
  assert.equal(parseIntParam('abc', spec), 5)
  assert.equal(parseIntParam(null, spec), 5)
})
