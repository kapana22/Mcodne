// ONE PHOTO FROM ONE REQUEST — so a feed of forty jobs is not forty megabytes.
//
// ⚠️ THIS ROUTE EXISTS FOR THE SAME ARITHMETIC REASON /api/providers/[id]/photo
// does, and the constraint it answers is written into prisma/schema and into
// `ProviderRequestRow`: `ServiceRequest.photos` is a `String[]` of base64 data
// URIs, and A LIST MAY NEVER SELECT IT. The queue draws up to 100 cards; at
// ~40–200KB an image that is megabytes of data URI inside the HTML of a page
// whose readers are on phones.
//
// The owner's design canvas (2026-09-01, „Expert Jobs") puts the client's photo
// on the FEED card, which is the first time a list has needed one at all. The
// list keeps selecting no blobs: it counts them in SQL and points each <img>
// here, and the browser then fetches only what is on screen.
//
// ⚠️ IT IS GATED LIKE THE QUEUE, NOT LIKE A PUBLIC IMAGE. The provider photo
// route serves anybody, because a listed profile's face is public by
// definition. A photo of the inside of somebody's flat is not: it is readable
// by exactly the people who may read the request it belongs to — the
// allowlisted providers — so this asks `requestsViewer` and answers 404 to
// everybody else. That refusal is why this could not simply reuse the other
// route with a different table.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestsViewer } from '@/lib/requestsServer'
import { MAX_REQUEST_PHOTOS } from '@/lib/requests'

export const dynamic = 'force-dynamic'

const notFound = () => new NextResponse(null, { status: 404 })

/** `?n=` → 0…MAX−1. Anything else is a 404 rather than a fallback to the first
 *  photo: a broken index must not silently serve a different picture. */
function photoIndex(req: Request): number | 'bad' {
  const raw = new URL(req.url).searchParams.get('n') ?? '0'
  if (!/^\d{1,2}$/.test(raw)) return 'bad'
  const n = Number(raw)
  return n < MAX_REQUEST_PHOTOS ? n : 'bad'
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // The gate first, before any read: an image route that touches the database
  // for a stranger is a way to ask whether a request id exists.
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return notFound()

  const { id } = await params
  const n = photoIndex(req)
  if (n === 'bad') return notFound()
  await ensureDbReady()

  // ⚠️ ONLY WHILE THE REQUEST IS ANSWERABLE, and this is the same rule the
  // queue applies to the row itself. A settled request's photos are its
  // client's business; the winner has the thread, and a card that has scrolled
  // out of a stale tab must not keep serving them.
  const live = await prisma.serviceRequest.count({ where: { id, status: 'VERIFIED' } })
  if (live === 0) return notFound()

  // ONE image is read, in SQL, by index (`"photos"[k]`, 1-indexed) — six photos
  // are never pulled to serve one. This route is the one place a base64 column
  // on this table may be read at all.
  const picked = await prisma.$queryRawUnsafe<{ p: string | null }[]>(
    `SELECT "photos"[$2] AS p FROM "ServiceRequest" WHERE "id" = $1`,
    id, n + 1,
  )
  const dataUri = picked[0]?.p ?? null
  if (!dataUri) return notFound()

  // data:image/webp;base64,XXXX → the two halves the response needs.
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUri)
  if (!m) return notFound()
  const [, mime, b64] = m
  if (!mime.startsWith('image/')) return notFound()
  // ⚠️ SVG IS REFUSED, AND IT IS NOT A FORMAT PREFERENCE. An SVG is a document:
  // it can carry <script>, and this route serves it from mcodne.ge's own
  // origin, so an uploaded one would run with our cookies for anybody who opens
  // the URL. „image/∗" is a MIME prefix, not a safety check — SVG satisfies it.
  // /api/uploads already refuses SVG on the way in; this is asserted again
  // because a COLUMN can also be written by a seed, a migration or an admin.
  if (/svg/i.test(mime)) return notFound()

  let bytes: Buffer
  try { bytes = Buffer.from(b64, 'base64') } catch { return notFound() }
  if (bytes.length === 0) return notFound()

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'content-type': mime,
      // Belt to the braces above: the browser must not sniff this into
      // something executable, and nothing here may run as a document.
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-disposition': 'inline',
      'content-length': String(bytes.length),
      // ⚠️ `private`, NEVER `public` — unlike the provider photo route. „public"
      // instructs every cache between here and the browser, and these images
      // are readable only by allowlisted providers: one in a shared cache,
      // keyed on a URL anybody can construct, would undo the gate above. A
      // short private cache still saves the re-fetch on scroll.
      'cache-control': 'private, max-age=300',
    },
  })
}
