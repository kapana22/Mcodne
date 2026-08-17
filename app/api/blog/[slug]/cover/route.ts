import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'

// Serves ONE blog cover as bytes.
//
// WHY A ROUTE AND NOT THE COLUMN INLINE. Covers live base64 in Postgres (there
// is no bucket). Selecting `coverUrl` into the page put every cover's full
// image into the HTML: measured 2026-08-14, the moment nine posts got covers
// the /blog document went to 622 KB — re-sent on every navigation and cacheable
// by nothing. That is the exact measurement behind /api/avatars/[id] (a 556 KB
// /tutors page of inline avatars) and /api/b2b-services/[id]/image. Behind this
// route each cover is fetched once per (post, version) and then served from the
// browser cache.
//
// PUBLIC, like the post it belongs to — and only for a PUBLISHED one, so an
// unpublished draft's artwork is not reachable by guessing its slug. The query
// selects `coverUrl` alone, so the route cannot leak another column.
export const dynamic = 'force-dynamic'

function parseDataUrl(u: string): { mime: string; body: Buffer } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(u)
  if (!m) return null
  try {
    return { mime: m[1].toLowerCase(), body: Buffer.from(m[2], 'base64') }
  } catch {
    return null
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!slug || slug.length > 200) return new NextResponse('Not found', { status: 404 })

  let row: { coverUrl: string | null } | null = null
  try {
    await ensureDbReady()
    row = await prisma.post.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { coverUrl: true },
    })
  } catch {
    // A DB blip must not bake a broken-image glyph into an immutable cache.
    return new NextResponse('Unavailable', { status: 503 })
  }

  if (!row?.coverUrl) return new NextResponse('Not found', { status: 404 })

  // An externally hosted cover (a URL typed into the admin) never needed this
  // route; only https, so a stored string cannot make our origin redirect
  // anywhere it likes.
  if (/^https:\/\//i.test(row.coverUrl)) return NextResponse.redirect(row.coverUrl, 302)

  const parsed = parseDataUrl(row.coverUrl)
  // Only what /api/uploads emits. Without the allow-list a stored string would
  // dictate a Content-Type — e.g. text/html, which the browser would render as
  // a page on our own origin.
  const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  if (!parsed || !ALLOWED.has(parsed.mime)) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(new Uint8Array(parsed.body), {
    headers: {
      'Content-Type': parsed.mime,
      'Content-Length': String(parsed.body.length),
      // `?v=` carries a fingerprint of the stored value (the pages append it),
      // so replacing a cover changes the URL — which is what makes `immutable`
      // safe rather than a way to serve a stale picture forever.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
