// SAVED PROVIDERS — the client's own shortlist.
//
// ⚠️ THE KEY IS `providerId` SINCE 2026-08-24 (it was `tutorId`). Same column,
// renamed and repointed at the one provider profile; the stored rows survived
// the move because the new profile carries the OLD id. The browser sends the
// new name — a saved-state probe is a same-session call, and there is no
// long-lived client holding the old one.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ROLE } from '@/lib/roles'
import { avatarSrc } from '@/lib/avatarSrc'

const Body = z.object({ providerId: z.string() })

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  // ⚠️ ONE PROVIDER, ONE BOOLEAN (2026-08-26). A profile page only needs to
  // know whether THIS provider is on the shortlist, and the full list below
  // carries a joined ServiceProfile per row — the whole card, for every saved
  // provider, to answer a yes/no question. `?providerId=` is that question.
  const probe = new URL(req.url).searchParams.get('providerId')
  if (probe) {
    const n = await prisma.favorite.count({ where: { userId: user.id, providerId: probe } })
    return NextResponse.json({ ok: true, saved: n > 0 })
  }

  const favs = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: {
      provider: {
        // ⚠️ NEVER THE BLOBS. `photoUrl` and `workPhotos` are base64 columns;
        // a page of saved cards would carry megabytes of them. The card points
        // at /api/providers/[id]/photo instead.
        omit: { photoUrl: true, workPhotos: true },
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, slug: true, name: true, icon: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  // ⚠️ THE AVATAR IS A ROUTE, NEVER THE COLUMN. `User.avatarUrl` holds a base64
  // `data:` webp (~32KB encoded — the files live in Postgres, there is no
  // bucket), so a shortlist of twenty saved providers would carry 640KB that no
  // cache can ever reuse. lib/avatarSrc turns it into /api/avatars/<id>, which
  // the browser fetches once and reuses everywhere. Pinned by
  // tests/apiPayloadHygiene.test.ts.
  return NextResponse.json(
    favs.map(f => ({
      ...f,
      provider: {
        ...f.provider,
        user: f.provider.user && {
          ...f.provider.user,
          avatarUrl: avatarSrc(f.provider.user.id, f.provider.user.avatarUrl),
        },
      },
    })),
  )
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  // Saving is a CLIENT feature — a provider/admin has no surface for it.
  if (user.role !== ROLE.USER) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const provider = await prisma.serviceProfile.findUnique({
    where: { id: parsed.data.providerId },
    select: { id: true },
  })
  if (!provider) return NextResponse.json({ ok: false, error: 'PROVIDER_NOT_FOUND' }, { status: 404 })

  const fav = await prisma.favorite.upsert({
    where: { userId_providerId: { userId: user.id, providerId: parsed.data.providerId } },
    create: { userId: user.id, providerId: parsed.data.providerId },
    update: {},
  })
  return NextResponse.json({ ok: true, id: fav.id })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  if (user.role !== ROLE.USER) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

  // Accept the id from either the JSON body OR the query string
  // (?providerId=…), since some HTTP clients strip DELETE request bodies.
  let providerId: string | undefined
  try {
    const body = await req.json()
    providerId = body?.providerId
  } catch {}
  if (!providerId) {
    const url = new URL(req.url)
    providerId = url.searchParams.get('providerId') ?? undefined
  }
  const parsed = Body.safeParse({ providerId })
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await prisma.favorite.deleteMany({
    where: { userId: user.id, providerId: parsed.data.providerId },
  })
  return NextResponse.json({ ok: true })
}
