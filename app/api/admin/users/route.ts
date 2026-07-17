import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET(req: Request) {
  await requireRole('ADMIN')

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const rawRole = searchParams.get('role')
  const role = rawRole === 'STUDENT' || rawRole === 'TUTOR' || rawRole === 'ADMIN' ? rawRole : null
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)

  const where: any = {}
  if (role) where.role = role
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
    ]
  }

  const users = await prisma.user.findMany({
    where,
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, email: true, fullName: true, role: true, emailVerified: true,
      createdAt: true, avatarUrl: true,
      _count: { select: { bookingsAsStudent: true, sentMessages: true } },
    },
  })

  return NextResponse.json(users)
}
