import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Serves ONE certificate scan.
//
// WHY A DEDICATED ROUTE: certificate files live base64 in Postgres (there is no
// object bucket). Returning them inside the profile payload is what once made a
// single page multi-megabyte, so every list response strips `fileUrl` and ships
// `hasFile` instead. The image is fetched here, per certificate, only when it is
// actually rendered — which also lets the browser cache each scan on its own URL.
//
// PUBLIC BY DESIGN: a diploma is displayed on a public expert profile; it is a
// trust signal, not a private document. (Contrast the ID photo / selfie, which
// are admin-only and deliberately have no such route.) The one access rule is
// that the owning expert must be publicly visible.
export const dynamic = 'force-dynamic'

/** `data:<mime>;base64,<payload>` → its parts, or null if it isn't one. */
function parseDataUrl(u: string): { mime: string; body: Buffer } | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(u)
  if (!m) return null
  try {
    return { mime: m[1], body: Buffer.from(m[2], 'base64') }
  } catch {
    return null
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const cert = await prisma.certificate
    .findUnique({
      where: { id },
      select: {
        fileUrl: true,
        // Mirror the site-wide public-visibility rule: a suspended or paused
        // expert's documents must not stay reachable by direct URL.
        tutor: { select: { available: true, user: { select: { suspendedAt: true } } } },
      },
    })
    .catch(() => null)

  if (!cert || !cert.fileUrl) return new NextResponse('Not found', { status: 404 })
  if (cert.tutor?.user?.suspendedAt || cert.tutor?.available === false) {
    return new NextResponse('Not found', { status: 404 })
  }

  /* An https:// scan (legacy / externally hosted) — point at it, but ONLY over
     https, and never over http.
     THE HOLE THIS CLOSES: `fileUrl` is `z.string().max(35_000_000)` with no
     scheme test (it cannot be `.url()` — a real diploma is a megabyte-long
     `data:` URI), and the applications path copies the value across verbatim at
     approval. So any string an expert stored was handed to `NextResponse
     .redirect`, turning mcodne.ge into a redirector to an arbitrary destination
     — a link that starts on our domain and lands anywhere. Bounded here rather
     than only at write time, because the rows that already exist were written
     without the rule. */
  if (/^https:\/\//i.test(cert.fileUrl)) {
    return NextResponse.redirect(cert.fileUrl, 302)
  }
  if (/^http:\/\//i.test(cert.fileUrl)) return new NextResponse('Not found', { status: 404 })

  const parsed = parseDataUrl(cert.fileUrl)
  if (!parsed) return new NextResponse('Not found', { status: 404 })

  // Only the types /api/uploads accepts for `kind=certificate`. Anything else
  // would let a stored string dictate a Content-Type — e.g. text/html, which a
  // browser would render as a page on our own origin.
  const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  const mime = ALLOWED.has(parsed.mime) ? parsed.mime : 'application/octet-stream'

  return new NextResponse(new Uint8Array(parsed.body), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(parsed.body.length),
      // The bytes never change once uploaded (a replacement is a new row), so
      // this can be cached hard. Immutable keeps it out of every repeat render.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Belt and braces alongside the MIME allow-list above.
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  })
}
