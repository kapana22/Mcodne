import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serves a user's avatar as BYTES, cacheably.
 *
 * WHY THIS EXISTS — measured 2026-08-01 against production:
 *   /favicon.ico   261ms    22KB
 *   /              254ms    59KB
 *   /categories    259ms    75KB
 *   /tutors        460ms   556KB      ← ten base64 avatars, inline
 * A ~259ms floor applies to every request (network + edge→origin), and server
 * render time above it is effectively zero. So caching the RENDER — ISR,
 * revalidate, unstable_cache — buys nothing here; the only lever left is the
 * number of bytes on the wire, and half a megabyte of it is avatars pasted
 * into the HTML as `data:` URIs.
 *
 * Inline base64 is the worst possible shape for an avatar: it can never be
 * cached on its own, it is re-sent in full on every navigation and inside every
 * API payload the user appears in, and the same face is repeated once per card.
 * Behind this route each avatar is fetched once and then served from the
 * browser cache on every subsequent page — including pages that have not been
 * written yet.
 *
 * The bytes are still stored as a data URI in `User.avatarUrl` (there is no
 * object storage yet); this route only changes how they reach the browser.
 *
 * CACHING: `?v=` carries a short fingerprint of the stored value, so the URL
 * changes the moment a user replaces their photo — which is what makes
 * `immutable` safe. A request without `?v=` still works, but is only cached
 * briefly, since nothing would tell the browser it had gone stale.
 *
 * PRIVACY: an avatar is already public on every profile and card, so there is
 * no authorization check here — but note that only `avatarUrl` is selected, so
 * the route can never leak another column.
 */

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

// Cards render avatars into ≤128px boxes; 512px originals meant ~80% of the
// bytes were discarded pixels (measured: 194KB of avatars on /tutors, 6 of 7
// at 512²). 384 covers the worst real case (112px card × 3 DPR = 336). The
// resize runs once per (user, version) and is then served from this LRU —
// sharp never runs twice for the same bytes.
const SERVE_MAX = 384
const memo = new Map<string, { body: Buffer; mime: string }>()
const MEMO_MAX = 200
function remember(key: string, v: { body: Buffer; mime: string }) {
  if (memo.size >= MEMO_MAX) { const k = memo.keys().next().value; if (k) memo.delete(k) }
  memo.set(key, v)
}

function parseDataUrl(v: string): { mime: string; body: Buffer } | null {
  const m = /^data:([a-z0-9.+/-]+);base64,(.*)$/i.exec(v)
  if (!m) return null
  try {
    return { mime: m[1].toLowerCase(), body: Buffer.from(m[2], 'base64') }
  } catch {
    return null
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id || id.length > 64) return new NextResponse('Not found', { status: 404 })

  let stored: string | null = null
  try {
    await ensureDbReady()
    const u = await prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } })
    stored = u?.avatarUrl ?? null
  } catch {
    // A DB blip must not render a broken-image glyph on every card; 503 lets
    // the browser retry rather than caching a failure.
    return new NextResponse('Unavailable', { status: 503 })
  }

  if (!stored) return new NextResponse('Not found', { status: 404 })

  // A profile whose avatar is an ordinary URL (Google sign-in) never needed
  // this route; send the caller straight there.
  if (/^https?:\/\//i.test(stored)) {
    // Only hosts we know issue avatars. avatarUrl is user-writable, so an
    // unchecked redirect would let anyone mint a first-party mcodne.ge URL
    // that 302s to an arbitrary site — with an immutable cache on top.
    let host = ''
    try { host = new URL(stored).hostname } catch { /* fall through to 404 */ }
    const ALLOWED_HOSTS = /(^|\.)googleusercontent\.com$/i
    if (!ALLOWED_HOSTS.test(host)) return new NextResponse('Not found', { status: 404 })
    // Proxy rather than 302: the redirect made lh3.googleusercontent.com the
    // site's only third-party request (measured ~870ms vs ~250ms same-origin)
    // and gave the browser nothing to cache under our URL.
    const key = `g:${id}:${stored.slice(-24)}`
    const hit = memo.get(key)
    if (hit) return avatarResponse(hit.body, hit.mime, true)
    try {
      const up = await fetch(stored, { signal: AbortSignal.timeout(4000) })
      if (!up.ok) return NextResponse.redirect(stored, 302) // degrade to the old behavior
      const raw = Buffer.from(await up.arrayBuffer())
      const mime = up.headers.get('content-type')?.split(';')[0].toLowerCase() || 'image/jpeg'
      if (!ALLOWED.has(mime) || raw.length > 8 * 1024 * 1024) return NextResponse.redirect(stored, 302)
      const v = { body: raw, mime }
      remember(key, v)
      return avatarResponse(raw, mime, true)
    } catch { return NextResponse.redirect(stored, 302) }
  }

  const parsed = parseDataUrl(stored)
  if (!parsed) return new NextResponse('Not found', { status: 404 })

  // Never let a stored string choose the Content-Type — text/html here would
  // render as a page on our own origin.
  const mime = ALLOWED.has(parsed.mime) ? parsed.mime : 'application/octet-stream'
  const versioned = new URL(req.url).searchParams.has('v')

  const key = `d:${id}:${parsed.body.length}`
  const hit = memo.get(key)
  if (hit) return avatarResponse(hit.body, hit.mime, versioned)
  let body = parsed.body
  let outMime = mime
  // GIFs pass through (animation); everything else is capped at SERVE_MAX.
  if (mime !== 'image/gif') {
    try {
      const meta = await sharp(parsed.body).metadata()
      if ((meta.width ?? 0) > SERVE_MAX || (meta.height ?? 0) > SERVE_MAX) {
        body = await sharp(parsed.body)
          .resize(SERVE_MAX, SERVE_MAX, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78, effort: 4 })
          .toBuffer()
        outMime = 'image/webp'
      }
    } catch { /* undecodable → serve stored bytes */ }
  }
  remember(key, { body, mime: outMime })
  return avatarResponse(body, outMime, versioned)
}

function avatarResponse(body: Buffer, mime: string, longCache: boolean) {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(body.length),
      'Cache-Control': longCache
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  })
}
