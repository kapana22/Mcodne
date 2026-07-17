import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

const Body = z.object({ tutorId: z.string() })

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const favs = await prisma.favorite.findMany({
    where: { userId: user.id },
    // Never send passwordHash back; narrow both User and Category.
    include: {
      tutor: {
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, slug: true, name: true, icon: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(favs)
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const parsed = Body.safeParse(await req.json())
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
