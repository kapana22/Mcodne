import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET() {
  await requireRole('ADMIN')
  // The list must NOT carry the verification-document blobs (idDoc / selfie /
  // certificate scans are base64 `data:` images) — they're only shown on the
  // selected application's detail panel, so the admin page lazy-loads them per
  // id from `[id]/route.ts`. Returning them for EVERY row made the whole panel
  // download several MB per resized doc × N applications.
  const apps = await prisma.tutorApplication.findMany({
    orderBy: { createdAt: 'desc' },
    // Also omit professionData (unbounded apply-flow JSON) — the detail panel
    // lazy-loads the full record per id. Cap the list so it can't grow unbounded
    // as applications accumulate.
    take: 300,
    omit: { idDocUrl: true, selfieUrl: true, certificates: true, professionData: true },
    include: { user: { select: { email: true, avatarUrl: true } } },
  })
  return NextResponse.json(apps)
}
