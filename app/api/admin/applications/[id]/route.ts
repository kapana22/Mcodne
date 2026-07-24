import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Verification-document blobs for ONE application, loaded on demand when the
// admin opens it in the review panel. Kept OUT of the list endpoint because
// idDoc / selfie / certificate scans are base64 `data:` images — returning them
// for every row bloated the applications panel by several MB.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireRole('ADMIN')
  const { id } = await ctx.params
  const app = await prisma.tutorApplication.findUnique({
    where: { id },
    select: { id: true, idDocUrl: true, selfieUrl: true, certificates: true },
  })
  if (!app) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json(app)
}
