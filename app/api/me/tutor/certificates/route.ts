import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

const Body = z.object({
  title: z.string().min(2).max(200),
  // Optional now. /apply captures a title but not always an issuer, and an
  // unknown issuer must be ABSENT, not the literal string „მითითებული არ არის"
  // that used to be written into the column and then rendered as if it were data.
  issuer: z.string().max(200).optional().nullable(),
  year: z.number().int().min(1900).max(2100),
  /**
   * The scan itself — an `https://…` link OR a `data:` URI produced by
   * /api/uploads (files live base64 in Postgres; there is no bucket).
   *
   * ⚠️ THE BUG THIS FIXES: this was `z.string().url().max(500)`. A real diploma
   * encodes to hundreds of kilobytes, so EVERY upload failed validation and
   * `fileUrl` was NULL on all five certificate rows in production. Experts
   * uploaded diplomas that were never stored, and the profile showed a text
   * chip they could not open.
   *
   * SIZING: /api/uploads caps a certificate at 25 MiB = 26,214,400 bytes.
   * Base64 expands that to ceil(n/3)*4 = 34,952,536 characters, plus the
   * `data:application/pdf;base64,` prefix. A 34,000,000 limit — which this
   * first shipped with — would therefore still have rejected the largest
   * legitimate upload, i.e. the same class of bug one size smaller. 35,000,000
   * clears it with room to spare and matches app/api/applications/route.ts.
   *
   * Payload cost is handled by never shipping this field in list responses
   * (see GET below) — it is served only by /api/certificates/[id]/file.
   */
  fileUrl: z.string().max(35_000_000).optional().nullable(),
})

async function tutorProfileForUser(userId: string) {
  return prisma.tutorProfile.findUnique({ where: { userId } })
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const profile = await tutorProfileForUser(user.id)
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })
  const rows = await prisma.certificate.findMany({
    where: { tutorId: profile.id },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  })
  // NEVER ship the scan itself in a list — a few base64 diplomas would make
  // this response tens of megabytes. `hasFile` is all the UI needs to decide
  // whether to render a preview, which it loads from /api/certificates/[id]/file.
  const items = rows.map(({ fileUrl, ...rest }) => ({ ...rest, hasFile: !!fileUrl }))
  return NextResponse.json({ ok: true, items })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  if (user.role !== 'TUTOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const profile = await tutorProfileForUser(user.id)
  if (!profile) return NextResponse.json({ ok: false, error: 'NO_PROFILE' }, { status: 404 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const item = await prisma.certificate.create({
    data: {
      tutorId: profile.id,
      title: parsed.data.title.trim(),
      issuer: parsed.data.issuer?.trim() || '',
      year: parsed.data.year,
      fileUrl: parsed.data.fileUrl?.trim() || null,
    },
  })
  // Same rule as GET: the created row echoes back WITHOUT the blob.
  const { fileUrl: _blob, ...safe } = item
  return NextResponse.json({ ok: true, item: { ...safe, hasFile: !!item.fileUrl } })
}
