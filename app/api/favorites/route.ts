import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'

const Body = z.object({ tutorId: z.string() })

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const favs = await prisma.favorite.findMany({
    where: { userId: user.id },
    // Never send passwordHash back; narrow both User and Category.
    include: {
      tutor: {
        // Drop the heavy blobs at the DB level (favorites cards never render the
        // intro video or professionData); stripTutorBlobs still guards avatars.
        omit: { professionData: true, videoUrl: true },
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, slug: true, name: true, icon: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(
    favs.map(f => ({ ...f, tutor: stripTutorBlobs(f.tutor) })),
  )
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  // Saved-experts is a CLIENT feature — a TUTOR/ADMIN has no surface for it.
  if (user.role !== 'STUDENT') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const tutor = await prisma.tutorProfile.findUnique({ where: { id: parsed.data.tutorId } })
  if (!tutor) return NextResponse.json({ ok: false, error: 'TUTOR_NOT_FOUND' }, { status: 404 })

  const fav = await prisma.favorite.upsert({
    where: { userId_tutorId: { userId: user.id, tutorId: parsed.data.tutorId } },
    create: { userId: user.id, tutorId: parsed.data.tutorId },
    update: {},
  })
  return NextResponse.json({ ok: true, id: fav.id })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  if (user.role !== 'STUDENT') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

  // Accept tutorId from either JSON body OR query string (?tutorId=…),
  // since some HTTP clients strip DELETE request bodies.
  let tutorId: string | undefined
  try {
    const body = await req.json()
    tutorId = body?.tutorId
  } catch {}
  if (!tutorId) {
    const url = new URL(req.url)
    tutorId = url.searchParams.get('tutorId') ?? undefined
  }
  const parsed = Body.safeParse({ tutorId })
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await prisma.favorite.deleteMany({
    where: { userId: user.id, tutorId: parsed.data.tutorId },
  })
  return NextResponse.json({ ok: true })
}
