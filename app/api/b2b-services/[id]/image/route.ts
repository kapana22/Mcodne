import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'

// Serves ONE B2B service card image as bytes.
//
// WHY A ROUTE AND NOT THE COLUMN INLINE. Images live base64 in Postgres (there
// is no bucket). Selecting `imageUrl` into the page payload would put every
// card's full image into the HTML — half a megabyte at six services, re-sent on
// every navigation, cacheable by nothing. That is precisely the measurement
// that produced /api/avatars/[id]: a 556 KB /tutors page of inline avatars.
// Behind this route each image is fetched once per (service, version) and then
// comes from the browser cache.
//
// PUBLIC LIKE THE PAGE IT SERVES: the image is decoration on a price list, and
// the route only ever selects `imageUrl` — it cannot leak another column. A
// HIDDEN service stops serving, so „stop selling this" removes its picture too.
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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id || id.length > 64) return new NextResponse('Not found', { status: 404 })

  let row: { imageUrl: string | null; visible: boolean } | null = null
  try {
    await ensureDbReady()
    row = await prisma.b2BService.findUnique({
      where: { id },
      select: { imageUrl: true, visible: true },
    })
  } catch {
    // A DB blip must not bake a broken-image glyph into the cache; 503 lets the
    // browser retry instead of remembering a failure.
    return new NextResponse('Unavailable', { status: 503 })
  }

  if (!row?.imageUrl || !row.visible) return new NextResponse('Not found', { status: 404 })

  const parsed = parseDataUrl(row.imageUrl)
  // Only what /api/uploads emits. An unchecked stored string would otherwise
  // dictate a Content-Type — e.g. text/html, which a browser would render as a
  // page on our own origin.
  const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  if (!parsed || !ALLOWED.has(parsed.mime)) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(new Uint8Array(parsed.body), {
    headers: {
      'Content-Type': parsed.mime,
      'Content-Length': String(parsed.body.length),
      // `?v=` carries a fingerprint of the stored value (the page appends it),
      // so replacing an image changes the URL — which is what makes `immutable`
      // safe here rather than a way to serve a stale picture forever.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
