// ONE MASTER'S PHOTO — served on its own, so a list of sixty is not a list of
// sixty images.
//
// ⚠️ THIS ROUTE EXISTS FOR ONE ARITHMETIC REASON. There is no object storage
// here (see /api/uploads): an uploaded image is a base64 column, ~40–200KB
// each. /services draws up to 60 masters, so selecting `photoUrl` into that
// query would put up to twelve megabytes of data URI inside the HTML of a page
// whose job is to load fast on a phone. The listing selects a boolean instead
// and the card points at this URL — the browser then fetches only what is on
// screen, in parallel, and caches it. Copied from
// /api/b2b-services/[id]/image, which solved this first.
//
// ⚠️ IT ANSWERS FOR PUBLICLY VISIBLE MASTERS ONLY. The same pair /services
// filters on — the master's own `available` switch AND an active RequestAccess
// row. A photo is a face; a profile that is not listed must not have its face
// readable by anybody who guesses an id.
//
// `?n=<index>` (stage 5, 2026-08-19) serves `workPhotos[n]` — the photos of
// finished work the profile page (app/experts/[slug], step 4) draws one at a time —
// through the SAME refusal and the same headers. Without `n` it is the face, as
// before. Neither column is ever selected by a list; the page COUNTS the work
// photos and points each <img> here.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const notFound = () => new NextResponse(null, { status: 404 })

/** The application caps work photos at six (lib/masterApplication) — anything
 *  past that is a URL somebody typed, not a photo somebody uploaded. */
const MAX_WORK_INDEX = 5

/** `?n=` → 0…5, or null when absent; anything else is a 404, not a fallback to
 *  the face — a broken gallery link must not silently show the portrait. */
function workIndex(req: Request): number | null | 'bad' {
  const raw = new URL(req.url).searchParams.get('n')
  if (raw === null || raw === '') return null
  if (!/^\d{1,2}$/.test(raw)) return 'bad'
  const n = Number(raw)
  return n <= MAX_WORK_INDEX ? n : 'bad'
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const n = workIndex(req)
  if (n === 'bad') return notFound()
  await ensureDbReady()

  const visible = {
    id,
    available: true,
    published: true,
    // ⚠️ SUSPENDED IS NOT PUBLIC — the same clause app/experts/_providers → PUBLIC
    // carries, and it has to be the same rule or a suspended provider's face is
    // still served at a guessable URL after their card and page have gone. It
    // sits inside the OR because a company profile has no user row to check.
    OR: [
      { user: { is: { suspendedAt: null, requestAccess: { active: true } } } },
      { company: { requestAccess: { active: true } } },
    ],
  }

  /* ⚠️ THE OWNER SEES THEIR OWN, LISTED OR NOT (2026-08-21).
   *
   * The refusal above is about STRANGERS: a profile that is not in the
   * catalogue must not have its face readable by anybody who guesses an id.
   * Applied to the person the photos belong to it was a different thing — their
   * own editor could not draw them. A master who unticks „ახალი მოთხოვნები
   * მომდის", or whose page an admin has taken down, opens /work/services and
   * finds their photo and every picture of finished work replaced by a broken
   * thumbnail, on the screen whose whole job is to let them replace those.
   *
   * ⚠️ AND IT IS A FALLBACK, NEVER THE FIRST QUESTION. The public path is a
   * catalogue drawing up to sixty of these and must not read a session per
   * image; this only runs once the visible query has already answered „no".
   */
  async function ownsIt(): Promise<boolean> {
    const me = await getCurrentUser()
    if (!me) return false
    return (await prisma.serviceProfile.count({
      where: {
        id,
        OR: [{ userId: me.id }, { company: { members: { some: { userId: me.id } } } }],
      },
    })) > 0
  }
  const isPublic = (await prisma.serviceProfile.count({ where: visible })) > 0
  if (!isPublic && !(await ownsIt())) return notFound()
  // ONE image is read either way — this route is the one place a base64 column
  // may be read, and it reads one image for one response. The face is a single
  // nullable column; a work photo is ONE element of the array, picked in SQL
  // (`"workPhotos"[k]`, 1-indexed) so six photos are never pulled to serve one.
  let dataUri: string | null = null
  if (n === null) {
    const row = await prisma.serviceProfile.findFirst({
      where: { id, NOT: { photoUrl: null } },
      select: { photoUrl: true },
    })
    dataUri = row?.photoUrl ?? null
  } else {
    const picked = await prisma.$queryRawUnsafe<{ p: string | null }[]>(
      `SELECT "workPhotos"[$2] AS p FROM "ServiceProfile" WHERE "id" = $1`,
      id, n + 1,
    )
    dataUri = picked[0]?.p ?? null
  }
  if (!dataUri) return notFound()

  // data:image/webp;base64,XXXX → the two halves the response needs.
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUri)
  if (!m) return notFound()
  const [, mime, b64] = m
  if (!mime.startsWith('image/')) return notFound()
  // ⚠️ SVG IS REFUSED, AND IT IS NOT A FORMAT PREFERENCE (2026-08-18).
  //
  // An SVG is a document: it can carry <script>, and this route serves it from
  // mcodne.ge's own origin. A provider who uploads one has stored executable
  // code that runs with our origin's cookies the moment anybody opens the URL.
  // „image/∗" is not a safety check — it is a MIME prefix, and SVG satisfies it.
  //
  // /api/uploads already refuses SVG on the way in (it sniffs magic bytes and
  // re-encodes through sharp), so nothing legitimate reaches this branch. It is
  // asserted here as well because this route reads a COLUMN, and a column can
  // be written by a seed script, a migration, or an admin — I put SVG data URIs
  // into it myself today with a demo seeder, which is exactly how a defence
  // that lives only at the front door gets bypassed.
  if (/svg/i.test(mime)) return notFound()

  let bytes: Buffer
  try { bytes = Buffer.from(b64, 'base64') } catch { return notFound() }
  if (bytes.length === 0) return notFound()

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'content-type': mime,
      // Belt to the braces above: even if a format slips through, the browser
      // must not be allowed to sniff it into something executable, and nothing
      // here may run as a document.
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'content-disposition': 'inline',
      'content-length': String(bytes.length),
      // ⚠️ PRIVATE-ISH BUT LONG. The image never changes without the row
      // changing, and the card busts the cache with `?v=<updatedAt>` — so a
      // year is safe and a re-upload is visible immediately. Without the query
      // param this would have to be `no-cache`, which defeats the whole route.
      //
      // ⚠️ EXCEPT WHEN OWNERSHIP IS WHAT UNLOCKED IT (2026-08-21). „public" is
      // an instruction to every cache between here and the browser, and a photo
      // the catalogue refuses to show must not be sitting in a shared one keyed
      // on a URL anybody can construct. Listed → cached for a year; the owner's
      // own preview of an unlisted profile → nobody but them.
      'cache-control': isPublic
        ? 'public, max-age=31536000, immutable'
        : 'private, no-store',
    },
  })
}
